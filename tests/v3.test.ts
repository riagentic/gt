// Pure parsers and scoring added in v0.3, against trimmed real payloads.
import { assert, assertEquals } from "@std/assert";
import { BY_ISO } from "../src/data/countries.ts";
import * as A from "../src/lib/alerts.ts";
import * as E from "../src/lib/econ.ts";
import { instability } from "../src/lib/score.ts";
import * as W from "../src/lib/world.ts";

Deno.test("faa: ground delays, delays (not <Delay_type>), closures without NOTAM noise", () => {
  const xml = `<AIRPORT_STATUS_INFORMATION><Delay_type><Name>Ground Delay Programs</Name><Ground_Delay_List>
<Ground_Delay><ARPT>SFO</ARPT><Reason>low ceilings</Reason><Avg>1 hour</Avg><Max>2 hours</Max></Ground_Delay>
</Ground_Delay_List></Delay_type><Delay_type><Arrival_Departure_Delay_List><Delay><ARPT>DCA</ARPT>
<Reason>EQ:OCL: Equipment</Reason><Arrival_Departure Type="Departure"><Min>1 hour</Min><Max>2 hours</Max>
<Trend>Increasing</Trend></Arrival_Departure></Delay></Arrival_Departure_Delay_List></Delay_type>
<Delay_type><Airport_Closure_List><Airport><ARPT>LAX</ARPT><Reason>!LAX 05/277 AD AP CLSD</Reason></Airport>
<Airport><ARPT>SAN</ARPT><Reason>runway work</Reason><Reopen>May 28</Reopen></Airport></Airport_Closure_List>
</Delay_type></AIRPORT_STATUS_INFORMATION>`;
  assertEquals(A.faa(xml).map((x) => [x.code, x.kind, x.reason]), [
    ["SFO", "Ground delay", "low ceilings"],
    ["DCA", "Delay", "Equipment"],
    ["SAN", "Closure", "runway work"],
  ]);
});

Deno.test("weather: NWS severe+extreme with polygons; ECCC warnings merged by name; WMO s≥3 outside US/CA", () => {
  const poly = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
  const nws = A.nws({
    features: [
      {
        id: "u1",
        geometry: poly,
        properties: { id: "a", event: "Tornado Warning", severity: "Extreme", areaDesc: "X" },
      },
      { id: "u2", geometry: null, properties: { id: "b", event: "Flood Warning", severity: "Severe" } },
      { id: "u3", geometry: poly, properties: { id: "c", event: "Frost", severity: "Minor" } },
      {
        id: "u4",
        geometry: poly,
        properties: {
          id: "d",
          event: "Tornado Warning",
          severity: "Extreme",
          areaDesc: "Y",
          senderName: "",
          expires: "",
        },
      },
    ],
  });
  assertEquals(nws.alerts.map((a) => [a.id, a.severity, a.area]), [["a", 1, "X; Y"], ["b", 2, ""]]);
  assertEquals(nws.polys.map((p) => p.properties.id), ["a", "a"]);
  const ca = A.eccc({
    features: [
      {
        geometry: poly,
        properties: {
          alert_type: "warning",
          alert_short_name_en: "wind",
          feature_name_en: "A",
          publication_datetime: "t",
        },
      },
      {
        geometry: poly,
        properties: {
          alert_type: "warning",
          alert_short_name_en: "wind",
          feature_name_en: "B",
          publication_datetime: "t",
        },
      },
      { geometry: poly, properties: { alert_type: "watch", alert_short_name_en: "snow", feature_name_en: "C" } },
    ],
  });
  assertEquals(ca.alerts.map((a) => [a.title, a.area]), [["Wind", "A, B"]]);
  const wmo = A.wmo({
    items: [
      { id: "1", event: "Storm", s: 4, capURL: "de-dwd-en/x.xml", sent: "2026-10-22 10:00:00" },
      { id: "2", event: "Frost", s: 1, capURL: "de-dwd-en/y.xml" },
      { id: "3", event: "Tornado", s: 4, capURL: "us-noaa/z.xml" },
    ],
  });
  assertEquals(wmo.map((w) => [w.id, w.severity, w.country]), [["1", 1, BY_ISO.DE]]);
});

