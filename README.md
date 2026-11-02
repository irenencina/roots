# Roots

A hand-drawn style map for finding and connecting intentional communities and other conscious places: communities, cohousing, friendly houses, associations, farms, schools and more.

The first version is an informational map. The look and the icons come from a paper map of Piemonte drawn by hand (see `inspiration/`). The prototype uses that map's places as data; the real target region is the Netherlands.

## How it is organised

Roots is one world map. Zoom out to see every country (a circled number shows how many places it has); zoom in and each country splits into its regions. Regions with places are brown, empty ones grey, and the region you are looking at, or where the selected place is, is red-brown.

- `index.html`, `style.css`, `app.js`: the website (no build step; d3 from a CDN, Kalam font from Google Fonts)
- `data/places.json`: every place in the world with its location, plus the categories and their icons
- `data/world/`: countries, lakes, rivers and towns for the whole world
- `data/admin1/<ISO3>.json`: the regions of one country, loaded only when you zoom into it; `index.json` lists them
- `tools/build_world.py`: rebuilds `data/world` and `data/admin1` from Natural Earth (public domain). Town names and positions come from [GeoNames](https://www.geonames.org) (CC BY 4.0).
- `data/PLACES.md`: readable list of the Piemonte places
- `inspiration/`: photos of the Piemonte paper map

Open a region or country directly with its id in the address, e.g. `#ITA-piemonte` or `#NLD`.

## Add places

Add them to `data/places.json` with a `location` (`lat`, `lng`). Nothing else is needed: the place finds its own country and region, and that region turns brown.

## Rebuild the world map

```
pip install shapely
python3 tools/build_world.py
```

## Run it locally

The page loads its data with `fetch`, so open it through a small web server:

```
python3 -m http.server
```

Then visit http://localhost:8000.
