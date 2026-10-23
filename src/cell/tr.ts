import { cell, serverImport } from "aio";
import { day, key } from "../lib/i18n.ts";
import { idle, type Status, tracked } from "../lib/status.ts";

// Live text (news, alerts, briefs …) translated into Czech by aipro — each text ONCE, then kept. `cs`: key(text) →
// [translation, day last asked for]; entries no one asked for in KEEP_DAYS are dropped.
export type State = { cs: Record<string, [string, number]>; pending: number; status: Status };
const io = () => serverImport<typeof import("../server/ai.server.ts")>("../server/ai.server.ts", import.meta.url);

export const KEEP_DAYS = 30;
export const BATCH = 50;

/** Keys of entries no one asked for in KEEP_DAYS. */
export const stale = (cs: State["cs"], today: number): string[] =>
  Object.keys(cs).filter((k) => today - cs[k][1] > KEEP_DAYS);

export const tr = cell("tr", {
  state: { cs: {}, pending: 0, status: idle() } as State,
  persist: { exclude: ["status.busy", "pending"] },
  concurrency: { want: "queue" },
  long: ["want"],
  args: {
    want: [
      (v) =>
        (Array.isArray(v) && v.length > 0 && v.length <= BATCH &&
          v.every((x) => typeof x === "string" && x.length > 0 && x.length <= 4000)) ||
        `1–${BATCH} texts of 1–4000 characters`,
    ],
  },
  methods: {
    /** Translate the texts not translated yet; mark all as in use. */
    async want(s, texts: string[]) {
      const today = day(Date.now());
      for (const k of stale(s.cs, today)) delete s.cs[k];
      const todo = [...new Set(texts)].filter((t) => {
        const hit = s.cs[key(t)];
        if (hit) hit[1] = today;
        return !hit;
      });
      if (!todo.length) return;
      s.pending += todo.length;
      let left = todo.length;
      await tracked(s, "status", async () => {
        try {
          const it = (await io()).translate(todo, "Czech");
          for (let n = await it.next();; n = await it.next()) {
            if (n.done) {
              if (n.value) throw new Error(n.value);
              return;
            }
            const [i, out] = n.value;
            left--;
            s.pending--;
            if (out) s.cs[key(todo[i])] = [out, today];
          }
        } finally {
          s.pending -= left;
        }
      });
    },
  },
});
