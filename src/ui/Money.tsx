// Markets and Predictions tabs.
import type { JSX } from "aio";
import { useLocal } from "aio/air";
import { markets } from "../cell/markets.ts";
import { compact } from "../lib/fmt.ts";
import { Empty, Fresh, Head } from "./bits.tsx";
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
    <span class="muted one" title={props.note}>{moodLabel(props.value)}</span>
  </div>
);

export function Markets(): JSX.Element {
  const groups = [...new Set(markets.quotes.map((q) => q.group))];
  const m = markets.mood;
  return (
    <div class="panel">
      <Head title="Markets">
        <Fresh s={markets.status} stale={15 * MIN} />
      </Head>
      {markets.quotes.length === 0 && <Empty text="Loading quotes…" />}
      {(m || markets.fear > 0) && (
        <section>
          <h3>Sentiment</h3>
          {m && <Gauge title="Stocks · CNN" value={m.score} note={`1 week ago ${m.week} · 1 month ago ${m.month}`} />}
          {markets.fear > 0 && <Gauge title="Crypto" value={markets.fear} />}
        </section>
      )}
      {markets.rates.length > 0 && (
        <section>
          <h3>
            Rates · debt
            <span class="grow" />
            <Fresh s={markets.macroStatus} stale={3 * 60 * MIN} />
          </h3>
          {markets.rates.map((r) => (
            <div key={r.label} class="quote kv" title={`${r.hint} · ${r.date}`}>
              <span class="q-name">{r.label}</span>
              <span class="q-price">{r.value}</span>
              <small class="muted">{r.date.slice(5)}</small>
            </div>
          ))}
        </section>
      )}
      {markets.policy.length > 0 && <CentralBanks />}
      {groups.map((g) => (
        <section key={g}>
          <h3>{g}</h3>
          {markets.quotes.filter((q) => q.group === g).map((q) => <QuoteRow key={q.sym} q={q} />)}
        </section>
      ))}
      {markets.cot.length > 0 && (
        <section>
          <h3>Speculator positioning · CFTC</h3>
          {markets.cot.map((c) => (
            <div key={c.name} class="quote cot" title={`Net ${c.net.toLocaleString()} contracts · ${c.date}`}>
              <span class="q-name">{c.name}</span>
              <span class="bar">
                <i
                  class={c.pct >= 0 ? "up" : "down"}
                  style={{ width: `${Math.min(50, Math.abs(c.pct))}%`, [c.pct >= 0 ? "left" : "right"]: "50%" }}
                />
              </span>
              <span class={`q-chg ${c.pct >= 0 ? "up" : "down"}`}>
                {c.pct >= 0 ? "net long" : "net short"} {Math.abs(c.pct)}%
              </span>
            </div>
          ))}
          <p class="fine">
            Non-commercial net position as a share of open interest, weekly report {markets.cot[0].date}.
          </p>
        </section>
      )}
      <p class="fine">Prices delayed. Change vs. previous close (crypto: 24h).</p>
    </div>
  );
}

/** "2025-07-14" → "Jul 25": when the rate was last set. */
const monthYear = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });

/** BIS policy rates, highest first; the first few, then "show all". */
function CentralBanks(): JSX.Element {
  const [all, setAll] = useLocal(false);
  const list = markets.policy;
  return (
    <section>
      <h3>
        Central bank rates <span class="count">{list.length}</span>
      </h3>
      {list.slice(0, all ? list.length : 8).map((r) => (
        <div key={r.iso} class="quote kv" title={`${r.name} · as of ${r.date}`}>
          <span class="q-name">{r.name}</span>
          <span class="q-price">{r.rate.toFixed(2)}%</span>
          <small class="muted">{monthYear(r.date)}</small>
        </div>
      ))}
      {list.length > 8 && (
        <button type="button" class="link" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${list.length}`}
        </button>
      )}
      <p class="fine">Policy rates from the Bank for International Settlements.</p>
    </section>
  );
}

export function Bets(): JSX.Element {
  const [venue, setVenue] = useLocal<"all" | "Polymarket" | "Kalshi">("all");
  const list = markets.bets.filter((b) => venue === "all" || b.venue === venue)
    .sort((a, b) => b.vol - a.vol);
  return (
    <div class="panel">
      <Head title="Predictions">
        <Fresh s={markets.betStatus} stale={20 * MIN} />
      </Head>
      <div class="filters">
        <div class="seg wide" role="group" aria-label="Venue">
          {(["all", "Polymarket", "Kalshi"] as const).map((v) => (
            <button
              type="button"
              key={v}
              class={venue === v ? "on" : ""}
              onClick={() => setVenue(v)}
            >
              {v === "all" ? "All" : v}
            </button>
          ))}
        </div>
      </div>
      <div class="list">
        {list.length === 0 && <Empty text={markets.betStatus.at ? "No open markets." : "Loading markets…"} />}
        {list.map((b) => (
          <a key={b.id} class="row bet" href={b.url} target="_blank" rel="noreferrer" aria-label={b.title}>
            <span class="row-title">{b.title}</span>
            <span class="bet-line">
              <span class="meter">
                <i class="t0" style={{ width: `${Math.round(b.prob * 100)}%` }} />
              </span>
              <b>{Math.round(b.prob * 100)}%</b>
              <span class="one muted">{b.outcome}</span>
            </span>
            <span class="row-meta">
              <span>{b.venue}</span>
              <span>${compact(b.vol)} volume</span>
              <span class="grow" />
              {b.end > 0 && (
                <time>
                  ends{" "}
                  {new Date(b.end).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </time>
              )}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
