// Right-side detail panel for the current selection.
import { type JSX, serverFn } from "aio";
import type { reader } from "../server/reader.server.ts";
import { useEffect, useInterval, useLocal } from "aio/air";
import { news } from "../cell/news.ts";
import { risk } from "../cell/risk.ts";
import { view } from "../cell/view.ts";
import { COUNTRIES } from "../data/countries.ts";
import { atlas } from "../cell/atlas.ts";
import { SQUAWKS } from "../lib/alerts.ts";
import { ago, host } from "../lib/fmt.ts";
import { prefs } from "../cell/prefs.ts";
import { period, position } from "../lib/orbit.ts";
import { band } from "../lib/score.ts";
import { Empty } from "./bits.tsx";
import {
  AnomalyBody,
  ChokepointBody,
  CountryExtras,
  Facts,
  Imagery,
  InstabilityCard,
  Open,
  ProtestBody,
  SensorBody,
  since,
  SirenBody,
  SiteBody,
  WeatherBody,
  when,
} from "./Details.tsx";
import { C, L, T } from "./i18n.ts";
import { Icon } from "./icons.tsx";
import { focus, StoryRow } from "./rows.tsx";
import * as P from "./pick.ts";
import { now, scores, stability, world } from "./store.ts";

function Body(): JSX.Element {
  const p = view.pick;
  if (!p) return <Empty text={L("Nothing selected.")} />;
  switch (p.kind) {
    case "story": {
      const s = P.story(p.id);
      if (!s) return <Empty text={L("This story has rolled off the feed.")} />;
      return (
        <>
          <p class="eyebrow">{s.source} · {L("first reported {t}", { t: since(s.first) })}</p>
          <h1>{T(s.title)}</h1>
          {s.summary && <p class="lede">{T(s.summary)}</p>}
          <div class="tags">
            {s.places.map((id) => (
              <button
                type="button"
                key={id}
                t={`country_${id}`}
                class="chip"
                onClick={() => focus({ kind: "country", id })}
              >
                {COUNTRIES[id] && C(COUNTRIES[id].name, COUNTRIES[id].iso)}
              </button>
            ))}
          </div>
          <Open href={s.link} label={L("Read on {host}", { host: host(s.link) })} />
          {s.also.length > 0 && (
            <section>
              <h3>
                {s.size - 1 === 1
                  ? L("Also reported by 1 outlet")
                  : L("Also reported by {n} outlets", { n: s.size - 1 })}
              </h3>
              {s.also.map((m) => (
                <a key={m.link} class="row" href={m.link} target="_blank" rel="noreferrer">
                  <span class="row-title">{T(m.title)}</span>
                  <span class="row-meta">{m.source}</span>
                </a>
              ))}
            </section>
          )}
        </>
      );
    }
    case "country": {
      const c = COUNTRIES[p.id];
      if (!c) return <Empty text={L("Unknown country.")} />;
      const a = scores.value.get(p.id);
      const b = band(a?.score ?? 0);
      const list = news.stories.filter((s) => s.places.includes(p.id)).slice(0, 40);
      const w = world.value;
      const haz = w ? [...P.hazardsIn(p.id, w.where)] : [];
      const adv = P.advisory(p.id);
      const sick = risk.outbreaks.filter((o) => o.places.includes(p.id)).slice(0, 6);
      return (
        <>
          <p class="eyebrow">{L("Country")}</p>
          <h1>{C(c.name, c.iso)}</h1>
          <InstabilityCard x={stability.value.get(p.id) ?? { score: 0, parts: [] }} />
          <p class="fine">
            {L("News activity {score} ({band}): {stories} stories · {hazards} hazard alerts in the last 24h.", {
              score: a?.score ?? 0,
              band: L(b.label).toLowerCase(),
              stories: a?.stories ?? 0,
              hazards: a?.hazards ?? 0,
            })}
          </p>
          {adv && (
            <a class={`advisory lv${adv.level}`} href={adv.url} target="_blank" rel="noreferrer">
              <b>{L("Level {n}", { n: adv.level })}</b>
              <span>{L(ADVICE[adv.level])}</span>
              <small>{L("US travel advisory")} · {since(adv.at)}</small>
            </a>
          )}
          {sick.length > 0 && (
            <section>
              <h3>{L("Disease outbreaks")}</h3>
              {sick.map((o) => (
                <button
                  type="button"
                  key={o.id}
                  class="row compact"
                  onClick={() => focus({ kind: "outbreak", id: o.id })}
                >
                  <span class="row-title one">{T(o.title)}</span>
                  <time>{ago(o.at, now.value, prefs.lang === "cs")}</time>
                </button>
              ))}
            </section>
          )}
          {haz.length > 0 && (
            <section>
              <h3>{L("Hazards")}</h3>
              {haz.slice(0, 8).map((h) => (
                <button
                  type="button"
                  key={h.id}
                  class="row compact"
                  onClick={() => focus(h.pick)}
                >
                  <span class="row-title one">{T(h.title)}</span>
                  <time>{ago(h.at, now.value, prefs.lang === "cs")}</time>
                </button>
              ))}
            </section>
          )}
          <CountryExtras id={p.id} />
          <section>
            <h3>{L("News")}</h3>
            {list.length === 0 && <Empty text={L("No recent stories mention this country.")} />}
            {list.map((s) => <StoryRow key={s.id} s={s} />)}
          </section>
        </>
      );
    }
    case "quake": {
      const q = P.quake(p.id);
      if (!q) return <Empty text={L("This earthquake is no longer in the feed.")} />;
      return (
        <>
          <p class="eyebrow">{L("Earthquake")} · USGS</p>
          <h1>M{q.mag.toFixed(1)} · {T(q.place)}</h1>
          {q.tsunami && <p class="alert">{L("Tsunami information issued — check local authorities.")}</p>}
          <Facts
            rows={[[L("Magnitude"), q.mag.toFixed(1)], [L("Depth"), `${q.depth.toFixed(0)} km`], [
              L("Time"),
              when(q.at),
            ], [
              L("Location"),
              `${q.lat.toFixed(2)}, ${q.lon.toFixed(2)}`,
            ]]}
          />
          {q.url && <Open href={q.url} label={L("USGS event page")} />}
        </>
      );
    }
    case "event": {
      const e = P.event(p.id);
      if (!e) return <Empty text={L("This event has closed.")} />;
      return (
        <>
          <p class="eyebrow">{e.source}</p>
          <h1>{T(e.title)}</h1>
          {e.level > 0 && (
            <p class={`alert lv${e.level}`}>
              {e.level === 2 ? L("Red alert") : L("Orange alert")} — {L("significant humanitarian impact possible.")}
            </p>
          )}
          <Facts
            rows={[[L("Type"), L(e.kind[0].toUpperCase() + e.kind.slice(1))], [L("Since"), when(e.at)], [
              L("Location"),
              `${e.lat.toFixed(2)}, ${e.lon.toFixed(2)}`,
            ]]}
          />
          {e.url && <Open href={e.url} label={L("Source report")} />}
          <Imagery id={`event-${e.id}`} lon={e.lon} lat={e.lat} />
        </>
      );
    }
    case "plane": {
      const a = P.plane(p.id);
      if (!a) return <Empty text={L("Aircraft no longer transmitting.")} />;
      return (
        <>
          <p class="eyebrow">
            {a.sq in SQUAWKS ? `${L("Squawk")} ${a.sq} · ${L(SQUAWKS[a.sq])}` : L("Military aircraft")} · adsb.lol
          </p>
          <h1>{a.call || a.hex.toUpperCase()}</h1>
          <Facts
            rows={[
              [L("Type"), a.type || "—"],
              [L("Registration"), a.reg || "—"],
              [L("Altitude"), a.alt ? `${a.alt.toLocaleString(L("en-US"))} ft` : L("On ground")],
              [L("Speed"), `${a.spd} kt`],
              [L("Heading"), `${a.hdg}°`],
              [L("Squawk"), a.sq || "—"],
            ]}
          />
          <Open href={`https://globe.adsb.lol/?icao=${a.hex}`} label={L("Live track")} />
        </>
      );
    }
    case "sat":
      return <SatBody id={p.id} />;
    case "weather":
      return <WeatherBody id={p.id} />;
    case "siren":
      return <SirenBody id={p.id} />;
    case "protest":
      return <ProtestBody id={p.id} />;
    case "site":
      return <SiteBody id={p.id} />;
    case "chokepoint":
      return <ChokepointBody id={p.id} />;
    case "sensor":
      return <SensorBody id={p.id} />;
    case "anomaly":
      return <AnomalyBody id={p.id} />;
    case "outbreak": {
      const o = P.outbreak(p.id);
      if (!o) return <Empty text={L("This notice is no longer listed.")} />;
      return (
        <>
          <p class="eyebrow">WHO · Disease Outbreak News</p>
          <h1>{T(o.title)}</h1>
          <Facts rows={[[L("Published"), when(o.at)]]} />
          <div class="tags">
            {o.places.map((id) => (
              <button
                type="button"
                key={id}
                class="chip"
                onClick={() => focus({ kind: "country", id })}
              >
                {COUNTRIES[id] && C(COUNTRIES[id].name, COUNTRIES[id].iso)}
              </button>
            ))}
          </div>
          <Open href={o.url} label={L("Read WHO notice")} />
        </>
      );
    }
    case "place": {
      const x = P.place(p.id);
      if (!x) return <Empty text={L("Unknown place.")} />;
      const words = x.name.toLowerCase().split(/\W+/).filter((t) =>
        t.length > 3 && !["strait", "canal", "border", "front", "civil", "eastern", "central"].includes(t)
      );
      const related = news.stories.filter((s) => words.some((t) => s.title.toLowerCase().includes(t))).slice(0, 20);
      const near = (t: { lon: number; lat: number }) => Math.hypot(t.lon - x.lon, t.lat - x.lat) < 2.5;
      const traffic = atlas.traffic.find(near);
      return (
        <>
          <p class="eyebrow">{x.kind === "chokepoint" ? L("Maritime chokepoint") : L("Flashpoint")}</p>
          <h1>{x.name}</h1>
          <p class="lede">{T(x.note)}</p>
          {traffic && (
            <button type="button" class="link" onClick={() => focus({ kind: "chokepoint", id: traffic.id })}>
              {L("Ship traffic: {n}/day (30-day avg {avg})", { n: traffic.ships, avg: traffic.avg })} →
            </button>
          )}
          <Imagery id={`place-${x.id}`} lon={x.lon} lat={x.lat} />
          <section>
            <h3>{L("Related news")}</h3>
            {related.length === 0 && <Empty text={L("Nothing in the current news cycle.")} />}
            {related.map((s) => <StoryRow key={s.id} s={s} />)}
          </section>
        </>
      );
    }
  }
}

