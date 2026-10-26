// Every upstream fetch, normalized. Server-only (network); cells call these.
import { FEEDS } from "../data/feeds.ts";
import { parseFeed } from "../lib/rss.ts";
import * as intel from "../lib/intel.ts";
import { cycloneSearch, ongoing } from "../lib/meteo.ts";
import * as norm from "../lib/normalize.ts";
import { dedupe, type Raw, type Story, toStories } from "../lib/stories.ts";
import { analyze } from "./analyze.server.ts";
import { json, pool, text } from "./net.server.ts";

const DAY = 86_400_000;
const gnews = (url: string) => url.startsWith("https://news.google.com/");

export async function news(now: number): Promise<{ stories: Story[]; failed: string[] }> {
  const res = await pool(
    FEEDS,
    10,
    async (f) =>
      parseFeed(await text(f.url), now).filter((i) => now - i.at < 2 * DAY).sort((a, b) => b.at - a.at).slice(0, 25)
        .map((i): Raw => ({
          ...i,
          title: gnews(f.url) ? i.title.replace(/ [-–—|] [^-–—|]+$/, "") : i.title,
          summary: gnews(f.url) ? "" : i.summary.slice(0, 240),
          source: f.name,
          region: f.region,
        })),
  );
  const failed = FEEDS.filter((_, i) => res[i].status === "rejected").map((f) => f.name);
  if (failed.length === FEEDS.length) throw new Error("all feeds unreachable — offline?");
  const items = dedupe(res.flatMap((r) => (r.status === "fulfilled" ? r.value : []))).slice(0, 1500);
  const { tags, clusters } = await analyze(items.map((i) => i.title));
  return { stories: toStories(items, tags, clusters, 400), failed };
}

export async function hazards(): Promise<{ quakes: norm.Quake[]; events: norm.Hazard[] }> {
  const [wk, day, eo, gd, tc] = await Promise.allSettled([
    json("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson"),
    json("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson"),
    json("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30"),
    json("https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP"),
    json(cycloneSearch(Date.now())),
  ]);
  const val = <T>(
    r: PromiseSettledResult<unknown>,
    f: (j: unknown) => T[],
  ): T[] => (r.status === "fulfilled" ? f(r.value) : []);
  if ([wk, day, eo, gd].every((r) => r.status === "rejected")) throw new Error("hazard sources unreachable");
  const quakes = [...new Map([...val(wk, norm.quakes), ...val(day, norm.quakes)].map((q) => [q.id, q])).values()]
    .sort((a, b) => b.at - a.at);
  const gdacs = [...val(gd, norm.gdacs), ...val(tc, (j) => norm.gdacs(ongoing(j)))].filter((h) => h.kind !== "quake");
  const events = [...val(eo, norm.eonet), ...new Map(gdacs.map((h) => [h.id, h])).values()]
    .sort((a, b) => b.level - a.level || b.at - a.at).slice(0, 300);
  return { quakes, events };
}

export const aircraft = async (): Promise<norm.Aircraft[]> => norm.aircraft(await json("https://api.adsb.lol/v2/mil"));

export const SYMBOLS: [string, string, string][] = [
  ["^GSPC", "S&P 500", "Indices"],
  ["^IXIC", "Nasdaq", "Indices"],
  ["^DJI", "Dow Jones", "Indices"],
  ["^STOXX50E", "Euro Stoxx 50", "Indices"],
  ["^FTSE", "FTSE 100", "Indices"],
  ["^N225", "Nikkei 225", "Indices"],
  ["^HSI", "Hang Seng", "Indices"],
  ["000001.SS", "Shanghai", "Indices"],
  ["^VIX", "VIX", "Indices"],
  ["CL=F", "WTI Crude", "Commodities"],
  ["BZ=F", "Brent", "Commodities"],
  ["NG=F", "Natural Gas", "Commodities"],
  ["GC=F", "Gold", "Commodities"],
  ["SI=F", "Silver", "Commodities"],
  ["HG=F", "Copper", "Commodities"],
  ["ZW=F", "Wheat", "Commodities"],
  ["DX-Y.NYB", "US Dollar Index", "FX · Rates"],
  ["EURUSD=X", "EUR/USD", "FX · Rates"],
  ["JPY=X", "USD/JPY", "FX · Rates"],
  ["CNY=X", "USD/CNY", "FX · Rates"],
  ["^TNX", "US 10Y Yield", "FX · Rates"],
  ["XLK", "Technology", "Sectors"],
  ["XLF", "Financials", "Sectors"],
  ["XLE", "Energy", "Sectors"],
  ["XLV", "Health care", "Sectors"],
  ["XLI", "Industrials", "Sectors"],
  ["XLY", "Discretionary", "Sectors"],
  ["XLP", "Staples", "Sectors"],
  ["XLU", "Utilities", "Sectors"],
  ["XLB", "Materials", "Sectors"],
  ["XLRE", "Real estate", "Sectors"],
  ["XLC", "Communications", "Sectors"],
  ["IBIT", "IBIT · BTC", "Crypto ETFs"],
  ["FBTC", "FBTC · BTC", "Crypto ETFs"],
  ["ETHA", "ETHA · ETH", "Crypto ETFs"],
];

