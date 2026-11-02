"""Build the world base map for Roots from Natural Earth (public domain).

Writes small files the website loads on demand:
  data/world/countries.json   every country (1:50m), for the zoomed-out view
  data/world/lakes.json       big lakes
  data/world/rivers.json      main rivers
  data/world/cities.json      towns and cities (GeoNames cities15000, CC BY 4.0), for labels
  data/admin1/<ISO3>.json     the regions of one country (provinces, states, regions),
                              loaded only when you zoom into that country
  data/admin1/index.json      which countries have a regions file, with their bounding boxes

Run:  pip install shapely && python3 tools/build_world.py
Natural Earth files are downloaded once into .cache/.
Towns come from GeoNames (https://www.geonames.org, CC BY 4.0): cities15000.txt is downloaded
into .cache/ from download.geonames.org, or from a mirror of the same file on GitHub.
"""
import json, os, re, unicodedata, urllib.request
from shapely.geometry import shape, mapping
from shapely.geometry.polygon import orient
from shapely.ops import unary_union, linemerge, polygonize
from shapely import STRtree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, ".cache")
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_{}.geojson"
GEONAMES = [
    "https://download.geonames.org/export/dump/cities15000.zip",
    "https://raw.githubusercontent.com/elyase/geotext/master/geotext/data/cities15000.txt",
]


def load(name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name + ".geojson")
    if not os.path.exists(path):
        print("downloading", name)
        urllib.request.urlretrieve(NE.format(name), path)
    return json.load(open(path, encoding="utf-8"))["features"]


def geonames_file():
    path = os.path.join(CACHE, "cities15000.txt")
    for url in GEONAMES if not os.path.exists(path) else []:
        try:
            print("downloading", url)
            if url.endswith(".zip"):
                import io, zipfile
                data = urllib.request.urlopen(url).read()
                open(path, "wb").write(zipfile.ZipFile(io.BytesIO(data)).read("cities15000.txt"))
            else:
                urllib.request.urlretrieve(url, path)
            break
        except Exception as e:
            print("  failed:", e)
    return path


def rnd(c, n):
    if isinstance(c, (list, tuple)) and c and isinstance(c[0], (int, float)):
        return [round(c[0], n), round(c[1], n)]
    return [rnd(x, n) for x in c]


def clockwise(g):
    # d3 draws a polygon as "everything outside" unless its rings run clockwise
    if g.geom_type == "Polygon":
        return orient(g, -1.0)
    if g.geom_type == "MultiPolygon":
        return type(g)([orient(p, -1.0) for p in g.geoms])
    return g


def geom(g, n):
    m = mapping(g)
    return {"type": m["type"], "coordinates": rnd(m["coordinates"], n)}


def faces(items, tol):
    """Simplify a set of neighbouring areas together, so they keep meeting exactly.

    items is a list of (id, geometry). Every border is cut into lines between the points where
    three or more areas meet, each line is simplified once, and the areas are rebuilt from those
    shared lines. So two neighbours share the very same border line (one pen line, never two
    lines side by side), and nothing opens up between them. Returns ({id: geometry}, inner lines),
    where inner lines are the borders between two of the areas (not their outside edge)."""
    geoms = [g for _, g in items]
    merged = unary_union([g.boundary for g in geoms])
    if merged.geom_type == "MultiLineString":
        merged = linemerge(merged)
    merged = list(merged.geoms) if hasattr(merged, "geoms") else [merged]
    outline = unary_union(geoms).boundary
    simple, inner = [], []
    for line in merged:
        s = line.simplify(tol)
        if s.length == 0:
            continue
        simple.append(s)
        if line.interpolate(0.5, normalized=True).distance(outline) > 1e-7:
            inner.append(s)
    tree = STRtree(geoms)
    out = {}
    for poly in polygonize(unary_union(simple)):
        pt = poly.representative_point()
        hit = tree.query(pt, predicate="intersects")
        if not len(hit):
            i = tree.nearest(pt)
            if geoms[i].distance(pt) > tol:
                continue  # a lake or sea closed in by land, not part of any area
            hit = [i]
        out.setdefault(items[hit[0]][0], []).append(poly)
    return {k: unary_union(v).buffer(0) for k, v in out.items()}, inner


