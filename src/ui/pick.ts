// Resolve a selection to its row and map position. Reads cells (reactive in render).
import { air } from "../cell/air.ts";
import { alerts } from "../cell/alerts.ts";
import { atlas } from "../cell/atlas.ts";
import { hazards } from "../cell/hazards.ts";
import { news } from "../cell/news.ts";
import { risk } from "../cell/risk.ts";
import { sky } from "../cell/sky.ts";
import type { Pick } from "../cell/view.ts";
import { COUNTRIES } from "../data/countries.ts";
import { PLACES } from "../data/places.ts";
import { position } from "../lib/orbit.ts";
import { sites } from "./store.ts";

export const story = (id: string) => news.stories.find((s) => s.id === id);
export const quake = (id: string) => hazards.quakes.find((q) => q.id === id);
export const event = (id: string) => hazards.events.find((e) => e.id === id);
export const plane = (id: string) => air.planes.find((p) => p.hex === id) ?? alerts.squawks.find((p) => p.hex === id);
export const place = (id: string) => PLACES.find((p) => p.id === id);
export const satellite = (id: string) => sky.tles.find((t) => t.id === id);
export const outbreak = (id: string) => risk.outbreaks.find((o) => o.id === id);
export const advisory = (country: number) => risk.advisories.find((a) => a.place === country);
export const weather = (id: string) => alerts.weather.find((w) => w.id === id);
export const siren = (id: string) => alerts.sirens.find((s) => s.id === id);
export const protest = (id: string) => alerts.protests.find((p) => p.id === id);
export const site = (id: string) => sites.value?.byId.get(id);
export const chokepoint = (id: string) => atlas.traffic.find((t) => t.id === id);
export const sensor = (id: string) => atlas.radiation.find((s) => s.id === id);
export const anomaly = (id: string) => atlas.climate.find((a) => a.id === id);

export function locate(p: Pick): [number, number] | null {
  switch (p.kind) {
    case "country": {
      const c = COUNTRIES[p.id];
      return c ? [c.lon, c.lat] : null;
    }
    case "story":
    case "outbreak": {
      const c = COUNTRIES[(p.kind === "story" ? story(p.id) : outbreak(p.id))?.places[0] ?? -1];
      return c ? [c.lon, c.lat] : null;
    }
    case "sat": {
      const t = satellite(p.id), at = t && position(t, new Date());
      return at ? [at.lon, at.lat] : null;
    }
    case "weather": {
      const c = COUNTRIES[weather(p.id)?.country ?? -1];
      return c ? [c.lon, c.lat] : null;
    }
    case "siren": {
      const c = siren(p.id)?.cities[0];
      return c ? [c.lon, c.lat] : null;
    }
    default: {
      const r = ({
        quake,
        event,
        plane,
        place,
        protest,
        site,
        chokepoint,
        sensor,
        anomaly,
      } as Record<string, (id: string) => { lon: number; lat: number } | undefined>)[p.kind]?.(p.id);
      return r ? [r.lon, r.lat] : null;
    }
  }
}

/** Live hazards inside a country (quakes M4.5+, disasters), newest first. */
export function* hazardsIn(id: number, where: (lon: number, lat: number) => number) {
  const rows = [
    ...hazards.quakes.filter((q) => q.mag >= 4.5).map((q) => ({
      id: q.id,
      title: `M${q.mag.toFixed(1)} · ${q.place}`,
      at: q.at,
      lon: q.lon,
      lat: q.lat,
      pick: { kind: "quake" as const, id: q.id },
    })),
    ...hazards.events.map((e) => ({
      id: e.id,
      title: e.title,
      at: e.at,
      lon: e.lon,
      lat: e.lat,
      pick: { kind: "event" as const, id: e.id },
    })),
  ].sort((a, b) => b.at - a.at);
  for (const r of rows) if (where(r.lon, r.lat) === id) yield r;
}
