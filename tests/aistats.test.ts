// gt's use of aipro, summed up per task from aipro's request records.
import { assertEquals } from "@std/assert";
import { took, usage } from "../src/lib/aistats.ts";
import type { Req } from "../src/peers/aipro.ts";

const req = (over: Partial<Req>): Req => ({
  id: crypto.randomUUID(),
  app: "gt",
  task: "text.translate",
  model: "llama/m",
  status: "done",
  pct: 1,
  phase: "generate",
  note: "",
  rate: 0,
  avg: 40,
  unit: "tok/s",
  at: 1000,
  end: 2000,
  ...over,
});

Deno.test("aistats: per task — counts, bad endings, mean speed, median run time, latest", () => {
  const reqs = [
    req({ at: 1000, end: 2000, avg: 40 }),
    req({ at: 3000, ran: 3500, end: 4500, avg: 50 }),
    req({ at: 5000, end: 9000, avg: 60 }),
    req({ at: 6000, end: 0, avg: 0, status: "failed" }),
    req({ at: 7000, task: "text.chat", avg: 20 }),
  ];
  const u = usage(reqs, "text.translate");
  assertEquals([u.n, u.ok, u.failed, u.speed, u.unit, u.ms, u.last?.at], [4, 3, 1, 50, "tok/s", 1000, 6000]);
  assertEquals(took(reqs[1]), 1000);
  assertEquals(usage(reqs, "text.classify"), { n: 0, ok: 0, failed: 0, speed: 0, unit: "", ms: 0, last: null });
});
