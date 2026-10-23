// Market signals for traders: hourly risk-off pressure (Yahoo) and prediction-market odds shifts (Polymarket). Pure.

/** Bars sorted by time; t in ms. */
export type Bars = { t: number[]; v: number[] };
export type Leg = { sym: string; name: string; chg: number; z: number; at: number };
/** Fed meeting: expected move in basis points (+ = hike) and its 24h shift. */
export type Meeting = { title: string; end: number; bps: number; shift: number };
export type Signals = {
  at: number;
  /** Mean signed 4h z-score of the legs: + = risk-off (VIX, dollar, yields up; S&P down). null = all markets shut. */
  risk: number | null;
  legs: Leg[];
  fed: Meeting[];
  /** Probability of a US recession by the named year, and its 24h shift. */
  recession: { title: string; prob: number; shift: number } | null;
};

const HOUR = 3_600_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Yahoo v8 chart → bars without gaps. */
export const yahooBars = (j: unknown): Bars => {
  // deno-lint-ignore no-explicit-any
  const r = (j as any)?.chart?.result?.[0];
  const ts: unknown[] = r?.timestamp ?? [], cs: unknown[] = r?.indicators?.quote?.[0]?.close ?? [];
  const out: Bars = { t: [], v: [] };
  ts.forEach((t, i) => {
    const v = cs[i];
    if (typeof t === "number" && typeof v === "number" && Number.isFinite(v) && v > 0) {
      out.t.push(t * 1000);
      out.v.push(v);
    }
  });
  return out;
};

/** Last value at or before `t`, or null. */
export const valueAt = (b: Bars, t: number): number | null => {
  let i = b.t.length - 1;
  while (i >= 0 && b.t[i] > t) i--;
  return i >= 0 ? b.v[i] : null;
};

/** Log change over the last `h` hours and its z-score against every h-hour change in the series. Stale (last bar
 *  older than `maxAge`) or too short → null. */
export const leg = (b: Bars, sym: string, name: string, now: number, h = 4, maxAge = 3 * HOUR): Leg | null => {
  const n = b.t.length, last = b.t[n - 1];
  if (n < 50 || now - last > maxAge) return null;
  const changes = b.t.flatMap((t, i) => {
    const prev = valueAt(b, t - h * HOUR);
    return prev && t - h * HOUR >= b.t[0] ? [Math.log(b.v[i] / prev)] : [];
  });
  const prev = valueAt(b, last - h * HOUR);
  if (!prev || changes.length < 30) return null;
  const mean = changes.reduce((s, x) => s + x, 0) / changes.length;
  const sd = Math.sqrt(changes.reduce((s, x) => s + (x - mean) ** 2, 0) / changes.length);
  const chg = Math.log(b.v[n - 1] / prev);
  return sd > 0 ? { sym, name, chg: r2(chg * 100), z: r2(chg / sd), at: last } : null;
};

/** + = risk-off. Sign per symbol: fear and tighter money up, stocks down. */
export const RISK_SIGN: Record<string, 1 | -1> = { "ES=F": -1, "^VIX": 1, "DX-Y.NYB": 1, "^TNX": 1 };
export const riskScore = (legs: Leg[]): number | null =>
  legs.length ? r2(legs.reduce((s, l) => s + (RISK_SIGN[l.sym] ?? 0) * l.z, 0) / legs.length) : null;

/** "25 bps decrease" → −25, "No change" → 0, "50+ bps increase" → +50; unknown → null. */
export const outcomeBps = (label: string): number | null => {
  const l = label.toLowerCase();
  if (/no change/.test(l)) return 0;
  const m = l.match(/(\d+)\+?\s*bps\s*(decrease|increase|cut|hike)/);
  return m ? +m[1] * (/decrease|cut/.test(m[2]) ? -1 : 1) : null;
};

/** Expected move from outcome probabilities (renormalised: venue prices rarely sum to exactly 1). */
export const expectedBps = (outs: { bps: number; p: number }[]): number | null => {
  const sum = outs.reduce((s, o) => s + o.p, 0);
  return sum > 0 ? Math.round((10 * outs.reduce((s, o) => s + o.bps * o.p, 0)) / sum) / 10 : null;
};

export const label = (risk: number | null): string =>
  risk === null ? "Markets closed" : risk >= 1.5 ? "Risk-off" : risk <= -1.5 ? "Risk-on" : "Calm";
