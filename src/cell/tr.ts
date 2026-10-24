import { cell, serverImport } from "aio";
import { BY_CODE } from "../data/languages.ts";
import { day, item, keepsFills, tkey, unitem } from "../lib/i18n.ts";
import { idle, type Status, tracked } from "../lib/status.ts";

// Text translated by aipro into the UI language — live text (news, alerts, briefs, the open page …) for every
// language, fixed UI text for languages without a hand-made dictionary. Each text ONCE per language, then kept.
// `done`: tkey(lang, text) → [translation, day last asked for]; entries no one asked for in KEEP_DAYS are dropped.
// One queue, one worker (`drain`, one aipro lease): what the user is reading goes to the FRONT, so an opened article
// never waits behind a backlog of headlines.
export type State = { done: Record<string, [string, number]>; queue: string[]; pending: number; status: Status };
const io = () => serverImport<typeof import("../server/ai.server.ts")>("../server/ai.server.ts", import.meta.url);

export const KEEP_DAYS = 30;
export const BATCH = 50;
/** Older queued texts beyond this are dropped (asked again when shown again). */
export const MAX_QUEUE = 2000;

/** Keys of entries no one asked for in KEEP_DAYS. */
export const stale = (done: State["done"], today: number): string[] =>
  Object.keys(done).filter((k) => today - done[k][1] > KEEP_DAYS);

/** `todo` into the queue: at the back, or at the front in the given order (moved up if already queued). */
export const enqueue = (queue: string[], todo: string[], front: boolean): string[] => {
  const add = [...new Set(todo)];
  const out = front
    ? [...add, ...queue.filter((t) => !add.includes(t))]
    : [...queue, ...add.filter((t) => !queue.includes(t))];
  return out.slice(0, MAX_QUEUE);
};

/** The queue without texts for languages other than `lang`. */
export const only = (queue: string[], lang: string): string[] => queue.filter((q) => unitem(q)[0] === lang);

export const tr = cell("tr", {
  version: 2,
  // v2: Czech-only `cs` → `done` for every language (Czech keys unchanged, see tkey).
  onMigrate: (s) => ({ done: (s as { cs?: State["done"] }).cs ?? {}, queue: [], pending: 0, status: idle() }),
  state: { done: {}, queue: [], pending: 0, status: idle() } as State,
  persist: { exclude: ["status.busy", "queue", "pending"] },
  visible: { exclude: ["queue"] },
  concurrency: { drain: "first" },
  long: ["drain"],
  args: {
    want: [
      (v) => (typeof v === "string" && v !== "en" && !!BY_CODE[v]) || "a language code other than en",
      (v) =>
        (Array.isArray(v) && v.length > 0 && v.length <= BATCH &&
          v.every((x) => typeof x === "string" && x.length > 0 && x.length <= 4000)) ||
        `1–${BATCH} texts of 1–4000 characters`,
      (v) => v === undefined || typeof v === "boolean" || "front: true or false",
    ],
    keep: [(v) => (typeof v === "string" && !!BY_CODE[v]) || "a language code"],
  },
  methods: {
    /** Queue the texts not yet translated into `lang` (`front`: the user is reading them now); mark all as in use. */
    want(s, lang: string, texts: string[], front = false) {
      const today = day(Date.now());
      for (const k of stale(s.done, today)) delete s.done[k];
      const todo = texts.filter((t) => {
        const hit = s.done[tkey(lang, t)];
        if (hit) hit[1] = today;
        return !hit;
      });
      s.queue = enqueue(only(s.queue, lang), todo.map((t) => item(lang, t)), front);
      s.pending = s.queue.length;
    },
    /** The UI language changed: drop what was queued for any other language (English: everything). */
    keep(s, lang: string) {
      s.queue = only(s.queue, lang);
      s.pending = s.queue.length;
    },
    /** Translate the queue, front first, one aipro lease per run of one language. Joins a run already going. */
    async drain(s) {
      if (!s.queue.length) return;
      await tracked(s, "status", async () => {
        // aio-ok: the queue is re-read after every await on purpose — `want` may have put new texts in front
        while (s.queue.length) {
          const lang = unitem(s.queue[0])[0];
          const t = await (await io()).translator(BY_CODE[lang]?.name ?? lang);
          if (typeof t === "string") throw new Error(t);
          try {
            while (s.queue.length && unitem(s.queue[0])[0] === lang) {
              const q = s.queue[0], text = unitem(q)[1];
              const out = await t.run(text);
              s.queue = s.queue.filter((x) => x !== q);
              s.pending = s.queue.length;
              if (out) s.done[tkey(lang, text)] = [keepsFills(text, out) ? out : text, day(Date.now())];
            }
          } finally {
            await t.close();
          }
        }
      });
    },
  },
});
