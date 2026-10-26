// Sidebar panels, one per rail tab.
import type { JSX } from "aio";
import { useLocal } from "aio/air";
import { air } from "../cell/air.ts";
import { hazards } from "../cell/hazards.ts";
import { layers } from "../cell/layers.ts";
import { markets } from "../cell/markets.ts";
import { news } from "../cell/news.ts";
import { tr } from "../cell/tr.ts";
import { alerts } from "../cell/alerts.ts";
import { atlas } from "../cell/atlas.ts";
import { type LayerId, LAYERS, prefs, type Preset, PRESETS } from "../cell/prefs.ts";
import { risk } from "../cell/risk.ts";
import { sky } from "../cell/sky.ts";
import { type Pick, view } from "../cell/view.ts";
import { watch } from "../cell/watch.ts";
import { COUNTRIES } from "../data/countries.ts";
import { FEEDS, REGIONS } from "../data/feeds.ts";
import { BY_CODE, LANGUAGES } from "../data/languages.ts";
import { THREATS } from "../lib/alerts.ts";
import { band } from "../lib/score.ts";
import { AiproStatus, Empty, Fresh, Head } from "./bits.tsx";
import { C, L, languageLabel, T } from "./i18n.ts";
import { Icon } from "./icons.tsx";
import { focus, MIN, picked, PickRow, QuoteRow, StoryRow } from "./rows.tsx";
import { AiBrief } from "./Details.tsx";
import { matches, now, unstable } from "./store.ts";

const CLOCKS: [string, string][] = [
  ["UTC", "UTC"],
  ["New York", "America/New_York"],
  ["London", "Europe/London"],
  ["Moscow", "Europe/Moscow"],
  ["Dubai", "Asia/Dubai"],
  ["Delhi", "Asia/Kolkata"],
  ["Beijing", "Asia/Shanghai"],
  ["Tokyo", "Asia/Tokyo"],
];

const Clocks = (): JSX.Element => (
  <div class="clocks" aria-label={L("World clock")}>
    {CLOCKS.map(([city, tz]) => {
      const d = new Date(now.value);
      const t = d.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
      const h = Number(t.slice(0, 2));
      return (
        <span key={tz} class={h >= 7 && h < 19 ? "clock day" : "clock"} title={tz}>
          <small>{L(city)}</small>
          <b>{t}</b>
        </span>
      );
    })}
  </div>
);

/** Language choices: English first, then by English name. */
const OPTIONS: [string, string][] = [
  ["en", "English"],
  ...LANGUAGES.filter((l) => l.code !== "en")
    .map((l): [string, string] => [l.code, languageLabel(l.code)])
    .sort((a, b) => (BY_CODE[a[0]].name < BY_CODE[b[0]].name ? -1 : 1)),
];

