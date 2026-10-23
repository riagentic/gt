// Systems tab: trade flows, internet services, planet.
import type { JSX } from "aio";
import { atlas } from "../cell/atlas.ts";
import { Fresh, Head } from "./bits.tsx";
import { Block } from "./Events.tsx";
import { C, L, T } from "./i18n.ts";
import { MIN, PickRow } from "./rows.tsx";

export function Systems(): JSX.Element {
  const traffic = [...atlas.traffic].sort((a, b) => b.ships - a.ships);
  const down = atlas.services.filter((x) => x.level !== "ok");
  const hot = [...atlas.radiation].sort((a, b) => b.cpm - a.cpm);
  const odd = [...atlas.climate].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return (
    <div class="panel">
      <Head title={L("Systems")} />
      <Block
        title={L("Chokepoint traffic")}
        rows={traffic}
        layer="places"
        first={8}
        fresh={<Fresh s={atlas.trafficStatus} stale={36 * 60 * MIN} />}
        empty={L("Loading IMF PortWatch…")}
        row={(t) => {
          const d = t.avg ? Math.round((100 * (t.ships - t.avg)) / t.avg) : 0;
          return (
            <PickRow
              key={t.id}
              pick={{ kind: "chokepoint", id: t.id }}
              title={T(t.name)}
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
        <p class="fine">{L("Ships per day on the latest day vs the 30-day average.")}</p>
      </Block>
      <section>
        <h3>
          {L("Services")} {down.length > 0 && <span class="count t3">{L("{n} down", { n: down.length })}</span>}
          <span class="grow" />
          <Fresh s={atlas.serviceStatus} stale={15 * MIN} />
        </h3>
        <div class="services">
          {atlas.services.map((x) => (
            <a key={x.name} class={`svc ${x.level}`} href={x.url} target="_blank" rel="noreferrer" title={T(x.text)}>
              <i />
              {x.name}
            </a>
          ))}
        </div>
      </section>
      {atlas.co2 && (
        <section>
          <h3>{L("Atmospheric CO₂")}</h3>
          <div class="score-card">
            <b class="t2">{atlas.co2.ppm.toFixed(0)}</b>
            <div>
              <span>{L("parts per million")}</span>
              <small>{L("Mauna Loa, {date}.", { date: atlas.co2.date })}</small>
              <small>
                {L("{d} ppm vs a year ago ({y}). Pre-industrial level: ~280.", {
                  d: `${atlas.co2.delta >= 0 ? "+" : ""}${atlas.co2.delta}`,
                  y: atlas.co2.yearAgo.toFixed(1),
                })}
              </small>
            </div>
          </div>
        </section>
      )}
      <Block
        title={L("Highest radiation")}
        rows={hot}
        layer="radiation"
        first={5}
        fresh={<Fresh s={atlas.planetStatus} stale={6 * 60 * MIN} />}
        row={(x) => (
          <PickRow
            key={x.id}
            pick={{ kind: "sensor", id: x.id }}
            title={x.name || L("Sensor")}
            aside={<span class={`count ${x.cpm >= 300 ? "t3" : x.cpm >= 100 ? "t2" : ""}`}>{x.cpm} CPM</span>}
          />
        )}
      >
        <p class="fine">{L("Safecast sensors reporting in the last 3 days. Background is ~30–60 CPM.")}</p>
      </Block>
      <Block
        title={L("Temperature anomalies")}
        rows={odd}
        layer="climate"
        first={6}
        row={(x) => (
          <PickRow
            key={x.id}
            pick={{ kind: "anomaly", id: x.id }}
            title={C(x.name, x.id)}
            aside={<span class={x.delta > 0 ? "hot" : "cold"}>{x.delta > 0 ? "+" : ""}{x.delta}°C</span>}
          />
        )}
      >
        <p class="fine">
          {L(
            "Latest 7 days vs the 1991–2020 normal for those dates, at each country's center. Both from ERA5 (Copernicus, via Open-Meteo), ~5 days behind.",
          )}
        </p>
      </Block>
    </div>
  );
}
