// Local AI through aipro, the machine's AI provider app (aio `peer`). gn never talks to a model runtime itself:
// aipro picks, loads and shares the model and keeps the GPU safe. Types: `am peer aipro --types=src/peers/aipro.ts`.
// Calls use `p.call("broker", …)` (= `Broker` in the types): aiol reads `p.cell(…)` as a cell definition.
import { type Peer, peer } from "aio/server";
import type { Capability, Chunk, Grant, Msg, Need, Response } from "../peers/aipro.ts";

export const APP = "gn";
/** Preferred model; aipro falls back to its own text default when it cannot serve it. */
export const NEED: Need = { task: "text", model: "ollama/qwen3:1.7b" };
/** Translation: gemma4:12b writes far better Czech than the small Qwen models (tested); aipro's default otherwise. */
export const TRANSLATE: Need = { task: "translate", model: "ollama/gemma4:12b" };
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

/** Translate many texts on one lease (one model load, beat between runs). Yields [index, translation | null] as each
 *  lands; a refusal of the whole batch (aipro off, no model, busy) is the return value. */
export async function* translate(texts: string[], to: string): AsyncGenerator<[number, string | null], string> {
  const p = await aipro();
  if (!p) return OFF;
  const g = await p.call<Grant>("broker", "connect", APP, TRANSLATE, "background");
  if (!g.ok) return g.reason;
  try {
    for (const [i, text] of texts.entries()) {
      const r = await p.call<Response>("broker", "run", g.lease.id, {
        v: 1,
        input: { text, to },
        params: { temperature: 0 },
      });
      yield [i, r.ok && r.output.kind === "value" ? String(r.output.value).trim() || null : null];
      await p.call("broker", "beat", g.lease.id);
    }
    return "";
  } finally {
    await p.call("broker", "release", g.lease.id).catch(() => {});
  }
}
