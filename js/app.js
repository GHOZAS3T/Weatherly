import { searchCities, reverse, getForecast, code, icon, temp, wind, pressure, compass, uvLevel, aqiLevel, notices } from "./api.js";

const $ = (s) => document.querySelector(s);
const view = $("#view"), q = $("#q"), sugg = $("#sugg"), statusEl = $("#status");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem("wly:" + k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("wly:" + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const S = { unit: store.get("unit", "c"), theme: store.get("theme", "sky"), place: null, data: null, tab: "temp", range: 48, favs: store.get("favs", []), recents: store.get("recents", []) };
const THEMES = ["sky", "midnight", "light"];
const POPULAR = [["Lagos", "Nigeria", 6.5244, 3.3792], ["London", "United Kingdom", 51.5074, -0.1278], ["New York", "United States", 40.7128, -74.006], ["Tokyo", "Japan", 35.6762, 139.6503], ["Sydney", "Australia", -33.8688, 151.2093], ["Dubai", "United Arab Emirates", 25.2048, 55.2708]];
const key = (p) => `${(+p.latitude).toFixed(2)},${(+p.longitude).toFixed(2)}`;
const label = (p) => [p.name, p.admin1 && p.admin1 !== p.name ? p.admin1 : null, p.country].filter(Boolean).join(", ");
const say = (m) => { statusEl.textContent = m; };
const mins = (s) => +s.slice(11, 13) * 60 + +s.slice(14, 16);
const hour = (s, tz) => new Date(s + "Z").toLocaleTimeString("en", { hour: "numeric", timeZone: "UTC" }).replace(" ", "").toLowerCase();

/* ---------- Sky: palette + particles ---------- */
const PAL = {
  clear: { d: ["#1b5dae", "#79bdf0"], n: ["#060a1d", "#1c2b60"] }, cloud: { d: ["#46597a", "#9db0c6"], n: ["#0d1322", "#2a3449"] },
  rain: { d: ["#2c3c54", "#697c94"], n: ["#070c16", "#1c2636"] }, storm: { d: ["#1d2232", "#494e66"], n: ["#05070d", "#171a2b"] },
  snow: { d: ["#6a84a2", "#cdd9e8"], n: ["#121a2c", "#3a4966"] }, fog: { d: ["#68788a", "#b3bec8"], n: ["#11161c", "#313a45"] },
};
const GROUP = { clear: "clear", part: "clear", cloud: "cloud", drizzle: "rain", rain: "rain", snow: "snow", storm: "storm", fog: "fog" };
const cv = $("#sky"), g = cv.getContext("2d");
let scene = { kind: "clear", day: 1 }, parts = [], flash = 0;
const reduce = matchMedia("(prefers-reduced-motion: reduce)");

function setSky(kind = "clear", day = 1) {
  scene = { kind, day };
  const grp = GROUP[kind] || "cloud";
  const [a, b] = S.theme === "midnight" ? ["#060a1d", "#17214a"] : S.theme === "light" ? ["#dbe7f5", "#f5f8fc"] : PAL[grp][day ? "d" : "n"];
  document.body.style.setProperty("--s1", a);
  document.body.style.setProperty("--s2", b);
  document.body.dataset.theme = S.theme;
  const n = grp === "rain" || grp === "storm" ? 160 : grp === "snow" ? 110 : (grp === "clear" && (!day || S.theme === "midnight")) ? 90 : 0;
  parts = Array.from({ length: n }, () => ({ x: Math.random(), y: Math.random(), z: 0.4 + Math.random() * 0.6 }));
}
function resize() { const r = devicePixelRatio || 1; cv.width = innerWidth * r; cv.height = innerHeight * r; g.setTransform(r, 0, 0, r, 0, 0); }
function frame(t) {
  g.clearRect(0, 0, innerWidth, innerHeight);
  const grp = GROUP[scene.kind], ink = S.theme === "light" ? "40,70,110" : "255,255,255", W = innerWidth, H = innerHeight;
  if (grp === "clear" && scene.day && S.theme !== "midnight") {
    const r = g.createRadialGradient(W * 0.85, H * 0.1, 0, W * 0.85, H * 0.1, W * 0.6);
    r.addColorStop(0, "rgba(255,226,160,.55)"); r.addColorStop(1, "rgba(255,226,160,0)");
    g.fillStyle = r; g.fillRect(0, 0, W, H);
  }
  for (const p of parts) {
    if (!reduce.matches) p.y += (grp === "snow" ? 0.0007 : grp === "clear" ? 0 : 0.012) * p.z;
    if (p.y > 1) { p.y = 0; p.x = Math.random(); }
    const x = p.x * W, y = p.y * H;
    if (grp === "snow") { g.fillStyle = `rgba(${ink},${0.5 * p.z})`; g.beginPath(); g.arc(x + Math.sin(t / 900 + p.x * 9) * 8, y, 1.2 + p.z * 2, 0, 7); g.fill(); }
    else if (grp === "clear") { g.fillStyle = `rgba(255,255,255,${0.25 + 0.5 * Math.abs(Math.sin(t / 1500 + p.x * 40))})`; g.fillRect(x, p.y * H * 0.7, 1.4 * p.z, 1.4 * p.z); }
    else { g.strokeStyle = `rgba(${ink},${0.35 * p.z})`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y + 14 * p.z); g.stroke(); }
  }
  if (grp === "storm" && !reduce.matches) {
    if (flash <= 0 && Math.random() < 0.004) flash = 1;
    if (flash > 0) { g.fillStyle = `rgba(255,255,255,${flash * 0.18})`; g.fillRect(0, 0, W, H); flash -= 0.06; }
  }
  if (!document.hidden && (!reduce.matches || grp === "clear")) requestAnimationFrame(frame);
}
addEventListener("resize", resize);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { requestAnimationFrame(frame); if (S.data && Date.now() - S.data.fetchedAt > 10 * 60 * 1000) load(S.place, { force: true }); } });
reduce.addEventListener("change", () => requestAnimationFrame(frame));

