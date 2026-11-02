"""Build the connections between places for Roots.

The connections are a graph: every place is a node, and an edge joins two places when no other
place sits between them (a Gabriel graph, so the network stays tidy and has no long detours).
Each edge is then routed over OpenStreetMap roads and paths three times, by car, by bike and on
foot, and the route is simplified so it reads like a hand-drawn line that still follows the real
way there.

Routes come from the FOSSGIS OSRM servers at routing.openstreetmap.de (OpenStreetMap data,
ODbL, (c) OpenStreetMap contributors). Results are kept in data/connections.json and only
missing edges are asked for again, so the servers get a few requests per new place.

Run:  pip install shapely && python3 tools/build_routes.py
"""
import json, math, os, time, urllib.request
from shapely.geometry import LineString

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "connections.json")
SERVER = "https://routing.openstreetmap.de/{profile}/route/v1/driving/{a};{b}?overview=full&geometries=geojson"
MAX_EDGE_KM = 80  # never join places further apart than this
MODES = {
    # mode: (server profile, longest straight-line distance in km worth routing). The map's
    # settings decide which of these are shown (by default: car always, bike up to 60 km,
    # walking up to 30 km of route), so routes are fetched a bit beyond those defaults.
    "car": ("routed-car", MAX_EDGE_KM),
    "bike": ("routed-bike", 80),
    "foot": ("routed-foot", 50),
}
SIMPLIFY_DEG = 0.0015   # about 150 m: keeps the shape of the way, drops the wiggles
AGENT = "roots-map/0.1 (https://github.com/irenencina/roots)"


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[1], a[0], b[1], b[0]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def gabriel_edges(nodes):
    """Edges (i, j) where no other node lies inside the circle with i-j as diameter."""
    edges = []
    for i in range(len(nodes)):
        for j in range(i + 1, len(nodes)):
            a, b = nodes[i]["xy"], nodes[j]["xy"]
            if km(a, b) > MAX_EDGE_KM:
                continue
            mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            r = km(a, b) / 2
            if any(k not in (i, j) and km(nodes[k]["xy"], mid) < r * 0.999 for k in range(len(nodes))):
                continue
            edges.append((i, j))
    return edges


def route(profile, a, b):
    url = SERVER.format(profile=profile, a="%.5f,%.5f" % tuple(a), b="%.5f,%.5f" % tuple(b))
    req = urllib.request.Request(url, headers={"User-Agent": AGENT})
    data = json.load(urllib.request.urlopen(req, timeout=60))
    if data.get("code") != "Ok" or not data.get("routes"):
        return None
    r = data["routes"][0]
    line = LineString(r["geometry"]["coordinates"]).simplify(SIMPLIFY_DEG)
    return {
        "km": round(r["distance"] / 1000, 1),
        "min": round(r["duration"] / 60),
        "path": [[round(x, 4), round(y, 4)] for x, y in line.coords],
    }


def main():
    places = json.load(open(os.path.join(ROOT, "data", "places.json"), encoding="utf-8"))["places"]
    nodes = [{"id": p["id"], "xy": (p["location"]["lng"], p["location"]["lat"])} for p in places if p.get("location")]
    old = {}
    if os.path.exists(OUT):
        for e in json.load(open(OUT, encoding="utf-8"))["edges"]:
            old[(e["a"], e["b"])] = e
    edges, asked, failed = [], 0, 0
    for i, j in gabriel_edges(nodes):
        a, b = nodes[i], nodes[j]
        straight = km(a["xy"], b["xy"])
        prev = old.get((a["id"], b["id"]), {})
        e = {"a": a["id"], "b": b["id"], "straight_km": round(straight, 1)}
        for mode, (profile, limit) in MODES.items():
            if straight > limit:
                continue
            if prev.get(mode):
                e[mode] = prev[mode]
                continue
            try:
                r = route(profile, a["xy"], b["xy"])
                asked += 1
                time.sleep(1.2)  # be gentle with a free, volunteer-run service
            except Exception as ex:
                print("  failed", mode, a["id"], b["id"], ex)
                r, failed = None, failed + 1
            if r:
                e[mode] = r
        edges.append(e)
    out = {
        "source": "Routes: OpenStreetMap contributors (ODbL), routed by FOSSGIS OSRM (routing.openstreetmap.de)",
        "modes": {m: {"max_straight_km": lim} for m, (_, lim) in MODES.items()},
        "edges": edges,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(len(edges), "connections,", asked, "routes fetched,", failed, "failed")
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
