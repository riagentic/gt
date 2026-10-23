// Day/night terminator as a GeoJSON polygon covering the night side. Pure.
import type * as GeoJSON from "geojson";
const RAD = Math.PI / 180;

export function subsolar(ms: number): [number, number] {
  const d = ms / 86_400_000 - 10_957.5; // days since J2000
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const l = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const dec = Math.asin(Math.sin(e) * Math.sin(l)) / RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(l), Math.cos(l)) / RAD;
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const lon = ((((ra - gmst * 15) % 360) + 540) % 360) - 180;
  return [lon, dec];
}

export function nightPolygon(ms: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const [slon, sdec] = subsolar(ms);
  const pole = sdec > 0 ? -90 : 90; // night side contains the opposite pole
  const t = Math.tan(sdec * RAD) || 1e-9;
  const ring: [number, number][] = [];
  for (let lon = -180; lon <= 180; lon += 2) {
    ring.push([lon, Math.atan(-Math.cos((lon - slon) * RAD) / t) / RAD]);
  }
  ring.push([180, pole], [-180, pole], ring[0]);
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}
