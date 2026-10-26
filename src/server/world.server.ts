// Fetches for the v0.3 sources. Server-only (network); cells call these. Parsers live in src/lib.
import { CLIMATE } from "../data/climate.ts";
import { BY_ISO, COUNTRIES } from "../data/countries.ts";
import { NORMALS } from "../data/normals.ts";
import * as A from "../lib/alerts.ts";
import * as E from "../lib/econ.ts";
import * as M from "../lib/meteo.ts";
import * as N from "../lib/normalize.ts";
import * as W from "../lib/world.ts";
import { liveVideo } from "../lib/sound.ts";
import { put } from "./blobs.server.ts";
import { get, json, pool, text } from "./net.server.ts";

const DAY = 86_400_000;
const settled = <T>(r: PromiseSettledResult<T>, d: T): T => (r.status === "fulfilled" ? r.value : d);
const allFailed = (rs: PromiseSettledResult<unknown>[]) => rs.every((r) => r.status === "rejected");

// ── Aviation ───────────────────────────────────────────────────────────────
export async function aviation(): Promise<{ squawks: N.Aircraft[]; airports: A.AirportStatus[] }> {
  const [sq, faa] = await Promise.allSettled([
    Promise.all(Object.keys(A.SQUAWKS).map(async (c) => N.aircraft(await json(`https://api.adsb.lol/v2/sqk/${c}`)))),
    text("https://nasstatus.faa.gov/api/airport-status-information"),
  ]);
  if (allFailed([sq, faa])) throw new Error("adsb.lol and FAA unreachable");
  return { squawks: settled(sq, []).flat(), airports: faa.status === "fulfilled" ? A.faa(faa.value) : [] };
}

// ── Weather ────────────────────────────────────────────────────────────────
export async function weather(previousUrl: string): Promise<{ alerts: A.WeatherAlert[]; url: string }> {
  const [us, ca, wmo] = await Promise.allSettled([
    json("https://api.weather.gov/alerts/active?severity=Extreme,Severe&status=actual", {
      headers: { Accept: "application/geo+json" },
    }),
    json("https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=2000"),
    json("https://severeweather.wmo.int/json/wmo_all.json"),
  ]);
  if (allFailed([us, ca, wmo])) throw new Error("weather services unreachable");
  const a = us.status === "fulfilled" ? A.nws(us.value) : { alerts: [], polys: [] };
  const b = ca.status === "fulfilled" ? A.eccc(ca.value) : { alerts: [], polys: [] };
  const alerts = [...a.alerts, ...b.alerts, ...(wmo.status === "fulfilled" ? A.wmo(wmo.value) : [])]
    .sort((x, y) => x.severity - y.severity || y.at - x.at);
  const url = await put(
    JSON.stringify({ type: "FeatureCollection", features: [...a.polys, ...b.polys] }),
    "weather.geojson",
    previousUrl,
  );
  return { alerts, url };
}

// ── Israel sirens ──────────────────────────────────────────────────────────
let cities: Record<string, A.City> | null = null; // ~1.5k places, static: fetched once per run

export async function sirens(now: number): Promise<A.Siren[]> {
  cities ??= A.cityTable(await json("https://www.tzevaadom.co.il/static/cities.json"));
  return A.sirens(await json("https://api.tzevaadom.co.il/alerts-history"), cities, now - 7 * DAY).slice(0, 200);
}

// ── Protests ───────────────────────────────────────────────────────────────
export const protests = async (): Promise<W.Protest[]> =>
  W.protests(await json("https://api.gdeltproject.org/api/v1/gkg_geojson?QUERY=PROTEST&MAXROWS=2500", {}, 60_000))
    .slice(0, 400);

// ── Chokepoint traffic ─────────────────────────────────────────────────────
const PORTWATCH = "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services";

export async function traffic(now: number): Promise<W.Traffic[]> {
  const since = new Date(now - 30 * DAY).toISOString().slice(0, 10);
  const q = (layer: string, params: Record<string, string>) =>
    json(`${PORTWATCH}/${layer}/FeatureServer/0/query?${new URLSearchParams({ f: "json", ...params })}`);
  const [daily, points] = await Promise.all([
    q("Daily_Chokepoints_Data", {
      where: `date >= DATE '${since}'`,
      outFields: "portid,portname,date,n_total,n_tanker",
      resultRecordCount: "2000",
    }),
    q("PortWatch_chokepoints_database", { where: "1=1", outFields: "portid,lat,lon", returnGeometry: "false" }),
  ]);
  const out = W.traffic(daily, points);
  if (!out.length) throw new Error("PortWatch returned no chokepoints");
  return out;
}

