import { cell } from "aio";
import type { Region } from "../data/feeds.ts";
import type { Rect } from "../lib/rect.ts";

export type Tab =
  | "brief"
  | "news"
  | "watch"
  | "events"
  | "systems"
  | "markets"
  | "bets"
  | "tv"
  | "layers"
  | "settings";
export type LayerId =
  | "news"
  | "quakes"
  | "events"
  | "weather"
  | "health"
  | "protests"
  | "sirens"
  | "advisories"
  | "jam"
  | "air"
  | "squawks"
  | "sats"
  | "places"
  | "lanes"
  | "ports"
  | "cables"
  | "bases"
  | "nuclear"
  | "spaceports"
  | "datacenters"
  | "radiation"
  | "climate"
  | "night"
  | "borders";
export type Layers = Record<LayerId, boolean>;
export type Preset = "world" | "security" | "trade" | "tech" | "planet";
/** Live TV: last channel, and the floating player (in-app, above everything) when popped out. */
export type TvState = { channel: string; floating: boolean; rect: Rect };
export type State = {
  tv: TvState;
  tab: Tab;
  sidebar: boolean;
  globe: boolean;
  theme: "auto" | "dark" | "light";
  layers: Layers;
  /** Layer shown alone, and the mix to restore when it is clicked again. */
  soloed: LayerId | null;
  saved: Layers | null;
  /** Last applied preset; cleared by any manual change. */
  preset: Preset | null;
  region: Region | "all";
  minMag: number;
};

export type LayerInfo = { id: LayerId; label: string; hint: string; group: string };
export const LAYERS: LayerInfo[] = [
  { id: "news", label: "News", hint: "Stories pinned to the countries they mention", group: "Live" },
  { id: "quakes", label: "Earthquakes", hint: "USGS · M2.5+ last day, M4.5+ last week", group: "Live" },
  { id: "events", label: "Disasters", hint: "NASA EONET + GDACS: storms, fires, floods, volcanoes", group: "Live" },
  { id: "weather", label: "Severe weather", hint: "NWS, Environment Canada, WMO · severe + extreme", group: "Live" },
  { id: "health", label: "Disease outbreaks", hint: "WHO Disease Outbreak News", group: "Live" },
  { id: "protests", label: "Protests", hint: "GDELT · places in protest coverage, last day", group: "Live" },
  { id: "sirens", label: "Israel sirens", hint: "Tzeva Adom · Home Front Command alerts, last day", group: "Live" },
  {
    id: "advisories",
    label: "Travel advisories",
    hint: "US State Dept · level 3–4 countries outlined",
    group: "Security",
  },
  { id: "jam", label: "GPS interference", hint: "gpsjam.org · aircraft reporting degraded GPS", group: "Security" },
  { id: "air", label: "Military aircraft", hint: "adsb.lol · live military transponders", group: "Security" },
  { id: "squawks", label: "Aircraft emergencies", hint: "adsb.lol · squawk 7500 / 7600 / 7700", group: "Security" },
  { id: "bases", label: "Military bases", hint: "Wikidata · notable bases", group: "Security" },
  {
    id: "sats",
    label: "Satellites",
    hint: "CelesTrak · stations, military, GNSS, Earth observation",
    group: "Security",
  },
  { id: "places", label: "Chokepoints & flashpoints", hint: "Curated + IMF PortWatch ship traffic", group: "Trade" },
  { id: "lanes", label: "Shipping lanes", hint: "Major, middle and minor sea routes", group: "Trade" },
  { id: "ports", label: "Ports", hint: "NGA World Port Index · large + medium", group: "Trade" },
  { id: "cables", label: "Undersea cables", hint: "TeleGeography submarine cable map", group: "Trade" },
  { id: "nuclear", label: "Nuclear power", hint: "Wikidata · nuclear power plants", group: "Energy · Tech" },
  { id: "datacenters", label: "Data centers", hint: "Wikidata · sparse, notable sites only", group: "Energy · Tech" },
  { id: "spaceports", label: "Spaceports", hint: "Wikidata · launch sites", group: "Energy · Tech" },
  { id: "radiation", label: "Radiation", hint: "Safecast · live sensors, counts per minute", group: "Planet" },
  { id: "climate", label: "Temperature anomaly", hint: "NASA POWER · latest 7 days vs 2001–2025", group: "Planet" },
  { id: "night", label: "Day / night", hint: "Live solar terminator", group: "Planet" },
  { id: "borders", label: "Country activity", hint: "Shade countries by activity score", group: "Planet" },
];

const only = (...on: LayerId[]): Layers => Object.fromEntries(LAYERS.map((l) => [l.id, on.includes(l.id)])) as Layers;

