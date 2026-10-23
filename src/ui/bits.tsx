// Small shared pieces: freshness dot, sparkline, section header, empty state.
import type { JSX } from "aio";
import { ago } from "../lib/fmt.ts";
import type { Status } from "../lib/status.ts";
import { now } from "./store.ts";

export const Fresh = (props: { s: Status; stale: number }): JSX.Element => {
  const { s } = props;
  const state = s.busy ? "busy" : !s.ok ? "err" : !s.at ? "busy" : now.value - s.at > props.stale ? "stale" : "ok";
  const label = s.busy ? "Updating…" : !s.at ? "Loading…" : `${s.ok ? "Updated" : s.err} · ${ago(s.at, now.value)} ago`;
  return (
    <span class={`fresh ${state}`} title={s.err || label}>
      <i />
      {label}
    </span>
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
