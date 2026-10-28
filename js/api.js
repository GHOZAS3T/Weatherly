// Data layer: network calls, unit formatting, weather codes, derived notices.
const GEO = "https://geocoding-api.open-meteo.com/v1/search";
const WX = "https://api.open-meteo.com/v1/forecast";
const AQ = "https://air-quality-api.open-meteo.com/v1/air-quality";
const REV = "https://api.bigdatacloud.net/data/reverse-geocode-client";
const cache = new Map();
const TTL = 5 * 60 * 1000;

async function getJSON(url, signal, retries = 1) {
  for (let i = 0; ; i++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10000);
    signal?.addEventListener("abort", () => ctl.abort(), { once: true });
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      if (signal?.aborted || i >= retries) throw e;
      await new Promise((ok) => setTimeout(ok, 600));
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function searchCities(q, signal) {
  const d = await getJSON(`${GEO}?name=${encodeURIComponent(q)}&count=6&language=en&format=json`, signal, 0);
  return d.results || [];
}

export async function reverse(lat, lon, signal) {
  try {
    const d = await getJSON(`${REV}?latitude=${lat}&longitude=${lon}&localityLanguage=en`, signal, 0);
    return { name: d.city || d.locality || "Your location", admin1: d.principalSubdivision, country: d.countryName };
  } catch { return { name: "Your location" }; }
}

// Always fetch metric; convert on screen so switching units never re-fetches.
export async function getForecast(p, { force = false, signal } = {}) {
  const key = `${p.latitude.toFixed(2)},${p.longitude.toFixed(2)}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL) return hit.data;
  const c = `latitude=${p.latitude}&longitude=${p.longitude}&timezone=auto&forecast_days=7`;
  const [wx, aq] = await Promise.allSettled([
    getJSON(`${WX}?${c}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_gusts_10m,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max`, signal),
    getJSON(`${AQ}?${c}&current=us_aqi,pm2_5`, signal),
  ]);
  if (wx.status === "rejected") throw wx.reason;
  const w = wx.value;
  if (!w.current || !w.hourly || !w.daily) throw new Error("Unexpected response from the weather service.");
  const data = { ...w, aq: aq.status === "fulfilled" ? aq.value.current : null, fetchedAt: Date.now() };
  cache.set(key, { at: Date.now(), data });
  return data;
}

const W = {
  0: ["Clear sky", "clear"], 1: ["Mainly clear", "clear"], 2: ["Partly cloudy", "part"], 3: ["Overcast", "cloud"],
  45: ["Fog", "fog"], 48: ["Freezing fog", "fog"],
  51: ["Light drizzle", "drizzle"], 53: ["Drizzle", "drizzle"], 55: ["Heavy drizzle", "drizzle"],
  56: ["Freezing drizzle", "drizzle"], 57: ["Freezing drizzle", "drizzle"],
  61: ["Light rain", "rain"], 63: ["Rain", "rain"], 65: ["Heavy rain", "rain"],
  66: ["Freezing rain", "rain"], 67: ["Freezing rain", "rain"],
  71: ["Light snow", "snow"], 73: ["Snow", "snow"], 75: ["Heavy snow", "snow"], 77: ["Snow grains", "snow"],
  80: ["Rain showers", "rain"], 81: ["Rain showers", "rain"], 82: ["Violent showers", "rain"],
  85: ["Snow showers", "snow"], 86: ["Heavy snow showers", "snow"],
  95: ["Thunderstorm", "storm"], 96: ["Thunderstorm, hail", "storm"], 99: ["Severe thunderstorm, hail", "storm"],
};
export const code = (c) => W[c] || ["Unknown", "cloud"];

const P = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z"/>',
  part: '<path d="M12 2v2M4.9 4.9l1.4 1.4M20 12h2M19.1 4.9l-1.4 1.4M15.9 12.7a4 4 0 0 0-5.9-4.2M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>',
  partn: '<path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6ZM10.1 9A6 6 0 0 1 16 4a4.2 4.2 0 0 0 6 6 6 6 0 0 1-3 5.2"/>',
  rain: '<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2M16 14v6M8 14v6M12 16v6"/>',
  drizzle: '<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2M8 19v1M8 14v1M16 19v1M16 14v1M12 21v1M12 16v1"/>',
  snow: '<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01"/>',
  storm: '<path d="M6 16.3A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 .5 9M13 12l-3 5h4l-3 5"/>',
  fog: '<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2M16 17H7M17 21H9"/>',
};
export function icon(kind, day = 1, size = 28) {
  const k = kind === "clear" ? (day ? "sun" : "moon") : kind === "part" && !day ? "partn" : kind;
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[k] || P.cloud}</svg>`;
}

export const toF = (c) => c * 1.8 + 32;
export const temp = (c, u) => Math.round(u === "f" ? toF(c) : c) + "°";
export const wind = (k, u) => (u === "f" ? Math.round(k * 0.621371) + " mph" : Math.round(k) + " km/h");
export const pressure = (h, u) => (u === "f" ? (h * 0.02953).toFixed(2) + " inHg" : Math.round(h) + " hPa");
export const compass = (d) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(d / 45) % 8];

export const uvLevel = (v) => (v < 3 ? "Low" : v < 6 ? "Moderate" : v < 8 ? "High" : v < 11 ? "Very high" : "Extreme");
export const aqiLevel = (v) =>
  v <= 50 ? "Good" : v <= 100 ? "Moderate" : v <= 150 ? "Unhealthy for sensitive groups" : v <= 200 ? "Unhealthy" : v <= 300 ? "Very unhealthy" : "Hazardous";

// Derived from model data (NOT official warnings). Pure, so it is easy to unit test.
export function notices(d, i0) {
  const out = [];
  const h = d.hourly, n = Math.min(i0 + 24, h.time.length);
  let storm = false, rain = 0, gust = 0;
  for (let i = i0; i < n; i++) {
    if (h.weather_code[i] >= 95) storm = true;
    rain = Math.max(rain, h.precipitation_probability[i] >= 60 ? h.precipitation[i] : 0);
    gust = Math.max(gust, h.wind_gusts_10m[i] || 0);
  }
  if (storm) out.push("Thunderstorms possible in the next 24 hours.");
  if (rain >= 5) out.push(`Heavy rain possible (up to ${rain.toFixed(1)} mm in one hour).`);
  if (gust >= 60) out.push(`Strong gusts up to ${Math.round(gust)} km/h expected.`);
  if (d.daily.uv_index_max[0] >= 8) out.push("UV is very high today. Cover up between late morning and mid-afternoon.");
  if (d.current.apparent_temperature >= 38) out.push("It feels dangerously hot. Drink water and limit time in the sun.");
  if (d.current.apparent_temperature <= -15) out.push("It feels extremely cold. Limit time outdoors.");
  if (d.aq?.us_aqi > 150) out.push("Air quality is unhealthy. Consider limiting outdoor activity.");
  return out;
}