Deno.test("sirens: resolve cities, drop drills and old alerts, newest first", () => {
  const cities = A.cityTable({ cities: { "שדרות": { en: "Sderot", lat: 31.5, lng: 34.6 }, "x": { en: "NoPos" } } });
  const now = 1_800_000_000_000;
  const list = A.sirens(
    [
      { id: 1, alerts: [{ time: now / 1000 - 60, cities: ["שדרות"], threat: 0, isDrill: false }] },
      { id: 2, alerts: [{ time: now / 1000 - 30, cities: ["שדרות"], threat: 9, isDrill: true }] },
      { id: 3, alerts: [{ time: now / 1000 - 10, cities: ["שדרות", "x"], threat: 5, isDrill: false }] },
      { id: 4, alerts: [{ time: now / 1000 - 99_999, cities: ["שדרות"], threat: 0, isDrill: false }] },
    ],
    cities,
    now - 3_600_000,
  );
  assertEquals(list.map((s) => [s.id, A.THREATS[s.threat], s.cities.length]), [["3-0", "Hostile aircraft", 1], [
    "1-0",
    "Rockets / missiles",
    1,
  ]]);
});

Deno.test("protests: one point per place, names cleaned, country centroids dropped", () => {
  const f = (name: string, lon: number, tone: number, at: string) => ({
    geometry: { coordinates: [lon, 48.8] },
    properties: { name, urltone: tone, urlpubtimedate: at, url: at },
  });
  const ps = W.protests({
    features: [
      f("Paris, France (General), France", 2.33, -4, "2026-10-22T10:00:00Z"),
      f("Paris, France", 2.331, -2, "2026-10-22T12:00:00Z"),
      f("France", 2.0, -1, "2026-10-22T12:00:00Z"),
    ],
  });
  assertEquals(ps.map((p) => [p.name, p.n, p.tone, p.url]), [["Paris, France", 2, -3, "2026-10-22T12:00:00Z"]]);
});

Deno.test("chokepoints: latest day vs window average, with coordinates", () => {
  const daily = {
    features: [
      { attributes: { portid: "c1", portname: "Suez", date: "2026-10-18", n_total: 40, n_tanker: 10 } },
      { attributes: { portid: "c1", portname: "Suez", date: "2026-10-17", n_total: 60, n_tanker: 12 } },
      { attributes: { portid: "c9", portname: "Nowhere", date: "2026-10-18", n_total: 5 } },
    ],
  };
  const points = { features: [{ attributes: { portid: "c1", lon: 32.5, lat: 30 } }] };
  assertEquals(W.traffic(daily, points), [
    { id: "c1", name: "Suez", lon: 32.5, lat: 30, date: "2026-10-18", ships: 40, tankers: 10, avg: 50 },
  ]);
});

Deno.test("profiles: World Bank skips aggregates, UNHCR maps ISO-3, OFAC counts countries", () => {
  const wb = W.worldBank([{}, [
    { country: { id: "DE" }, value: 5e12, date: "2025" },
    { country: { id: "1W" }, value: 1e14, date: "2025" },
    { country: { id: "FR" }, value: null, date: "2025" },
  ]]);
  assertEquals(wb, { DE: [5e12, "2025"] });
  const u = W.unhcr({
    items: [{ coo_iso: "SYR", coo_name: "Syrian Arab Rep.", refugees: 5, asylum_seekers: 1, idps: 7 }, {
      coo_iso: "UKR",
      coo_name: "Ukraine",
      refugees: "3",
      idps: "-",
    }],
  });
  assertEquals(u, { SY: { refugees: 6, idps: 7 }, UA: { refugees: 3, idps: 0 } });
  const csv = [
    '36,25,-0- ,"Havana","Cuba",-0- ',
    '173,129,"Ibex House, The Minories","London EC3N 1DY","United Kingdom",-0- ',
    '174,130,-0- ,"Tehran","Iran",-0- ',
    '175,131,-0- ,"Tehran","Iran",-0- ',
  ].join("\n");
  assertEquals(W.ofac(csv), { CU: 1, GB: 1, IR: 2 });
});

