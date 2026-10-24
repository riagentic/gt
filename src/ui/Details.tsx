// Inspector bodies for v0.3 kinds, plus shared cards: AI brief, satellite image, instability, country profile.
import type { JSX } from "aio";
import { useEffect } from "aio/air";
import { ai } from "../cell/ai.ts";
import { atlas } from "../cell/atlas.ts";
import { markets } from "../cell/markets.ts";
import { news } from "../cell/news.ts";
import { COUNTRIES } from "../data/countries.ts";
import { THREATS } from "../lib/alerts.ts";
import { compact, since as since_ } from "../lib/fmt.ts";
import { prefs } from "../cell/prefs.ts";
import { EURO } from "../lib/world.ts";
import { band, type Instability } from "../lib/score.ts";
import { Empty } from "./bits.tsx";
import { Icon } from "./icons.tsx";
import { C, L, locale, T } from "./i18n.ts";
import { focus, StoryRow } from "./rows.tsx";
import * as P from "./pick.ts";
import { now } from "./store.ts";

export const Open = (props: { href: string; label: string }): JSX.Element => (
  <a t="open_link" class="btn primary open-link" href={props.href} target="_blank" rel="noreferrer">
    {props.label} <Icon name="external" size={14} />
  </a>
);

export const Facts = (props: { rows: [string, JSX.Children][] }): JSX.Element => (
  <dl class="facts">
    {props.rows.flatMap(([k, v]) => [<dt key={`${k}-k`}>{k}</dt>, <dd key={`${k}-v`}>{v}</dd>])}
  </dl>
);

/** "5m ago" in the UI language. */
export const since = (at: number): string => since_(at, now.value, prefs.lang);

/** Date + time in the UI language's format. */
export const stamp = (at: number): string =>
  new Date(at).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" });

export const when = (at: number) => `${stamp(at)} · ${since(at)}`;

const at = (lat: number, lon: number) => `${lat.toFixed(2)}, ${lon.toFixed(2)}`;

/** Stories whose title mentions any of `words` (≥4 letters). */
const mentioning = (words: string[]) => {
  const ws = words.map((w) => w.toLowerCase()).filter((w) => w.length >= 4);
  return ws.length ? news.stories.filter((s) => ws.some((w) => s.title.toLowerCase().includes(w))).slice(0, 15) : [];
};

const Related = (props: { words: string[] }): JSX.Element => {
  const list = mentioning(props.words);
  return (
    <section>
      <h3>{L("Related news")}</h3>
      {list.length === 0 && <Empty text={L("Nothing in the current news cycle.")} />}
      {list.map((s) => <StoryRow key={s.id} s={s} />)}
    </section>
  );
};

// ── Shared cards ───────────────────────────────────────────────────────────

/** Latest cloud-free Sentinel-2 scene over a point (fetched on open, cached for the session). */
export function Imagery(props: { id: string; lon: number; lat: number }): JSX.Element {
  useEffect(() => void atlas.image(props.id, props.lon, props.lat), [props.id]);
  const img = atlas.images[props.id];
  return (
    <section>
      <h3>{L("Latest satellite image")}</h3>
      {img === undefined && <Empty text={L("Looking for a clear Sentinel-2 pass…")} />}
      {img === null && <Empty text={L("No clear scene found recently.")} />}
      {img && (
        <a class="sat-img" href={img.url} target="_blank" rel="noreferrer" title={L("Open full preview")}>
          <img src={img.url} alt={L("Sentinel-2 scene from {date}", { date: img.date })} loading="lazy" />
          <small>Sentinel-2 · {img.date} · {L("{n}% cloud", { n: img.cloud })} · {L("~110 km tile")}</small>
        </a>
      )}
    </section>
  );
}

/** Light markdown: lines → paragraphs/bullets, **bold**. */
const Md = (props: { text: string }): JSX.Element => (
  <div class="md">
    {props.text.split("\n").filter((l) => l.trim()).map((line, i) => {
      const bullet = /^\s*[-*•]\s+/.test(line);
      const parts = line.replace(/^\s*[-*•]\s+/, "").split(/\*\*(.+?)\*\*/g);
      const body = parts.map((p, j) => (j % 2 ? <b key={j}>{p}</b> : p));
      return bullet ? <p key={i} class="li">{body}</p> : <p key={i}>{body}</p>;
    })}
  </div>
);

