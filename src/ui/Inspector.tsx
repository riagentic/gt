// Right-side detail panel for the current selection.
import type { JSX } from "aio";
import { useInterval, useLocal } from "aio/air";
import { news } from "../cell/news.ts";
import { risk } from "../cell/risk.ts";
import { view } from "../cell/view.ts";
import { COUNTRIES } from "../data/countries.ts";
import { atlas } from "../cell/atlas.ts";
import { SQUAWKS } from "../lib/alerts.ts";
import { ago, host } from "../lib/fmt.ts";
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
  SirenBody,
  SiteBody,
  WeatherBody,
  when,
} from "./Details.tsx";
import { Icon } from "./icons.tsx";
import { focus, StoryRow } from "./rows.tsx";
import * as P from "./pick.ts";
import { now, scores, stability, world } from "./store.ts";

function Body(): JSX.Element {
  const p = view.pick;
  if (!p) return <Empty text="Nothing selected." />;
  switch (p.kind) {
    case "story": {
      const s = P.story(p.id);
      if (!s) return <Empty text="This story has rolled off the feed." />;
      return (
        <>
          <p class="eyebrow">{s.source} · first reported {ago(s.first, now.value)} ago</p>
          <h1>{s.title}</h1>
          {s.summary && <p class="lede">{s.summary}</p>}
          <div class="tags">
            {s.places.map((id) => (
              <button
                type="button"
                key={id}
                t={`country_${id}`}
                class="chip"
                onClick={() => focus({ kind: "country", id })}
              >
                {COUNTRIES[id]?.name}
              </button>
            ))}
          </div>
          <Open href={s.link} label={`Read on ${host(s.link)}`} />
          {s.also.length > 0 && (
            <section>
              <h3>Also reported by {s.size - 1} {s.size - 1 === 1 ? "outlet" : "outlets"}</h3>
              {s.also.map((m) => (
                <a key={m.link} class="row" href={m.link} target="_blank" rel="noreferrer">
                  <span class="row-title">{m.title}</span>
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
      if (!c) return <Empty text="Unknown country." />;
      const a = scores.value.get(p.id);
      const b = band(a?.score ?? 0);
      const list = news.stories.filter((s) => s.places.includes(p.id)).slice(0, 40);
      const w = world.value;
      const haz = w ? [...P.hazardsIn(p.id, w.where)] : [];
      const adv = P.advisory(p.id);
      const sick = risk.outbreaks.filter((o) => o.places.includes(p.id)).slice(0, 6);
      return (
        <>
          <p class="eyebrow">Country</p>
          <h1>{c.name}</h1>
          <InstabilityCard x={stability.value.get(p.id) ?? { score: 0, parts: [] }} />
          <p class="fine">
            News activity {a?.score ?? 0} ({b.label.toLowerCase()}): {a?.stories ?? 0} stories · {a?.hazards ?? 0}{" "}
            hazard alerts in the last 24h.
          </p>
          {adv && (
            <a class={`advisory lv${adv.level}`} href={adv.url} target="_blank" rel="noreferrer">
              <b>Level {adv.level}</b>
              <span>{ADVICE[adv.level]}</span>
              <small>US travel advisory · {ago(adv.at, now.value)} ago</small>
            </a>
          )}
          {sick.length > 0 && (
            <section>
              <h3>Disease outbreaks</h3>
              {sick.map((o) => (
                <button
                  type="button"
                  key={o.id}
                  class="row compact"
                  onClick={() => focus({ kind: "outbreak", id: o.id })}
                >
                  <span class="row-title one">{o.title}</span>
                  <time>{ago(o.at, now.value)}</time>
                </button>
              ))}
            </section>
          )}
          {haz.length > 0 && (
            <section>
              <h3>Hazards</h3>
              {haz.slice(0, 8).map((h) => (
                <button
                  type="button"
                  key={h.id}
                  class="row compact"
                  onClick={() => focus(h.pick)}
                >
                  <span class="row-title one">{h.title}</span>
                  <time>{ago(h.at, now.value)}</time>
                </button>
              ))}
            </section>
          )}
          <CountryExtras id={p.id} />
          <section>
            <h3>News</h3>
            {list.length === 0 && <Empty text="No recent stories mention this country." />}
            {list.map((s) => <StoryRow key={s.id} s={s} />)}
          </section>
        </>
      );
    }
    case "quake": {
      const q = P.quake(p.id);
      if (!q) return <Empty text="This earthquake is no longer in the feed." />;
      return (
        <>
          <p class="eyebrow">Earthquake · USGS</p>
          <h1>M{q.mag.toFixed(1)} · {q.place}</h1>
          {q.tsunami && <p class="alert">Tsunami information issued — check local authorities.</p>}
          <Facts
            rows={[["Magnitude", q.mag.toFixed(1)], ["Depth", `${q.depth.toFixed(0)} km`], ["Time", when(q.at)], [
              "Location",
              `${q.lat.toFixed(2)}, ${q.lon.toFixed(2)}`,
            ]]}
          />
          {q.url && <Open href={q.url} label="USGS event page" />}
        </>
      );
    }
    case "event": {
      const e = P.event(p.id);
      if (!e) return <Empty text="This event has closed." />;
      return (
        <>
          <p class="eyebrow">{e.source}</p>
          <h1>{e.title}</h1>
          {e.level > 0 && (
            <p class={`alert lv${e.level}`}>
              {e.level === 2 ? "Red alert" : "Orange alert"} — significant humanitarian impact possible.
            </p>
          )}
          <Facts
            rows={[["Type", e.kind[0].toUpperCase() + e.kind.slice(1)], ["Since", when(e.at)], [
              "Location",
              `${e.lat.toFixed(2)}, ${e.lon.toFixed(2)}`,
            ]]}
          />
          {e.url && <Open href={e.url} label="Source report" />}
          <Imagery id={`event-${e.id}`} lon={e.lon} lat={e.lat} />
        </>
      );
    }
    case "plane": {
      const a = P.plane(p.id);
      if (!a) return <Empty text="Aircraft no longer transmitting." />;
      return (
        <>
          <p class="eyebrow">
            {a.sq in SQUAWKS ? `Squawk ${a.sq} · ${SQUAWKS[a.sq]}` : "Military aircraft"} · adsb.lol
          </p>
          <h1>{a.call || a.hex.toUpperCase()}</h1>
          <Facts
            rows={[
              ["Type", a.type || "—"],
              ["Registration", a.reg || "—"],
              ["Altitude", a.alt ? `${a.alt.toLocaleString()} ft` : "On ground"],
              ["Speed", `${a.spd} kt`],
              ["Heading", `${a.hdg}°`],
              ["Squawk", a.sq || "—"],
            ]}
          />
          <Open href={`https://globe.adsb.lol/?icao=${a.hex}`} label="Live track" />
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
      if (!o) return <Empty text="This notice is no longer listed." />;
      return (
        <>
          <p class="eyebrow">WHO · Disease Outbreak News</p>
          <h1>{o.title}</h1>
          <Facts rows={[["Published", when(o.at)]]} />
          <div class="tags">
            {o.places.map((id) => (
              <button
                type="button"
                key={id}
                class="chip"
                onClick={() => focus({ kind: "country", id })}
              >
                {COUNTRIES[id]?.name}
              </button>
            ))}
          </div>
          <Open href={o.url} label="Read WHO notice" />
        </>
      );
    }
    case "place": {
      const x = P.place(p.id);
      if (!x) return <Empty text="Unknown place." />;
      const words = x.name.toLowerCase().split(/\W+/).filter((t) =>
        t.length > 3 && !["strait", "canal", "border", "front", "civil", "eastern", "central"].includes(t)
      );
      const related = news.stories.filter((s) => words.some((t) => s.title.toLowerCase().includes(t))).slice(0, 20);
      const near = (t: { lon: number; lat: number }) => Math.hypot(t.lon - x.lon, t.lat - x.lat) < 2.5;
      const traffic = atlas.traffic.find(near);
      return (
        <>
          <p class="eyebrow">{x.kind === "chokepoint" ? "Maritime chokepoint" : "Flashpoint"}</p>
          <h1>{x.name}</h1>
          <p class="lede">{x.note}</p>
          {traffic && (
            <button type="button" class="link" onClick={() => focus({ kind: "chokepoint", id: traffic.id })}>
              Ship traffic: {traffic.ships}/day (30-day avg {traffic.avg}) →
            </button>
          )}
          <Imagery id={`place-${x.id}`} lon={x.lon} lat={x.lat} />
          <section>
            <h3>Related news</h3>
            {related.length === 0 && <Empty text="Nothing in the current news cycle." />}
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
  if (!t) return <Empty text="Satellite not in the current catalog." />;
  const pos = position(t, new Date(at));
  return (
    <>
      <p class="eyebrow">Satellite · {GROUP[t.group]}</p>
      <h1>{t.name}</h1>
      <Facts
        rows={[
          ["NORAD ID", t.id],
          ["Altitude", pos ? `${Math.round(pos.alt).toLocaleString()} km` : "—"],
          ["Speed", pos ? `${pos.speed.toFixed(2)} km/s` : "—"],
          ["Orbit", `${period(t).toFixed(0)} min`],
          ["Position", pos ? `${pos.lat.toFixed(2)}, ${pos.lon.toFixed(2)}` : "—"],
        ]}
      />
      <p class="fine">
        Dashed line: ground track for one orbit. Positions are computed on this computer from CelesTrak orbital
        elements.
      </p>
      <Open href={`https://celestrak.org/satcat/table-satcat.php?CATNR=${t.id}`} label="CelesTrak record" />
    </>
  );
}

export function Inspector(): JSX.Element {
  return (
    <aside class={view.pick ? "inspector open" : "inspector"} aria-label="Details" aria-hidden={!view.pick}>
      <button type="button" class="icon-btn close" aria-label="Close details" onClick={() => view.select(null)}>
        <Icon name="close" size={16} />
      </button>
      <div class="inspector-body">{view.pick && <Body />}</div>
    </aside>
  );
}
