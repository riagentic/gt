// Country activity score (0–100) from the last 24h of news + live hazards. Pure.
import type { Hazard, Quake } from "./normalize.ts";
import type { Story } from "./stories.ts";

export type Activity = { score: number; stories: number; hazards: number };
const DAY = 86_400_000;

export const band = (score: number): { label: string; tone: 0 | 1 | 2 | 3 | 4 } =>
  score >= 80
    ? { label: "Critical", tone: 4 }
    : score >= 60
    ? { label: "High", tone: 3 }
    : score >= 40
    ? { label: "Elevated", tone: 2 }
    : score >= 20
    ? { label: "Active", tone: 1 }
    : { label: "Calm", tone: 0 };

/** `where(lon, lat)` → country id or -1 (point-in-polygon, supplied by the caller). */
export function activity(
  stories: Story[],
  quakes: Quake[],
  events: Hazard[],
  where: (lon: number, lat: number) => number,
  now: number,
): Map<number, Activity> {
  const news = new Map<number, number>();
  const count = new Map<number, number>();
  for (const s of stories) {
    if (now - s.at > DAY) continue;
    const w = (1 + Math.log2(s.size)) / Math.max(1, s.places.length); // shared mentions dilute
    for (const p of s.places) {
      news.set(p, (news.get(p) ?? 0) + w);
      count.set(p, (count.get(p) ?? 0) + 1);
    }
  }
  const haz = new Map<number, [number, number]>();
  const bump = (id: number, pts: number) => {
    if (id < 0 || pts <= 0) return;
    const [p, c] = haz.get(id) ?? [0, 0];
    haz.set(id, [p + pts, c + 1]);
  };
  for (const q of quakes) {
    if (now - q.at < DAY) bump(where(q.lon, q.lat), q.mag >= 6.5 ? 15 : q.mag >= 6 ? 8 : q.mag >= 5 ? 3 : 0);
  }
  for (const e of events) bump(where(e.lon, e.lat), [0, 6, 14][e.level]);
  const out = new Map<number, Activity>();
  for (const id of new Set([...news.keys(), ...haz.keys()])) {
    const n = news.get(id) ?? 0;
    const [h, hc] = haz.get(id) ?? [0, 0];
    const score = Math.min(100, Math.round(Math.min(75, 12 * Math.log2(1 + n)) + Math.min(25, h)));
    out.set(id, { score, stories: count.get(id) ?? 0, hazards: hc });
  }
  return out;
}

// ── Instability index ──────────────────────────────────────────────────────
/** Raw per-country signals; every field optional. */
export type Signals = {
  activity?: number; // 0–100 attention score above
  advisory?: number; // US travel advisory level 1–4
  protests?: number; // protest-coverage articles, last day
  sirens?: number; // siren alerts, last 7 days
  displaced?: number; // refugees + IDPs from this country
  population?: number;
  sanctioned?: number; // OFAC SDN addresses
  outbreaks?: number; // WHO notices, last 90 days
  severeWeather?: number; // active severe/extreme warnings
};
export type Part = { label: string; points: number; max: number };
export type Instability = { score: number; parts: Part[] };

const cap = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v)));

/** 0–100 as a sum of capped parts (caps add up to 100), so every point is explained. Pure. */
export function instability(x: Signals): Instability {
  const share = x.displaced && x.population ? x.displaced / x.population : 0;
  const parts: Part[] = [
    { label: "News attention", points: cap((x.activity ?? 0) * 0.3, 30), max: 30 },
    { label: "Travel advisory", points: [0, 0, 4, 12, 25][x.advisory ?? 0] ?? 0, max: 25 },
    { label: "Displacement", points: cap(share * 200, 15), max: 15 }, // 7.5% of the population displaced = max
    { label: "Protests", points: cap(4 * Math.log2(1 + (x.protests ?? 0)), 10), max: 10 },
    { label: "Rocket / missile sirens", points: cap(3 * Math.log2(1 + (x.sirens ?? 0)), 10), max: 10 },
    { label: "Sanctions", points: cap(Math.log2(1 + (x.sanctioned ?? 0)) - 5, 5), max: 5 },
    { label: "Disease outbreaks", points: cap(2 * (x.outbreaks ?? 0), 3), max: 3 },
    { label: "Severe weather", points: cap(x.severeWeather ?? 0, 2), max: 2 },
  ];
  return { score: parts.reduce((t, p) => t + p.points, 0), parts: parts.filter((p) => p.points > 0) };
}