/* ---------- Charts (hand-built SVG, no library) ---------- */
function curve(pts) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) { const mx = (pts[i - 1][0] + pts[i][0]) / 2; d += ` C${mx},${pts[i - 1][1]} ${mx},${pts[i][1]} ${pts[i][0]},${pts[i][1]}`; }
  return d;
}
function drawChart(box, rows) {
  const w = Math.max(box.clientWidth, 280), h = 220, m = { l: 36, r: 10, t: 14, b: 26 };
  const isT = S.tab === "temp", isP = S.tab === "rain";
  const val = (r) => (isT ? (S.unit === "f" ? r.t * 1.8 + 32 : r.t) : isP ? r.pop : S.unit === "f" ? r.gust * 0.621371 : r.gust);
  const vs = rows.map(val);
  let lo = isT ? Math.floor(Math.min(...vs) - 1) : 0, hi = isP ? 100 : Math.ceil(Math.max(...vs, isT ? lo + 4 : 10));
  const X = (i) => m.l + (i / (rows.length - 1)) * (w - m.l - m.r), Y = (v) => m.t + (1 - (v - lo) / (hi - lo || 1)) * (h - m.t - m.b);
  const unitLbl = isT ? "°" : isP ? "%" : S.unit === "f" ? " mph" : " km/h";
  let body = [0, 0.5, 1].map((f) => { const v = lo + (hi - lo) * f; return `<line class="grid" x1="${m.l}" x2="${w - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="axis" x="${m.l - 6}" y="${Y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`; }).join("");
  if (isP) body += rows.map((r, i) => `<rect class="bar" x="${X(i) - Math.max((w / rows.length) * 0.35, 1)}" width="${Math.max((w / rows.length) * 0.7, 2)}" y="${Y(val(r))}" height="${h - m.b - Y(val(r))}" rx="2"/>`).join("");
  else { const pts = rows.map((r, i) => [X(i), Y(val(r))]), line = curve(pts); body += `<path class="area" d="${line} L${X(rows.length - 1)},${h - m.b} L${m.l},${h - m.b}Z"/><path class="line" d="${line}"/>`; }
  const step = Math.ceil(rows.length / (w < 480 ? 4 : 7));
  body += rows.map((r, i) => (i % step ? "" : `<text class="axis" x="${X(i)}" y="${h - 6}" text-anchor="middle">${rows.length > 48 ? new Date(r.time + "Z").toLocaleDateString("en", { weekday: "short", timeZone: "UTC" }) : hour(r.time)}</text>`)).join("");
  box.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" tabindex="0" aria-label="${esc(S.tab)} chart. Range ${Math.round(Math.min(...vs))} to ${Math.round(Math.max(...vs))}${unitLbl.trim()}. Use arrow keys to inspect values.">${body}<line class="cross" y1="${m.t}" y2="${h - m.b}" hidden/><circle class="dot" r="5" hidden/></svg><div class="tip" hidden></div>`;
  const svg = box.querySelector("svg"), cross = svg.querySelector(".cross"), dot = svg.querySelector(".dot"), tip = box.querySelector(".tip");
  let cur = 0;
  const show = (i) => {
    cur = Math.max(0, Math.min(rows.length - 1, i));
    const x = X(cur), y = Y(val(rows[cur]));
    cross.setAttribute("x1", x); cross.setAttribute("x2", x); dot.setAttribute("cx", x); dot.setAttribute("cy", isP ? y : y);
    cross.hidden = dot.hidden = tip.hidden = false;
    const when = new Date(rows[cur].time + "Z").toLocaleString("en", { weekday: "short", hour: "numeric", timeZone: "UTC" });
    tip.textContent = `${when}: ${Math.round(val(rows[cur]))}${unitLbl}${isP ? ` · ${rows[cur].mm.toFixed(1)} mm` : ""}`;
    tip.style.left = Math.min(Math.max(x, 80), w - 80) + "px";
    say(tip.textContent);
  };
  svg.addEventListener("pointermove", (e) => show(Math.round(((e.clientX - svg.getBoundingClientRect().left - m.l) / (w - m.l - m.r)) * (rows.length - 1))));
  svg.addEventListener("pointerleave", () => { cross.hidden = dot.hidden = tip.hidden = true; });
  svg.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") { e.preventDefault(); show(cur + 1); } if (e.key === "ArrowLeft") { e.preventDefault(); show(cur - 1); } });
}

