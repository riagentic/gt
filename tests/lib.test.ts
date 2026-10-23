import { assert, assertEquals } from "@std/assert";
import { BY_ISO, COUNTRIES } from "../src/data/countries.ts";
import { ago, host, pct } from "../src/lib/fmt.ts";
import { newsPoints, quakePoints } from "../src/lib/features.ts";
import { locator, mainBounds } from "../src/lib/geo.ts";
import * as norm from "../src/lib/normalize.ts";
import { decode, parseFeed } from "../src/lib/rss.ts";
import { activity, band } from "../src/lib/score.ts";
import { dedupe, type Raw, toStories } from "../src/lib/stories.ts";
import { nightPolygon, subsolar } from "../src/lib/sun.ts";

const NOW = Date.parse("2026-10-22T12:00:00Z");

Deno.test("rss: RSS 2.0 items with CDATA + entities", () => {
  const xml = `<rss><channel><item><title><![CDATA[Strikes &amp; talks]]></title><link>https://x.com/a</link>
    <pubDate>Thu, 22 Oct 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Body&lt;/p&gt;</description></item>
    <item><title>No link</title></item></channel></rss>`;
  assertEquals(parseFeed(xml, NOW), [{
    title: "Strikes & talks",
    link: "https://x.com/a",
    at: Date.parse("2026-10-22T10:00:00Z"),
    summary: "Body",
  }]);
});

Deno.test("rss: Atom entries, alternate link, future dates clamped", () => {
  const xml =
    `<feed><entry><title>A</title><link rel="alternate" href="https://y.org/1"/><updated>2030-01-01T00:00:00Z</updated></entry></feed>`;
  assertEquals(parseFeed(xml, NOW)[0], { title: "A", link: "https://y.org/1", at: NOW, summary: "" });
  assertEquals(decode("&#x41;&#66;&nbsp;&bogus;"), "AB &bogus;");
});

const raw = (title: string, source: string, at: number, link = `https://n/${source}/${at}`): Raw => ({
  title,
  link,
  at,
  summary: "",
  source,
  region: "world",
});

Deno.test("stories: dedupe by link and normalized title, newest first", () => {
  const out = dedupe([
    raw("Hello, world", "A", 1, "https://n/1"),
    raw("hello world", "B", 2),
    raw("Other", "C", 3, "https://n/1"),
  ]);
  assertEquals(out.map((r) => r.source), ["C", "B"]);
});

Deno.test("stories: clusters group, lead = earliest, size = distinct sources", () => {
  const items = [
    raw("Quake hits Japan", "A", 10),
    raw("Japan quake", "B", 30),
    raw("Oil rises", "C", 20),
    raw("Japan quake again", "A", 40),
  ];
  const s = toStories(items, [[1], [1, 2], [], []], [0, 0, 2, 0], 10);
  assertEquals(s.length, 2);
  assertEquals([s[0].title, s[0].at, s[0].first, s[0].size, s[0].places], ["Quake hits Japan", 40, 10, 2, [1, 2]]);
  assertEquals(s[0].also.map((m) => m.source), ["B"]);
  assertEquals(toStories(items, [[], [], [], []], [0, 1, 2, 3], 1, 0).length, 1);
  // Past the limit, each source still keeps its newest `perSource`: slow feeds are not crowded out.
  const kept = toStories(items, [[], [], [], []], [0, 1, 2, 3], 1, 1);
  assertEquals(kept.map((x) => [x.source, x.at]), [["A", 40], ["B", 30], ["C", 20]]);
});

Deno.test("normalize: USGS quakes drop bad coordinates", () => {
  const q = norm.quakes({
    features: [
      {
        id: "a",
        properties: { mag: 5.1, place: "P", time: 1, url: "u", tsunami: 1 },
        geometry: { coordinates: [10, 20, 30] },
      },
      { id: "b", properties: {}, geometry: { coordinates: [500, 0] } },
      null,
    ],
  });
  assertEquals(q, [{ id: "a", mag: 5.1, place: "P", at: 1, lon: 10, lat: 20, depth: 30, url: "u", tsunami: true }]);
});

Deno.test("normalize: EONET latest point, GDACS levels", () => {
  const e = norm.eonet({
    events: [{
      id: "E1",
      title: "Fire",
      categories: [{ id: "wildfires" }],
      sources: [{ url: "s" }],
      geometry: [{ type: "Point", date: "2026-10-01T00:00:00Z", coordinates: [1, 2] }, {
        type: "Point",
        date: "2026-10-02T00:00:00Z",
        coordinates: [3, 4],
      }],
    }],
  });
  assertEquals([e[0].kind, e[0].lon, e[0].lat, e[0].url], ["wildfire", 3, 4, "s"]);
  const g = norm.gdacs({
    features: [{
      properties: { eventtype: "TC", eventid: 7, alertlevel: "Red", name: "TC X", fromdate: "2026-10-01T00:00:00" },
      geometry: { coordinates: [5, 6] },
    }],
  });
  assertEquals([g[0].id, g[0].kind, g[0].level, g[0].at], [
    "gdacs-TC-7",
    "storm",
    2,
    Date.parse("2026-10-01T00:00:00Z"),
  ]);
});

