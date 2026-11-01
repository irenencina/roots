"""Build a hand-drawable base map for any region in the world.

Reads data/regions.json, downloads Natural Earth (public domain, 1:10m) once into
.cache/, and writes one GeoJSON per region to data/basemaps/<id>.geojson.

A region is any set of Natural Earth admin-1 areas (provinces, states, regions),
picked with a property filter, e.g. {"adm0_a3": "NLD", "type_en": "Province"}.
To add a region: add an entry to data/regions.json and run

    pip install shapely
    python3 tools/build_basemap.py            # all regions
    python3 tools/build_basemap.py netherlands  # one region

Feature roles written (the website draws each role in its own pen style):
  land, inner-border, neighbour-border, water, river, city, label
"""
import json, os, sys, urllib.request
from shapely.geometry import shape, mapping, box, MultiPolygon, Polygon
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, ".cache")
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_{}.geojson"
LAYERS = ["admin_1_states_provinces", "admin_0_countries", "ocean", "lakes", "rivers_lake_centerlines", "populated_places_simple"]
_loaded = {}


def layer(name):
    if name not in _loaded:
        os.makedirs(CACHE, exist_ok=True)
        path = os.path.join(CACHE, name + ".geojson")
        if not os.path.exists(path):
            print("downloading", name)
            urllib.request.urlretrieve(NE.format(name), path)
        feats = json.load(open(path, encoding="utf-8"))["features"]
        for f in feats:
            f["_g"] = shape(f["geometry"]) if f["geometry"] else None
        _loaded[name] = feats
    return _loaded[name]


def matches(props, match):
    for k, v in match.items():
        vals = v if isinstance(v, list) else [v]
        if props.get(k) not in vals:
            return False
    return True


def rnd(c, n=4):
    if isinstance(c, (list, tuple)) and c and isinstance(c[0], (int, float)):
        return [round(c[0], n), round(c[1], n)]
    return [rnd(x, n) for x in c]


def polys(g, min_area=0.0):
    if g.is_empty:
        return []
    if g.geom_type == "Polygon":
        parts = [g]
    elif g.geom_type in ("MultiPolygon", "GeometryCollection"):
        parts = [p for p in g.geoms if p.geom_type == "Polygon"]
    else:
        return []
    return [orient(p, -1.0) for p in parts if p.area > min_area]  # d3 wants clockwise rings


def lines(g):
    if g.is_empty:
        return None
    if g.geom_type in ("LineString", "MultiLineString"):
        return g
    if g.geom_type == "GeometryCollection":
        ls = [x for x in g.geoms if x.geom_type in ("LineString", "MultiLineString")]
        return unary_union(ls) if ls else None
    return None


