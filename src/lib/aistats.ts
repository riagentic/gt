// gt's use of aipro, summed up from aipro's own request records (server/ai.server.ts `overview`).
import type { Req, TaskId } from "../peers/aipro.ts";

/** One task's requests: how many, how they ended, typical speed and time, and the latest. */
export type Use = {
  n: number;
  ok: number;
  failed: number;
  /** Mean speed of the finished ones, in `unit` (tok/s …); 0 = unknown. */
  speed: number;
  unit: string;
  /** Median time a finished one ran (ms); 0 = none finished. */
  ms: number;
  /** The latest request, or null. */
  last: Req | null;
};

const ENDED_BADLY = new Set(["failed", "refused", "cancelled"]);

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = xs.toSorted((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** How long a finished request ran (ms): from its start, or from when it was asked. */
export const took = (r: Req): number => r.end > 0 ? r.end - (r.ran ?? r.at) : 0;

/** `task`'s share of `reqs`. */
export const usage = (reqs: Req[], task: TaskId): Use => {
  const mine = reqs.filter((r) => r.task === task);
  const done = mine.filter((r) => r.status === "done");
  const fast = done.filter((r) => r.avg > 0);
  return {
    n: mine.length,
    ok: done.length,
    failed: mine.filter((r) => ENDED_BADLY.has(r.status)).length,
    speed: fast.length ? fast.reduce((a, r) => a + r.avg, 0) / fast.length : 0,
    unit: fast[0]?.unit ?? "",
    ms: median(done.map(took).filter((ms) => ms > 0)),
    last: mine.reduce<Req | null>((a, r) => (!a || r.at > a.at ? r : a), null),
  };
};
