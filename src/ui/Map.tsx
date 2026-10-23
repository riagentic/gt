// The map: one MapLibre WebGL canvas, globe ⇄ flat. Cells → effects → setData.
import type * as GeoJSON from "geojson";
import type { JSX } from "aio";
import { effect, onCleanup, onMount, untrack, useRef } from "aio/air";
import maplibregl, { type GeoJSONSource, type MapGeoJSONFeature } from "maplibre-gl";
import { air } from "../cell/air.ts";
import { alerts } from "../cell/alerts.ts";
import { atlas } from "../cell/atlas.ts";
import { hazards } from "../cell/hazards.ts";
import { layers } from "../cell/layers.ts";
import { news } from "../cell/news.ts";
import { risk } from "../cell/risk.ts";
import { sky } from "../cell/sky.ts";
import { type LayerId, prefs } from "../cell/prefs.ts";
import { type Pick, view } from "../cell/view.ts";
import { C, L, T } from "./i18n.ts";
import { focus } from "./rows.tsx";
import { THREATS } from "../lib/alerts.ts";
import * as F from "../lib/features.ts";
import * as M from "../lib/meteo.ts";
import { meteo } from "../cell/meteo.ts";
import { position, track } from "../lib/orbit.ts";
import { mainBounds } from "../lib/geo.ts";
import { nightPolygon } from "../lib/sun.ts";
import * as P from "./pick.ts";
import { locate, satellite } from "./pick.ts";
import { dark as isDark, loadSites, now, scores, sites, world } from "./store.ts";

const STYLE = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  light: "https://tiles.openfreemap.org/styles/positron",
};
const SOURCES = [
  "countries",
  "night",
  "weather",
  "jam",
  "lanes",
  "cables",
  "infra",
  "climate",
  "temps-pts",
  "storms",
  "radiation",
  "places",
  "traffic",
  "weather-pts",
  "protests",
  "sirens",
  "events",
  "quakes",
  "health",
  "news",
  "track",
  "sats",
  "air",
  "squawks",
  "pick",
] as const;
type Src = (typeof SOURCES)[number];

const KIND_COLOR = [
  "match",
  ["get", "kind"],
  "wildfire",
  "#ff7a45",
  "storm",
  "#5ac8fa",
  "volcano",
  "#ff453a",
  "flood",
  "#409cff",
  "drought",
  "#d4a373",
  "ice",
  "#a5f3fc",
  "#bf5af2",
];

