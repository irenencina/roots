"""Find the train stations around the places in Roots, and the way from each place to its nearest ones.

Stations come from OpenStreetMap (railway=station or railway=halt, without metro, tram and other
city or mountain railways), fetched from the Overpass API for the area around the places. For
every place, the few nearest stations as the crow flies are routed by car, by bike and on foot
over OSRM (routing.openstreetmap.de), like the connections between places, so the map can say
"Nearest station: Chivasso, 18 min by bike".

Then the train trips between places: the rail lines (railway=rail, without sidings and yards)
are fetched too and joined into one network; a trip is walking (or cycling, when the station is
further) to a station near one place, riding the rails to a station near the other, and on to
that place. OpenStreetMap has no timetables, so the ride's time is an estimate: the length along
the tracks at an average regional train speed, plus a wait at the station.

Results are kept in data/stations.json, and routes already found are reused, so the servers
only get requests for new places or new stations.

Run:  pip install shapely && python3 tools/build_stations.py
"""
import heapq, json, math, os, time, urllib.parse, urllib.request
from shapely.geometry import LineString
from build_routes import km, route, AGENT, SIMPLIFY_DEG

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "stations.json")
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
MARGIN_DEG = 0.3      # look this far around the places (about 30 km)
NEAREST = 3           # stations routed per place
MODES = {"car": ("routed-car", 60), "bike": ("routed-bike", 40), "foot": ("routed-foot", 15)}  # longest straight km worth routing
NOT_TRAINS = "subway|light_rail|monorail|funicular|miniature|tram"
TRAIN_KMH = 55        # average speed of a regional train, stops included
WAIT_MIN = 10         # waiting at the station (no timetables, so one fixed guess)
WALK_TO_STATION = 20  # walk to the station when it takes up to this many minutes, else cycle
SNAP_KM = 0.6         # a station belongs to the rail line when it is this close to the tracks
MAX_TRIP_MIN = 240


def overpass(query):
    data = urllib.parse.urlencode({"data": query}).encode()
    last = None
    for url in OVERPASS:
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": AGENT})
            return json.load(urllib.request.urlopen(req, timeout=180))
        except Exception as ex:  # try the next mirror
            print("  overpass failed at", url, ex)
            last = ex
    raise last


def bbox_of(places):
    lats = [p["location"]["lat"] for p in places]
    lngs = [p["location"]["lng"] for p in places]
    return "%.4f,%.4f,%.4f,%.4f" % (min(lats) - MARGIN_DEG, min(lngs) - MARGIN_DEG, max(lats) + MARGIN_DEG, max(lngs) + MARGIN_DEG)


def fetch_rails(bbox):
    """The rail network as a graph: OSM node id -> [(next node id, km)], and node id -> (lng, lat)."""
    q = """[out:json][timeout:300];
way["railway"="rail"][!"service"]["usage"!~"^(industrial|military|tourism|test)$"](%s);
out skel geom;""" % bbox
    ways = overpass(q)["elements"]
    adj, at = {}, {}
    for w in ways:
        ids, geo = w.get("nodes") or [], w.get("geometry") or []
        if len(ids) != len(geo):
            continue
        for i, (n, g) in enumerate(zip(ids, geo)):
            if g is None:
                continue
            at[n] = (g["lon"], g["lat"])
            if i and geo[i - 1] is not None:
                m = ids[i - 1]
                d = km(at[m], at[n])
                adj.setdefault(m, []).append((n, d))
                adj.setdefault(n, []).append((m, d))
    print(len(ways), "rail ways,", len(adj), "rail nodes")
    return adj, at


def snap(stations, at):
    """The rail node nearest to each station, when it is close enough."""
    grid = {}
    for n, (x, y) in at.items():
        grid.setdefault((round(x * 50), round(y * 50)), []).append(n)
    out = {}
    for s in stations:
        gx, gy = round(s["lng"] * 50), round(s["lat"] * 50)
        best = None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for n in grid.get((gx + dx, gy + dy), []):
                    d = km((s["lng"], s["lat"]), at[n])
                    if d <= SNAP_KM and (best is None or d < best[1]):
                        best = (n, d)
        if best:
            out[s["id"]] = best[0]
    return out


def rail_from(adj, source):
    """Shortest track distance (km) from one rail node to every other, with the way back."""
    dist, prev = {source: 0.0}, {}
    todo = [(0.0, source)]
    while todo:
        d, n = heapq.heappop(todo)
        if d > dist.get(n, 1e9):
            continue
        for m, w in adj.get(n, ()):
            nd = d + w
            if nd < dist.get(m, 1e9):
                dist[m], prev[m] = nd, n
                heapq.heappush(todo, (nd, m))
    return dist, prev


def access_leg(a):
    """How to get between a place and a station: walk when it is short, else cycle."""
    if a.get("foot") and a["foot"]["min"] <= WALK_TO_STATION:
        return "foot", a["foot"]
    if a.get("bike"):
        return "bike", a["bike"]
    if a.get("foot"):
        return "foot", a["foot"]
    return None, None


