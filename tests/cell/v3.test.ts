// v0.3 cells against stubbed sources: alerts, atlas, macro, AI.
import { assertEquals } from "@std/assert";
import { bootCells } from "aio/testing";
import { ai, lastOf } from "../../src/cell/ai.ts";
import { alerts } from "../../src/cell/alerts.ts";
import { atlas } from "../../src/cell/atlas.ts";
import { markets } from "../../src/cell/markets.ts";
import { watch } from "../../src/cell/watch.ts";

const weather = {
  id: "w1",
  title: "Tornado Warning",
  area: "X",
  severity: 1,
  at: 1,
  until: 2,
  source: "NWS",
  country: 4,
  url: "u",
};
const siren = { id: "7671-0", at: Date.now(), threat: 0, cities: [{ en: "Sderot", lat: 31.5, lon: 34.6 }] };
const sq = { hex: "a1", call: "UAL1", reg: "", type: "B738", lon: 0, lat: 0, alt: 1, spd: 1, hdg: 0, sq: "7700" };
const airport = { code: "SFO", kind: "Ground delay", reason: "low ceilings", detail: "avg 1h" };
const protest = { id: "1,2", name: "Paris, France", lon: 2.3, lat: 48.8, n: 6, tone: -4, at: 1, url: "u" };
const traffic = {
  id: "c1",
  name: "Suez Canal",
  lon: 32.5,
  lat: 30,
  date: "2026-10-18",
  ships: 43,
  tankers: 15,
  avg: 50,
};
const ok = (v: unknown) => () => Promise.resolve(v);
const boom = () => Promise.reject(new Error("offline"));

Deno.test("alerts + atlas + macro: refresh fills state; sirens and 7700 notify after the first scan", async () => {
  await using _ = await bootCells([alerts, atlas, markets, watch], {
    stub: {
      "../server/world.server.ts": {
        weather: (prev: string) => Promise.resolve({ alerts: [weather], url: prev ? "/b/w2" : "/b/w1" }),
        sirens: ok([siren]),
        aviation: ok({ squawks: [sq], airports: [airport] }),
        protests: ok([protest]),
        profiles: ok({ IL: { pop: 10_000_000, refugees: 1 } }),
        traffic: ok([traffic]),
        radiation: ok([{ id: "r", name: "Namie", lon: 140, lat: 37, cpm: 90, at: 1 }]),
        climate: boom,
        co2: ok({ ppm: 426.85, date: "2026-10-21", yearAgo: 424.1, delta: 2.75 }),
        services: ok([{ name: "GitHub", level: "ok", text: "All good", url: "u" }]),
        macro: ok({ mood: { score: 20, rating: "extreme fear", week: 30, month: 40 }, rates: [], cot: [], policy: [] }),
      },
    },
  });
  await Promise.all([
    alerts.refreshWeather(),
    alerts.refreshSirens(),
    alerts.refreshAviation(),
    alerts.refreshProtests(),
    atlas.refreshProfiles(false),
    atlas.refreshTraffic(),
    atlas.refreshPlanet(),
    atlas.refreshServices(),
    markets.refreshMacro(),
  ]);
  assertEquals(
    [alerts.weather[0].id, alerts.weatherUrl, alerts.sirens[0].id, alerts.squawks[0].sq, alerts.airports[0].code],
    ["w1", "/b/w1", "7671-0", "7700", "SFO"],
  );
  assertEquals([alerts.protests.length, atlas.traffic[0].ships, atlas.profiles.IL.pop, markets.mood?.score], [
    1,
    43,
    10_000_000,
    20,
  ]);
  // One of two planet sources failed: data kept, status ok with a warning.
  assertEquals([atlas.radiation.length, atlas.co2?.ppm, atlas.planetStatus.ok, atlas.planetStatus.err], [
    1,
    426.85,
    true,
    "offline",
  ]);
  await alerts.refreshWeather();
  assertEquals(alerts.weatherUrl, "/b/w2"); // previous blob URL handed back for cleanup
  await atlas.refreshProfiles(false); // fresh: skipped
  assertEquals(atlas.profileStatus.ok, true);
});

