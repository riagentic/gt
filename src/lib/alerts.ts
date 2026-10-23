// Parsers: FAA airport status, weather alerts (NWS/ECCC/WMO), Israel sirens. Pure.
// deno-lint-ignore-file no-explicit-any
import type * as GeoJSON from "geojson";
import { BY_ISO } from "../data/countries.ts";

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

// ── FAA (nasstatus.faa.gov XML) ────────────────────────────────────────────
export type AirportStatus = {
  code: string;
  kind: "Ground stop" | "Ground delay" | "Delay" | "Closure";
  reason: string;
  detail: string;
};

// `<Delay>` must not match `<Delay_type>`: the tag name ends at whitespace or `>`.
const rx = (t: string, g = "") => new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, g);
const tag = (x: string, t: string) => x.match(rx(t))?.[1]?.trim() ?? "";
const each = (x: string, t: string) => [...x.matchAll(rx(t, "g"))].map((m) => m[1]);
/** "EQ:OCL: Equipment" → "Equipment". */
const why = (v: string) => v.replace(/^([A-Z]+:)+\s*/, "");

export function faa(xml: string): AirportStatus[] {
  const out: AirportStatus[] = [];
  for (const p of each(xml, "Program")) {
    out.push({
      code: tag(p, "ARPT"),
      kind: "Ground stop",
      reason: why(tag(p, "Reason")),
      detail: tag(p, "End_Time") ? `until ${tag(p, "End_Time")}` : "",
    });
  }
  for (const g of each(xml, "Ground_Delay")) {
    out.push({
      code: tag(g, "ARPT"),
      kind: "Ground delay",
      reason: why(tag(g, "Reason")),
      detail: `avg ${tag(g, "Avg")}, max ${tag(g, "Max")}`,
    });
  }
  for (const d of each(xml, "Delay")) {
    const dir = d.match(/Type="(\w+)"/)?.[1] ?? "";
    out.push({
      code: tag(d, "ARPT"),
      kind: "Delay",
      reason: why(tag(d, "Reason")),
      detail: `${dir} ${tag(d, "Min")}–${tag(d, "Max")} (${tag(d, "Trend").toLowerCase()})`.trim(),
    });
  }
  for (const a of each(xml, "Airport")) {
    const reason = tag(a, "Reason");
    if (!reason.startsWith("!")) out.push({ code: tag(a, "ARPT"), kind: "Closure", reason, detail: tag(a, "Reopen") });
  }
  return out.filter((x) => /^[A-Z0-9]{3,4}$/.test(x.code));
}

// ── Weather ────────────────────────────────────────────────────────────────
export type WeatherAlert = {
  id: string;
  title: string;
  area: string;
  severity: 1 | 2;
  at: number;
  until: number;
  source: string;
  country: number;
  url: string;
};
type Poly = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, { id: string; severity: number; title: string }>;

/** The forecast page for an alert's first zone (it lists the zone's active hazards); the alert's own URL is API JSON. */
const nwsPage = (zones: unknown): string => {
  const all = Array.isArray(zones) ? zones.map(s) : [];
  const zone = (all.find((z) => z.includes("/forecast/")) ?? all[0] ?? "").split("/").pop();
  return zone ? `https://forecast.weather.gov/MapClick.php?zoneid=${zone}` : "https://www.weather.gov/alerts";
};

/** NWS active alerts (Extreme/Severe). One office often issues the same warning for several zones at once:
 *  those merge into one alert (areas joined); every polygon points at the merged id. */
export function nws(geo: any): { alerts: WeatherAlert[]; polys: Poly[] } {
  const alerts = new Map<string, WeatherAlert>(), polys: Poly[] = [];
  for (const f of geo?.features ?? []) {
    const p = f?.properties ?? {};
    const severity = p.severity === "Extreme" ? 1 : p.severity === "Severe" ? 2 : 0;
    if (!severity) continue;
    const key = `${s(p.event)}|${s(p.senderName)}|${s(p.expires)}`;
    const prev = alerts.get(key);
    const id = prev?.id ?? (s(p.id) || s(f.id));
    alerts.set(
      key,
      prev ? { ...prev, area: `${prev.area}; ${s(p.areaDesc)}`.slice(0, 200) } : {
        id,
        title: s(p.event),
        area: s(p.areaDesc).slice(0, 200),
        severity,
        at: Date.parse(s(p.onset) || s(p.effective)) || 0,
        until: Date.parse(s(p.expires)) || 0,
        source: s(p.senderName) || "NWS",
        country: BY_ISO.US,
        url: nwsPage(p.affectedZones),
      },
    );
    if (f.geometry) {
      polys.push({ type: "Feature", geometry: f.geometry, properties: { id, severity, title: s(p.event) } });
    }
  }
  return { alerts: [...alerts.values()], polys };
}

