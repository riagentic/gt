// Large geometry → content-addressed blob store; returns its served URL.
import { cellToBoundary } from "h3-js";
import { openBlobStore } from "aio/server";
import { cables, jamming } from "./sources.server.ts";

const store = openBlobStore("gn");

export async function put(json: string, name: string, previousUrl: string): Promise<string> {
  const info = await store.put(new TextEncoder().encode(json), { name });
  const old = previousUrl.split("/").pop();
  if (old && old !== info.id) await store.delete(old);
  return store.url(info.id);
}

export const storeCables = async (previousUrl: string): Promise<string> =>
  put(await cables(), "cables.geojson", previousUrl);

/** GPS interference hexes as polygons; cells straddling the antimeridian are dropped. */
export async function storeJam(
  previousUrl: string,
): Promise<{ url: string; date: string; high: number; medium: number }> {
  const { date, cells } = await jamming();
  const features = cells.flatMap((c) => {
    const ring = cellToBoundary(c.hex, true);
    const lons = ring.map((p) => p[0]);
    if (Math.max(...lons) - Math.min(...lons) > 180) return [];
    return [{
      type: "Feature",
      properties: { level: c.level, pct: Math.round((100 * c.bad) / c.total) },
      geometry: { type: "Polygon", coordinates: [ring] },
    }];
  });
  const url = await put(JSON.stringify({ type: "FeatureCollection", features }), `gpsjam-${date}.geojson`, previousUrl);
  return {
    url,
    date,
    high: cells.filter((c) => c.level === 2).length,
    medium: cells.filter((c) => c.level === 1).length,
  };
}
