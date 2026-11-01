/* Roots: hand-drawn map of conscious places.

   Data is global and the drawing is per region:
   - data/places.json    every place in the world, with lat/lng, plus the categories
   - data/regions.json   the regions you can open (Piemonte, Nederland, ...)
   - data/basemaps/*.geojson   one pen drawing per region, made by tools/build_basemap.py
   Adding a region never needs code changes: add it to regions.json and build its basemap. */
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

  const svg = document.getElementById("map");
  const noteEl = document.getElementById("note");
  const legendEl = document.getElementById("legend");
  const unplacedEl = document.getElementById("unplaced");
  const regionsEl = document.getElementById("regions");

  let data, regions, region, basemap, catById, projection, zoom;
  let transform = d3.zoomIdentity;
  let W = 900, H = 1000;
  const hidden = new Set();
  const basemapCache = {};
  let selectedId = null;

  // ---------- helpers ----------
  function el(name, attrs, parent) {
    const n = document.createElementNS(SVG_NS, name);
    for (const k in attrs || {}) if (attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function iconSvg(cat, size) {
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" aria-hidden="true"><g class="icon">' + (ICONS[cat] || ICONS["friendly-house"]) + "</g></svg>";
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function wrapLabel(name) {
    if (name.length <= 16) return [name];
    const mid = name.length / 2;
    let best = -1;
    for (let i = 0; i < name.length; i++) if (name[i] === " " && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
    return best < 0 ? [name] : [name.slice(0, best), name.slice(best + 1)];
  }
  function inRegion(p) {
    if (!p.location || !basemap) return false;
    const [x0, y0, x1, y1] = basemap.focus_bbox || basemap.bbox;
    return p.location.lng >= x0 && p.location.lng <= x1 && p.location.lat >= y0 && p.location.lat <= y1;
  }
  const regionPlaces = () => data.places.filter(inRegion);
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- drawing ----------
  let gGeo, gMarks;

  function setupSvg() {
    svg.innerHTML = "";
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    const defs = el("defs", {}, svg);
    // Two slightly different wobbles: each outline is drawn twice, like a pen line gone over again.
    [["ink-a", 7, 2.6], ["ink-b", 23, 3.4], ["ink-fine", 11, 1.3]].forEach(([id, seed, scale]) => {
      const f = el("filter", { id, x: "-5%", y: "-5%", width: "110%", height: "110%" }, defs);
      el("feTurbulence", { type: "fractalNoise", baseFrequency: "0.045", numOctaves: "2", seed, result: "n" }, f);
      el("feDisplacementMap", { in: "SourceGraphic", in2: "n", scale, xChannelSelector: "R", yChannelSelector: "G" }, f);
    });
    // Pen hatching for water
    const pat = el("pattern", { id: "hatch", width: "7", height: "7", patternUnits: "userSpaceOnUse", patternTransform: "rotate(35)" }, defs);
    el("line", { x1: 0, y1: 0, x2: 0, y2: 7, stroke: "#1b1a17", "stroke-width": ".7", opacity: ".45" }, pat);

    gGeo = el("g", {}, svg);
    gMarks = el("g", { filter: "url(#ink-fine)" }, svg);
  }

  const project = (lnglat) => transform.apply(projection(lnglat));

  function drawGeo() {
    gGeo.innerHTML = "";
    const path = d3.geoPath(projection);
    const by = (role) => basemap.features.filter((f) => f.properties.role === role);
    const ns = { "vector-effect": "non-scaling-stroke" };
    const t = transform.toString();

    const fills = el("g", { transform: t }, gGeo);
    const linesA = el("g", { transform: t, filter: "url(#ink-a)" }, gGeo);
    const linesB = el("g", { transform: t, filter: "url(#ink-b)" }, gGeo);

    by("water").forEach((f) => {
      const d = path(f);
      el("path", { d, class: "water" }, fills);
      el("path", { d, class: "water-hatch" }, fills);
      el("path", Object.assign({ d, class: "water-line" }, ns), linesA);
    });
    by("land").forEach((f) => {
      const d = path(f);
      el("path", { d, class: "land" }, fills);
      el("path", Object.assign({ d, class: "land-line a" }, ns), linesA);
      el("path", Object.assign({ d, class: "land-line b" }, ns), linesB);
    });
    by("neighbour-border").forEach((f) => el("path", Object.assign({ d: path(f), class: "neighbour-border" }, ns), linesA));
    by("inner-border").forEach((f) => el("path", Object.assign({ d: path(f), class: "inner-border" }, ns), linesB));
    by("river").forEach((f) => el("path", Object.assign({ d: path(f), class: "river" }, ns), linesA));
  }

  function drawMarks() {
    gMarks.innerHTML = "";
    const k = transform.k;
    const by = (role) => basemap.features.filter((f) => f.properties.role === role);

    by("label").forEach((f) => {
      if (f.properties.kind === "title") {
        // Notebook heading: big pen capitals with a double underline, fixed to the page corner
        const lines = (f.properties.lines || [f.properties.name]).map((s) => s.toUpperCase());
        const longest = Math.max(...lines.map((s) => s.length));
        const room = W - (matchMedia("(max-width: 760px)").matches ? 60 : Math.min(330, W * 0.36));
        const size = Math.round(Math.min(36, room / (longest * 0.72)));
        const x = 28;
        let y = 18;
        lines.forEach((line) => {
          y += size * 1.05;
          el("text", { x, y, class: "title-label", style: "font-size:" + size + "px" }, gMarks).textContent = line;
        });
        const width = Math.min(room - 20, longest * size * 0.7);
        el("path", { class: "title-rule", d: "M" + (x - 4) + " " + (y + 9) + "h" + width }, gMarks);
        el("path", { class: "title-rule", d: "M" + (x + 2) + " " + (y + 14) + "h" + (width - 12) }, gMarks);
      } else {
        const [x, y] = project(f.geometry.coordinates);
        const t = el("text", { x, y, class: "neighbour-label", "text-anchor": "middle" }, gMarks);
        t.textContent = f.properties.name.toUpperCase();
      }
    });

    by("city").forEach((f) => {
      const [x, y] = project(f.geometry.coordinates);
      const s = f.properties.size;
      const g = el("g", { class: "city " + s }, gMarks);
      el("circle", { cx: x, cy: y, r: s === "big" ? 5.5 : s === "town" ? 4 : 2.8 }, g);
      if (s === "big") el("circle", { class: "dot", cx: x, cy: y, r: 1.6 }, g);
      if (s !== "small" || k > 1.5) {
        const t = el("text", { x: x + 7, y: y - 6 }, g);
        t.textContent = f.properties.name.toUpperCase();
      }
    });

    const iconSize = Math.min(28, 20 + (k - 1) * 4);
    regionPlaces().forEach((p) => {
      const [x, y] = project([p.location.lng, p.location.lat]);
      const g = el("g", {
        class: "place" + (selectedId === p.id ? " selected" : "") + (p.categories.every((c) => hidden.has(c)) ? " off" : ""),
        tabindex: "0",
        role: "button",
        "aria-label": p.name,
        "data-id": p.id,
      }, gMarks);
      const w = iconSize * p.categories.length;
      el("ellipse", { class: "halo", cx: x, cy: y, rx: w / 2 + 6, ry: iconSize / 2 + 6 }, g);
      p.categories.forEach((c, i) => {
        const ig = el("g", { class: "icon", transform: "translate(" + (x - w / 2 + i * iconSize) + " " + (y - iconSize / 2) + ") scale(" + iconSize / 24 + ")" }, g);
        ig.innerHTML = ICONS[c] || ICONS["friendly-house"];
      });
      // Names show once zoomed in, so the overview stays readable
      const label = k >= 1.8 || selectedId === p.id ? wrapLabel(p.name) : [];
      label.forEach((line, i) => {
        const t = el("text", { x: x + w / 2 + 3, y: y + 3 + i * 12 - (label.length - 1) * 6 }, g);
        t.textContent = line;
      });
      el("title", {}, g).textContent = p.name;
    });
  }

  function redraw() {
    drawGeo();
    drawMarks();
  }

  // ---------- note ----------
  function showWelcome() {
    noteEl.dataset.tone = "green";
    const n = regionPlaces().length;
    noteEl.innerHTML = n
      ? '<p class="hint">Tap a place on the map</p><p>' + n + " places in " + esc(region.name) + ". Tap a type in the list to hide or show it.</p>"
      : '<p class="hint">' + esc(region.name) + "</p><p>" + esc(region.note || "No places here yet.") + "</p>";
  }

  function showPlace(p) {
    noteEl.dataset.tone = NOTE_TONES[data.places.indexOf(p) % NOTE_TONES.length];
    const kinds = p.categories.map((c) => '<span class="kind">' + iconSvg(c, 24) + esc(catById[c] ? catById[c].label_en : c) + "</span>").join("");
    const site = p.website
      ? '<a href="' + esc(p.website) + '" target="_blank" rel="noopener">' + esc(p.website.replace(/^https?:\/\//, "")) + "</a>"
      : "not added yet";
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
    selectedId = id;
    const p = id && data.places.find((x) => x.id === id);
    if (p) showPlace(p); else showWelcome();
    legendEl.querySelectorAll("li button").forEach((b) => b.setAttribute("aria-current", String(b.dataset.id === id)));
    if (p && opts && opts.focus) {
      const [x, y] = projection([p.location.lng, p.location.lat]);
      const k = Math.max(transform.k, 2.2);
      d3.select(svg).transition().duration(reduceMotion() ? 0 : 600)
        .call(zoom.transform, d3.zoomIdentity.translate(W / 2 - x * k, H / 2 - y * k).scale(k));
    } else {
      drawMarks();
    }
    if (p && matchMedia("(max-width: 760px)").matches) noteEl.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "nearest" });
  }

  // ---------- list of places ----------
  function buildLegend() {
    legendEl.innerHTML = "";
    const here = regionPlaces();
    if (!here.length) legendEl.innerHTML = '<p class="empty">No places in ' + esc(region.name) + " yet.</p>";
    data.categories.forEach((c) => {
      const places = here.filter((p) => p.categories.includes(c.id));
      if (!places.length) return;
      const group = document.createElement("section");
      group.className = "legend-group";
      if (hidden.has(c.id)) group.setAttribute("data-off", "");
      group.innerHTML =
        '<button class="legend-head" type="button" aria-pressed="' + !hidden.has(c.id) + '" title="' + esc(c.label_it || c.label_en) + '">' +
        iconSvg(c.id, 26) + '<span class="label">' + esc(c.label_en) + '</span><span class="count">' + places.length + "</span></button>" +
        "<ul>" + places.map((p) => '<li><button type="button" data-id="' + esc(p.id) + '">' + esc(p.name) + "</button></li>").join("") + "</ul>";
      const head = group.querySelector(".legend-head");
      head.addEventListener("click", () => {
        if (hidden.has(c.id)) hidden.delete(c.id); else hidden.add(c.id);
        const on = !hidden.has(c.id);
        head.setAttribute("aria-pressed", String(on));
        if (on) group.removeAttribute("data-off"); else group.setAttribute("data-off", "");
        drawMarks();
      });
      group.querySelectorAll("li button").forEach((b) => b.addEventListener("click", () => select(b.dataset.id, { focus: true })));
      legendEl.appendChild(group);
    });

    const np = (data.not_yet_placed || []).filter((p) => (p.region || "piemonte") === region.id);
    unplacedEl.hidden = !np.length;
    if (np.length) unplacedEl.innerHTML = "<h3>Not on the map yet</h3><p>" + np.map((p) => esc(p.name)).join(", ") + ".</p>";
  }

  function buildRegionTabs() {
    regionsEl.innerHTML = regions.regions
      .map((r) => '<li><a href="#' + esc(r.id) + '"' + (region && r.id === region.id ? ' aria-current="page"' : "") + ">" + esc(r.name) + "</a></li>")
      .join("");
  }

  // ---------- setup ----------
  function sizeToContainer() {
    const r = svg.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    // drawing units follow the screen (520–900 across) so pen lines and text stay legible on phones
    W = Math.round(Math.max(520, Math.min(900, r.width)));
    H = Math.max(420, Math.min(1500, Math.round((W * r.height) / r.width)));
  }

  function fitProjection() {
    const land = basemap.features.find((f) => f.properties.role === "land");
    const narrow = matchMedia("(max-width: 760px)").matches;
    // leave room for the notebook heading on top and the post-it on the right
    const right = narrow ? W - 30 : W - Math.min(280, W * 0.32);
    const lines = (basemap.features.find((f) => f.properties.kind === "title") || { properties: {} }).properties.lines || [""];
    const top = 40 + lines.length * 38;
    projection = d3.geoMercator().fitExtent([[40, top], [right, H - 40]], land);
  }

  function draw() {
    sizeToContainer();
    setupSvg();
    fitProjection();
    transform = d3.zoomIdentity;
    zoom = d3.zoom().scaleExtent([1, 10]).on("zoom", (ev) => {
      transform = ev.transform;
      redraw();
    });
    d3.select(svg).call(zoom).on("dblclick.zoom", null);
    d3.select(svg).call(zoom.transform, d3.zoomIdentity);
  }

  function loadBasemap(r) {
    if (!basemapCache[r.id]) basemapCache[r.id] = fetch(r.basemap).then((res) => res.json());
    return basemapCache[r.id];
  }

  function openRegion() {
    const id = location.hash.replace("#", "");
    const r = regions.regions.find((x) => x.id === id) || regions.regions.find((x) => x.id === regions.default) || regions.regions[0];
    region = r;
    selectedId = null;
    buildRegionTabs();
    return loadBasemap(r).then((bm) => {
      if (region !== r) return;
      basemap = bm;
      buildLegend();
      showWelcome();
      draw();
    });
  }

  svg.addEventListener("click", (ev) => {
    const g = ev.target.closest(".place");
    if (g) select(g.dataset.id);
  });
  svg.addEventListener("keydown", (ev) => {
    const g = ev.target.closest && ev.target.closest(".place");
    if (g && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); select(g.dataset.id); }
  });
  document.getElementById("zoom-in").addEventListener("click", () => d3.select(svg).transition().duration(300).call(zoom.scaleBy, 1.6));
  document.getElementById("zoom-out").addEventListener("click", () => d3.select(svg).transition().duration(300).call(zoom.scaleBy, 1 / 1.6));
  document.getElementById("zoom-reset").addEventListener("click", () => d3.select(svg).transition().duration(400).call(zoom.transform, d3.zoomIdentity));
  window.addEventListener("hashchange", () => { if (regions) openRegion(); });
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => basemap && draw(), 200);
  });

  Promise.all([fetch("data/places.json").then((r) => r.json()), fetch("data/regions.json").then((r) => r.json())])
    .then(([places, regs]) => {
      data = places;
      regions = regs;
      catById = Object.fromEntries(data.categories.map((c) => [c.id, c]));
      return openRegion();
    })
    .catch((err) => {
      noteEl.innerHTML = '<p class="hint">The map could not load.</p><p>' + esc(err.message) + "</p>";
    });
})();
