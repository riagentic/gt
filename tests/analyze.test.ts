import { assertEquals } from "@std/assert";
import { BY_ISO } from "../src/data/countries.ts";
import { analyze } from "../src/server/analyze.server.ts";

Deno.test("wasm: geotags via names, demonyms, capitals; clusters near-duplicates", async () => {
  const { tags, clusters } = await analyze([
    "Missiles hit Kyiv as Russian forces advance",
    "Russian forces advance as missiles hit Kyiv overnight",
    "South Sudan and Sudan sign border deal",
    "Papua New Guinea quake",
    "Iranian oil exports fall",
  ]);
  assertEquals(tags[0], [BY_ISO.UA, BY_ISO.RU]);
  assertEquals(tags[2], [BY_ISO.SS, BY_ISO.SD]);
  assertEquals(tags[3], [BY_ISO.PG]);
  assertEquals(tags[4], [BY_ISO.IR]);
  assertEquals(clusters, [0, 0, 2, 3, 4]);
});
