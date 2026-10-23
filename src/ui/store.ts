// Client-side derived data: world shapes (loaded once), the clock, activity scores.
import type * as GeoJSON from "geojson";
import { computed, signal } from "aio/air";
import { alerts } from "../cell/alerts.ts";
import { atlas } from "../cell/atlas.ts";
import { hazards } from "../cell/hazards.ts";
import { news } from "../cell/news.ts";
import { prefs } from "../cell/prefs.ts";
import { risk } from "../cell/risk.ts";
import { BY_ISO, COUNTRIES } from "../data/countries.ts";
import { watch } from "../cell/watch.ts";
import { match } from "../lib/watch.ts";
import { locator } from "../lib/geo.ts";
import { type Activity, activity, type Instability, instability, type Signals } from "../lib/score.ts";

export type World = { fc: GeoJSON.FeatureCollection; where: (lon: number, lat: number) => number };

export const world = signal<World | null>(null);
export const now = signal(Date.now());

let loading: Promise<void> | null = null;
export const loadWorld = (): Promise<void> =>
  loading ??= fetch("assets/countries.geojson").then((r) => r.json()).then((fc: GeoJSON.FeatureCollection) => {
    world.set({ fc, where: locator(fc) });
  }).catch((e) => {
    loading = null; // next mount retries
    console.error("[world] country shapes failed to load", e);
  });

/** Static infrastructure points (bases, plants, spaceports, data centers, ports), shipped in assets/. */
export type Site = {
  id: string;
  kind: "base" | "nuclear" | "spaceport" | "datacenter" | "port";
  title: string;
  cc: string;
  lon: number;
  lat: number;
};
export const sites = signal<{ fc: GeoJSON.FeatureCollection; byId: Map<string, Site> } | null>(null);
let loadingSites: Promise<void> | null = null;
export const loadSites = (): Promise<void> =>
  loadingSites ??= fetch("assets/infra.geojson").then((r) => r.json()).then((fc: GeoJSON.FeatureCollection) => {
    const byId = new Map<string, Site>();
    for (const f of fc.features) {
      const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
      const p = f.properties as Omit<Site, "lon" | "lat">;
      byId.set(p.id, { ...p, lon, lat });
    }
    sites.set({ fc, byId });
  }).catch((e) => {
    loadingSites = null;
    console.error("[sites] infrastructure layer failed to load", e);
  });

export const scores = computed((): Map<number, Activity> => {
  const w = world.value;
  return w ? activity(news.stories, hazards.quakes, hazards.events, w.where, now.value) : new Map();
});

/** Instability index for every country with any signal. */
export const stability = computed((): Map<number, Instability> => {
  const w = world.value;
  if (!w) return new Map();
  const sig = new Map<number, Signals>();
  const at = (id: number) => (sig.get(id) ?? sig.set(id, {}).get(id)!);
  const add = (id: number, k: keyof Signals, v: number) => {
    if (id >= 0) at(id)[k] = (at(id)[k] ?? 0) + v;
  };
  for (const [id, a] of scores.value) at(id).activity = a.score;
  for (const a of risk.advisories) at(a.place).advisory = a.level;
  for (const p of alerts.protests) add(w.where(p.lon, p.lat), "protests", p.n);
  for (const x of alerts.sirens) if (x.threat !== 9) add(BY_ISO.IL ?? -1, "sirens", 1);
  for (const x of alerts.weather) add(x.country, "severeWeather", 1);
  for (const o of risk.outbreaks) {
    if (now.value - o.at < 90 * 86_400_000) { for (const p of o.places) add(p, "outbreaks", 1); }
  }
  COUNTRIES.forEach((c, id) => {
    const p = atlas.profiles[c.iso];
    if (p) {
      Object.assign(at(id), {
        displaced: (p.refugees ?? 0) + (p.idps ?? 0),
        population: p.pop,
        sanctioned: p.sanctioned,
      });
    }
  });
  return new Map([...sig].map(([id, x]) => [id, instability(x)]));
});
export const unstable = computed(() => [...stability.value].sort((a, b) => b[1].score - a[1].score));

/** Countries ranked by activity, highest first. */
export const ranked = computed(() => [...scores.value].sort((a, b) => b[1].score - a[1].score));

const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
const systemDark = signal(media?.matches ?? true);
media?.addEventListener("change", (e) => systemDark.set(e.matches));
export const dark = computed(() => (prefs.theme === "auto" ? systemDark.value : prefs.theme === "dark"));

/** Stories matching any watched keyword, newest first. */
export const matches = () =>
  news.stories.flatMap((s) => {
    const w = match(s.title, watch.words);
    return w ? [{ s, w }] : [];
  });
