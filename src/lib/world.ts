// Parsers: protests (GDELT), chokepoint traffic (PortWatch), country profiles (World Bank, UNHCR, OFAC),
// radiation (Safecast), temperature anomaly (ERA5 via Open-Meteo), IMF, BIS, CO₂ (NOAA), service status. Pure.
// deno-lint-ignore-file no-explicit-any
import { BY_ISO, BY_ISO3, COUNTRIES } from "../data/countries.ts";

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const n = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN);
const ok = (lon: number, lat: number) =>
  Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 &&
  Math.abs(lat) <= 90;

// ── Protests (GDELT GKG GeoJSON) ───────────────────────────────────────────
export type Protest = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  n: number;
  tone: number;
  at: number;
  url: string;
};

/** "Paris, France (General), France" → "Paris, France". */
export const place = (v: string): string =>
  [...new Set(v.replace(/\s*\(General\)/g, "").split(",").map((x) => x.trim()).filter(Boolean))].join(", ");

/** One point per place: article count, mean tone, newest article. Country-level centroids are dropped —
 *  they say "somewhere in X", which the news layer already shows. */
export function protests(geo: any): Protest[] {
  const by = new Map<string, Protest & { toneSum: number }>();
  for (const f of geo?.features ?? []) {
    const [lon, lat] = f?.geometry?.coordinates ?? [];
    const p = f?.properties ?? {};
    const name = place(s(p.name));
    if (!ok(lon, lat) || !name.includes(",")) continue;
    const key = `${lon.toFixed(2)},${lat.toFixed(2)}`;
    const at = Date.parse(s(p.urlpubtimedate)) || 0;
    const tone = Number(p.urltone) || 0;
    const cur = by.get(key);
    if (!cur) by.set(key, { id: key, name, lon, lat, n: 1, tone, toneSum: tone, at, url: s(p.url) });
    else {
      cur.n++, cur.toneSum += tone;
      if (at > cur.at) [cur.at, cur.url] = [at, s(p.url)];
    }
  }
  return [...by.values()].map(({ toneSum, ...p }) => ({ ...p, tone: +(toneSum / p.n).toFixed(1) }))
    .sort((a, b) => b.n - a.n);
}

// ── Chokepoint traffic (IMF PortWatch) ─────────────────────────────────────
export type Traffic = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  date: string;
  ships: number;
  tankers: number;
  avg: number;
};

/** Latest day per chokepoint vs its own average over the window (vessel transits/day). */
export function traffic(daily: any, points: any): Traffic[] {
  const where = new Map<string, [number, number]>(
    (points?.features ?? []).map((f: any) => [s(f.attributes?.portid), [n(f.attributes?.lon), n(f.attributes?.lat)]]),
  );
  const rows = new Map<string, any[]>();
  for (const f of daily?.features ?? []) {
    const a = f?.attributes ?? {};
    rows.set(s(a.portid), [...(rows.get(s(a.portid)) ?? []), a]);
  }
  return [...rows].flatMap(([id, rs]): Traffic[] => {
    const at = where.get(id);
    if (!at || !ok(...at)) return [];
    rs.sort((a, b) => s(b.date).localeCompare(s(a.date)));
    const avg = rs.reduce((t, r) => t + (n(r.n_total) || 0), 0) / rs.length;
    return [{
      id,
      name: s(rs[0].portname),
      lon: at[0],
      lat: at[1],
      date: s(rs[0].date),
      ships: n(rs[0].n_total) || 0,
      tankers: n(rs[0].n_tanker) || 0,
      avg: Math.round(avg),
    }];
  }).sort((a, b) => b.avg - a.avg);
}

// ── Country profiles ───────────────────────────────────────────────────────
export type Profile = {
  gdp?: number;
  pop?: number;
  inflation?: number;
  gdpYear?: string;
  refugees?: number;
  idps?: number;
  sanctioned?: number;
  growth?: number; // IMF forecast for this year, real GDP %
  debt?: number; // IMF, government debt % of GDP
};
export type Profiles = Record<string, Profile>; // by ISO-2

/** World Bank indicator page → ISO-2 → [value, year]. Aggregates ("World", "Euro area") have no ISO-2 match. */
export const worldBank = (j: any): Record<string, [number, string]> =>
  Object.fromEntries(
    (Array.isArray(j?.[1]) ? j[1] : []).flatMap((r: any) =>
      typeof r?.value === "number" && BY_ISO[s(r.country?.id)] !== undefined
        ? [[s(r.country.id), [r.value, s(r.date)]]]
        : []
    ),
  );

