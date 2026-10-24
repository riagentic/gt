// The UI's language. L: fixed text — Czech from its hand-made dictionary (src/i18n), every other language
// translated once by aipro. T: live text, translated once by aipro. Both show the English until the translation
// arrives (asked once per session per language; a failed batch is asked again on a later render).
// C: country names, and `locale`: dates and numbers — both from the browser's own tables, no AI.
import { effect } from "aio/air";
import { ai } from "../cell/ai.ts";
import { prefs } from "../cell/prefs.ts";
import { BATCH, tr } from "../cell/tr.ts";
import { BY_CODE } from "../data/languages.ts";
import { CS } from "../i18n/cs.ts";
import { fill, item, tkey } from "../lib/i18n.ts";

/** The saved translation of `text` into the UI language, if any. */
export const got = (text: string): string | undefined => tr.done[tkey(prefs.lang, text)]?.[0];

const asked = new Set<string>();
const queues = { front: [] as string[], back: [] as string[] };

const flush = (front: boolean) => {
  const q = front ? queues.front : queues.back;
  const lang = prefs.lang, batch = q.splice(0, BATCH); // a switch empties the queues, so all of these are `lang`
  if (q.length) setTimeout(() => flush(front), 0);
  if (lang === "en" || !batch.length) return;
  tr.want(lang, batch, front).then(() => tr.drain()).catch(() => {}).finally(() => {
    // aipro gone or busy: let a later render ask again.
    if (!tr.status.ok) { for (const t of batch) asked.delete(item(lang, t)); }
  });
};

/** Queue `text` for aipro (fixed UI text goes in front of live text). */
const ask = (text: string, front: boolean) => {
  const id = item(prefs.lang, text);
  if (!ai.ready || asked.has(id)) return;
  asked.add(id);
  const q = front ? queues.front : queues.back;
  if (q.push(text) === 1) setTimeout(() => flush(front), 250);
};

export const L = (en: string, vars?: Record<string, string | number>): string => {
  const lang = prefs.lang;
  if (lang === "en") return fill(en, vars);
  if (lang === "cs") return fill(CS[en] ?? en, vars);
  const hit = got(en);
  if (!hit) ask(en, true);
  return fill(hit ?? en, vars);
};

export const T = (text: string): string => {
  if (prefs.lang === "en" || !text) return text;
  const hit = got(text);
  if (!hit) ask(text, false);
  return hit ?? text;
};

/** BCP 47 locale for dates and numbers. */
export const locale = (): string => (prefs.lang === "en" ? "en-US" : prefs.lang);

const regionNames = new Map<string, Intl.DisplayNames | null>();
/** A country's name in the UI language (ISO 3166 alpha-2 code; English name as given otherwise). */
export const C = (en: string, iso?: string): string => {
  const lang = prefs.lang;
  if (lang === "en" || !iso || !/^[A-Z]{2}$/.test(iso)) return en;
  if (!regionNames.has(lang)) {
    try {
      regionNames.set(lang, new Intl.DisplayNames([lang], { type: "region", fallback: "none" }));
    } catch {
      regionNames.set(lang, null);
    }
  }
  try {
    return regionNames.get(lang)?.of(iso) ?? en;
  } catch {
    return en;
  }
};

/** "čeština — Czech": a language's own name (when the browser knows it) and its English name. */
export const languageLabel = (code: string): string => {
  const en = BY_CODE[code]?.name ?? code;
  try {
    const own = new Intl.DisplayNames([code], { type: "language", fallback: "none" }).of(code);
    return own && own.toLowerCase() !== en.toLowerCase() ? `${own} — ${en}` : en;
  } catch {
    return en;
  }
};

/** Start the language hooks: from the app's onMount — an effect made at import never re-runs on cell state. Answers
 *  their disposers. */
export const watchLang = (): (() => void)[] => {
  let shown: string | null = null;
  return [
    // The page's language, for fonts and screen readers. Layout stays left-to-right; each block of text takes its own
    // direction from its content (style.css `unicode-bidi: plaintext`), so Arabic, Urdu and Persian read right to left.
    effect(() => void (document.documentElement.lang = locale())),
    // Translate into the active language only: a switch drops what is still queued for the old one, here and in aipro.
    effect(() => {
      const lang = prefs.lang;
      if (shown !== null && lang !== shown) {
        queues.front.length = queues.back.length = 0;
        tr.keep(lang).catch(() => {});
      }
      shown = lang;
    }),
  ];
};
