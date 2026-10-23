# Globe Now (gn)

A local desktop dashboard of what is happening in the world: news, disasters, severe weather, sirens, protests,
aircraft, ship traffic, infrastructure, markets and prediction odds on one WebGL globe, plus live TV and local AI
briefs. Free, keyless, no account, no backend.

## Run

    deno task dev                      # Electron window, live reload
    deno task compile                  # → dist/globe-now-<ver>-x86_64.AppImage
    deno task test                     # 51 tests: pure libs, every cell method, UI flows, WASM
    deno task infra                    # rebuild assets/infra.geojson + lanes.geojson (Wikidata, NGA WPI)

## Layout

| Path          | What                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------- |
| `src/cell/`   | State. Data cells refresh on `aio.run` schedules; `prefs` and `view` drive the UI                   |
| `src/server/` | Network I/O (`sources.server.ts`, `world.server.ts`), local AI (`ai.server.ts`), blobs, WASM bridge |
| `src/lib/`    | Pure functions: RSS parsing, normalizers, clustering, scoring, sun                                  |
| `src/ui/`     | AIR components; `Map.tsx` = MapLibre (globe ⇄ flat)                                                 |
| `src/data/`   | Feeds, gazetteer aliases, chokepoints and flashpoints, countries (generated)                        |
| `wasm/`       | Rust core: headline geotagging (Aho-Corasick) and clustering. `deno task wasm` rebuilds `src/wasm/` |
| `assets/`     | Natural Earth countries, baked infrastructure + shipping lanes (`deno task infra`), MapLibre CSS    |

## Sources (all keyless)

- News: 55 RSS feeds (incl. tech, Reddit, Hacker News, good news) · GDELT protests
- Hazards: USGS · NASA EONET · GDACS · NWS · Environment Canada · WMO · WHO · Safecast · Open-Meteo ERA5 · NOAA CO₂ ·
  ReliefWeb · ECDC
- Security: adsb.lol (military, squawk 7500/7600/7700) · FAA airport status · Tzeva Adom sirens · gpsjam.org · CelesTrak
  · US State Dept advisories
- Money: BIS central bank rates · IMF outlook · Yahoo Finance · CoinGecko · alternative.me · CNN Fear & Greed · US
  Treasury · NY Fed · ECB · CFTC · Polymarket · Kalshi
- Context: World Bank · UNHCR · OFAC · IMF PortWatch · Statuspage feeds · Element 84 Sentinel-2 · TeleGeography
- Baked map data: Wikidata (CC0) bases, nuclear plants, spaceports, data centers · NGA World Port Index ·
  newzealandpaul/Shipping-Lanes (CC BY 4.0) · Natural Earth
- Live TV: YouTube embeds in a `<webview>` (an `aio://` page sends no Referer; YouTube refuses with error 153)
- AI briefs: through aipro, the local AI provider app (aio `peer`); nothing leaves the machine.
