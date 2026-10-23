// Live TV: the docked tab and the floating in-app player (movable, resizable, closable, above everything).
import type { JSX } from "aio";
import { onWindowEvent, signal, useEffect, useInterval } from "aio/air";
import { prefs } from "../cell/prefs.ts";
import { tvlive } from "../cell/tvlive.ts";
import { CHANNELS, GROUPS } from "../data/channels.ts";
import { clampRect, moveRect, type Rect, resizeRect } from "../lib/rect.ts";
import { guestScript, readSound, type Sound, START } from "../lib/sound.ts";
import { Head } from "./bits.tsx";
import { L } from "./i18n.ts";
import { Icon } from "./icons.tsx";

const EMBED = "autoplay=1&mute=1&playsinline=1";
/** What the player loads: a site for `page` channels; else the channel's current live video (from tvlive), or —
 *  before the first check — YouTube's "this channel's stream" embed, which fails for many live channels. */
const srcOf = (channel: string): string => {
  const page = CHANNELS.find((c) => c.id === channel)?.page;
  if (page) return page;
  const video = tvlive.videos[channel];
  return video
    ? `https://www.youtube-nocookie.com/embed/${video}?${EMBED}`
    : `https://www.youtube-nocookie.com/embed/live_stream?channel=${channel}&${EMBED}`;
};

/** Last sound the viewer chose (mute, volume); START until they touch it. A new channel, dock or pop-out starts with it. */
let sound: Sound = START;

type Guest = HTMLElement & { executeJavaScript(code: string): Promise<unknown> };

/** Referrer and session go on before the first `src`: the first request already needs them. The renderer may reuse
 *  the element when the channel changes, so a new channel navigates it (Electron sends `httpreferrer` again).
 *  Each page load gets the current sound and reports changes back through the guest console. */
const play = (el: HTMLElement, src: string) => {
  if (el.dataset.want === src) return; // keyed on what we asked for: sites rewrite `src` when they redirect
  if (!el.getAttribute("src")) {
    el.setAttribute("httpreferrer", "https://www.youtube-nocookie.com/");
    el.setAttribute("partition", "persist:tv");
    el.addEventListener("dom-ready", () => void (el as Guest).executeJavaScript(guestScript(sound)).catch(() => {}));
    el.addEventListener("console-message", (e) => {
      const s = readSound((e as Event & { message: string }).message ?? "");
      if (s) sound = s;
    });
  }
  el.dataset.want = src;
  el.setAttribute("src", src);
};

/** A <webview>, not an <iframe>: the app page lives at aio://, which sends YouTube no Referer, and the embed then
 *  refuses to play (error 153). The guest page carries its own https referrer. */
const Player = (props: { channel: string }): JSX.Element => {
  // Check who is on air while a player is showing (the cell does it at most every 30 min).
  useEffect(() => void tvlive.check(false), []);
  useInterval(() => void tvlive.check(false), 5 * 60_000);
  if (tvlive.videos[props.channel] === null) {
    const name = CHANNELS.find((c) => c.id === props.channel)?.name ?? L("This channel");
    return <p class="tv-off">{L("{name} is off air right now. Pick a channel that isn't greyed out.", { name })}</p>;
  }
  const src = srcOf(props.channel);
  return <webview key={props.channel} ref={(el: HTMLElement | null) => el && play(el, src)} />;
};

/** Channels by group; off-air ones (per the last check) are greyed. */
const Channels = (): JSX.Element => (
  <div class="channels" role="tablist" aria-label={L("Channel")}>
    {GROUPS.map((g) => (
      <section key={g}>
        <h3>{L(g)}</h3>
        <div class="chips">
          {CHANNELS.filter((c) => c.group === g).map(({ name, id }) => {
            const off = tvlive.videos[id] === null;
            return (
              <button
                type="button"
                key={id}
                role="tab"
                aria-selected={prefs.tv.channel === id}
                class={`chip${prefs.tv.channel === id ? " on" : ""}${off ? " off" : ""}`}
                title={off ? L("{name} · off air now", { name }) : name}
                onClick={() => prefs.setChannel(id)}
              >
                {name}
              </button>
            );
          })}
        </div>
      </section>
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
      <Head title={L("Live TV")} />
      {tv.floating
        ? (
          <div class="tv tv-away">
            <p>{L("Playing in the floating player.")}</p>
            <button type="button" class="btn" t="tv_dock_here" onClick={() => prefs.dockTv()}>
              <Icon name="sidebar" size={14} /> {L("Bring it back here")}
            </button>
          </div>
        )
        : (
          <>
            <div
              class="tv-grip"
              t="tv_grip"
              title={L("Drag out to float the player")}
              onPointerDown={(e) => grab(e as PointerEvent)}
            >
              <span class="dots" aria-hidden="true" />
              <span>{L("Drag out to watch while you work")}</span>
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
                {L("Pop out")}
              </button>
            </div>
            <div class="tv">
              <Player channel={tv.channel} />
            </div>
          </>
        )}
      <Channels />
      <p class="fine">
        {L(
          "Greyed channels were off air at the last check (every 30 min while TV is open); shows with a schedule light up when they go live. Infowars, EWTN and Daystar play from their own sites.",
        )}
      </p>
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
        aria-label={L("Live TV player")}
        style={{ left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` }}
      >
        <header
          t="tv_title"
          onPointerDown={(e) => (e as PointerEvent).button === 0 && begin(e as PointerEvent, "move", r)}
          onDblClick={() => prefs.dockTv()}
          title={L("Drag to move · double-click to dock")}
        >
          <span class="live-dot" />
          <select
            aria-label={L("Channel")}
            value={tv.channel}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => prefs.setChannel((e.target as HTMLSelectElement).value)}
          >
            {GROUPS.map((g) => (
              <optgroup key={g} label={L(g)}>
                {CHANNELS.filter((c) => c.group === g).map(({ name, id }) => (
                  <option key={id} value={id} disabled={tvlive.videos[id] === null}>{name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <span class="grow" />
          <button
            type="button"
            class="icon-btn"
            t="tv_dock"
            aria-label={L("Dock in Live TV tab")}
            title={L("Dock")}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => prefs.dockTv()}
          >
            <Icon name="sidebar" size={15} />
          </button>
          <button
            type="button"
            class="icon-btn"
            t="tv_close"
            aria-label={L("Close player")}
            title={L("Close")}
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
