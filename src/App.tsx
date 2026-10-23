// Shell: full-bleed map; floating rail + sidebar on the left, inspector on the right.
import type { JSX } from "aio";
import { onGlobalKey, onMount, onWindowEvent, useInterval } from "aio/air";
import { prefs, type Tab } from "./cell/prefs.ts";
import { view } from "./cell/view.ts";
import { Icon, type IconName } from "./ui/icons.tsx";
import { Inspector } from "./ui/Inspector.tsx";
import { MapView } from "./ui/Map.tsx";
import { Palette } from "./ui/Palette.tsx";
import { Events } from "./ui/Events.tsx";
import { Bets, Markets } from "./ui/Money.tsx";
import { Brief, Layers, News, Settings } from "./ui/panels.tsx";
import { Systems } from "./ui/Systems.tsx";
import { Tv, TvFloat } from "./ui/Tv.tsx";
import { Watch } from "./ui/Watch.tsx";
import { dark, loadSites, loadWorld, now } from "./ui/store.ts";

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
  { id: "settings", icon: "settings", label: "Settings", panel: Settings },
];

type AioWindow = { close(): void; minimize(): void; maximize(): void };

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
};

function Lights(): JSX.Element {
  const w = (globalThis as { __aioWindow?: AioWindow }).__aioWindow;
  if (!w) return <div class="lights-gap" />;
  return (
    <div class="lights">
      <button type="button" class="light close" aria-label="Close window" onClick={() => w.close()} />
      <button type="button" class="light min" aria-label="Minimize window" onClick={() => w.minimize()} />
      <button type="button" class="light max" aria-label="Zoom window" onClick={() => w.maximize()} />
    </div>
  );
}

export default function App(): JSX.Element {
  useInterval(() => now.set(Date.now()), 30_000);
  onMount(() => void loadWorld().then(loadSites));
  onGlobalKey("k", (e) => (e.preventDefault(), view.setPalette(true)), { mod: true });
  onGlobalKey("escape", (e) => !typing(e) && !view.palette && view.select(null));
  onGlobalKey("g", (e) => !typing(e) && prefs.setGlobe(!prefs.globe));
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
      <div class="drag" />
      <nav class="rail" aria-label="Sections">
        <Lights />
        {TABS.slice(0, -1).map((t) => (
          <button
            type="button"
            key={t.id}
            aria-label={t.label}
            title={t.label}
            class={prefs.sidebar && prefs.tab === t.id ? "tab on" : "tab"}
            onClick={() => prefs.setTab(t.id)}
          >
            <Icon name={t.icon} size={19} />
          </button>
        ))}
        <span class="grow" />
        <button type="button" aria-label="Search" title="Search  ⌘K" class="tab" onClick={() => view.setPalette(true)}>
          <Icon name="search" size={19} />
        </button>
        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          class={prefs.sidebar && prefs.tab === "settings" ? "tab on" : "tab"}
          onClick={() => prefs.setTab("settings")}
        >
          <Icon name="settings" size={19} />
        </button>
      </nav>
      <aside
        class={`sidebar${prefs.sidebar ? " open" : ""}${prefs.tab === "tv" && !prefs.tv.floating ? " wide" : ""}`}
        aria-label={active.label}
        aria-hidden={!prefs.sidebar}
      >
        <Panel />
      </aside>
      <Inspector />
      <TvFloat />
      <div class={view.pick ? "mapbar shifted" : "mapbar"}>
        <button
          type="button"
          class="icon-btn"
          aria-label={prefs.globe ? "Flat map" : "Globe"}
          title={prefs.globe ? "Flat map  G" : "Globe  G"}
          onClick={() => prefs.setGlobe(!prefs.globe)}
        >
          <Icon name={prefs.globe ? "map" : "globe"} size={18} />
        </button>
      </div>
      <Palette />
    </div>
  );
}
