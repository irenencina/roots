# Roots

A hand-drawn style map for finding and connecting intentional communities and other conscious places: communities, cohousing, friendly houses, associations, farms, schools and more.

The first version is an informational map. The look and the icons come from a paper map of Piemonte drawn by hand (see `inspiration/`). The prototype uses that map's places as data; the real target region is the Netherlands.

## How it is organised

The map works for any region in the world. Places are global; each region only decides what the pen drawing around them looks like.

- `index.html`, `style.css`, `app.js`: the website (no build step; d3 from a CDN, Kalam font from Google Fonts)
- `data/places.json`: every place (any country) with its location, plus the categories and their icons
- `data/regions.json`: the regions you can open, e.g. Piemonte and Nederland. Open one with `#<id>` in the address.
- `data/basemaps/<region>.geojson`: the drawing for each region (outline, provinces, water, rivers, towns, neighbours)
- `tools/build_basemap.py`: makes a basemap for any region from Natural Earth data
- `data/PLACES.md`: readable list of the Piemonte places
- `inspiration/`: photos of the Piemonte paper map

## Add a region

1. Add an entry to `data/regions.json`. `match` picks Natural Earth admin-1 areas (provinces, states, regions), for example `{"adm0_a3": "NLD", "type_en": "Province"}` for the Netherlands or `{"adm0_a3": "ITA", "region": ["Piemonte"]}` for one Italian region. `rename` gives local names and `extra_cities` adds towns Natural Earth does not know.
2. Run `pip install shapely` and `python3 tools/build_basemap.py <region-id>`.
3. Add places with their `location` to `data/places.json`. A place shows up on every region whose area contains it.

## Run it locally

The page loads its data with `fetch`, so open it through a small web server:

```
python3 -m http.server
```

Then visit http://localhost:8000.
