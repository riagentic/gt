import { assertEquals } from "@std/assert";
import * as S from "../src/lib/signals.ts";

const H = 3_600_000;

Deno.test("signals: yahoo bars drop gaps", () => {
  const j = { chart: { result: [{ timestamp: [1, 2, 3], indicators: { quote: [{ close: [10, null, 12] }] } }] } };
  assertEquals(S.yahooBars(j), { t: [1000, 3000], v: [10, 12] });
  assertEquals(S.yahooBars(null), { t: [], v: [] });
});

Deno.test("signals: 4h leg z-score, stale → null", () => {
  // Hourly bars alternating ±1% (4h change ≈ 0), then a 5% jump on the last bar.
  const t = Array.from({ length: 200 }, (_, i) => i * H);
  const v = t.map((_, i) => 100 * (i % 2 ? 1.01 : 1));
  v[199] = v[198] * 1.05;
  const b = { t, v };
  const l = S.leg(b, "^VIX", "VIX", t[199]);
  assertEquals(l!.chg, 3.88); // ln(105 / 101)
  assertEquals(l!.z > 3, true);
  assertEquals(S.leg(b, "^VIX", "VIX", t[199] + 4 * H), null); // market shut
  assertEquals(S.riskScore([l!, { ...l!, sym: "ES=F" }]), 0); // VIX up and S&P up cancel
  assertEquals(S.riskScore([]), null);
});

Deno.test("signals: Fed outcomes → expected bps", () => {
  assertEquals(["50+ bps decrease", "25 bps decrease", "No change", "25 bps increase", "Other"].map(S.outcomeBps), [
    -50,
    -25,
    0,
    25,
    null,
  ]);
  // Prices sum to 1.1: renormalised → (0.33·0 + 0.77·25)/1.1 = 17.5
  assertEquals(S.expectedBps([{ bps: 0, p: 0.33 }, { bps: 25, p: 0.77 }]), 17.5);
  assertEquals(S.expectedBps([]), null);
  assertEquals([S.label(null), S.label(2), S.label(-2), S.label(0.3)], [
    "Markets closed",
    "Risk-off",
    "Risk-on",
    "Calm",
  ]);
});

Deno.test("reader: CAP alert → text; JTWC bulletin → prose page", async () => {
  const { cap } = await import("../src/server/reader.server.ts");
  const { readable } = await import("../src/lib/normalize.ts");
  const xml = `<alert><info><language>ar</language><headline>X</headline></info>` +
    `<info><language>en-GB</language><headline>Heavy rain</headline><areaDesc><![CDATA[Jazan]]></areaDesc></info></alert>`;
  assertEquals(cap(xml), "HEADLINE\nHeavy rain\n\nAREA\nJazan");
  assertEquals(
    readable("https://www.metoc.navy.mil/jtwc/products/wp2926.tcw"),
    "https://www.metoc.navy.mil/jtwc/products/wp2926web.txt",
  );
  assertEquals(readable("https://x.org/a.tcw"), "https://x.org/a.tcw");
});

Deno.test("meteo: grid sampling wraps longitude, cyclone parts kept", async () => {
  const M = await import("../src/lib/meteo.ts");
  const t = M.GRID.map(([, lon]) => (lon === -180 ? 10 : lon === 170 ? 20 : 0));
  assertEquals(M.GRID.length, 540);
  assertEquals(M.sample(t, 0, 175), 15); // halfway between 170° (20) and −180° (10)
  assertEquals(M.tempColor(-99), [120, 60, 200]);
  const s = { id: "TC-1-2", name: "X", level: "Red" as const, lon: 0, lat: 0 };
  const geo = {
    features: [
      { properties: { Class: "Poly_Cones" }, geometry: null },
      { properties: { Class: "Poly_Red", polygonlabel: "120 km/h" }, geometry: null },
      { properties: { Class: "Poly_Red", polygonlabel: "24/10 00:00" }, geometry: null },
      { properties: { Class: "Line_Line_0", polygonlabel: "HU" }, geometry: null },
      { properties: { Class: "Point_Centroid" }, geometry: null },
    ],
  };
  assertEquals(M.stormGeometry(geo, s).map((f) => f.properties?.part), ["cone", "wind", "track"]);
});

Deno.test("tv: live video id only when on air and embeddable", async () => {
  const { liveVideo } = await import("../src/lib/sound.ts");
  const live =
    `<link rel="canonical" href="https://www.youtube.com/watch?v=pykpO5kQJ98">"playabilityStatus":{"status":"OK"`;
  assertEquals(liveVideo(live), "pykpO5kQJ98");
  assertEquals(liveVideo(live + `"playableInEmbed":false`), null);
  assertEquals(liveVideo(`<link rel="canonical" href="https://www.youtube.com/channel/UCx">`), null);
});