/** Local-AI brief for a subject from the given headlines. */
export function AiBrief(props: { subject: string; id: string; headlines: string[] }): JSX.Element {
  const note = ai.notes[props.id];
  const busy = ai.status.busy;
  const ready = ai.ready;
  const live = ai.live?.key === props.id ? ai.live : null;
  return (
    <section class="ai">
      <h3>
        {L("AI brief")}
        <span class="grow" />
        {ready && props.headlines.length > 0 && (
          <button
            type="button"
            class="link"
            t={`ai_${props.id}`}
            disabled={busy}
            onClick={() => ai.summarize(props.subject, props.id, props.headlines.slice(0, 60))}
          >
            {busy ? L("Writing…") : note ? L("Refresh") : L("Write brief")}
          </button>
        )}
      </h3>
      {!ready && (
        <p class="fine">
          {L("AI is off: {why}.", { why: L(ai.link.err || "aipro is not running") })}{" "}
          {L("Briefs come from aipro, the local AI app. Start it, then")}{" "}
          <button type="button" class="link" onClick={() => ai.check()}>{L("check again")}</button>.
        </p>
      )}
      {ready && props.headlines.length === 0 && <Empty text={L("No headlines to summarize yet.")} />}
      {live
        ? (live.text
          ? <Md text={live.text} />
          : <p class="fine">{live.phase || L("starting")}{live.pct >= 0 ? ` ${Math.round(live.pct * 100)}%` : ""}…</p>)
        : note && <Md text={T(note.text)} />}
      {!live && note && (
        <p class="fine">
          {note.model} · {since(note.at)} · {L("from headlines only — verify.")}
          {note.note && ` ${note.note}`}
        </p>
      )}
      {!ai.status.ok && ai.status.err && <p class="fine err">{L(ai.status.err)}</p>}
    </section>
  );
}