def train_trips(places, stations, access, adj, at):
    node_of = snap(stations, at)
    legs = {}  # place -> [(station id, rail node, mode, route)]
    for a in access:
        mode, r = access_leg(a)
        if r and a["station"] in node_of:
            legs.setdefault(a["place"], []).append((a["station"], node_of[a["station"]], mode, r))
    runs = {}
    for ls in legs.values():
        for _, n, _, _ in ls:
            if n not in runs:
                runs[n] = rail_from(adj, n)
    trips = []
    ids = [p["id"] for p in places if p["id"] in legs]
    for i, pa in enumerate(ids):
        for pb in ids[i + 1:]:
            best = None
            for sa, na, ma, ra in legs[pa]:
                dist, _ = runs[na]
                for sb, nb, mb, rb in legs[pb]:
                    if sa == sb or nb not in dist:
                        continue
                    rail_km = dist[nb]
                    if rail_km < 2:
                        continue
                    total = ra["min"] + WAIT_MIN + rail_km / TRAIN_KMH * 60 + rb["min"]
                    if best is None or total < best[0]:
                        best = (total, sa, na, ma, ra, sb, nb, mb, rb, rail_km)
            if not best or best[0] > MAX_TRIP_MIN:
                continue
            total, sa, na, ma, ra, sb, nb, mb, rb, rail_km = best
            _, prev = runs[na]
            line, n = [at[nb]], nb
            while n != na:
                n = prev[n]
                line.append(at[n])
            line.reverse()
            rail = LineString(line).simplify(SIMPLIFY_DEG)
            path = ra["path"] + [list(c) for c in rail.coords] + list(reversed(rb["path"]))
            trips.append({
                "a": pa, "b": pb, "min": round(total), "km": round(ra["km"] + rail_km + rb["km"], 1),
                "rail_km": round(rail_km, 1), "from": sa, "to": sb, "access": [ma, mb],
                "path": [[round(x, 4), round(y, 4)] for x, y in path],
            })
    print(len(trips), "train trips between places,", len(node_of), "of", len(stations), "stations on the rail lines")
    return trips


def fetch_stations(places):
    bbox = bbox_of(places)
    q = """[out:json][timeout:120];
(
  node["railway"~"^(station|halt)$"]["station"!~"^(%s)$"]["usage"!="tourism"](%s);
);
out body;""" % (NOT_TRAINS, bbox)
    els = overpass(q)["elements"]
    out = []
    for e in els:
        t = e.get("tags", {})
        name = t.get("name")
        if not name or t.get("disused") == "yes" or t.get("railway:historic"):
            continue
        s = {"id": "n%d" % e["id"], "name": name, "lat": round(e["lat"], 5), "lng": round(e["lon"], 5),
             "kind": "halt" if t.get("railway") == "halt" else "station"}
        # the same station is sometimes mapped twice (old and new node): keep one
        if any(o["name"] == name and km((o["lng"], o["lat"]), (s["lng"], s["lat"])) < 0.4 for o in out):
            continue
        out.append(s)
    out.sort(key=lambda s: s["id"])
    return out


def main():
    places = [p for p in json.load(open(os.path.join(ROOT, "data", "places.json"), encoding="utf-8"))["places"] if p.get("location")]
    stations = fetch_stations(places)
    print(len(stations), "stations")
    old = {}
    if os.path.exists(OUT):
        for a in json.load(open(OUT, encoding="utf-8")).get("access", []):
            old[(a["place"], a["station"])] = a
    access, asked, failed = [], 0, 0
    for p in places:
        here = (p["location"]["lng"], p["location"]["lat"])
        near = sorted(stations, key=lambda s: km(here, (s["lng"], s["lat"])))[:NEAREST]
        for s in near:
            there = (s["lng"], s["lat"])
            straight = km(here, there)
            prev = old.get((p["id"], s["id"]), {})
            a = {"place": p["id"], "station": s["id"], "straight_km": round(straight, 1)}
            for mode, (profile, limit) in MODES.items():
                if straight > limit:
                    continue
                if prev.get(mode):
                    a[mode] = prev[mode]
                    continue
                try:
                    r = route(profile, here, there)
                    asked += 1
                    time.sleep(1.2)  # be gentle with a free, volunteer-run service
                except Exception as ex:
                    print("  failed", mode, p["id"], s["id"], ex)
                    r, failed = None, failed + 1
                if r:
                    a[mode] = r
            access.append(a)
    adj, at = fetch_rails(bbox_of(places))
    trips = train_trips(places, stations, access, adj, at)
    out = {
        "source": "Stations, rail lines and routes: OpenStreetMap contributors (ODbL), via Overpass API and FOSSGIS OSRM (routing.openstreetmap.de)",
        "train": {"kmh": TRAIN_KMH, "wait_min": WAIT_MIN},
        "stations": stations,
        "access": access,
        "trips": trips,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(len(access), "ways to stations,", asked, "routes fetched,", failed, "failed")
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