// ── Country profiles ───────────────────────────────────────────────────────
const WB = { gdp: "NY.GDP.MKTP.CD", pop: "SP.POP.TOTL", inflation: "FP.CPI.TOTL.ZG" } as const;

export async function profiles(now: number): Promise<W.Profiles> {
  const year = new Date(now).getUTCFullYear();
  const wb = (id: string) =>
    json(`https://api.worldbank.org/v2/country/all/indicator/${id}?format=json&mrnev=1&per_page=400`).then(W.worldBank);
  const unhcr = async () => {
    for (const y of [year - 1, year - 2]) {
      const r = W.unhcr(await json(`https://api.unhcr.org/population/v1/population/?year=${y}&coo_all=true&limit=400`));
      if (Object.keys(r).length > 50) return r;
    }
    return {};
  };
  // IMF's CDN refuses browser-like clients that lack a full browser handshake; a plain tool UA passes.
  const imf = (id: string) =>
    json(`https://www.imf.org/external/datamapper/api/v1/${id}`, { headers: { "User-Agent": "curl/8" } }, 40_000)
      .then((j) => W.imf(j, id, year));
  const [gdp, pop, inf, ref, sdn, growth, debt] = await Promise.allSettled([
    wb(WB.gdp),
    wb(WB.pop),
    wb(WB.inflation),
    unhcr(),
    get("https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ADD.CSV", "text/csv", 60_000)
      .then((r) => r.text()).then(W.ofac),
    imf("NGDP_RPCH"),
    imf("GGXWDG_NGDP"),
  ]);
  if (allFailed([gdp, pop, inf, ref, sdn, growth, debt])) {
    throw new Error("World Bank, UNHCR, OFAC and IMF unreachable");
  }
  const out: W.Profiles = {};
  const at = (iso: string) => (out[iso] ??= {});
  for (const [iso, [v, y]] of Object.entries(settled(gdp, {}))) Object.assign(at(iso), { gdp: v, gdpYear: y });
  for (const [iso, [v]] of Object.entries(settled(pop, {}))) at(iso).pop = v;
  for (const [iso, [v]] of Object.entries(settled(inf, {}))) at(iso).inflation = +v.toFixed(1);
  for (const [iso, r] of Object.entries(settled(ref, {}))) Object.assign(at(iso), r);
  for (const [iso, c] of Object.entries(settled(sdn, {}))) at(iso).sanctioned = c;
  for (const [iso, v] of Object.entries(settled(growth, {}))) at(iso).growth = +v.toFixed(1);
  for (const [iso, v] of Object.entries(settled(debt, {}))) at(iso).debt = Math.round(v);
  return out;
}

// ── Planet ─────────────────────────────────────────────────────────────────
export const radiation = async (now: number): Promise<W.Sensor[]> =>
  W.radiation(await json("https://tt.safecast.org/devices", {}, 40_000), now, 3 * DAY);

export const co2 = async (): Promise<W.Co2 | null> =>
  W.co2(await text("https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_daily_mlo.csv"));

const CLIMATE_POINTS = CLIMATE.flatMap((iso) => (BY_ISO[iso] !== undefined ? [COUNTRIES[BY_ISO[iso]]] : []));

/** ERA5 (Open-Meteo archive, ~5 days behind): last 7 days vs the baked 1991–2020 ERA5 normal. One request for all
 *  points, ≈66 of the free tier's 10,000 daily calls. */