export function Brief(): JSX.Element {
  const hot = news.stories.filter((s) => s.size >= 3 && now.value - s.at < 6 * 60 * MIN).slice(0, 6);
  const top = news.stories.filter((s) => now.value - s.at < 12 * 60 * MIN).sort((a, b) => b.size - a.size)
    .slice(0, 40).map((s) => s.title);
  const urgent: { id: string; pick: Pick; title: string; at: number; lead: JSX.Element }[] = [
    ...alerts.squawks.filter((a) => a.sq === "7500" || a.sq === "7700").map((a) => ({
      id: `sq-${a.hex}`,
      pick: { kind: "plane" as const, id: a.hex },
      title: `${L("Squawk")} ${a.sq} · ${a.call || a.hex.toUpperCase()}`,
      at: now.value,
      lead: <span class="lvl lv4">{a.sq}</span>,
    })),
    ...alerts.sirens.filter((x) => x.threat !== 8 && now.value - x.at < 60 * MIN).slice(0, 3).map((x) => ({
      id: `siren-${x.id}`,
      pick: { kind: "siren" as const, id: x.id },
      title: `${L("Sirens")} · ${L(THREATS[x.threat])} · ${x.cities[0]?.en ?? ""}${
        x.cities.length > 1 ? ` +${x.cities.length - 1}` : ""
      }`,
      at: x.at,
      lead: <span class="kind k-siren" />,
    })),
    ...hazards.events.filter((e) => e.level === 2).map((e) => ({
      id: e.id,
      pick: { kind: "event" as const, id: e.id },
      title: T(e.title),
      at: e.at,
      lead: <span class={`kind k-${e.kind} lv2`} />,
    })),
    ...hazards.quakes.filter((q) => q.mag >= 6 && now.value - q.at < 2 * 24 * 60 * MIN).map((q) => ({
      id: q.id,
      pick: { kind: "quake" as const, id: q.id },
      title: T(q.place),
      at: q.at,
      lead: <span class={`mag m${Math.min(7, Math.floor(q.mag))}`}>{q.mag.toFixed(1)}</span>,
    })),
  ];
  const watched = matches();
  const movers = [...markets.quotes].sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg)).slice(0, 4);
  return (
    <div class="panel">
      <Head title={L("Brief")}>
        <Fresh s={news.status} stale={20 * MIN} />
      </Head>
      <Clocks />
      <div class="presets" role="group" aria-label={L("Focus")}>
        {(Object.keys(PRESETS) as Preset[]).map((k) => (
          <button
            type="button"
            key={k}
            t={`preset_${k}`}
            class={prefs.preset === k ? "chip on" : "chip"}
            onClick={() => prefs.focus(k)}
          >
            {L(PRESETS[k].label)}
          </button>
        ))}
      </div>
      {urgent.length > 0 && (
        <section>
          <h3>{L("Alerts")}</h3>
          {urgent.slice(0, 6).map((x) => <PickRow key={x.id} pick={x.pick} title={x.title} at={x.at} lead={x.lead} />)}
        </section>
      )}
      <AiBrief subject="the world" id="world" headlines={top} />
      <section>
        <h3>{L("Instability index")}</h3>
        {unstable.value.length === 0 && <Empty text={L("Gathering signals…")} />}
        {unstable.value.slice(0, 8).map(([id, x]) => {
          const b = band(x.score);
          return (
            <button
              type="button"
              key={id}
              class={`row compact ${picked("country", id) ? "on" : ""}`}
              aria-label={C(COUNTRIES[id].name, COUNTRIES[id].iso)}
              title={x.parts.map((p) => `${L(p.label)} ${p.points}`).join(" · ")}
              onClick={() => focus({ kind: "country", id })}
            >
              <span class="row-title one">{C(COUNTRIES[id].name, COUNTRIES[id].iso)}</span>
              <span class="meter">
                <i class={`t${b.tone}`} style={{ width: `${x.score}%` }} />
              </span>
              <span class={`score t${b.tone}`}>{x.score}</span>
            </button>
          );
        })}
      </section>
      {watch.words.length > 0 && (
        <section>
          <h3>
            {L("Watchlist")} <span class="count">{watched.length}</span>
          </h3>
          {watched.length === 0 && <Empty text={L("Nothing new for your keywords.")} />}
          {watched.slice(0, 4).map(({ s }) => <StoryRow key={s.id} s={s} />)}
        </section>
      )}
      <section>
        <h3>{L("Developing stories")}</h3>
        {hot.length === 0 && <Empty text={L("No widely reported stories in the last 6 hours.")} />}
        {hot.map((s) => <StoryRow key={s.id} s={s} />)}
      </section>
      {movers.length > 0 && (
        <section>
          <h3>{L("Biggest market moves")}</h3>
          {movers.map((q) => <QuoteRow key={q.sym} q={q} />)}
        </section>
      )}
    </div>
  );
}

