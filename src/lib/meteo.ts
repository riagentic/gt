// Global weather layers: a coarse temperature grid (Open-Meteo) and tropical cyclone geometry (GDACS). Pure.
import type * as GeoJSON from "geojson";

/** 10° grid, 60°S–80°N (Antarctica's interior adds little): 15 × 36 = 540 points. */
export const STEP = 10, LAT0 = -60, LAT1 = 80;
export const GRID: [lat: number, lon: number][] = Array.from(
  { length: (LAT1 - LAT0) / STEP + 1 },
  (_, r) => Array.from({ length: 360 / STEP }, (_, c) => [LAT0 + r * STEP, -180 + c * STEP] as [number, number]),
).flat();

/** Current °C per GRID point (row-major, same order); null = missing. */
export type Temps = { at: number; t: (number | null)[] };

/** Open-Meteo multi-location `current` responses, in request order → values. */
export const currentTemps = (rows: unknown[]): (number | null)[] =>
  rows.map((r) => {
    const v = (r as { current?: { temperature_2m?: unknown } })?.current?.temperature_2m;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  });

/** Bilinear temperature at any point; longitude wraps, latitude clamps to the grid. null where a corner is missing. */
export const sample = (t: (number | null)[], lat: number, lon: number): number | null => {
  const cols = 360 / STEP, rows = t.length / cols;
  const y = Math.max(0, Math.min(rows - 1, (lat - LAT0) / STEP));
  const x = (((lon + 180) / STEP) % cols + cols) % cols;
  const r0 = Math.floor(y), r1 = Math.min(rows - 1, r0 + 1), c0 = Math.floor(x), c1 = (c0 + 1) % cols;
  const fy = y - r0, fx = x - c0;
  const at = (r: number, c: number) => t[r * cols + c];
  const a = at(r0, c0), b = at(r0, c1), c = at(r1, c0), d = at(r1, c1);
  if (a === null || b === null || c === null || d === null) return null;
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
};

const STOPS: [number, number, number, number][] = [
  [-40, 120, 60, 200],
  [-20, 50, 110, 230],
  [0, 120, 210, 245],
  [10, 90, 200, 120],
  [20, 245, 215, 70],
  [30, 250, 140, 40],
  [40, 225, 40, 60],
];
const ramp = (t: number): [number, number, number] => {
  if (t <= STOPS[0][0]) return [STOPS[0][1], STOPS[0][2], STOPS[0][3]];
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, r1, g1, b1] = STOPS[i];
    if (t <= t1) {
      const [t0, r0, g0, b0] = STOPS[i - 1], f = (t - t0) / (t1 - t0);
      return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f].map(Math.round) as [number, number, number];
    }
  }
  const z = STOPS[STOPS.length - 1];
  return [z[1], z[2], z[3]];
};
/** The ramp precomputed every 0.25 °C from −50 to +50: images call this once per pixel. */
const TABLE = Array.from({ length: 401 }, (_, i) => ramp(-50 + i / 4));
/** °C → RGB on a cold-purple … hot-red ramp (shared tuple: don't mutate). */
export const tempColor = (t: number): readonly [number, number, number] =>
  TABLE[Math.max(0, Math.min(400, Math.round((t + 50) * 4)))];

/** Grid points with a value, as labelled points ("23°"). */
/** How coarse a grid point's grid is: 0 on the 30° grid, 1 on the 20° one, 2 only on the full 10° one. Zoomed out
 *  the maps show the coarse grids first, zoomed in all of it. */
export const tempRank = (lat: number, lon: number): 0 | 1 | 2 =>
  lat % 30 === 0 && lon % 30 === 0 ? 0 : lat % 20 === 0 && lon % 20 === 0 ? 1 : 2;

export const tempPoints = (t: (number | null)[]): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: GRID.flatMap(([lat, lon], i) =>
    t[i] === null ? [] : [{
      type: "Feature" as const,
      properties: { t: t[i], label: `${Math.round(t[i]!)}°`, rank: tempRank(lat, lon) },
      geometry: { type: "Point" as const, coordinates: [lon, lat] },
    }]
  ),
});

// ── Tropical cyclones (GDACS) ─────────────────────────────────────────────
const DAY = 86_400_000;
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);

/** GDACS's tropical cyclones of the last two weeks. Its app feed (EVENTS4APP) lists only the latest 100 events of any
 *  kind, and earthquakes and fires fill it: cyclones never made it in. */
export const cycloneSearch = (now: number): string =>
  "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC" +
  `&fromdate=${ymd(now - 14 * DAY)}&todate=${ymd(now + DAY)}&alertlevel=green;orange;red`;

/** A GDACS event list cut to the events still going. */
// deno-lint-ignore no-explicit-any
export const ongoing = (j: any): unknown => ({
  ...j,
  // deno-lint-ignore no-explicit-any
  features: (j?.features ?? []).filter((f: any) =>
    f?.properties?.iscurrent === true || f?.properties?.iscurrent === "true"
  ),
});
export type Storm = { id: string; name: string; level: "Green" | "Orange" | "Red"; lon: number; lat: number };
export type StormPart = "cone" | "wind" | "track";

/** GDACS event list → current tropical cyclones. */
export const storms = (j: unknown): Storm[] =>
  // deno-lint-ignore no-explicit-any
  ((j as any)?.features ?? []).flatMap((f: any): Storm[] => {
    const p = f?.properties ?? {}, c = f?.geometry?.coordinates;
    if (p.eventtype !== "TC" || p.iscurrent === "false" || p.iscurrent === false || !Array.isArray(c)) return [];
    return [{
      id: `TC-${p.eventid}-${p.episodeid}`,
      name: String(p.eventname ?? p.name ?? "Cyclone").replace(/-\d+$/, ""),
      level: (["Green", "Orange", "Red"].includes(p.alertlevel) ? p.alertlevel : "Green") as Storm["level"],
      lon: +c[0],
      lat: +c[1],
    }];
  });

/** One storm's GDACS geometry → the parts worth drawing: forecast cone, 60/90/120 km/h wind zones, track legs by
 *  class (TD/TS/HU). Per-point circles and per-step forecast polygons are dropped. */
export const stormGeometry = (j: unknown, s: Storm): GeoJSON.Feature[] =>
  // deno-lint-ignore no-explicit-any
  ((j as any)?.features ?? []).flatMap((f: any): GeoJSON.Feature[] => {
    const cls = String(f?.properties?.Class ?? ""), label = String(f?.properties?.polygonlabel ?? "");
    const base = { id: s.id, name: s.name };
    if (cls === "Poly_Cones") return [{ ...f, properties: { ...base, part: "cone" } }];
    if (/^Poly_(Green|Orange|Red)$/.test(cls) && /km\/h/.test(label)) {
      return [{ ...f, properties: { ...base, part: "wind", kmh: parseInt(label) || 0 } }];
    }
    if (cls.startsWith("Line_")) return [{ ...f, properties: { ...base, part: "track", cat: label } }];
    return [];
  });
