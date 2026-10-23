// Live TV: the docked tab and the floating in-app player (movable, resizable, closable, above everything).
import type { JSX } from "aio";
import { onWindowEvent, signal } from "aio/air";
import { prefs } from "../cell/prefs.ts";
import { clampRect, moveRect, type Rect, resizeRect } from "../lib/rect.ts";
import { guestScript, MUTED, readSound, type Sound } from "../lib/sound.ts";
import { Head } from "./bits.tsx";
import { Icon } from "./icons.tsx";

export const CHANNELS: [string, string][] = [
  ["Al Jazeera", "UCNye-wNBqNL5ZzHSJj3l8Bg"],
  ["DW News", "UCknLrEdhRCp1aegoMqRaCZg"],
  ["France 24", "UCQfwfsi5VrQ8yKZ-UWmAEFg"],
  ["Euronews", "UCSrZ3UV4jOidv8ppoVuvW9Q"],
  ["Sky News", "UCoMdktPbSTixAyNGwb-UYkQ"],
  ["Bloomberg", "UCIALMKvObZNtJ6AmdCLP7Lg"],
  ["NHK World", "UCSPEjw8F2nQDtmUKPFNF7_A"],
  ["CNA", "UC83jt4dlz1Gjl58fzQrrKZg"],
  ["TRT World", "UC7fWeaHhqgM4Ry-RMpM2YYw"],
  ["WION", "UC_gUM8rL-Lrg6O3adPW9K1g"],
  ["ABC Australia", "UCVgO39Bk5sMo66-6o6Spn6Q"],
  ["ABC News", "UCBi2mrWuNuyYy4gbM6fU18Q"],
  ["CBS News", "UC8p1vwvWtl6T73JiExfWs1g"],
  ["LiveNOW", "UCJg9wBPyKMNA5sRDnvzmkdg"],
  ["NASA", "UCLA_DiR1FfKNvjuUpBHmylQ"],
];

const url = (channel: string) =>
  `https://www.youtube-nocookie.com/embed/live_stream?channel=${channel}&autoplay=1&mute=1&playsinline=1`;

/** Last sound the viewer chose (mute, volume). A new channel, dock or pop-out starts with it. */
let sound: Sound = MUTED;

type Guest = HTMLElement & { executeJavaScript(code: string): Promise<unknown> };

/** Referrer and session go on before the first `src`: the first request already needs them. The renderer may reuse
 *  the element when the channel changes, so a new channel navigates it (Electron sends `httpreferrer` again).
 *  Each page load gets the current sound and reports changes back through the guest console. */
const play = (el: HTMLElement, channel: string) => {
  if (el.getAttribute("src") === url(channel)) return;
  if (!el.getAttribute("src")) {
    el.setAttribute("httpreferrer", "https://www.youtube-nocookie.com/");
    el.setAttribute("partition", "persist:tv");
    el.addEventListener("dom-ready", () => void (el as Guest).executeJavaScript(guestScript(sound)).catch(() => {}));
    el.addEventListener("console-message", (e) => {
      const s = readSound((e as Event & { message: string }).message ?? "");
      if (s) sound = s;
    });
  }
  el.setAttribute("src", url(channel));
};

/** A <webview>, not an <iframe>: the app page lives at aio://, which sends YouTube no Referer, and the embed then
 *  refuses to play (error 153). The guest page carries its own https referrer. */
const Player = (props: { channel: string }): JSX.Element => (
  <webview
    key={props.channel}
    ref={(el: HTMLElement | null) => el && play(el, props.channel)}
  />
);

const Channels = (): JSX.Element => (
  <div class="chips channels" role="tablist" aria-label="Channel">
    {CHANNELS.map(([name, id]) => (
      <button
        type="button"
        key={id}
        role="tab"
        aria-selected={prefs.tv.channel === id}
        class={prefs.tv.channel === id ? "chip on" : "chip"}
        onClick={() => prefs.setChannel(id)}
      >
        {name}
      </button>
    ))}
  </div>
);

// ── Drag + resize ──────────────────────────────────────────────────────────
// One gesture at a time. While it runs, a full-window shield sits on top: a <webview> is another process and
// would swallow the pointer the moment it passed over the video.
type Gesture = { mode: "move" | "resize"; x: number; y: number; from: Rect };
const gesture = signal<Gesture | null>(null);
/** The rect being dragged; shown instead of the stored one until the store has caught up. */
const live = signal<Rect | null>(null);
const viewport = () => ({ w: globalThis.innerWidth, h: globalThis.innerHeight });

