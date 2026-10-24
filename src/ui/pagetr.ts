// Translates the reader's open page in place, in any language but English: each loaded page's readable blocks go to aipro through
// the same translate-once store as all live text (cell `tr`), and land in the page as they arrive.
import { effect, signal, untrack } from "aio/air";
import { ai } from "../cell/ai.ts";
import { prefs } from "../cell/prefs.ts";
import { BATCH, tr } from "../cell/tr.ts";
import { apply, COLLECT, RESTORE } from "../lib/pagetr.ts";
import { got } from "./i18n.ts";

type Guest = HTMLElement & { executeJavaScript(code: string): Promise<unknown> };
/** The open page's blocks; `asked`: sent to aipro; `tries`: times sent (the queue ran dry with blocks still missing
 *  — aipro restarted, a run was cut off — sends what is missing again, up to TRIES). */
type Page = { texts: string[]; asked: boolean; tries: number };
const TRIES = 3;

export const page = signal<Page | null>(null);
/** Show the page's own text instead. */
export const original = signal(false);
let guest: Guest | null = null;
let applied = new Set<number>();

const run = (code: string) => guest?.executeJavaScript(code).catch(() => null) ?? Promise.resolve(null);

const collect = async () => {
  page.set(null);
  applied = new Set();
  if (prefs.lang === "en" || !guest) return;
  const texts = await run(COLLECT);
  if (Array.isArray(texts) && texts.length) page.set({ texts: texts as string[], asked: false, tries: 0 });
};

/** Hook a reader <webview> (once per element); null when the reader closes. */
export const attach = (el: HTMLElement | null) => {
  if (el && !el.dataset.tr) {
    el.dataset.tr = "1";
    el.addEventListener("did-stop-loading", () => {
      original.set(false);
      void collect();
    });
  }
  guest = el as Guest | null;
  if (!el) page.set(null);
};

/** Translated so far / blocks on the page. */
export const progress = (): [number, number] => {
  const p = page.value;
  return p ? [p.texts.filter((t) => got(t)).length, p.texts.length] : [0, 0];
};

/** Ask again for what is still missing (aipro was busy or away). */
export const retry = () => {
  const p = page.value;
  if (p) page.set({ ...p, asked: false, tries: 0 });
};

// Language switched while a page is open: translate it anew (collect puts the original back first), or restore it.
effect(() => {
  const en = prefs.lang === "en";
  untrack(() => en ? run(RESTORE).then(() => page.set(null)) : collect());
});

// Ask aipro for what is missing (top of the page first), and put translations in as they arrive.
effect(() => {
  const p = page.value;
  if (!p) return;
  if (original.value) {
    applied = new Set();
    void run(RESTORE);
    return;
  }
  const m: Record<number, string> = {};
  p.texts.forEach((t, i) => {
    const hit = got(t);
    if (hit && !applied.has(i)) {
      m[i] = hit;
      applied.add(i);
    }
  });
  if (Object.keys(m).length) void run(apply(m));
  const idle = !tr.pending && !tr.status.busy;
  if (ai.ready && (!p.asked || (idle && p.tries < TRIES && applied.size < p.texts.length))) {
    p.asked = true;
    p.tries++;
    const lang = prefs.lang, todo = p.texts.filter((t) => !untrack(() => got(t)));
    // To the front of the queue, top of the page first: chunks go in last-to-first so the first ends up in front.
    const chunks = [];
    for (let i = 0; i < todo.length; i += BATCH) chunks.push(todo.slice(i, i + BATCH));
    void chunks.reverse().reduce((at, c) => at.then(() => tr.want(lang, c, true)), Promise.resolve())
      .then(() => tr.drain()).catch(() => {});
  }
});
