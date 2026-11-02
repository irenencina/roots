"""Find the train stations around the places in Roots, and the way from each place to its nearest ones.

Stations come from OpenStreetMap (railway=station or railway=halt, without metro, tram and other
city or mountain railways), fetched from the Overpass API for the area around the places. For
every place, the few nearest stations as the crow flies are routed by car, by bike and on foot
over OSRM (routing.openstreetmap.de), like the connections between places, so the map can say
"Nearest station: Chivasso, 18 min by bike".

Results are kept in data/stations.json, and routes already found are reused, so the servers
only get requests for new places or new stations.

Run:  pip install shapely && python3 tools/build_stations.py
"""
import json, math, os, time, urllib.parse, urllib.request
from build_routes import km, route, AGENT

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "stations.json")
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
MARGIN_DEG = 0.3      # look this far around the places (about 30 km)
NEAREST = 3           # stations routed per place
MODES = {"car": ("routed-car", 60), "bike": ("routed-bike", 40), "foot": ("routed-foot", 15)}  # longest straight km worth routing
NOT_TRAINS = "subway|light_rail|monorail|funicular|miniature|tram"


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


def fetch_stations(places):
    lats = [p["location"]["lat"] for p in places]
    lngs = [p["location"]["lng"] for p in places]
    bbox = "%.4f,%.4f,%.4f,%.4f" % (min(lats) - MARGIN_DEG, min(lngs) - MARGIN_DEG, max(lats) + MARGIN_DEG, max(lngs) + MARGIN_DEG)
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
    out = {
        "source": "Stations and routes: OpenStreetMap contributors (ODbL), via Overpass API and FOSSGIS OSRM (routing.openstreetmap.de)",
        "stations": stations,
        "access": access,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(len(access), "ways to stations,", asked, "routes fetched,", failed, "failed")
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
