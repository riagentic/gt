// Events tab: everything that is happening now, worst first.
import type { JSX } from "aio";
import { useLocal } from "aio/air";
import { air } from "../cell/air.ts";
import { alerts } from "../cell/alerts.ts";
import { hazards } from "../cell/hazards.ts";
import { layers } from "../cell/layers.ts";
import { type LayerId, prefs } from "../cell/prefs.ts";
import { risk } from "../cell/risk.ts";
import { sky } from "../cell/sky.ts";
import { COUNTRIES } from "../data/countries.ts";
import { SQUAWKS, THREATS } from "../lib/alerts.ts";
import { Empty, Fresh, Head } from "./bits.tsx";
import { EventRow, MIN, PickRow, QuakeRow, ShowOnMap } from "./rows.tsx";
import { C, L, T } from "./i18n.ts";
import { now } from "./store.ts";

/** A titled list section with a count, freshness, "show on map" and "show all". */
export function Block<T>(props: {
  title: string;
  rows: T[];
  row: (x: T) => JSX.Element;
  layer?: LayerId;
  fresh?: JSX.Element;
  empty?: string;
  first?: number;
  aside?: JSX.Element;
  children?: JSX.Children;
}): JSX.Element {
  const [all, setAll] = useLocal(false);
  const first = props.first ?? 6;
  return (
    <section>
      <h3>
        {props.title} <span class="count">{props.rows.length}</span>
        <span class="grow" />
        {props.aside}
        {props.fresh}
      </h3>
      {props.layer && <ShowOnMap id={props.layer} />}
      {props.children}
      {props.rows.length === 0 && props.empty && <Empty text={props.empty} />}
      {props.rows.slice(0, all ? 150 : first).map(props.row)}
      {props.rows.length > first && (
        <button type="button" class="link" onClick={() => setAll(!all)}>
          {all ? L("Show fewer") : L("Show all {n}", { n: props.rows.length })}
        </button>
      )}
    </section>
  );
}

const DAY = 24 * 60 * MIN;

