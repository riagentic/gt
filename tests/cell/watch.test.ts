import { assertEquals } from "@std/assert";
import { testCell } from "aio/testing";
import { watch } from "../../src/cell/watch.ts";

const st = (id: string, title: string) => ({ id, title });

testCell(watch, "keywords: normalized, deduped, removable, validated", async (t) => {
  t.send.add("  Taiwan ");
  t.send.add("taiwan");
  t.send.add("Drone Strike");
  t.expect.state((s) => s.words.join() === "taiwan,drone strike");
  t.send.remove("taiwan");
  t.expect.state((s) => s.words.join() === "drone strike");
  await t.expect.rejects(() => t.send.add("x"), /2–60/);
});

testCell(watch, "first scan only records; later matches notify once per keyword", (t) => {
  t.send.add("iran");
  t.send.scan([st("a", "Iran talks")]);
  assertEquals(t.getEffects().length, 0);
  t.send.scan([st("a", "Iran talks"), st("b", "Iran strikes"), st("c", "Iran oil"), st("d", "Weather")]);
  t.expect.effects(["__notify"]); // exactly one, for "iran" (3 matches grouped)
  t.send.scan([st("b", "Iran strikes")]); // already seen
  assertEquals(t.getEffects().length, 0);
});

testCell(watch, "alerts off: nothing notifies but ids are still recorded", (t) => {
  t.send.add("iran");
  t.send.setAlerts(false);
  t.send.scan([]);
  t.send.scanHazards([]);
  t.send.scan([st("a", "Iran talks")]);
  t.send.scanHazards([st("h1", "Red alert cyclone")]);
  assertEquals(t.getEffects().filter((e) => e.type === "__notify").length, 0);
  t.expect.state((s) => s.seenNews?.includes("a") === true && s.seenHaz?.includes("h1") === true);
});

testCell(watch, "hazard alerts after the first scan, max 3 per batch", (t) => {
  t.send.scanHazards([st("old", "Old alert")]);
  t.send.scanHazards(["1", "2", "3", "4"].map((i) => st(i, `Alert ${i}`)));
  t.expect.effects(["__notify", "__notify", "__notify"]);
});
