// Live-text translation: each text once, kept, pruned when unused; a refused batch leaves nothing half-done.
import { assertEquals } from "@std/assert";
import { bootCells } from "aio/testing";
import { stale, tr } from "../../src/cell/tr.ts";
import { fill, key } from "../../src/lib/i18n.ts";

const translator = (calls: string[][], refuse = "") => ({
  translate: async function* (texts: string[]) {
    calls.push(texts);
    if (refuse) return refuse;
    for (const [i, t] of texts.entries()) yield [i, t === "bad" ? null : `CZ ${t}`] as [number, string | null];
    return "";
  },
});

Deno.test("i18n: stable keys, fill-ins", () => {
  assertEquals(key("Hello"), key("Hello"));
  assertEquals(key("Hello") === key("Hello."), false);
  assertEquals(fill("{n} zpráv z {src}", { n: 3 }), "3 zpráv z {src}");
});

Deno.test("tr: translates each text once and keeps it; failed items are not stored", async () => {
  const calls: string[][] = [];
  await using _ = await bootCells([tr], { stub: { "../server/ai.server.ts": translator(calls) } });
  await tr.want(["A", "B", "A", "bad"]);
  await tr.want(["A", "B", "C"]);
  assertEquals(calls, [["A", "B", "bad"], ["C"]]);
  assertEquals([tr.cs[key("A")][0], tr.cs[key("C")][0], tr.cs[key("bad")], tr.pending], ["CZ A", "CZ C", undefined, 0]);
});

Deno.test("tr: aipro refusing the batch → status says why, pending back to 0", async () => {
  await using _ = await bootCells([tr], {
    stub: { "../server/ai.server.ts": translator([], "aipro is not running") },
  });
  await tr.want(["A"]);
  assertEquals([tr.status.ok, tr.status.err, tr.pending, tr.cs[key("A")]], [
    false,
    "aipro is not running",
    0,
    undefined,
  ]);
});

Deno.test("tr: entries unused for 30 days are dropped", () => {
  assertEquals(stale({ old: ["x", 100 - 31], fresh: ["y", 100 - 2] }, 100), ["old"]);
});
