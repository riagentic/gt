// Globe Today (gt) — entry. Cells self-register on import.
import "./cell/prefs.ts";
import "./cell/view.ts";
import "./cell/watch.ts";
import "./cell/tvlive.ts";
import "./server/sources.server.ts"; // embed server-only modules for deno compile
import "./server/blobs.server.ts";
import "./server/world.server.ts";
import "./server/ai.server.ts";
import "./server/signals.server.ts";
import "./server/reader.server.ts";
import "./server/adblock.server.ts";
import { aio } from "aio";
import { ai } from "./cell/ai.ts";
import { air } from "./cell/air.ts";
import { alerts } from "./cell/alerts.ts";
import { atlas } from "./cell/atlas.ts";
import { hazards } from "./cell/hazards.ts";
import { layers } from "./cell/layers.ts";
import { markets } from "./cell/markets.ts";
import { meteo } from "./cell/meteo.ts";
import { news } from "./cell/news.ts";
import { risk } from "./cell/risk.ts";
import { signals } from "./cell/signals.ts";
import { sky } from "./cell/sky.ts";
import { tr } from "./cell/tr.ts";

const MIN = 60_000;

// aio-ok: single-user local app; every window reads every cell.
await aio.run({
  ui: {
    title: "Globe Today",
    theme: "tokens",
    head: `<link rel="stylesheet" href="assets/maplibre-gl.css">`,
    chrome: "none",
    width: 1440,
    height: 900,
  },
  journal: true,
  schedules: [
    { id: "news", every: 10 * MIN, action: news.refresh.action() },
    { id: "hazards", every: 5 * MIN, action: hazards.refresh.action() },
    { id: "air", every: 2 * MIN, action: air.refresh.action() },
    { id: "markets", every: 5 * MIN, action: markets.refresh.action() },
    { id: "bets", every: 10 * MIN, action: markets.refreshBets.action() },
    { id: "cables", every: 24 * 60 * MIN, action: layers.refresh.action(false) },
    { id: "jam", every: 6 * 60 * MIN, action: layers.refreshJam.action() },
    { id: "sky", every: 6 * 60 * MIN, action: sky.refresh.action(false) },
    { id: "risk", every: 3 * 60 * MIN, action: risk.refresh.action() },
    { id: "macro", every: 60 * MIN, action: markets.refreshMacro.action() },
    { id: "signals", every: 60 * MIN, action: signals.refresh.action() },
    { id: "weather", every: 10 * MIN, action: alerts.refreshWeather.action() },
    { id: "sirens", every: 2 * MIN, action: alerts.refreshSirens.action() },
    { id: "aviation", every: 2 * MIN, action: alerts.refreshAviation.action() },
    { id: "protests", every: 60 * MIN, action: alerts.refreshProtests.action() },
    { id: "profiles", every: 24 * 60 * MIN, action: atlas.refreshProfiles.action(false) },
    { id: "traffic", every: 12 * 60 * MIN, action: atlas.refreshTraffic.action() },
    { id: "planet", every: 3 * 60 * MIN, action: atlas.refreshPlanet.action() },
    { id: "services", every: 5 * MIN, action: atlas.refreshServices.action() },
    { id: "temps", every: 3 * 60 * MIN, action: meteo.refreshTemps.action() },
    { id: "storms", every: 60 * MIN, action: meteo.refreshStorms.action() },
    { id: "aipro", every: MIN / 2, action: ai.check.action() },
    { id: "translate", every: MIN / 2, action: tr.drain.action() },
  ],
  onStart: () => {
    news.refresh();
    hazards.refresh();
    air.refresh();
    markets.refresh();
    markets.refreshBets();
    layers.refresh(false);
    layers.refreshJam();
    sky.refresh(false);
    risk.refresh();
    markets.refreshMacro();
    signals.refresh();
    alerts.refreshWeather();
    alerts.refreshSirens();
    alerts.refreshAviation();
    alerts.refreshProtests();
    atlas.refreshProfiles(false);
    atlas.refreshTraffic();
    atlas.refreshPlanet();
    atlas.refreshServices();
    meteo.refreshTemps();
    meteo.refreshStorms();
    ai.check();
  },
  // webviewTag: Live TV plays YouTube in a <webview> (see ui/Systems.tsx); no child windows.
  electron: { ignoreDebugEnv: true, strictPin: true, webviewTag: true },
  wire: { refuseShortCalls: true },
});