const ADVICE = {
  1: "Exercise normal precautions",
  2: "Exercise increased caution",
  3: "Reconsider travel",
  4: "Do not travel",
};
const GROUP = {
  stations: "Space station",
  military: "Military",
  gnss: "Navigation (GNSS)",
  earth: "Earth observation",
};

function SatBody(props: { id: string }): JSX.Element {
  const [at, setAt] = useLocal(Date.now());
  useInterval(() => setAt(Date.now()), 2000);
  const t = P.satellite(props.id);
  if (!t) return <Empty text={L("Satellite not in the current catalog.")} />;
  const pos = position(t, new Date(at));
  return (
    <>
      <p class="eyebrow">{L("Satellite")} · {L(GROUP[t.group])}</p>
      <h1>{t.name}</h1>
      <Facts
        rows={[
          ["NORAD ID", t.id],
          [L("Altitude"), pos ? `${Math.round(pos.alt).toLocaleString(L("en-US"))} km` : "—"],
          [L("Speed"), pos ? `${pos.speed.toFixed(2)} km/s` : "—"],
          [L("Orbit"), `${period(t).toFixed(0)} min`],
          [L("Position"), pos ? `${pos.lat.toFixed(2)}, ${pos.lon.toFixed(2)}` : "—"],
        ]}
      />
      <p class="fine">
        {L(
          "Dashed line: ground track for one orbit. Positions are computed on this computer from CelesTrak orbital elements.",
        )}
      </p>
      <Open href={`https://celestrak.org/satcat/table-satcat.php?CATNR=${t.id}`} label={L("CelesTrak record")} />
    </>
  );
}

