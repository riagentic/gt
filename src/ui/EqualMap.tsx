// True-size flat map: Equal Earth on a 2D canvas (MapLibre has no equal-area projection). Same cells, same picks
// (click = summary, again = page), same layer toggles; country names only, zoom up to 10×.
import type * as GeoJSON from "geojson";
import type { JSX } from "aio";
import { effect, onCleanup, onMount, untrack, useRef } from "aio/air";
// @deno-types="npm:@types/d3-geo@3.1.0"
import {
  geoArea,
  geoContains,
  geoEqualEarth,
  geoGraticule10,
  geoPath,
  type GeoPermissibleObjects,
  type GeoSphere,
} from "d3-geo";
import { air } from "../cell/air.ts";
import { alerts } from "../cell/alerts.ts";
import { atlas } from "../cell/atlas.ts";
import { hazards } from "../cell/hazards.ts";
import { layers } from "../cell/layers.ts";
import { meteo } from "../cell/meteo.ts";
import { news } from "../cell/news.ts";
import { type LayerId, prefs } from "../cell/prefs.ts";
import { risk } from "../cell/risk.ts";
import { sky } from "../cell/sky.ts";
import { type Pick, view } from "../cell/view.ts";
import { COUNTRIES } from "../data/countries.ts";
import { THREATS } from "../lib/alerts.ts";
import * as F from "../lib/features.ts";
import * as M from "../lib/meteo.ts";
import { position, track } from "../lib/orbit.ts";
import { nightPolygon, subsolar } from "../lib/sun.ts";
import { C, L, T } from "./i18n.ts";
import { focus } from "./rows.tsx";
import { locate } from "./pick.ts";
import { dark as isDark, loadSites, now, scores, sites, world } from "./store.ts";

type FC = GeoJSON.FeatureCollection;
type Props = Record<string, unknown>;
type Dot = { r: (p: Props) => number; fill: (p: Props) => string; stroke?: string; kind?: Pick["kind"] };
const P = (p: Props, k: string) => Number(p[k] ?? 0);

/** d3-geo fills the smaller side of a spherical ring: RFC 7946 (counter-clockwise) shapes come out inverted.
 *  Any polygon covering more than half the sphere is wound the wrong way: reverse its rings. */
const fixed = new WeakMap<FC, FC>();
const sphereSafe = (fc: FC): FC => {
  let out = fixed.get(fc);
  if (out) return out;
  out = {
    ...fc,
    features: fc.features.map((f) => {
      const g = f.geometry;
      if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) return f;
      const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      const flip = polys.map((rings) =>
        geoArea({ type: "Polygon", coordinates: rings }) > 2 * Math.PI ? rings.map((r) => [...r].reverse()) : rings
      );
      return { ...f, geometry: g.type === "Polygon" ? { ...g, coordinates: flip[0] } : { ...g, coordinates: flip } };
    }),
  };
  fixed.set(fc, out);
  return out;
};

/** URL → FeatureCollection, fetched once. */
const remote = new Map<string, Promise<FC | null>>();
const load = (url: string) => {
  if (!remote.has(url)) {
    remote.set(
      url,
      fetch(url).then((r) => r.json() as Promise<FC>).catch(() => (remote.delete(url), null)),
    );
  }
  return remote.get(url)!;
};

const KIND: Record<string, string> = {
  wildfire: "#ff7a45",
  storm: "#5ac8fa",
  volcano: "#ff453a",
  flood: "#409cff",
  drought: "#d4a373",
  ice: "#a5f3fc",
};
const lerp = (stops: [number, string][], v: number) => stops.reduce((c, [t, col]) => (v >= t ? col : c), stops[0][1]);
const SCORE: [number, string][] = [[15, "#3a7bd5"], [40, "#f5a524"], [65, "#ff6b3d"], [85, "#ff2d55"]];
const SITE: Record<string, string> = {
  port: "#5ac8fa",
  base: "#8e8e93",
  nuclear: "#d4e157",
  spaceport: "#ffffff",
  datacenter: "#bf5af2",
};
const SITE_LAYER: Record<string, LayerId> = {
  port: "ports",
  base: "bases",
  nuclear: "nuclear",
  spaceport: "spaceports",
  datacenter: "datacenters",
};