def only(g, kinds):
    """The parts of a geometry of the given kinds ("Polygon" or "LineString"), as one geometry."""
    if g.geom_type.startswith("Multi") or g.geom_type == "GeometryCollection":
        parts = [p for p in g.geoms if p.geom_type.endswith(kinds)]
    else:
        parts = [g] if g.geom_type.endswith(kinds) else []
    return unary_union(parts) if parts else type(g)() if not g.geom_type == "GeometryCollection" else g.__class__()


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def write(rel, obj):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(path)


def main():
    # countries
    # all countries are simplified together, so neighbours share one border line
    feats = []
    src = [f for f in load("50m_admin_0_countries") if f["properties"]["ADM0_A3"] != "ATA"]  # Antarctica is left off the map
    country_shape, _ = faces([(f["properties"]["ADM0_A3"], shape(f["geometry"]).buffer(0)) for f in src], 0.02)
    for f in src:
        p = f["properties"]
        a3 = p["ADM0_A3"]
        g = country_shape.get(a3)
        if g is None or g.is_empty:
            continue
        g = clockwise(g)
        feats.append({"type": "Feature", "id": a3, "properties": {"a3": a3, "name": p["NAME"], "name_es": p.get("NAME_ES") or p["NAME"], "name_local": p.get("NAME_" + (p.get("ISO_A2") or "").upper(), None) or p["NAME"]}, "geometry": geom(g, 3)})
    print("countries", write("data/world/countries.json", {"type": "FeatureCollection", "features": feats}) // 1024, "KB")

    lakes = [{"type": "Feature", "properties": {"name": f["properties"].get("name")}, "geometry": geom(clockwise(shape(f["geometry"]).simplify(0.01).buffer(0)), 3)}
             for f in load("50m_lakes") if (f["properties"].get("scalerank") or 9) <= 4]
    print("lakes", write("data/world/lakes.json", {"type": "FeatureCollection", "features": lakes}) // 1024, "KB")

    rivers = []
    for f in load("10m_rivers_lake_centerlines"):
        if not f["geometry"] or (f["properties"].get("scalerank") or 99) > 7:
            continue
        g = shape(f["geometry"]).simplify(0.015)
        rivers.append({"type": "Feature", "properties": {"rank": f["properties"]["scalerank"]}, "geometry": geom(g, 3)})
    print("rivers", write("data/world/rivers.json", {"type": "FeatureCollection", "features": rivers}) // 1024, "KB")

    # towns: rank 2 = national or regional capital (drawn as a circled dot), 1 = provincial
    # capital, 0 = other town. Kept: every capital, plus other towns from 100 000 people.
    iso2 = {}
    for f in load("10m_admin_0_countries"):
        p = f["properties"]
        for key in ("ISO_A2", "ISO_A2_EH", "WB_A2"):
            if p.get(key) and p[key] != "-99":
                iso2.setdefault(p[key], p["ADM0_A3"])
    rank_of = {"PPLC": 2, "PPLA": 2, "PPLA2": 1}
    cities = []
    for line in open(geonames_file(), encoding="utf-8"):
        c = line.rstrip("\n").split("\t")
        rank, pop = rank_of.get(c[7], 0), int(c[14] or 0)
        if c[7] in ("PPLX", "PPLH", "PPLQ", "PPLW") or (rank == 0 and pop < 100000) or c[8] not in iso2:
            continue
        cities.append([c[1], round(float(c[5]), 3), round(float(c[4]), 3), pop, rank, iso2[c[8]]])
    cities.sort(key=lambda r: (-r[4], -r[3]))
    print("cities", len(cities), write("data/world/cities.json", {"fields": ["name", "lng", "lat", "population", "rank", "country"], "source": "GeoNames, CC BY 4.0", "rows": cities}) // 1024, "KB")

    # regions per country: dissolve admin-1 units into the level people talk about
    # (Italy's provinces become its 20 regions; the Netherlands keeps its 12 provinces)
    by_country = {}
    for f in load("10m_admin_1_states_provinces"):
        p = f["properties"]
        if not f["geometry"]:
            continue
        by_country.setdefault(p["adm0_a3"], []).append(f)
    # every country in detail too (1:10m), simplified together like the world map, for when you
    # zoom in: neighbours still share one border line, and it follows the regions inside closely
    detail_src = [f for f in load("10m_admin_0_countries") if f["properties"]["ADM0_A3"] != "ATA"]
    detail, _ = faces([(f["properties"]["ADM0_A3"], shape(f["geometry"]).buffer(0)) for f in detail_src], 0.004)
    index, total = {}, 0
    for a3, fs in by_country.items():
        if a3 == "ATA":
            continue
        # use the "region" level when it is a real layer of regions (Italy: 20, France: 13);
        # otherwise (USA's 4 census regions) keep the provinces or states themselves
        regions = {f["properties"].get("region") for f in fs if f["properties"].get("region")}
        use_region = len(regions) >= 6 and len(fs) > len(regions) * 1.5
        groups = {}
        for f in fs:
            p = f["properties"]
            key = (p.get("region") if use_region else None) or p.get("name") or "?"
            groups.setdefault(key, []).append(shape(f["geometry"]).buffer(0))
        # regions are simplified together (shared borders stay one line) and trimmed to the
        # country's own shape on the world map, so the country's border is the only outside line
        region_shape, inner = faces([(name, unary_union(gs).buffer(0)) for name, gs in groups.items()], 0.004)
        land = detail.get(a3)
        out, islands = [], []
        for name in groups:
            g = region_shape.get(name)
            if g is None:
                continue
            if land is not None:
                # islands too small for the world map are kept, with their own coast line
                parts = list(g.geoms) if g.geom_type == "MultiPolygon" else [g]
                apart = [p for p in parts if p.distance(land) > 0.01]
                islands += apart
                g = unary_union([only(g.intersection(land), "Polygon")] + apart)
            g = clockwise(g.buffer(0)) if not g.is_empty else g
            if g.is_empty or g.geom_type not in ("Polygon", "MultiPolygon"):
                continue
            out.append({"type": "Feature", "id": a3 + "-" + slug(name), "properties": {"id": a3 + "-" + slug(name), "name": name, "country": a3}, "geometry": geom(g, 4)})
        if not out:
            continue
        # bounding box of the main land only, so islands across the date line don't make it span the globe
        parts = []
        for o in out:
            g = shape(o["geometry"])
            parts += list(g.geoms) if g.geom_type == "MultiPolygon" else [g]
        biggest = max(p.area for p in parts)
        bs = [p.bounds for p in parts if p.area >= biggest * 0.05]
        b = (min(x[0] for x in bs), min(x[1] for x in bs), max(x[2] for x in bs), max(x[3] for x in bs))
        index[a3] = [round(v, 3) for v in b]
        # the borders between regions, each drawn once as a light dashed line inside the country
        borders = unary_union(inner)
        if land is not None:
            borders = only(borders.intersection(land.buffer(-0.002)), "LineString")
        borders = linemerge(borders) if borders.geom_type == "MultiLineString" else borders
        doc = {"type": "FeatureCollection", "country": a3, "features": out}
        if land is not None and not land.is_empty:
            doc["land"] = geom(clockwise(land), 4)
        if islands:
            doc["coast"] = geom(unary_union(islands).boundary, 4)
        if not borders.is_empty and borders.geom_type in ("LineString", "MultiLineString"):
            doc["borders"] = geom(borders, 4)
        total += write("data/admin1/%s.json" % a3, doc)
    write("data/admin1/index.json", index)
    print("admin1", len(index), "countries,", total // 1024, "KB total")


if __name__ == "__main__":
    main()
