// Every fixed UI text has Czech: L("…") literals in the UI, and the data labels the UI passes through L().
import { assertEquals } from "@std/assert";
import { LAYERS, PRESETS } from "../src/cell/prefs.ts";
import { GROUPS } from "../src/data/channels.ts";
import { REGIONS } from "../src/data/feeds.ts";
import { CS } from "../src/i18n/cs.ts";
import { SQUAWKS, THREATS } from "../src/lib/alerts.ts";
import { band } from "../src/lib/score.ts";

const missing = (keys: Iterable<string>) => [...new Set(keys)].filter((k) => k && !(k in CS));

Deno.test('i18n: every L("…") in the UI has Czech', () => {
  const dir = new URL("../src/ui/", import.meta.url);
  const files = [...Deno.readDirSync(dir)].map((f) => new URL(f.name, dir)).concat(
    new URL("../src/App.tsx", import.meta.url),
  );
  const keys = files.flatMap((f) =>
    [...Deno.readTextFileSync(f).matchAll(/\bL\(\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`) as string)
  );
  assertEquals(missing(keys), []);
});

Deno.test("i18n: data labels shown through L() have Czech", () => {
  assertEquals(
    missing([
      ...[95, 75, 55, 30, 0].map((s) => band(s).label),
      ...LAYERS.flatMap((l) => [l.label, l.hint, l.group]),
      ...Object.values(PRESETS).map((p) => p.label),
      ...REGIONS.map((r) => r.label),
      ...GROUPS,
      ...Object.values(THREATS),
      ...Object.values(SQUAWKS),
    ]),
    [],
  );
});