/** Mark kinds whose titles are live feed text (hover shows them translated). */
const LIVE = new Set(["event", "quake", "protest", "weather", "outbreak", "siren"]);

/** Point layers, bottom to top. `kind` makes them clickable. */
const DOTS: [LayerId, () => FC | null, Dot][] = [
  ["climate", () => F.anomalyPoints(atlas.climate), {
    r: (p) => 7 + Math.min(11, Math.abs(P(p, "delta")) * 1.6),
    fill: (p) => (P(p, "delta") > 1.5 ? "#ff9f0acc" : P(p, "delta") < -1.5 ? "#64d2ffcc" : "#8e8e9399"),
    kind: "anomaly",
  }],
  ["radiation", () => F.sensorPoints(atlas.radiation), {
    r: () => 3,
    fill: (p) => lerp([[0, "#30d158"], [100, "#ffd60a"], [300, "#ff9f0a"], [1000, "#ff2d55"]], P(p, "cpm")),
    kind: "sensor",
  }],
  ["places", () => F.placePoints(), {
    r: () => 4,
    fill: () => "transparent",
    stroke: "#ff9f0a",
    kind: "place",
  }],
  ["events", () => F.eventPoints(hazards.events), {
    r: () => 4,
    fill: (p) => KIND[String(p.kind)] ?? "#bf5af2",
    kind: "event",
  }],
  ["quakes", () => F.quakePoints(hazards.quakes, prefs.minMag, now.value), {
    r: (p) => Math.max(2.5, 2 ** ((P(p, "mag") - 2.5) * 0.75) * 2.5),
    fill: (p) => lerp([[0, "#ff375fcc"], [6, "#ff9f0acc"], [48, "#ffd60acc"], [168, "#8e8e93cc"]], P(p, "age")),
    kind: "quake",
  }],
  ["protests", () => F.protestPoints(alerts.protests), {
    r: (p) => 3 + Math.sqrt(P(p, "n")) * 2,
    fill: () => "#ffcc00bb",
    kind: "protest",
  }],
  ["weather", () => F.weatherPoints(alerts.weather), {
    r: () => 5,
    fill: (p) => (P(p, "severity") === 1 ? "#ff2d55" : "#ff9f0a"),
    stroke: "#ffffff",
    kind: "weather",
  }],
  ["health", () => F.healthPoints(risk.outbreaks, now.value), {
    r: () => 5,
    fill: () => "#bf5af2",
    stroke: "#ffffff",
    kind: "outbreak",
  }],
  ["news", () => F.newsPoints(news.stories, now.value), {
    r: (p) => 5 + Math.sqrt(P(p, "n")) * 2.4,
    fill: () => "#0a84ffc8",
    kind: "country",
  }],
  ["sirens", () => F.sirenPoints(alerts.sirens, now.value, (t) => THREATS[t] ?? "Alert"), {
    r: () => 3,
    fill: (p) => lerp([[0, "#ff2d55"], [24, "#ff9f0a"], [168, "#8e8e93"]], P(p, "age")),
    kind: "siren",
  }],
  ["air", () => F.planePoints(air.planes), { r: () => 3, fill: () => "#30d158", kind: "plane" }],
  ["squawks", () => F.squawkPoints(alerts.squawks), {
    r: () => 5,
    fill: () => "#ff2d55",
    stroke: "#fff",
    kind: "plane",
  }],
];

/** Rain/temperature raster pixels per base unit: half resolution, at most ~400k pixels (the data is ~10 km/pixel at
 *  best, so a 4K window gains nothing but a longer freeze). */
const rasterScale = (w: number, h: number) => Math.min(0.5, Math.sqrt(400_000 / (w * h)));