function begin(e: PointerEvent, mode: Gesture["mode"], rendered: Rect): void {
  e.preventDefault();
  const from = live.peek() ?? rendered; // a gesture right after another starts where that one ended
  gesture.set({ mode, x: e.clientX, y: e.clientY, from });
  live.set(from);
  const move = (ev: PointerEvent) => {
    const g = gesture.peek();
    if (!g) return;
    const [dx, dy] = [ev.clientX - g.x, ev.clientY - g.y];
    live.set(g.mode === "move" ? moveRect(g.from, dx, dy, viewport()) : resizeRect(g.from, dx, dy, viewport()));
  };
  const end = () => {
    globalThis.removeEventListener("pointermove", move);
    globalThis.removeEventListener("pointerup", end);
    const r = live.peek();
    gesture.set(null);
    if (r) void prefs.moveTv(r).finally(() => live.set(null));
    else live.set(null);
  };
  globalThis.addEventListener("pointermove", move);
  globalThis.addEventListener("pointerup", end);
}

/** Pop out at the pointer, keeping the last floating size; the same press keeps dragging it. */
function popOut(e: PointerEvent): void {
  const { w, h } = prefs.tv.rect;
  const rect = clampRect({ x: e.clientX - w / 2, y: e.clientY - 16, w, h }, viewport());
  void prefs.floatTv(rect);
  begin(e, "move", rect);
}

/** Grip above the docked video: a short drag (or the button) pops it out. */
function grab(e: PointerEvent): void {
  if (e.button !== 0) return;
  const [x0, y0] = [e.clientX, e.clientY];
  const watch = (ev: PointerEvent) => {
    if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 12) return;
    stop();
    popOut(ev);
  };
  const stop = () => {
    globalThis.removeEventListener("pointermove", watch);
    globalThis.removeEventListener("pointerup", stop);
  };
  globalThis.addEventListener("pointermove", watch);
  globalThis.addEventListener("pointerup", stop);
}

// ── Docked tab ─────────────────────────────────────────────────────────────
export function Tv(): JSX.Element {
  const tv = prefs.tv;
  return (
    <div class="panel">
      <Head title="Live TV" />
      {tv.floating
        ? (
          <div class="tv tv-away">
            <p>Playing in the floating player.</p>
            <button type="button" class="btn" t="tv_dock_here" onClick={() => prefs.dockTv()}>
              <Icon name="sidebar" size={14} /> Bring it back here
            </button>
          </div>
        )
        : (
          <>
            <div
              class="tv-grip"
              t="tv_grip"
              title="Drag out to float the player"
              onPointerDown={(e) => grab(e as PointerEvent)}
            >
              <span class="dots" aria-hidden="true" />
              <span>Drag out to watch while you work</span>
              <span class="grow" />
              <button
                type="button"
                class="link"
                t="tv_pop"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  const { w, h } = tv.rect;
                  const v = viewport();
                  void prefs.floatTv(clampRect({ x: v.w - w - 24, y: v.h - h - 76, w, h }, v)); // clear of the map buttons
                }}
              >
                Pop out
              </button>
            </div>
            <div class="tv">
              <Player channel={tv.channel} />
            </div>
          </>
        )}
      <Channels />
      <p class="fine">Streams start muted. Played by YouTube; a channel that is off air shows YouTube's notice.</p>
    </div>
  );
}

// ── Floating player ────────────────────────────────────────────────────────
export function TvFloat(): JSX.Element {
  // Keep it reachable when the window shrinks.
  onWindowEvent("resize", () => {
    if (!prefs.tv.floating) return;
    const r = prefs.tv.rect, c = clampRect(r, viewport());
    if (c.x !== r.x || c.y !== r.y || c.w !== r.w || c.h !== r.h) void prefs.moveTv(c);
  });
  const tv = prefs.tv;
  const g = gesture.value;
  if (!tv.floating) return <>{g && <div class={`shield ${g.mode}`} />}</>;
  const r = live.value ?? tv.rect;
  return (
    <>
      <section
        class={`tv-float${g ? " busy" : ""}`}
        aria-label="Live TV player"
        style={{ left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` }}
      >
        <header
          t="tv_title"
          onPointerDown={(e) => (e as PointerEvent).button === 0 && begin(e as PointerEvent, "move", r)}
          onDblClick={() => prefs.dockTv()}
          title="Drag to move · double-click to dock"
        >
          <span class="live-dot" />
          <select
            aria-label="Channel"
            value={tv.channel}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => prefs.setChannel((e.target as HTMLSelectElement).value)}
          >
            {CHANNELS.map(([name, id]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <span class="grow" />
          <button
            type="button"
            class="icon-btn"
            t="tv_dock"
            aria-label="Dock in Live TV tab"
            title="Dock"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => prefs.dockTv()}
          >
            <Icon name="sidebar" size={15} />
          </button>
          <button
            type="button"
            class="icon-btn"
            t="tv_close"
            aria-label="Close player"
            title="Close"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => prefs.closeTv()}
          >
            <Icon name="close" size={15} />
          </button>
        </header>
        <div class="tv-body">
          <Player channel={tv.channel} />
        </div>
        <i
          class="tv-resize"
          t="tv_resize"
          aria-hidden="true"
          onPointerDown={(e) => (e as PointerEvent).button === 0 && begin(e as PointerEvent, "resize", r)}
        />
      </section>
      {g && <div class={`shield ${g.mode}`} />}
    </>
  );
}
