// Inspector bodies for v0.3 kinds, plus shared cards: AI brief, satellite image, instability, country profile.
import type { JSX } from "aio";
import { useEffect } from "aio/air";
import { ai } from "../cell/ai.ts";
import { atlas } from "../cell/atlas.ts";
import { markets } from "../cell/markets.ts";
import { news } from "../cell/news.ts";
import { COUNTRIES } from "../data/countries.ts";
import { THREATS } from "../lib/alerts.ts";
import { ago, compact } from "../lib/fmt.ts";
import { EURO } from "../lib/world.ts";
import { band, type Instability } from "../lib/score.ts";
import { Empty } from "./bits.tsx";
import { Icon } from "./icons.tsx";
import { focus, StoryRow } from "./rows.tsx";
import * as P from "./pick.ts";
import { now } from "./store.ts";

export const Open = (props: { href: string; label: string }): JSX.Element => (
  <a class="btn primary" href={props.href} target="_blank" rel="noreferrer">
    {props.label} <Icon name="external" size={14} />
  </a>
);

export const Facts = (props: { rows: [string, JSX.Children][] }): JSX.Element => (
  <dl class="facts">
    {props.rows.flatMap(([k, v]) => [<dt key={`${k}-k`}>{k}</dt>, <dd key={`${k}-v`}>{v}</dd>])}
  </dl>
);

