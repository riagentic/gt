// Upstream payload → app rows. Pure; every field defensively coerced.
// deno-lint-ignore-file no-explicit-any
export type Quake = {
  id: string;
  mag: number;
  place: string;
  at: number;
  lon: number;
  lat: number;
  depth: number;
  url: string;
  tsunami: boolean;
};
export type HazardKind = "wildfire" | "storm" | "volcano" | "flood" | "drought" | "quake" | "ice" | "other";
export type Hazard = {
  id: string;
  kind: HazardKind;
  title: string;
  at: number;
  lon: number;
  lat: number;
  level: 0 | 1 | 2;
  source: string;
  url: string;
};
export type Aircraft = {
  hex: string;
  call: string;
  reg: string;
  type: string;
  lon: number;
  lat: number;
  alt: number;
  spd: number;
  hdg: number;
  sq: string;
};
export type Quote = { sym: string; name: string; group: string; price: number; chg: number; spark: number[] };
export type Bet = {
  id: string;
  title: string;
  url: string;
  prob: number;
  vol: number;
  end: number;
  outcome: string;
  venue: "Polymarket" | "Kalshi";
};

const n = (
  v: unknown,
  d = 0,
): number => (typeof v === "number" && Number.isFinite(v)
  ? v
  : typeof v === "string" && v.trim() !== "" && Number.isFinite(+v)
  ? +v
  : d);
const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const ok = (lon: number, lat: number) => Math.abs(lon) <= 180 && Math.abs(lat) <= 90;

export const quakes = (geo: any): Quake[] =>
  (geo?.features ?? []).map((f: any): Quake => {
    const [lon, lat, depth] = f?.geometry?.coordinates ?? [];
    return {
      id: s(f?.id),
      mag: n(f?.properties?.mag),
      place: s(f?.properties?.place),
      at: n(f?.properties?.time),
      lon: n(lon, 999),
      lat: n(lat, 999),
      depth: n(depth),
      url: s(f?.properties?.url),
      tsunami: f?.properties?.tsunami === 1,
    };
  }).filter((q: Quake) => q.id && ok(q.lon, q.lat));

const EONET_KIND: Record<string, HazardKind> = {
  wildfires: "wildfire",
  severeStorms: "storm",
  volcanoes: "volcano",
  floods: "flood",
  drought: "drought",
  earthquakes: "quake",
  seaLakeIce: "ice",
};

export const eonet = (j: any): Hazard[] =>
  (j?.events ?? []).map((e: any): Hazard | null => {
    const g = (e?.geometry ?? []).filter((x: any) => x?.type === "Point").at(-1);
    if (!g) return null;
    const [lon, lat] = g.coordinates ?? [];
    return {
      id: s(e.id),
      kind: EONET_KIND[e?.categories?.[0]?.id] ?? "other",
      title: s(e.title),
      at: Date.parse(g.date) || 0,
      lon: n(lon, 999),
      lat: n(lat, 999),
      level: 0,
      source: "NASA EONET",
      url: readable(s(e?.sources?.[0]?.url) || s(e.link)),
    };
  }).filter((h: Hazard | null): h is Hazard => !!h && !!h.id && ok(h.lon, h.lat));

/** JTWC links its coded `.tcw` bulletin (served as a download); the prose warning sits beside it as `web.txt`. */
export const readable = (url: string): string => url.replace(/(\/jtwc\/products\/\w+)\.tcw$/, "$1web.txt");

const GDACS_KIND: Record<string, HazardKind> = {
  EQ: "quake",
  TC: "storm",
  FL: "flood",
  VO: "volcano",
  DR: "drought",
  WF: "wildfire",
};
const LEVEL: Record<string, 0 | 1 | 2> = { Green: 0, Orange: 1, Red: 2 };

export const gdacs = (geo: any): Hazard[] =>
  (geo?.features ?? []).map((f: any): Hazard => {
    const p = f?.properties ?? {};
    const [lon, lat] = f?.geometry?.coordinates ?? [];
    return {
      id: `gdacs-${s(p.eventtype)}-${n(p.eventid)}`,
      kind: GDACS_KIND[p.eventtype] ?? "other",
      title: s(p.name) || s(p.description),
      at: Date.parse(`${s(p.fromdate)}Z`) || 0,
      lon: n(lon, 999),
      lat: n(lat, 999),
      level: LEVEL[p.alertlevel] ?? 0,
      source: "GDACS",
      url: `https://www.gdacs.org/report.aspx?eventtype=${s(p.eventtype)}&eventid=${n(p.eventid)}`,
    };
  }).filter((h: Hazard) => ok(h.lon, h.lat));

export const aircraft = (j: any): Aircraft[] =>
  (j?.ac ?? []).filter((a: any) => typeof a?.lat === "number" && typeof a?.lon === "number").map((
    a: any,
  ): Aircraft => ({
    hex: s(a.hex),
    call: s(a.flight),
    reg: s(a.r),
    type: s(a.t),
    lon: +a.lon.toFixed(3),
    lat: +a.lat.toFixed(3),
    alt: a.alt_baro === "ground" ? 0 : Math.round(n(a.alt_baro)),
    spd: Math.round(n(a.gs)),
    hdg: Math.round(n(a.track)),
    sq: s(a.squawk),
  }));

export const yahoo = (j: any, sym: string, name: string, group: string): Quote | null => {
  const r = j?.chart?.result?.[0];
  const price = n(r?.meta?.regularMarketPrice, NaN);
  const closes: number[] = (r?.indicators?.quote?.[0]?.close ?? []).filter((v: unknown) => typeof v === "number");
  const prev = n(r?.meta?.chartPreviousClose, NaN);
  const base = closes.length > 1 ? closes.at(-2)! : prev;
  if (!Number.isFinite(price) || !Number.isFinite(base) || base === 0) return null;
  return { sym, name, group, price, chg: ((price - base) / base) * 100, spark: closes.slice(-30) };
};

export const coins = (j: any): Quote[] =>
  (Array.isArray(j) ? j : []).map((c: any): Quote => ({
    sym: s(c.symbol).toUpperCase(),
    name: s(c.name),
    group: "Crypto",
    price: n(c.current_price),
    chg: n(c.price_change_percentage_24h),
    spark: ((c?.sparkline_in_7d?.price ?? []) as number[]).filter((_, i) => i % 6 === 0),
  })).filter((q: Quote) => q.sym && q.price > 0);

const parse = (v: unknown): unknown[] => {
  try {
    return typeof v === "string" ? JSON.parse(v) : Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const yes = (m: any): number => n(parse(m?.outcomePrices)[0]);

/** Polymarket event → its leading outcome (multi-market: the likeliest one). */
export const bets = (j: any): Bet[] =>
  (Array.isArray(j) ? j : []).map((e: any): Bet | null => {
    const open = (e?.markets ?? []).filter((m: any) => !m?.closed && m?.active !== false);
    const m = open.length > 1 ? open.reduce((a: any, b: any) => (yes(b) > yes(a) ? b : a)) : open[0];
    if (!m) return null;
    return {
      id: s(e.id),
      title: s(e.title),
      url: `https://polymarket.com/event/${s(e.slug)}`,
      prob: yes(m),
      vol: n(e.volume),
      end: Date.parse(s(e.endDate)) || 0,
      outcome: open.length > 1 ? s(m.groupItemTitle) || s(m.question) : String(parse(m.outcomes)[0] ?? "Yes"),
      venue: "Polymarket",
    };
  }).filter((b: Bet | null): b is Bet => !!b && !!b.id);
