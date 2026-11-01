/* Roots: hand-drawn map of conscious places.
   Data: data/map.geojson (the base drawing) and data/places.json (places + categories).
   Swapping both files for another region (e.g. the Netherlands) is all it takes to redraw. */
(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  // Icons copied from the paper map's legend, drawn on a 24x24 grid.
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
  const side = document.getElementById("side");
  const noteEl = document.getElementById("note");
  const legendEl = document.getElementById("legend");
  const unplacedEl = document.getElementById("unplaced");

  let data, mapGeo, catById, projection, transform = d3.zoomIdentity, zoom;
  let W = 900, H = 1000;
  const hidden = new Set();
  let selectedId = null;

  function el(name, attrs, parent) {
    const n = document.createElementNS(SVG_NS, name);
    for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function iconSvg(cat, size) {
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" aria-hidden="true"><g class="icon">' + ICONS[cat] + "</g></svg>";
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Break long names at the space nearest the middle, like the hand lettering does.
  function wrapLabel(name) {
    if (name.length <= 14) return [name];
    const mid = name.length / 2;
    let best = -1;
    for (let i = 0; i < name.length; i++) if (name[i] === " " && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
    return best < 0 ? [name] : [name.slice(0, best), name.slice(best + 1)];
  }

  // ---------- drawing ----------
  let gGeo, gMarks;

  function setupSvg() {
    svg.innerHTML = "";
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    const defs = el("defs", {}, svg);
    // Ink wobble: displaces every line a little so it reads as drawn by hand.
    const f = el("filter", { id: "ink", x: "-5%", y: "-5%", width: "110%", height: "110%" }, defs);
    el("feTurbulence", { type: "fractalNoise", baseFrequency: "0.035", numOctaves: "2", seed: "7", result: "n" }, f);
    el("feDisplacementMap", { in: "SourceGraphic", in2: "n", scale: "3.2", xChannelSelector: "R", yChannelSelector: "G" }, f);
    // Paper grain
    const p = el("filter", { id: "grain" }, defs);
    el("feTurbulence", { type: "fractalNoise", baseFrequency: "0.9", numOctaves: "2", seed: "3", result: "t" }, p);
    el("feColorMatrix", { in: "t", type: "matrix", values: "0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0.07 0" }, p);
    el("rect", { x: 0, y: 0, width: W, height: H, fill: "transparent", filter: "url(#grain)", "pointer-events": "none" }, svg);

    gGeo = el("g", { filter: "url(#ink)" }, svg);
    gMarks = el("g", {}, svg);
  }

  function project(coords) {
    const p = projection(coords);
    return transform.apply(p);
  }

  function drawGeo() {
    gGeo.innerHTML = "";
    const path = d3.geoPath(projection);
    const inner = el("g", { transform: transform.toString() }, gGeo);
    const by = (role) => mapGeo.features.filter((f) => f.properties.role === role);
    const ns = { "vector-effect": "non-scaling-stroke" };

    by("sea").forEach((f) => el("path", Object.assign({ d: path(f), class: "water" }, ns), inner));
    by("neighbour-border").forEach((f) => el("path", Object.assign({ d: path(f), class: "neighbour-border" }, ns), inner));
    by("land").forEach((f) => el("path", Object.assign({ d: path(f), class: "land" }, ns), inner));
    by("inner-border").forEach((f) => el("path", Object.assign({ d: path(f), class: "inner-border" }, ns), inner));
    by("lake").forEach((f) => el("path", Object.assign({ d: path(f), class: "water" }, ns), inner));
    by("road").forEach((f) => {
      const minor = f.properties.kind === "minor" ? " road-minor" : "";
      el("path", Object.assign({ d: path(f), class: "road-casing" + minor }, ns), inner);
    });
    by("road").forEach((f) => {
      const minor = f.properties.kind === "minor" ? " road-minor" : "";
      el("path", Object.assign({ d: path(f), class: "road-fill" + minor }, ns), inner);
    });
  }

  function drawMarks() {
    gMarks.innerHTML = "";
    const k = transform.k;
    const by = (role) => mapGeo.features.filter((f) => f.properties.role === role);

    by("label").forEach((f) => {
      const [x, y] = project(f.geometry.coordinates);
      const t = el("text", {
        x, y,
        class: f.properties.kind === "region" ? "region-label" : "country-label",
        "text-anchor": f.properties.anchor || "middle",
        style: f.properties.kind === "region" ? "font-size:" + Math.round(W / 30) + "px" : "",
        transform: "rotate(" + (f.properties.rotate || 0) + " " + x + " " + y + ")",
      }, gMarks);
      t.textContent = f.properties.name.toUpperCase();
    });

    by("landmark").forEach((f) => {
      const [x, y] = project(f.geometry.coordinates);
      el("path", { class: "landmark", d: "M" + (x - 9) + " " + (y + 7) + "L" + x + " " + (y - 9) + "L" + (x + 9) + " " + (y + 7) + "Z" }, gMarks);
    });

    by("city").forEach((f) => {
      const [x, y] = project(f.geometry.coordinates);
      const s = f.properties.size;
      const g = el("g", { class: "city " + s }, gMarks);
      el("circle", { cx: x, cy: y, r: s === "big" ? 7 : s === "town" ? 5.5 : 3.6 }, g);
      if (s !== "small" || k > 1.4) {
        const pos = f.properties.label || "ne";
        const t = el("text", {
          x: pos[1] === "e" ? x + 8 : x - 8,
          y: pos[0] === "n" ? y - 7 : y + 16,
          "text-anchor": pos[1] === "e" ? "start" : "end",
        }, g);
        t.textContent = f.properties.name.toUpperCase();
      }
    });

    const iconSize = Math.min(26, 18 + (k - 1) * 4);
    data.places.forEach((p) => {
      const [x, y] = project([p.location.lng, p.location.lat]);
      const g = el("g", {
        class: "place" + (selectedId === p.id ? " selected" : "") + (p.categories.every((c) => hidden.has(c)) ? " off" : ""),
        tabindex: "0",
        role: "button",
        "aria-label": p.name,
        "data-id": p.id,
      }, gMarks);
      const n = p.categories.length;
      const w = iconSize * n;
      el("ellipse", { class: "halo", cx: x, cy: y, rx: w / 2 + 6, ry: iconSize / 2 + 6 }, g);
      p.categories.forEach((c, i) => {
        const ix = x - w / 2 + i * iconSize;
        const ig = el("g", { class: "icon", transform: "translate(" + ix + " " + (y - iconSize / 2) + ") scale(" + iconSize / 24 + ")" }, g);
        ig.innerHTML = ICONS[c];
      });
      // Names appear once you zoom in (or on hover/selection) so the overview stays readable.
      const showLabel = k >= 1.8 || selectedId === p.id;
      const label = showLabel ? wrapLabel(p.name.toUpperCase()) : [];
      label.forEach((line, i) => {
        const t = el("text", { x: x + w / 2 + 3, y: y - 1 + i * 10.5 - (label.length - 1) * 5 }, g);
        t.textContent = line;
      });
      const title = el("title", {}, g);
      title.textContent = p.name;
    });
  }

  function redraw() {
    drawGeo();
    drawMarks();
  }

  // ---------- note (info card) ----------
  function showWelcome() {
    noteEl.dataset.tone = "green";
    const count = data.places.length;
    noteEl.innerHTML =
      '<p class="hint">Tap a place on the map</p>' +
      "<p>" + count + " places from the hand-drawn map of Piemonte and Valle d'Aosta. Tap a category below to hide or show it.</p>";
  }

  function showPlace(p) {
    const tone = NOTE_TONES[data.places.indexOf(p) % NOTE_TONES.length];
    noteEl.dataset.tone = tone;
    const kinds = p.categories
      .map((c) => '<span class="kind">' + iconSvg(c, 22) + esc(catById[c].label_en) + "</span>")
      .join("");
    const desc = p.description ? "<p>" + esc(p.description) + "</p>" : "<p>No description yet.</p>";
    const site = p.website
      ? '<a href="' + esc(p.website) + '" target="_blank" rel="noopener">' + esc(p.website.replace(/^https?:\/\//, "")) + "</a>"
      : "Not added yet";
    noteEl.innerHTML =
      '<button class="close" type="button" aria-label="Close">×</button>' +
      "<h2>" + esc(p.name) + "</h2>" +
      '<div class="kinds">' + kinds + "</div>" +
      desc +
      "<dl><dt>Where</dt><dd>" + esc(p.near) + "</dd>" +
      "<dt>Website</dt><dd>" + site + "</dd>" +
      "<dt>Contact</dt><dd>" + (p.contact ? esc(p.contact) : "Not added yet") + "</dd></dl>";
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
      d3.select(svg).transition().duration(matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600)
        .call(zoom.transform, d3.zoomIdentity.translate(W / 2 - x * k, H / 2 - y * k).scale(k));
    } else {
      drawMarks();
    }
    if (p && window.matchMedia("(max-width: 760px)").matches) {
      noteEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  // ---------- legend ----------
  function buildLegend() {
    legendEl.innerHTML = "";
    data.categories.forEach((c) => {
      const places = data.places.filter((p) => p.categories.includes(c.id));
      if (!places.length) return;
      const group = document.createElement("section");
      group.className = "legend-group";
      group.innerHTML =
        '<button class="legend-head" type="button" aria-pressed="true" title="' + esc(c.label_it) + '">' +
        iconSvg(c.id, 24) + "<span>" + esc(c.label_en.toUpperCase()) + "</span>" +
        '<span class="count">' + places.length + "</span></button>" +
        "<ul>" + places.map((p) => '<li><button type="button" data-id="' + esc(p.id) + '">' + esc(p.name.toUpperCase()) + "</button></li>").join("") + "</ul>";
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

    const np = data.not_yet_placed || [];
    if (np.length) {
      unplacedEl.hidden = false;
      unplacedEl.innerHTML = "<h3>NOT ON THE MAP YET</h3><p>" + np.map((p) => esc(p.name)).join(", ") + ".</p>";
    }
  }

  // ---------- setup ----------
  function fitProjection() {
    const land = mapGeo.features.find((f) => f.properties.role === "land");
    const pad = 40;
    projection = d3.geoMercator().fitExtent([[pad, pad + 70], [W - pad, H - pad]], land);
  }

  function sizeToContainer() {
    const r = svg.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    // drawing units track the screen (between 520 and 900 across) so icons and text stay legible on phones
    W = Math.round(Math.max(520, Math.min(900, r.width)));
    H = Math.round((W * r.height) / r.width);
    H = Math.max(420, Math.min(1500, H));
  }

  function init() {
    sizeToContainer();
    setupSvg();
    fitProjection();
    zoom = d3.zoom().scaleExtent([1, 8]).on("zoom", (ev) => {
      transform = ev.transform;
      redraw();
    });
    d3.select(svg).call(zoom).on("dblclick.zoom", null);
    transform = d3.zoomIdentity;
    redraw();
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

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(init, 200);
  });

  Promise.all([fetch("data/places.json").then((r) => r.json()), fetch("data/map.geojson").then((r) => r.json())])
    .then(([places, geo]) => {
      data = places;
      mapGeo = geo;
      catById = Object.fromEntries(data.categories.map((c) => [c.id, c]));
      buildLegend();
      showWelcome();
      init();
    })
    .catch((err) => {
      noteEl.innerHTML = '<p class="hint">The map data could not load.</p><p>' + esc(err.message) + "</p>";
    });
})();
