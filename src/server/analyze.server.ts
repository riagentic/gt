// WASM core (Rust): geotag + cluster headlines. Built from wasm/ via `deno task wasm`.
import init, { Analyzer } from "../wasm/bwm_core.js";
import { COUNTRIES } from "../data/countries.ts";
import { ALIASES } from "../data/aliases.ts";

export type Analysis = { tags: number[][]; clusters: number[] };

let analyzer: Analyzer | null = null;

const gazetteer = (): [string, number][] =>
  COUNTRIES.flatMap((c, id) => [c.name, ...(ALIASES[c.iso] ?? [])].map((a): [string, number] => [a, id]));

export async function analyze(titles: string[], threshold = 0.5): Promise<Analysis> {
  if (!analyzer) {
    await init({ module_or_path: await Deno.readFile(new URL("../wasm/bwm_core_bg.wasm", import.meta.url)) });
    analyzer = new Analyzer(JSON.stringify(gazetteer()));
  }
  return JSON.parse(analyzer.run(JSON.stringify(titles), threshold));
}