export function News(): JSX.Element {
  const q = view.query.trim().toLowerCase();
  const list = news.stories.filter((s) =>
    (prefs.region === "all" || s.region === prefs.region) &&
    (!q || s.title.toLowerCase().includes(q) || s.source.toLowerCase().includes(q))
  );
  return (
    <div class="panel">
      <Head title={L("News")}>
        <Fresh s={news.status} stale={20 * MIN} />
      </Head>
      <div class="filters">
        <label class="search">
          <Icon name="search" size={14} />
          <input
            aria-label={L("Filter stories")}
            placeholder={L("Filter stories")}
            value={view.query}
            onInput={(e) => view.search((e.target as HTMLInputElement).value)}
          />
        </label>
        <div class="chips" role="tablist" aria-label={L("Region")}>
          {[{ id: "all" as const, label: "All" }, ...REGIONS].map((r) => (
            <button
              type="button"
              key={r.id}
              role="tab"
              t={`region_${r.id}`}
              aria-selected={prefs.region === r.id}
              class={prefs.region === r.id ? "chip on" : "chip"}
              onClick={() => prefs.setRegion(r.id)}
            >
              {L(r.label)}
            </button>
          ))}
        </div>
      </div>
      <div class="list">
        {list.length === 0 && <Empty text={L(news.status.at ? "No stories match." : "Loading stories…")} />}
        {list.slice(0, 200).map((s) => <StoryRow key={s.id} s={s} />)}
      </div>
    </div>
  );
}

export function Layers(): JSX.Element {
  const count: Partial<Record<LayerId, number>> = {
    quakes: hazards.quakes.filter((q) => q.mag >= prefs.minMag).length,
    events: hazards.events.length,
    air: air.planes.length,
    weather: alerts.weather.length,
    protests: alerts.protests.length,
    sirens: alerts.sirens.length,
    squawks: alerts.squawks.length,
    radiation: atlas.radiation.length,
  };
  const groups = [...new Set(LAYERS.map((l) => l.group))];
  return (
    <div class="panel">
      <Head title={L("Layers")} />
      <section>
        <div class="seg wide" role="group" aria-label={L("Projection")}>
          <button
            type="button"
            class={prefs.projection === "globe" ? "on" : ""}
            onClick={() => prefs.setProjection("globe")}
          >
            <Icon name="globe" size={15} /> {L("Globe")}
          </button>
          <button
            type="button"
            class={prefs.projection === "mercator" ? "on" : ""}
            onClick={() => prefs.setProjection("mercator")}
          >
            <Icon name="map" size={15} /> {L("Flat")}
          </button>
          <button
            type="button"
            class={prefs.projection === "equal" ? "on" : ""}
            title={L("Equal Earth: every country at its true relative size")}
            onClick={() => prefs.setProjection("equal")}
          >
            <Icon name="equal" size={15} /> {L("True size")}
          </button>
        </div>
        <div class="presets" role="group" aria-label={L("Focus")}>
          {(Object.keys(PRESETS) as Preset[]).map((k) => (
            <button
              type="button"
              key={k}
              class={prefs.preset === k ? "chip on" : "chip"}
              onClick={() => prefs.focus(k)}
            >
              {L(PRESETS[k].label)}
            </button>
          ))}
        </div>
        <p class="fine">
          {prefs.soloed
            ? L("Showing only {layer}. Click it again to bring your layers back.", {
              layer: L(LAYERS.find((l) => l.id === prefs.soloed)?.label ?? ""),
            })
            : L("Click a layer's name to show it alone; click again to go back. The switch adds or removes one layer.")}
        </p>
      </section>
      {groups.map((g) => (
        <section key={g}>
          <h3>{L(g)}</h3>
          {LAYERS.filter((l) => l.group === g).map((l) => (
            <div key={l.id} class={prefs.soloed === l.id ? "toggle soloed" : "toggle"}>
              <button
                type="button"
                class="toggle-main"
                t={`solo_${l.id}`}
                aria-pressed={prefs.soloed === l.id}
                title={L(prefs.soloed === l.id ? "Back to all your layers" : "Show only this layer")}
                onClick={() =>
                  prefs.solo(l.id)}
              >
                <span class={`swatch s-${l.id}`} />
                <span class="toggle-text">
                  <span>
                    {L(l.label)}
                    {count[l.id] !== undefined && <span class="count">{count[l.id]}</span>}
                  </span>
                  <small>{L(l.hint)}</small>
                </span>
              </button>
              <input
                type="checkbox"
                role="switch"
                t={`layer_${l.id}`}
                aria-label={L(l.label)}
                checked={prefs.layers[l.id]}
                onChange={(e) =>
                  prefs.setLayer(l.id, (e.target as HTMLInputElement).checked)}
              />
            </div>
          ))}
        </section>
      ))}
      <section class="legend">
        <h3>{L("Activity score")}</h3>
        <div class="ramp" />
        <div class="ramp-labels">
          <span>{L("Calm")}</span>
          <span>{L("Elevated")}</span>
          <span>{L("Critical")}</span>
        </div>
        <p class="fine">
          {L(
            "Per country, last 24h: news mentions weighted by how many outlets report each story, plus live disaster and earthquake alerts. It measures attention, not danger.",
          )}
        </p>
      </section>
    </div>
  );
}

