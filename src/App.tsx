// Shell: full-bleed map; floating rail + sidebar on the left, inspector on the right.
import type { JSX } from "aio";
import { onGlobalKey, onMount, onWindowEvent, useInterval } from "aio/air";
import cfg from "../deno.json" with { type: "json" };
import { ai } from "./cell/ai.ts";
import { prefs, type Projection, PROJECTIONS, type Tab } from "./cell/prefs.ts";
import { tr } from "./cell/tr.ts";
import { view } from "./cell/view.ts";
import { Icon, type IconName } from "./ui/icons.tsx";
import { Ai } from "./ui/Ai.tsx";
import { Inspector } from "./ui/Inspector.tsx";
import { EqualMap } from "./ui/EqualMap.tsx";
import { MapView } from "./ui/Map.tsx";
import { Palette } from "./ui/Palette.tsx";
import { Events } from "./ui/Events.tsx";
import { Bets, Markets } from "./ui/Money.tsx";
import { Brief, Layers, News, Settings } from "./ui/panels.tsx";
import { Systems } from "./ui/Systems.tsx";
import { Tv, TvFloat } from "./ui/Tv.tsx";
import { Watch } from "./ui/Watch.tsx";
import { dark, loadSites, loadWorld, now } from "./ui/store.ts";
import { L, watchLang } from "./ui/i18n.ts";
import { watchPage } from "./ui/pagetr.ts";

const TABS: { id: Tab; icon: IconName; label: string; panel: () => JSX.Element }[] = [
  { id: "brief", icon: "brief", label: "Brief", panel: Brief },
  { id: "news", icon: "news", label: "News", panel: News },
  { id: "watch", icon: "bell", label: "Watch", panel: Watch },
  { id: "events", icon: "events", label: "Events", panel: Events },
  { id: "systems", icon: "pulse", label: "Systems", panel: Systems },
  { id: "markets", icon: "markets", label: "Markets", panel: Markets },
  { id: "bets", icon: "bets", label: "Predictions", panel: Bets },
  { id: "tv", icon: "tv", label: "Live TV", panel: Tv },
  { id: "layers", icon: "layers", label: "Layers", panel: Layers },
  { id: "ai", icon: "sparkle", label: "AI", panel: Ai },
  { id: "settings", icon: "settings", label: "Settings", panel: Settings },
];

/** Tabs at the foot of the rail, after Search: the app's own, not the world's. */
const BOTTOM = new Set<Tab>(["ai", "settings"]);

const railTab = (t: (typeof TABS)[number]): JSX.Element => (
  <button
    type="button"
    key={t.id}
    aria-label={L(t.label)}
    title={L(t.label)}
    class={[
      "tab",
      prefs.sidebar && prefs.tab === t.id && "on",
      t.id === "ai" && (ai.status.busy || tr.status.busy) && "working",
    ].filter(Boolean).join(" ")}
    onClick={() => prefs.setTab(t.id)}
  >
    <Icon name={t.icon} size={19} />
  </button>
);

type AioWindow = { close(): void; minimize(): void; maximize(): void };

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
};

const next = (p: Projection) => PROJECTIONS[(PROJECTIONS.indexOf(p) + 1) % PROJECTIONS.length];
const PROJ: Record<Projection, [IconName, string]> = {
  globe: ["globe", "Globe"],
  mercator: ["map", "Flat map"],
  equal: ["equal", "True-size map (Equal Earth)"],
};
export const ProjectionSwitch = (): JSX.Element => (
  <div class="proj" role="group" aria-label={L("Map type")}>
    {PROJECTIONS.map((p) => (
      <button
        type="button"
        key={p}
        class={prefs.projection === p ? "icon-btn on" : "icon-btn"}
        aria-label={L(PROJ[p][1])}
        aria-pressed={prefs.projection === p}
        title={`${L(PROJ[p][1])}  G`}
        onClick={() => prefs.setProjection(p)}
      >
        <Icon name={PROJ[p][0]} size={18} />
      </button>
    ))}
  </div>
);

function Lights(): JSX.Element {
  const w = (globalThis as { __aioWindow?: AioWindow }).__aioWindow;
  if (!w) return <div class="lights-gap" />;
  return (
    <div class="lights">
      <button type="button" class="light close" aria-label={L("Close window")} onClick={() => w.close()} />
      <button type="button" class="light min" aria-label={L("Minimize window")} onClick={() => w.minimize()} />
      <button type="button" class="light max" aria-label={L("Zoom window")} onClick={() => w.maximize()} />
    </div>
  );
}

export default function App(): JSX.Element {
  useInterval(() => now.set(Date.now()), 30_000);
  onMount(() => void loadWorld().then(loadSites));
  onMount(() => {
    const off = [...watchLang(), ...watchPage()];
    return () => off.forEach((f) => f());
  });
  onGlobalKey("k", (e) => (e.preventDefault(), view.setPalette(true)), { mod: true });
  onGlobalKey(
    "escape",
    (e) =>
      !typing(e) && !view.palette &&
      (view.full ? view.setFull(false) : view.page ? view.read(null) : view.select(null)),
  );
  // Every outside link opens in the in-app reader (right panel), never the system browser.
  onWindowEvent("click", (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a || !/^https?:/.test(a.href)) return;
    e.preventDefault();
    view.read(a.href);
  });
  onGlobalKey("g", (e) => !typing(e) && prefs.setProjection(next(prefs.projection)));
  onGlobalKey("\\", (e) => !typing(e) && prefs.toggleSidebar());
  onWindowEvent("keydown", (e: KeyboardEvent) => {
    const t = TABS[Number(e.key) - 1];
    if (t && !typing(e) && !e.metaKey && !e.ctrlKey && !e.altKey) prefs.setTab(t.id);
  });

  const active = TABS.find((t) => t.id === prefs.tab) ?? TABS[0];
  const Panel = active.panel;
  return (
    <div class="app" data-theme={dark.value ? "dark" : "light"}>
      <MapView />
      {prefs.projection === "equal" && <EqualMap />}
      <div class="drag" />
      <nav class="rail" aria-label={L("Sections")}>
        <Lights />
        {TABS.filter((t) => !BOTTOM.has(t.id)).map(railTab)}
        <span class="grow" />
        <button
          type="button"
          aria-label={L("Search")}
          title={`${L("Search")}  ⌘K`}
          class="tab"
          onClick={() => view.setPalette(true)}
        >
          <Icon name="search" size={19} />
        </button>
        {TABS.filter((t) => BOTTOM.has(t.id)).map(railTab)}
      </nav>
      <aside
        class={`sidebar${prefs.sidebar ? " open" : ""}${prefs.tab === "tv" && !prefs.tv.floating ? " wide" : ""}`}
        aria-label={L(active.label)}
        aria-hidden={!prefs.sidebar}
      >
        <Panel />
      </aside>
      <Inspector />
      <TvFloat />
      <div class={`mapbar${view.pick || view.page ? " shifted" : ""}${view.page ? " wide" : ""}`}>
        <div class="brand" aria-hidden="true">
          <b>globe today {cfg.version}</b>
          <span>{L("built with aio")}</span>
          <span>{L("by riagentic")}</span>
        </div>
        <ProjectionSwitch />
      </div>
      <Palette />
    </div>
  );
}