Deno.test("radiation + anomaly + status pages", () => {
  const now = Date.parse("2026-10-22T00:00:00Z");
  const r = W.radiation(
    [
      {
        device: 1,
        lnd_7318c: 40.4,
        when_captured: "2026-10-21T00:00:00Z",
        loc_lat: 37,
        loc_lon: 140,
        loc_name: "Namie",
      },
      { device: 2, lnd_7318c: 40, when_captured: "2026-01-01T00:00:00Z", loc_lat: 37, loc_lon: 140 },
      { device: 3, when_captured: "2026-10-21T00:00:00Z", loc_lat: 37, loc_lon: 140 },
    ],
    now,
    3 * 86_400_000,
  );
  assertEquals(r.map((x) => [x.id, x.cpm]), [["1", 40]]);
  const clim = {
    properties: {
      parameter: {
        T2M: { JAN: 0, FEB: 0, MAR: 0, APR: 0, MAY: 0, JUN: 0, JUL: 0, AUG: 0, SEP: 10, OCT: 10, NOV: 4, DEC: 0 },
      },
    },
  };
  // Mid-October sits between two 10° months → normal 10; 14° observed → +4. Fill values (−999) skipped.
  const daily = {
    properties: { parameter: { T2M: { "20261014": 13, "20261015": 15, "20261016": 14, "20261017": -999 } } },
  };
  assertEquals(W.anomaly("DE", "Germany", 10, 51, daily, clim)?.delta, 4);
  assertEquals(W.normalFor([0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 20, 0], new Date(Date.UTC(2026, 9, 31))) > 10, true);
  assertEquals(W.anomaly("DE", "Germany", 10, 51, daily, { properties: { parameter: { T2M: {} } } }), null);
  assertEquals(W.statusPage("X", "u", { status: { indicator: "major", description: "Outage" } }).level, "major");
  assertEquals(W.statusPage("X", "u", { status: { indicator: "none" } }).level, "ok");
});

Deno.test("econ: Kalshi topics + likeliest market; CNN; COT net %; rates", () => {
  const bets = E.kalshi({
    events: [
      {
        category: "Politics",
        event_ticker: "E1",
        series_ticker: "KXE",
        title: "Who?",
        markets: [
          { status: "active", last_price_dollars: "0.2", yes_sub_title: "A", volume_fp: "10" },
          { status: "active", last_price_dollars: "0.7", yes_sub_title: "B", volume_fp: "5" },
          { status: "closed", last_price_dollars: "0.9", yes_sub_title: "C" },
        ],
      },
      { category: "Sports", event_ticker: "E2", markets: [{ status: "active", last_price_dollars: "0.5" }] },
    ],
  });
  assertEquals(bets.map((b) => [b.id, b.outcome, b.prob, b.vol, b.venue, b.url]), [
    ["kalshi-E1", "B", 0.7, 15, "Kalshi", "https://kalshi.com/markets/kxe"],
  ]);
  assertEquals(
    E.cnnFear({ fear_and_greed: { score: 19.7, rating: "extreme fear", previous_1_week: 30.3 } })?.score,
    20,
  );
  const cot = E.cot([
    {
      cftc_contract_market_code: "088691",
      report_date_as_yyyy_mm_dd: "2026-10-13T00:00:00.000",
      noncomm_positions_long_all: "300",
      noncomm_positions_short_all: "100",
      open_interest_all: "1000",
    },
    {
      cftc_contract_market_code: "088691",
      report_date_as_yyyy_mm_dd: "2026-10-06T00:00:00.000",
      noncomm_positions_long_all: "1",
      noncomm_positions_short_all: "1",
      open_interest_all: "1",
    },
  ]);
  assertEquals(cot, [{ name: "Gold", net: 200, pct: 20, date: "2026-10-13" }]);
  assertEquals(
    E.effr({ refRates: [{ percentRate: 3.88, effectiveDate: "d", targetRateFrom: 3.75, targetRateTo: 4 }] })?.value,
    "3.88%",
  );
  assertEquals(
    E.ecbRate({
      dataSets: [{ series: { "0": { observations: { "0": [2.5] } } } }],
      structure: { dimensions: { observation: [{ values: [{ id: "2026-10-22" }] }] } },
    }),
    { label: "ECB deposit rate", value: "2.50%", date: "2026-10-22", hint: "ECB Data Portal" },
  );
});

