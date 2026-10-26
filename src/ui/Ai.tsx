// AI tab: aipro, the AI app on this computer, as gt's optional AI provider — the switch to use it, whether it runs,
// the models it serves gt's tasks with, and how gt's requests went (aipro's own records of them).
import type { JSX } from "aio";
import { serverFn } from "aio";
import { onMount, signal, useInterval } from "aio/air";
import { ai } from "../cell/ai.ts";
import { prefs } from "../cell/prefs.ts";
import { tr } from "../cell/tr.ts";
import { took, usage } from "../lib/aistats.ts";
import { since } from "../lib/fmt.ts";
import type { ModelInfo, Req, Task, TaskId } from "../peers/aipro.ts";
import type { aiInfo, Overview } from "../server/ai.server.ts";
import { AiproStatus, Head } from "./bits.tsx";
import { L } from "./i18n.ts";
import { now } from "./store.ts";

const api = serverFn<typeof aiInfo>("aiInfo");
/** aipro's side, refreshed while the tab is open; null until asked, or while aipro is away. */
const info = signal<Overview | null>(null);
const POLL_MS = 5_000;
const SHOWN = 8;

const refresh = () => api.overview().then((o) => info.set(o), () => info.set(null));

/** What gt uses each task for. */
const USES: { task: TaskId; label: string; what: string }[] = [
  { task: "text.chat", label: "Briefs", what: "World and country briefs from the headlines" },
  { task: "text.translate", label: "Translation", what: "Live text and opened pages, into the app's language" },
];

const STATE: Record<ModelInfo["state"], string> = {
  loaded: "loaded",
  "on disk": "on disk",
  download: "not downloaded",
};

const gb = (b: number) => `${(b / 1e9).toFixed(b < 10e9 ? 1 : 0)} GB`;
const secs = (ms: number) => `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
const speed = (v: number, unit: string) => `${v.toFixed(v < 10 ? 1 : 0)} ${unit}`;
const TONE: Record<Req["status"], string> = {
  queued: "busy",
  active: "busy",
  done: "ok",
  failed: "err",
  refused: "err",
  cancelled: "stale",
};

/** The model aipro now serves `task` with. */
const Model = (props: { task: TaskId; models: ModelInfo[] }): JSX.Element => {
  const m = props.models.find((x) => x.defaultFor.includes(props.task));
  if (!m) return <small>{L("no model for this on aipro")}</small>;
  return (
    <small title={m.id}>
      {m.name} · {L(STATE[m.state])}
      {m.needB > 0 && ` · ${L("{gb} GPU", { gb: gb(m.needB) })}`}
    </small>
  );
};

/** One task's use: how many requests, how they ended, speed, typical time, when last. */
const Use = (props: { task: TaskId; reqs: Req[] }): JSX.Element | null => {
  const u = usage(props.reqs, props.task);
  if (!u.n) return <small>{L("not used yet")}</small>;
  return (
    <small>
      {L("{n} requests", { n: u.n })} · {L("{ok} ok", { ok: u.ok })}
      {u.failed > 0 && <span class="err">· {L("{n} failed", { n: u.failed })}</span>}
      {u.speed > 0 && ` · ${speed(u.speed, u.unit)}`}
      {u.ms > 0 && ` · ${L("{s} typical", { s: secs(u.ms) })}`}
      {u.last && ` · ${since(u.last.at, now.value, prefs.lang)}`}
    </small>
  );
};

export function Ai(): JSX.Element {
  onMount(() => void refresh());
  useInterval(() => void refresh(), POLL_MS);
  const o = info.value;
  const recent = o?.reqs.slice(-SHOWN).reverse() ?? [];
  const label = (t: Task | null) => L(USES.find((u) => u.task === t)?.label ?? String(t ?? "—"));
  return (
    <div class="panel">
      <Head title={L("AI")} />
      <section>
        <label class="toggle">
          <span class="toggle-text">
            <span>{L("Use AI")}</span>
            <small>
              {L("Briefs and translations by aipro, the AI app on this computer — nothing is sent anywhere.")}
            </small>
          </span>
          <input
            type="checkbox"
            role="switch"
            t="ai_on"
            aria-label={L("Use AI")}
            checked={ai.on}
            onChange={(e) => {
              const on = (e.target as HTMLInputElement).checked;
              void ai.setOn(on);
              if (!on) void tr.keep("en"); // nothing more goes to aipro
            }}
          />
        </label>
        <AiproStatus version={o?.version} />
      </section>
      <section>
        <h3>{L("What Globe Today uses it for")}</h3>
        {USES.map((u) => (
          <div key={u.task} class="ai-use">
            <span class="toggle-text">
              <span>{L(u.label)}</span>
              <small>{L(u.what)}</small>
              {o && <Model task={u.task} models={o.models} />}
              {o && <Use task={u.task} reqs={o.reqs} />}
              {u.task === "text.translate" && (
                <small>
                  {L("{n} texts kept", { n: Object.keys(tr.done).length })}
                  {tr.pending > 0 && ` · ${L("{n} waiting", { n: tr.pending })}`}
                </small>
              )}
            </span>
          </div>
        ))}
      </section>
      {recent.length > 0 && (
        <section>
          <h3>{L("Latest requests")}</h3>
          {recent.map((r) => (
            <div key={r.id} class="source" title={r.note || r.model}>
              <span class={`fresh ${TONE[r.status]}`}>
                <i />
                {label(r.task)} · {L(r.status)}
              </span>
              <small>
                {[
                  took(r) > 0 ? secs(took(r)) : "",
                  r.avg > 0 ? speed(r.avg, r.unit) : "",
                  since(r.at, now.value, prefs.lang),
                ].filter(Boolean).join(" · ")}
              </small>
            </div>
          ))}
        </section>
      )}
      <p class="fine">
        {L(
          "aipro is optional: Globe Today works without it, with AI features off. It runs the models on this computer and shares them between apps; pick the models in aipro. AI comes back on its own within 30 s of aipro starting.",
        )}
      </p>
    </div>
  );
}
