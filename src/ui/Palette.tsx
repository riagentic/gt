// ⌘K: one search box over countries, places, sites, stories, satellites and quakes.
import type { JSX } from "aio";
import { onGlobalKey, useLocal } from "aio/air";
import { hazards } from "../cell/hazards.ts";
import { news } from "../cell/news.ts";
import { type LayerId, prefs } from "../cell/prefs.ts";
import { sky } from "../cell/sky.ts";
import { type Pick, view } from "../cell/view.ts";
import { COUNTRIES } from "../data/countries.ts";
import { PLACES } from "../data/places.ts";
import { Icon, type IconName } from "./icons.tsx";
import { focus } from "./rows.tsx";
import { type Site, sites } from "./store.ts";

const SITE_SUB: Record<Site["kind"], string> = {
  base: "Military base",
  nuclear: "Nuclear power plant",
  spaceport: "Spaceport",
  datacenter: "Data center",
  port: "Port",
};
const SITE_LAYER: Record<Site["kind"], LayerId> = {
  base: "bases",
  nuclear: "nuclear",
  spaceport: "spaceports",
  datacenter: "datacenters",
  port: "ports",
};

type Hit = { key: string; icon: IconName; label: string; sub: string; pick: Pick };

function search(q: string): Hit[] {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  const has = (s: string) => s.toLowerCase().includes(t);
  return [
    ...COUNTRIES.map((c, id) => ({ c, id })).filter(({ c }) => has(c.name)).slice(0, 5)
      .map(({ c, id }): Hit => ({
        key: `c${id}`,
        icon: "globe",
        label: c.name,
        sub: "Country",
        pick: { kind: "country", id },
      })),
    ...PLACES.filter((p) => has(p.name)).slice(0, 4)
      .map((p): Hit => ({ key: p.id, icon: "pin", label: p.name, sub: p.note, pick: { kind: "place", id: p.id } })),
    ...news.stories.filter((s) => has(s.title)).slice(0, 8)
      .map((s): Hit => ({ key: s.id, icon: "news", label: s.title, sub: s.source, pick: { kind: "story", id: s.id } })),
    ...sky.tles.filter((t) => has(t.name)).slice(0, 4)
      .map((t): Hit => ({
        key: `sat${t.id}`,
        icon: "sat",
        label: t.name,
        sub: "Satellite",
        pick: { kind: "sat", id: t.id },
      })),
    ...[...(sites.value?.byId.values() ?? [])].filter((x) => has(x.title)).slice(0, 5)
      .map((x): Hit => ({
        key: `site${x.id}`,
        icon: "pin",
        label: x.title,
        sub: SITE_SUB[x.kind],
        pick: { kind: "site", id: x.id },
      })),
    ...hazards.quakes.filter((q) => has(q.place)).slice(0, 4)
      .map((q): Hit => ({
        key: q.id,
        icon: "wave",
        label: `M${q.mag.toFixed(1)} · ${q.place}`,
        sub: "Earthquake",
        pick: { kind: "quake", id: q.id },
      })),
  ];
}

export function Palette(): JSX.Element {
  return <>{view.palette && <Box />}</>;
}

function Box(): JSX.Element {
  const [q, setQ] = useLocal("");
  const [sel, setSel] = useLocal(0);
  const hits = search(q);
  const close = () => (view.setPalette(false), setQ(""), setSel(0));
  const go = (h: Hit | undefined) => {
    if (!h) return;
    if (h.pick.kind === "sat" && !prefs.layers.sats) prefs.setLayer("sats", true);
    const site = h.pick.kind === "site" ? sites.value?.byId.get(h.pick.id) : undefined;
    if (site && !prefs.layers[SITE_LAYER[site.kind]]) prefs.setLayer(SITE_LAYER[site.kind], true);
    focus(h.pick);
    close();
  };
  onGlobalKey("escape", close);
  return (
    <div class="scrim" role="presentation" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class="palette" role="dialog" aria-label="Search">
        <label class="palette-input">
          <Icon name="search" size={18} />
          <input
            aria-label="Search everything"
            placeholder="Search countries, places, stories, earthquakes…"
            value={q}
            ref={(el: HTMLElement | null) => void (el && queueMicrotask(() => el.focus()))}
            onInput={(e) => (setQ((e.target as HTMLInputElement).value), setSel(0))}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "ArrowDown") e.preventDefault(), setSel(Math.min(sel + 1, hits.length - 1));
              else if (e.key === "ArrowUp") e.preventDefault(), setSel(Math.max(sel - 1, 0));
              else if (e.key === "Enter") go(hits[sel]);
            }}
          />
          <kbd>esc</kbd>
        </label>
        {q && (
          <div class="hits" role="listbox">
            {hits.length === 0 && <p class="empty">No matches.</p>}
            {hits.map((h, i) => (
              <button
                type="button"
                key={h.key}
                role="option"
                aria-selected={i === sel}
                class={i === sel ? "hit on" : "hit"}
                onMouseEnter={() => setSel(i)}
                onClick={() => go(h)}
              >
                <Icon name={h.icon} size={16} />
                <span class="one">{h.label}</span>
                <small class="one">{h.sub}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
