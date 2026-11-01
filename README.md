# Roots

A hand-drawn style map for finding and connecting intentional communities and other conscious places: communities, cohousing, friendly houses, associations, farms, schools and more.

The first version is an informational map. The look and the icons come from a paper map of Piemonte drawn by hand (see `inspiration/`). The prototype uses that map's places as data; the real target region is the Netherlands.

## Files

- `index.html`, `style.css`, `app.js`: the website (no build step; uses d3 from a CDN)
- `data/map.geojson`: the base drawing (land, inner borders, water, roads, cities, labels)
- `data/places.json`: the places and categories
- `data/PLACES.md`: the same list, readable for review
- `inspiration/`: photos of the paper map

To draw another region, replace the two files in `data/`. Nothing in the code is specific to Piemonte.

## Run it locally

The page loads its data with `fetch`, so open it through a small web server:

```
python3 -m http.server
```

Then visit http://localhost:8000.
