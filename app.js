/* Roots: a hand-drawn world map of conscious places.

   Data
   - data/places.json        every place in the world (lat/lng) and the categories
   - data/world/*.json       countries, lakes, rivers and towns for the whole world
   - data/admin1/<ISO3>.json the regions of one country, loaded when you zoom into it
   All of data/world and data/admin1 is made by tools/build_world.py, so nothing here is
   specific to one country: a place added anywhere shows up, and its region turns brown. */
(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  // Icons from the paper map's legend, on a 24x24 grid.
  const ICONS = {
    "intentional-community":
      '<path d="M2.5 20.5v-7.2l4.4-4.2 4.3 4.2v7.2z"/><path d="M11.2 20.5v-7.2l4.5-4.2 4.6 4.2v7.2z"/><path d="M5.6 20.5v-3.2h2.4v3.2M14.4 20.5v-3.2h2.5v3.2"/>',
    cohousing:
      '<path d="M8.4 21.5V8.2L12 3.5l3.6 4.7v13.3z"/><path d="M10.4 10.2h3.2M10.4 13.4h3.2M10.4 16.6h3.2"/>',
    "friendly-house":
      '<path d="M5.5 20.5v-8l6.5-6 6.5 6v8z"/><path d="M10.4 20.5v-4.3h3.2v4.3"/>',
    association:
      '<path d="M6.5 13.5V8.2c0-.9 1.6-.9 1.6 0v4.3M8.1 12.5V5.6c0-.9 1.6-.9 1.6 0v6.6M9.7 12V4.8c0-.9 1.7-.9 1.7 0V12M11.4 12.2V6.2c0-.9 1.6-.9 1.6 0v8.2l1.6-2.1c.6-.8 1.9-.2 1.4.8l-2.2 4.4c-.9 1.8-2.4 3-4.4 3h-.6c-2.4 0-4.3-1.9-4.3-4.3v-2.7c0-.9 1.6-.9 1.6 0"/><path d="M15.6 6.5l2-1.6M16.6 9l2.4-.4M17.4 4.6l.6-1.6"/>',
    farm:
      '<path d="M12 21.5v-8.6M12 15.6l-2.4-2.2M12 14.2l2.2-1.8M9.4 21.5h5.2"/><path d="M12 3.2c2.2 0 3.8 1.6 3.6 3.4 1.6.4 2.4 1.9 1.8 3.4-.6 1.5-2.2 2.2-3.6 1.8-.6 1-1.8 1.4-3 1-1.4.5-2.9-.1-3.4-1.4-1.6-.2-2.6-1.7-2.2-3.2.3-1.2 1.4-2 2.6-2 .3-1.8 2.1-3 4.2-3z"/>',
    school:
      '<circle cx="12" cy="4.2" r="1.9"/><path d="M12 7.4l1.5 3.6 4.6.2-3.6 2.8 1.6 6.6L12 17l-4.1 3.6 1.6-6.6-3.6-2.8 4.6-.2z"/>',
    micronation:
      '<path d="M7 21.5V3"/><path d="M7 4h10.8l-2.6 3.8 2.6 3.9H7z"/>',
    producer:
      '<path d="M3.5 19.5c0-8 3.8-12.6 8.5-12.6s8.5 4.6 8.5 12.6z"/><path d="M5.4 13.4h13.2M4.3 16.5h15.4M9 8.6l-.8 2.4M15 8.6l.8 2.4M12 6.9v2.6"/>',
  };
  const NOTE_TONES = ["yellow", "pink", "green"];
  const ADMIN_ZOOM = 5;   // from this zoom on, a country's regions are drawn
  const RIVER_ZOOM = 12;  // rivers appear when you are close
  const ROUTE_ZOOM = 30;  // ways between places (and the reach circle) show from about one region across the screen
  const SPREAD_MAX = 6;   // bigger groups always stay a numbered circle

  // ---------- words, in English and Spanish ----------
  const TEXT = {
    en: {
      tagline: "Conscious spaces around us",
      credits: 'Map: <a href="https://www.naturalearthdata.com">Natural Earth</a>. Towns: <a href="https://www.geonames.org">GeoNames</a> (CC BY 4.0). Ways: <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors.',
      mapLabel: "Hand-drawn world map of conscious places", byType: "Places by type", whereYouAre: "Where you are",
      zoomIn: "Zoom in", zoomOut: "Zoom out", zoomReset: "Zoom out to the whole world",
      world: "World", theWorld: "The world", theWorldIn: "the world", loading: "Loading the map…",
      placesOnMap: (n) => n + (n === 1 ? " place" : " places") + " on the map",
      noPlacesIn: (w) => "No places in " + w + " yet",
      tapPlace: "Tap a place",
      welcome: (n, w) => n + " places in " + w + ". Tap a type in the list to hide or show it, or a neighbouring region to move there.",
      emptyHere: "No places here yet. Brown regions have places; grey ones are still empty.",
      zoomOrTap: "Zoom in or tap a country", worldHint: "Brown areas have places, grey ones are still empty.",
      close: "Close", noDescription: "No description yet.", where: "where", website: "website", contact: "contact", notYet: "not added yet",
      clusterCountry: (n) => n + " places, zoom in", clusterNear: (n) => n + " places close together, zoom in",
      ways: "Transport", car: "Car", bike: "Bike", foot: "Walk",
      byCar: "by car", byBike: "by bike", onFoot: "on foot",
      nearby: (verb) => "Nearby, " + verb, noneNearby: (verb) => "No nearby places to reach " + verb + ".",
      settings: "Settings", language: "Language", showWays: "Show ways up to",
      noLimit: "no limit", km: "km", min: "min", h: "h", done: "Done",
      nearbyTitle: "Nearby", via: (name) => "via " + name, reachNone: "Nothing within reach. Drag the dashed circle to reach further.",
      reachHelp: "Drag the circle to reach further or less far. Tap the label to switch between time and distance.",
      search: "Search places, towns, offers…", searchLabel: "Search", clearSearch: "Clear the search",
      openProfile: "Open the full profile", profileEmpty: "This place hasn't shared more about itself yet.", notOpen: (x) => "not " + x.toLowerCase(),
      sampleNote: "Sample details, made up for testing. They are not real information about this place.",
      offersBy: "Offers", offers: "What they offer", noOffers: "Nothing listed yet.", source: "source", toConfirm: "to be confirmed",
      found: (n, q) => n + (n === 1 ? " place" : " places") + (q ? " for “" + q + "”" : ""), foundNone: (q) => "Nothing found" + (q ? " for “" + q + "”" : "") + ".",
    },
    es: {
      tagline: "Espacios conscientes a nuestro alrededor",
      credits: 'Mapa: <a href="https://www.naturalearthdata.com">Natural Earth</a>. Pueblos: <a href="https://www.geonames.org">GeoNames</a> (CC BY 4.0). Caminos: colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>.',
      mapLabel: "Mapa del mundo dibujado a mano con lugares conscientes", byType: "Lugares por tipo", whereYouAre: "Dónde estás",
      zoomIn: "Acercar", zoomOut: "Alejar", zoomReset: "Ver el mundo entero",
      world: "Mundo", theWorld: "El mundo", theWorldIn: "el mundo", loading: "Cargando el mapa…",
      placesOnMap: (n) => n + (n === 1 ? " lugar" : " lugares") + " en el mapa",
      noPlacesIn: (w) => "Todavía no hay lugares en " + w,
      tapPlace: "Toca un lugar",
      welcome: (n, w) => n + " lugares en " + w + ". Toca un tipo en la lista para ocultarlo o mostrarlo, o una región vecina para ir allí.",
      emptyHere: "Todavía no hay lugares aquí. Las regiones marrones tienen lugares; las grises aún están vacías.",
      zoomOrTap: "Acércate o toca un país", worldHint: "Las zonas marrones tienen lugares, las grises aún están vacías.",
      close: "Cerrar", noDescription: "Aún sin descripción.", where: "dónde", website: "web", contact: "contacto", notYet: "aún no añadido",
      clusterCountry: (n) => n + " lugares, acercar", clusterNear: (n) => n + " lugares muy juntos, acercar",
      ways: "Transporte", car: "Coche", bike: "Bici", foot: "A pie",
      byCar: "en coche", byBike: "en bici", onFoot: "a pie",
      nearby: (verb) => "Cerca, " + verb, noneNearby: (verb) => "No hay lugares cercanos " + verb + ".",
      settings: "Ajustes", language: "Idioma", showWays: "Mostrar caminos hasta",
      noLimit: "sin límite", km: "km", min: "min", h: "h", done: "Listo",
      nearbyTitle: "Cerca", via: (name) => "por " + name, reachNone: "Nada al alcance. Arrastra el círculo discontinuo para llegar más lejos.",
      reachHelp: "Arrastra el círculo para llegar más o menos lejos. Toca la etiqueta para cambiar entre tiempo y distancia.",
      search: "Buscar lugares, pueblos, ofertas…", searchLabel: "Buscar", clearSearch: "Borrar la búsqueda",
      openProfile: "Abrir el perfil completo", profileEmpty: "Este lugar aún no ha compartido más sobre sí mismo.", notOpen: (x) => "no " + x.toLowerCase(),
      sampleNote: "Datos de ejemplo, inventados para probar. No es información real sobre este lugar.",
      offersBy: "Ofrecen", offers: "Qué ofrecen", noOffers: "Aún no hay nada.", source: "fuente", toConfirm: "por confirmar",
      found: (n, q) => n + (n === 1 ? " lugar" : " lugares") + (q ? " para «" + q + "»" : ""), foundNone: (q) => "Nada encontrado" + (q ? " para «" + q + "»" : "") + ".",
    },
  };
  const LIMITS = { car: { def: Infinity, max: 80 }, bike: { def: 60, max: 80 }, foot: { def: 30, max: 50 } };
  const settings = (() => {
    const s = { lang: (navigator.language || "en").toLowerCase().startsWith("es") ? "es" : "en", limit: { car: Infinity, bike: 60, foot: 30 } };
    try {
      const saved = JSON.parse(localStorage.getItem("roots-settings") || "{}");
      if (saved.lang === "en" || saved.lang === "es") s.lang = saved.lang;
      Object.keys(s.limit).forEach((m) => { const v = saved.limit && saved.limit[m]; if (typeof v === "number" || v === null) s.limit[m] = v === null ? Infinity : v; });
    } catch (err) { /* no storage: use the defaults */ }
    return s;
  })();
  function saveSettings() {
    try {
      const limit = {};
      Object.keys(settings.limit).forEach((m) => { limit[m] = settings.limit[m] === Infinity ? null : settings.limit[m]; });
      localStorage.setItem("roots-settings", JSON.stringify({ lang: settings.lang, limit }));
    } catch (err) { /* private window */ }
  }
  const t = (key, ...args) => { const v = TEXT[settings.lang][key]; return typeof v === "function" ? v(...args) : v; };
  const catLabel = (c) => (c ? c["label_" + settings.lang] || c.label_en : "");
  const countryName = (f) => (settings.lang === "es" && f.properties.name_es) || f.properties.name;

  const $ = (id) => document.getElementById(id);
  const svg = $("map");
  const noteEl = $("note");
  const modesEl = $("modes");
  const legendEl = $("legend");
  const listTitleEl = $("list-title");
  const crumbsEl = $("crumbs");
  const mapTitleEl = $("map-title");

  const state = {
    places: [], categories: [], catById: {}, notYetPlaced: [],
    countries: null, lakes: null, rivers: null, riversLoading: null, cities: [], citiesLoading: null, admin1Index: {},
    admin1: {},            // ISO3 -> FeatureCollection (loaded)
    admin1Loading: {},     // ISO3 -> Promise
    regionById: {},        // region id -> feature
    countryById: {},       // ISO3 -> feature
    dataCountries: new Set(),
    dataRegions: new Set(),
    focusCountry: null,    // ISO3
    focusRegion: null,     // region id
    selectedId: null,
    hidden: new Set(),
    placeById: {},
    connections: null,
    // how far the reach circle goes, per way of travelling: by time (minutes) or distance (km);
    // value null = just far enough to take in the selected place's direct connections
    reach: { car: { kind: "time", value: null }, bike: { kind: "time", value: null }, foot: { kind: "time", value: null } },
    mode: (() => { try { const m = localStorage.getItem("roots-mode"); return m === "off" ? null : m || "bike"; } catch (err) { return "bike"; } })(),
    query: "", offerKind: null, offerKinds: [], offerKindById: {}, // the search box and the offer chip picked under it
    hiddenPlace(p) { return p.categories.every((c) => this.hidden.has(c)) || !matchesSearch(p); },
  };

  let W = 900, H = 600, projection, path, zoom, transform = d3.zoomIdentity;
  let layers = {};
  let moving = false;

  // ---------- helpers ----------
  function el(name, attrs, parent) {
    const n = document.createElementNS(SVG_NS, name);
    for (const k in attrs || {}) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const iconSvg = (cat, size) => '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" aria-hidden="true"><g class="icon">' + (ICONS[cat] || ICONS["friendly-house"]) + "</g></svg>";
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const narrow = () => matchMedia("(max-width: 760px)").matches;
  const lnglat = (p) => [p.location.lng, p.location.lat];
  // d3 reads a polygon wound the "wrong" way as the whole globe minus that shape; flip those back
  function rewind(fc) {
    fc.features.forEach((f) => {
      if (!f.geometry) return;
      if (d3.geoArea(f) > 2 * Math.PI) {
        const flip = (poly) => poly.map((ring) => ring.slice().reverse());
        if (f.geometry.type === "Polygon") f.geometry.coordinates = flip(f.geometry.coordinates);
        else if (f.geometry.type === "MultiPolygon") f.geometry.coordinates = f.geometry.coordinates.map(flip);
      }
    });
    return fc;
  }
  // the biggest piece of a country, so "zoom to the Netherlands" skips the Caribbean islands
  function mainPart(f) {
    if (!f.geometry || f.geometry.type !== "MultiPolygon") return f;
    if (!f._main) {
      let best = null, area = -1;
      f.geometry.coordinates.forEach((poly) => {
        const g = { type: "Polygon", coordinates: poly };
        const a = d3.geoArea(g);
        if (a > area) { area = a; best = g; }
      });
      f._main = { type: "Feature", properties: f.properties, geometry: best };
    }
    return f._main;
  }
  const getJSON = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(url + " (" + r.status + ")"); return r.json(); });

  const measureCtx = document.createElement("canvas").getContext("2d");
  function textWidth(text, font) {
    measureCtx.font = font;
    return measureCtx.measureText(text).width;
  }

  // ---------- which places are where ----------
  function locatePlaces() {
    state.dataCountries.clear();
    state.dataRegions.clear();
    state.places.forEach((p) => {
      if (!p.location) return;
      const pt = lnglat(p);
      if (!p._country) {
        const c = state.countries.features.find((f) => d3.geoContains(f, pt));
        p._country = c ? c.properties.a3 : null;
      }
      if (p._country) state.dataCountries.add(p._country);
      const fc = p._country && state.admin1[p._country];
      if (fc && !p._region) {
        const r = fc.features.find((f) => d3.geoContains(f, pt));
        p._region = r ? r.properties.id : null;
      }
      if (p._region) state.dataRegions.add(p._region);
    });
  }

  function loadAdmin1(a3) {
    if (state.admin1[a3]) return Promise.resolve(state.admin1[a3]);
    if (!state.admin1Index[a3]) return Promise.resolve(null);
    if (!state.admin1Loading[a3]) {
      state.admin1Loading[a3] = getJSON("data/admin1/" + a3 + ".json").then(rewind).then((fc) => {
        if (fc.land) fc.landFeature = rewind({ features: [{ type: "Feature", geometry: fc.land }] }).features[0];
        state.admin1[a3] = fc;
        fc.features.forEach((f) => { state.regionById[f.properties.id] = f; });
        locatePlaces();
        buildGeo();
        return fc;
      }).catch(() => null);
    }
    return state.admin1Loading[a3];
  }

  // ---------- map drawing ----------
  function setupSvg() {
    svg.innerHTML = "";
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    const defs = el("defs", {}, svg);
    [["ink-a", 7, 2.4], ["ink-b", 23, 3.2], ["ink-fine", 11, 1.1]].forEach(([id, seed, scale]) => {
      // filter area = the visible page only; with a zoomed-in world the default area is enormous and slow
      const f = el("filter", { id, filterUnits: "userSpaceOnUse", x: -20, y: -20, width: W + 40, height: H + 40 }, defs);
      el("feTurbulence", { type: "fractalNoise", baseFrequency: "0.045", numOctaves: "2", seed, result: "n" }, f);
      el("feDisplacementMap", { in: "SourceGraphic", in2: "n", scale, xChannelSelector: "R", yChannelSelector: "G" }, f);
    });
    const pat = el("pattern", { id: "hatch", width: "7", height: "7", patternUnits: "userSpaceOnUse", patternTransform: "rotate(35)" }, defs);
    el("line", { x1: 0, y1: 0, x2: 0, y2: 7, stroke: "#1b1a17", "stroke-width": ".7", opacity: ".4" }, pat);

    el("rect", { class: "sea", x: 0, y: 0, width: W, height: H }, svg);
    el("rect", { class: "water-hatch", x: 0, y: 0, width: W, height: H }, svg);
    // Fills move with the zoom; pen lines sit inside an unscaled wrapper so the wobble keeps its size.
    layers.fills = el("g", {}, svg);
    const a = el("g", { filter: "url(#ink-a)" }, svg);
    layers.linesA = el("g", {}, a);
    const b = el("g", { filter: "url(#ink-b)" }, svg);
    layers.linesB = el("g", {}, b);
    const r = el("g", { filter: "url(#ink-fine)" }, svg);
    layers.routes = el("g", { class: "routes" }, r);
    layers.marks = el("g", { filter: "url(#ink-fine)" }, svg);
  }

  function areaClass(base, id, hasData, focus) {
    return base + (hasData ? " has-data" : "") + (focus ? " focus" : "");
  }

  function buildGeo() {
    if (!projection) return;
    const ns = { "vector-effect": "non-scaling-stroke" };
    const { fills, linesA, linesB } = layers;
    fills.innerHTML = linesA.innerHTML = linesB.innerHTML = "";

    // Zoomed in, a country whose detail is loaded is drawn from it (1:10m), and the countries in
    // view are loaded too, so neighbours keep sharing one border line that follows the regions.
    detailShown = transform.k >= ADMIN_ZOOM;
    state.countries.features.forEach((f) => {
      const a3 = f.properties.a3;
      const fc = state.admin1[a3];
      const d = path(detailShown && fc && fc.landFeature ? fc.landFeature : f);
      if (!d) return;
      el("path", { d, class: areaClass("area country", a3, state.dataCountries.has(a3), false), "data-country": a3 }, fills);
      // countries are simplified together, so a border shared by two neighbours is the very same
      // line in both and the two strokes land exactly on top of each other: one pen line
      el("path", Object.assign({ d, class: "country-line" }, ns), linesA);
    });

    // regions are drawn for the country in focus and the countries with places; neighbours loaded
    // only for their border stay one plain country
    Object.values(state.admin1).forEach((fc) => {
      if (fc.country !== state.focusCountry && !state.dataCountries.has(fc.country)) return;
      fc.features.forEach((f) => {
        const id = f.properties.id;
        const d = path(f);
        if (!d) return;
        el("path", { d, class: areaClass("area region", id, state.dataRegions.has(id), id === state.focusRegion), "data-region": id, "data-country": f.properties.country }, fills);
      });
      // the borders between regions, each drawn once, light and dashed; islands too small for the
      // world map get their coast from here
      if (fc.borders) el("path", Object.assign({ d: path(fc.borders), class: "region-line" }, ns), linesB);
      if (fc.coast) el("path", Object.assign({ d: path(fc.coast), class: "country-line" }, ns), linesA);
    });

    state.lakes.features.forEach((f) => {
      const d = path(f);
      if (!d) return;
      el("path", { d, class: "water" }, fills);
      el("path", { d, class: "water-hatch" }, fills);
      el("path", Object.assign({ d, class: "lake-line" }, ns), linesA);
    });

    layers.rivers = el("g", { class: "rivers" }, linesA);
    const fb = state.focusCountry && state.admin1Index[state.focusCountry];
    if (state.rivers && fb) {
      const [x0, y0, x1, y1] = [fb[0] - 1, fb[1] - 1, fb[2] + 1, fb[3] + 1];
      state.rivers.features.forEach((f) => {
        if (!f._bb) { const b = d3.geoBounds(f); f._bb = [b[0][0], b[0][1], b[1][0], b[1][1]]; }
        if (f._bb[2] < x0 || f._bb[0] > x1 || f._bb[3] < y0 || f._bb[1] > y1) return;
        const d = path(f);
        if (d) el("path", Object.assign({ d, class: "river" }, ns), layers.rivers);
      });
    }

    const focus = state.focusRegion && state.regionById[state.focusRegion];
    if (focus) {
      const d = path(focus);
      el("path", Object.assign({ d, class: "focus-line" }, ns), linesA);
    }
    applyTransform();
  }

  function applyTransform() {
    const t = transform.toString();
    layers.fills.setAttribute("transform", t);
    layers.linesA.setAttribute("transform", t);
    layers.linesB.setAttribute("transform", t);
    layers.routes.setAttribute("transform", t);
    if (layers.rivers) layers.rivers.style.display = transform.k >= RIVER_ZOOM ? "" : "none";
    // zoomed further out the ways would only be a tangle, so they fade away
    layers.routes.parentNode.classList.toggle("ways-hidden", transform.k < ROUTE_ZOOM);
    scheduleMarks();
  }

  // ---------- connections: a graph of places, each edge following the real way there ----------
  const MODES = {
    car: { get label() { return t("car"); }, get verb() { return t("byCar"); } },
    bike: { get label() { return t("bike"); }, get verb() { return t("byBike"); } },
    foot: { get label() { return t("foot"); }, get verb() { return t("onFoot"); } },
  };
  const MODE_ICONS = {
    car: '<path d="M3 15.5v-3l2.2-4.3h10l3.8 4.3H21v3"/><path d="M5.6 12.2h13.2"/><circle cx="7.5" cy="16" r="1.9"/><circle cx="16.8" cy="16" r="1.9"/>',
    bike: '<circle cx="6" cy="15.5" r="3.6"/><circle cx="18" cy="15.5" r="3.6"/><path d="M6 15.5l4-6.5h6l2 6.5M10 9l2.6 6.5H6M14.5 6.5h2.5"/>',
    foot: '<circle cx="12.5" cy="4.6" r="1.8"/><path d="M12 7.5l-1.5 6 3.3 3 .9 5M10.5 13.5l-2.4 3.4-1.4 4.6M11.5 9l-3.3 2.3M12.4 9l3.3 2.4 2.1-.4"/>',
  };
  function fmtTime(min) {
    if (min < 60) return min + " " + t("min");
    const h = Math.floor(min / 60), m = min % 60;
    return h + " " + t("h") + (m ? " " + m : "");
  }
  // a way is shown when its route is no longer than the limit set for that mode
  function routeOf(e, mode) { return mode && e[mode] && e[mode].km <= settings.limit[mode] ? e[mode] : null; }
  // the way, from the place itself to the place itself (routes start on the nearest road)
  function routeCoords(e, r) {
    const a = state.placeById[e.a], b = state.placeById[e.b];
    return [lnglat(a)].concat(r.path, [lnglat(b)]);
  }
  function drawRoutes() {
    const g = layers.routes;
    if (!g) return;
    g.innerHTML = "";
    const mode = state.mode, data = state.connections;
    g.setAttribute("class", "routes " + (mode || "") + (state.selectedId ? " has-selection" : ""));
    if (!mode || !data) return;
    const ns = { "vector-effect": "non-scaling-stroke" };
    const reach = currentReach();
    data.edges.forEach((e) => {
      const r = routeOf(e, mode);
      const a = state.placeById[e.a], b = state.placeById[e.b];
      if (!r || !a || !b || !a.location || !b.location) return;
      if (state.hiddenPlace(a) || state.hiddenPlace(b)) return;
      const d = path({ type: "LineString", coordinates: routeCoords(e, r) });
      if (!d) return;
      const lit = reach ? [e.a, e.b].some((id) => reach.has(id) && reach.get(id).e === e)
        : state.selectedId && (e.a === state.selectedId || e.b === state.selectedId);
      const grp = el("g", { class: "route" + (lit ? " lit" : "") }, g);
      el("path", Object.assign({ d, class: "route-line" }, ns), grp);
      el("path", Object.assign({ d, class: "route-hit" }, ns), grp);
      grp.dataset.tip = JSON.stringify([a.name, b.name, fmtTime(r.min), r.km + " " + t("km")]);
    });
  }
  // Everything reachable from one place within a time or a distance, also through other places
  // (Dijkstra over the connections). Returns id -> { min, km, prev, e } for each place in reach.
  function reachFrom(id, mode, kind, limit) {
    const w = (r) => (kind === "time" ? r.min : r.km);
    const best = new Map([[id, { min: 0, km: 0, prev: null, e: null }]]);
    const todo = [id], done = new Set();
    while (todo.length) {
      todo.sort((a, b) => w(best.get(a)) - w(best.get(b)));
      const cur = todo.shift();
      if (done.has(cur)) continue;
      done.add(cur);
      state.connections.edges.forEach((e) => {
        if (e.a !== cur && e.b !== cur) return;
        const r = routeOf(e, mode);
        if (!r) return;
        const other = e.a === cur ? e.b : e.a, p = state.placeById[other];
        if (!p || state.hiddenPlace(p)) return;
        const here = best.get(cur), next = { min: here.min + r.min, km: Math.round((here.km + r.km) * 10) / 10, prev: cur, e };
        if (w(next) > limit) return;
        if (!best.has(other) || w(next) < w(best.get(other))) { best.set(other, next); todo.push(other); }
      });
    }
    return best;
  }
  // the default reach: a usual trip for this way of travelling (car 30 min, bike or walk 1 h),
  // or just far enough for the nearest connection when nothing is that close
  const REACH_DEFAULT = { car: { time: 30, distance: 25 }, bike: { time: 60, distance: 15 }, foot: { time: 60, distance: 5 } };
  function defaultReach(id, mode, kind) {
    const cs = connectionsOf(id, mode), base = REACH_DEFAULT[mode][kind];
    if (!cs.length) return base;
    const near = Math.min(...cs.map((c) => (kind === "time" ? c.r.min : c.r.km)));
    return Math.max(base, kind === "time" ? Math.ceil(near / 5) * 5 : Math.ceil(near));
  }
  function reachSetting() {
    if (!state.selectedId || !state.mode || !state.connections) return null;
    const pref = state.reach[state.mode];
    return { kind: pref.kind, value: pref.value != null ? pref.value : defaultReach(state.selectedId, state.mode, pref.kind) };
  }
  function currentReach() {
    const r = reachSetting();
    return r && reachFrom(state.selectedId, state.mode, r.kind, r.value);
  }
  // The circle is drawn as the crow flies, sized by how this mode's real routes usually go here:
  // the typical straight-line km covered per minute, and how much longer a route usually is than
  // the straight line. So places in reach sit near or inside the circle, and its edge is where a
  // typical trip of that time or distance ends.
  const median = (xs) => { const v = xs.slice().sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 0; };
  const routeStats = {};
  function statsFor(mode) {
    if (routeStats[mode]) return routeStats[mode];
    const es = state.connections.edges.filter((e) => e[mode] && e[mode].min && e.straight_km > 0.5);
    return (routeStats[mode] = {
      crowPerMin: median(es.map((e) => e.straight_km / e[mode].min)) || 0.2,
      detour: median(es.map((e) => e[mode].km / e.straight_km)) || 1.3,
    });
  }
  const crowSpeed = (mode) => statsFor(mode).crowPerMin;
  const fmtReach = (r) => (r.kind === "time" ? fmtTime(r.value) : r.value + " " + t("km"));

  function connectionsOf(id, mode) {
    if (!state.connections || !mode) return [];
    return state.connections.edges
      .filter((e) => (e.a === id || e.b === id) && routeOf(e, mode))
      .map((e) => ({ other: state.placeById[e.a === id ? e.b : e.a], r: routeOf(e, mode), e }))
      .filter((c) => c.other)
      .sort((u, v) => u.r.min - v.r.min);
  }
  function setMode(mode) {
    state.mode = mode;
    try { localStorage.setItem("roots-mode", mode || "off"); } catch (err) { /* private window */ }
    modesEl.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
    drawRoutes();
    scheduleMarks();
    const p = state.selectedId && state.placeById[state.selectedId];
    if (p) showPlace(p);
  }
  function renderModes() {
    modesEl.setAttribute("aria-label", t("ways"));
    modesEl.innerHTML = '<span class="modes-title">' + t("ways") + '</span><span class="modes-row">' + Object.entries(MODES).map(([m, v]) =>
      '<button type="button" data-mode="' + m + '" aria-pressed="' + (state.mode === m) + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true" class="mode-icon">' + MODE_ICONS[m] + "</svg>" +
      '<svg viewBox="0 0 30 8" aria-hidden="true" class="swatch ' + m + '"><path d="M1 4.5 Q 8 1.5 15 4 T 29 3.5"/></svg>' +
      "<span>" + v.label + "</span></button>").join("") + "</span>";
    modesEl.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => setMode(state.mode === b.dataset.mode ? null : b.dataset.mode)));
    panelBoxes = null;
  }

  // ---------- settings: language and how far each way of travelling is shown ----------
  const settingsBtn = $("settings-btn"), settingsEl = $("settings");
  function applyStaticText() {
    document.documentElement.lang = settings.lang;
    document.querySelectorAll("[data-t]").forEach((n) => { n.innerHTML = t(n.dataset.t); });
    document.querySelectorAll("[data-t-label]").forEach((n) => n.setAttribute("aria-label", t(n.dataset.tLabel)));
    settingsBtn.setAttribute("aria-label", t("settings"));
    settingsBtn.title = t("settings");
  }
  const limitText = (m) => (settings.limit[m] === Infinity ? t("noLimit") : settings.limit[m] + " " + t("km"));
  function renderSettings() {
    settingsEl.innerHTML =
      '<h2 class="settings-title">' + t("settings") + "</h2>" +
      '<fieldset class="settings-lang"><legend>' + t("language") + "</legend>" +
      [["en", "English"], ["es", "Español"]].map(([code, name]) =>
        '<button type="button" data-lang="' + code + '" aria-pressed="' + (settings.lang === code) + '">' + name + "</button>").join("") +
      "</fieldset>" +
      '<fieldset class="settings-limits"><legend>' + t("showWays") + "</legend>" +
      Object.keys(LIMITS).map((m) => {
        const L = LIMITS[m], none = L.def === Infinity;
        // the car slider's last step means "no limit"
        const top = none ? L.max + 5 : L.max, v = settings.limit[m] === Infinity ? top : settings.limit[m];
        return '<label class="limit-row"><svg viewBox="0 0 24 24" aria-hidden="true" class="mode-icon">' + MODE_ICONS[m] + "</svg>" +
          '<span class="limit-name">' + MODES[m].label + "</span>" +
          '<input type="range" min="' + (m === "foot" ? 2 : 5) + '" max="' + top + '" step="1" value="' + v + '" data-limit="' + m + '"' + (none ? ' data-open="' + top + '"' : "") + ">" +
          '<output class="limit-value ' + m + '">' + limitText(m) + "</output></label>";
      }).join("") +
      "</fieldset>" +
      '<button type="button" class="settings-done">' + t("done") + "</button>";
    settingsEl.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => {
      settings.lang = b.dataset.lang;
      saveSettings();
      refreshAll();
      renderSettings();
      settingsEl.querySelector('[data-lang="' + settings.lang + '"]').focus();
    }));
    settingsEl.querySelectorAll("[data-limit]").forEach((inp) => inp.addEventListener("input", () => {
      const m = inp.dataset.limit, v = +inp.value;
      settings.limit[m] = inp.dataset.open && v >= +inp.dataset.open ? Infinity : v;
      inp.nextElementSibling.textContent = limitText(m);
      saveSettings();
      drawRoutes();
      scheduleMarks();
      const p = state.selectedId && state.placeById[state.selectedId];
      if (p) showPlace(p);
    }));
    settingsEl.querySelector(".settings-done").addEventListener("click", () => toggleSettings(false));
  }
  function toggleSettings(open) {
    const show = open === undefined ? settingsEl.hidden : open;
    settingsEl.hidden = !show;
    settingsBtn.setAttribute("aria-expanded", String(show));
    if (show) { renderSettings(); settingsEl.querySelector("button").focus(); } else settingsBtn.focus();
  }
  settingsBtn.addEventListener("click", () => toggleSettings());
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !settingsEl.hidden) toggleSettings(false); });
  document.addEventListener("pointerdown", (ev) => {
    if (!settingsEl.hidden && !settingsEl.contains(ev.target) && !settingsBtn.contains(ev.target)) toggleSettings(false);
  });
  // after a language change, every piece of text is written again
  function refreshAll() {
    applyStaticText();
    renderSearch();
    renderModes();
    renderHeading();
    renderList();
    drawRoutes();
    const p = state.selectedId && state.placeById[state.selectedId];
    if (p) showPlace(p); else showWelcome();
    scheduleMarks();
  }

  // ---------- hovering a way: a small tag in the name-tag style, following the pointer ----------
  const tipEl = document.createElement("div");
  tipEl.className = "route-tip";
  tipEl.hidden = true;
  svg.parentNode.appendChild(tipEl);
  svg.addEventListener("pointermove", (ev) => {
    const r = !moving && ev.target.closest && ev.target.closest(".route");
    if (!r || !r.dataset.tip) { tipEl.hidden = true; return; }
    const [a, b, time, km] = JSON.parse(r.dataset.tip);
    tipEl.className = "route-tip " + state.mode;
    tipEl.innerHTML = '<span class="tip-names"><b>' + esc(a) + "</b> – <b>" + esc(b) + '</b></span><span class="tip-row"><svg viewBox="0 0 30 8" aria-hidden="true" class="swatch ' + state.mode + '"><path d="M1 4.5 Q 8 1.5 15 4 T 29 3.5"/></svg>' + esc(time) + " · " + esc(km) + "</span>";
    tipEl.hidden = false;
    const box = svg.parentNode.getBoundingClientRect(), w = tipEl.offsetWidth;
    let x = ev.clientX - box.left + 14, y = ev.clientY - box.top + 16;
    if (x + w > box.width - 8) x = ev.clientX - box.left - w - 14;
    tipEl.style.left = x + "px";
    tipEl.style.top = y + "px";
  });
  svg.addEventListener("pointerleave", () => { tipEl.hidden = true; });

  // ---------- the reach circle ----------
  // screen pixels per km around a place, at the current zoom
  function pxPerKm(p) {
    const [x, y] = projection(lnglat(p)), [, y2] = projection([p.location.lng, p.location.lat + 1 / 111.2]);
    return Math.abs(y2 - y) * transform.k;
  }
  function reachRadiusKm(r) { return r.kind === "time" ? r.value * crowSpeed(state.mode) : r.value / statsFor(state.mode).detour; }
  // from a radius on the map back to a time or distance
  function reachFromRadius(km, kind) {
    return kind === "time" ? Math.max(5, Math.round(km / crowSpeed(state.mode) / 5) * 5) : Math.max(1, Math.round(km * statsFor(state.mode).detour));
  }
  let reachDrag = null;
  function drawReachCircle(g, r, boxes) {
    const p = state.placeById[state.selectedId];
    const [cx, cy] = transform.apply(projection(lnglat(p)));
    const rad = Math.max(14, reachRadiusKm(r) * pxPerKm(p));
    const grp = el("g", { class: "reach " + state.mode }, null);
    g.insertBefore(grp, g.firstChild); // under the icons
    el("circle", { class: "reach-fill", cx, cy, r: rad }, grp);
    el("circle", { class: "reach-line", cx, cy, r: rad }, grp);
    const edge = el("circle", { class: "reach-edge", cx, cy, r: rad, tabindex: "0", role: "slider",
      "aria-label": t("reachHelp"), "aria-valuetext": fmtReach(r) }, grp);
    // a little knob on the circle, bottom right, shows where to grab it (the whole edge works too)
    const ka = Math.PI / 4, kx = cx + Math.cos(ka) * rad, ky = cy + Math.sin(ka) * rad;
    const knob = el("g", { class: "reach-knob" }, g);
    el("circle", { cx: kx, cy: ky, r: 7 }, knob);
    el("path", { d: "M" + (kx - 3) + " " + (ky - 3) + "l6 6m-6 -2.5v2.5h2.5m3.5 -6h-2.5m2.5 0v2.5" }, knob);
    // the value sits on the circle, top left, written like a name tag; tap it to switch time / distance.
    // When the circle grows past the edge of the map or under the note, the tag slides along the
    // circle to the nearest spot that is still in view.
    const label = fmtReach(r), tw = textWidth(label, "700 12px Kalam, cursive") + 46;
    const tagAt = (ang) => {
      const px = cx + Math.cos(ang) * rad, py = cy + Math.sin(ang) * rad;
      return { lx: px - tw + 4, ly: py }; // the tag's right end touches the circle
    };
    // the note's real size (it grows with the place's details), in map coordinates
    const M = svg.getScreenCTM(), nr = document.getElementById("note").getBoundingClientRect();
    const noteBox = M && nr.width ? { x: (nr.left - M.e) / M.a - 6, y: (nr.top - M.f) / M.d - 6, w: nr.width / M.a + 12, h: nr.height / M.d + 12 } : null;
    const free = ({ lx, ly }) => {
      const b = { x: lx - 4, y: ly - 10, w: tw, h: 20 };
      if (noteBox && b.x < noteBox.x + noteBox.w && b.x + b.w > noteBox.x && b.y < noteBox.y + noteBox.h && b.y + b.h > noteBox.y) return false;
      return b.x > 6 && b.y > 6 && b.x + b.w < W - 6 && b.y + b.h < H - 6 &&
        !boxes.some((o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
    };
    let spot = null;
    for (let s = 0; s <= 36 && !spot; s++) {
      for (const sign of s ? [1, -1] : [1]) {
        const q = tagAt(-0.75 * Math.PI + sign * s * Math.PI / 36);
        if (free(q)) { spot = q; break; }
      }
    }
    // nowhere on the circle is in view (zoomed right in): keep it inside the map, near the top left
    if (!spot) { const q = tagAt(-0.75 * Math.PI); spot = { lx: Math.min(Math.max(q.lx, 10), W - tw - 6), ly: Math.min(Math.max(q.ly, 110), H - 70) }; }
    const { lx, ly } = spot;
    boxes.push({ x: lx - 4, y: ly - 10, width: tw, w: tw, h: 20 });
    const tag = el("g", { class: "reach-tag " + state.mode, tabindex: "0", role: "button", "aria-label": label + ". " + t("reachHelp") }, g);
    el("rect", { x: lx - 4, y: ly - 10, width: tw, height: 20, rx: 3 }, tag);
    el("path", { class: "sample", d: "M" + lx + " " + (ly + 1) + "q4 -3 8 0t8 -.5" }, tag);
    el("text", { x: lx + 21, y: ly + 4 }, tag).textContent = label;
    el("path", { class: "swap", d: "M" + (lx + tw - 13) + " " + (ly - 3) + "h7m-2 -2.5l2 2.5-2 2.5M" + (lx + tw - 6) + " " + (ly + 3) + "h-7m2 -2.5l-2 2.5 2 2.5" }, tag);
    const toggle = () => {
      const pref = state.reach[state.mode], cur = reachSetting();
      // keep roughly the same reach when switching: convert at this mode's straight-line speed
      const km = reachRadiusKm(cur);
      pref.kind = pref.kind === "time" ? "distance" : "time";
      pref.value = reachFromRadius(km, pref.kind);
      reachChanged();
    };
    tag.addEventListener("click", toggle);
    tag.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(); } });
    edge.addEventListener("keydown", (ev) => {
      const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[ev.key];
      if (!step) return;
      ev.preventDefault();
      const cur = reachSetting(), pref = state.reach[state.mode];
      pref.value = Math.max(cur.kind === "time" ? 5 : 1, cur.value + step * (cur.kind === "time" ? 5 : 1));
      reachChanged();
    });
    d3.selectAll([edge, knob]).call(d3.drag()
      .on("start", () => { reachDrag = { cx, cy, p }; svg.classList.add("dragging-reach"); })
      .on("drag", (ev) => {
        const [mx, my] = d3.pointer(ev.sourceEvent, svg);
        const km = Math.hypot(mx - reachDrag.cx, my - reachDrag.cy) / pxPerKm(reachDrag.p);
        const pref = state.reach[state.mode];
        pref.value = reachFromRadius(km, pref.kind);
        reachChanged(true);
      })
      .on("end", () => { reachDrag = null; svg.classList.remove("dragging-reach"); reachChanged(); }));
  }
  let notePending = 0;
  function reachChanged(dragging) {
    drawRoutes();
    scheduleMarks();
    // the note is rewritten at most a few times a second while dragging
    clearTimeout(notePending);
    const p = state.placeById[state.selectedId];
    if (p) notePending = setTimeout(() => showPlace(p), dragging ? 120 : 0);
  }

  // ---------- labels and icons, placed so nothing overlaps ----------
  let marksQueued = false;
  function scheduleMarks() {
    if (marksQueued) return;
    marksQueued = true;
    requestAnimationFrame(() => { marksQueued = false; drawMarks(); });
  }

  const GLIDE = 320; // ms
  let anims = [], prevClusters = new Map(), animFrame = 0, lastK = 0;
  function animate(now) {
    cancelAnimationFrame(animFrame);
    let busy = false;
    anims.forEach((a) => {
      const u = Math.min(1, (now - a.t0) / GLIDE), e = 1 - Math.pow(1 - u, 3);
      if (u < 1) busy = true;
      a.vx = a.sx + (a.dx - a.sx) * e; a.vy = a.sy + (a.dy - a.sy) * e;
      a.body.setAttribute("transform", "translate(" + (a.vx - a.dx) + " " + (a.vy - a.dy) + ")");
      const reach = Math.hypot(a.vx / (a.w / 2), a.vy / (a.h * 0.45)); // ellipse hugging the drawing
      const show = reach > 1.15;
      a.leader.style.display = a.spot.style.display = show ? "" : "none";
      if (show) {
        const cx = a.x0 + a.vx, cy = a.y0 + a.vy;
        a.leader.setAttribute("d", "M" + a.x0 + " " + a.y0 + "L" + (cx - a.vx / reach) + " " + (cy - a.vy / reach));
      }
      if (a.ghost) {
        const f = Math.min(1, (now - a.f0) / GLIDE);
        a.grp.style.opacity = 1 - f;
        if (f >= 1) a.grp.remove(); else busy = true;
      }
    });
    if (busy) animFrame = requestAnimationFrame(animate);
  }

  // where the swatch and zoom buttons sit on the map, measured once per layout (not every frame)
  let panelBoxes = null;
  function measurePanels() {
    panelBoxes = [];
    const M = svg.getScreenCTM();
    if (M) [modesEl, document.querySelector(".zoom")].forEach((n) => {
      const r = n && n.getBoundingClientRect();
      if (r && r.width) panelBoxes.push({ x: (r.left - M.e) / M.a - 4, y: (r.top - M.f) / M.d - 4, w: r.width / M.a + 8, h: r.height / M.d + 8 });
    });
  }

  function drawMarks() {
    const g = layers.marks;
    g.innerHTML = "";
    const k = transform.k;
    const boxes = [];
    const pad = 3;
    const hits = (b) => boxes.some((o) => b.x < o.x + o.w + pad && b.x + b.w + pad > o.x && b.y < o.y + o.h + pad && b.y + b.h + pad > o.y);
    const inView = (x, y, m) => x > -m && x < W + m && y > -m && y < H + m;
    // keep the heading (top-left) and the note (top-right) clear
    if (!narrow()) {
      // the note's real size (it grows with the place's details), or a guess before it is drawn
      const M = svg.getScreenCTM(), nr = noteEl.getBoundingClientRect();
      boxes.push(M && nr.width && nr.left - M.e < W ? { x: (nr.left - M.e) / M.a - 6, y: 0, w: W, h: (nr.bottom - M.f) / M.d + 6 }
        : { x: W - Math.min(330, W * 0.36), y: 0, w: W, h: Math.min(170, H * 0.3) });
    }
    boxes.push({ x: 0, y: 0, w: Math.min(W * 0.55, 440), h: 96 });
    // and the swatch and zoom buttons along the bottom
    if (!panelBoxes) measurePanels();
    panelBoxes.forEach((b) => boxes.push(b));
    // a place under the swatch or the zoom buttons is treated like one just off the edge of the map
    const underPanel = (x, y) => panelBoxes.some((b) => x > b.x - 6 && x < b.x + b.w + 6 && y > b.y - 6 && y < b.y + b.h + 6);

    const visible = state.places.filter((p) => p.location && !state.hiddenPlace(p));

    // 0. zoomed far out: one circled count per country instead of every icon
    if (k < ADMIN_ZOOM) {
      const groups = {};
      visible.forEach((p) => { (groups[p._country || "?"] = groups[p._country || "?"] || []).push(p); });
      Object.entries(groups).forEach(([a3, ps]) => {
        const pts = ps.map((p) => transform.apply(projection(lnglat(p))));
        const x = d3.mean(pts, (q) => q[0]), y = d3.mean(pts, (q) => q[1]);
        if (!inView(x, y, 20)) return;
        const r = 11 + Math.min(10, Math.sqrt(ps.length) * 2);
        const grp = el("g", { class: "cluster", tabindex: "0", role: "button", "data-country": a3, "aria-label": t("clusterCountry", ps.length) }, g);
        el("circle", { cx: x, cy: y, r }, grp);
        el("circle", { class: "ring", cx: x + 1, cy: y - 1, r: r + 2.5 }, grp);
        el("text", { x, y: y + 5, "text-anchor": "middle" }, grp).textContent = ps.length;
        boxes.push({ x: x - r - 3, y: y - r - 3, w: 2 * r + 6, h: 2 * r + 6 });
      });
    }

    // 0b. towns of the focused country: regional and national capitals get a circled dot, other
    //     big towns a plain circle. Their dots are reserved before the icons are laid out, so a
    //     place never hides a town; the names are added at the end where they fit.
    const towns = [];
    const spots = k >= ADMIN_ZOOM ? visible.map((p) => transform.apply(projection(lnglat(p)))) : [];
    const nearSpot = (bx) => spots.some(([x, y]) => x > bx.x - 8 && x < bx.x + bx.w + 8 && y > bx.y - 8 && y < bx.y + bx.h + 8);
    if (k >= ADMIN_ZOOM) {
      const minPop = k > 60 ? 100000 : k > 25 ? 250000 : k > 10 ? 500000 : 1500000;
      for (const row of state.cities) {
        if (towns.length >= 40) break;
        const [name, lng, lat, pop, rank, a3] = row;
        if (state.focusCountry && a3 !== state.focusCountry) continue;
        if (!(rank === 2 || (rank === 1 && k > 8) || pop >= minPop)) continue;
        const [x, y] = transform.apply(projection([lng, lat]));
        if (!inView(x, y, -10)) continue;
        const r = rank === 2 ? 4.5 : pop > 200000 ? 3.6 : 3;
        const dot = { x: x - r, y: y - r, w: r * 2, h: r * 2 };
        if (hits(dot)) continue;
        const t = { name, x, y, r, capital: rank === 2 };
        if (t.capital) {
          // capitals keep their name too: reserve the first free spot for it now
          const tw = textWidth(name.toUpperCase(), "400 11px Kalam, cursive") * 1.08;
          const cands = [{ x: x + r + 3, y: y - 13 }, { x: x - r - 3 - tw, y: y - 13 }, { x: x + r + 3, y: y + 2 }, { x: x - r - 3 - tw, y: y + 2 },
            { x: x - tw / 2, y: y - r - 15 }, { x: x - tw / 2, y: y + r + 3 }, { x: x + r + 3, y: y - 6 }, { x: x - r - 3 - tw, y: y - 6 }]
            .map((c) => ({ x: c.x, y: c.y, w: tw, h: 12 }));
          // prefer a spot away from places (so no pen line has to cross the name), but always show it
          t.lb = cands.find((bx) => !hits(bx) && !nearSpot(bx)) || cands.find((bx) => !hits(bx));
          if (!t.lb) continue;
          boxes.push(t.lb);
        }
        boxes.push(dot);
        towns.push(t);
      }
    }

    // 1. places that crowd the same spot on screen are grouped (single linkage: a place joins a
    //    group when it is within `reach` of any member; screen distances only grow as you zoom in,
    //    so groups only ever split). Then every icon is laid out with an anchored force layout:
    //    each icon is pulled towards its real spot and pushed away from other icons, starting from
    //    where it was last shown. A group whose icons would end up far from their spots, or whose
    //    pen lines would cross another icon, is drawn as a numbered circle instead.
    const size = Math.max(18, Math.min(28, 14 + Math.log2(k) * 2));
    const MAX_SHIFT = size * 2;
    const pts = [];
    const clusterPos = new Map();
    if (k >= ADMIN_ZOOM) visible.forEach((p) => {
      const [x0, y0] = transform.apply(projection(lnglat(p)));
      if (inView(x0, y0, 40) && !underPanel(x0, y0)) pts.push({ p, x0, y0 });
    });
    const reach = size * 1.7;
    const parent = pts.map((_, i) => i);
    const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
    pts.forEach((a, i) => {
      if (a.p.id === state.selectedId) return;
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j];
        if (b.p.id !== state.selectedId && Math.hypot(a.x0 - b.x0, a.y0 - b.y0) < reach) parent[root(j)] = root(i);
      }
    });
    const byRoot = new Map();
    pts.forEach((q, i) => { const r = root(i); if (!byRoot.has(r)) byRoot.set(r, []); byRoot.get(r).push(q); });
    const groups = [...byRoot.values()].map((members) => ({
      members, x: d3.mean(members, (q) => q.x0), y: d3.mean(members, (q) => q.y0),
      circle: members.length > SPREAD_MAX,
    }));
    const lastOffset = new Map(anims.filter((a) => !a.ghost).map((a) => [a.p.id, [a.vx, a.vy]]));
    // remember what was shown, so zooming only ever moves one way: zooming in, a group that was
    // spread out stays spread out; zooming out, anything that was in a circle stays in a circle
    const zoomingIn = k >= lastK * 0.999, zoomingOut = k <= lastK * 1.001;
    groups.forEach((G) => {
      G.r = 10 + Math.min(9, Math.sqrt(G.members.length) * 2);
      G.locked = zoomingIn && G.members.length > 1 && G.members.every((q) => lastOffset.has(q.p.id));
      if (zoomingOut && G.members.length > 1 && G.members.some((q) => prevClusters.has(q.p.id))) G.circle = true;
    });
    lastK = k;

    const staticBoxes = boxes.slice(); // heading, note, country circles
    const rectHit = (b, list) => list.some((o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
    // does the segment (x1,y1)-(x2,y2) pass through box b? (Liang–Barsky clipping)
    const segHits = (x1, y1, x2, y2, b) => {
      let t0 = 0, t1 = 1;
      const dx = x2 - x1, dy = y2 - y1;
      const edges = [[-dx, x1 - b.x], [dx, b.x + b.w - x1], [-dy, y1 - b.y], [dy, b.y + b.h - y1]];
      for (const [pp, qq] of edges) {
        if (pp === 0) { if (qq < 0) return false; continue; }
        const t = qq / pp;
        if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
      }
      return true;
    };
    const boxOf = (n) => ({ x: n.x - n.w / 2, y: n.y - size / 2, w: n.w, h: size });

    let nodes = [];
    for (let round = 0; round < 4; round++) {
      // icons that spread out, plus circles as fixed obstacles
      nodes = [];
      groups.forEach((G) => {
        if (G.circle) { nodes.push({ circle: G, x: G.x, y: G.y, fx: G.x, fy: G.y, r: G.r + 4 }); return; }
        G.members.forEach((q, i) => {
          const w = size * q.p.categories.length;
          const n = { q, G, ax: q.x0, ay: q.y0, w, r: Math.max(w, size) / 2 + 3 };
          const last = lastOffset.get(q.p.id);
          if (last) { n.x = q.x0 + last[0]; n.y = q.y0 + last[1]; }
          else if (clusterPos.has(q.p.id) || G.members.length > 1) {
            // start just outside the group centre, in the direction of the real spot
            let ux = q.x0 - G.x, uy = q.y0 - G.y, d = Math.hypot(ux, uy);
            if (d < 0.5) { ux = Math.cos(i * 2.4); uy = Math.sin(i * 2.4); d = 1; }
            n.x = q.x0 + (ux / d) * size * 0.6; n.y = q.y0 + (uy / d) * size * 0.6;
          } else { n.x = q.x0; n.y = q.y0; }
          if (q.p.id === state.selectedId) { n.fx = q.x0; n.fy = q.y0; }
          nodes.push(n);
        });
      });
      // keep icons out of the heading and the note
      const avoidRects = (full) => {
        const f = full === undefined ? 0.8 : 1;
        nodes.forEach((n) => {
          if (n.fx !== undefined) return;
          staticBoxes.forEach((o) => {
            const b0 = boxOf(n), b = { x: b0.x - 3, y: b0.y - 3, w: b0.w + 6, h: b0.h + 6 };
            if (!(b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y)) return;
            const push = [[o.x - (b.x + b.w), 0], [o.x + o.w - b.x, 0], [0, o.y - (b.y + b.h)], [0, o.y + o.h - b.y]]
              .sort((u, v) => Math.hypot(...u) - Math.hypot(...v))[0];
            n.x += push[0] * f; n.y += push[1] * f;
          });
        });
      };
      // keep icons off other places' dots and pen lines
      const avoidLines = (alpha) => {
        const icons = nodes.filter((n) => !n.circle);
        icons.forEach((n) => {
          if (n.fx !== undefined) return;
          icons.forEach((o) => {
            if (o === n || Math.abs(o.ax - n.x) > size * 4 || Math.abs(o.ay - n.y) > size * 4) return;
            // nearest point to n on o's line, from o's spot to o's icon
            const vx = o.x - o.ax, vy = o.y - o.ay, L2 = vx * vx + vy * vy;
            const t = L2 ? Math.max(0, Math.min(1, ((n.x - o.ax) * vx + (n.y - o.ay) * vy) / L2)) : 0;
            if (t > 0.85 && L2) return; // that end is o's own icon
            const px = o.ax + vx * t, py = o.ay + vy * t;
            let dx = n.x - px, dy = n.y - py, d = Math.hypot(dx, dy);
            const need = Math.max(n.w, size) / 2 + 2;
            if (d >= need) return;
            if (d < 0.01) { dx = -vy || 1; dy = vx; d = Math.hypot(dx, dy); }
            const push = (need - d) * Math.max(alpha, 0.3);
            n.vx += (dx / d) * push; n.vy += (dy / d) * push;
          });
        });
      };
      let seed = 7;
      const sim = d3.forceSimulation(nodes)
        .randomSource(() => ((seed = (seed * 16807) % 2147483647) / 2147483647))
        .force("x", d3.forceX((n) => (n.ax !== undefined ? n.ax : n.x)).strength(0.2))
        .force("y", d3.forceY((n) => (n.ay !== undefined ? n.ay : n.y)).strength(0.2))
        .force("collide", d3.forceCollide((n) => n.r).strength(0.9).iterations(4))
        .force("rects", avoidRects)
        .force("lines", avoidLines)
        .stop();
      for (let i = 0; i < 160; i++) sim.tick();
      for (let i = 0; i < 4; i++) avoidRects(1 / 0.8); // finish by moving icons fully clear of reserved spots

      const icons = nodes.filter((n) => !n.circle);
      // untangle: swap two icons of the same group when that stops a pen line running through an icon
      const crossings = (n) => nodes.reduce((c, o) => {
        if (o === n) return c;
        const b = o.circle ? { x: o.x - o.r, y: o.y - o.r, w: 2 * o.r, h: 2 * o.r } : boxOf(o);
        return c + (segHits(n.ax, n.ay, n.x, n.y, { x: b.x + 3, y: b.y + 3, w: b.w - 6, h: b.h - 6 }) ? 1 : 0);
      }, 0);
      for (let pass = 0; pass < 2; pass++) icons.forEach((a) => icons.forEach((b) => {
        if (a === b || a.G !== b.G || a.w !== b.w || a.fx !== undefined || b.fx !== undefined) return;
        const before = crossings(a) + crossings(b) + Math.hypot(a.x - a.ax, a.y - a.ay) / 1000 + Math.hypot(b.x - b.ax, b.y - b.ay) / 1000;
        [a.x, b.x, a.y, b.y] = [b.x, a.x, b.y, a.y];
        const after = crossings(a) + crossings(b) + Math.hypot(a.x - a.ax, a.y - a.ay) / 1000 + Math.hypot(b.x - b.ax, b.y - b.ay) / 1000;
        if (after >= before) [a.x, b.x, a.y, b.y] = [b.x, a.x, b.y, a.y];
      }));

      // check every spread group: icons near their spots, no overlaps, no pen line through an icon
      const solid = nodes.map((n) => (n.circle ? { x: n.x - n.r, y: n.y - n.r, w: 2 * n.r, h: 2 * n.r, n } : Object.assign(boxOf(n), { n })));
      const bad = new Set();
      icons.forEach((n) => {
        const b = boxOf(n);
        const shift = Math.hypot(n.x - n.ax, n.y - n.ay);
        let fail = shift > MAX_SHIFT || rectHit(b, staticBoxes) ||
          solid.some((o) => o.n !== n && b.x < o.x + o.w - 2 && b.x + b.w > o.x + 2 && b.y < o.y + o.h - 2 && b.y + b.h > o.y + 2);
        if (!fail && shift > 4) {
          fail = solid.some((o) => o.n !== n && segHits(n.ax, n.ay, n.x, n.y, { x: o.x + 3, y: o.y + 3, w: o.w - 6, h: o.h - 6 })) ||
            staticBoxes.some((o) => segHits(n.ax, n.ay, n.x, n.y, o));
        }
        if (!fail) return;
        if (n.G.locked) return;
        if (n.G.members.length > 1) bad.add(n.G);
        else {
          // a lone icon pushed away: fold the nearest spread group instead
          let best = null, bd = Infinity;
          groups.forEach((G) => {
            if (G.circle || G.locked || G.members.length < 2) return;
            const d = Math.hypot(G.x - n.ax, G.y - n.ay);
            if (d < bd) { bd = d; best = G; }
          });
          if (best && bd < MAX_SHIFT * 3) bad.add(best);
        }
      });
      if (!bad.size) break;
      bad.forEach((G) => { G.circle = true; G.members.forEach((q) => clusterPos.set(q.p.id, [G.x, G.y, G.x - q.x0, G.y - q.y0])); });
    }

    const placed = [];
    nodes.forEach((n) => {
      if (n.circle) return;
      const box = boxOf(n);
      boxes.push(box);
      placed.push({ p: n.q.p, x: n.x, y: n.y, x0: n.ax, y0: n.ay, w: n.w, box });
    });
    groups.forEach((G) => {
      if (!G.circle) return;
      const n = G.members.length, r = G.r;
      G.members.forEach((q) => clusterPos.set(q.p.id, [G.x, G.y, G.x - q.x0, G.y - q.y0]));
      const ids = G.members.map((q) => q.p.id).join(" ");
      const grp = el("g", { class: "cluster", tabindex: "0", role: "button", "data-ids": ids, "aria-label": t("clusterNear", n) }, g);
      el("circle", { cx: G.x, cy: G.y, r }, grp);
      el("circle", { class: "ring", cx: G.x + 1, cy: G.y - 1, r: r + 2.5 }, grp);
      el("text", { x: G.x, y: G.y + 5, "text-anchor": "middle" }, grp).textContent = n;
      el("title", {}, grp).textContent = G.members.map((q) => q.p.name).join(", ");
      boxes.push({ x: G.x - r - 3, y: G.y - r - 3, w: 2 * r + 6, h: 2 * r + 6 });
    });

    const reachNow = currentReach(), reachSet = reachSetting();
    const tripTo = reachSet && reachFrom(state.selectedId, state.mode, "time", Infinity);
    // 2. draw the icons. Each one glides from where it was last shown to its new spot, and icons
    //    that join a numbered circle glide into it and fade, so nothing jumps while zooming.
    const prev = anims;
    const prevById = new Map(prev.filter((a) => !a.ghost).map((a) => [a.p.id, a]));
    const prevGhosts = new Map(prev.filter((a) => a.ghost).map((a) => [a.p.id, a]));
    anims = [];
    const now = performance.now();
    const startFrom = (id, x0, y0, tdx, tdy) => {
      const o = prevById.get(id) || prevGhosts.get(id);
      // offsets are measured from the place's real spot, so panning and zooming carry them along
      if (o) return { sx: o.vx, sy: o.vy, same: !o.ghost && Math.abs(o.dx - tdx) < 0.5 && Math.abs(o.dy - tdy) < 0.5, o };
      const c = prevClusters.get(id); // coming out of a numbered circle
      if (c) return { sx: c[2], sy: c[3] };
      return { sx: tdx, sy: tdy };
    };
    const drawBody = (it, grp) => {
      const p = it.p;
      const body = el("g", {}, grp);
      el("ellipse", { class: "halo", cx: it.x, cy: it.y, rx: it.w / 2 + 5, ry: size / 2 + 5 }, body);
      p.categories.forEach((c, i) => {
        const ig = el("g", { class: "icon", transform: "translate(" + (it.box.x + i * size) + " " + it.box.y + ") scale(" + size / 24 + ")" }, body);
        ig.innerHTML = ICONS[c] || ICONS["friendly-house"];
      });
      return body;
    };
    placed.forEach((it) => {
      const p = it.p;
      const grp = el("g", {
        class: "place" + (state.selectedId === p.id ? " selected" : "") + (reachNow && !reachNow.has(p.id) ? " far" : ""),
        tabindex: "0", role: "button", "aria-label": p.name, "data-id": p.id,
      }, g);
      // a dot on the real spot and a pen line that stops at the icon's edge (shown when moved aside)
      const leader = el("path", { class: "leader" }, grp);
      const spot = el("circle", { class: "spot", cx: it.x0, cy: it.y0, r: 2.4 }, grp);
      const body = drawBody(it, grp);
      // name tag, shown on hover, keyboard focus or selection (CSS); flips left near the right edge
      // With a place selected, every other place's tag also tells the whole trip there. Inside the
      // circle the way's label already gives the time (or the distance), so the tag adds the other
      // one; outside the circle it gives both.
      const inReach = reachNow && state.selectedId !== p.id && reachNow.get(p.id);
      const trip = inReach || (tripTo && state.selectedId !== p.id && tripTo.get(p.id));
      const tripFull = trip ? fmtTime(trip.min) + " · " + trip.km + " " + t("km") : "";
      const tripText = !trip ? "" : !inReach ? tripFull : reachSet.kind === "time" ? trip.km + " " + t("km") : fmtTime(trip.min);
      const nameW = textWidth(p.name, (state.selectedId === p.id ? "700" : "400") + " 12px Kalam, cursive") + 12;
      const tw = trip ? nameW + 22 + textWidth(tripText, "400 12px Kalam, cursive") + 6 : textWidth(p.name, "700 12px Kalam, cursive") + 12;
      const right = it.box.x + it.box.w + 4 + tw < W;
      const tx = right ? it.box.x + it.box.w + 4 : it.box.x - 4 - tw;
      if (state.selectedId === p.id) boxes.push({ x: tx, y: it.y - 10, w: tw, h: 20 }); // its name is always shown
      const tag = el("g", { class: "name-tag" }, body);
      const tagRect = el("rect", { x: tx, y: it.y - 10, width: tw, height: 20, rx: 3 }, tag);
      const tagText = el("text", { x: tx + 6, y: it.y + 4 }, tag);
      tagText.textContent = p.name;
      let sample = null, timeText = null;
      if (trip) {
        grp.classList.add("has-way", state.mode);
        sample = el("path", { class: "sample", d: "M" + (tx + nameW) + " " + (it.y + 1) + "q4 -3 8 0t8 -.5" }, tag);
        timeText = el("text", { class: "time", x: tx + nameW + 22, y: it.y + 4 }, tag);
        timeText.textContent = tripText;
      }
      grp._tag = { tag, rect: tagRect, text: tagText, sample, timeText, tx, y: it.y, tw, nameW, right, trip, tripFull };
      const dx = it.x - it.x0, dy = it.y - it.y0;
      const st = startFrom(p.id, it.x0, it.y0, dx, dy);
      anims.push({ p, grp, body, leader, spot, x0: it.x0, y0: it.y0, w: it.w, h: size, dx, dy,
        sx: st.same ? st.o.sx : st.sx, sy: st.same ? st.o.sy : st.sy, t0: st.same ? st.o.t0 : now, vx: st.sx, vy: st.sy });
    });
    // icons that were shown a moment ago but have now joined a circle: glide in and fade out
    clusterPos.forEach(([cx, cy], id) => {
      const o = prevById.get(id) || prevGhosts.get(id);
      const q = pts.find((q) => q.p.id === id);
      if (!o || !q || (o.ghost && now - o.f0 > GLIDE)) return;
      const it = { p: o.p, x: cx, y: cy, x0: q.x0, y0: q.y0, w: o.w, box: { x: cx - o.w / 2, y: cy - size / 2, w: o.w, h: size } };
      const grp = el("g", { class: "place ghost", "aria-hidden": "true" }, g);
      g.insertBefore(grp, g.firstChild);
      const leader = el("path", { class: "leader" }, grp);
      const spot = el("circle", { class: "spot", cx: q.x0, cy: q.y0, r: 2.4 }, grp);
      const body = drawBody(it, grp);
      const sx = o.vx, sy = o.vy;
      anims.push({ p: o.p, grp, body, leader, spot, ghost: true, f0: o.ghost ? o.f0 : now, x0: q.x0, y0: q.y0,
        w: o.w, h: size, dx: cx - q.x0, dy: cy - q.y0, sx, sy, t0: now, vx: sx, vy: sy });
    });
    prevClusters = clusterPos;
    animate(now);

    // 2a. the reach circle: dashed, around the selected place, drag its edge to reach further
    if (reachNow && k >= ROUTE_ZOOM) drawReachCircle(g, reachSet, boxes);

    if (moving) return; // labels and towns wait until the map stops moving

    // the time added to another place's name tag, with a short stroke of the way's line
    function tagTime(other) {
      const og = [...g.querySelectorAll(".place")].find((n) => n.dataset.id === other.id);
      const T = og && og._tag;
      if (!T || !T.trip) return;
      // no label on the way, so this tag shows the whole trip, time and distance
      const w = T.nameW + 22 + textWidth(T.tripFull, "400 12px Kalam, cursive") + 6;
      const x0 = T.right ? T.tx : T.tx + T.tw - w;
      const box = { x: x0, y: T.y - 10, w, h: 20 };
      if (hits(box)) return; // no room: the note still lists it
      boxes.push(box);
      T.rect.setAttribute("x", x0);
      T.rect.setAttribute("width", w);
      T.text.setAttribute("x", x0 + 6);
      T.sample.setAttribute("d", "M" + (x0 + T.nameW) + " " + (T.y + 1) + "q4 -3 8 0t8 -.5");
      T.timeText.setAttribute("x", x0 + T.nameW + 22);
      T.timeText.textContent = T.tripFull;
      og.classList.add("linked");
    }
    // 2b. along each way used to reach places in the circle: the total time (or distance) to its far end
    if (reachNow && k >= ROUTE_ZOOM) {
      [...reachNow.entries()].filter(([id]) => id !== state.selectedId).map(([id, info]) => ({
        other: state.placeById[id], e: info.e, r: routeOf(info.e, state.mode), info,
      })).forEach((c) => {
        const pts = routeCoords(c.e, c.r).map((q) => transform.apply(projection(q)));
        // the total from the selected place to the far end of this stretch, the same number the
        // circle compares with, so a place lights up exactly when the circle reaches its label
        const label = reachSet.kind === "time" ? fmtTime(c.info.min) : c.info.km + " " + t("km");
        const tw = textWidth(label, "400 12px Kalam, cursive") + 30; // room for a little sample of the line
        // half way along the way, or the nearest free spot along it
        let at = null, bx = null;
        // walk the way's real length, from the middle outwards, nudging the tag above or below the line
        const seg = [0];
        for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        const total = seg[seg.length - 1];
        const pointAt = (d) => {
          let i = 1;
          while (i < seg.length - 1 && seg[i] < d) i++;
          const u = (d - seg[i - 1]) / ((seg[i] - seg[i - 1]) || 1);
          return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u];
        };
        search: for (let s = 0; s <= 8; s++) {
          for (const sign of s ? [-1, 1] : [1]) {
            const q = pointAt(total * (0.5 + sign * s * 0.05));
            for (const dy of [0, -14, 14]) {
              const b = { x: q[0] - tw / 2, y: q[1] - 10 + dy, w: tw, h: 20 };
              if (inView(q[0], q[1], -10) && !hits(b)) { at = [q[0], q[1] + dy]; bx = b; break search; }
            }
          }
        }
        // too short to write on at this zoom: the total goes on the place's own name tag
        if (!bx) return tagTime(c.other);
        boxes.push(bx);
        // drawn like a place's name tag, with a short stroke of the way's own line in front
        const tg = el("g", { class: "route-time " + state.mode }, g);
        el("rect", { x: bx.x, y: bx.y, width: tw, height: 20, rx: 3 }, tg);
        el("path", { class: "sample", d: "M" + (bx.x + 6) + " " + (at[1] + 1) + "q4 -3 8 0t8 -.5" }, tg);
        el("text", { x: bx.x + 26, y: at[1] + 4 }, tg).textContent = label;
      });
    }

    // 3. region names (inside countries whose regions are drawn), then country names
    const areaLabels = [];
    const regionsShown = (a3) => !!state.admin1[a3] && (a3 === state.focusCountry || state.dataCountries.has(a3));
    if (k >= ADMIN_ZOOM) Object.values(state.admin1).forEach((fc) => { if (regionsShown(fc.country)) fc.features.forEach((f) => areaLabels.push({ f, kind: "region" })); });
    state.countries.features.forEach((f) => areaLabels.push({ f, kind: "country" }));
    areaLabels.forEach(({ f, kind }) => {
      if (kind === "country" && regionsShown(f.properties.a3) && k >= ADMIN_ZOOM) return;
      const b = f._pb || (f._pb = path.bounds(f));
      const wpx = (b[1][0] - b[0][0]) * k, hpx = (b[1][1] - b[0][1]) * k;
      if (wpx < 70 || hpx < 26) return;
      if (!f._anchor) f._anchor = d3.geoCentroid(f);
      const [x, y] = transform.apply(projection(f._anchor));
      if (!inView(x, y, 0)) return;
      const text = countryName(f).toUpperCase();
      const fs = kind === "country" ? Math.min(16, 10 + wpx / 80) : Math.min(14, 9 + wpx / 90);
      const font = (kind === "country" ? "400 " : "300 ") + fs + "px Kalam, cursive";
      const tw = textWidth(text, font) * 1.12 + 4;
      if (tw > wpx * 0.95) return;
      const bx = { x: x - tw / 2, y: y - fs / 2 - 2, w: tw, h: fs + 4 };
      if (hits(bx)) return;
      boxes.push(bx);
      el("text", { x, y: y + fs * 0.35, class: "area-label " + kind, "text-anchor": "middle", style: "font-size:" + fs.toFixed(1) + "px" }, g).textContent = text;
    });

    // 4. town names, next to the dots reserved above
    towns.forEach((t) => {
      const font = (t.capital ? "400 " : "300 ") + "11px Kalam, cursive";
      const label = t.name.toUpperCase();
      const tw = textWidth(label, font) * 1.08;
      const { x, y, r } = t;
      const cands = [{ x: x + r + 3, y: y - 13 }, { x: x - r - 3 - tw, y: y - 13 }, { x: x + r + 3, y: y + 2 }, { x: x - r - 3 - tw, y: y + 2 }];
      const lb = t.lb || cands.map((c) => ({ x: c.x, y: c.y, w: tw, h: 12 }))
        .find((bx) => !hits(bx) && !placed.some((it) => Math.hypot(it.x - it.x0, it.y - it.y0) > 4 &&
          segHits(it.x0, it.y0, it.x, it.y, { x: bx.x - 3, y: bx.y - 3, w: bx.w + 6, h: bx.h + 6 })));
      if (!lb) return;
      if (!t.lb) boxes.push(lb);
      const cg = el("g", { class: "city" + (t.capital ? "" : " small") }, g);
      el("circle", { cx: x, cy: y, r }, cg);
      if (t.capital) el("circle", { class: "dot", cx: x, cy: y, r: 1.4 }, cg);
      el("text", { x: lb.x, y: lb.y + 10 }, cg).textContent = label;
    });
    // the selected place and its name tag sit on top of everything
    const sel = g.querySelector(".place.selected");
    if (sel) g.appendChild(sel);
  }

  // ---------- zoom ----------
  function zoomToFeature(f, opts) {
    const [[x0, y0], [x1, y1]] = path.bounds(mainPart(f));
    const left = 30, top = narrow() ? 80 : 90;
    const right = narrow() ? W - 30 : W - Math.min(320, W * 0.34);
    const bottom = H - 30;
    const k = Math.min(1500, 0.92 * Math.min((right - left) / (x1 - x0), (bottom - top) / (y1 - y0)));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const t = d3.zoomIdentity.translate((left + right) / 2 - cx * k, (top + bottom) / 2 - cy * k).scale(k);
    const sel = d3.select(svg);
    (opts && opts.instant ? sel : sel.transition().duration(reduceMotion() ? 0 : 750)).call(zoom.transform, t);
  }

  // Only what the current view needs is loaded: a country's regions when you open that country,
  // towns once you zoom in, rivers once you are close.
  // zoom in on a group of places until they have room to show separately
  function zoomToPlaces(ids) {
    const ps = state.places.filter((p) => ids.includes(p.id));
    const xy = ps.map((p) => projection(lnglat(p)));
    const [x0, x1] = d3.extent(xy, (q) => q[0]), [y0, y1] = d3.extent(xy, (q) => q[1]);
    const right = narrow() ? W : W - Math.min(320, W * 0.34);
    const span = Math.max(x1 - x0, y1 - y0, 1e-6);
    const k = Math.min(3000, Math.max(transform.k * 2.5, Math.min(right, H) * 0.35 / span));
    const t = d3.zoomIdentity.translate(right / 2 - ((x0 + x1) / 2) * k, H / 2 - ((y0 + y1) / 2) * k).scale(k);
    d3.select(svg).transition().duration(reduceMotion() ? 0 : 650).call(zoom.transform, t);
  }

  // zoomed in: load the detailed shape of every country in view (a few at most at this zoom)
  let detailShown = false;
  function loadCountriesInView() {
    if (transform.k < ADMIN_ZOOM) return;
    const corners = [[0, 0], [W, 0], [0, H], [W, H], [W / 2, 0], [W / 2, H]].map((q) => projection.invert(transform.invert(q)));
    const lon0 = d3.min(corners, (c) => c[0]), lon1 = d3.max(corners, (c) => c[0]);
    const lat0 = d3.min(corners, (c) => c[1]), lat1 = d3.max(corners, (c) => c[1]);
    const inView = Object.entries(state.admin1Index).filter(([, b]) => b[0] < lon1 && b[2] > lon0 && b[1] < lat1 && b[3] > lat0);
    if (inView.length <= 16) inView.forEach(([a3]) => loadAdmin1(a3));
  }
  function onZoomEnd() {
    loadCountriesInView();
    if ((transform.k >= ADMIN_ZOOM) !== detailShown) buildGeo();
    if (transform.k >= RIVER_ZOOM && !state.rivers && !state.riversLoading) {
      state.riversLoading = getJSON("data/world/rivers.json").then((r) => { state.rivers = r; buildGeo(); });
    }
    if (transform.k >= ADMIN_ZOOM && !state.cities.length && !state.citiesLoading) {
      state.citiesLoading = getJSON("data/world/cities.json").then((c) => { state.cities = c.rows; scheduleMarks(); });
    }
  }

  // ---------- focus: country, region, place ----------
  function setFocus({ country, region }, opts) {
    state.focusCountry = country || null;
    state.focusRegion = region || null;
    buildGeo();
    renderHeading();
    renderList();
    if (!state.selectedId) showWelcome();
    if (!opts || opts.zoom !== false) {
      const f = region ? state.regionById[region] : country ? state.countryById[country] : null;
      if (f) zoomToFeature(f, opts); else d3.select(svg).transition().duration(reduceMotion() ? 0 : 750).call(zoom.transform, d3.zoomIdentity);
    }
    const hash = region || country || "";
    if (location.hash.slice(1) !== hash) history.replaceState(null, "", hash ? "#" + hash : location.pathname);
  }

  function renderHeading() {
    const crumbs = [{ label: t("world"), go: () => { select(null); setFocus({}); } }];
    let title = t("theWorld");
    const c = state.focusCountry && state.countryById[state.focusCountry];
    if (c) {
      title = countryName(c);
      if (state.focusRegion) crumbs.push({ label: countryName(c), go: () => { select(null); setFocus({ country: c.properties.a3 }); } });
    }
    const r = state.focusRegion && state.regionById[state.focusRegion];
    if (r) title = r.properties.name;
    // the name of the area, with how many places it has in a pen-drawn circle
    const n = placesInFocus().length;
    mapTitleEl.innerHTML = '<span class="title-name">' + esc(title) + "</span>" + (n ? ' <span class="title-count" title="' + t("placesOnMap", n) + '">' + n + "</span>" : "");
    crumbsEl.innerHTML = "";
    if (c) crumbs.forEach((cr) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = cr.label;
      b.addEventListener("click", cr.go);
      li.appendChild(b);
      crumbsEl.appendChild(li);
    });
  }

  function placesInFocus() {
    const here = state.places.filter((p) => p.location);
    if (state.focusRegion) return here.filter((p) => p._region === state.focusRegion);
    if (state.focusCountry) return here.filter((p) => p._country === state.focusCountry);
    return here;
  }
  function focusName() {
    const r = state.focusRegion && state.regionById[state.focusRegion];
    const c = state.focusCountry && state.countryById[state.focusCountry];
    return r ? r.properties.name : c ? countryName(c) : t("theWorldIn");
  }

  // ---------- search: by name, type, town, offer or description; accents and case don't matter ----------
  const fold = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const offerKindLabel = (k) => (k ? (settings.lang === "es" && k.es) || k.en : "");
  function haystack(p) {
    const cats = p.categories.map((c) => state.catById[c]).filter(Boolean).flatMap((c) => [c.label_en, c.label_es, c.label_it]);
    const offers = (p.offers || []).flatMap((o) => { const k = state.offerKindById[o.kind]; return [o.what, k && k.en, k && k.es]; });
    return fold([p.name, p.near, p.description].concat(cats, offers).join(" "));
  }
  function matchesSearch(p) {
    if (state.offerKind && !(p.offers || []).some((o) => o.kind === state.offerKind)) return false;
    const words = fold(state.query).split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const h = p._hay || (p._hay = haystack(p));
    return words.every((w) => h.includes(w));
  }
  const searching = () => !!(state.query.trim() || state.offerKind);
  // what matched, shown under the name in the list: the offers that fit the search
  function matchHint(p) {
    const words = fold(state.query).split(/\s+/).filter(Boolean);
    const hits = (p.offers || []).filter((o) => (!state.offerKind || o.kind === state.offerKind) &&
      (!words.length || words.some((w) => fold(o.what + " " + offerKindLabel(state.offerKindById[o.kind])).includes(w))));
    return hits.map((o) => o.what).join(" · ");
  }
  const searchEl = $("search"), chipsEl = $("offer-chips");
  function renderSearch() {
    searchEl.placeholder = t("search");
    searchEl.setAttribute("aria-label", t("searchLabel"));
    $("search-clear").setAttribute("aria-label", t("clearSearch"));
    $("search-clear").hidden = !searching();
    const used = new Set(state.places.flatMap((p) => (p.offers || []).map((o) => o.kind)));
    const kinds = state.offerKinds.filter((k) => used.has(k.id));
    chipsEl.hidden = !kinds.length;
    chipsEl.innerHTML = kinds.length ? '<span class="chips-title">' + t("offersBy") + "</span>" + kinds.map((k) =>
      '<button type="button" data-kind="' + esc(k.id) + '" aria-pressed="' + (state.offerKind === k.id) + '">' + esc(offerKindLabel(k)) + "</button>").join("") : "";
    chipsEl.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      state.offerKind = state.offerKind === b.dataset.kind ? null : b.dataset.kind;
      searchChanged();
    }));
  }
  function searchChanged() {
    renderSearch();
    renderList();
    drawRoutes();
    scheduleMarks();
    // the selected place stays only while it still matches
    const p = state.selectedId && state.placeById[state.selectedId];
    if (p && !matchesSearch(p)) select(null);
  }
  searchEl.addEventListener("input", () => { state.query = searchEl.value; searchChanged(); });
  searchEl.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") { searchEl.value = state.query = ""; state.offerKind = null; searchChanged(); }
    if (ev.key === "Enter") {
      // Enter with a single place found goes to it; with several, frames them all
      const found = state.places.filter((p) => p.location && !state.hiddenPlace(p));
      if (found.length === 1) select(found[0].id, { zoom: true });
      else if (found.length > 1) zoomToPlaces(found.map((p) => p.id));
    }
  });
  $("search-clear").addEventListener("click", () => { searchEl.value = state.query = ""; state.offerKind = null; searchChanged(); searchEl.focus(); });

  function renderList() {
    // while searching, the list shows every place that matches, wherever it is
    const here = searching() ? state.places.filter((p) => p.location && matchesSearch(p)) : placesInFocus();
    listTitleEl.hidden = here.length > 0 && !searching();
    listTitleEl.textContent = searching() ? (here.length ? t("found", here.length, state.query.trim()) : t("foundNone", state.query.trim()))
      : here.length ? "" : t("noPlacesIn", focusName());
    legendEl.innerHTML = "";
    state.categories.forEach((c) => {
      const places = here.filter((p) => p.categories.includes(c.id));
      if (!places.length) return;
      const group = document.createElement("section");
      group.className = "legend-group";
      if (state.hidden.has(c.id)) group.setAttribute("data-off", "");
      group.innerHTML =
        '<button class="legend-head" type="button" aria-pressed="' + !state.hidden.has(c.id) + '" title="' + esc(c.label_it || c.label_en) + '">' +
        iconSvg(c.id, 26) + '<span class="label">' + esc(catLabel(c)) + '</span><span class="count">' + places.length + "</span></button>" +
        "<ul>" + places.map((p) => {
          const hint = searching() ? matchHint(p) : "";
          return '<li><button type="button" data-id="' + esc(p.id) + '" aria-current="' + (p.id === state.selectedId) + '">' + esc(p.name) + "</button>" +
            (hint ? '<small class="match">' + esc(hint) + "</small>" : "") + "</li>";
        }).join("") + "</ul>";
      const head = group.querySelector(".legend-head");
      head.addEventListener("click", () => {
        if (state.hidden.has(c.id)) state.hidden.delete(c.id); else state.hidden.add(c.id);
        renderList();
        drawRoutes();
        scheduleMarks();
      });
      group.querySelectorAll("li button").forEach((b) => b.addEventListener("click", () => select(b.dataset.id, { zoom: true })));
      legendEl.appendChild(group);
    });
  }

  // ---------- note ----------
  function showWelcome() {
    noteEl.dataset.tone = "green";
    const n = placesInFocus().length;
    noteEl.innerHTML = state.focusRegion || state.focusCountry
      ? (n ? '<p class="hint">' + t("tapPlace") + "</p><p>" + esc(t("welcome", n, focusName())) + "</p>"
           : '<p class="hint">' + esc(focusName()) + "</p><p>" + t("emptyHere") + "</p>")
      : '<p class="hint">' + t("zoomOrTap") + "</p><p>" + t("worldHint") + "</p>";
  }

  function showPlace(p) {
    noteEl.dataset.tone = NOTE_TONES[state.places.indexOf(p) % NOTE_TONES.length];
    const kinds = p.categories.map((c) => '<span class="kind">' + iconSvg(c, 24) + esc(state.catById[c] ? catLabel(state.catById[c]) : c) + "</span>").join("");
    const site = p.website ? '<a href="' + esc(p.website) + '" target="_blank" rel="noopener">' + esc(p.website.replace(/^https?:\/\//, "")) + "</a>" : t("notYet");
    noteEl.innerHTML =
      '<button class="close" type="button" aria-label="' + t("close") + '">×</button>' +
      '<h2><button class="open-profile" type="button" title="' + esc(t("openProfile")) + '">' + esc(p.name) +
      ' <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h10v10M19 5L6 18"/></svg></button></h2>' +
      '<div class="kinds">' + kinds + "</div>" +
      "<p>" + (p.description ? esc(p.description) : t("noDescription")) + "</p>" +
      "<dl><dt>" + t("where") + "</dt><dd>" + esc(p.near || "") + "</dd>" +
      "<dt>" + t("website") + "</dt><dd>" + site + "</dd>" +
      "<dt>" + t("contact") + "</dt><dd>" + (p.contact ? esc(p.contact) : t("notYet")) + "</dd></dl>" +
      offersNote(p) +
      connectionsNote(p);
    noteEl.querySelector(".close").addEventListener("click", () => select(null));
    noteEl.querySelector(".open-profile").addEventListener("click", () => openProfile(p));
    noteEl.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => select(b.dataset.go, { zoom: true })));
  }

  // the post-it stays short: just the kinds of things the place offers (the details are in the profile)
  function offersNote(p) {
    const ks = [...new Set((p.offers || []).map((o) => o.kind))].map((k) => state.offerKindById[k]).filter(Boolean);
    return ks.length ? '<p class="offers-line"><b>' + t("offersBy") + "</b> " + ks.map((k) => esc(offerKindLabel(k))).join(", ") + "</p>" : "";
  }

  // ---------- the full profile: a big page over the map, with only what the place has filled in ----------
  const sheetEl = $("sheet");
  const L = (x) => (settings.lang === "es" && x.es) || x.en;
  const LD = (x) => (settings.lang === "es" && x.desc_es) || x.desc_en || "";
  const filled = (v) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length);
  const pill = (txt, cls) => '<span class="pill' + (cls ? " " + cls : "") + '">' + esc(txt) + "</span>";
  const TICK = '<svg class="tick" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8.5l3.5 3.5 7.5-8.5"/></svg>';
  function fieldHtml(f, v) {
    const opt = (id) => (f.options || []).find((x) => x.id === id);
    switch (f.type) {
      case "text": return '<div class="prose">' + esc(v).split(/\n{2,}/).map((x) => "<p>" + x.replace(/\n/g, "<br>") + "</p>").join("") + "</div>";
      case "line": case "date": return "<p>" + esc(v) + "</p>";
      case "number": return '<p class="big-number">' + esc(v) + "</p>";
      case "link": return '<p><a href="' + esc(v) + '" target="_blank" rel="noopener">' + esc(String(v).replace(/^https?:\/\//, "").replace(/\/$/, "")) + "</a></p>";
      case "email": return '<p><a href="mailto:' + esc(v) + '">' + esc(v) + "</a></p>";
      case "tags": return '<p class="pills">' + v.map((x) => pill(x)).join("") + "</p>";
      case "choice": { const o = opt(v); return o ? '<p class="choice">' + pill(L(o)) + (LD(o) ? " <small>" + esc(LD(o)) + "</small>" : "") + "</p>" : ""; }
      case "choices": return '<ul class="checks">' + v.map(opt).filter(Boolean).map((o) => "<li>" + TICK + esc(L(o)) + "</li>").join("") + "</ul>";
      case "offers": return '<ul class="offers">' + v.map((o) => {
        const k = state.offerKindById[o.kind];
        return "<li>" + pill(k ? L(k) : o.kind, "kind") + " " + esc(o.what) +
          (o.source ? ' <a class="src" href="' + esc(o.source) + '" target="_blank" rel="noopener">' + t("source") + "</a>" : "") +
          (o.confirmed ? "" : ' <small class="unconfirmed">(' + t("toConfirm") + ")</small>") + "</li>";
      }).join("") + "</ul>";
      case "media": return '<div class="media">' + v.map((m) => /\.(jpe?g|png|webp|gif)$/i.test(m.url)
        ? '<figure><img src="' + esc(m.url) + '" alt="' + esc(m.caption || "") + '" loading="lazy">' + (m.caption ? "<figcaption>" + esc(m.caption) + "</figcaption>" : "") + "</figure>"
        : '<p><a href="' + esc(m.url) + '" target="_blank" rel="noopener">' + esc(m.caption || m.url) + "</a></p>").join("") + "</div>";
      default: return "<p>" + esc(String(v)) + "</p>";
    }
  }
  function openProfile(p) {
    const pr = state.profile;
    if (!pr) return;
    const kinds = p.categories.map((c) => '<span class="kind">' + iconSvg(c, 26) + esc(state.catById[c] ? catLabel(state.catById[c]) : c) + "</span>").join("");
    const where = [p.near, state.regionById[p._region] && countryName(state.regionById[p._region]), state.countryById[p._country] && countryName(state.countryById[p._country])].filter(Boolean).join(", ");
    let body = "", count = 0;
    pr.sections.forEach((sec) => {
      const fs = sec.fields.filter((f) => filled(p[f.id]) && !(f.type === "flag"));
      // yes/no fields become a row of "open to …" marks at the top of their section
      const flags = sec.fields.filter((f) => f.type === "flag" && typeof p[f.id] === "boolean");
      if (!fs.length && !flags.length) return;
      count += fs.length + flags.length;
      body += '<section class="sheet-section"><h3>' + esc(L(sec)) + "</h3>" +
        (flags.length ? '<p class="pills">' + flags.map((f) => p[f.id] ? pill(L(f), "yes") : pill(t("notOpen", L(f)), "no")).join("") + "</p>" : "") +
        fs.map((f) => (fs.length > 1 || sec.fields.length > 1 ? '<h4>' + esc(L(f)) + "</h4>" : "") + fieldHtml(f, p[f.id])).join("") + "</section>";
    });
    sheetEl.innerHTML =
      '<article class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">' +
      '<button class="close" type="button" aria-label="' + t("close") + '">×</button>' +
      '<header><h2 id="sheet-title">' + esc(p.name) + '</h2><div class="kinds">' + kinds + "</div>" +
      (where ? '<p class="where">' + esc(where) + "</p>" : "") + "</header>" +
      (p.sample ? '<p class="sample-note" role="note">' + t("sampleNote") + "</p>" : "") +
      (count ? body : '<p class="empty">' + t("profileEmpty") + "</p>") + "</article>";
    sheetEl.hidden = false;
    document.body.classList.add("sheet-open");
    const closeBtn = sheetEl.querySelector(".close");
    closeBtn.addEventListener("click", closeProfile);
    closeBtn.focus();
  }
  function closeProfile() {
    if (sheetEl.hidden) return;
    sheetEl.hidden = true;
    sheetEl.innerHTML = "";
    document.body.classList.remove("sheet-open");
    const b = noteEl.querySelector(".open-profile");
    if (b) b.focus();
  }
  sheetEl.addEventListener("click", (ev) => { if (ev.target === sheetEl) closeProfile(); });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !sheetEl.hidden) closeProfile(); });

  function connectionsNote(p) {
    if (!state.mode || !state.connections) return "";
    const r = reachSetting(), reach = currentReach();
    const title = '<h3 class="ways-title">' + t("nearbyTitle") + ' <svg viewBox="0 0 24 24" class="mode-icon" role="img" aria-label="' + esc(MODES[state.mode].label) + '">' + MODE_ICONS[state.mode] + "</svg></h3>";
    const list = [...reach.entries()].filter(([id]) => id !== p.id).sort((a, b) => a[1].min - b[1].min);
    if (!list.length) return title + '<p class="ways">' + t("reachNone") + "</p>";
    return title + '<ul class="ways">' + list.map(([id, info]) => {
      const o = state.placeById[id], via = info.prev !== p.id ? state.placeById[info.prev] : null;
      return '<li><span class="who"><button type="button" data-go="' + esc(id) + '">' + esc(o.name) + "</button>" +
        (via ? "<small>" + esc(t("via", via.name)) + "</small>" : "") + "</span>" +
        "<span>" + fmtTime(info.min) + " · " + info.km + " " + t("km") + "</span></li>";
    }).join("") + "</ul>" + '<p class="reach-help">' + t("reachHelp") + "</p>";
  }

  function select(id, opts) {
    state.selectedId = id;
    drawRoutes();
    const p = id && state.places.find((x) => x.id === id);
    if (!p) {
      showWelcome();
      legendEl.querySelectorAll("li button").forEach((b) => b.setAttribute("aria-current", "false"));
      scheduleMarks();
      return;
    }
    showPlace(p);
    // the place's region becomes the focus (red-brown)
    if (p._region !== state.focusRegion) setFocus({ country: p._country, region: p._region }, { zoom: false });
    else renderList();
    if (opts && opts.zoom) {
      const [x, y] = projection(lnglat(p));
      const k = Math.max(transform.k, 60);
      const cx = narrow() ? W / 2 : (W - Math.min(320, W * 0.34)) / 2 + 15;
      d3.select(svg).transition().duration(reduceMotion() ? 0 : 650).call(zoom.transform, d3.zoomIdentity.translate(cx - x * k, H / 2 - y * k).scale(k));
    } else {
      scheduleMarks();
    }
    if (narrow()) noteEl.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "nearest" });
  }

  // ---------- events ----------
  svg.addEventListener("click", (ev) => {
    const placeEl = ev.target.closest(".place");
    if (placeEl) return select(placeEl.dataset.id);
    const cluster = ev.target.closest(".cluster");
    if (cluster && cluster.dataset.ids) return zoomToPlaces(cluster.dataset.ids.split(" "));
    if (cluster && state.countryById[cluster.dataset.country]) {
      select(null);
      loadAdmin1(cluster.dataset.country);
      return setFocus({ country: cluster.dataset.country }, { zoom: true });
    }
    const area = ev.target.closest(".area");
    if (!area) return;
    const region = area.dataset.region, country = area.dataset.country;
    select(null);
    if (region) {
      setFocus({ country, region }, { zoom: true });
    } else if (country) {
      loadAdmin1(country);
      setFocus({ country }, { zoom: true });
    }
  });
  svg.addEventListener("pointerover", (ev) => {
    const g = ev.target.closest && ev.target.closest(".place");
    if (g && g.parentNode.lastChild !== g) g.parentNode.appendChild(g);
  });
  svg.addEventListener("keydown", (ev) => {
    const g = ev.target.closest && ev.target.closest(".place");
    if (g && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); select(g.dataset.id); }
    const c = ev.target.closest && ev.target.closest(".cluster");
    if (c && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); c.dispatchEvent(new MouseEvent("click", { bubbles: true })); }
  });
  $("zoom-in").addEventListener("click", () => d3.select(svg).transition().duration(300).call(zoom.scaleBy, 1.8));
  $("zoom-out").addEventListener("click", () => d3.select(svg).transition().duration(300).call(zoom.scaleBy, 1 / 1.8));
  $("zoom-reset").addEventListener("click", () => { select(null); setFocus({}); });

  function sizeToContainer() {
    const r = svg.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    W = Math.round(Math.max(520, Math.min(1000, r.width)));
    H = Math.max(420, Math.min(1600, Math.round((W * r.height) / r.width)));
  }

  function init() {
    sizeToContainer();
    setupSvg();
    // Mercator world, Antarctica left off, fitted to the page
    projection = d3.geoMercator().fitExtent([[10, 10], [W - 10, H - 10]], { type: "Feature", geometry: { type: "Polygon", coordinates: [[[-180, -56], [-180, 80], [180, 80], [180, -56], [-180, -56]].reverse()] } });
    path = d3.geoPath(projection).digits(4);
    zoom = d3.zoom()
      .scaleExtent([1, 3000])
      .translateExtent([[-W * 0.2, -H * 0.2], [W * 1.2, H * 1.2]])
      .on("start", () => { moving = true; svg.classList.add("moving"); })
      .on("zoom", (ev) => { transform = ev.transform; applyTransform(); })
      .on("end", () => { moving = false; svg.classList.remove("moving"); onZoomEnd(); scheduleMarks(); });
    d3.select(svg).call(zoom).on("dblclick.zoom", null);
    buildGeo();
    drawRoutes();
    panelBoxes = null;
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!state.countries) return;
      const t = transform;
      init();
      d3.select(svg).call(zoom.transform, t);
    }, 200);
  });

  function startFromHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h && state.regionById[h]) return setFocus({ country: state.regionById[h].properties.country, region: h }, { zoom: true, instant: true });
    if (h && state.countryById[h]) return loadAdmin1(h).then(() => setFocus({ country: h }, { zoom: true, instant: true }));
    // default: the region with the most places
    const counts = {};
    state.places.forEach((p) => { if (p._region) counts[p._region] = (counts[p._region] || 0) + 1; });
    const best = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    if (best) return setFocus({ country: state.regionById[best].properties.country, region: best }, { zoom: true, instant: true });
    setFocus({}, { zoom: true, instant: true });
  }

  Promise.all([
    getJSON("data/places.json"), getJSON("data/world/countries.json"), getJSON("data/world/lakes.json"),
    getJSON("data/admin1/index.json"),
  ]).then(([places, countries, lakes, index]) => {
    state.places = places.places;
    state.placeById = Object.fromEntries(state.places.map((p) => [p.id, p]));
    if (!MODES[state.mode]) state.mode = state.mode ? "bike" : null;
    applyStaticText();
    renderModes();
    // the connections are small; draw them as soon as they arrive
    getJSON("data/connections.json").then((c) => { state.connections = c; drawRoutes(); scheduleMarks(); }).catch(() => {});
    state.categories = places.categories;
    state.notYetPlaced = places.not_yet_placed || [];
    state.catById = Object.fromEntries(state.categories.map((c) => [c.id, c]));
    renderSearch();
    // the profile fields (and the kinds of offers) come from one shared list, also used to sign up
    getJSON("data/profile.json").then((pr) => {
      state.profile = pr;
      const of = pr.sections.flatMap((x) => x.fields).find((x) => x.id === "offers");
      state.offerKinds = (of && of.kinds) || [];
      state.offerKindById = Object.fromEntries(state.offerKinds.map((k) => [k.id, k]));
      state.places.forEach((p) => { delete p._hay; });
      renderSearch(); renderList(); refreshNote();
    }).catch(() => {});
    state.countries = rewind(countries);
    rewind(lakes);
    countries.features.forEach((f) => { state.countryById[f.properties.a3] = f; });
    state.lakes = lakes;
    state.admin1Index = index;
    locatePlaces();
    init();
    // regions of every country that has places, so their regions can turn brown
    return Promise.all([...state.dataCountries].map(loadAdmin1)).then(() => {
      const h = decodeURIComponent(location.hash.slice(1));
      const extra = h && h.length === 3 ? loadAdmin1(h) : h ? loadAdmin1(h.split("-")[0]) : Promise.resolve();
      return extra.then(startFromHash);
    });
  }).then(() => {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleMarks);
  }).catch((err) => {
    noteEl.innerHTML = '<p class="hint">The map could not load.</p><p>' + esc(err.message) + "</p>";
  });
})();