export function Settings(): JSX.Element {
  const [busy, setBusy] = useLocal(false);
  const sources = [
    { name: "News feeds", s: news.status, stale: 20 * MIN, run: () => news.refresh() },
    { name: "USGS · EONET · GDACS", s: hazards.status, stale: 15 * MIN, run: () => hazards.refresh() },
    { name: "adsb.lol military", s: air.status, stale: 6 * MIN, run: () => air.refresh() },
    { name: "Yahoo · CoinGecko", s: markets.status, stale: 15 * MIN, run: () => markets.refresh() },
    { name: "Polymarket · Kalshi", s: markets.betStatus, stale: 20 * MIN, run: () => markets.refreshBets() },
    {
      name: "CNN · Treasury · Fed · ECB · CFTC",
      s: markets.macroStatus,
      stale: 3 * 60 * MIN,
      run: () => markets.refreshMacro(),
    },
    { name: "NWS · Env. Canada · WMO", s: alerts.weatherStatus, stale: 30 * MIN, run: () => alerts.refreshWeather() },
    { name: "Tzeva Adom sirens", s: alerts.sirenStatus, stale: 6 * MIN, run: () => alerts.refreshSirens() },
    { name: "adsb.lol squawks · FAA", s: alerts.aviationStatus, stale: 6 * MIN, run: () => alerts.refreshAviation() },
    { name: "GDELT protests", s: alerts.protestStatus, stale: 2 * 60 * MIN, run: () => alerts.refreshProtests() },
    {
      name: "World Bank · UNHCR · OFAC",
      s: atlas.profileStatus,
      stale: 8 * 24 * 60 * MIN,
      run: () => atlas.refreshProfiles(true),
    },
    { name: "IMF PortWatch", s: atlas.trafficStatus, stale: 36 * 60 * MIN, run: () => atlas.refreshTraffic() },
    {
      name: "Safecast · Open-Meteo ERA5 · NOAA",
      s: atlas.planetStatus,
      stale: 6 * 60 * MIN,
      run: () => atlas.refreshPlanet(),
    },
    { name: "Service status pages", s: atlas.serviceStatus, stale: 15 * MIN, run: () => atlas.refreshServices() },
    { name: "Submarine cables", s: layers.status, stale: 8 * 24 * 60 * MIN, run: () => layers.refresh(true) },
    { name: "gpsjam.org", s: layers.jamStatus, stale: 36 * 60 * MIN, run: () => layers.refreshJam() },
    { name: "CelesTrak satellites", s: sky.status, stale: 12 * 60 * MIN, run: () => sky.refresh(true) },
    { name: "WHO · US travel advisories", s: risk.status, stale: 8 * 60 * MIN, run: () => risk.refresh() },
  ];
  return (
    <div class="panel">
      <Head title={L("Settings")} />
      <section>
        <h3>{L("Appearance")}</h3>
        <div class="seg wide" role="group" aria-label={L("Theme")}>
          {(["auto", "light", "dark"] as const).map((t) => (
            <button
              type="button"
              key={t}
              class={prefs.theme === t ? "on" : ""}
              onClick={() => prefs.setTheme(t)}
            >
              {L(t === "auto" ? "System" : t === "light" ? "Light" : "Dark")}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3>{L("Language")}</h3>
        <label class="select">
          <span>{L("Language")}</span>
          <select
            t="language"
            aria-label={L("Language")}
            value={prefs.lang}
            onChange={(e) => prefs.setLang((e.target as HTMLSelectElement).value)}
          >
            {OPTIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </label>
        {prefs.lang === "cs" && (
          <p class="fine">
            {L(
              "Fixed text is translated in the app. Live text (news, alerts, briefs) is translated once by aipro on this computer and kept — it needs aipro running.",
            )}
          </p>
        )}
        {prefs.lang !== "en" && prefs.lang !== "cs" && (
          <p class="fine">
            {L(
              "Menus and live text (news, alerts, briefs) are translated by aipro on this computer the first time they are shown, then kept — it needs aipro running. Quality depends on the model and the language.",
            )}
          </p>
        )}
        {prefs.lang !== "en" && tr.pending > 0 && <p class="fine">{L("Translating {n}…", { n: tr.pending })}</p>}
        {prefs.lang !== "en" && !tr.status.ok && tr.status.err && <p class="fine err">{L(tr.status.err)}</p>}
      </section>
      <section>
        <h3>
          {L("Sources")}
          <span class="grow" />
          <button
            type="button"
            class="link"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await Promise.allSettled(sources.map((x) => x.run()));
              setBusy(false);
            }}
          >
            <Icon name="refresh" size={13} /> {L("Refresh all")}
          </button>
        </h3>
        {sources.map((x) => (
          <div key={x.name} class="source">
            <span>{L(x.name)}</span>
            <Fresh s={x.s} stale={x.stale} />
          </div>
        ))}
        {news.failed.length > 0 && <p class="fine">{L("Unreachable feeds:")} {news.failed.join(", ")}</p>}
      </section>
      <section>
        <h3>
          {L("Local AI")}
          <span class="grow" />
          <button type="button" class="link" t="ai_details" onClick={() => prefs.setTab("ai")}>
            {L("Details")}
          </button>
        </h3>
        <AiproStatus />
      </section>
      <section>
        <h3>{L("Keyboard")}</h3>
        <dl class="keys">
          <dt>⌘K</dt>
          <dd>{L("Search everything")}</dd>
          <dt>1 – 9</dt>
          <dd>{L("Switch tabs")}</dd>
          <dt>G</dt>
          <dd>{L("Globe ⇄ flat")}</dd>
          <dt>\</dt>
          <dd>{L("Show / hide sidebar")}</dd>
          <dt>Esc</dt>
          <dd>{L("Close details")}</dd>
        </dl>
      </section>
      <section>
        <h3>{L("About")}</h3>
        <p class="fine">
          {L("Globe Today runs entirely on this computer. No account, no tracking, no API keys.")}{" "}
          {L("{n} news feeds plus public data from", { n: FEEDS.length })}{" "}
          USGS, NASA EONET, GDACS, NWS, Environment Canada, WMO, adsb.lol, FAA, Tzeva Adom, GDELT, Yahoo Finance,
          CoinGecko, CNN, US Treasury, New York Fed, ECB, CFTC, Polymarket, Kalshi, TeleGeography, CelesTrak,
          gpsjam.org, WHO, the US State Department, World Bank, UNHCR, OFAC, IMF PortWatch, Safecast, Open-Meteo (ERA5),
          NOAA, IMF, BIS, ReliefWeb, ECDC, Element 84 (Sentinel-2), Natural Earth {L("and")} OpenFreeMap.
        </p>
        <p class="fine">
          {L(
            "Map data: Wikidata (CC0) for bases, power plants, spaceports and data centers; NGA World Port Index; shipping lanes by newzealandpaul/Shipping-Lanes (CC BY 4.0).",
          )}
        </p>
      </section>
    </div>
  );
}