/* ---------- Rendering ---------- */
function skeleton() { view.innerHTML = '<div class="card sk h1"></div><div class="grid2"><div class="card sk h2"></div><div class="card sk h2"></div></div>'; }
function welcome(msg) {
  view.innerHTML = `<section class="card welcome"><h2>${esc(msg || "Where to?")}</h2><p>Search a city above, use your location, or start with one of these.</p><div class="chips">${POPULAR.map((c, i) => `<button class="chip" data-pop="${i}">${esc(c[0])}</button>`).join("")}</div></section>`;
  view.querySelectorAll("[data-pop]").forEach((b) => b.addEventListener("click", () => { const c = POPULAR[b.dataset.pop]; load({ name: c[0], country: c[1], latitude: c[2], longitude: c[3] }); }));
}
function fail(e) {
  const off = !navigator.onLine;
  view.innerHTML = `<section class="card welcome" role="alert"><h2>${off ? "You're offline" : "Couldn't load the forecast"}</h2><p>${off ? "Reconnect to the internet, then try again." : "The weather service didn't respond. Your connection or the service may be down."}</p><button class="btn solid" id="retry">Try again</button></section>`;
  $("#retry").addEventListener("click", () => load(S.place, { force: true }));
  say("Could not load the forecast.");
}

function render() {
  const d = S.data, p = S.place, u = S.unit, c = d.current, tz = d.timezone;
  const i0 = Math.max(0, d.hourly.time.findIndex((t) => t >= c.time.slice(0, 13) + ":00"));
  const [desc, kind] = code(c.weather_code);
  setSky(kind, c.is_day);
  const rows = (n) => d.hourly.time.slice(i0, i0 + n).map((time, k) => ({ time, t: d.hourly.temperature_2m[i0 + k], pop: d.hourly.precipitation_probability[i0 + k] ?? 0, mm: d.hourly.precipitation[i0 + k] ?? 0, gust: d.hourly.wind_gusts_10m[i0 + k] ?? 0, code: d.hourly.weather_code[i0 + k], uv: d.hourly.uv_index[i0 + k] }));
  const hrs = rows(24), uv = Math.round((d.hourly.uv_index[i0] ?? 0) * 10) / 10, aq = d.aq;
  const local = new Date().toLocaleString("en", { weekday: "long", hour: "numeric", minute: "2-digit", timeZone: tz });
  const fav = S.favs.some((f) => key(f) === key(p));
  const sr = d.daily.sunrise[0], ss = d.daily.sunset[0], now = mins(c.time);
  const prog = sr && ss ? Math.min(1, Math.max(0, (now - mins(sr)) / (mins(ss) - mins(sr)))) : null;
  const ang = Math.PI * (1 - (prog ?? 0)), sx = 100 + 80 * Math.cos(ang), sy = 100 - 80 * Math.sin(ang);
  const note = notices(d, i0);
  const week = [...d.daily.temperature_2m_min, ...d.daily.temperature_2m_max], wl = Math.min(...week), wh = Math.max(...week);
  const days = d.daily.time.map((t, i) => {
    const [ds, k] = code(d.daily.weather_code[i]), a = ((d.daily.temperature_2m_min[i] - wl) / (wh - wl || 1)) * 100, b = ((d.daily.temperature_2m_max[i] - wl) / (wh - wl || 1)) * 100;
    return `<li class="day"><span class="dn">${i ? new Date(t + "T12:00Z").toLocaleDateString("en", { weekday: "short", timeZone: "UTC" }) : "Today"}</span><span title="${esc(ds)}">${icon(k, 1, 24)}</span><span class="pp">${d.daily.precipitation_probability_max[i] ?? 0}%</span><span class="lo">${temp(d.daily.temperature_2m_min[i], u)}</span><span class="rng"><i data-a="${a}" data-b="${b}"></i></span><span class="hi">${temp(d.daily.temperature_2m_max[i], u)}</span></li>`;
  }).join("");
  const tile = (t, v, s, extra = "") => `<div class="tile"><h3>${t}</h3><p class="big">${v}</p><p class="sub">${s}</p>${extra}</div>`;
  view.innerHTML = `
  <section class="card hero">
    <div class="hl"><h2>${esc(label(p))}</h2><p class="sub">${esc(local)} local time</p>
      <div class="temp"><span class="t">${temp(c.temperature_2m, u).slice(0, -1)}</span><span class="deg">${u === "f" ? "°F" : "°C"}</span></div>
      <p class="cond">${esc(desc)} · feels like ${temp(c.apparent_temperature, u)} · H ${temp(d.daily.temperature_2m_max[0], u)} L ${temp(d.daily.temperature_2m_min[0], u)}</p></div>
    <div class="hr">${icon(kind, c.is_day, 96)}<button class="btn" id="fav" aria-pressed="${fav}">${fav ? "Saved" : "Save city"}</button><p class="sub" id="upd"></p></div>
  </section>
  ${note.length ? `<section class="notice" aria-label="Forecast notices"><strong>Forecast notices</strong><ul>${note.map((n) => `<li>${esc(n)}</li>`).join("")}</ul><p class="sub">Derived from model forecasts, not official warnings. Check your national weather service for alerts.</p></section>` : ""}
  <section class="card"><h3>Next 24 hours</h3><ol class="hours">${hrs.map((r, k) => `<li><span>${k ? hour(r.time) : "Now"}</span>${icon(code(r.code)[1], 1, 24)}<b>${temp(r.t, u)}</b><small>${r.pop}%</small></li>`).join("")}</ol></section>
  <div class="grid2">
    <section class="card"><div class="row"><h3>Trends</h3><div class="seg" role="tablist" aria-label="Chart type">${[["temp", "Temperature"], ["rain", "Rain chance"], ["gust", "Gusts"]].map(([k, l]) => `<button role="tab" aria-selected="${S.tab === k}" data-tab="${k}">${l}</button>`).join("")}</div></div>
      <div class="seg small" role="group" aria-label="Time range">${[24, 48, 168].map((n) => `<button aria-pressed="${S.range === n}" data-range="${n}">${n === 168 ? "7 days" : n + " h"}</button>`).join("")}</div><div class="chart" id="chart"></div></section>
    <section class="card"><h3>7-day forecast</h3><ul class="days">${days}</ul></section>
  </div>
  <section class="tiles">
    ${tile("Wind", wind(c.wind_speed_10m, u), `${compass(c.wind_direction_10m)}, gusts ${wind(c.wind_gusts_10m, u)}`)}
    ${tile("Humidity", c.relative_humidity_2m + "%", "Relative humidity")}
    ${tile("Pressure", pressure(c.pressure_msl, u), "Sea level")}
    ${tile("UV index", uv, uvLevel(uv), `<div class="meter"><i data-w="${Math.min(100, (uv / 11) * 100)}"></i></div>`)}
    ${aq && aq.us_aqi != null ? tile("Air quality", Math.round(aq.us_aqi), esc(aqiLevel(aq.us_aqi)) + (aq.pm2_5 != null ? ` · PM2.5 ${aq.pm2_5.toFixed(1)} µg/m³` : ""), `<div class="meter"><i data-w="${Math.min(100, (aq.us_aqi / 300) * 100)}"></i></div>`) : tile("Air quality", "n/a", "No data for this location")}
    <div class="tile sun"><h3>Sun</h3>${sr && ss ? `<svg viewBox="0 0 200 110" role="img" aria-label="Sunrise ${esc(sr.slice(11))}, sunset ${esc(ss.slice(11))}"><path class="arc" d="M20,100 A80,80 0 0 1 180,100"/>${prog > 0 && prog < 1 ? `<circle class="sunDot" cx="${sx}" cy="${sy}" r="7"/>` : ""}</svg><p class="sub">Sunrise ${esc(sr.slice(11))} · Sunset ${esc(ss.slice(11))}</p>` : '<p class="sub">No sunrise or sunset today at this latitude.</p>'}</div>
  </section>`;
  view.querySelectorAll(".rng i").forEach((i) => { i.style.left = i.dataset.a + "%"; i.style.width = Math.max(+i.dataset.b - +i.dataset.a, 4) + "%"; });
  view.querySelectorAll(".meter i").forEach((i) => { i.style.width = i.dataset.w + "%"; });
  const paint = () => drawChart($("#chart"), rows(S.range));
  paint();
  view.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { S.tab = b.dataset.tab; render(); }));
  view.querySelectorAll("[data-range]").forEach((b) => b.addEventListener("click", () => { S.range = +b.dataset.range; render(); }));
  $("#fav").addEventListener("click", () => { S.favs = fav ? S.favs.filter((f) => key(f) !== key(p)) : [...S.favs, p]; store.set("favs", S.favs); renderSaved(); render(); });
  new ResizeObserver(() => { clearTimeout(paint.t); paint.t = setTimeout(paint, 120); }).observe($("#chart"));
  const upd = () => { const m = Math.round((Date.now() - d.fetchedAt) / 60000); const el = $("#upd"); if (el) el.textContent = m < 1 ? "Updated just now" : `Updated ${m} min ago`; };
  upd(); clearInterval(render.tick); render.tick = setInterval(upd, 30000);
  document.title = `${p.name} ${temp(c.temperature_2m, u)} · Weatherly`;
  say(`${p.name}: ${temp(c.temperature_2m, u)}, ${desc}.`);
}

