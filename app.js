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
  const SPREAD_ZOOM = 40; // from here, small groups fan out instead of showing a number
  const SPREAD_MAX = 6;   // bigger groups always stay a numbered circle

  const $ = (id) => document.getElementById(id);
  const svg = $("map");
  const noteEl = $("note");
  const legendEl = $("legend");
  const unplacedEl = $("unplaced");
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

    state.countries.features.forEach((f) => {
      const a3 = f.properties.a3;
      const d = path(f);
      if (!d) return;
      const covered = !!state.admin1[a3];
      el("path", { d, class: areaClass("area country", a3, state.dataCountries.has(a3), false) + (covered ? " hidden-by-regions" : ""), "data-country": a3 }, fills);
      const fc = state.admin1[a3];
      const od = fc && fc.outline ? path(fc.outline) : d;
      el("path", Object.assign({ d: od, class: "country-line" }, ns), linesA);
      el("path", Object.assign({ d: od, class: "country-line b" }, ns), linesB);
    });

    Object.values(state.admin1).forEach((fc) => {
      fc.features.forEach((f) => {
        const id = f.properties.id;
        const d = path(f);
        if (!d) return;
        el("path", { d, class: areaClass("area region", id, state.dataRegions.has(id), id === state.focusRegion), "data-region": id, "data-country": f.properties.country }, fills);
        el("path", Object.assign({ d, class: "region-line" }, ns), linesB);
      });
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
      el("path", Object.assign({ d, class: "focus-line b" }, ns), linesB);
    }
    applyTransform();
  }

  function applyTransform() {
    const t = transform.toString();
    layers.fills.setAttribute("transform", t);
    layers.linesA.setAttribute("transform", t);
    layers.linesB.setAttribute("transform", t);
    if (layers.rivers) layers.rivers.style.display = transform.k >= RIVER_ZOOM ? "" : "none";
    scheduleMarks();
  }

  // ---------- labels and icons, placed so nothing overlaps ----------
  let marksQueued = false;
  function scheduleMarks() {
    if (marksQueued) return;
    marksQueued = true;
    requestAnimationFrame(() => { marksQueued = false; drawMarks(); });
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
    if (!narrow()) boxes.push({ x: W - Math.min(330, W * 0.36), y: 0, w: W, h: Math.min(170, H * 0.3) });
    boxes.push({ x: 0, y: 0, w: Math.min(W * 0.55, 440), h: 96 });

    const visible = state.places.filter((p) => p.location && !p.categories.every((c) => state.hidden.has(c)));

    // 0. zoomed far out: one circled count per country instead of every icon
    if (k < ADMIN_ZOOM) {
      const groups = {};
      visible.forEach((p) => { (groups[p._country || "?"] = groups[p._country || "?"] || []).push(p); });
      Object.entries(groups).forEach(([a3, ps]) => {
        const pts = ps.map((p) => transform.apply(projection(lnglat(p))));
        const x = d3.mean(pts, (q) => q[0]), y = d3.mean(pts, (q) => q[1]);
        if (!inView(x, y, 20)) return;
        const r = 11 + Math.min(10, Math.sqrt(ps.length) * 2);
        const grp = el("g", { class: "cluster", tabindex: "0", role: "button", "data-country": a3, "aria-label": ps.length + " places, zoom in" }, g);
        el("circle", { cx: x, cy: y, r }, grp);
        el("circle", { class: "ring", cx: x + 1, cy: y - 1, r: r + 2.5 }, grp);
        el("text", { x, y: y + 5, "text-anchor": "middle" }, grp).textContent = ps.length;
        boxes.push({ x: x - r - 3, y: y - r - 3, w: 2 * r + 6, h: 2 * r + 6 });
      });
    }

    // 1. places that crowd the same spot on screen are grouped. Zoomed out, a group is one
    //    numbered circle; closer in, its icons fan out around the centre, each with a dot on
    //    its real spot and a pen line to the icon.
    const size = Math.max(18, Math.min(28, 14 + Math.log2(k) * 2));
    const placed = [];
    const placeIcon = (q, x, y, fanned) => {
      const w = size * q.p.categories.length;
      let box = { x: x - w / 2, y: y - size / 2, w, h: size };
      if (!fanned && hits(box)) {
        for (let ring = 1; ring <= 3 && hits(box); ring++) {
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + ring * 0.4;
            const nx = q.x0 + Math.cos(a) * size * 0.9 * ring, ny = q.y0 + Math.sin(a) * size * 0.9 * ring;
            const nb = { x: nx - w / 2, y: ny - size / 2, w, h: size };
            if (!hits(nb)) { x = nx; y = ny; box = nb; break; }
          }
        }
      }
      boxes.push(box);
      placed.push({ p: q.p, x, y, x0: q.x0, y0: q.y0, w, box });
    };
    const pts = [];
    if (k >= ADMIN_ZOOM) visible.forEach((p) => {
      const [x0, y0] = transform.apply(projection(lnglat(p)));
      if (inView(x0, y0, 40)) pts.push({ p, x0, y0 });
    });
    // Places join a group when they are within `reach` of any member (single linkage). Screen
    // distances only grow as you zoom in, so groups only ever split, never re-form.
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
    const groups = [...byRoot.values()].map((members) => ({ members, x: d3.mean(members, (q) => q.x0), y: d3.mean(members, (q) => q.y0) }));
    groups.sort((a, b) => b.members.length - a.members.length).forEach((G) => {
      const n = G.members.length;
      if (n === 1) return placeIcon(G.members[0], G.members[0].x0, G.members[0].y0, false);
      if (n <= SPREAD_MAX && k >= SPREAD_ZOOM) {
        // each icon goes in the direction of its real spot, so the pen lines never cross
        const rad = size * (n <= 2 ? 0.85 : n <= 4 ? 1.15 : 1.5);
        const ms = G.members.map((q) => ({ q, a: Math.atan2(q.y0 - G.y, q.x0 - G.x) })).sort((u, v) => u.a - v.a);
        const step = (2 * Math.PI) / n;
        let best = 0, bestCost = Infinity;
        for (let t = 0; t < 24; t++) {
          const off = (t / 24) * step;
          const cost = ms.reduce((s, m, i) => { const d = Math.abs(((m.a - (-Math.PI + off + i * step)) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI); return s + d * d; }, 0);
          if (cost < bestCost) { bestCost = cost; best = off; }
        }
        const slots = ms.map((m, i) => {
          const a = -Math.PI + best + i * step, w = size * m.q.p.categories.length;
          const x = G.x + Math.cos(a) * rad, y = G.y + Math.sin(a) * rad;
          return { q: m.q, x, y, box: { x: x - w / 2, y: y - size / 2, w, h: size } };
        });
        // once a group has fanned out it stays fanned: if it would run into something already
        // drawn, it opens a little wider instead of folding back into a circle
        let grow = 1;
        while (grow < 1.8 && slots.some((s) => hits(s.box))) {
          grow += 0.2;
          slots.forEach((s, i) => {
            const a = -Math.PI + best + i * step, w = s.box.w;
            s.x = G.x + Math.cos(a) * rad * grow; s.y = G.y + Math.sin(a) * rad * grow;
            s.box = { x: s.x - w / 2, y: s.y - size / 2, w, h: size };
          });
        }
        slots.forEach((s) => placeIcon(s.q, s.x, s.y, true));
        return;
      }
      const r = 10 + Math.min(9, Math.sqrt(n) * 2);
      const ids = G.members.map((q) => q.p.id).join(" ");
      const grp = el("g", { class: "cluster", tabindex: "0", role: "button", "data-ids": ids, "aria-label": n + " places close together, zoom in" }, g);
      el("circle", { cx: G.x, cy: G.y, r }, grp);
      el("circle", { class: "ring", cx: G.x + 1, cy: G.y - 1, r: r + 2.5 }, grp);
      el("text", { x: G.x, y: G.y + 5, "text-anchor": "middle" }, grp).textContent = n;
      el("title", {}, grp).textContent = G.members.map((q) => q.p.name).join(", ");
      boxes.push({ x: G.x - r - 3, y: G.y - r - 3, w: 2 * r + 6, h: 2 * r + 6 });
    });

    placed.forEach((it) => {
      const p = it.p;
      const grp = el("g", {
        class: "place" + (state.selectedId === p.id ? " selected" : ""),
        tabindex: "0", role: "button", "aria-label": p.name, "data-id": p.id,
      }, g);
      // moved aside to make room: a dot on the real spot and a pen line that stops at the icon's edge
      const dx = it.x - it.x0, dy = it.y - it.y0;
      const reachEdge = Math.hypot(dx / (it.w / 2), dy / (size * 0.45)); // ellipse hugging the drawing
      if (reachEdge > 1.15) {
        const ex = it.x - dx / reachEdge, ey = it.y - dy / reachEdge;
        el("path", { class: "leader", d: "M" + it.x0 + " " + it.y0 + "L" + ex + " " + ey }, grp);
        el("circle", { class: "spot", cx: it.x0, cy: it.y0, r: 2.4 }, grp);
      }
      el("ellipse", { class: "halo", cx: it.x, cy: it.y, rx: it.w / 2 + 5, ry: size / 2 + 5 }, grp);
      p.categories.forEach((c, i) => {
        const ig = el("g", { class: "icon", transform: "translate(" + (it.box.x + i * size) + " " + it.box.y + ") scale(" + size / 24 + ")" }, grp);
        ig.innerHTML = ICONS[c] || ICONS["friendly-house"];
      });
      // name tag, shown on hover, keyboard focus or selection (CSS); flips left near the right edge
      const tw = textWidth(p.name, "700 12px Kalam, cursive") + 12;
      const right = it.box.x + it.box.w + 4 + tw < W;
      const tx = right ? it.box.x + it.box.w + 4 : it.box.x - 4 - tw;
      const tag = el("g", { class: "name-tag" }, grp);
      el("rect", { x: tx, y: it.y - 10, width: tw, height: 20, rx: 3 }, tag);
      el("text", { x: tx + 6, y: it.y + 4 }, tag).textContent = p.name;
    });

    if (moving) return; // labels and towns wait until the map stops moving

    // 3. region names (inside countries whose regions are drawn), then country names
    const areaLabels = [];
    if (k >= ADMIN_ZOOM) Object.values(state.admin1).forEach((fc) => fc.features.forEach((f) => areaLabels.push({ f, kind: "region" })));
    state.countries.features.forEach((f) => areaLabels.push({ f, kind: "country" }));
    areaLabels.forEach(({ f, kind }) => {
      if (kind === "country" && state.admin1[f.properties.a3] && k >= ADMIN_ZOOM) return;
      const b = f._pb || (f._pb = path.bounds(f));
      const wpx = (b[1][0] - b[0][0]) * k, hpx = (b[1][1] - b[0][1]) * k;
      if (wpx < 70 || hpx < 26) return;
      if (!f._anchor) f._anchor = d3.geoCentroid(f);
      const [x, y] = transform.apply(projection(f._anchor));
      if (!inView(x, y, 0)) return;
      const text = f.properties.name.toUpperCase();
      const fs = kind === "country" ? Math.min(16, 10 + wpx / 80) : Math.min(14, 9 + wpx / 90);
      const font = (kind === "country" ? "400 " : "300 ") + fs + "px Kalam, cursive";
      const tw = textWidth(text, font) * 1.12 + 4;
      if (tw > wpx * 0.95) return;
      const bx = { x: x - tw / 2, y: y - fs / 2 - 2, w: tw, h: fs + 4 };
      if (hits(bx)) return;
      boxes.push(bx);
      el("text", { x, y: y + fs * 0.35, class: "area-label " + kind, "text-anchor": "middle", style: "font-size:" + fs.toFixed(1) + "px" }, g).textContent = text;
    });

    // 4. towns: biggest first, only as many as fit
    if (k >= ADMIN_ZOOM) {
      const minPop = k > 60 ? 40000 : k > 25 ? 100000 : k > 10 ? 300000 : 1000000;
      let count = 0;
      for (const row of state.cities) {
        if (count > 25) break;
        const [name, lng, lat, pop, capital, a3] = row;
        if (state.focusCountry && a3 !== state.focusCountry) continue;
        if (pop < minPop && !capital) continue;
        const [x, y] = transform.apply(projection([lng, lat]));
        if (!inView(x, y, 0)) continue;
        const big = pop > 1000000 || capital;
        const r = big ? 4.5 : pop > 200000 ? 3.6 : 2.6;
        const font = (big ? "400 " : "300 ") + "11px Kalam, cursive";
        const label = name.toUpperCase();
        const tw = textWidth(label, font) * 1.08;
        const dot = { x: x - r, y: y - r, w: r * 2, h: r * 2 };
        if (hits(dot)) continue;
        const cands = [{ x: x + r + 3, y: y - 13 }, { x: x - r - 3 - tw, y: y - 13 }, { x: x + r + 3, y: y + 2 }, { x: x - r - 3 - tw, y: y + 2 }];
        const lb = cands.map((c) => ({ x: c.x, y: c.y, w: tw, h: 12 })).find((b) => !hits(b));
        if (!lb) continue;
        boxes.push(dot, lb);
        const cg = el("g", { class: "city" + (big ? "" : " small") }, g);
        el("circle", { cx: x, cy: y, r }, cg);
        if (big) el("circle", { class: "dot", cx: x, cy: y, r: 1.4 }, cg);
        el("text", { x: lb.x, y: lb.y + 10 }, cg).textContent = label;
        count++;
      }
    }
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

  function onZoomEnd() {
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
    const crumbs = [{ label: "World", go: () => { select(null); setFocus({}); } }];
    let title = "The world";
    const c = state.focusCountry && state.countryById[state.focusCountry];
    if (c) {
      title = c.properties.name;
      if (state.focusRegion) crumbs.push({ label: c.properties.name, go: () => { select(null); setFocus({ country: c.properties.a3 }); } });
    }
    const r = state.focusRegion && state.regionById[state.focusRegion];
    if (r) title = r.properties.name;
    mapTitleEl.textContent = title;
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
    return r ? r.properties.name : c ? c.properties.name : "the world";
  }

  function renderList() {
    const here = placesInFocus();
    listTitleEl.innerHTML = here.length
      ? "<b>" + here.length + "</b> place" + (here.length === 1 ? "" : "s") + " in " + esc(focusName())
      : "No places in " + esc(focusName()) + " yet";
    legendEl.innerHTML = "";
    state.categories.forEach((c) => {
      const places = here.filter((p) => p.categories.includes(c.id));
      if (!places.length) return;
      const group = document.createElement("section");
      group.className = "legend-group";
      if (state.hidden.has(c.id)) group.setAttribute("data-off", "");
      group.innerHTML =
        '<button class="legend-head" type="button" aria-pressed="' + !state.hidden.has(c.id) + '" title="' + esc(c.label_it || c.label_en) + '">' +
        iconSvg(c.id, 26) + '<span class="label">' + esc(c.label_en) + '</span><span class="count">' + places.length + "</span></button>" +
        "<ul>" + places.map((p) => '<li><button type="button" data-id="' + esc(p.id) + '" aria-current="' + (p.id === state.selectedId) + '">' + esc(p.name) + "</button></li>").join("") + "</ul>";
      const head = group.querySelector(".legend-head");
      head.addEventListener("click", () => {
        if (state.hidden.has(c.id)) state.hidden.delete(c.id); else state.hidden.add(c.id);
        renderList();
        scheduleMarks();
      });
      group.querySelectorAll("li button").forEach((b) => b.addEventListener("click", () => select(b.dataset.id, { zoom: true })));
      legendEl.appendChild(group);
    });
    const np = state.notYetPlaced.filter((p) =>
      state.focusRegion ? p.region === state.focusRegion : state.focusCountry ? String(p.region).startsWith(state.focusCountry + "-") : true);
    unplacedEl.hidden = !np.length;
    if (np.length) unplacedEl.innerHTML = "<h3>Not on the map yet</h3><p>" + np.map((p) => esc(p.name)).join(", ") + ".</p>";
  }

  // ---------- note ----------
  function showWelcome() {
    noteEl.dataset.tone = "green";
    const n = placesInFocus().length;
    noteEl.innerHTML = state.focusRegion || state.focusCountry
      ? (n ? '<p class="hint">Tap a place</p><p>' + n + " places in " + esc(focusName()) + ". Tap a type in the list to hide or show it, or a neighbouring region to move there.</p>"
           : '<p class="hint">' + esc(focusName()) + "</p><p>No places here yet. Brown regions have places; grey ones are still empty.</p>")
      : '<p class="hint">Zoom in or tap a country</p><p>Brown areas have places, grey ones are still empty.</p>';
  }

  function showPlace(p) {
    noteEl.dataset.tone = NOTE_TONES[state.places.indexOf(p) % NOTE_TONES.length];
    const kinds = p.categories.map((c) => '<span class="kind">' + iconSvg(c, 24) + esc(state.catById[c] ? state.catById[c].label_en : c) + "</span>").join("");
    const site = p.website ? '<a href="' + esc(p.website) + '" target="_blank" rel="noopener">' + esc(p.website.replace(/^https?:\/\//, "")) + "</a>" : "not added yet";
    noteEl.innerHTML =
      '<button class="close" type="button" aria-label="Close">×</button>' +
      "<h2>" + esc(p.name) + "</h2>" +
      '<div class="kinds">' + kinds + "</div>" +
      "<p>" + (p.description ? esc(p.description) : "No description yet.") + "</p>" +
      "<dl><dt>where</dt><dd>" + esc(p.near || "") + "</dd>" +
      "<dt>website</dt><dd>" + site + "</dd>" +
      "<dt>contact</dt><dd>" + (p.contact ? esc(p.contact) : "not added yet") + "</dd></dl>";
    noteEl.querySelector(".close").addEventListener("click", () => select(null));
  }

  function select(id, opts) {
    state.selectedId = id;
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
    state.categories = places.categories;
    state.notYetPlaced = places.not_yet_placed || [];
    state.catById = Object.fromEntries(state.categories.map((c) => [c.id, c]));
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
