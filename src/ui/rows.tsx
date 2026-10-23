// Shared list rows and selection helpers, used by every panel and the inspector.
import type { JSX } from "aio";
import { type LayerId, prefs } from "../cell/prefs.ts";
import { type Pick, view } from "../cell/view.ts";
import { COUNTRIES } from "../data/countries.ts";
import { ago, num, pct } from "../lib/fmt.ts";
import { C, L, T } from "./i18n.ts";
import type { Hazard, Quake, Quote } from "../lib/normalize.ts";
import type { Story } from "../lib/stories.ts";
import { Spark } from "./bits.tsx";
import { now } from "./store.ts";

export const MIN = 60_000;
const KIND_LABEL: Record<Hazard["kind"], string> = {
  wildfire: "Wildfire",
  storm: "Storm",
  volcano: "Volcano",
  flood: "Flood",
  drought: "Drought",
  quake: "Earthquake",
  ice: "Sea ice",
  other: "Event",
};

/** Select; the map centers on it. Picking the selected item again steps through: details → its page (the details'
 *  "open" link) under them → the page alone, filling the panel → details. One entry point so every list and the map
 *  behave the same. */
export const focus = (p: Pick | null): void => {
  if (!p || view.pick?.kind !== p.kind || view.pick.id !== p.id) return void view.select(p);
  if (view.page) return void (view.full ? view.read(null) : view.setFull(true));
  const a = document.querySelector<HTMLAnchorElement>(".inspector a.open-link");
  if (a) view.read(a.href);
};

export const picked = (kind: string, id: string | number) => view.pick?.kind === kind && view.pick.id === id;

export const StoryRow = (props: { s: Story }): JSX.Element => {
  const s = props.s;
  return (
    <button
      type="button"
      t={`story_${s.id}`}
      class={`row story ${picked("story", s.id) ? "on" : ""}`}
      aria-label={T(s.title)}
      onClick={() => focus({ kind: "story", id: s.id })}
    >
      <span class="row-title">{T(s.title)}</span>
      <span class="row-meta">
        <span>{s.source}</span>
        {s.size > 1 && <span class="pill">+{s.size - 1}</span>}
        {s.places.slice(0, 2).map((p) => (
          <span key={p} class="tag">{COUNTRIES[p] && C(COUNTRIES[p].name, COUNTRIES[p].iso)}</span>
        ))}
        <span class="grow" />
        <time>{ago(s.at, now.value, prefs.lang === "cs")}</time>
      </span>
    </button>
  );
};

/** A compact selectable row: lead badge, one-line title, trailing time or text. */
export const PickRow = (
  props: { pick: Pick; title: string; at?: number; lead?: JSX.Children; aside?: JSX.Children },
): JSX.Element => (
  <button
    type="button"
    class={`row compact ${picked(props.pick.kind, props.pick.id) ? "on" : ""}`}
    aria-label={props.title}
    onClick={() => focus(props.pick)}
  >
    {props.lead}
    <span class="row-title one">{props.title}</span>
    {props.aside ?? (props.at ? <time>{ago(props.at, now.value, prefs.lang === "cs")}</time> : null)}
  </button>
);

/** "Show on map" for a layer that is off. */
export const ShowOnMap = (props: { id: LayerId }): JSX.Element => (
  <>
    {!prefs.layers[props.id] && (
      <button type="button" class="link" onClick={() => prefs.setLayer(props.id, true)}>
        {L("Show on map")}
      </button>
    )}
  </>
);

export const QuakeRow = (props: { q: Quake }): JSX.Element => (
  <button
    type="button"
    class={`row compact ${picked("quake", props.q.id) ? "on" : ""}`}
    aria-label={`M${props.q.mag.toFixed(1)} ${T(props.q.place)}`}
    onClick={() => focus({ kind: "quake", id: props.q.id })}
  >
    <span class={`mag m${Math.min(7, Math.floor(props.q.mag))}`}>{props.q.mag.toFixed(1)}</span>
    <span class="row-title one">{props.q.place ? T(props.q.place) : L("Unknown location")}</span>
    <time>{ago(props.q.at, now.value, prefs.lang === "cs")}</time>
  </button>
);

export const EventRow = (props: { e: Hazard }): JSX.Element => (
  <button
    type="button"
    class={`row compact ${picked("event", props.e.id) ? "on" : ""}`}
    aria-label={T(props.e.title)}
    onClick={() => focus({ kind: "event", id: props.e.id })}
  >
    <span class={`kind k-${props.e.kind} lv${props.e.level}`} title={L(KIND_LABEL[props.e.kind])} />
    <span class="row-title one">{T(props.e.title)}</span>
    <time>{ago(props.e.at, now.value, prefs.lang === "cs")}</time>
  </button>
);

export const QuoteRow = (props: { q: Quote }): JSX.Element => {
  const q = props.q, up = q.chg >= 0;
  return (
    <div class="quote">
      <span class="q-name">{L(q.name)}</span>
      <Spark values={q.spark} up={up} w={48} />
      <span class="q-price">{num(q.price, q.price < 10 ? 3 : 2)}</span>
      <span class={`q-chg ${up ? "up" : "down"}`}>{pct(q.chg)}</span>
    </div>
  );
};