function renderSaved() {
  const items = [...S.favs.map((p) => ({ p, f: 1 })), ...S.recents.filter((r) => !S.favs.some((f) => key(f) === key(r))).map((p) => ({ p, f: 0 }))];
  $("#saved").innerHTML = items.map((x, i) => `<button class="chip${x.f ? " fav" : ""}" data-i="${i}" title="${esc(label(x.p))}">${x.f ? "★ " : ""}${esc(x.p.name)}</button>`).join("");
  $("#saved").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => load(items[b.dataset.i].p)));
}

let ctl;
async function load(p, { force = false } = {}) {
  if (!p) return;
  ctl?.abort(); ctl = new AbortController();
  S.place = p; store.set("last", p); skeleton(); say("Loading forecast…");
  try {
    S.data = await getForecast(p, { force, signal: ctl.signal });
    S.recents = [p, ...S.recents.filter((r) => key(r) !== key(p))].slice(0, 5); store.set("recents", S.recents);
    renderSaved(); render();
  } catch (e) { if (!ctl.signal.aborted) fail(e); }
}

/* ---------- Search with autocomplete ---------- */
let timer, sc, results = [], active = -1;
const close = () => { sugg.hidden = true; q.setAttribute("aria-expanded", "false"); active = -1; };
function paintSugg() {
  sugg.innerHTML = results.length ? results.map((r, i) => `<li role="option" id="o${i}" aria-selected="${i === active}">${esc(label(r))}</li>`).join("") : '<li class="none">No matching city</li>';
  sugg.hidden = false; q.setAttribute("aria-expanded", "true");
  q.setAttribute("aria-activedescendant", active >= 0 ? "o" + active : "");
}
const pick = (r) => { q.value = ""; close(); load(r); };
q.addEventListener("input", () => {
  clearTimeout(timer); const v = q.value.trim();
  if (v.length < 2) return close();
  timer = setTimeout(async () => {
    sc?.abort(); sc = new AbortController();
    try { results = await searchCities(v, sc.signal); active = -1; paintSugg(); } catch { if (!sc.signal.aborted) { results = []; sugg.innerHTML = '<li class="none">Search is unavailable. Try again.</li>'; sugg.hidden = false; } }
  }, 250);
});
q.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { if (!results.length) return; e.preventDefault(); active = (active + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length; paintSugg(); }
  else if (e.key === "Enter" && results.length) { e.preventDefault(); pick(results[Math.max(active, 0)]); }
  else if (e.key === "Escape") close();
});
sugg.addEventListener("pointerdown", (e) => { e.preventDefault(); const li = e.target.closest("[role=option]"); if (li && li.id) pick(results[+li.id.slice(1)]); });
document.addEventListener("click", (e) => { if (!e.target.closest(".search")) close(); });

