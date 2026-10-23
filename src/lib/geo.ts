// Point-in-country lookup with a bbox prefilter. Pure.
import type * as GeoJSON from "geojson";
type Ring = number[][];
type Shape = { id: number; bbox: [number, number, number, number]; polys: Ring[][] };

const inRing = (x: number, y: number, r: Ring): boolean => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

export function locator(fc: GeoJSON.FeatureCollection): (lon: number, lat: number) => number {
  const shapes: Shape[] = fc.features.map((f) => {
    const g = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
    const polys = (g.type === "Polygon" ? [g.coordinates] : g.coordinates) as Ring[][];
    const pts = polys.flatMap((p) => p[0]);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return {
      id: Number(f.id ?? f.properties?.id),
      bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      polys,
    };
  });
  return (x, y) =>
    shapes.find((s) =>
      x >= s.bbox[0] && x <= s.bbox[2] && y >= s.bbox[1] && y <= s.bbox[3] &&
      s.polys.some((p) => inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h)))
    )?.id ?? -1;
}

export type BBox = [number, number, number, number];

/** Bounds of a country's largest polygon — its main landmass, so Alaska or a far island doesn't zoom out to the world. */
export function mainBounds(f: GeoJSON.Feature): BBox {
  const g = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  const box = (ring: number[][]): BBox => {
    const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  const area = (b: BBox) => (b[2] - b[0]) * (b[3] - b[1]);
  return polys.map((p) => box(p[0])).reduce((a, b) => (area(b) > area(a) ? b : a));
}