export const when = (at: number) =>
  `${new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · ${ago(at, now.value)} ago`;

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
      <h3>Related news</h3>
      {list.length === 0 && <Empty text="Nothing in the current news cycle." />}
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
      <h3>Latest satellite image</h3>
      {img === undefined && <Empty text="Looking for a clear Sentinel-2 pass…" />}
      {img === null && <Empty text="No clear scene found recently." />}
      {img && (
        <a class="sat-img" href={img.url} target="_blank" rel="noreferrer" title="Open full preview">
          <img src={img.url} alt={`Sentinel-2 scene from ${img.date}`} loading="lazy" />
          <small>Sentinel-2 · {img.date} · {img.cloud}% cloud · ~110 km tile</small>
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
  const ready = ai.models.length > 0;
  return (
    <section class="ai">
      <h3>
        AI brief
        <span class="grow" />
        {ready && props.headlines.length > 0 && (
          <button
            type="button"
            class="link"
            t={`ai_${props.id}`}
            disabled={busy}
            onClick={() => ai.summarize(props.subject, props.id, props.headlines.slice(0, 60))}
          >
            {busy ? "Writing…" : note ? "Refresh" : "Write brief"}
          </button>
        )}
      </h3>
      {!ready && (
        <p class="fine">
          Runs on this computer with{" "}
          <a href="https://ollama.com" target="_blank" rel="noreferrer">Ollama</a>. Install it, run{" "}
          <code>ollama pull qwen3:1.7b</code>, then pick the model in Settings.
        </p>
      )}
      {ready && props.headlines.length === 0 && <Empty text="No headlines to summarize yet." />}
      {note && <Md text={note.text} />}
      {note && <p class="fine">{note.model} · {ago(note.at, now.value)} ago · from headlines only — verify.</p>}
      {!ai.status.ok && ai.status.err && <p class="fine err">{ai.status.err}</p>}
    </section>
  );
}

export const InstabilityCard = (props: { x: Instability }): JSX.Element => {
  const b = band(props.x.score);
  return (
    <div class="score-card">
      <b class={`t${b.tone}`}>{props.x.score}</b>
      <div>
        <span class={`t${b.tone}`}>Instability · {b.label}</span>
        <ul class="parts">
          {props.x.parts.map((p) => (
            <li key={p.label}>
              <span>{p.label}</span>
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
  if (p.pop) rows.push(["Population", compact(p.pop)]);
  if (p.gdp) rows.push(["GDP", `$${compact(p.gdp)}${p.gdpYear ? ` (${p.gdpYear})` : ""}`]);
  if (p.gdp && p.pop) rows.push(["GDP per person", `$${compact(p.gdp / p.pop)}`]);
  if (p.inflation !== undefined) rows.push(["Inflation", `${p.inflation}%`]);
  if (p.growth !== undefined) {
    rows.push([`Growth ${new Date().getFullYear()} (IMF)`, `${p.growth > 0 ? "+" : ""}${p.growth}%`]);
  }
  if (p.debt !== undefined) rows.push(["Government debt", `${p.debt}% of GDP`]);
  const rate = markets.policy.find((r) => r.iso === (EURO.has(iso) ? "XM" : iso));
  if (rate) rows.push([EURO.has(iso) ? "Policy rate (ECB)" : "Policy rate", `${rate.rate.toFixed(2)}%`]);
  if (p.refugees) rows.push(["Refugees abroad", compact(p.refugees)]);
  if (p.idps) rows.push(["Displaced inside", compact(p.idps)]);
  if (p.sanctioned) rows.push(["OFAC-listed addresses", compact(p.sanctioned)]);
  return rows;
};

// ── Bodies ─────────────────────────────────────────────────────────────────

export function WeatherBody(props: { id: string }): JSX.Element {
  const w = P.weather(props.id);
  if (!w) return <Empty text="This warning has expired." />;
  return (
    <>
      <p class="eyebrow">Severe weather · {w.source}</p>
      <h1>{w.title}</h1>
      <p class={`alert lv${w.severity === 1 ? 2 : 1}`}>{w.severity === 1 ? "Extreme" : "Severe"} — {w.area}</p>
      <Facts
        rows={[
          ["Country", COUNTRIES[w.country]?.name ?? "—"],
          ["From", w.at ? when(w.at) : "—"],
          [
            "Until",
            w.until ? new Date(w.until).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—",
          ],
        ]}
      />
      <Open href={w.url} label="Official warning" />
    </>
  );
}

export function SirenBody(props: { id: string }): JSX.Element {
  const x = P.siren(props.id);
  if (!x) return <Empty text="This alert has rolled off the history." />;
  return (
    <>
      <p class="eyebrow">Israel Home Front Command · Tzeva Adom</p>
      <h1>{THREATS[x.threat] ?? "Alert"}</h1>
      <Facts rows={[["Time", when(x.at)], ["Places", String(x.cities.length)]]} />
      <div class="tags">
        {x.cities.slice(0, 60).map((c) => <span key={c.en} class="chip">{c.en}</span>)}
      </div>
      <Open href="https://www.tzevaadom.co.il/en/" label="Tzeva Adom" />
    </>
  );
}

export function ProtestBody(props: { id: string }): JSX.Element {
  const x = P.protest(props.id);
  if (!x) return <Empty text="No longer in the last day of coverage." />;
  return (
    <>
      <p class="eyebrow">Protest coverage · GDELT</p>
      <h1>{x.name}</h1>
      <Facts
        rows={[["Articles", String(x.n)], ["Tone", `${x.tone} (negative = hostile)`], ["Latest", when(x.at)]]}
      />
      <p class="fine">Places named in news about protests in the last day. Coverage, not a confirmed event count.</p>
      <Open href={x.url} label="Latest article" />
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
  if (!x) return <Empty text="Loading…" />;
  const wiki = x.id.startsWith("Q");
  const country = COUNTRIES.findIndex((c) => c.iso === x.cc);
  return (
    <>
      <p class="eyebrow">{SITE_LABEL[x.kind]}</p>
      <h1>{x.title}</h1>
      <Facts
        rows={[
          [
            "Country",
            country >= 0
              ? (
                <button
                  type="button"
                  class="link"
                  onClick={() => focus({ kind: "country", id: country })}
                >
                  {COUNTRIES[country].name}
                </button>
              )
              : x.cc || "—",
          ],
          ["Location", at(x.lat, x.lon)],
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
  if (!x) return <Empty text="No traffic data." />;
  const delta = x.avg ? Math.round((100 * (x.ships - x.avg)) / x.avg) : 0;
  return (
    <>
      <p class="eyebrow">Ship traffic · IMF PortWatch</p>
      <h1>{x.name}</h1>
      <div class="score-card">
        <b class={delta <= -25 ? "t3" : delta <= -10 ? "t2" : "t0"}>{x.ships}</b>
        <div>
          <span>ships on {x.date}</span>
          <small>
            30-day average {x.avg} · {delta >= 0 ? "+" : ""}
            {delta}% · {x.tankers} tankers
          </small>
        </div>
      </div>
      <p class="fine">Transits counted from AIS satellite data; the latest day lags by a few days.</p>
      <Open href="https://portwatch.imf.org/pages/chokepoints" label="PortWatch" />
      <Related words={[x.name.replace(/ (Strait|Canal|Channel)$/, "")]} />
    </>
  );
}

export function SensorBody(props: { id: string }): JSX.Element {
  const x = P.sensor(props.id);
  if (!x) return <Empty text="Sensor stopped reporting." />;
  return (
    <>
      <p class="eyebrow">Radiation sensor · Safecast</p>
      <h1>{x.name || "Sensor"}</h1>
      <div class="score-card">
        <b class={x.cpm >= 300 ? "t3" : x.cpm >= 100 ? "t2" : "t0"}>{x.cpm}</b>
        <div>
          <span>counts per minute ≈ {(x.cpm / 334).toFixed(2)} µSv/h</span>
          <small>Normal background is about 30–60 CPM. Exclusion zones read higher.</small>
        </div>
      </div>
      <Facts rows={[["Reading", when(x.at)], ["Location", at(x.lat, x.lon)]]} />
      <Open href={`https://map.safecast.org/?y=${x.lat}&x=${x.lon}&z=12`} label="Safecast map" />
    </>
  );
}

export function AnomalyBody(props: { id: string }): JSX.Element {
  const x = P.anomaly(props.id);
  if (!x) return <Empty text="No data." />;
  const hot = x.delta > 0;
  return (
    <>
      <p class="eyebrow">Temperature anomaly · NASA POWER</p>
      <h1>{x.name}</h1>
      <div class="score-card">
        <b class={Math.abs(x.delta) >= 3 ? "t3" : Math.abs(x.delta) >= 1.5 ? "t2" : "t0"}>
          {hot ? "+" : ""}
          {x.delta}°
        </b>
        <div>
          <span>{hot ? "warmer" : "colder"} than normal</span>
          <small>
            Latest 7 days {x.now}°C vs{" "}
            {x.normal}°C, the 2001–2025 average for these dates · at the country's center. Data lags ~3 days; under ~2°C
            is within noise.
          </small>
        </div>
      </div>
      <button
        type="button"
        class="link"
        onClick={() => focus({ kind: "country", id: COUNTRIES.findIndex((c) => c.iso === x.id) })}
      >
        Open {x.name}
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
          <h3>Profile</h3>
          <Facts rows={rows} />
          <p class="fine">World Bank · IMF · BIS · UNHCR · US Treasury OFAC</p>
        </section>
      )}
    </>
  );
}
