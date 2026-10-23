// Small shared pieces: freshness dot, sparkline, section header, empty state.
import type { JSX } from "aio";
import { since } from "../lib/fmt.ts";
import { ai } from "../cell/ai.ts";
import type { Status } from "../lib/status.ts";
import { L } from "./i18n.ts";
import { now } from "./store.ts";
import { prefs } from "../cell/prefs.ts";

export const Fresh = (props: { s: Status; stale: number }): JSX.Element => {
  const { s } = props;
  const state = s.busy ? "busy" : !s.ok ? "err" : !s.at ? "busy" : now.value - s.at > props.stale ? "stale" : "ok";
  const label = s.busy
    ? L("Updating…")
    : !s.at
    ? L("Loading…")
    : `${s.ok ? L("Updated") : s.err} · ${since(s.at, now.value, prefs.lang === "cs")}`;
  return (
    <span class={`fresh ${state}`} title={s.err || label}>
      <i />
      {label}
    </span>
  );
};

const TONE = { ok: "ok", busy: "stale", refused: "err", failed: "err" } as const;

/** aipro link + how it answered the last brief, so the user can see why AI features are off. */
export const AiproStatus = (): JSX.Element => {
  const l = ai.last;
  return (
    <div class="aipro" t="aipro_status">
      <p>
        <span class={`fresh ${ai.link.busy ? "busy" : ai.ready ? "ok" : "err"}`}>
          <i />
          {ai.ready ? L("aipro running") : L("aipro not running")}
        </span>
        {!ai.ready && (
          <>
            {ai.link.err && ai.link.err !== "aipro is not running" && <small>{L(ai.link.err)}</small>}
            <button type="button" class="link" onClick={() => ai.check()}>{L("Check again")}</button>
          </>
        )}
      </p>
      <p>
        {ai.live
          ? (
            <span class="fresh busy">
              <i />
              {L("Last request: working · {phase}", { phase: L(ai.live.phase || "starting") })}
            </span>
          )
          : l
          ? (
            <span class={`fresh ${TONE[l.kind]}`} title={L(l.reason)}>
              <i />
              {L("Last request: {kind}", { kind: L(l.kind) })}
              {l.model && ` · ${l.model}`}
              {l.ms > 0 && ` · ${(l.ms / 1000).toFixed(1)} s`} · {since(l.at, now.value, prefs.lang === "cs")}
            </span>
          )
          : (
            <span class="fresh stale">
              <i />
              {L("Last request: none yet")}
            </span>
          )}
      </p>
      {l && l.kind !== "ok" && !ai.live && <p class="fine err">{L(l.reason)}</p>}
      {l?.kind === "ok" && l.reason && !ai.live && <p class="fine">{L(l.reason)}</p>}
    </div>
  );
};

export const Spark = (props: { values: number[]; up: boolean; w?: number; h?: number }): JSX.Element => {
  const w = props.w ?? 64, h = props.h ?? 20, v = props.values;
  if (v.length < 2) return <svg width={w} height={h} />;
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const d = v.map((x, i) =>
    `${i ? "L" : "M"}${((i / (v.length - 1)) * w).toFixed(1)},${(h - 1 - ((x - lo) / span) * (h - 2)).toFixed(1)}`
  ).join("");
  return (
    <svg width={w} height={h} class={props.up ? "spark up" : "spark down"} aria-hidden="true">
      <path d={d} fill="none" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
};

export const Head = (props: { title: string; children?: JSX.Children }): JSX.Element => (
  <div class="head">
    <h2>{props.title}</h2>
    <div class="head-aside">{props.children}</div>
  </div>
);

export const Empty = (props: { text: string }): JSX.Element => <p class="empty">{props.text}</p>;