/** Session and first `src` go on before the guest starts; a new page navigates the same guest. Keyed on the URL we
 *  asked for: Electron rewrites `src` on redirects, and a re-render must not reload the page. */
const load = (el: HTMLElement, url: string) => {
  if (el.dataset.want === url) return;
  if (!el.dataset.want) el.setAttribute("partition", "persist:reader");
  el.dataset.want = url;
  el.setAttribute("src", url);
};

const api = serverFn<typeof reader>("reader");
/** One peek per URL per session: the panel re-renders (and remounts the reader) often. */
const peeks = new Map<string, Promise<{ text: string } | null>>();
const peek = (url: string) => {
  if (!peeks.has(url)) peeks.set(url, api.peek(url).catch(() => null));
  return peeks.get(url)!;
};

/** In-app web reader: a <webview> (own process, own session), never the system browser. The selection's details stay
 *  above the page; a link without one gets a back bar. Data files (CSV, XML, JSON, bulletins) would download
 *  instead of rendering, so the server peeks first and those show as text. */
function Reader(props: { url: string }): JSX.Element {
  const [doc, setDoc] = useLocal<{ url: string; text: string } | null>(null);
  useEffect(() => {
    const url = props.url;
    peek(url).then((d) => d && setDoc({ url, text: d.text }));
  }, [props.url]);
  const text = doc?.url === props.url ? doc.text : null;
  return (
    <div class="reader">
      {view.full ? null : view.pick
        ? (
          <div class="reader-head inspector-body">
            <Body />
          </div>
        )
        : (
          <header class="reader-bar">
            <button
              type="button"
              class="icon-btn"
              aria-label={L("Close page")}
              title={L("Close page")}
              onClick={() => view.read(null)}
            >
              <Icon name="close" size={16} />
            </button>
            <span class="reader-host" title={props.url}>{host(props.url)}</span>
          </header>
        )}
      {text === null
        ? <webview ref={(el: HTMLElement | null) => el && load(el, props.url)} />
        : <pre class="reader-text">{text}</pre>}
    </div>
  );
}

export function Inspector(): JSX.Element {
  const open = !!(view.pick || view.page);
  return (
    <aside
      class={`inspector${open ? " open" : ""}${view.page ? " wide" : ""}`}
      aria-label={L("Details")}
      aria-hidden={!open}
    >
      <button type="button" class="icon-btn close" aria-label={L("Close details")} onClick={() => view.select(null)}>
        <Icon name="close" size={16} />
      </button>
      {view.page ? <Reader url={view.page} /> : <div class="inspector-body">{view.pick && <Body />}</div>}
    </aside>
  );
}
