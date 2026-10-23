// SGP4 propagation (satellite.js) → ground position. Pure for a given time.
import * as sat from "satellite.js";
import type { Tle } from "./intel.ts";

export type SatPos = { lon: number; lat: number; alt: number; speed: number };
const cache = new Map<string, sat.SatRec>();

const rec = (t: Tle): sat.SatRec => {
  const key = t.l1 + t.l2;
  let r = cache.get(key);
  if (!r) cache.set(key, r = sat.twoline2satrec(t.l1, t.l2));
  return r;
};

export function position(t: Tle, at: Date): SatPos | null {
  const pv = sat.propagate(rec(t), at);
  if (!pv || typeof pv.position === "boolean" || !pv.position) return null;
  const g = sat.eciToGeodetic(pv.position as sat.EciVec3<number>, sat.gstime(at));
  const v = pv.velocity as sat.EciVec3<number>;
  const lon = sat.degreesLong(g.longitude), lat = sat.degreesLat(g.latitude);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return { lon, lat, alt: g.height, speed: Math.hypot(v.x, v.y, v.z) };
}

/** Minutes per orbit, from mean motion (revs/day) in TLE line 2. */
export const period = (t: Tle): number => 1440 / Number(t.l2.slice(52, 63));

/** Ground track as line segments, split where it crosses the antimeridian. */
export function track(t: Tle, at: Date, minutes = period(t), step = 1): [number, number][][] {
  const segs: [number, number][][] = [[]];
  for (let m = -minutes / 2; m <= minutes / 2; m += step) {
    const p = position(t, new Date(at.getTime() + m * 60_000));
    if (!p) continue;
    const seg = segs[segs.length - 1], last = seg[seg.length - 1];
    if (last && Math.abs(p.lon - last[0]) > 180) segs.push([]);
    segs[segs.length - 1].push([p.lon, p.lat]);
  }
  return segs.filter((s) => s.length > 1);
}