export async function climate(now: number): Promise<W.Anomaly[]> {
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const res = await json(
    `https://archive-api.open-meteo.com/v1/archive?latitude=${CLIMATE_POINTS.map((c) => c.lat.toFixed(2))}` +
      `&longitude=${CLIMATE_POINTS.map((c) => c.lon.toFixed(2))}&start_date=${day(now - 21 * DAY)}` +
      `&end_date=${day(now - DAY)}&daily=temperature_2m_mean&models=era5&timezone=GMT`,
    {},
    60_000,
  );
  const rows = Array.isArray(res) ? res : [res];
  const out = CLIMATE_POINTS.flatMap((c, i) => {
    const a = W.anomaly(
      c.iso,
      c.name,
      c.lon,
      c.lat,
      (rows[i] as { daily?: unknown } | undefined)?.daily,
      NORMALS[c.iso],
    );
    return a ? [a] : [];
  });
  if (!out.length) throw new Error("Open-Meteo ERA5: no temperature data");
  return out;
}

// ── Services ───────────────────────────────────────────────────────────────
const STATUS_PAGES: [string, string][] = [
  ["GitHub", "https://www.githubstatus.com"],
  ["Cloudflare", "https://www.cloudflarestatus.com"],
  ["OpenAI", "https://status.openai.com"],
  ["Claude", "https://status.claude.com"],
  ["Discord", "https://discordstatus.com"],
  ["Reddit", "https://www.redditstatus.com"],
  ["Zoom", "https://www.zoomstatus.com"],
  ["Dropbox", "https://status.dropbox.com"],
  ["DigitalOcean", "https://status.digitalocean.com"],
  ["Vercel", "https://www.vercel-status.com"],
  ["npm", "https://status.npmjs.org"],
  ["Solana", "https://status.solana.com"],
];

export async function services(): Promise<W.Service[]> {
  const res = await pool(
    STATUS_PAGES,
    6,
    async ([name, url]) => W.statusPage(name, url, await json(`${url}/api/v2/status.json`)),
  );
  const out = res.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (!out.length) throw new Error("status pages unreachable");
  return out;
}

// ── Money ──────────────────────────────────────────────────────────────────
export type MacroData = { mood: E.Mood | null; rates: E.Macro[]; cot: E.Positioning[]; policy: W.PolicyRate[] };

export async function macro(): Promise<MacroData> {
  const codes = [...E.COT.keys()].map((c) => `'${c}'`).join(",");
  const [cnn, debt, fed, ecb, cot, bis] = await Promise.allSettled([
    json("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
      headers: { Referer: "https://edition.cnn.com/", Origin: "https://edition.cnn.com" },
    }),
    json(
      "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page%5Bsize%5D=1",
    ),
    json("https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json"),
    json("https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.DFR.LEV?lastNObservations=1&format=jsondata"),
    json(
      `https://publicreporting.cftc.gov/resource/6dca-aqww.json?${new URLSearchParams({
        $where: `cftc_contract_market_code in(${codes})`,
        $order: "report_date_as_yyyy_mm_dd DESC",
        $limit: "24",
        $select:
          "cftc_contract_market_code,report_date_as_yyyy_mm_dd,noncomm_positions_long_all,noncomm_positions_short_all,open_interest_all",
      })}`,
    ),
    get("https://stats.bis.org/api/v1/data/WS_CBPOL/D..?lastNObservations=1&format=csv", "text/csv", 30_000)
      .then((r) => r.text()),
  ]);
  if (allFailed([cnn, debt, fed, ecb, cot, bis])) throw new Error("macro sources unreachable");
  const one = <T>(r: PromiseSettledResult<unknown>, f: (j: unknown) => T | null) =>
    r.status === "fulfilled" ? f(r.value) : null;
  return {
    mood: one(cnn, E.cnnFear),
    rates: [one(fed, E.effr), one(ecb, E.ecbRate), one(debt, E.usDebt)].filter((x): x is E.Macro => !!x),
    cot: cot.status === "fulfilled" ? E.cot(cot.value) : [],
    policy: bis.status === "fulfilled" ? W.policyRates(bis.value, Date.now(), 2 * 365 * DAY) : [],
  };
}

/** Kalshi open events (paged by cursor), world-relevant categories only. */
export async function kalshi(): Promise<N.Bet[]> {
  const out: N.Bet[] = [];
  let cursor = "";
  for (let page = 0; page < 5; page++) {
    const j = await json(
      `https://api.elections.kalshi.com/trade-api/v2/events?status=open&with_nested_markets=true&limit=200${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
      }`,
    ) as { cursor?: string };
    out.push(...E.kalshi(j));
    cursor = String(j?.cursor ?? "");
    if (!cursor) break;
  }
  return out.sort((a, b) => b.vol - a.vol).slice(0, 60);
}