/** ISO-3 → ISO-2. Kosovo has no official ISO-3; UNHCR and the IMF write XKX / UVK. */
const iso2 = (iso3: string): string | undefined =>
  iso3 === "XKX" || iso3 === "UVK" ? "XK" : COUNTRIES[BY_ISO3[iso3] ?? -1]?.iso;

/** UNHCR population (coo_all) → ISO-2 → refugees + asylum seekers abroad, internally displaced. */
export const unhcr = (j: any): Record<string, { refugees: number; idps: number }> =>
  Object.fromEntries(
    (j?.items ?? []).flatMap((r: any) => {
      const iso = iso2(s(r.coo_iso));
      if (!iso) return [];
      const v = (x: unknown) => Number(x) || 0;
      return [[iso, { refugees: v(r.refugees) + v(r.asylum_seekers), idps: v(r.idps) }]];
    }),
  );

/** OFAC SDN addresses (ADD.CSV, no header: ent, add, street, city, country, remarks) → ISO-2 → count. */
export function ofac(csv: string): Record<string, number> {
  const names = new Map(COUNTRIES.map((c) => [c.name.toLowerCase(), c.iso]));
  const alias: Record<string, string> = {
    "united states": "US",
    "russia": "RU",
    "iran": "IR",
    "korea, north": "KP",
    "korea, south": "KR",
    "burma": "MM",
    "syria": "SY",
    "united kingdom": "GB",
    "united arab emirates": "AE",
    "china": "CN",
    "venezuela": "VE",
    "congo, democratic republic of the": "CD",
    "turkey": "TR",
    "türkiye": "TR",
    "west bank": "PS",
    "gaza": "PS",
  };
  const out: Record<string, number> = {};
  for (const line of csv.split("\n")) {
    const m = line.match(/^\d+,\d+,(?:"(?:[^"]|"")*"|[^,]*),(?:"(?:[^"]|"")*"|[^,]*),"((?:[^"]|"")*)"/);
    const c = m?.[1].toLowerCase();
    const iso = c && (alias[c] ?? names.get(c));
    if (iso) out[iso] = (out[iso] ?? 0) + 1;
  }
  return out;
}

// ── Radiation (Safecast) ───────────────────────────────────────────────────
export type Sensor = { id: string; name: string; lon: number; lat: number; cpm: number; at: number };

/** Devices that reported a counts-per-minute reading within `maxAge`. */
export const radiation = (j: any, now: number, maxAge: number): Sensor[] =>
  (Array.isArray(j) ? j : []).flatMap((d: any): Sensor[] => {
    const cpm = n(d?.lnd_7318c ?? d?.lnd_7128ec ?? d?.lnd_712u), at = Date.parse(s(d?.when_captured));
    const lon = n(d?.loc_lon), lat = n(d?.loc_lat);
    if (!Number.isFinite(cpm) || !(now - at < maxAge) || !ok(lon, lat) || (lon === 0 && lat === 0)) return [];
    return [{
      id: String(d.device),
      name: s(d.loc_name) || s(d.loc_country),
      lon: +lon.toFixed(3),
      lat: +lat.toFixed(3),
      cpm: Math.round(cpm),
      at,
    }];
  });

// ── Temperature anomaly (ERA5 via Open-Meteo) ──────────────────────────────
export type Anomaly = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  now: number;
  normal: number;
  delta: number;
};
export const HARMONICS = 3;

/** Fraction of the UTC year at noon of an ISO date: 0…1. */
export const yearFrac = (iso: string): number => {
  const d = new Date(iso + "T12:00:00Z"), y = d.getUTCFullYear();
  return (d.getTime() - Date.UTC(y, 0, 1)) / (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1));
};

/** Normal for a fraction of the year from harmonic coefficients [a0, a1, b1, a2, b2, …]. */
export const normalAt = (coef: number[], t: number): number =>
  coef.reduce((sum, c, i) => {
    if (i === 0) return c;
    const k = Math.ceil(i / 2), x = 2 * Math.PI * k * t;
    return sum + c * (i % 2 ? Math.cos(x) : Math.sin(x));
  }, 0);

/** Mean of the last `days` valid ERA5 daily means vs the ERA5 1991–2020 normal for those dates. One dataset, one
 *  grid cell for both sides, so model and grid biases cancel. */
