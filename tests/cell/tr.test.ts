// Live-text translation: each text once, kept, pruned when unused; what the user reads jumps the queue.
import { assertEquals } from "@std/assert";
import { bootCells } from "aio/testing";
import { enqueue, stale, tr } from "../../src/cell/tr.ts";
import { fill, keepsFills, key, tkey } from "../../src/lib/i18n.ts";

/** A fake aipro translator: records what it ran; "bad" fails; `refuse` = aipro said no. */
const translator = (ran: string[], refuse = "") => ({
  translator: () =>
    Promise.resolve(
      refuse || {
        run: (t: string) => (ran.push(t), Promise.resolve(t === "bad" ? null : `CZ ${t}`)),
        close: () => Promise.resolve(),
      },
    ),
});

Deno.test("i18n: stable keys, fill-ins", () => {
  assertEquals(key("Hello"), key("Hello"));
  assertEquals(key("Hello") === key("Hello."), false);
  assertEquals(fill("{n} zpráv z {src}", { n: 3 }), "3 zpráv z {src}");
  assertEquals(tkey("cs", "Hi"), key("Hi")); // Czech translations saved before v2 stay found
  assertEquals(tkey("de", "Hi") === tkey("fr", "Hi"), false);
  assertEquals([keepsFills("{n} stories", "{n} Artikel"), keepsFills("{n} stories", "Artikel")], [true, false]);
});

Deno.test("tr: enqueue — back keeps order and skips queued; front moves to the top in order", () => {
  assertEquals(enqueue(["a", "b"], ["b", "c"], false), ["a", "b", "c"]);
  assertEquals(enqueue(["a", "b", "c"], ["c", "x"], true), ["c", "x", "a", "b"]);
});

Deno.test("tr: translates each text once and keeps it; the page read now goes first; failures are not stored", async () => {
  const ran: string[] = [];
  await using _ = await bootCells([tr], { stub: { "../server/ai.server.ts": translator(ran) } });
  await tr.want("cs", ["A", "B", "A", "bad"]);
  await tr.want("cs", ["P1", "P2"], true);
  assertEquals(tr.pending, 5);
  await tr.drain();
  await tr.want("cs", ["A", "B", "C"]);
  await tr.drain();
  await tr.want("de", ["A"]);
  await tr.drain();
  assertEquals(ran, ["P1", "P2", "A", "B", "bad", "C", "A"]);
  assertEquals([tr.done[tkey("cs", "A")][0], tr.done[tkey("de", "A")][0], tr.done[tkey("cs", "bad")], tr.pending], [
    "CZ A",
    "CZ A",
    undefined,
    0,
  ]);
});

Deno.test("tr: aipro refusing → status says why, the queue waits for the next drain", async () => {
  await using _ = await bootCells([tr], {
    stub: { "../server/ai.server.ts": translator([], "aipro is not running") },
  });
  await tr.want("cs", ["A"]);
  await tr.drain();
  assertEquals([tr.status.ok, tr.status.err, tr.pending, tr.done[tkey("cs", "A")]], [
    false,
    "aipro is not running",
    1,
    undefined,
  ]);
});

Deno.test("tr: only the active language is translated — a switch drops the old language's queue", async () => {
  const ran: string[] = [];
  await using _ = await bootCells([tr], { stub: { "../server/ai.server.ts": translator(ran) } });
  await tr.want("cs", ["A", "B"]);
  await tr.want("de", ["C"]);
  assertEquals(tr.pending, 1);
  await tr.want("cs", ["D"]);
  await tr.keep("en");
  assertEquals(tr.pending, 0);
  await tr.drain();
  assertEquals(ran, []);
});

Deno.test("tr: entries unused for 30 days are dropped", () => {
  assertEquals(stale({ old: ["x", 100 - 31], fresh: ["y", 100 - 2] }, 100), ["old"]);
});
