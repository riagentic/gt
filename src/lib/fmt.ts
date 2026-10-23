// Display formatting. Pure.
/** Short age: "now" · "5m" · "3h" · "2d" (Czech with `cs`: "teď" · "5 min" · "3 h" · "2 d"). */
export const ago = (at: number, now: number, cs = false): string => {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return cs ? "teď" : "now";
  if (s < 3600) return `${Math.floor(s / 60)}${cs ? " min" : "m"}`;
  if (s < 86_400) return `${Math.floor(s / 3600)}${cs ? " h" : "h"}`;
  return `${Math.floor(s / 86_400)}${cs ? " d" : "d"}`;
};

/** As a phrase: "now" · "5m ago" (Czech: "teď" · "před 5 min"). */
export const since = (at: number, now: number, cs = false): string => {
  const a = ago(at, now, cs);
  return now - at < 59_500 ? a : cs ? `před ${a}` : `${a} ago`;
};

export const num = (v: number, digits = 2): string =>
  v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const compact = (v: number): string =>
  Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);

export const pct = (v: number): string => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

export const host = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
