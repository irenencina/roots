"""Fill every place with made-up profile details, to test the profile page and the search.

Nothing written here is true: the places are real, but these details are invented. Every place
filled by this script gets "sample": true, and the site says so on the place's profile page. To
remove the sample details again:  python3 tools/make_sample_profiles.py --remove

Run:  python3 tools/make_sample_profiles.py
"""
import json, os, random, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLACES = os.path.join(ROOT, "data", "places.json")
PROFILE = os.path.join(ROOT, "data", "profile.json")

# what a place of each type typically does, offers and is looking for (all invented)
BY_TYPE = {
    "intentional-community": {
        "do": ["We live together on {ha} hectares of hills and woods, sharing meals, work and decisions.",
               "A community of families and single people who share land, a common house and a vegetable garden."],
        "vision": ["To show that a simple, shared life can be joyful and good for the land.",
                   "A village where people of all ages care for each other and for the soil."],
        "activities": ["Permaculture", "Gardening", "Construction", "Meditation", "Forestry", "Beekeeping"],
        "offers": [("stays", "guest rooms for short visits"), ("courses", "introduction weekends to community life"),
                   ("volunteering", "help in the garden in exchange for food and a bed"), ("events", "summer gathering")],
        "needs": ["a carpenter", "new families", "help with the harvest"],
        "members": (12, 60),
    },
    "cohousing": {
        "do": ["{n} households in one renovated building, with a shared kitchen, laundry and guest room.",
               "A cohousing in the city: private flats, a big common room and a garden on the roof."],
        "vision": ["Living close to neighbours you chose, sharing what makes sense to share.",
                   "Affordable homes kept away from speculation."],
        "activities": ["Property management", "Shared kitchen", "Urban gardening", "Repair café"],
        "offers": [("events", "monthly open dinner"), ("crafts", "repair café on Saturdays")],
        "needs": ["a family with children", "someone who knows plumbing"],
        "members": (8, 30),
    },
    "friendly-house": {
        "do": ["An old farmhouse shared by a few friends, open to travellers who share our values.",
               "A small house in the hills where we host people looking for a slower life."],
        "vision": ["A door that is always open.", "Small is enough."],
        "activities": ["Hosting", "Cooking", "Gardening", "Music"],
        "offers": [("stays", "a room for travellers, by donation"), ("food", "jam and honey")],
        "needs": ["help to fix the roof"],
        "members": (3, 9),
    },
    "association": {
        "do": ["An association that brings people together around ecology, culture and the land.",
               "We organise courses, markets and festivals that connect town and countryside."],
        "vision": ["Culture as a way to care for each other and for the places we live in."],
        "activities": ["Workshops", "Markets", "Festivals", "Education"],
        "offers": [("courses", "workshops on natural building and herbs"), ("events", "seasonal festivals"),
                   ("volunteering", "volunteers for events")],
        "needs": ["volunteers for the summer festival", "a space for workshops"],
        "members": (15, 120),
    },
    "farm": {
        "do": ["An organic farm growing vegetables, grain and fruit, with animals and a small farm shop.",
               "A family farm that turned organic and now hosts guests in a few rooms."],
        "vision": ["Healthy soil, honest food and fair work."],
        "activities": ["Farming", "Winemaking", "Cheese making", "Agritourism", "Permaculture"],
        "offers": [("food", "vegetables, wine and cheese from the farm"), ("stays", "agritourism rooms"),
                   ("volunteering", "WWOOF volunteers welcome"), ("courses", "bread-making days")],
        "needs": ["seasonal workers", "people for the grape harvest"],
        "members": (4, 25),
    },
    "school": {
        "do": ["An outdoor school where children learn in the forest, every day of the year.",
               "A small parent-run school following the rhythm of the seasons."],
        "vision": ["Children who know the names of trees and how to look after each other."],
        "activities": ["Outdoor education", "Nature play", "Parent circles"],
        "offers": [("school", "kindergarten and primary classes outdoors"), ("courses", "training for outdoor teachers")],
        "needs": ["an educator", "families who want to join"],
        "members": (10, 40),
    },
    "micronation": {
        "do": ["A tiny self-proclaimed republic in the hills, half art project and half experiment in living together."],
        "vision": ["Imagination is a form of politics."],
        "activities": ["Art", "Theatre", "Hosting"],
        "offers": [("events", "national day celebration"), ("stays", "a passport and a bed for a night")],
        "needs": ["new citizens"],
        "members": (2, 12),
    },
}
LANGS = [["Italian"], ["Italian", "English"], ["Italian", "English", "French"], ["Italian", "German"]]