export const anomaly = (
  id: string,
  name: string,
  lon: number,
  lat: number,
  daily: any,
  coef: number[] | undefined,
  days = 7,
): Anomaly | null => {
  if (coef?.length !== 1 + 2 * HARMONICS) return null;
  const time: unknown[] = Array.isArray(daily?.time) ? daily.time : [];
  const temp: unknown[] = Array.isArray(daily?.temperature_2m_mean) ? daily.temperature_2m_mean : [];
  const obs = time.flatMap((t, i) => (typeof t === "string" && typeof temp[i] === "number" ? [[t, temp[i]]] : []))
    .slice(-days) as [string, number][];
  if (obs.length < Math.min(3, days)) return null;
  const now = obs.reduce((sum, [, v]) => sum + v, 0) / obs.length;
  const normal = obs.reduce((sum, [t]) => sum + normalAt(coef, yearFrac(t)), 0) / obs.length;
  return { id, name, lon, lat, now: +now.toFixed(1), normal: +normal.toFixed(1), delta: +(now - normal).toFixed(1) };
};

// ── Cyber ──────────────────────────────────────────────────────────────────
export type Service = { name: string; level: "ok" | "minor" | "major"; text: string; url: string };

/** Atlassian Statuspage status.json → level. */
export const statusPage = (name: string, url: string, j: any): Service => {
  const i = s(j?.status?.indicator);
  return {
    name,
    url,
    text: s(j?.status?.description) || "Unknown",
    level: i === "none" ? "ok" : i === "minor" || i === "maintenance" ? "minor" : "major",
  };
};

/** A satellite scene preview. */
export type Image = { url: string; date: string; cloud: number; scene: string };

// ── IMF World Economic Outlook (DataMapper) ────────────────────────────────
/** One indicator → ISO-2 → value for `year` (forecasts included). Regions/groups have no ISO-3 match. */
export const imf = (j: any, indicator: string, year: number): Record<string, number> =>
  Object.fromEntries(
    Object.entries(j?.values?.[indicator] ?? {}).flatMap(([code, years]: [string, any]) => {
      const iso = iso2(code), v = years?.[String(year)];
      return iso && typeof v === "number" ? [[iso, v]] : [];
    }),
  );

// ── Central bank policy rates (BIS WS_CBPOL) ──────────────────────────────
export type PolicyRate = { iso: string; name: string; rate: number; date: string };
const csvRow = (line: string): string[] => {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') cur += '"', i++;
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") out.push(cur), cur = "";
    else cur += ch;
  }
  return [...out, cur];
};
/** Euro-area members: their own BIS series stop in 1998; the ECB rate (XM) applies. */
export const EURO = new Set("AT BE HR CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES".split(" "));

/** Latest observation per central bank; series not updated within `maxAge` (pre-euro, defunct) dropped. */
export function policyRates(csv: string, now: number, maxAge: number): PolicyRate[] {
  const [head, ...rows] = csv.trim().split(/\r?\n/).map(csvRow);
  const col = (n: string) => head?.indexOf(n) ?? -1;
  const [area, period, value] = [col("REF_AREA"), col("TIME_PERIOD"), col("OBS_VALUE")];
  if (area < 0 || period < 0 || value < 0) return [];
  return rows.flatMap((r): PolicyRate[] => {
    const iso = r[area], rate = Number(r[value]), date = r[period];
    if (!Number.isFinite(rate) || r[value] === "" || !(now - Date.parse(date) < maxAge)) return [];
    const name = iso === "XM" ? "Euro area (ECB)" : COUNTRIES[BY_ISO[iso] ?? -1]?.name;
    return name ? [{ iso, name, rate, date }] : [];
  }).sort((a, b) => b.rate - a.rate);
}

// ── CO₂ (NOAA Mauna Loa, daily) ────────────────────────────────────────────
export type Co2 = { ppm: number; date: string; yearAgo: number; delta: number };

/** Latest daily mean and the change vs the closest day a year earlier. */
export function co2(csv: string): Co2 | null {
  const rows = csv.split("\n").filter((l) => /^\d{4},/.test(l)).map((l) => l.split(",").map(Number))
    .filter((r) => r.length >= 5 && r[4] > 0); // [y, m, d, decimal year, ppm]
  const last = rows.at(-1);
  if (!last) return null;
  const target = last[3] - 1;
  const prev = rows.reduce((a, b) => (Math.abs(b[3] - target) < Math.abs(a[3] - target) ? b : a));
  if (Math.abs(prev[3] - target) > 0.05) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    ppm: last[4],
    date: `${last[0]}-${pad(last[1])}-${pad(last[2])}`,
    yearAgo: prev[4],
    delta: +(last[4] - prev[4]).toFixed(2),
  };
}
