// One-off: static infrastructure layers → assets/infra.geojson (points) + assets/lanes.geojson (lines).
// They change on a scale of years, so they ship with the app: instant, offline, no rate limits at runtime.
//   Wikidata (CC0): military bases, nuclear power plants, spaceports, data centers
//   NGA World Port Index (public domain): large + medium ports
//   newzealandpaul/Shipping-Lanes (CC BY 4.0): major / middle / minor lanes
// Run: deno task infra
import type * as GeoJSON from "geojson";

const UA = "bwm/0.3 (Better World Monitor desktop app; build script)";
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (c: unknown): unknown =>
  Array.isArray(c) ? (typeof c[0] === "number" ? c.map((n: number) => Math.round(n * 100) / 100) : c.map(r2)) : c;

type Kind = "base" | "nuclear" | "spaceport" | "datacenter" | "port";
const pt = (kind: Kind, id: string, title: string, cc: string, lon: number, lat: number): GeoJSON.Feature => ({
  type: "Feature",
  properties: { id, kind, title, cc },
  geometry: { type: "Point", coordinates: [r3(lon), r3(lat)] },
});

// ── Wikidata ───────────────────────────────────────────────────────────────
// minLinks = how many Wikipedia languages cover it: a cheap notability filter (bases have thousands of stubs).
const WIKIDATA: [Kind, string, number][] = [
  ["base", "Q245016", 3],
  ["nuclear", "Q134447", 1],
  ["spaceport", "Q194188", 1],
  ["datacenter", "Q671224", 0],
];
const sparql = (cls: string, minLinks: number) => `
SELECT DISTINCT ?item ?itemLabel ?coord ?cc WHERE {
  ?item wdt:P31/wdt:P279* wd:${cls}; wdt:P625 ?coord; wikibase:sitelinks ?sl.
  FILTER(?sl >= ${minLinks})
  FILTER NOT EXISTS { ?item wdt:P576 ?gone }
  FILTER NOT EXISTS { ?item wdt:P582 ?ended }
  OPTIONAL { ?item wdt:P17 ?c. ?c wdt:P297 ?cc }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}`;

async function wikidata(kind: Kind, cls: string, minLinks: number): Promise<GeoJSON.Feature[]> {
  for (let attempt = 0;; attempt++) {
    const r = await fetch("https://query.wikidata.org/sparql", {
      method: "POST",
      headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
      body: new URLSearchParams({ query: sparql(cls, minLinks) }),
    });
    if (r.status === 429 && attempt < 6) {
      await r.body?.cancel();
      const wait = Number(r.headers.get("retry-after")) || 30 * (attempt + 1);
      console.log(`  ${kind}: rate limited, waiting ${wait}s`);
      await new Promise((ok) => setTimeout(ok, wait * 1000));
      continue;
    }
    if (!r.ok) throw new Error(`wikidata ${kind}: HTTP ${r.status}`);
    // deno-lint-ignore no-explicit-any
    const rows = (await r.json()).results.bindings as any[];
    const seen = new Set<string>();
    return rows.flatMap((b) => {
      const id = String(b.item.value).split("/").pop()!;
      const m = String(b.coord?.value).match(/Point\(([-\d.eE]+) ([-\d.eE]+)\)/);
      const title = String(b.itemLabel?.value ?? "");
      // Unlabelled items come back as their Q-id; coordinates off-Earth (Moon/Mars globes) fail the range test.
      if (!m || seen.has(id) || /^Q\d+$/.test(title) || Math.abs(+m[1]) > 180 || Math.abs(+m[2]) > 90) return [];
      seen.add(id);
      return [pt(kind, id, title, String(b.cc?.value ?? ""), +m[1], +m[2])];
    });
  }
}

// ── World Port Index ───────────────────────────────────────────────────────
/** RFC 4180 rows (quoted fields may hold commas). */
const csv = (text: string): string[][] =>
  text.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean).map((line) => {
    const out: string[] = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') cur += '"', i++;
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") out.push(cur), cur = "";
      else cur += ch;
    }
    return [...out, cur];
  });

async function ports(): Promise<GeoJSON.Feature[]> {
  const url = "https://msi.nga.mil/api/publications/download?type=view&key=16920959/SFH00000/UpdatedPub150.csv";
  const [head, ...rows] = csv(await (await fetch(url, { headers: { "User-Agent": UA } })).text());
  const col = (name: string) => head.indexOf(name);
  const [name, country, size, num, lat, lon] = [
    "Main Port Name",
    "Country Code",
    "Harbor Size",
    "World Port Index Number",
    "Latitude",
    "Longitude",
  ]
    .map(col);
  if ([name, size, lat, lon].some((i) => i < 0)) throw new Error("WPI columns changed");
  return rows.filter((r) => r[size] === "Large" || r[size] === "Medium").map((r) =>
    pt("port", `wpi-${r[num]}`, `${r[name]} (${r[size].toLowerCase()} port)`, r[country], +r[lon], +r[lat])
  );
}

// ── Shipping lanes ─────────────────────────────────────────────────────────
async function lanes(): Promise<GeoJSON.FeatureCollection> {
  const url = "https://raw.githubusercontent.com/newzealandpaul/Shipping-Lanes/main/data/Shipping_Lanes_v1.geojson";
  const fc = await (await fetch(url)).json() as GeoJSON.FeatureCollection<GeoJSON.MultiLineString>;
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => ({
      type: "Feature",
      properties: { type: String(f.properties?.Type ?? "Minor") },
      geometry: { type: f.geometry.type, coordinates: r2(f.geometry.coordinates) } as GeoJSON.MultiLineString,
    })),
  };
}

const points: GeoJSON.Feature[] = [];
for (const [kind, cls, min] of WIKIDATA) {
  const fs = await wikidata(kind, cls, min);
  console.log(kind, fs.length);
  points.push(...fs);
  await new Promise((ok) => setTimeout(ok, 3000)); // be polite to the public endpoint
}
const p = await ports();
console.log("port", p.length);
points.push(...p);
await Deno.writeTextFile("assets/infra.geojson", JSON.stringify({ type: "FeatureCollection", features: points }));
const l = await lanes();
await Deno.writeTextFile("assets/lanes.geojson", JSON.stringify(l));
console.log("lanes", l.features.length);
