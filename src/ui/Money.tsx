// Markets and Predictions tabs.
import type { JSX } from "aio";
import { useLocal } from "aio/air";
import { markets } from "../cell/markets.ts";
import { prefs } from "../cell/prefs.ts";
import { signals } from "../cell/signals.ts";
import { label } from "../lib/signals.ts";
import { compact } from "../lib/fmt.ts";
import { Empty, Fresh, Head } from "./bits.tsx";
import { C, L, locale, T } from "./i18n.ts";
import { MIN, QuoteRow } from "./rows.tsx";

const moodLabel = (v: number) =>
  v >= 75 ? "Extreme greed" : v >= 55 ? "Greed" : v > 45 ? "Neutral" : v > 25 ? "Fear" : "Extreme fear";

const Gauge = (props: { title: string; value: number; note?: string }): JSX.Element => (
  <div class="gauge">
    <span class="g-name">{props.title}</span>
    <span class="meter wide">
      <i style={{ width: `${props.value}%` }} class={props.value >= 55 ? "t1" : props.value <= 45 ? "t3" : "t2"} />
    </span>
    <b>{props.value}</b>
    <span class="muted one" title={props.note}>{L(moodLabel(props.value))}</span>
  </div>
);

export function Markets(): JSX.Element {
  const groups = [...new Set(markets.quotes.map((q) => q.group))];
  const m = markets.mood;
  return (
    <div class="panel">
      <Head title={L("Markets")}>
        <Fresh s={markets.status} stale={15 * MIN} />
      </Head>
      {markets.quotes.length === 0 && <Empty text={L("Loading quotes…")} />}
      {(m || markets.fear > 0) && (
        <section>
          <h3>{L("Sentiment")}</h3>
          {m && (
            <Gauge
              title={L("Stocks · CNN")}
              value={m.score}
              note={L("1 week ago {week} · 1 month ago {month}", { week: m.week, month: m.month })}
            />
          )}
          {markets.fear > 0 && <Gauge title={L("Crypto")} value={markets.fear} />}
        </section>
      )}
      {signals.now && <Signals />}
      {markets.rates.length > 0 && (
        <section>
          <h3>
            {L("Rates · debt")}
            <span class="grow" />
            <Fresh s={markets.macroStatus} stale={3 * 60 * MIN} />
          </h3>
          {markets.rates.map((r) => (
            <div key={r.label} class="quote kv" title={`${L(r.hint)} · ${r.date}`}>
              <span class="q-name">{L(r.label)}</span>
              <span class="q-price">{r.value}</span>
              <small class="muted">{r.date.slice(5)}</small>
            </div>
          ))}
        </section>
      )}
      {markets.policy.length > 0 && <CentralBanks />}
      {groups.map((g) => (
        <section key={g}>
          <h3>{L(g)}</h3>
          {markets.quotes.filter((q) => q.group === g).map((q) => <QuoteRow key={q.sym} q={q} />)}
        </section>
      ))}
      {markets.cot.length > 0 && (
        <section>
          <h3>{L("Speculator positioning · CFTC")}</h3>
          {markets.cot.map((c) => (
            <div
              key={c.name}
              class="quote cot"
              title={L("Net {net} contracts · {date}", { net: c.net.toLocaleString(), date: c.date })}
            >
              <span class="q-name">{L(c.name)}</span>
              <span class="bar">
                <i
                  class={c.pct >= 0 ? "up" : "down"}
                  style={{ width: `${Math.min(50, Math.abs(c.pct))}%`, [c.pct >= 0 ? "left" : "right"]: "50%" }}
                />
              </span>
              <span class={`q-chg ${c.pct >= 0 ? "up" : "down"}`}>
                {c.pct >= 0 ? L("net long") : L("net short")} {Math.abs(c.pct)}%
              </span>
            </div>
          ))}
          <p class="fine">
            {L("Non-commercial net position as a share of open interest, weekly report {date}.", {
              date: markets.cot[0].date,
            })}
          </p>
        </section>
      )}
      <p class="fine">{L("Prices delayed. Change vs. previous close (crypto: 24h).")}</p>
    </div>
  );
}