def options(schema, field):
    for s in schema["sections"]:
        for f in s["fields"]:
            if f["id"] == field:
                return [o["id"] for o in f.get("options", [])]
    raise KeyError(field)


def ages(p, rnd):
    """A rough amount (0 none, 1 a few, 2 some, 3 many) for each age group."""
    if "school" in p["categories"]:  # children, with their teachers
        return {"children": 3, "young": 1, "adults": 2, "older": 0}
    return rnd.choice([
        {"children": 3, "young": 1, "adults": 3, "older": 1},  # families
        {"children": 1, "young": 3, "adults": 2, "older": 0},  # young adults
        {"children": 0, "young": 1, "adults": 2, "older": 3},  # older
        {"children": 2, "young": 2, "adults": 2, "older": 2},  # all ages
    ])


def gender(rnd):
    return rnd.choice(["balanced", "balanced", "mostly_women", "mostly_men"])


def applies(f, p):
    return not f.get("not_for") or any(c not in f["not_for"] for c in p["categories"])


def fill(p, schema, rnd):
    t = BY_TYPE.get(p["categories"][0], BY_TYPE["association"])
    pick = lambda field: rnd.choice(options(schema, field))
    some = lambda field, lo=1, hi=3: rnd.sample(options(schema, field), rnd.randint(lo, min(hi, len(options(schema, field)))))
    members = rnd.randint(*t["members"])
    # how complete a profile is varies, to test pages with little and with a lot
    level = rnd.choice(["short", "medium", "full", "full"])
    p["sample"] = True
    p["stage"] = pick("stage")
    p["founded"] = str(rnd.randint(1975, 2022))
    p["description"] = rnd.choice(t["do"]).format(ha=rnd.randint(3, 80), n=rnd.randint(6, 20))
    p["languages"] = rnd.choice(LANGS)
    p["offers"] = [{"kind": k, "what": w, "confirmed": False} for k, w in rnd.sample(t["offers"], rnd.randint(1, len(t["offers"])))]
    if level == "short":
        return
    p["vision"] = rnd.choice(t["vision"])
    p["purpose"] = some("purpose", 1, 3)
    p["activities"] = rnd.sample(t["activities"], rnd.randint(2, min(4, len(t["activities"]))))
    p["needs"] = rnd.sample(t["needs"], rnd.randint(1, len(t["needs"])))
    p["members"] = members
    p["residents"] = max(1, members - rnd.randint(0, members // 2))
    p["open_members"] = rnd.random() < .6
    p["open_visitors"] = rnd.random() < .8
    p["open_volunteers"] = rnd.random() < .6
    p["how_to_join"] = ("Come to an open morning, then a trial week with your child." if "school" in p["categories"]
                        else "Come for a visit weekend first, then a trial period of six months.")
    if level == "medium":
        return
    for f in ("decision_authority", "decision_process", "governance_structure", "economic_model",
              "social_life", "local_ties", "pets", "substances"):
        p[f] = pick(f)
    for f in ("costs", "vehicles", "food", "support", "practices", "accessibility"):
        p[f] = some(f)
    p["ages"] = ages(p, rnd)
    p["gender"] = gender(rnd)
    if rnd.random() < .4:
        p["spirituality"] = rnd.choice(["Meditation in the morning", "No shared practice", "Seasonal celebrations"])


def drop_unfit(p, schema):
    """Leave out what does not apply to this kind of place (a school has no pets policy)."""
    for s in schema["sections"]:
        for f in s["fields"]:
            if not applies(f, p):
                p.pop(f["id"], None)


def main():
    data = json.load(open(PLACES, encoding="utf-8"))
    schema = json.load(open(PROFILE, encoding="utf-8"))
    fields = {f["id"] for s in schema["sections"] for f in s["fields"]}
    keep = {"description", "website", "contact"}  # fields the places had before
    for p in data["places"]:
        if p.get("sample"):  # start again from the place without its sample details
            for f in fields - keep:
                p.pop(f, None)
            p["description"] = ""
            p.pop("sample")
            p["offers"] = []
    if "--remove" not in sys.argv:
        rnd = random.Random(7)
        for p in data["places"]:
            if p.get("location"):
                fill(p, schema, rnd)
                drop_unfit(p, schema)
    with open(PLACES, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(sum(1 for p in data["places"] if p.get("sample")), "places with sample details")


if __name__ == "__main__":
    main()