def build(region):
    src = region["source"]
    adm1 = [f for f in layer("admin_1_states_provinces") if f["_g"] is not None]
    focus = [f for f in adm1 if matches(f["properties"], src["match"])]
    if not focus:
        raise SystemExit("no admin-1 areas match " + json.dumps(src["match"]))
    land = unary_union([f["_g"] for f in focus]).buffer(0)
    # drop far-away overseas parts: keep parts near the biggest one
    parts = polys(land)
    main = max(parts, key=lambda p: p.area)
    reach = max(main.bounds[2] - main.bounds[0], main.bounds[3] - main.bounds[1]) * 1.2
    parts = [p for p in parts if p.centroid.distance(main.centroid) < reach]
    land = unary_union(parts)
    minx, miny, maxx, maxy = land.bounds
    # draw the surroundings generously so the page never ends in a hard edge
    span0 = max(maxx - minx, maxy - miny)
    padx, pady = span0 * 0.9, span0 * 0.5
    view = box(minx - padx, miny - pady, maxx + padx, maxy + pady)
    span = max(maxx - minx, maxy - miny)
    tol = span / 900  # simplification keeps the drawing loose, like pen on paper
    min_area = (span / 150) ** 2

    feats = []

    def add(role, g, **props):
        if g is None or g.is_empty:
            return
        feats.append({"type": "Feature", "properties": dict(role=role, **props), "geometry": {"type": mapping(g)["type"], "coordinates": rnd(mapping(g)["coordinates"])}})

    # water: sea and big lakes inside the view
    sea = unary_union([f["_g"].intersection(view) for f in layer("ocean") if f["_g"].intersects(view)])
    lakes = [f["_g"].intersection(view) for f in layer("lakes") if f["_g"].intersects(view) and f["properties"].get("scalerank", 9) <= 6]
    water = unary_union([sea] + lakes).simplify(tol)
    wp = polys(water, min_area)
    if wp:
        add("water", MultiPolygon(wp))

    # lakes are part of the province shapes in some countries (IJsselmeer): cut them out of the land
    lake_cut = unary_union([g for g in lakes if not g.is_empty]) if lakes else None
    if lake_cut is not None and not lake_cut.is_empty:
        land = land.difference(lake_cut)

    # neighbouring borders: other regions of the same country, and other countries
    focus_a3 = focus[0]["properties"].get("adm0_a3")
    def group_key(p):
        return (p.get("region") or p.get("name")) if p.get("adm0_a3") == focus_a3 else p.get("admin")
    groups = {}
    for f in adm1:
        if f in focus or not f["_g"].intersects(view):
            continue
        groups.setdefault(group_key(f["properties"]), []).append(f["_g"])
    others = [unary_union(gs).buffer(0) for gs in groups.values()]
    nb = unary_union([g.boundary for g in others]).intersection(view).difference(land.buffer(span / 400))
    nb = lines(nb.difference(water.buffer(span / 600)) if not water.is_empty else nb)
    if nb is not None:
        add("neighbour-border", nb.simplify(tol))

    lp = polys(land.simplify(tol), min_area / 4)
    add("land", MultiPolygon(lp), name=region["name"])

    inner = unary_union([f["_g"].boundary for f in focus]).difference(land.boundary.buffer(span / 500))
    inner = lines(inner.intersection(land))
    if inner is not None:
        add("inner-border", inner.simplify(tol))

    # rivers inside the focus area
    rv = [f["_g"] for f in layer("rivers_lake_centerlines") if f["_g"] is not None and f["_g"].intersects(land) and f["properties"].get("scalerank", 99) <= 9]
    if rv:
        r = lines(unary_union(rv).intersection(land))
        if r is not None:
            add("river", r.simplify(tol))

    # cities: the biggest places inside the focus area
    pts = [f for f in layer("populated_places_simple") if land.contains(f["_g"])]
    pts.sort(key=lambda f: -(f["properties"].get("pop_max") or 0))
    for i, f in enumerate(pts[: src.get("cities", 20)]):
        x, y = f["_g"].x, f["_g"].y
        size = "big" if i < 3 else "town" if i < 12 else "small"
        feats.append({"type": "Feature", "properties": {"role": "city", "name": f["properties"]["name"], "size": size}, "geometry": {"type": "Point", "coordinates": [round(x, 4), round(y, 4)]}})

    # hand-picked extra towns (Natural Earth only knows the biggest ones in some countries)
    have = {f["properties"]["name"] for f in feats if f["properties"]["role"] == "city"}
    for name, x, y, size in src.get("extra_cities", []):
        if name not in have:
            feats.append({"type": "Feature", "properties": {"role": "city", "name": name, "size": size}, "geometry": {"type": "Point", "coordinates": [x, y]}})

    # labels: the region title, plus neighbouring countries / regions with room in the view
    title = src.get("title", [region["name"]])
    feats.append({"type": "Feature", "properties": {"role": "label", "kind": "title", "lines": title}, "geometry": {"type": "Point", "coordinates": [round(minx, 4), round(maxy + pady * 0.55, 4)]}})
    seen = set()
    for f in sorted(adm1, key=lambda f: -f["_g"].intersection(view).area if f["_g"].intersects(view) else 0):
        if f in focus or not f["_g"].intersects(view):
            continue
        p = f["properties"]
        same_country = p.get("adm0_a3") == focus[0]["properties"].get("adm0_a3")
        name = (p.get("region") or p.get("name")) if same_country else (p.get("admin") or "")
        key = name
        piece = f["_g"].intersection(view).difference(land)
        if not name or key in seen or piece.is_empty:
            continue
        group = unary_union([g["_g"].intersection(view) for g in adm1 if g not in focus and g["_g"].intersects(view)
                             and ((g["properties"].get("region") or g["properties"].get("name")) if same_country else g["properties"].get("admin")) == name]).difference(land)
        if group.area < (span * span) * 0.02:
            continue
        seen.add(key)
        pt = group.representative_point()
        feats.append({"type": "Feature", "properties": {"role": "label", "kind": "neighbour", "name": name}, "geometry": {"type": "Point", "coordinates": [round(pt.x, 4), round(pt.y, 4)]}})

    # local names, e.g. "Turin" -> "Torino", "Germany" -> "Duitsland"
    rename = src.get("rename", {})
    for f in feats:
        n = f["properties"].get("name")
        if n in rename:
            f["properties"]["name"] = rename[n]

    fb = land.bounds
    m = span * 0.04
    out = {"type": "FeatureCollection", "name": region["name"],
           "bbox": [round(v, 4) for v in view.bounds],
           "focus_bbox": [round(fb[0] - m, 4), round(fb[1] - m, 4), round(fb[2] + m, 4), round(fb[3] + m, 4)],
           "features": feats}
    path = os.path.join(ROOT, region["basemap"])
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    print(region["id"], len(feats), "features,", os.path.getsize(path) // 1024, "KB")


if __name__ == "__main__":
    cfg = json.load(open(os.path.join(ROOT, "data", "regions.json"), encoding="utf-8"))
    want = sys.argv[1:]
    for r in cfg["regions"]:
        if not want or r["id"] in want:
            build(r)
