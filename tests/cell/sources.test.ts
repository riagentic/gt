// Data cells against stubbed sources: success fills state + status, failure keeps data + reports.
import { assertEquals } from "@std/assert";
import { bootCells } from "aio/testing";
import { air } from "../../src/cell/air.ts";
import { hazards } from "../../src/cell/hazards.ts";
import { layers } from "../../src/cell/layers.ts";
import { markets } from "../../src/cell/markets.ts";
import { news } from "../../src/cell/news.ts";
import { risk } from "../../src/cell/risk.ts";
import { sky } from "../../src/cell/sky.ts";
import { watch } from "../../src/cell/watch.ts";

const story = {
  id: "s1",
  title: "T",
  link: "https://x",
  summary: "",
  source: "S",
  region: "world",
  at: 1,
  first: 1,
  places: [],
  size: 1,
  also: [],
};
const quake = { id: "q", mag: 5, place: "p", at: 1, lon: 0, lat: 0, depth: 1, url: "", tsunami: false };
const plane = { hex: "ae", call: "RCH1", reg: "", type: "C17", lon: 0, lat: 0, alt: 1, spd: 1, hdg: 0, sq: "" };
const quote = { sym: "X", name: "X", group: "G", price: 1, chg: 0, spark: [] };
const bet = { id: "b", title: "B", url: "u", prob: 0.5, vol: 1, end: 0, outcome: "Yes", venue: "Polymarket" };
const tle = { id: "25544", name: "ISS", group: "stations", l1: "1", l2: "2" };
const adv = { place: 3, name: "X", level: 4, url: "u", at: 1 };
const outbreak = { id: "/d", title: "Ebola", url: "u", at: 1, places: [3] };
const jam = { url: "/b/j", date: "2026-10-21", high: 2, medium: 5 };
const CELLS = [news, hazards, air, markets, layers, sky, risk, watch];

Deno.test("data cells: refresh fills state and marks fresh", async () => {
  await using _ = await bootCells(CELLS, {
    stub: {
      "../server/sources.server.ts": {
        news: () => Promise.resolve({ stories: [story], failed: ["Dead feed"] }),
        hazards: () => Promise.resolve({ quakes: [quake], events: [] }),
        aircraft: () => Promise.resolve([plane]),
        markets: () => Promise.resolve({ quotes: [quote], fear: 42 }),
        bets: () => Promise.resolve([bet]),
        satellites: () => Promise.resolve([tle]),
        advisories: () => Promise.resolve([adv]),
        outbreaks: () => Promise.resolve([outbreak]),
      },
      "../server/blobs.server.ts": {
        storeCables: (prev: string) => Promise.resolve(prev ? "/b/2" : "/b/1"),
        storeJam: () => Promise.resolve(jam),
      },
      "../server/world.server.ts": { kalshi: () => Promise.resolve([]) },
    },
  });
  await Promise.all([
    news.refresh(),
    hazards.refresh(),
    air.refresh(),
    markets.refresh(),
    markets.refreshBets(),
    layers.refresh(false),
  ]);
  assertEquals([news.stories.length, news.failed, news.status.err, news.status.ok], [
    1,
    ["Dead feed"],
    "1 feeds failed",
    true,
  ]);
  assertEquals([hazards.quakes[0].id, air.planes[0].hex, markets.quotes[0].sym, markets.fear, markets.bets[0].id], [
    "q",
    "ae",
    "X",
    42,
    "b",
  ]);
  assertEquals([layers.cablesUrl, layers.status.busy], ["/b/1", false]);
  await layers.refresh(false); // fresh: skipped
  assertEquals(layers.cablesUrl, "/b/1");
  await layers.refresh(true);
  assertEquals(layers.cablesUrl, "/b/2");
});

Deno.test("data cells: failure keeps last data and reports the error", async () => {
  const boom = () => Promise.reject(new Error("offline"));
  await using _ = await bootCells(CELLS, {
    stub: {
      "../server/sources.server.ts": {
        news: boom,
        hazards: boom,
        aircraft: boom,
        markets: boom,
        bets: boom,
        satellites: boom,
        advisories: boom,
        outbreaks: boom,
      },
      "../server/blobs.server.ts": { storeCables: boom, storeJam: boom },
      "../server/world.server.ts": { kalshi: boom },
    },
  });
  await Promise.all([
    news.refresh(),
    hazards.refresh(),
    air.refresh(),
    markets.refresh(),
    markets.refreshBets(),
    layers.refresh(true),
  ]);
  for (const s of [news.status, hazards.status, air.status, markets.status, markets.betStatus, layers.status]) {
    assertEquals([s.ok, s.err, s.busy], [false, "offline", false]);
  }
});
