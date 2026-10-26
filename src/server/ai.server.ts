// Local AI through aipro, the machine's AI provider app (aio `peer`). gt never talks to a model runtime itself:
// aipro picks, loads and shares the model and keeps the GPU safe. Types: `am peer aipro --types=src/peers/aipro.ts`.
// Calls use `p.call("broker", …)` (= `Broker` in the types): aiol reads `p.cell(…)` as a cell definition.
import { serverFns } from "aio";
import { type Peer, peer } from "aio/server";
import type {
  AiproState,
  Capability,
  Chunk,
  Grant,
  ModelInfo,
  Msg,
  Need,
  Req,
  Response,
  TaskId,
} from "../peers/aipro.ts";

export const APP = "gt";
/** No model named: aipro serves each task with its own default, which the user picks in aipro. */
export const NEED: Need = { task: "text.chat" };
export const TRANSLATE: Need = { task: "text.translate" };
/** aipro's lease lapses after 30 s without a beat. */
const BEAT_MS = 10_000;
/** Room for any real translation of `text` (scripts like Czech or Thai take more tokens per character), not more. */
export const maxTokens = (text: string): number => Math.min(4096, text.length * 2 + 64);
const OFF = "aipro is not running — start aipro for AI briefs and translations"; // Czech: i18n/cs/data.ts
/** gt's latest requests the AI tab shows and sums up. */
const RECENT = 50;

let link: Promise<Peer | null> | null = null;

/** One connection for the app's life; dropped when aipro goes away, so the next call finds it again (new port). */
function aipro(): Promise<Peer | null> {
  link ??= peer("aipro", { ackTimeoutMs: 0 }).then((p) => {
    p?.onStatus((up) => {
      if (up) return;
      p.close();
      link = null;
    });
    if (!p) link = null;
    return p;
  }, (e) => {
    link = null;
    throw e;
  });
  return link;
}

/** What aipro can serve now; null = aipro is not running. */
export async function capabilities(): Promise<Capability[] | null> {
  const p = await aipro();
  return p ? await p.call<Capability[]>("broker", "capabilities") : null;
}

/** One brief, streamed: yields progress/text chunks, returns aipro's full Response. */
export async function* brief(id: string, messages: Msg[]): AsyncGenerator<Chunk, Response> {
  const p = await aipro();
  if (!p) return { v: 1, ok: false, kind: "unsupported", reason: OFF };
  const s = p.stream<Chunk, Response>("broker", "ask", APP, NEED, {
    v: 1,
    id,
    input: { messages },
    params: { temperature: 0.2 },
  });
  yield* s;
  return await s.result;
}

/** Stop a brief by its request id (queued or running); aipro answers it "cancelled". */
export async function cancel(id: string): Promise<void> {
  const p = await aipro();
  await p?.call("broker", "cancel", id);
}

/** A translator on one aipro lease (one model load for many texts), or why aipro refused. `run` answers null when the
 *  model failed on that text or ran away (a reply far longer than the text — small models sometimes loop; `max_tokens`
 *  caps it). No time limit: a run waits in aipro's queue for its turn, however long that takes; it throws when aipro went away or is busy. The lease is beaten while a run is going too. */
export async function translator(
  to: string,
): Promise<{ run(text: string): Promise<string | null>; close(): Promise<void> } | string> {
  const p = await aipro();
  if (!p) return OFF;
  const g = await p.call<Grant>("broker", "connect", APP, TRANSLATE, "background");
  if (!g.ok) return g.reason;
  const lease = g.lease.id;
  const beat = setInterval(() => p.call("broker", "beat", lease).catch(() => {}), BEAT_MS);
  return {
    async run(text) {
      const r = await p.call<Response>("broker", "run", lease, {
        v: 1,
        input: { text, to },
        params: { temperature: 0, max_tokens: maxTokens(text) },
      });
      // Busy (past aipro's queue limit): stop here and keep the queue — failing every queued text would lose them.
      if (!r.ok && r.kind === "busy") throw new Error(r.reason);
      const out = r.ok && r.output.kind === "value" ? String(r.output.value).trim() : "";
      return out && out.length <= text.length * 3 + 40 ? out : null;
    },
    close: () => {
      clearInterval(beat);
      return p.call("broker", "release", lease).then(() => {}, () => {});
    },
  };
}

/** What the AI tab shows: aipro's version, the models it now serves gt's tasks with, gt's latest requests (oldest
 *  first). null = aipro is not running. */
export type Overview = { version: string; models: ModelInfo[]; reqs: Req[] };
/** The tasks gt asks aipro for. */
export const TASKS: TaskId[] = ["text.chat", "text.translate"];

const versions = new WeakMap<Peer, Promise<string>>();
/** aipro's version, asked once per connection. */
const versionOf = (p: Peer): Promise<string> => {
  let v = versions.get(p);
  if (!v) {
    v = p.describe().then((a) => (a as { version?: string } | null)?.version ?? "", () => "");
    versions.set(p, v);
  }
  return v;
};

export const aiInfo = serverFns("aiInfo", {
  overview: async (): Promise<Overview | null> => {
    const p = await aipro().catch(() => null);
    if (!p) return null;
    // Only gt's tasks (the whole list is ~50 KB a poll); the version once a
    // connection (describe() carries aipro's full types).
    const [version, ...lists] = await Promise.all([
      versionOf(p),
      ...TASKS.map((t) => p.call<ModelInfo[]>("broker", "models", t).catch(() => [])),
    ]);
    const models = [...new Map(lists.flat().map((m) => [m.id, m])).values()];
    const reqs = ((p.state as AiproState | null)?.broker.reqs ?? []).filter((r) => r.app === APP);
    return {
      version,
      models: models.filter((m) => m.defaultFor.some((t) => TASKS.includes(t))),
      reqs: reqs.toSorted((a, b) => a.at - b.at).slice(-RECENT),
    };
  },
});