export const PRESETS: Record<Preset, { label: string; layers: Layers; region: State["region"] }> = {
  world: {
    label: "World",
    layers: only("news", "quakes", "events", "weather", "health", "places", "night", "borders"),
    region: "all",
  },
  security: {
    label: "Security",
    layers: only("news", "advisories", "jam", "air", "squawks", "sirens", "protests", "bases", "places", "borders"),
    region: "defense",
  },
  trade: {
    label: "Trade · Energy",
    layers: only("places", "lanes", "ports", "cables", "nuclear", "borders"),
    region: "business",
  },
  tech: { label: "Tech · Space", layers: only("cables", "datacenters", "spaceports", "sats", "night"), region: "tech" },
  planet: {
    label: "Planet",
    layers: only("quakes", "events", "weather", "health", "radiation", "climate", "night"),
    region: "all",
  },
};

const isRect = (v: unknown) =>
  (typeof v === "object" && v !== null &&
    ["x", "y", "w", "h"].every((k) => Number.isFinite((v as Record<string, unknown>)[k]))) ||
  "a rect {x, y, w, h}";

const INITIAL: State = {
  tv: { channel: "UCNye-wNBqNL5ZzHSJj3l8Bg", floating: false, rect: { x: 480, y: 80, w: 520, h: 330 } },
  tab: "brief",
  sidebar: true,
  globe: true,
  theme: "auto",
  layers: PRESETS.world.layers,
  soloed: null,
  saved: null,
  preset: "world",
  region: "all",
  minMag: 4.5,
};

export const prefs = cell("prefs", {
  version: 4,
  // Keep the user's choices; new layers start from the default mix.
  onMigrate: (s) => {
    const old = s as Partial<State>;
    return {
      ...INITIAL,
      ...old,
      layers: { ...INITIAL.layers, ...old.layers },
      preset: old.preset ?? null,
      tv: { ...INITIAL.tv, ...old.tv },
    };
  },
  state: INITIAL,
  args: {
    setMinMag: [(v) => (typeof v === "number" && v >= 2.5 && v <= 8) || "2.5–8"],
    floatTv: [isRect],
    moveTv: [isRect],
  },
  methods: {
    setTab(s, tab: Tab) {
      if (s.tab === tab && s.sidebar) s.sidebar = false;
      else [s.tab, s.sidebar] = [tab, true];
    },
    toggleSidebar(s) {
      s.sidebar = !s.sidebar;
    },
    setGlobe(s, on: boolean) {
      s.globe = on;
    },
    setTheme(s, theme: State["theme"]) {
      s.theme = theme;
    },
    /** Switch one layer; the current mix (solo or not) becomes the user's own. */
    setLayer(s, id: LayerId, on: boolean) {
      if (!(id in s.layers)) throw new Error(`no layer ${id}`);
      s.layers[id] = on;
      [s.soloed, s.saved, s.preset] = [null, null, null];
    },
    /** Show one layer alone; the same call again brings the previous mix back. */
    solo(s, id: LayerId) {
      if (!(id in s.layers)) throw new Error(`no layer ${id}`);
      if (s.soloed === id && s.saved) {
        [s.layers, s.soloed, s.saved] = [s.saved, null, null];
        return;
      }
      s.saved ??= { ...s.layers };
      [s.layers, s.soloed] = [only(id), id];
    },
    focus(s, p: Preset) {
      if (!(p in PRESETS)) throw new Error(`no preset ${p}`);
      [s.layers, s.region, s.preset, s.soloed, s.saved] = [{ ...PRESETS[p].layers }, PRESETS[p].region, p, null, null];
    },
    setChannel(s, channel: string) {
      if (!/^UC[\w-]{22}$/.test(channel)) throw new Error(`not a YouTube channel id: ${channel}`);
      s.tv.channel = channel;
    },
    /** Pop the TV out into the floating player at `rect` (already fitted to the window by the caller). */
    floatTv(s, rect: Rect) {
      s.tv.floating = true;
      s.tv.rect = rect;
    },
    moveTv(s, rect: Rect) {
      s.tv.rect = rect;
    },
    /** Back into the Live TV tab. */
    dockTv(s) {
      s.tv.floating = false;
      [s.tab, s.sidebar] = ["tv", true];
    },
    /** Stop the floating player (the Live TV tab still plays when opened). */
    closeTv(s) {
      s.tv.floating = false;
    },
    setRegion(s, region: State["region"]) {
      s.region = region;
    },
    setMinMag(s, v: number) {
      s.minMag = v;
    },
  },
});