Deno.test("instability: sum of capped parts, caps total 100, every point explained", () => {
  const calm = instability({});
  assertEquals([calm.score, calm.parts.length], [0, 0]);
  const war = instability({
    activity: 100,
    sirens: 500,
    displaced: 9e6,
    population: 4e7,
    sanctioned: 3000,
    advisory: 4,
  });
  assertEquals(war.parts.map((p) => [p.label, p.points]), [
    ["News attention", 30],
    ["Travel advisory", 25],
    ["Displacement", 15],
    ["Rocket / missile sirens", 10],
    ["Sanctions", 5],
  ]);
  assertEquals(war.score, 85);
  assertEquals(instability({ advisory: 3, activity: 50 }).score, 12 + 15);
  const max = instability({
    activity: 1e3,
    advisory: 4,
    displaced: 1,
    population: 1,
    protests: 1e6,
    sirens: 1e6,
    sanctioned: 1e9,
    outbreaks: 9,
    severeWeather: 9,
  });
  assertEquals(max.score, 100);
});

Deno.test("imf: ISO-3 → ISO-2 for one year; regions and groups dropped", () => {
  const j = {
    values: {
      NGDP_RPCH: { UKR: { "2026": 2.5, "2025": 3 }, DEU: { "2026": 0.9 }, EURO: { "2026": 1 }, UVK: { "2026": 4 } },
    },
  };
  assertEquals(W.imf(j, "NGDP_RPCH", 2026), { UA: 2.5, DE: 0.9, XK: 4 });
});

Deno.test("bis: latest rate per bank, stale pre-euro series dropped, euro area named", () => {
  const csv = [
    "FREQ,REF_AREA,UNIT_MEASURE,TITLE,TIME_PERIOD,OBS_VALUE",
    'D,AU,368,"Cash rate, target",2026-10-15,4.6',
    "D,AT,368,Old,1998-12-31,3",
    "D,XM,368,ECB,2026-10-20,2.5",
    "D,TR,368,CBRT,2026-10-20,",
  ].join("\n");
  assertEquals(
    W.policyRates(csv, Date.parse("2026-10-22"), 2 * 365 * 86_400_000).map((r) => [r.iso, r.name, r.rate]),
    [["AU", "Australia", 4.6], ["XM", "Euro area (ECB)", 2.5]],
  );
  assert(W.EURO.has("DE") && !W.EURO.has("GB"));
});

Deno.test("co2: latest Mauna Loa day vs a year earlier; comments and missing days skipped", () => {
  const csv = [
    "# header",
    "2025,10,21,2025.8027,424.10",
    "2025,10,22,2025.8055,-999.99",
    "2026,10,20,2026.8000,426.65",
    "2026,10,21,2026.8027,426.85",
  ].join("\n");
  assertEquals(W.co2(csv), { ppm: 426.85, date: "2026-10-21", yearAgo: 424.1, delta: 2.75 });
  assertEquals(W.co2("# nothing"), null);
});

Deno.test("rect: clamp keeps a grabbable title bar and minimum size; move and resize clamp too", async () => {
  const { clampRect, moveRect, resizeRect, MIN } = await import("../src/lib/rect.ts");
  const view = { w: 1200, h: 800 };
  assertEquals(clampRect({ x: -900, y: -50, w: 100, h: 100 }, view), { x: 80 - MIN.w, y: 0, w: MIN.w, h: MIN.h });
  assertEquals(clampRect({ x: 5000, y: 5000, w: 3000, h: 3000 }, view), { x: 1120, y: 768, w: 1200, h: 800 });
  assertEquals(moveRect({ x: 100, y: 100, w: 400, h: 300 }, 50, -20, view), { x: 150, y: 80, w: 400, h: 300 });
  // Resize never moves the top-left and never runs past the window edge.
  assertEquals(resizeRect({ x: 1000, y: 600, w: 300, h: 200 }, 500, 500, view), { x: 1000, y: 600, w: 200, h: 200 });
});

Deno.test("sound: guest reports parse strictly; the script carries the wanted sound", async () => {
  const { readSound, guestScript, TAG } = await import("../src/lib/sound.ts");
  assertEquals(readSound(`${TAG}{"muted":false,"volume":42.4}`), { muted: false, volume: 42 });
  assertEquals(readSound(`${TAG}{"muted":"no","volume":42}`), null);
  assertEquals(readSound(`${TAG}{"muted":false,"volume":420}`), null);
  assertEquals(readSound(`${TAG}{oops`), null);
  assertEquals(readSound("other log line"), null);
  const js = guestScript({ muted: false, volume: 30 });
  assertEquals(js.includes('{"muted":false,"volume":30}') && js.includes(JSON.stringify(TAG)), true);
});