export const InstabilityCard = (props: { x: Instability }): JSX.Element => {
  const b = band(props.x.score);
  return (
    <div class="score-card">
      <b class={`t${b.tone}`}>{props.x.score}</b>
      <div>
        <span class={`t${b.tone}`}>{L("Instability")} · {L(b.label)}</span>
        <ul class="parts">
          {props.x.parts.map((p) => (
            <li key={p.label}>
              <span>{L(p.label)}</span>
              <span class="meter">
                <i class={`t${b.tone}`} style={{ width: `${(100 * p.points) / p.max}%` }} />
              </span>
              <small>{p.points}</small>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

/** Country facts from World Bank, UNHCR and OFAC; empty when none are known. */
const profileRows = (iso: string): [string, JSX.Children][] => {
  const p = atlas.profiles[iso];
  if (!p) return [];
  const rows: [string, JSX.Children][] = [];
  if (p.pop) rows.push([L("Population"), compact(p.pop)]);
  if (p.gdp) rows.push([L("GDP"), `$${compact(p.gdp)}${p.gdpYear ? ` (${p.gdpYear})` : ""}`]);
  if (p.gdp && p.pop) rows.push([L("GDP per person"), `$${compact(p.gdp / p.pop)}`]);
  if (p.inflation !== undefined) rows.push([L("Inflation"), `${p.inflation}%`]);
  if (p.growth !== undefined) {
    rows.push([L("Growth {year} (IMF)", { year: new Date().getFullYear() }), `${p.growth > 0 ? "+" : ""}${p.growth}%`]);
  }
  if (p.debt !== undefined) rows.push([L("Government debt"), L("{n}% of GDP", { n: p.debt })]);
  const rate = markets.policy.find((r) => r.iso === (EURO.has(iso) ? "XM" : iso));
  if (rate) rows.push([EURO.has(iso) ? L("Policy rate (ECB)") : L("Policy rate"), `${rate.rate.toFixed(2)}%`]);
  if (p.refugees) rows.push([L("Refugees abroad"), compact(p.refugees)]);
  if (p.idps) rows.push([L("Displaced inside"), compact(p.idps)]);
  if (p.sanctioned) rows.push([L("OFAC-listed addresses"), compact(p.sanctioned)]);
  return rows;
};

// ── Bodies ─────────────────────────────────────────────────────────────────

export function WeatherBody(props: { id: string }): JSX.Element {
  const w = P.weather(props.id);
  if (!w) return <Empty text={L("This warning has expired.")} />;
  return (
    <>
      <p class="eyebrow">{L("Severe weather")} · {w.source}</p>
      <h1>{T(w.title)}</h1>
      <p class={`alert lv${w.severity === 1 ? 2 : 1}`}>{w.severity === 1 ? L("Extreme") : L("Severe")} — {T(w.area)}</p>
      <Facts
        rows={[
          [L("Country"), COUNTRIES[w.country] ? C(COUNTRIES[w.country].name, COUNTRIES[w.country].iso) : "—"],
          [L("From"), w.at ? when(w.at) : "—"],
          [
            L("Until"),
            w.until ? stamp(w.until) : "—",
          ],
        ]}
      />
      <Open href={w.url} label={L("Official warning")} />
    </>
  );
}

export function SirenBody(props: { id: string }): JSX.Element {
  const x = P.siren(props.id);
  if (!x) return <Empty text={L("This alert has rolled off the history.")} />;
  return (
    <>
      <p class="eyebrow">Israel Home Front Command · Tzeva Adom</p>
      <h1>{L(THREATS[x.threat] ?? "Alert")}</h1>
      <Facts rows={[[L("Time"), when(x.at)], [L("Places"), String(x.cities.length)]]} />
      <div class="tags">
        {x.cities.slice(0, 60).map((c) => <span key={c.en} class="chip">{c.en}</span>)}
      </div>
      <Open href="https://www.tzevaadom.co.il/en/" label="Tzeva Adom" />
    </>
  );
}

export function ProtestBody(props: { id: string }): JSX.Element {
  const x = P.protest(props.id);
  if (!x) return <Empty text={L("No longer in the last day of coverage.")} />;
  return (
    <>
      <p class="eyebrow">{L("Protest coverage")} · GDELT</p>
      <h1>{x.name}</h1>
      <Facts
        rows={[[L("Articles"), String(x.n)], [L("Tone"), L("{n} (negative = hostile)", { n: x.tone })], [
          L("Latest"),
          when(x.at),
        ]]}
      />
      <p class="fine">
        {L("Places named in news about protests in the last day. Coverage, not a confirmed event count.")}
      </p>
      <Open href={x.url} label={L("Latest article")} />
      <Related words={[x.name.split(",")[0]]} />
    </>
  );
}

const SITE_LABEL = {
  base: "Military base",
  nuclear: "Nuclear power plant",
  spaceport: "Spaceport",
  datacenter: "Data center",
  port: "Port",
};

export function SiteBody(props: { id: string }): JSX.Element {
  const x = P.site(props.id);
  if (!x) return <Empty text={L("Loading…")} />;
  const wiki = x.id.startsWith("Q");
  const country = COUNTRIES.findIndex((c) => c.iso === x.cc);
  return (
    <>
      <p class="eyebrow">{L(SITE_LABEL[x.kind])}</p>
      <h1>{x.title}</h1>
      <Facts
        rows={[
          [
            L("Country"),
            country >= 0
              ? (
                <button
                  type="button"
                  class="link"
                  onClick={() => focus({ kind: "country", id: country })}
                >
                  {C(COUNTRIES[country].name, COUNTRIES[country].iso)}
                </button>
              )
              : x.cc || "—",
          ],
          [L("Location"), at(x.lat, x.lon)],
        ]}
      />
      {wiki ? <Open href={`https://www.wikidata.org/wiki/${x.id}`} label="Wikidata" /> : (
        <Open
          href={`https://www.openstreetmap.org/?mlat=${x.lat}&mlon=${x.lon}#map=12/${x.lat}/${x.lon}`}
          label="OpenStreetMap"
        />
      )}
      <Imagery id={`site-${x.id}`} lon={x.lon} lat={x.lat} />
      <Related words={[x.title.replace(/\(.*\)/, "").trim()]} />
    </>
  );
}

export function ChokepointBody(props: { id: string }): JSX.Element {
  const x = P.chokepoint(props.id);
  if (!x) return <Empty text={L("No traffic data.")} />;
  const delta = x.avg ? Math.round((100 * (x.ships - x.avg)) / x.avg) : 0;
  return (
    <>
      <p class="eyebrow">{L("Ship traffic")} · IMF PortWatch</p>
      <h1>{x.name}</h1>
      <div class="score-card">
        <b class={delta <= -25 ? "t3" : delta <= -10 ? "t2" : "t0"}>{x.ships}</b>
        <div>
          <span>{L("ships on {date}", { date: x.date })}</span>
          <small>
            {L("30-day average {n}", { n: x.avg })} · {delta >= 0 ? "+" : ""}
            {delta}% · {L("{n} tankers", { n: x.tankers })}
          </small>
        </div>
      </div>
      <p class="fine">{L("Transits counted from AIS satellite data; the latest day lags by a few days.")}</p>
      <Open href="https://portwatch.imf.org/pages/chokepoints" label="PortWatch" />
      <Related words={[x.name.replace(/ (Strait|Canal|Channel)$/, "")]} />
    </>
  );
}

export function SensorBody(props: { id: string }): JSX.Element {
  const x = P.sensor(props.id);
  if (!x) return <Empty text={L("Sensor stopped reporting.")} />;
  return (
    <>
      <p class="eyebrow">{L("Radiation sensor")} · Safecast</p>
      <h1>{x.name || L("Sensor")}</h1>
      <div class="score-card">
        <b class={x.cpm >= 300 ? "t3" : x.cpm >= 100 ? "t2" : "t0"}>{x.cpm}</b>
        <div>
          <span>{L("counts per minute ≈ {n} µSv/h", { n: (x.cpm / 334).toFixed(2) })}</span>
          <small>{L("Normal background is about 30–60 CPM. Exclusion zones read higher.")}</small>
        </div>
      </div>
      <Facts rows={[[L("Reading"), when(x.at)], [L("Location"), at(x.lat, x.lon)]]} />
      <Open href={`https://map.safecast.org/?y=${x.lat}&x=${x.lon}&z=12`} label={L("Safecast map")} />
    </>
  );
}

export function AnomalyBody(props: { id: string }): JSX.Element {
  const x = P.anomaly(props.id);
  if (!x) return <Empty text={L("No data.")} />;
  const hot = x.delta > 0;
  return (
    <>
      <p class="eyebrow">{L("Temperature anomaly")} · ERA5</p>
      <h1>{C(x.name, x.id)}</h1>
      <div class="score-card">
        <b class={Math.abs(x.delta) >= 3 ? "t3" : Math.abs(x.delta) >= 1.5 ? "t2" : "t0"}>
          {hot ? "+" : ""}
          {x.delta}°
        </b>
        <div>
          <span>{hot ? L("warmer than normal") : L("colder than normal")}</span>
          <small>
            {L(
              "Latest 7 days {now}°C vs {normal}°C, the 1991–2020 normal for these dates · at the country's center. ERA5 lags ~5 days.",
              { now: x.now, normal: x.normal },
            )}
          </small>
        </div>
      </div>
      <button
        type="button"
        class="link"
        onClick={() => focus({ kind: "country", id: COUNTRIES.findIndex((c) => c.iso === x.id) })}
      >
        {L("Open {name}", { name: C(x.name, x.id) })}
      </button>
    </>
  );
}

/** Country extras: AI brief + profile, under the inspector's country header. */
export function CountryExtras(props: { id: number }): JSX.Element {
  const c = COUNTRIES[props.id];
  const headlines = news.stories.filter((s) => s.places.includes(props.id)).sort((a, b) =>
    b.size - a.size || b.at - a.at
  )
    .map((s) => s.title);
  const rows = profileRows(c.iso);
  return (
    <>
      <AiBrief subject={c.name} id={c.iso} headlines={headlines} />
      {rows.length > 0 && (
        <section>
          <h3>{L("Profile")}</h3>
          <Facts rows={rows} />
          <p class="fine">World Bank · IMF · BIS · UNHCR · US Treasury OFAC</p>
        </section>
      )}
    </>
  );
}