Deno.test("alerts: failure keeps last data and reports", async () => {
  await using _ = await bootCells([alerts, watch], {
    stub: { "../server/world.server.ts": { weather: boom, sirens: boom, aviation: boom, protests: boom } },
  });
  await Promise.all([
    alerts.refreshWeather(),
    alerts.refreshSirens(),
    alerts.refreshAviation(),
    alerts.refreshProtests(),
  ]);
  for (const s of [alerts.weatherStatus, alerts.sirenStatus, alerts.aviationStatus, alerts.protestStatus]) {
    assertEquals([s.ok, s.err, s.busy], [false, "offline", false]);
  }
});

const SERVED = { model: "ollama/qwen3:1.7b", name: "qwen3:1.7b", note: "" };
/** A fake aipro `brief`: streams the given chunks, then answers `r`. */
const briefOf = (chunks: unknown[], r: unknown) =>
  async function* (_id: string, msgs: { content: string }[]) {
    yield* chunks;
    return typeof r === "function" ? r(msgs) : r;
  };

Deno.test("ai: aipro up → ready; brief streams, then stores a note per subject (thinking stripped)", async () => {
  await using _ = await bootCells([ai], {
    stub: {
      "../server/ai.server.ts": {
        capabilities: ok([{ task: "text", qualities: ["normal"], now: true, paidOnly: false }]),
        brief: briefOf(
          [{ type: "progress", phase: "load", pct: 0.5 }, { type: "delta", text: "<think>hm</think>- " }],
          (m: { content: string }[]) => ({
            v: 1,
            ok: true,
            id: "x",
            ms: 1,
            served: SERVED,
            output: {
              kind: "value",
              value: `<think>hm</think>- ${m[1].content.includes("Headlines:\n- A\n- B") ? "ok" : "bad"}`,
            },
          }),
        ),
      },
    },
  });
  await ai.check();
  assertEquals([ai.ready, ai.link.ok], [true, true]);
  await ai.summarize("the world", "world", ["A", "B"]);
  assertEquals([ai.notes.world.text, ai.notes.world.model, ai.live], ["- ok", "qwen3:1.7b", null]);
});

Deno.test("ai: aipro off → not ready, clear status; a refusal surfaces its reason", async () => {
  await using _ = await bootCells([ai], {
    stub: {
      "../server/ai.server.ts": {
        capabilities: ok(null),
        brief: briefOf([], { v: 1, ok: false, kind: "unsupported", reason: "aipro is not running" }),
      },
    },
  });
  await ai.check();
  assertEquals([ai.ready, ai.link.ok, ai.link.err], [false, false, "aipro is not running"]);
  await ai.summarize("X", "XX", ["h"]);
  assertEquals([ai.status.err, ai.notes.XX, ai.live], ["aipro is not running", undefined, null]);
});

Deno.test("ai: aipro answers map to the Settings status; a dropped link turns AI off", async () => {
  assertEquals(lastOf({ v: 1, ok: false, kind: "unsupported", reason: "no model" }, 5).kind, "refused");
  assertEquals(lastOf({ v: 1, ok: false, kind: "busy", reason: "GPU full", retryAfterMs: 9 }, 5).kind, "busy");
  await using _ = await bootCells([ai], {
    stub: {
      "../server/ai.server.ts": {
        capabilities: ok([{ task: "text", qualities: ["normal"], now: true, paidOnly: false }]),
        brief: async function* () {
          yield { type: "delta", text: "- a" };
          throw new Error("closed");
        },
      },
    },
  });
  await ai.check();
  await ai.summarize("X", "XX", ["h"]);
  assertEquals([ai.ready, ai.last?.kind, ai.status.err], [false, "failed", "aipro connection lost: closed"]);
});