Deno.test("normalize: Yahoo change vs previous close; junk → null", () => {
  const q = norm.yahoo(
    {
      chart: {
        result: [{ meta: { regularMarketPrice: 110 }, indicators: { quote: [{ close: [90, 100, null, 110] }] } }],
      },
    },
    "X",
    "X",
    "G",
  );
  assertEquals([q?.price, q?.chg, q?.spark], [110, 10, [90, 100, 110]]);
  assertEquals(norm.yahoo({}, "X", "X", "G"), null);
});

Deno.test("normalize: Polymarket picks likeliest open outcome", () => {
  const b = norm.bets([
    {
      id: "1",
      title: "Who wins?",
      slug: "w",
      volume: "100",
      endDate: "2027-01-01T00:00:00Z",
      markets: [
        { outcomePrices: '["0.2","0.8"]', groupItemTitle: "A" },
        { outcomePrices: '["0.7","0.3"]', groupItemTitle: "B" },
        { outcomePrices: '["0.9","0.1"]', groupItemTitle: "C", closed: true },
      ],
    },
    { id: "2", title: "Yes/no?", slug: "y", markets: [{ outcomePrices: '["0.4","0.6"]', outcomes: '["Yes","No"]' }] },
    { id: "3", title: "empty", markets: [] },
  ]);
  assertEquals(b.map((x) => [x.id, x.outcome, x.prob, x.vol]), [["1", "B", 0.7, 100], ["2", "Yes", 0.4, 0]]);
});

Deno.test("geo: locator finds Ukraine, ocean is -1", async () => {
  const fc = JSON.parse(await Deno.readTextFile(new URL("../assets/countries.geojson", import.meta.url)));
  const where = locator(fc);
  assertEquals(where(30.5, 50.45), BY_ISO.UA);
  assertEquals(where(-30, 0), -1);
});

Deno.test("score: news + hazards, bands, 24h window", () => {
  const story = {
    id: "s",
    title: "",
    link: "",
    summary: "",
    source: "",
    region: "world" as const,
    at: NOW,
    first: NOW,
    places: [7],
    size: 4,
    also: [],
  };
  const old = { ...story, at: NOW - 2 * 86_400_000 };
  const ev = {
    id: "e",
    kind: "storm" as const,
    title: "",
    at: NOW,
    lon: 0,
    lat: 0,
    level: 2 as const,
    source: "",
    url: "",
  };
  const a = activity([story, old], [], [ev], () => 7, NOW).get(7)!;
  assertEquals([a.stories, a.hazards], [1, 1]);
  assertEquals(a.score, Math.round(12 * Math.log2(1 + 3)) + 14);
  assertEquals([band(0).label, band(45).label, band(95).label], ["Calm", "Elevated", "Critical"]);
});

Deno.test("sun: subsolar near equinox, night polygon closes", () => {
  const [lon, lat] = subsolar(Date.parse("2026-03-20T12:00:00Z"));
  assert(Math.abs(lat) < 1 && Math.abs(lon) < 5, `${lon},${lat}`);
  const ring = nightPolygon(NOW).geometry.coordinates[0];
  assertEquals(ring[0], ring.at(-1));
});

Deno.test("features + fmt", () => {
  const ua = BY_ISO.UA;
  const s = {
    id: "s",
    title: "",
    link: "",
    summary: "",
    source: "",
    region: "world" as const,
    at: NOW,
    first: NOW,
    places: [ua],
    size: 1,
    also: [],
  };
  const pts = newsPoints([s, s], NOW).features;
  assertEquals([pts.length, pts[0].properties?.n, (pts[0].geometry as { coordinates: number[] }).coordinates[0]], [
    1,
    2,
    COUNTRIES[ua].lon,
  ]);
  const q = { id: "q", mag: 3, place: "p", at: NOW, lon: 0, lat: 0, depth: 1, url: "", tsunami: false };
  assertEquals(quakePoints([q], 4.5, NOW).features.length, 0);
  assertEquals([
    ago(NOW - 30_000, NOW),
    ago(NOW - 7_200_000, NOW),
    pct(1.234),
    pct(-2),
    host("https://www.bbc.co.uk/x"),
  ], ["now", "2h", "+1.23%", "-2.00%", "bbc.co.uk"]);
});

Deno.test("geo: mainBounds uses the main landmass (no world-wide boxes for RU/US/FJ)", async () => {
  const fc = JSON.parse(await Deno.readTextFile(new URL("../assets/countries.geojson", import.meta.url)));
  const box = (iso: string) =>
    mainBounds(fc.features.find((f: { properties: { iso: string } }) => f.properties.iso === iso));
  for (const iso of ["RU", "US", "FJ", "NZ", "FR"]) {
    const [w, , e] = box(iso);
    assert(e - w < 180, `${iso} spans ${e - w}°`);
  }
  const [w, s, e, n] = box("US");
  assert(w > -126 && e < -66 && s > 24 && n < 50, `contiguous US: ${[w, s, e, n]}`); // Alaska excluded
});
