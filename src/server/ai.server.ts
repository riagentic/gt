// Local AI through aipro, the machine's AI provider app (aio `peer`). gn never talks to a model runtime itself:
// aipro picks, loads and shares the model and keeps the GPU safe. Types: `am peer aipro --types=src/peers/aipro.ts`.
// Calls use `p.call("broker", …)` (= `Broker` in the types): aiol reads `p.cell(…)` as a cell definition.
import { type Peer, peer } from "aio/server";
import type { Capability, Chunk, Grant, Msg, Need, Response } from "../peers/aipro.ts";

export const APP = "gn";
/** No model named: aipro serves each task with its own default, which the user picks in aipro. */
export const NEED: Need = { task: "text" };
export const TRANSLATE: Need = { task: "translate" };
/** Longest one translation may take; aipro's lease lapses after 30 s without a beat. */
const RUN_MS = 90_000, BEAT_MS = 10_000;
/** Room for any real translation of `text` (scripts like Czech or Thai take more tokens per character), not more. */
export const maxTokens = (text: string): number => Math.min(4096, text.length * 2 + 64);
const OFF = "aipro is not running — start it for AI briefs"; // Czech: i18n/cs/data.ts

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

/** A translator on one aipro lease (one model load for many texts), or why aipro refused. `run` answers null when the
 *  model failed on that text or ran away (no answer in RUN_MS, or a reply far longer than the text — small models
 *  sometimes loop); it throws when aipro went away or is busy. The lease is beaten while a run is going too. */
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
      const id = crypto.randomUUID();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<null>((done) => timer = setTimeout(() => done(null), RUN_MS));
      const r = await Promise.race([
        p.call<Response>("broker", "run", lease, {
          v: 1,
          id,
          input: { text, to },
          params: { temperature: 0, max_tokens: maxTokens(text) },
        }),
        late,
      ]).finally(() => clearTimeout(timer));
      if (!r) {
        await p.call("broker", "cancel", id).catch(() => {});
        return null;
      }
      // Busy (still on a cut-off run): stop here and keep the queue — failing every queued text would lose them.
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
