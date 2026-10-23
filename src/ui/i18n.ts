// The UI's language. L: fixed text (src/i18n). T: live text — the saved translation, else the original while aipro
// translates it (asked once per session; a failed batch is asked again on a later render). C: country names.
import { ai } from "../cell/ai.ts";
import { prefs } from "../cell/prefs.ts";
import { BATCH, tr } from "../cell/tr.ts";
import { CS } from "../i18n/cs.ts";
import { fill, key } from "../lib/i18n.ts";

export const L = (en: string, vars?: Record<string, string | number>): string =>
  fill(prefs.lang === "cs" ? CS[en] ?? en : en, vars);

const asked = new Set<string>();
let queue: string[] = [];

const flush = () => {
  const batch = queue.splice(0, BATCH);
  if (queue.length) setTimeout(flush, 0);
  tr.want(batch).catch(() => {}).finally(() => {
    // The whole batch failed (aipro gone, busy): let a later render ask again.
    if (!tr.status.ok) { for (const t of batch) asked.delete(t); }
  });
};

export const T = (text: string): string => {
  if (prefs.lang === "en" || !text) return text;
  const hit = tr.cs[key(text)];
  if (hit) return hit[0];
  if (ai.ready && !asked.has(text)) {
    asked.add(text);
    if (queue.push(text) === 1) setTimeout(flush, 250);
  }
  return text;
};

const names = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["cs"], { type: "region" }) : null;
/** A country's name in the UI language (ISO 3166 alpha-2 code; English name as given otherwise). */
export const C = (en: string, iso?: string): string => {
  if (prefs.lang === "en" || !iso || !/^[A-Z]{2}$/.test(iso)) return en;
  try {
    return names?.of(iso) ?? en;
  } catch {
    return en;
  }
};
