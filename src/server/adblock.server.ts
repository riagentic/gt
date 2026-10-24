// Ads and annoyances (cookie walls, newsletter pop-ups, social widgets) taken out of the reader's pages the way uBlock
// Origin's cosmetic filtering does it: Ghostery's engine with the EasyList family of lists (ads, tracking, cookies,
// annoyances) answers which elements of a page to hide, and the lists' small site scripts ("scriptlets": e.g. a
// cookie that says the consent dialog was answered, so it never opens). The reader injects both; the page keeps its
// own look. Hidden only: the page still downloads them — aio gives an app no hook into Electron's network.
import { serverFns } from "aio";
import { appDirs } from "aio/server";
import { FiltersEngine } from "@ghostery/adblocker";
import { parse } from "tldts-experimental";

const WEEK = 7 * 24 * 3600_000;
/** Fewer than this many classes / ids / links per call: a page's DOM, not a flood. */
const MAX_FEATURES = 20_000;

/** The engine, from the week-old cache or freshly built from the lists. */
const load = async (): Promise<FiltersEngine> => {
  const file = `${appDirs("gn").cache}/adblock.bin`;
  const at = await Deno.stat(file).then((s) => s.mtime?.getTime() ?? 0, () => 0);
  if (Date.now() - at < WEEK) {
    try {
      return FiltersEngine.deserialize(await Deno.readFile(file));
    } catch { /* a cache from another engine version: build anew */ }
  }
  const engine = await FiltersEngine.fromPrebuiltFull(fetch);
  await Deno.mkdir(appDirs("gn").cache, { recursive: true });
  await Deno.writeFile(file, engine.serialize());
  return engine;
};

let engine: Promise<FiltersEngine> | null = null;
const get = () => engine ??= load().catch((e) => (engine = null, Promise.reject(e)));

const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, MAX_FEATURES) : [];

export const adblock = serverFns("adblock", {
  /** What takes the clutter out of the page at `url`: its site's own rules, scripts and the generic rules (`site`),
   *  or the rules the page's classes, ids and links match. Empty when there are none, or the lists are not loaded. */
  rules: async (
    url: string,
    site: boolean,
    classes: string[],
    ids: string[],
    hrefs: string[],
  ): Promise<{ css: string; scripts: string[] }> => {
    const { hostname, domain } = parse(url);
    const e = hostname && /^https?:/.test(url) ? await get().catch(() => null) : null;
    const r = e?.getCosmeticsFilters({
      url,
      hostname: hostname ?? "",
      domain: domain ?? "",
      classes: list(classes),
      ids: list(ids),
      hrefs: list(hrefs),
      getBaseRules: site,
      getRulesFromHostname: site,
      getRulesFromDOM: !site,
      getInjectionRules: site,
      getExtendedRules: false,
    });
    return { css: r?.styles ?? "", scripts: r?.scripts ?? [] };
  },
});