/** Environment Canada: warnings only (not watches/statements). */
export function eccc(geo: any): { alerts: WeatherAlert[]; polys: Poly[] } {
  const alerts = new Map<string, WeatherAlert>(), polys: Poly[] = [];
  for (const f of geo?.features ?? []) {
    const p = f?.properties ?? {};
    if (p.alert_type !== "warning" || p.status_en === "ended") continue;
    const title = s(p.alert_short_name_en) || s(p.alert_name_en);
    const key = `${title}|${s(p.publication_datetime)}`;
    const prev = alerts.get(key);
    const area = prev ? `${prev.area}, ${s(p.feature_name_en)}` : s(p.feature_name_en);
    alerts.set(key, {
      id: `eccc-${key}`,
      title: title[0]?.toUpperCase() + title.slice(1),
      area: area.slice(0, 160),
      severity: 2,
      at: Date.parse(s(p.publication_datetime)) || 0,
      until: Date.parse(s(p.expiration_datetime)) || 0,
      source: "Environment Canada",
      country: BY_ISO.CA,
      url: "https://weather.gc.ca/index_e.html?layers=alert",
    });
    if (f.geometry) {
      polys.push({ type: "Feature", geometry: f.geometry, properties: { id: `eccc-${key}`, severity: 2, title } });
    }
  }
  return { alerts: [...alerts.values()], polys };
}

/** WMO Severe Weather Information Centre: Extreme/Severe CAP alerts outside US/CA (those come from NWS/ECCC). */
export const wmo = (j: any): WeatherAlert[] =>
  (j?.items ?? []).flatMap((it: any): WeatherAlert[] => {
    const cc = s(it.capURL).slice(0, 2).toUpperCase();
    const country = BY_ISO[cc];
    // `s` grows with severity: 4 extreme, 3 severe (1–2 are minor/moderate).
    if (!(it.s === 3 || it.s === 4) || cc === "US" || cc === "CA" || country === undefined) return [];
    return [{
      id: s(it.id),
      title: s(it.event),
      area: s(it.areaDesc).slice(0, 160),
      severity: it.s === 4 ? 1 : 2,
      country,
      at: Date.parse(`${s(it.effective || it.sent).replace(" ", "T")}Z`) || 0,
      until: Date.parse(`${s(it.expires).replace(" ", "T")}Z`) || 0,
      source: "WMO",
      url: `https://severeweather.wmo.int/v2/cap-alerts/${s(it.capURL)}`,
    }];
  });

// ── Aircraft emergency squawks ────────────────────────────────────────────
export const SQUAWKS: Record<string, string> = { "7500": "Hijack", "7600": "Radio failure", "7700": "Emergency" };

// ── Israel sirens (Tzeva Adom) ─────────────────────────────────────────────
// Codes from tzevaadom.co.il's own app bundle.
export const THREATS: Record<number, string> = {
  0: "Rockets / missiles",
  1: "Hazardous materials",
  2: "Infiltration",
  3: "Earthquake",
  4: "Tsunami",
  5: "Hostile aircraft",
  6: "Radiological",
  7: "Non-conventional missile",
  8: "Alert",
  9: "Drill",
};
export type City = { en: string; lat: number; lon: number };
export type Siren = { id: string; at: number; threat: number; cities: City[] };

export const cityTable = (j: any): Record<string, City> =>
  Object.fromEntries(
    Object.entries(j?.cities ?? {}).flatMap(([he, c]: [string, any]) =>
      typeof c?.lat === "number" && typeof c?.lng === "number"
        ? [[he, { en: s(c.en) || he, lat: c.lat, lon: c.lng }]]
        : []
    ),
  );

/** alerts-history → sirens newer than `since` (drills dropped), cities resolved to coordinates. */
export const sirens = (j: any, cities: Record<string, City>, since: number): Siren[] =>
  (Array.isArray(j) ? j : []).flatMap((g: any) =>
    (g?.alerts ?? []).flatMap((a: any, i: number): Siren[] => {
      const at = Number(a?.time) * 1000;
      if (!(at >= since) || a?.isDrill || a?.threat === 9) return [];
      const cs = (a?.cities ?? []).map((n: string) => cities[n]).filter(Boolean);
      return cs.length ? [{ id: `${g.id}-${i}`, at, threat: Number(a.threat) || 0, cities: cs }] : [];
    })
  ).sort((a: Siren, b: Siren) => b.at - a.at);