export async function markets(): Promise<{ quotes: norm.Quote[]; fear: number }> {
  const res = await pool(
    SYMBOLS,
    3,
    async ([sym, name, group]) =>
      norm.yahoo(
        await json(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1mo&interval=1d`,
        ),
        sym,
        name,
        group,
      ),
  );
  const [cg, fg] = await Promise.allSettled([
    json(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,ripple,binancecoin,dogecoin&order=market_cap_desc&sparkline=true&price_change_percentage=24h",
    ),
    json("https://api.alternative.me/fng/?limit=1"),
  ]);
  const quotes = [
    ...res.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : [])),
    ...(cg.status === "fulfilled" ? norm.coins(cg.value) : []),
  ];
  if (quotes.length === 0) throw new Error("market sources unreachable");
  // deno-lint-ignore no-explicit-any
  const fear = fg.status === "fulfilled" ? Number((fg.value as any)?.data?.[0]?.value) || 0 : 0;
  return { quotes, fear };
}

export async function bets(): Promise<norm.Bet[]> {
  const q = (tag: string) =>
    json(
      `https://gamma-api.polymarket.com/events?tag_slug=${tag}&closed=false&active=true&archived=false&order=volume24hr&ascending=false&limit=40`,
    );
  const res = await Promise.allSettled([q("geopolitics"), q("world"), q("politics")]);
  if (res.every((r) => r.status === "rejected")) throw new Error("polymarket unreachable");
  const all = res.flatMap((r) => (r.status === "fulfilled" ? norm.bets(r.value) : []));
  return [...new Map(all.map((b) => [b.id, b])).values()].sort((a, b) => b.vol - a.vol).slice(0, 60);
}

/** Submarine cables GeoJSON (TeleGeography), slimmed: name + color + geometry. */
export async function cables(): Promise<string> {
  // deno-lint-ignore no-explicit-any
  const geo = await json("https://www.submarinecablemap.com/api/v3/cable/cable-geo.json") as any;
  // deno-lint-ignore no-explicit-any
  const features = (geo?.features ?? []).map((f: any) => ({
    type: "Feature",
    properties: { name: String(f?.properties?.name ?? ""), color: String(f?.properties?.color ?? "#3aa0ff") },
    geometry: f.geometry,
  }));
  if (features.length === 0) throw new Error("cable map empty");
  return JSON.stringify({ type: "FeatureCollection", features });
}

const SAT_GROUPS: [string, intel.SatGroup][] = [["stations", "stations"], ["military", "military"], ["gnss", "gnss"], [
  "resource",
  "earth",
]];

/** CelesTrak TLEs. Their policy: no more than once per 2h per group. */
export async function satellites(): Promise<intel.Tle[]> {
  const res = await Promise.allSettled(
    SAT_GROUPS.map(async ([g, group]) =>
      intel.tles(await text(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${g}&FORMAT=tle`), group)
    ),
  );
  const all = res.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  if (all.length === 0) throw new Error("CelesTrak unreachable");
  return [...new Map(all.map((t) => [t.id, t])).values()];
}

export async function advisories(now: number): Promise<intel.Advisory[]> {
  const list = intel.advisories(parseFeed(await text("https://travel.state.gov/_res/rss/TAsTWs.xml"), now));
  if (list.length === 0) throw new Error("advisory feed empty");
  return list;
}

export async function outbreaks(): Promise<intel.Outbreak[]> {
  const rows = intel.who(
    await json(
      "https://www.who.int/api/emergencies/diseaseoutbreaknews?sf_provider=dynamicProvider372&sf_culture=en&$orderby=PublicationDateAndTime%20desc&$select=Title,ItemDefaultUrl,PublicationDateAndTime&$top=40",
    ),
  );
  const { tags } = await analyze(rows.map((r) => r.title), 1.1);
  return rows.map((r, i) => ({ ...r, places: tags[i] }));
}

/** Latest gpsjam.org day: H3 res-4 cells with ADS-B navigation integrity loss. */
export async function jamming(): Promise<{ date: string; cells: intel.JamCell[] }> {
  const manifest = await text("https://gpsjam.org/data/manifest.csv");
  const date = manifest.trim().split("\n").at(-1)?.split(",")[0] ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("gpsjam manifest unreadable");
  return { date, cells: intel.jamCells(await text(`https://gpsjam.org/data/${date}-h3_4.csv`)) };
}