/* ---------- Controls ---------- */
$("#geo").addEventListener("click", () => {
  if (!navigator.geolocation) return say("Your browser doesn't support location.");
  say("Finding your location…");
  navigator.geolocation.getCurrentPosition(async ({ coords: c }) => { const n = await reverse(c.latitude, c.longitude); load({ ...n, latitude: c.latitude, longitude: c.longitude }); },
    (e) => { welcome(e.code === 1 ? "Location access is blocked" : "Couldn't get your location"); say("Location unavailable. Search for a city instead."); }, { timeout: 10000, maximumAge: 300000 });
});
$("#refresh").addEventListener("click", () => load(S.place, { force: true }));
function syncBtns() { $("#unit").textContent = S.unit === "c" ? "°C" : "°F"; $("#unit").setAttribute("aria-pressed", S.unit === "f"); $("#theme").textContent = S.theme[0].toUpperCase() + S.theme.slice(1); }
$("#unit").addEventListener("click", () => { S.unit = S.unit === "c" ? "f" : "c"; store.set("unit", S.unit); syncBtns(); if (S.data) render(); });
$("#theme").addEventListener("click", () => { S.theme = THEMES[(THEMES.indexOf(S.theme) + 1) % 3]; store.set("theme", S.theme); syncBtns(); setSky(scene.kind, scene.day); });
setInterval(() => { if (!document.hidden && S.place && S.data && Date.now() - S.data.fetchedAt > 10 * 60 * 1000) load(S.place, { force: true }); }, 60000);

/* ---------- Boot ---------- */
resize(); setSky(); syncBtns(); renderSaved(); requestAnimationFrame(frame);
const last = store.get("last", null);
last ? load(last) : welcome();