const signed = (n: number, digits = 1) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`;
/** + = bad for risk assets (red), − = good (green). */
const tone = (n: number, calm: number) => (n >= calm ? "down" : n <= -calm ? "up" : "");

/** Hourly risk-off pressure + prediction-market odds shifts; also written to signals.jsonl for quant tools. */
function Signals(): JSX.Element {
  const x = signals.now!;
  return (
    <section>
      <h3>
        {L("Signals")}
        <span class="grow" />
        <Fresh s={signals.status} stale={2 * 60 * MIN} />
      </h3>
      <div class="quote kv" title={L("Mean 4h z-score: VIX, dollar, 10Y yield up and S&P futures down push it up")}>
        <span class="q-name">{L("Risk pressure")}</span>
        <span class={`q-chg ${x.risk === null ? "" : tone(x.risk, 1.5)}`}>
          {x.risk === null ? "–" : signed(x.risk, 2)}
        </span>
        <small class="muted">{L(label(x.risk))}</small>
      </div>
      {x.legs.map((l) => (
        <div
          key={l.sym}
          class="quote kv"
          title={L("4h change {chg}% · {z}σ vs the last month", { chg: signed(l.chg, 2), z: signed(l.z, 2) })}
        >
          <span class="q-name">· {L(l.name)}</span>
          <span class="q-price">{signed(l.chg, 2)}%</span>
          <small class="muted">{signed(l.z, 1)}σ</small>
        </div>
      ))}
      {x.fed.map((m) => (
        <div
          key={m.title}
          class="quote kv"
          title={L("Polymarket: expected Fed move (+ = hike) and its change over 24h")}
        >
          <span class="q-name">{T(m.title.replace(/^Fed Decision in (\w+)\?$/, "Fed $1"))}</span>
          <span class="q-price">{signed(m.bps)} bps</span>
          <small class={`q-chg ${tone(m.shift, 2)}`}>{signed(m.shift)}</small>
        </div>
      ))}
      {x.recession && (
        <div class="quote kv" title={`Polymarket: ${T(x.recession.title)}`}>
          <span class="q-name">{L("US recession odds")}</span>
          <span class="q-price">{(x.recession.prob * 100).toFixed(1)}%</span>
          <small class={`q-chg ${tone(x.recession.shift * 100, 2)}`}>{signed(x.recession.shift * 100)}</small>
        </div>
      )}
      <p class="fine">
        {L(
          "Right column: σ = size of the 4-hour move vs the last month; odds = change in 24 hours. Red = risk-off, green = risk-on. Hourly snapshots are saved to signals.jsonl in the app's data folder.",
        )}
      </p>
    </section>
  );
}

/** "2025-07-14" → "Jul 25": when the rate was last set. */
const monthYear = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString(prefs.lang === "en" ? "en-GB" : locale(), {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });

/** A BIS area's name in the UI language (codes Intl doesn't name, like XM = euro area, stay English). */
const bank = (name: string, iso: string) => {
  const n = C(name, iso);
  return n === iso ? L(name) : n;
};

/** BIS policy rates, highest first; the first few, then "show all". */
function CentralBanks(): JSX.Element {
  const [all, setAll] = useLocal(false);
  const list = markets.policy;
  return (
    <section>
      <h3>
        {L("Central bank rates")} <span class="count">{list.length}</span>
      </h3>
      {list.slice(0, all ? list.length : 8).map((r) => (
        <div
          key={r.iso}
          class="quote kv"
          title={L("{name} · as of {date}", { name: bank(r.name, r.iso), date: r.date })}
        >
          <span class="q-name">{bank(r.name, r.iso)}</span>
          <span class="q-price">{r.rate.toFixed(2)}%</span>
          <small class="muted">{monthYear(r.date)}</small>
        </div>
      ))}
      {list.length > 8 && (
        <button type="button" class="link" onClick={() => setAll(!all)}>
          {all ? L("Show fewer") : L("Show all {n}", { n: list.length })}
        </button>
      )}
      <p class="fine">{L("Policy rates from the Bank for International Settlements.")}</p>
    </section>
  );
}

export function Bets(): JSX.Element {
  const [venue, setVenue] = useLocal<"all" | "Polymarket" | "Kalshi">("all");
  const list = markets.bets.filter((b) => venue === "all" || b.venue === venue)
    .sort((a, b) => b.vol - a.vol);
  return (
    <div class="panel">
      <Head title={L("Predictions")}>
        <Fresh s={markets.betStatus} stale={20 * MIN} />
      </Head>
      <div class="filters">
        <div class="seg wide" role="group" aria-label={L("Venue")}>
          {(["all", "Polymarket", "Kalshi"] as const).map((v) => (
            <button
              type="button"
              key={v}
              class={venue === v ? "on" : ""}
              onClick={() => setVenue(v)}
            >
              {v === "all" ? L("All") : v}
            </button>
          ))}
        </div>
      </div>
      <div class="list">
        {list.length === 0 && <Empty text={markets.betStatus.at ? L("No open markets.") : L("Loading markets…")} />}
        {list.map((b) => (
          <a key={b.id} class="row bet" href={b.url} target="_blank" rel="noreferrer" aria-label={T(b.title)}>
            <span class="row-title">{T(b.title)}</span>
            <span class="bet-line">
              <span class="meter">
                <i class="t0" style={{ width: `${Math.round(b.prob * 100)}%` }} />
              </span>
              <b>{Math.round(b.prob * 100)}%</b>
              <span class="one muted">{T(b.outcome)}</span>
            </span>
            <span class="row-meta">
              <span>{b.venue}</span>
              <span>{L("${vol} volume", { vol: compact(b.vol) })}</span>
              <span class="grow" />
              {b.end > 0 && (
                <time>
                  {L("ends")} {new Date(b.end).toLocaleDateString(locale(), {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </time>
              )}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