// ── Satellite imagery ──────────────────────────────────────────────────────
/** Latest Sentinel-2 scene (≤30% cloud) over a point: Element 84 Earth Search STAC, keyless. */
export async function imagery(lon: number, lat: number): Promise<W.Image | null> {
  const r = await get("https://earth-search.aws.element84.com/v1/search", "application/geo+json", 30_000, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      collections: ["sentinel-2-l2a"],
      intersects: { type: "Point", coordinates: [lon, lat] },
      limit: 1,
      sortby: [{ field: "properties.datetime", direction: "desc" }],
      query: { "eo:cloud_cover": { lt: 30 } },
    }),
  });
  // deno-lint-ignore no-explicit-any
  const f = ((await r.json()) as any)?.features?.[0];
  return f?.assets?.thumbnail?.href
    ? {
      url: String(f.assets.thumbnail.href),
      date: String(f.properties?.datetime ?? "").slice(0, 10),
      cloud: Math.round(Number(f.properties?.["eo:cloud_cover"]) || 0),
      scene: String(f.id ?? ""),
    }
    : null;
}

// ── Weather maps ───────────────────────────────────────────────────────────
/** Current temperature on the 10° grid: 540 points in 3 requests (≈540 of Open-Meteo's 10,000 free daily calls). */
export async function temps(now: number): Promise<M.Temps> {
  const chunks = Array.from({ length: Math.ceil(M.GRID.length / 180) }, (_, i) => M.GRID.slice(i * 180, i * 180 + 180));
  const rows = await Promise.all(chunks.map(async (pts) => {
    const j = await json(
      `https://api.open-meteo.com/v1/forecast?latitude=${pts.map((p) => p[0])}&longitude=${
        pts.map((p) => p[1])
      }&current=temperature_2m&timezone=GMT`,
      {},
      40_000,
    );
    return Array.isArray(j) ? j : [j];
  }));
  const t = M.currentTemps(rows.flat());
  if (t.every((v) => v === null)) throw new Error("Open-Meteo: no temperatures");
  return { at: now, t };
}

/** Current tropical cyclones + their geometry, stored as one blob; returns the list and the blob URL. */
export async function cyclones(previousUrl: string): Promise<{ storms: M.Storm[]; url: string }> {
  const list = M.storms(await json(M.cycloneSearch(Date.now())));
  const res = await pool(list, 3, async (s) => {
    const [, eventid, episodeid] = s.id.split("-");
    return M.stormGeometry(
      await json(
        `https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=TC&eventid=${eventid}&episodeid=${episodeid}`,
        {},
        120_000, // GDACS builds this on demand: ~1 min per storm is normal
      ),
      s,
    );
  });
  const features = res.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const url = await put(JSON.stringify({ type: "FeatureCollection", features }), "cyclones.geojson", previousUrl);
  return { storms: list, url };
}

// ── Live TV ────────────────────────────────────────────────────────────────
/** Channel → its live video id, or null when off air / not embeddable. Reads each /live page only until the answer
 *  (~0.8 MB). */
export async function liveChannels(ids: string[]): Promise<Record<string, string | null>> {
  const res = await pool(ids, 4, async (id) => {
    const r = await get(`https://www.youtube.com/channel/${id}/live`, "text/html", 20_000, {
      headers: { "Accept-Language": "en-US,en;q=0.9", Cookie: "SOCS=CAI" },
    });
    const reader = r.body!.pipeThrough(new TextDecoderStream()).getReader();
    let html = "";
    for (let n = 0; n < 1_500_000;) {
      const { done, value } = await reader.read();
      if (done) break;
      html += value;
      n += value.length;
      if (
        /"playableInEmbed":(true|false)/.test(html.slice(-value.length - 40)) ||
        /canonical" href="[^"]*\/channel\//.test(html)
      ) break;
    }
    await reader.cancel().catch(() => {});
    return [id, liveVideo(html)] as const;
  });
  const out = Object.fromEntries(res.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])));
  if (!Object.keys(out).length) throw new Error("YouTube unreachable");
  return out;
}