// Which map layers each user-facing layer toggle controls.
const GROUPS: Record<LayerId, string[]> = {
  borders: [], // countries-fill stays rendered (it is the click target); see applyLayers
  night: ["night"],
  cables: ["cables"],
  places: ["places", "places-label", "traffic"],
  events: ["events-halo", "events"],
  quakes: ["quakes"],
  news: ["news", "news-count"],
  air: ["air"],
  sats: ["track", "sats"],
  jam: ["jam"],
  advisories: ["advisories"],
  health: ["health"],
  weather: ["weather-fill", "weather-line", "weather-pts"],
  protests: ["protests"],
  sirens: ["sirens-halo", "sirens"],
  squawks: ["squawks"],
  lanes: ["lanes"],
  ports: ["ports"],
  bases: ["bases"],
  nuclear: ["nuclear"],
  spaceports: ["spaceports"],
  datacenters: ["datacenters"],
  radiation: ["radiation"],
  climate: ["climate", "climate-label"],
  rain: ["rain"],
  temps: ["temps-img", "temps-label"],
  storms: ["storms-wind", "storms-cone", "storms-cone-line", "storms-track"],
};
/** NASA GIBS IMERG 30-min rain rate; "default" = the latest half hour. `b` busts the tile cache each half hour. */
const rainTiles = (bucket: number) => [
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate_30min/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png?b=${bucket}`,
];
const MERC_LAT = 85.051129;
const TEMP_CORNERS: [[number, number], [number, number], [number, number], [number, number]] = [
  [-180, MERC_LAT],
  [180, MERC_LAT],
  [180, -MERC_LAT],
  [-180, -MERC_LAT],
];
/** The temperature grid as a smooth image in Mercator rows (an image source is stretched linearly in Mercator). */
function tempImage(t: (number | null)[]): string {
  const W = 360, H = 360, c = document.createElement("canvas");
  [c.width, c.height] = [W, H];
  const g = c.getContext("2d")!, img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const lat = new maplibregl.MercatorCoordinate(0, (y + 0.5) / H).toLngLat().lat;
    for (let x = 0; x < W; x++) {
      const v = M.sample(t, lat, -180 + ((x + 0.5) * 360) / W), i = (y * W + x) * 4;
      if (v === null) continue;
      const [r, gg, b] = M.tempColor(v);
      [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] = [r, gg, b, 255];
    }
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}
const SITES = { ports: "port", bases: "base", nuclear: "nuclear", spaceports: "spaceport", datacenters: "datacenter" };
const SITE_COLOR: Record<string, string> = {
  ports: "#5ac8fa",
  bases: "#8e8e93",
  nuclear: "#d4e157",
  spaceports: "#ffffff",
  datacenters: "#bf5af2",
};
// Topmost first: what the pointer hits when markers overlap.
const CLICKABLE = [
  "squawks",
  "air",
  "sats",
  "sirens",
  "health",
  "quakes",
  "events",
  "weather-pts",
  "protests",
  "news",
  "traffic",
  "places",
  "radiation",
  "climate",
  "spaceports",
  "nuclear",
  "datacenters",
  "bases",
  "ports",
  "weather-fill",
];
/** Layers whose hover titles are live feed text (translated once by aipro when the UI is not English). */
const LIVE = new Set(["sirens", "quakes", "events", "weather-pts", "weather-fill", "protests"]);
const KIND_OF: Record<string, Pick["kind"]> = {
  squawks: "plane",
  sirens: "siren",
  "weather-pts": "weather",
  "weather-fill": "weather",
  protests: "protest",
  traffic: "chokepoint",
  radiation: "sensor",
  climate: "anomaly",
  spaceports: "site",
  nuclear: "site",
  datacenters: "site",
  bases: "site",
  ports: "site",
  news: "country",
  quakes: "quake",
  events: "event",
  air: "plane",
  sats: "sat",
  health: "outbreak",
  places: "place",
};
const SCORE_COLOR = [
  "interpolate",
  ["linear"],
  ["coalesce", ["feature-state", "score"], 0],
  0,
  "rgba(0,0,0,0)",
  15,
  "#3a7bd5",
  40,
  "#f5a524",
  65,
  "#ff6b3d",
  85,
  "#ff2d55",
];
// Target zoom per kind of point: close enough to see the place, wide enough for context.
const ZOOM: Partial<Record<Pick["kind"], number>> = {
  quake: 5,
  event: 5,
  place: 5,
  plane: 6.5,
  sat: 2.5,
  siren: 7,
  protest: 6,
  site: 7,
  chokepoint: 5.5,
  sensor: 7,
  anomaly: 3.5,
  weather: 4,
};
const SAT_COLOR = [
  "match",
  ["get", "group"],
  "stations",
  "#ffd60a",
  "military",
  "#ff453a",
  "gnss",
  "#64d2ff",
  "#e5e5ea",
];

function planeIcon(): ImageData {
  // CPU-backed: a GPU canvas would stall the page reading the pixels back (~0.5 s on software GL).
  const c = new OffscreenCanvas(32, 32), g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#fff";
  g.beginPath();
  g.moveTo(16, 2), g.lineTo(19, 12), g.lineTo(30, 18), g.lineTo(30, 21), g.lineTo(19, 18), g.lineTo(18, 26);
  g.lineTo(22, 29), g.lineTo(22, 31), g.lineTo(16, 29), g.lineTo(10, 31), g.lineTo(10, 29), g.lineTo(14, 26);
  g.lineTo(13, 18), g.lineTo(2, 21), g.lineTo(2, 18), g.lineTo(13, 12);
  g.closePath(), g.fill();
  return g.getImageData(0, 0, 32, 32);
}

function install(
  map: maplibregl.Map,
  data: Map<Src, GeoJSON.FeatureCollection>,
  dark: boolean,
  extra: { temps: string },
): void {
  for (const id of SOURCES) {
    if (!map.getSource(id)) {
      map.addSource(id, {
        type: "geojson",
        data: data.get(id) ?? F.empty(),
        ...(id === "countries" ? {} : { generateId: true }),
      });
    }
  }
  if (!map.hasImage("plane")) map.addImage("plane", planeIcon(), { sdf: true });
  if (!map.getSource("rain")) {
    map.addSource("rain", {
      type: "raster",
      tiles: rainTiles(Math.floor(Date.now() / 1_800_000)),
      tileSize: 256,
      maxzoom: 6,
      attribution: "Rain: NASA GIBS / IMERG",
    });
  }
  if (!map.getSource("temps-img") && extra.temps) {
    map.addSource("temps-img", { type: "image", url: extra.temps, coordinates: TEMP_CORNERS });
  }
  const below = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
  const ink = dark ? "#0b0d10" : "#ffffff";
  const add = (l: maplibregl.LayerSpecification, under?: string) => map.getLayer(l.id) || map.addLayer(l, under);

  add({
    id: "countries-fill",
    type: "fill",
    source: "countries",
    paint: {
      "fill-color": SCORE_COLOR as never,
      "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.42, 0.24],
    },
  }, below);
  add({
    id: "countries-line",
    type: "line",
    source: "countries",
    paint: {
      "line-color": dark ? "#ffffff" : "#1d1d1f",
      "line-opacity": [
        "case",
        ["boolean", ["feature-state", "picked"], false],
        0.9,
        ["boolean", ["feature-state", "hover"], false],
        0.45,
        0,
      ],
      "line-width": ["case", ["boolean", ["feature-state", "picked"], false], 1.8, 1],
    },
  }, below);
  add({
    id: "advisories",
    type: "line",
    source: "countries",
    paint: {
      "line-color": ["match", ["coalesce", ["feature-state", "adv"], 0], 4, "#ff453a", "#ff9f0a"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1.2, 5, 2.4],
      "line-opacity": ["case", [">=", ["coalesce", ["feature-state", "adv"], 0], 3], 0.9, 0],
    },
  }, below);
  map.getSource("temps-img") && add({
    id: "temps-img",
    type: "raster",
    source: "temps-img",
    paint: { "raster-opacity": 0.45, "raster-fade-duration": 0 },
  }, "countries-fill"); // just above the base map, under every overlay
  add({ id: "rain", type: "raster", source: "rain", paint: { "raster-opacity": 0.85 } }, "countries-fill");
  add({
    id: "storms-wind",
    type: "fill",
    source: "storms",
    filter: ["==", ["get", "part"], "wind"],
    paint: {
      "fill-color": ["step", ["get", "kmh"], "#ffd60a", 90, "#ff9f0a", 120, "#ff2d55"],
      "fill-opacity": 0.2,
    },
  }, below);
  add({
    id: "storms-cone",
    type: "fill",
    source: "storms",
    filter: ["==", ["get", "part"], "cone"],
    paint: { "fill-color": dark ? "#ffffff" : "#1d1d1f", "fill-opacity": 0.08 },
  }, below);
  add({
    id: "storms-cone-line",
    type: "line",
    source: "storms",
    filter: ["==", ["get", "part"], "cone"],
    paint: {
      "line-color": dark ? "#ffffff" : "#1d1d1f",
      "line-opacity": 0.6,
      "line-width": 1,
      "line-dasharray": [3, 2],
    },
  }, below);
  add({
    id: "storms-track",
    type: "line",
    source: "storms",
    filter: ["==", ["get", "part"], "track"],
    paint: {
      "line-color": ["match", ["get", "cat"], "HU", "#ff2d55", "TS", "#ffd60a", "#64d2ff"],
      "line-width": 2,
    },
  });
  add({
    id: "temps-label",
    type: "symbol",
    source: "temps-pts",
    minzoom: 2.5,
    layout: {
      "text-field": ["get", "label"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 10,
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#ffffff", "text-halo-color": "rgba(0,0,0,0.55)", "text-halo-width": 1 },
  });
  add({
    id: "jam",
    type: "fill",
    source: "jam",
    paint: {
      "fill-color": ["match", ["get", "level"], 2, "#ff453a", "#ffd60a"],
      "fill-opacity": ["match", ["get", "level"], 2, 0.45, 0.25],
      "fill-outline-color": "rgba(0,0,0,0)",
    },
  }, below);
  add({
    id: "night",
    type: "fill",
    source: "night",
    paint: { "fill-color": "#000814", "fill-opacity": dark ? 0.35 : 0.16 },
  }, below);
  add({
    id: "cables",
    type: "line",
    source: "cables",
    paint: {
      "line-color": ["get", "color"],
      "line-opacity": 0.55,
      "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.6, 6, 1.6],
    },
  }, below);
  add({
    id: "places",
    type: "circle",
    source: "places",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 3, 6, 6],
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-width": 1.6,
      "circle-stroke-color": ["match", ["get", "kind"], "chokepoint", "#64d2ff", "#ff9f0a"],
    },
  });
  add({
    id: "places-label",
    type: "symbol",
    source: "places",
    minzoom: 3,
    layout: {
      "text-field": ["get", "title"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
      "text-offset": [0, 1.2],
      "text-anchor": "top",
    },
    paint: { "text-color": dark ? "#9fb3c8" : "#3a4a5c", "text-halo-color": ink, "text-halo-width": 1.2 },
  });
  add({
    id: "events-halo",
    type: "circle",
    source: "events",
    filter: [">", ["get", "level"], 0],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 9, 6, 16],
      "circle-color": ["match", ["get", "level"], 2, "#ff453a", "#ff9f0a"],
      "circle-opacity": 0.22,
      "circle-blur": 0.4,
    },
  });
  add({
    id: "events",
    type: "circle",
    source: "events",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 3, 6, 6],
      "circle-color": KIND_COLOR as never,
      "circle-stroke-width": 1,
      "circle-stroke-color": ink,
    },
  });
  add({
    id: "quakes",
    type: "circle",
    source: "quakes",
    paint: {
      "circle-radius": ["interpolate", ["exponential", 1.6], ["get", "mag"], 2.5, 2.5, 5, 6, 7, 16, 9, 30],
      "circle-color": [
        "interpolate",
        ["linear"],
        ["get", "age"],
        0,
        "#ff375f",
        6,
        "#ff9f0a",
        48,
        "#ffd60a",
        168,
        "#8e8e93",
      ],
      "circle-opacity": 0.8,
      "circle-stroke-width": 1,
      "circle-stroke-color": ink,
    },
  });
  add({
    id: "news",
    type: "circle",
    source: "news",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "n"]], 1, 6, 4, 11, 8, 18],
      "circle-color": "#0a84ff",
      "circle-opacity": 0.78,
      "circle-stroke-width": 1,
      "circle-stroke-color": "rgba(255,255,255,0.5)",
    },
  });
  add({
    id: "news-count",
    type: "symbol",
    source: "news",
    layout: {
      "text-field": ["to-string", ["get", "n"]],
      "text-font": ["Noto Sans Regular"],
      "text-size": 10,
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#ffffff" },
  });
  add({
    id: "air",
    type: "symbol",
    source: "air",
    layout: {
      "icon-image": "plane",
      "icon-size": ["interpolate", ["linear"], ["zoom"], 1, 0.38, 6, 0.65],
      "icon-rotate": ["get", "hdg"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
    },
    paint: { "icon-color": "#30d158", "icon-halo-color": ink, "icon-halo-width": 1 },
  });
  add({
    id: "health",
    type: "circle",
    source: "health",
    paint: {
      "circle-radius": 6,
      "circle-color": "#bf5af2",
      "circle-translate": [12, 10],
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ffffff",
    },
  });
  add({
    id: "track",
    type: "line",
    source: "track",
    paint: {
      "line-color": dark ? "#ffffff" : "#1d1d1f",
      "line-opacity": 0.45,
      "line-width": 1.2,
      "line-dasharray": [2, 2],
    },
  });
  add({
    id: "sats",
    type: "circle",
    source: "sats",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2.2, 6, 4],
      "circle-color": SAT_COLOR as never,
      "circle-stroke-width": 0.8,
      "circle-stroke-color": ink,
    },
  });
  add({
    id: "weather-fill",
    type: "fill",
    source: "weather",
    paint: {
      "fill-color": ["match", ["get", "severity"], 1, "#ff2d55", "#ff9f0a"],
      "fill-opacity": 0.22,
    },
  }, below);
  add({
    id: "weather-line",
    type: "line",
    source: "weather",
    paint: {
      "line-color": ["match", ["get", "severity"], 1, "#ff2d55", "#ff9f0a"],
      "line-width": 1,
      "line-opacity": 0.7,
    },
  }, below);
  add({
    id: "lanes",
    type: "line",
    source: "lanes",
    paint: {
      "line-color": dark ? "#5ac8fa" : "#0a6fb5",
      "line-opacity": ["match", ["get", "type"], "Major", 0.55, "Middle", 0.4, 0.25],
      // zoom may only drive a top-level interpolate: lane class goes inside each stop.
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        1,
        ["match", ["get", "type"], "Major", 1.6, "Middle", 1, 0.6],
        6,
        ["match", ["get", "type"], "Major", 4, "Middle", 2.4, 1.4],
      ],
    },
  }, below);
  for (const [layer, kind] of Object.entries(SITES)) {
    add({
      id: layer,
      type: "circle",
      source: "infra",
      filter: ["==", ["get", "kind"], kind],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2.4, 6, 5],
        "circle-color": SITE_COLOR[layer],
        "circle-opacity": 0.9,
        "circle-stroke-width": 0.8,
        "circle-stroke-color": dark ? ink : "rgba(0,0,0,0.6)",
      },
    }, "places");
  }
  add({
    id: "climate",
    type: "circle",
    source: "climate",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["abs", ["get", "delta"]], 0, 7, 3, 12, 8, 18],
      "circle-color": [
        "interpolate",
        ["linear"],
        ["get", "delta"],
        -6,
        "#0a84ff",
        -1.5,
        "#64d2ff",
        0,
        "#8e8e93",
        1.5,
        "#ff9f0a",
        6,
        "#ff2d55",
      ],
      "circle-opacity": 0.55,
    },
  }, "places");
  add({
    id: "climate-label",
    type: "symbol",
    source: "climate",
    layout: {
      "text-field": ["get", "label"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 10,
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#ffffff", "text-halo-color": "rgba(0,0,0,0.5)", "text-halo-width": 1 },
  }, "places");
  add({
    id: "radiation",
    type: "circle",
    source: "radiation",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2.5, 6, 5],
      // CPM ≈ 0.003 µSv/h per count (LND 7317/7318): ~30–60 is normal background, 300+ is notable.
      "circle-color": [
        "interpolate",
        ["linear"],
        ["get", "cpm"],
        30,
        "#30d158",
        100,
        "#ffd60a",
        300,
        "#ff9f0a",
        1000,
        "#ff2d55",
      ],
      "circle-stroke-width": 0.8,
      "circle-stroke-color": ink,
    },
  }, "places");
  add({
    id: "traffic",
    type: "symbol",
    source: "traffic",
    layout: {
      "text-field": ["concat", ["get", "label"], " ⛴"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 10.5,
      "text-offset": [0, -1.3],
      "text-allow-overlap": true,
    },
    paint: { "text-color": dark ? "#64d2ff" : "#0a6fb5", "text-halo-color": ink, "text-halo-width": 1.2 },
  }, "events-halo");
  add({
    id: "protests",
    type: "circle",
    source: "protests",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "n"]], 1, 4, 3, 8, 6, 14],
      "circle-color": "#ffcc00",
      "circle-opacity": 0.75,
      "circle-stroke-width": 1,
      "circle-stroke-color": ink,
    },
  }, "events-halo");
  add({
    id: "weather-pts",
    type: "circle",
    source: "weather-pts",
    paint: {
      "circle-radius": 6,
      "circle-color": ["match", ["get", "severity"], 1, "#ff2d55", "#ff9f0a"],
      "circle-translate": [-12, 10],
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ffffff",
    },
  }, "events-halo");
  add({
    id: "sirens-halo",
    type: "circle",
    source: "sirens",
    filter: ["<", ["get", "age"], 1],
    paint: { "circle-radius": 14, "circle-color": "#ff2d55", "circle-opacity": 0.25, "circle-blur": 0.5 },
  });
  add({
    id: "sirens",
    type: "circle",
    source: "sirens",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 2.5, 8, 6],
      "circle-color": ["interpolate", ["linear"], ["get", "age"], 0, "#ff2d55", 24, "#ff9f0a", 168, "#8e8e93"],
      "circle-stroke-width": 0.8,
      "circle-stroke-color": ink,
    },
  });
  add({
    id: "squawks",
    type: "symbol",
    source: "squawks",
    layout: {
      "icon-image": "plane",
      "icon-size": ["interpolate", ["linear"], ["zoom"], 1, 0.5, 6, 0.8],
      "icon-rotate": ["get", "hdg"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
    },
    paint: { "icon-color": "#ff2d55", "icon-halo-color": "#ffffff", "icon-halo-width": 1.5 },
  });
  add({
    id: "pick",
    type: "circle",
    source: "pick",
    paint: {
      "circle-radius": 14,
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-width": 2.5,
      "circle-stroke-color": dark ? "#ffffff" : "#0a84ff",
    },
  });
}

/** Zoom-out limits, from the canvas height h. Flat: the world is 512·2^z px tall, so it may never be shorter than the
 *  canvas, and the center stays far enough from the poles that no blank band shows; sideways it repeats (world copies).
 *  Globe: diameter 512·2^z/π px; stop when it spans ~55% of h. */
const minZoom = (globe: boolean, h: number) => Math.log2(((globe ? 0.55 * Math.PI : 1) * h) / 512);
const limits = (map: maplibregl.Map, globe: boolean) => (c: maplibregl.LngLat, zoom: number) => {
  const h = map.getContainer().clientHeight, z = Math.max(minZoom(globe, h), zoom);
  if (globe) return { center: new maplibregl.LngLat(c.wrap().lng, Math.max(-85, Math.min(85, c.lat))), zoom: z };
  const half = h / (2 * 512 * 2 ** z); // half the canvas height, as a fraction of the world's height
  const y = Math.max(half, Math.min(1 - half, maplibregl.MercatorCoordinate.fromLngLat(c).y));
  return {
    center: new maplibregl.LngLat(c.wrap().lng, new maplibregl.MercatorCoordinate(0, y).toLngLat().lat),
    zoom: z,
  };
};

export function MapView(): JSX.Element {
  const host = useRef<HTMLDivElement>(null!);

  onMount(() => {
    const data = new Map<Src, GeoJSON.FeatureCollection>();
    let dark = isDark.peek();
    const gl = document.createElement("canvas").getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    // Software GL (SwiftShader/llvmpipe) makes every map frame slow: say which renderer we got, once.
    if (gl && info) console.info("[map] WebGL renderer:", gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
    if (!gl) {
      host.current.innerHTML = `<p class="nogl">${
        L("This map needs WebGL 2. Enable hardware acceleration and restart.")
      }</p>`;
      return;
    }
    const map = new maplibregl.Map({
      container: host.current,
      style: STYLE[dark ? "dark" : "light"],
      center: [30, 28],
      zoom: 2.1,
      attributionControl: { compact: true },
      maxPitch: 0,
      renderWorldCopies: false,
    });
    const put = (id: Src, fc: GeoJSON.FeatureCollection) => {
      data.set(id, fc);
      (map.getSource(id) as GeoJSONSource | undefined)?.setData(fc);
    };
    const disposers: (() => void)[] = [];
    const watch = (fn: () => void) => disposers.push(effect(fn));
    let ready = false;
    let scored: number[] = [];
    let picked = -1;
    let advised: number[] = [];
    let jamUrl = "";
    let weatherUrl = "";
    let stormsUrl = "";
    const extra = { temps: "" };
    /** Fetch a GeoJSON URL into a source once it is both set and visible; refetch when the URL changes. */
    const lazy = (src: Src, url: string, on: boolean, last: () => string, keep: (u: string) => void) => {
      if (!url || !on || url === last()) return;
      keep(url);
      fetch(url).then((r) => r.json()).then((fc) => put(src, fc)).catch(() => keep(""));
    };

    const applyScores = () => {
      if (!ready || !map.getSource("countries")) return;
      for (const id of scored) map.setFeatureState({ source: "countries", id }, { score: 0 });
      scored = [...scores.peek()].map((
        [id, a],
      ) => (map.setFeatureState({ source: "countries", id }, { score: a.score }), id));
    };
    const applyAdvisories = () => {
      if (!ready || !map.getSource("countries")) return;
      for (const id of advised) map.setFeatureState({ source: "countries", id }, { adv: 0 });
      advised = untrack(() => risk.advisories).map((a) => (
        map.setFeatureState({ source: "countries", id: a.place }, { adv: a.level }), a.place
      ));
    };
    const applyPick = (p: Pick | null) => {
      if (!ready) return;
      if (picked >= 0) map.setFeatureState({ source: "countries", id: picked }, { picked: false });
      picked = p?.kind === "country" ? p.id : -1;
      if (picked >= 0) map.setFeatureState({ source: "countries", id: picked }, { picked: true });
      const at = p && p.kind !== "country" ? locate(p) : null;
      put("pick", at ? F.single(at[0], at[1]) : F.empty());
    };
    const applyLayers = () => {
      if (!ready) return;
      const on = prefs.layers;
      for (const [k, ids] of Object.entries(GROUPS)) {
        for (const id of ids) {
          map.getLayer(id) && map.setLayoutProperty(id, "visibility", on[k as LayerId] ? "visible" : "none");
        }
      }
      const hover = ["boolean", ["feature-state", "hover"], false];
      map.setPaintProperty(
        "countries-fill",
        "fill-opacity",
        on.borders ? ["case", hover, 0.42, 0.24] : ["case", hover, 0.1, 0],
      );
      map.setPaintProperty(
        "countries-fill",
        "fill-color",
        on.borders ? SCORE_COLOR : (dark ? "#ffffff" : "#000000"),
      );
    };
    const applyProjection = () => {
      if (!ready || prefs.projection === "equal") return; // Equal Earth is its own canvas (EqualMap)
      const globe = prefs.projection === "globe";
      map.resize(); // it was hidden while Equal Earth showed
      map.setProjection({ type: globe ? "globe" : "mercator" });
      map.setRenderWorldCopies(!globe);
      map.setTransformConstrain(limits(map, globe));
      map.setSky({
        "sky-color": dark ? "#0b0d10" : "#eef1f5",
        "horizon-color": dark ? "#1d3557" : "#bcd4f0",
        "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.7, 5, 0.5, 7, 0],
      });
    };

    map.on("error", (e) => console.error("[map]", e.error?.message ?? e));
    // The base styles name a few POI icons (circle-11 …) their sprite lacks: an empty image keeps the console quiet.
    map.on(
      "styleimagemissing",
      (e) => map.hasImage(e.id) || map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) }),
    );
    map.on("style.load", () => {
      install(map, data, dark, extra);
      ready = true;
      applyProjection();
      applyLayers();
      applyScores();
      applyAdvisories();
      applyPick(view.pick);
    });

    // cells → sources
    watch(() => {
      const w = world.value;
      if (w) put("countries", w.fc), queueMicrotask(() => (applyScores(), applyAdvisories()));
    });
    watch(() => put("news", F.newsPoints(news.stories, now.value)));
    watch(() => put("quakes", F.quakePoints(hazards.quakes, prefs.minMag, now.value)));
    watch(() => put("events", F.eventPoints(hazards.events)));
    watch(() => put("air", F.planePoints(air.planes)));
    watch(() => put("night", { type: "FeatureCollection", features: [nightPolygon(now.value)] }));
    put("places", F.placePoints());
    watch(() => {
      const url = layers.cablesUrl;
      if (!url || !prefs.layers.cables || data.has("cables")) return;
      fetch(url).then((r) => r.json()).then((fc) => put("cables", fc)).catch(() => {});
    });
    watch(() => (scores.value, applyScores()));
    watch(() => (risk.advisories, applyAdvisories()));
    watch(() => put("health", F.healthPoints(risk.outbreaks, now.value)));
    watch(() => {
      const url = layers.jam.url;
      if (!url || !prefs.layers.jam || data.get("jam")?.features.length && jamUrl === url) return;
      jamUrl = url;
      fetch(url).then((r) => r.json()).then((fc) => put("jam", fc)).catch(() => {});
    });
    watch(() => {
      const on = prefs.layers.weather;
      lazy("weather", alerts.weatherUrl, on, () => weatherUrl, (u) => (weatherUrl = u));
    });
    watch(() => put("weather-pts", F.weatherPoints(alerts.weather)));
    watch(() => {
      const on = prefs.layers.storms;
      lazy("storms", meteo.stormsUrl, on, () => stormsUrl, (u) => (stormsUrl = u));
    });
    watch(() => {
      const t = meteo.temps;
      if (!t || !prefs.layers.temps) return; // built on demand: the image costs a pass over 130k pixels
      put("temps-pts", M.tempPoints(t.t));
      extra.temps = tempImage(t.t);
      const src = map.getSource("temps-img") as maplibregl.ImageSource | undefined;
      if (src) src.updateImage({ url: extra.temps, coordinates: TEMP_CORNERS });
      else if (ready) install(map, data, dark, extra), applyLayers(); // first image: add its source + layer
    });
    // New rain frame every half hour: swap the tile URL (the "latest" time keeps its URL, so bust the cache).
    let rainBucket = Math.floor(Date.now() / 1_800_000);
    watch(() => {
      const b = Math.floor(now.value / 1_800_000);
      if (b === rainBucket || !ready) return;
      rainBucket = b;
      (map.getSource("rain") as maplibregl.RasterTileSource | undefined)?.setTiles(rainTiles(b));
    });
    watch(() => put("sirens", F.sirenPoints(alerts.sirens, now.value, (t) => THREATS[t] ?? "Alert")));
    watch(() => put("protests", F.protestPoints(alerts.protests)));
    watch(() => put("squawks", F.squawkPoints(alerts.squawks)));
    watch(() => put("traffic", F.trafficPoints(atlas.traffic)));
    watch(() => put("radiation", F.sensorPoints(atlas.radiation)));
    watch(() => put("climate", F.anomalyPoints(atlas.climate)));
    watch(() => {
      const l = prefs.layers;
      if (l.ports || l.bases || l.nuclear || l.spaceports || l.datacenters) void loadSites();
      const fc = sites.value?.fc;
      if (fc && !data.has("infra")) put("infra", fc);
    });
    let lanesAsked = false;
    watch(() => {
      if (!prefs.layers.lanes || lanesAsked) return;
      lanesAsked = true;
      fetch("assets/lanes.geojson").then((r) => r.json()).then((fc) => put("lanes", fc)).catch(
        () => (lanesAsked = false),
      );
    });
    // Satellites move ~7 km/s: re-propagate every 2 s while the layer is on.
    watch(() => {
      const tles = sky.tles, on = prefs.layers.sats, sel = view.pick?.kind === "sat" ? view.pick.id : null;
      if (!on) return put("sats", F.empty()), put("track", F.empty());
      const chosen = sel ? satellite(sel) : undefined;
      const tick = () => {
        const at = new Date();
        put(
          "sats",
          F.satPoints(tles.flatMap((tle) => {
            const p = position(tle, at);
            return p ? [{ tle, p }] : [];
          })),
        );
        if (chosen) {
          const p = position(chosen, at);
          if (p) put("pick", F.single(p.lon, p.lat));
        }
      };
      put("track", chosen ? F.lines(track(chosen, new Date())) : F.empty());
      tick();
      const id = setInterval(tick, 2000);
      return () => clearInterval(id);
    });
    watch(() => (prefs.layers, applyLayers()));
    watch(() => (prefs.projection, applyProjection()));
    watch(() => applyPick(view.pick));
    // Camera: every select centers the picked thing in the free space between the panels and zooms to fit it.
    // One controller, so the panel-padding ease below can't cancel a flight in progress.
    let flying = false;
    map.on("moveend", () => (flying = false));
    // Free space between the panels; the TV tab doubles the sidebar (see .sidebar.wide).
    const padding = () => ({
      left: prefs.sidebar ? (prefs.tab === "tv" && !prefs.tv.floating ? 752 : 412) : 72,
      right: view.pick ? 392 : 16,
      top: 24,
      bottom: 24,
    });
    const fly = (p: Pick) => {
      const place = p.kind === "country"
        ? p.id
        : p.kind === "story"
        ? P.story(p.id)?.places[0]
        : p.kind === "outbreak"
        ? P.outbreak(p.id)?.places[0]
        : undefined;
      const shape = place !== undefined ? world.peek()?.fc.features.find((f) => Number(f.id) === place) : undefined;
      const pad = padding();
      let target: { center: maplibregl.LngLatLike; zoom: number } | undefined;
      if (shape) {
        // fitBounds adds its padding ON TOP of the map's own, so solve the camera under the final panel layout:
        // swap the padding in, measure, swap it back — all before the next frame, so nothing visibly jumps.
        const prev = map.getPadding();
        map.setPadding(pad);
        const cam = map.cameraForBounds(mainBounds(shape), { padding: 24, maxZoom: 5.5 });
        map.setPadding(prev);
        if (cam?.center) target = { center: cam.center, zoom: cam.zoom ?? 4 };
      } else {
        const at = locate(p);
        if (at) target = { center: at, zoom: ZOOM[p.kind] ?? 5 };
      }
      if (!target) return;
      map.flyTo({ ...target, padding: pad, duration: 1600 });
      flying = true; // after the call: starting a flight ends the previous ease, whose moveend clears the flag
    };
    watch(() => {
      void view.seq; // re-center on every select, the same item included
      const p = view.pick;
      if (p && ready) untrack(() => fly(p));
    });
    watch(() => {
      const pad = padding();
      if (!flying) map.easeTo({ padding: pad, duration: 300 });
    });
    watch(() => {
      if (isDark.value === dark) return;
      dark = isDark.value;
      ready = false;
      map.setStyle(STYLE[dark ? "dark" : "light"]);
    });

    // interaction
    const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "tip", offset: 10 });
    let hover: number | null = null;
    const setHover = (id: number | null) => {
      if (hover !== null) map.setFeatureState({ source: "countries", id: hover }, { hover: false });
      hover = id;
      if (id !== null) map.setFeatureState({ source: "countries", id }, { hover: true });
    };
    const top = (pt: maplibregl.PointLike): MapGeoJSONFeature | undefined =>
      map.queryRenderedFeatures(pt, { layers: CLICKABLE.filter((l) => map.getLayer(l)) })[0];

    map.on("mousemove", (e) => {
      if (!ready) return;
      const f = top(e.point);
      const c = !f && map.getLayer("countries-fill")
        ? map.queryRenderedFeatures(e.point, { layers: ["countries-fill"] })[0]
        : undefined;
      setHover(c ? Number(c.id) : null);
      map.getCanvas().style.cursor = f || c ? "pointer" : "";
      const label = f
        ? (f.layer.id === "news"
          ? L("{n} stories", { n: f.properties.n })
          : f.layer.id === "health"
          ? L("Outbreak · {title}", { title: T(String(f.properties.title ?? "")) })
          : LIVE.has(f.layer.id)
          ? T(String(f.properties.title ?? ""))
          : String(f.properties.title ?? ""))
        : c
        ? C(String(c.properties.name), String(c.properties.iso))
        : "";
      if (label) tip.setLngLat(e.lngLat).setText(label).addTo(map);
      else tip.remove();
    });
    map.on("mouseout", () => (tip.remove(), setHover(null)));
    map.on("click", (e) => {
      if (!ready) return;
      const f = top(e.point);
      const id = f?.properties.id;
      const kind = f && KIND_OF[f.layer.id];
      const c = !f ? map.queryRenderedFeatures(e.point, { layers: ["countries-fill"] })[0] : undefined;
      const pick: Pick | null = kind === "country"
        ? { kind, id: Number(id) }
        : kind
        ? { kind, id: String(id) } as Pick
        : c
        ? { kind: "country", id: Number(c.id) }
        : null;
      focus(pick);
    });

    onCleanup(() => {
      disposers.forEach((d) => d());
      map.remove();
    });
  });

  // Hidden, not unmounted, under the true-size map: switching back is instant and keeps the camera.
  return <div ref={host} class={prefs.projection === "equal" ? "map off" : "map"} aria-label={L("World map")} />;
}
