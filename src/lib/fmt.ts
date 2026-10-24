// Display formatting. Pure.
const UNITS = [["day", 86_400], ["hour", 3600], ["minute", 60]] as const;
const unitOf = (s: number) => UNITS.find(([, n]) => s >= n)!;

/** Short age: "now" · "5m" · "3h" · "2d" in English, "teď" · "5 min" · "3 h" · "2 d" in Czech; other languages from
 *  the browser's own unit names. */
export const ago = (at: number, now: number, lang = "en"): string => {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (lang === "en" || lang === "cs") {
    const cs = lang === "cs";
    if (s < 60) return cs ? "teď" : "now";
    if (s < 3600) return `${Math.floor(s / 60)}${cs ? " min" : "m"}`;
    if (s < 86_400) return `${Math.floor(s / 3600)}${cs ? " h" : "h"}`;
    return `${Math.floor(s / 86_400)}${cs ? " d" : "d"}`;
  }
  try {
    if (s < 60) return new Intl.RelativeTimeFormat(lang, { numeric: "auto" }).format(0, "second");
    const [unit, n] = unitOf(s);
    return new Intl.NumberFormat(lang, { style: "unit", unit, unitDisplay: "narrow" }).format(Math.floor(s / n));
  } catch {
    return ago(at, now);
  }
};

/** As a phrase: "now" · "5m ago" (Czech: "teď" · "před 5 min"; other languages: the browser's own wording). */
export const since = (at: number, now: number, lang = "en"): string => {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (lang === "en" || lang === "cs") {
    const a = ago(at, now, lang);
    return s < 60 ? a : lang === "cs" ? `před ${a}` : `${a} ago`;
  }
  try {
    const f = new Intl.RelativeTimeFormat(lang, { numeric: "auto", style: "narrow" });
    if (s < 60) return f.format(0, "second");
    const [unit, n] = unitOf(s);
    return f.format(-Math.floor(s / n), unit);
  } catch {
    return since(at, now);
  }
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
