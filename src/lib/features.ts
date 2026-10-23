// App rows → GeoJSON for the map. Pure.
import type * as GeoJSON from "geojson";
import { BY_ISO, COUNTRIES } from "../data/countries.ts";
import { PLACES } from "../data/places.ts";
import type { Siren, WeatherAlert } from "./alerts.ts";
import type { Outbreak, Tle } from "./intel.ts";
import type { Aircraft, Hazard, Quake } from "./normalize.ts";
import type { SatPos } from "./orbit.ts";
import type { Story } from "./stories.ts";
import type { Anomaly, Protest, Sensor, Traffic } from "./world.ts";

type FC = GeoJSON.FeatureCollection<GeoJSON.Geometry>;
const pt = (lon: number, lat: number, properties: Record<string, unknown>): GeoJSON.Feature => ({
  type: "Feature",
  properties,
  geometry: { type: "Point", coordinates: [lon, lat] },
});
const fc = (features: GeoJSON.Feature[]): FC => ({ type: "FeatureCollection", features });
const HOUR = 3_600_000;

/** One bubble per country: stories from the last 24h that mention it. */
export const newsPoints = (stories: Story[], now: number): FC => {
  const n = new Map<number, number>();
  for (const s of stories) if (now - s.at < 24 * HOUR) { for (const p of s.places) n.set(p, (n.get(p) ?? 0) + 1); }
  return fc([...n].map(([id, count]) => pt(COUNTRIES[id].lon, COUNTRIES[id].lat, { id, n: count })));
};

export const quakePoints = (quakes: Quake[], minMag: number, now: number): FC =>
  fc(
    quakes.filter((q) => q.mag >= minMag).map((q) =>
      pt(q.lon, q.lat, {
        id: q.id,
        mag: q.mag,
        age: Math.max(0, (now - q.at) / HOUR),
        title: `M${q.mag.toFixed(1)} · ${q.place}`,
      })
    ),
  );

export const eventPoints = (events: Hazard[]): FC =>
  fc(events.map((e) => pt(e.lon, e.lat, { id: e.id, kind: e.kind, level: e.level, title: e.title })));

export const planePoints = (planes: Aircraft[]): FC =>
  fc(
    planes.map((p) =>
      pt(p.lon, p.lat, {
        id: p.hex,
        hdg: p.hdg,
        title: [p.call || p.hex.toUpperCase(), p.type].filter(Boolean).join(" · "),
      })
    ),
  );

export const placePoints = (): FC => fc(PLACES.map((p) => pt(p.lon, p.lat, { id: p.id, kind: p.kind, title: p.name })));

export const single = (lon: number, lat: number): FC => fc([pt(lon, lat, {})]);
export const empty = (): FC => fc([]);

const DAY = 24 * HOUR;

/** WHO outbreak notices from the last 90 days, one marker per country. */
export const healthPoints = (outbreaks: Outbreak[], now: number): FC => {
  const by = new Map<number, Outbreak[]>();
  for (const o of outbreaks) {
    if (now - o.at < 90 * DAY) {
      for (const p of o.places) by.set(p, [...(by.get(p) ?? []), o]);
    }
  }
  return fc(
    [...by].map(([id, os]) =>
      pt(COUNTRIES[id].lon, COUNTRIES[id].lat, {
        id: os[0].id,
        n: os.length,
        title: os.map((o) => o.title).join(" · "),
      })
    ),
  );
};

export const satPoints = (rows: { tle: Tle; p: SatPos }[]): FC =>
  fc(rows.map(({ tle, p }) => pt(p.lon, p.lat, { id: tle.id, group: tle.group, title: tle.name })));

export const lines = (segs: [number, number][][]): FC => ({
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: segs } }],
});

// ── v0.3 ───────────────────────────────────────────────────────────────────

/** Weather outside US/Canada has no polygons: one marker per country, worst alert first. */
export const weatherPoints = (alerts: WeatherAlert[]): FC => {
  const by = new Map<number, WeatherAlert[]>();
  for (const a of alerts) {
    if (a.country !== BY_ISO.US && a.country !== BY_ISO.CA) by.set(a.country, [...(by.get(a.country) ?? []), a]);
  }
  return fc([...by].map(([c, as]) =>
    pt(COUNTRIES[c].lon, COUNTRIES[c].lat, {
      id: as[0].id,
      severity: Math.min(...as.map((a) => a.severity)),
      n: as.length,
      title: `${as.length} weather ${as.length === 1 ? "warning" : "warnings"} · ${COUNTRIES[c].name}`,
    })
  ));
};

/** One dot per city, from its latest siren. */
export const sirenPoints = (sirens: Siren[], now: number, label: (t: number) => string): FC => {
  const seen = new Set<string>();
  const out: GeoJSON.Feature[] = [];
  for (const s of sirens) { // newest first
    for (const c of s.cities) {
      if (seen.has(c.en)) continue;
      seen.add(c.en);
      out.push(pt(c.lon, c.lat, { id: s.id, age: (now - s.at) / HOUR, title: `${label(s.threat)} · ${c.en}` }));
    }
  }
  return fc(out);
};

export const protestPoints = (ps: Protest[]): FC =>
  fc(ps.map((p) => pt(p.lon, p.lat, { id: p.id, n: p.n, title: `Protest coverage · ${p.name}` })));

export const squawkPoints = (planes: Aircraft[]): FC =>
  fc(
    planes.map((p) =>
      pt(p.lon, p.lat, { id: p.hex, hdg: p.hdg, sq: p.sq, title: `Squawk ${p.sq} · ${p.call || p.hex.toUpperCase()}` })
    ),
  );

export const trafficPoints = (ts: Traffic[]): FC =>
  fc(
    ts.map((t) =>
      pt(t.lon, t.lat, {
        id: t.id,
        n: t.ships,
        label: `${t.ships}`,
        title: `${t.name} · ${t.ships} ships/day (avg ${t.avg})`,
      })
    ),
  );

export const sensorPoints = (ss: Sensor[]): FC =>
  fc(ss.map((s) => pt(s.lon, s.lat, { id: s.id, cpm: s.cpm, title: `${s.cpm} CPM · ${s.name}` })));

export const anomalyPoints = (as: Anomaly[]): FC =>
  fc(as.map((a) =>
    pt(a.lon, a.lat, {
      id: a.id,
      delta: a.delta,
      label: `${a.delta > 0 ? "+" : ""}${a.delta.toFixed(1)}°`,
      title: `${a.name} · ${a.delta > 0 ? "+" : ""}${a.delta}°C vs normal`,
    })
  ));
