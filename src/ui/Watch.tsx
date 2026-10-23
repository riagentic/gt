// Watch tab: keywords you follow, their live matches, desktop alert switch.
import type { JSX } from "aio";
import { useLocal } from "aio/air";
import { watch } from "../cell/watch.ts";
import { Empty, Head } from "./bits.tsx";
import { Icon } from "./icons.tsx";
import { StoryRow } from "./rows.tsx";
import { L } from "./i18n.ts";
import { matches } from "./store.ts";

export function Watch(): JSX.Element {
  const [draft, setDraft] = useLocal("");
  const hits = matches();
  const add = () => {
    if (draft.trim().length < 2) return;
    watch.add(draft);
    setDraft("");
  };
  return (
    <div class="panel">
      <Head title={L("Watch")} />
      <div class="filters">
        <form class="search add" onSubmit={add}>
          <Icon name="plus" size={14} />
          <input
            aria-label={L("Add keyword")}
            placeholder={L("Add keyword, e.g. Taiwan")}
            value={draft}
            maxLength={60}
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          />
        </form>
        {watch.words.length > 0 && (
          <div class="chips">
            {watch.words.map((w) => (
              <span key={w} class="chip on removable">
                {w}
                <span class="count">{hits.filter((h) => h.w === w).length}</span>
                <button
                  type="button"
                  t={`unwatch_${w.replace(/\W+/g, "_")}`}
                  aria-label={L("Stop watching {w}", { w })}
                  onClick={() => watch.remove(w)}
                >
                  <Icon name="close" size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      <section>
        <label class="toggle">
          <span class="toggle-text">
            <span>{L("Desktop alerts")}</span>
            <small>{L("New stories for your keywords, red disaster alerts, M6.5+ earthquakes")}</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label={L("Desktop alerts")}
            checked={watch.alerts}
            onChange={(e) => watch.setAlerts((e.target as HTMLInputElement).checked)}
          />
        </label>
      </section>
      <section>
        <h3>
          {L("Matching stories")} <span class="count">{hits.length}</span>
        </h3>
        {watch.words.length === 0 && (
          <Empty text={L("Add keywords to follow countries, people, companies or topics across every feed.")} />
        )}
        {watch.words.length > 0 && hits.length === 0 && (
          <Empty text={L("No current stories match. You'll be notified when one appears.")} />
        )}
        {hits.slice(0, 150).map(({ s }) => <StoryRow key={s.id} s={s} />)}
      </section>
    </div>
  );
}