export function EqualMap(): JSX.Element {
  const host = useRef<HTMLCanvasElement>(null!);
  const tipRef = useRef<HTMLDivElement>(null!);

  onMount(() => {
    const canvas = host.current, ctx = canvas.getContext("2d")!;
    let W = 0, H = 0, dpr = 1;
    let k = 1, tx = 0, ty = 0;
    const proj = geoEqualEarth();
    let version = 0; // bumps on resize: cached paths are per projection
    const paths = new WeakMap<object, { v: number; p: Path2D }>();
    const pathOf = (o: GeoPermissibleObjects & object): Path2D => {
      const c = paths.get(o);
      if (c?.v === version) return c.p;
      const p = new Path2D();
      geoPath(proj, p as unknown as CanvasRenderingContext2D)(o);
      paths.set(o, { v: version, p });
      return p;
    };
    const fetched = new Map<string, FC>(); // url → data, filled asynchronously
    const want = (url: string): FC | null => {
      if (!url) return null;
      const hit = fetched.get(url);
      if (!hit) void load(url).then((fc) => fc && (fetched.set(url, sphereSafe(fc)), schedule()));
      return hit ?? null;
    };
    let rain: { img: ImageData | null; warped: ImageBitmap | null; bucket: number } = {
      img: null,
      warped: null,
      bucket: -1,
    };
    let temps: { src: M.Temps | null; warped: ImageBitmap | null } = { src: null, warped: null };
    let hits: { x: number; y: number; r: number; pick: Pick; title: string; live?: boolean }[] = [];
    /** Country names in the UI language, by place id; rebuilt when the language changes. */
    let names: string[] = [];
    /** Point markers at the base projection, rebuilt when their data changes, never per frame. */
    type Mark = {
      x: number;
      y: number;
      r: number;
      fill: string;
      stroke?: string;
      pick?: Pick;
      title: string;
      /** Live feed text: the hover tip shows it translated. */
      live?: boolean;
      n?: string;
    };
    let marks: Mark[] = [], satMarks: Mark[] = [];
    const markAll = (fcx: FC | null, d: Dot, out: Mark[]) => {
      for (const f of fcx?.features ?? []) {
        if (f.geometry?.type !== "Point") continue;
        const p = f.properties ?? {}, xy = proj(f.geometry.coordinates as [number, number]);
        if (!xy) continue;
        const news = d.kind === "country" && p.n !== undefined;
        out.push({
          x: xy[0],
          y: xy[1],
          r: d.r(p),
          fill: d.fill(p),
          stroke: d.stroke,
          pick: d.kind ? { kind: d.kind, id: d.kind === "country" ? Number(p.id) : String(p.id) } as Pick : undefined,
          title: news ? L("{n} stories", { n: String(p.n) }) : String(p.title ?? ""),
          live: !!d.kind && LIVE.has(d.kind),
          n: news ? String(p.n) : undefined,
        });
      }
    };
    /** Tracked: reads only the cells of layers that are on. */
    const buildMarks = () => {
      const on = prefs.layers, out: Mark[] = [], st = sites.value?.fc;
      if (st) {
        for (const [kind, layer] of Object.entries(SITE_LAYER)) {
          if (on[layer]) {
            markAll({ ...st, features: st.features.filter((f) => f.properties?.kind === kind) }, {
              r: () => 2.6,
              fill: () => SITE[kind],
              kind: "site",
            }, out);
          }
        }
      }
      for (const [layer, fcOf, d] of DOTS) if (on[layer]) markAll(fcOf(), d, out);
      marks = out;
    };
    const buildSats = () => {
      const out: Mark[] = [];
      if (prefs.layers.sats) {
        const at = new Date();
        markAll(
          F.satPoints(sky.tles.flatMap((tle) => {
            const p = position(tle, at);
            return p ? [{ tle, p }] : [];
          })),
          {
            r: () => 2.2,
            fill: (p) => (p.group === "stations" ? "#ffd60a" : p.group === "military" ? "#ff453a" : "#e5e5ea"),
            kind: "sat",
          },
          out,
        );
      }
      satMarks = out;
    };
    /** All countries as one path: one fill and one stroke per frame instead of ~250 each. */
    let landCache: { fc: FC | null; v: number; p: Path2D | null } = { fc: null, v: -1, p: null };
    const landOf = (fc: FC) => {
      if (landCache.fc !== fc || landCache.v !== version) {
        const p = new Path2D();
        for (const f of fc.features) p.addPath(pathOf(f));
        landCache = { fc, v: version, p };
      }
      return landCache.p!;
    };
    const widths = new Map<string, number>();
    const widthOf = (t: string) => {
      let w = widths.get(t);
      if (w === undefined) widths.set(t, w = ctx.measureText(t).width);
      return w;
    };
    /** Countries by area at the base projection (px²), biggest first: labels claim space in that order. */
    let order: { fc: FC | null; v: number; list: { id: number; area: number }[] } = { fc: null, v: -1, list: [] };
    const labelOrder = (fc: FC) => {
      if (order.fc !== fc || order.v !== version) {
        const area = geoPath(proj);
        order = {
          fc,
          v: version,
          list: fc.features.map((f) => ({ id: Number(f.id), area: area.area(f) })).sort((a, b) => b.area - a.area),
        };
      }
      return order.list;
    };

    /** Pixel → lon/lat for the raster layers, at half the base resolution (the data is coarser than that: 4× fewer
     *  pixels to invert). Built once per canvas size, shared by rain and temperature. NaN = outside the map. */
    let lut: { v: number; w: number; h: number; lon: Float32Array; lat: Float32Array } | null = null;
    const grid = () => {
      if (lut?.v === version) return lut;
      const sc = rasterScale(W, H), w = Math.max(1, Math.round(W * sc)), h = Math.max(1, Math.round(H * sc));
      const lon = new Float32Array(w * h).fill(NaN),
        lat = new Float32Array(w * h).fill(NaN),
        px: [number, number] = [0, 0];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          [px[0], px[1]] = [(x + 0.5) / sc, (y + 0.5) / sc];
          const ll = proj.invert!(px);
          if (!ll || !(Math.abs(ll[0]) <= 180 && Math.abs(ll[1]) <= 90)) continue;
          const back = proj(ll); // invert happily answers outside the outline: round-trip to check
          if (!back || Math.abs(back[0] - px[0]) > 1 || Math.abs(back[1] - px[1]) > 1) continue;
          [lon[y * w + x], lat[y * w + x]] = ll;
        }
      }
      return lut = { v: version, w, h, lon, lat };
    };
    /** Paint a raster in Equal Earth: `fill` writes RGBA at `o` for one lon/lat. */
    const warp = (fill: (lon: number, lat: number, d: Uint8ClampedArray, o: number) => void) => {
      const g = grid(), out = new ImageData(g.w, g.h), d = out.data;
      for (let i = 0; i < g.w * g.h; i++) if (g.lon[i] === g.lon[i]) fill(g.lon[i], g.lat[i], d, i * 4); // skip NaN
      return createImageBitmap(out);
    };
    /** Rebuild the visible rasters; coalesced, so a resize drag or a burst of updates costs one pass. */
    let warpTimer = 0;
    const rewarp = () => {
      clearTimeout(warpTimer);
      warpTimer = setTimeout(() => {
        if (!W) return; // not laid out yet: resize() calls again
        const on = prefs.layers;
        if (on.temps && temps.src) {
          const t = temps.src.t;
          void warp((lon, lat, d, o) => {
            const v = M.sample(t, lat, lon);
            if (v === null) return;
            const c = M.tempColor(v);
            [d[o], d[o + 1], d[o + 2], d[o + 3]] = [c[0], c[1], c[2], 255];
          }).then((b) => (temps.warped = b, schedule()));
        }
        if (on.rain && rain.img) {
          const { data, width, height } = rain.img;
          void warp((lon, lat, d, o) => {
            const i = (Math.min(height - 1, Math.floor(((90 - lat) / 180) * height)) * width +
              Math.min(width - 1, Math.floor(((lon + 180) / 360) * width))) * 4;
            if (data[i + 3]) [d[o], d[o + 1], d[o + 2], d[o + 3]] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
          }).then((b) => (rain.warped = b, schedule()));
        }
      }, 120) as unknown as number;
    };
    const loadRain = (bucket: number) => {
      rain.bucket = bucket;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const c = new OffscreenCanvas(img.width, img.height), g = c.getContext("2d")!;
        g.drawImage(img, 0, 0);
        rain = { ...rain, img: g.getImageData(0, 0, img.width, img.height) };
        rewarp();
      };
      img.src = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap" +
        "&LAYERS=IMERG_Precipitation_Rate_30min&STYLES=&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=2048&HEIGHT=1024" +
        `&FORMAT=image/png&TRANSPARENT=true&b=${bucket}`;
    };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      dpr = devicePixelRatio || 1;
      [W, H] = [r.width, r.height];
      [canvas.width, canvas.height] = [Math.round(W * dpr), Math.round(H * dpr)];
      proj.fitExtent([[12, 12], [W - 12, H - 12]], { type: "Sphere" });
      version++;
      untrack(() => (buildMarks(), buildSats()));
      clamp();
      rewarp();
      schedule();
    };
    /** At 1× the whole world fits; zoomed in, the map edge never pulls past the canvas edge. */
    const clamp = () => {
      k = Math.max(1, Math.min(10, k));
      tx = Math.min(0, Math.max(W - W * k, tx));
      ty = Math.min(0, Math.max(H - H * k, ty));
    };

    let frame = 0;
    const schedule = () => (frame ||= requestAnimationFrame(() => (frame = 0, draw())));

    const draw = () =>
      untrack(() => {
        if (!W) return;
        const dark = isDark.value, on = prefs.layers, w = world.value;
        const ink = dark ? "#0b0d10" : "#ffffff";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * tx, dpr * ty);
        const lw = (px: number) => (ctx.lineWidth = px / k);
        const sphere = pathOf(SPHERE);
        ctx.fillStyle = dark ? "#0e1620" : "#dde6ee";
        ctx.fill(sphere);
        ctx.save();
        ctx.clip(sphere);
        if (on.temps && temps.warped) {
          (ctx.globalAlpha = 0.5, ctx.drawImage(temps.warped, 0, 0, W, H), ctx.globalAlpha = 1);
        }
        lw(0.5);
        ctx.strokeStyle = dark ? "#ffffff14" : "#00000012";
        ctx.stroke(pathOf(GRATICULE));
        // Countries: land, activity shading, borders, picked outline.
        const fc = w ? sphereSafe(w.fc) : null;
        const sc = scores.value, picked = view.pick?.kind === "country" ? view.pick.id : -1;
        const land = fc && landOf(fc);
        if (land) {
          ctx.fillStyle = on.temps && temps.warped ? (dark ? "#1f2a3655" : "#f7f8fa55") : dark ? "#1f2a36" : "#f7f8fa";
          ctx.fill(land);
          if (on.borders) {
            for (const f of fc.features) {
              const s = sc.get(Number(f.id))?.score ?? 0;
              if (s >= 15) (ctx.fillStyle = lerp(SCORE, s) + "3d", ctx.fill(pathOf(f)));
            }
          }
          lw(0.6);
          ctx.strokeStyle = dark ? "#ffffff30" : "#00000026";
          ctx.stroke(land);
        }
        if (on.rain && rain.warped) ctx.drawImage(rain.warped, 0, 0, W, H);
        if (on.night) {
          ctx.fillStyle = dark ? "#00081459" : "#00081429";
          ctx.fill(pathOf(nightOf(now.value)));
        }
        // Areas and lines.
        const areas = (
          fcx: FC | null,
          style: (p: Props) => [fill: string | null, stroke: string | null, width: number],
        ) => {
          for (const f of fcx?.features ?? []) {
            const [fill, stroke, width] = style(f.properties ?? {}), p = pathOf(f);
            if (fill) (ctx.fillStyle = fill, ctx.fill(p));
            if (stroke) (ctx.strokeStyle = stroke, lw(width), ctx.stroke(p));
          }
        };
        if (on.jam) areas(want(layers.jam.url), (p) => [P(p, "level") === 2 ? "#ff453a73" : "#ffd60a40", null, 0]);
        if (on.weather) {
          areas(want(alerts.weatherUrl), (p) => {
            const c = P(p, "severity") === 1 ? "#ff2d55" : "#ff9f0a";
            return [c + "38", c + "b3", 1];
          });
        }
        if (on.storms) {
          areas(want(meteo.stormsUrl), (p) =>
            p.part === "wind"
              ? [P(p, "kmh") >= 120 ? "#ff2d5533" : P(p, "kmh") >= 90 ? "#ff9f0a33" : "#ffd60a33", null, 0]
              : p.part === "cone"
              ? [dark ? "#ffffff14" : "#1d1d1f14", dark ? "#ffffff99" : "#1d1d1f99", 1]
              : [null, p.cat === "HU" ? "#ff2d55" : p.cat === "TS" ? "#ffd60a" : "#64d2ff", 2]);
        }
        if (on.cables) {
          areas(want(layers.cablesUrl), (p) => [null, String(p.color ?? "#5ac8fa") + "8c", 1]);
        }
        if (on.lanes) {
          const c = dark ? "#5ac8fa" : "#0a6fb5";
          areas(
            want("assets/lanes.geojson"),
            (
              p,
            ) => [
              null,
              c + (p.type === "Major" ? "8c" : p.type === "Middle" ? "66" : "40"),
              p.type === "Major" ? 1.6 : 1,
            ],
          );
        }
        if (on.advisories && fc) {
          for (const a of risk.advisories) {
            const f = fc.features.find((x) =>
              Number(x.id) === a.place
            );
            if (f && a.level >= 3) {
              (ctx.strokeStyle = a.level === 4 ? "#ff453a" : "#ff9f0a", lw(1.4), ctx.stroke(pathOf(f)));
            }
          }
        }
        if (picked >= 0 && fc) {
          const f = fc.features.find((x) => Number(x.id) === picked);
          if (f) (ctx.strokeStyle = dark ? "#ffffff" : "#1d1d1f", lw(1.8), ctx.stroke(pathOf(f)));
        }
        const sel = view.pick?.kind === "sat"
          ? sky.tles.find((t) => t.id === (view.pick as { id: string }).id)
          : undefined;
        if (on.sats && sel) {
          ctx.setLineDash([4 / k, 4 / k]);
          areas(F.lines(track(sel, new Date())), () => [null, dark ? "#ffffff73" : "#1d1d1f73", 1.2]);
          ctx.setLineDash([]);
        }
        ctx.restore();

        // Points in screen space: constant size at any zoom.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const screen = (lon: number, lat: number): [number, number] | null => {
          const p = proj([lon, lat]);
          return p ? [p[0] * k + tx, p[1] * k + ty] : null;
        };
        const next: typeof hits = [];
        for (const m of [...marks, ...satMarks]) {
          const x = m.x * k + tx, y = m.y * k + ty;
          if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
          ctx.beginPath();
          ctx.arc(x, y, m.r, 0, 2 * Math.PI);
          ctx.fillStyle = m.fill;
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = m.stroke ?? ink;
          ctx.stroke();
          if (m.n !== undefined) {
            ctx.fillStyle = "#fff";
            ctx.font = "10px system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(m.n, x, y);
          }
          if (m.pick) next.push({ x, y, r: m.r + 3, pick: m.pick, title: m.title, live: m.live });
        }
        // Temperature values once zoomed in.
        if (on.temps && temps.src && k >= 2.5) {
          ctx.font = "10px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          M.GRID.forEach(([lat, lon], i) => {
            const v = temps.src!.t[i], s = screen(lon, lat);
            if (v === null || !s) return;
            ctx.lineWidth = 3;
            ctx.strokeStyle = "#00000080";
            ctx.strokeText(`${Math.round(v)}°`, s[0], s[1]);
            ctx.fillStyle = "#fff";
            ctx.fillText(`${Math.round(v)}°`, s[0], s[1]);
          });
        }
        // Country names: big enough at this zoom, no overlaps, biggest first.
        if (fc) {
          ctx.font = "500 11px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const taken: [number, number, number, number][] = [];
          for (const { id, area } of labelOrder(fc)) {
            if (area * k * k < 900) break;
            const c = COUNTRIES[id], s = c && screen(c.lon, c.lat);
            if (!s || s[0] < 0 || s[1] < 0 || s[0] > W || s[1] > H) continue;
            const name = names[id] ?? c.name,
              half = widthOf(name) / 2 + 3,
              box: [number, number, number, number] = [
                s[0] - half,
                s[1] - 8,
                s[0] + half,
                s[1] + 8,
              ];
            if (taken.some((b) => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3])) continue;
            taken.push(box);
            ctx.lineWidth = 3;
            ctx.strokeStyle = dark ? "#0b0d10b3" : "#ffffffcc";
            ctx.strokeText(name, s[0], s[1]);
            ctx.fillStyle = dark ? "#c7d2de" : "#3a4a5c";
            ctx.fillText(name, s[0], s[1]);
          }
        }
        // Selection ring.
        const at = view.pick && view.pick.kind !== "country" ? locate(view.pick) : null;
        const s = at && screen(at[0], at[1]);
        if (s) {
          ctx.beginPath();
          ctx.arc(s[0], s[1], 14, 0, 2 * Math.PI);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = dark ? "#ffffff" : "#0a84ff";
          ctx.stroke();
        }
        hits = next.reverse(); // topmost first
      });

    // Redraw whenever anything drawn changes (each read inside subscribes).
    const disposers = [
      effect(() => void (buildMarks(), schedule())), // re-runs when a shown layer's data (or the layer mix) changes
      effect(() => {
        void prefs.lang;
        names = untrack(() => COUNTRIES.map((c) => C(c.name, c.iso)));
        schedule();
      }),
      effect(() => {
        void [isDark.value, prefs.layers, world.value, scores.value, view.pick, now.value, risk.advisories];
        void [alerts.weatherUrl, layers.jam.url, layers.cablesUrl, meteo.stormsUrl];
        schedule();
      }),
      effect(() => {
        const t = meteo.temps;
        if (t && t !== temps.src) untrack(() => (temps = { src: t, warped: null }, rewarp()));
      }),
      effect(() => {
        const b = Math.floor(now.value / 1_800_000);
        if (prefs.layers.rain && b !== rain.bucket) untrack(() => loadRain(b));
      }),
      effect(() => {
        if (prefs.layers.temps || prefs.layers.rain) untrack(rewarp);
      }),
      effect(() => {
        const l = prefs.layers;
        if (l.ports || l.bases || l.nuclear || l.spaceports || l.datacenters) void loadSites();
      }),
      effect(() => {
        void sky.tles;
        untrack(buildSats);
        schedule();
        if (!prefs.layers.sats) return;
        const id = setInterval(() => (buildSats(), schedule()), 2000); // satellites move
        return () => clearInterval(id);
      }),
      // Every select centers it in the free space between the panels (same as the other maps).
      effect(() => {
        void view.seq;
        const p = view.pick;
        if (p) untrack(() => flyTo(p));
      }),
    ];

    const flyTo = (p: Pick) => {
      const at = locate(p), base = at && proj(at);
      if (!base) return;
      const left = prefs.sidebar ? (prefs.tab === "tv" && !prefs.tv.floating ? 752 : 412) : 72;
      const right = view.pick ? 392 : 16;
      const k1 = Math.max(k, p.kind === "country" ? 2 : 3);
      const cx = left + (W - left - right) / 2, cy = H / 2;
      const [k0, x0, y0] = [k, tx, ty];
      const x1 = cx - base[0] * k1, y1 = cy - base[1] * k1, t0 = performance.now();
      const step = (t: number) => {
        const u = Math.min(1, (t - t0) / 450), e = 1 - (1 - u) ** 3;
        [k, tx, ty] = [k0 + (k1 - k0) * e, x0 + (x1 - x0) * e, y0 + (y1 - y0) * e];
        clamp();
        draw();
        if (u < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    // Interaction: wheel zoom about the cursor, drag to pan, click = pick, hover = name.
    const local = (e: MouseEvent): [number, number] => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const [x, y] = local(e), k1 = Math.max(1, Math.min(10, k * Math.exp(-e.deltaY * 0.0015)));
      [tx, ty] = [x - ((x - tx) / k) * k1, y - ((y - ty) / k) * k1];
      k = k1;
      clamp();
      schedule();
    }, { passive: false });
    let drag: { x: number; y: number; tx: number; ty: number; moved: boolean } | null = null;
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, tx, ty, moved: false };
    });
    canvas.addEventListener("pointermove", (e) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.hypot(dx, dy) > 3) drag.moved = true;
        [tx, ty] = [drag.tx + dx, drag.ty + dy];
        clamp();
        return schedule();
      }
      const [x, y] = local(e), h = hitAt(x, y), tip = tipRef.current;
      const label = h ? (h.live ? T(h.title) : h.title) : countryAt(x, y)?.name ?? "";
      canvas.style.cursor = label ? "pointer" : "";
      tip.textContent = label;
      tip.style.display = label ? "block" : "none";
      tip.style.transform = `translate(${x + 12}px, ${y + 12}px)`;
    });
    canvas.addEventListener("pointerup", (e) => {
      const was = drag;
      drag = null;
      if (!was || was.moved) return;
      const [x, y] = local(e), h = hitAt(x, y);
      if (h) return focus(h.pick);
      const c = countryAt(x, y);
      focus(c ? { kind: "country", id: c.id } : null);
    });
    canvas.addEventListener("pointerleave", () => (tipRef.current.style.display = "none"));
    const hitAt = (x: number, y: number) => hits.find((h) => Math.hypot(h.x - x, h.y - y) <= h.r);
    const countryAt = (x: number, y: number) => {
      const ll = proj.invert!([(x - tx) / k, (y - ty) / k]), w = world.peek();
      if (!ll || !w) return null;
      const back = proj(ll);
      if (!back || Math.hypot(back[0] - (x - tx) / k, back[1] - (y - ty) / k) > 1) return null;
      const id = w.where(ll[0], ll[1]);
      return id >= 0 && COUNTRIES[id] ? { id, name: names[id] ?? COUNTRIES[id].name } : null;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    onCleanup(() => {
      clearTimeout(warpTimer);
      ro.disconnect();
      disposers.forEach((d) => d());
      cancelAnimationFrame(frame);
    });
  });

  return (
    <div class="map equal" aria-label={L("World map, true size")}>
      <canvas ref={host} />
      <div ref={tipRef} class="eq-tip" />
    </div>
  );
}

const SPHERE: GeoSphere = { type: "Sphere" };
const GRATICULE = geoGraticule10();
let night: { at: number; f: GeoJSON.Feature } | null = null;
/** The night polygon, rebuilt at most each minute. It is half the sphere, so area can't tell its winding: it must
 *  not contain the point under the sun. */
const nightOf = (ms: number) => {
  if (!night || Math.abs(ms - night.at) > 60_000) {
    const f = nightPolygon(ms), sun = subsolar(ms);
    const flip = {
      ...f,
      geometry: { ...f.geometry, coordinates: f.geometry.coordinates.map((r) => [...r].reverse()) },
    };
    night = { at: ms, f: geoContains(f, sun) ? flip : f };
  }
  return night.f;
};
