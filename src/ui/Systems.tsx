// Systems tab: trade flows, internet services, planet.
import type { JSX } from "aio";
import { atlas } from "../cell/atlas.ts";
import { Fresh, Head } from "./bits.tsx";
import { Block } from "./Events.tsx";
import { MIN, PickRow } from "./rows.tsx";

export function Systems(): JSX.Element {
  const traffic = [...atlas.traffic].sort((a, b) => b.ships - a.ships);
  const down = atlas.services.filter((x) => x.level !== "ok");
  const hot = [...atlas.radiation].sort((a, b) => b.cpm - a.cpm);
  const odd = [...atlas.climate].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return (
    <div class="panel">
      <Head title="Systems" />
      <Block
        title="Chokepoint traffic"
        rows={traffic}
        layer="places"
        first={8}
        fresh={<Fresh s={atlas.trafficStatus} stale={36 * 60 * MIN} />}
        empty="Loading IMF PortWatch…"
        row={(t) => {
          const d = t.avg ? Math.round((100 * (t.ships - t.avg)) / t.avg) : 0;
          return (
            <PickRow
              key={t.id}
              pick={{ kind: "chokepoint", id: t.id }}
              title={t.name}
              aside={
                <span class="trend">
                  <b>{t.ships}</b>
                  <small class={d <= -25 ? "down" : d >= 25 ? "up" : "muted"}>{d >= 0 ? "+" : ""}{d}%</small>
                </span>
              }
            />
          );
        }}
      >
        <p class="fine">Ships per day on the latest day vs the 30-day average.</p>
      </Block>
      <section>
        <h3>
          Services {down.length > 0 && <span class="count t3">{down.length} down</span>}
          <span class="grow" />
          <Fresh s={atlas.serviceStatus} stale={15 * MIN} />
        </h3>
        <div class="services">
          {atlas.services.map((x) => (
            <a key={x.name} class={`svc ${x.level}`} href={x.url} target="_blank" rel="noreferrer" title={x.text}>
              <i />
              {x.name}
            </a>
          ))}
        </div>
      </section>
      {atlas.co2 && (
        <section>
          <h3>Atmospheric CO₂</h3>
          <div class="score-card">
            <b class="t2">{atlas.co2.ppm.toFixed(0)}</b>
            <div>
              <span>parts per million</span>
              <small>Mauna Loa, {atlas.co2.date}.</small>
              <small>
                {atlas.co2.delta >= 0 ? "+" : ""}
                {atlas.co2.delta} ppm vs a year ago ({atlas.co2.yearAgo.toFixed(1)}). Pre-industrial level: ~280.
              </small>
            </div>
          </div>
        </section>
      )}
      <Block
        title="Highest radiation"
        rows={hot}
        layer="radiation"
        first={5}
        fresh={<Fresh s={atlas.planetStatus} stale={6 * 60 * MIN} />}
        row={(x) => (
          <PickRow
            key={x.id}
            pick={{ kind: "sensor", id: x.id }}
            title={x.name || "Sensor"}
            aside={<span class={`count ${x.cpm >= 300 ? "t3" : x.cpm >= 100 ? "t2" : ""}`}>{x.cpm} CPM</span>}
          />
        )}
      >
        <p class="fine">Safecast sensors reporting in the last 3 days. Background is ~30–60 CPM.</p>
      </Block>
      <Block
        title="Temperature anomalies"
        rows={odd}
        layer="climate"
        first={6}
        row={(x) => (
          <PickRow
            key={x.id}
            pick={{ kind: "anomaly", id: x.id }}
            title={x.name}
            aside={<span class={x.delta > 0 ? "hot" : "cold"}>{x.delta > 0 ? "+" : ""}{x.delta}°C</span>}
          />
        )}
      >
        <p class="fine">
          Latest 7 days vs the 2001–2025 average for those dates, at each country's center (NASA POWER, ~3 days behind).
          Live and long-term values come from two NASA models: treat differences under ~2°C as noise.
        </p>
      </Block>
    </div>
  );
}