export function Events(): JSX.Element {
  const quakes = hazards.quakes.filter((q) => q.mag >= prefs.minMag);
  const sirens = alerts.sirens.filter((x) => now.value - x.at < DAY);
  return (
    <div class="panel">
      <Head title={L("Events")}>
        <Fresh s={hazards.status} stale={15 * MIN} />
      </Head>
      <Block
        title={L("Earthquakes")}
        rows={quakes}
        row={(q) => <QuakeRow key={q.id} q={q} />}
        empty={L("No earthquakes at this magnitude.")}
        aside={
          <span class="seg" role="group" aria-label={L("Minimum magnitude")}>
            {[2.5, 4.5, 6].map((m) => (
              <button
                type="button"
                key={m}
                class={prefs.minMag === m ? "on" : ""}
                onClick={() => prefs.setMinMag(m)}
              >
                M{m}+
              </button>
            ))}
          </span>
        }
      />
      <Block title={L("Disasters")} rows={hazards.events} row={(e) => <EventRow key={e.id} e={e} />} first={8} />
      <Block
        title={L("Severe weather")}
        rows={alerts.weather}
        layer="weather"
        fresh={<Fresh s={alerts.weatherStatus} stale={30 * MIN} />}
        empty={L("No severe or extreme warnings.")}
        row={(w) => (
          <PickRow
            key={w.id}
            pick={{ kind: "weather", id: w.id }}
            title={`${T(w.title)} · ${
              w.area.split(/[;,:]/)[0] ||
              (COUNTRIES[w.country] ? C(COUNTRIES[w.country].name, COUNTRIES[w.country].iso) : "")
            }`}
            at={w.at}
            lead={<span class={`lvl lv${w.severity === 1 ? 4 : 3}`}>{w.severity === 1 ? L("EXT") : L("SEV")}</span>}
          />
        )}
      />
      <Block
        title={L("Israel sirens · 24h")}
        rows={sirens}
        layer="sirens"
        fresh={<Fresh s={alerts.sirenStatus} stale={6 * MIN} />}
        empty={L("No sirens in the last 24 hours.")}
        row={(x) => (
          <PickRow
            key={x.id}
            pick={{ kind: "siren", id: x.id }}
            title={`${L(THREATS[x.threat] ?? "Alert")} · ${x.cities.slice(0, 3).map((c) => c.en).join(", ")}${
              x.cities.length > 3 ? ` +${x.cities.length - 3}` : ""
            }`}
            at={x.at}
            lead={<span class="kind k-siren" />}
          />
        )}
      />
      <Block
        title={L("Aircraft emergencies")}
        rows={alerts.squawks}
        layer="squawks"
        fresh={<Fresh s={alerts.aviationStatus} stale={6 * MIN} />}
        empty={L("No aircraft squawking 7500, 7600 or 7700.")}
        row={(a) => (
          <PickRow
            key={a.hex}
            pick={{ kind: "plane", id: a.hex }}
            title={`${SQUAWKS[a.sq] ? L(SQUAWKS[a.sq]) : a.sq} · ${a.call || a.hex.toUpperCase()}${
              a.type ? ` · ${a.type}` : ""
            }`}
            lead={<span class="lvl lv4">{a.sq}</span>}
            aside={<small class="muted">{a.alt ? `${Math.round(a.alt / 100) * 100} ft` : L("ground")}</small>}
          />
        )}
      />
      <Block
        title={L("US airport delays")}
        rows={alerts.airports}
        empty={L("No FAA ground stops or delays.")}
        row={(x) => (
          <div key={`${x.code}-${x.kind}`} class="row compact static">
            <span class={`lvl ${x.kind === "Ground stop" || x.kind === "Closure" ? "lv4" : "lv3"}`}>{x.code}</span>
            <span class="row-title one" title={x.detail}>{L(x.kind)} · {T(x.reason)}</span>
            <small class="muted one">{x.detail}</small>
          </div>
        )}
      />
      <Block
        title={L("Protests · 24h")}
        rows={alerts.protests}
        layer="protests"
        fresh={<Fresh s={alerts.protestStatus} stale={2 * 60 * MIN} />}
        row={(p) => (
          <PickRow
            key={p.id}
            pick={{ kind: "protest", id: p.id }}
            title={p.name}
            lead={<span class="kind k-protest" />}
            aside={<span class="count">{p.n}</span>}
          />
        )}
      >
        <p class="fine">{L("Places named in protest news coverage (GDELT). More articles, bigger dot.")}</p>
      </Block>
      <section>
        <h3>
          {L("Military aircraft")} <span class="count">{air.planes.length}</span>
          <span class="grow" />
          <Fresh s={air.status} stale={6 * MIN} />
        </h3>
        <ShowOnMap id="air" />
      </section>
      <Block
        title={L("Disease outbreaks")}
        rows={risk.outbreaks}
        layer="health"
        fresh={<Fresh s={risk.status} stale={8 * 60 * MIN} />}
        row={(o) => (
          <PickRow
            key={o.id}
            pick={{ kind: "outbreak", id: o.id }}
            title={T(o.title)}
            at={o.at}
            lead={<span class="kind k-health" />}
          />
        )}
      />
      <Block
        title={L("Do not travel / reconsider")}
        rows={risk.advisories.filter((a) => a.level >= 3)}
        layer="advisories"
        first={10}
        row={(a) => (
          <PickRow
            key={a.place}
            pick={{ kind: "country", id: a.place }}
            title={COUNTRIES[a.place] ? C(COUNTRIES[a.place].name, COUNTRIES[a.place].iso) : a.name}
            lead={<span class={`lvl lv${a.level}`}>L{a.level}</span>}
          />
        )}
      />
      <section>
        <h3>
          {L("GPS interference")}
          <span class="grow" />
          <Fresh s={layers.jamStatus} stale={36 * 60 * MIN} />
        </h3>
        {layers.jam.date && (
          <p class="fine">
            {L(
              "{high} areas with heavy and {medium} with moderate GPS degradation reported by aircraft on {date} (gpsjam.org).",
              {
                high: layers.jam.high,
                medium: layers.jam.medium,
                date: layers.jam.date,
              },
            )}
          </p>
        )}
        <ShowOnMap id="jam" />
      </section>
      <section>
        <h3>
          {L("Satellites")} <span class="count">{sky.tles.length}</span>
          <span class="grow" />
          <Fresh s={sky.status} stale={12 * 60 * MIN} />
        </h3>
        <ShowOnMap id="sats" />
        {prefs.layers.sats && <p class="fine">{L("Click a satellite on the map to see its orbit.")}</p>}
      </section>
    </div>
  );
}
