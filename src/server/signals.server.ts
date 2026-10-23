// Market signals: fetch, compute, and append each snapshot to <data>/signals.jsonl for outside tools (quant).
import { join } from "@std/path";
import { appDirs } from "aio/server";
import * as S from "../lib/signals.ts";
import { json, pool } from "./net.server.ts";

const HOUR = 3_600_000;
const LEGS: [string, string][] = [
  ["ES=F", "S&P 500 futures"],
  ["^VIX", "VIX"],
  ["DX-Y.NYB", "US dollar"],
  ["^TNX", "US 10Y yield"],
];

async function legs(now: number): Promise<S.Leg[]> {
  const res = await pool(LEGS, 4, async ([sym, name]) =>
    S.leg(
      S.yahooBars(
        await json(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1mo&interval=60m`,
        ),
      ),
      sym,
      name,
      now,
    ));
  return res.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
}

/** Polymarket CLOB price `hours` ago (hourly history), or null. */
async function priceAgo(token: string, now: number, hours: number): Promise<number | null> {
  // deno-lint-ignore no-explicit-any
  const j: any = await json(
    `https://clob.polymarket.com/prices-history?market=${token}&startTs=${
      Math.floor((now - (hours + 6) * HOUR) / 1000)
    }&fidelity=60`,
  );
  const b: S.Bars = { t: [], v: [] };
  for (const x of j?.history ?? []) {
    if (typeof x?.t === "number" && typeof x?.p === "number") b.t.push(x.t * 1000), b.v.push(x.p);
  }
  return S.valueAt(b, now - hours * HOUR);
}

// deno-lint-ignore no-explicit-any
type Market = any;
const yes = (m: Market): { token: string; p: number } | null => {
  try {
    const p = Number(JSON.parse(m.outcomePrices)[0]), token = String(JSON.parse(m.clobTokenIds)[0]);
    return Number.isFinite(p) && token ? { token, p } : null;
  } catch {
    return null;
  }
};

/** The next two open "Fed Decision in <Month>?" events: expected bps now and 24h ago. */
async function fed(now: number): Promise<S.Meeting[]> {
  // deno-lint-ignore no-explicit-any
  const events: any[] = (await json(
    "https://gamma-api.polymarket.com/events?tag_slug=fed-rates&closed=false&active=true&limit=50",
  )) as never;
  const next = events.filter((e) => /^Fed Decision in /i.test(e?.title ?? "") && Date.parse(e.endDate) > now)
    .sort((a, b) => Date.parse(a.endDate) - Date.parse(b.endDate)).slice(0, 2);
  return (await Promise.all(next.map(async (e): Promise<S.Meeting | null> => {
    const outs = (e.markets ?? []).flatMap((m: Market) => {
      const bps = S.outcomeBps(String(m.groupItemTitle ?? "")), y = yes(m);
      return bps !== null && y && !m.closed ? [{ bps, ...y }] : [];
    });
    const past = await Promise.all(outs.map((o: { token: string; p: number }) => priceAgo(o.token, now, 24)));
    const bps = S.expectedBps(outs);
    const then = past.every((p) => p !== null)
      ? S.expectedBps(outs.map((o: { bps: number }, i: number) => ({ bps: o.bps, p: past[i]! })))
      : null;
    return bps === null ? null : {
      title: e.title,
      end: Date.parse(e.endDate),
      bps,
      shift: then === null ? 0 : Math.round((bps - then) * 10) / 10,
    };
  }))).flatMap((m) => (m ? [m] : []));
}

/** "US recession by end of <year>?", the nearest open year. */
async function recession(now: number): Promise<Signals["recession"]> {
  // deno-lint-ignore no-explicit-any
  const j: any = await json(
    "https://gamma-api.polymarket.com/public-search?q=US%20recession%20by%20end%20of&limit_per_type=10",
  );
  const e =
    (j?.events ?? []).filter((e: Market) => !e.closed && /^US recession by end of \d{4}\?$/i.test(e.title ?? ""))
      .sort((a: Market, b: Market) => Date.parse(a.endDate) - Date.parse(b.endDate))[0];
  const y = e && yes(e.markets?.[0]);
  if (!y) return null;
  const then = await priceAgo(y.token, now, 24);
  return { title: e.title, prob: y.p, shift: then === null ? 0 : Math.round((y.p - then) * 1000) / 1000 };
}
type Signals = S.Signals;

export async function signals(now: number): Promise<Signals> {
  const run = <T>(f: () => Promise<T>) => Promise.resolve().then(f);
  const [l, f, r] = await Promise.allSettled([run(() => legs(now)), run(() => fed(now)), run(() => recession(now))]);
  if ([l, f, r].every((x) => x.status === "rejected")) throw (l as PromiseRejectedResult).reason;
  const ls = l.status === "fulfilled" ? l.value : [];
  const out: Signals = {
    at: now,
    risk: S.riskScore(ls),
    legs: ls,
    fed: f.status === "fulfilled" ? f.value : [],
    recession: r.status === "fulfilled" ? r.value : null,
  };
  await Deno.writeTextFile(join(appDirs("gn").data, "signals.jsonl"), JSON.stringify(out) + "\n", { append: true });
  return out;
}
