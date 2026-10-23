// Parsers: Kalshi, CNN Fear & Greed, CFTC positioning, US debt, policy rates. Pure.
// deno-lint-ignore-file no-explicit-any
import type { Bet } from "./normalize.ts";

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const n = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN);

/** Kalshi categories worth a world monitor (sports and entertainment are not). */
export const KALSHI_TOPICS = new Set([
  "Elections",
  "Politics",
  "Economics",
  "World",
  "Climate and Weather",
  "Financials",
  "Health",
]);

/** Kalshi events → bets: the likeliest open market, volume = all-time contracts traded. */
export const kalshi = (j: any): Bet[] =>
  (j?.events ?? []).flatMap((e: any): Bet[] => {
    if (!KALSHI_TOPICS.has(s(e.category))) return [];
    const open = (e.markets ?? []).filter((m: any) =>
      s(m.status) === "active" && Number.isFinite(n(m.last_price_dollars))
    );
    if (!open.length) return [];
    const m = open.reduce((a: any, b: any) => (n(b.last_price_dollars) > n(a.last_price_dollars) ? b : a));
    const end = Date.parse(s(m.close_time)) || 0;
    return [{
      id: `kalshi-${s(e.event_ticker)}`,
      title: s(e.title),
      url: `https://kalshi.com/markets/${s(e.series_ticker).toLowerCase()}`,
      prob: n(m.last_price_dollars),
      vol: open.reduce((t: number, x: any) => t + (n(x.volume_fp) || 0), 0),
      end: end > Date.UTC(2060, 0) ? 0 : end, // far-future closes (2070, 2099) = no fixed end
      outcome: open.length > 1 ? s(m.yes_sub_title) || s(m.title) : "Yes",
      venue: "Kalshi",
    }];
  });

export type Mood = { score: number; rating: string; week: number; month: number };
export const cnnFear = (j: any): Mood | null => {
  const f = j?.fear_and_greed;
  return Number.isFinite(n(f?.score))
    ? {
      score: Math.round(n(f.score)),
      rating: s(f.rating),
      week: Math.round(n(f.previous_1_week)),
      month: Math.round(n(f.previous_1_month)),
    }
    : null;
};

/** Speculators' (non-commercial) net position as % of open interest, per contract. */
export type Positioning = { name: string; net: number; pct: number; date: string };
// A Map, not an object: "133741" is an integer-like key and would jump the queue in an object.
export const COT = new Map([
  ["13874A", "S&P 500"],
  ["043602", "10Y Treasury"],
  ["099741", "Euro"],
  ["088691", "Gold"],
  ["067651", "WTI crude"],
  ["133741", "Bitcoin"],
]);
export const cot = (rows: any): Positioning[] => {
  const latest = new Map<string, any>();
  for (const r of Array.isArray(rows) ? rows : []) {
    const code = s(r.cftc_contract_market_code);
    if (COT.has(code) && !latest.has(code)) latest.set(code, r); // rows arrive newest first
  }
  return [...COT].flatMap(([code, name]): Positioning[] => {
    const r = latest.get(code);
    if (!r) return [];
    const net = n(r.noncomm_positions_long_all) - n(r.noncomm_positions_short_all), oi = n(r.open_interest_all);
    return Number.isFinite(net) && oi > 0
      ? [{
        name,
        net,
        pct: +((100 * net) / oi).toFixed(1),
        date: s(r.report_date_as_yyyy_mm_dd).slice(0, 10),
      }]
      : [];
  });
};

export type Macro = { label: string; value: string; date: string; hint: string };

export const usDebt = (j: any): Macro | null => {
  const r = j?.data?.[0], v = n(r?.tot_pub_debt_out_amt);
  return Number.isFinite(v)
    ? {
      label: "US federal debt",
      value: `$${(v / 1e12).toFixed(2)}T`,
      date: s(r.record_date),
      hint: "Treasury · debt to the penny",
    }
    : null;
};

export const effr = (j: any): Macro | null => {
  const r = j?.refRates?.[0];
  return Number.isFinite(n(r?.percentRate))
    ? {
      label: "Fed funds (EFFR)",
      value: `${n(r.percentRate).toFixed(2)}%`,
      date: s(r.effectiveDate),
      hint: `target ${n(r.targetRateFrom)}–${n(r.targetRateTo)}%`,
    }
    : null;
};

/** ECB SDMX-JSON, single series, last observation. */
export const ecbRate = (j: any): Macro | null => {
  const series = Object.values(j?.dataSets?.[0]?.series ?? {})[0] as any;
  const obs = Object.values(series?.observations ?? {})[0] as any;
  const date = s(j?.structure?.dimensions?.observation?.[0]?.values?.at(-1)?.id);
  return Number.isFinite(n(obs?.[0]))
    ? { label: "ECB deposit rate", value: `${n(obs[0]).toFixed(2)}%`, date, hint: "ECB Data Portal" }
    : null;
};
