import { cell, type MethodDraftMeta, notify } from "aio";
import { match, normalizeWord } from "../lib/watch.ts";

// Watchlist: keywords + desktop alerts. Matches themselves are derived in the UI from news.
// `seen*` remember what was already announced; null = never scanned (first scan only records).
export type State = { words: string[]; alerts: boolean; seenNews: string[] | null; seenHaz: string[] | null };
type S = State & MethodDraftMeta;
type Item = { id: string; title: string; head?: string };
const KEEP = 4000;

/** Record ids; return the ones not seen before (none on the very first scan). */
function fresh(seen: string[] | null, items: Item[]): { next: string[]; news: Item[] } {
  const known = new Set(seen ?? []);
  const unseen = items.filter((x) => !known.has(x.id));
  const next = [...(seen ?? []), ...unseen.map((x) => x.id)].slice(-KEEP);
  return { next, news: seen === null ? [] : unseen };
}

export const watch = cell("watch", {
  version: 2,
  onMigrate: (s) => {
    const old = s as Partial<State>;
    return {
      words: old.words ?? [],
      alerts: old.alerts ?? true,
      seenNews: old.seenNews ?? null,
      seenHaz: old.seenHaz ?? null,
    };
  },
  state: { words: [], alerts: true, seenNews: null, seenHaz: null } as State,
  visible: { exclude: ["seenNews", "seenHaz"] },
  args: {
    add: [(v) => (typeof v === "string" && normalizeWord(v).length >= 2 && v.length <= 60) || "2–60 characters"],
  },
  methods: {
    add(s, word: string) {
      const w = normalizeWord(word);
      if (!s.words.includes(w)) s.words.push(w);
    },
    remove(s, word: string) {
      s.words = s.words.filter((w) => w !== word);
    },
    setAlerts(s, on: boolean) {
      s.alerts = on;
    },
    /** New stories matching a keyword → one notification per keyword. */
    scan(s: S, stories: Item[]) {
      const { next, news } = fresh(s.seenNews, stories);
      s.seenNews = next;
      if (!s.alerts) return;
      const byWord = new Map<string, Item[]>();
      for (const x of news) {
        const w = match(x.title, s.words);
        if (w) byWord.set(w, [...(byWord.get(w) ?? []), x]);
      }
      for (const [w, xs] of byWord) {
        const n = xs.length;
        s.$do(
          notify({ title: `“${w}” · ${n} new ${n === 1 ? "story" : "stories"}`, body: xs[0].title, tag: `watch-${w}` }),
        );
      }
    },
    /** Major events (red alerts, M6.5+, sirens, squawk 7500/7700) → one notification each, when alerts are on. */
    scanHazards(s: S, items: Item[]) {
      const { next, news } = fresh(s.seenHaz, items);
      s.seenHaz = next;
      if (!s.alerts) return;
      for (const x of news.slice(0, 3)) {
        s.$do(notify({ title: x.head ?? "Major event", body: x.title, tag: `hazard-${x.id}` }));
      }
    },
  },
});
