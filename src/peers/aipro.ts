// Types published by aipro 0.1.1-dirty.36214a26 — saved by `am peer aipro --types=src/peers/aipro.ts`. Re-run to refresh; do not edit.
// aipro's contract as types only — no imports, so aipro publishes this file's
// text to callers (`aio.run({ peerTypes })`; `am peer aipro --types=…` saves
// it). Apps call `peer("aipro")` and type it with `Broker`, with no aipro
// source. Wire version: v = 1.

/** General tasks, grouped by what comes out. */
export type Task =
  | "text" // LLM: chat · summarize · rewrite · extract … → text
  | "translate" // text → text in another language
  | "vision" // image (+ question) → text: caption · OCR · Q&A
  | "transcribe" // audio → text
  | "classify" // text → label (+ scores)
  | "embed" // text → vectors
  | "image" // text (+ image) → image
  | "video" // text / image → video
  | "speech" // text → voice
  | "audio" // text / video → sound effects · soundtrack
  | "music"; // text (+ lyrics) → music
export type Quality = "low" | "normal" | "best";
export type Priority = "interactive" | "background";

/** What an app asks for. `task` and/or `model`:
 *  - task only → aipro picks the model for that quality level
 *  - model → preferred; aipro falls back to `task` when it can't serve it
 *  - model + strict → exactly that model, or a refusal
 *  - paid → paid cloud AI may serve it (costs money, data leaves the
 *    machine). Never used unless the app asks. */
export type Need = {
  task?: Task;
  model?: string;
  strict?: boolean;
  quality?: Quality;
  paid?: boolean;
};

/** Why aipro chose the model — for the app's own UI and logs. */
export type Why = "asked" | "pinned" | "shared" | "quality" | "fallback";

/** What serves a lease / served a result — everything an app may report. */
export type Served = {
  model: string; // stable id, e.g. "ollama/qwen3:1.7b"
  name: string;
  engine: string; // ollama · lmstudio · llamacpp · music · diffusion …
  task: Task;
  why: Why;
  note: string; // e.g. the fallback reason, or "asked best; the best here is normal"
  tier: Quality; // the quality this model reaches for the task
  paid: boolean; // a paid cloud service served it
  loaded: boolean; // false = cold start (loading takes time)
  sizeB: number;
  params: string;
  quant: string;
};

export type Lease = {
  id: string;
  app: string;
  need: Need;
  task: Task;
  model: string;
  served: Served;
  priority: Priority;
  at: number;
  beat: number;
};

/** `lease.served` says what will serve it; `served.loaded === false` = cold start. */
export type Grant = { v: 1; ok: true; lease: Lease } | Declined;

export type Declined = {
  v: 1;
  ok: false;
  kind: "busy" | "unsupported" | "failed";
  reason: string;
  retryAfterMs?: number;
  canQueue?: boolean;
};

export type Msg = {
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[];
};

/** Task input — one flat object; each task reads the fields it needs.
 *  Paths are local files (aipro and the app share the machine). */
export type Input = {
  text?: string; // translate · classify · embed · speech · text (as a prompt)
  texts?: string[]; // embed (batch)
  messages?: Msg[]; // text · vision
  to?: string; // translate: target language
  from?: string; // translate: source language (optional)
  labels?: string[]; // classify
  prompt?: string; // image · video · audio · music
  negative?: string; // image · video · audio
  image?: string; // vision · image (edit) · video (start frame)
  audio?: string; // transcribe
  video?: string; // audio (soundtrack for a clip)
  lyrics?: string; // music
  voice?: string; // speech
};

/** `id`: the caller's own request id — watch its progress, cancel it.
 *  `params`: model settings (steps, seed, size…) passed through unread. */
export type Request = {
  v: 1;
  id?: string;
  input: Input;
  params?: Record<string, unknown>;
};

export type Status =
  | "queued"
  | "active"
  | "done"
  | "failed"
  | "cancelled"
  | "refused";

/** One unit of work, as aipro and the monitoring UI see it. Metadata only. */
export type Req = {
  id: string;
  app: string;
  task: Task | null;
  model: string;
  status: Status;
  pct: number; // 0..1, -1 = unknown
  phase: string; // load · run · encode … (engine words)
  note: string; // reason for refused/failed, else progress text
  rate: number; // speed now (live), 0 = unknown
  avg: number; // average speed so far / for the whole request, 0 = unknown
  unit: string; // tok/s · ×realtime · s/image · s/video-s · texts/s
  at: number;
  end: number;
};

/** A file aipro wrote (in ~/.aipro/outputs) — the app copies or moves it. */
export type File = {
  path: string; // on aipro's machine (~/.aipro/outputs)
  mime: string;
  blob: string; // the same bytes from anywhere: peer.blob(blob)
  meta?: Record<string, unknown>;
};

/** What \`peer.stream("broker", "ask" | "run", …)\` yields while it works;
 *  the full \`Response\` still arrives as \`.result\`. */
export type Chunk =
  | { type: "delta"; text: string } // generated text, as it comes
  | {
    type: "progress";
    pct?: number; // 0..1, -1 = unknown
    phase?: string; // install · download · load · run · generate …
    note?: string;
    rate?: number; // speed now, in unit
    avg?: number; // speed so far
    unit?: string; // tok/s · texts/s · ×realtime
  };

/** text / numbers / vectors → value · images, audio, video → files */
export type Output =
  | { kind: "value"; value: unknown }
  | { kind: "files"; files: File[] };

export type Response =
  | { v: 1; ok: true; id: string; served: Served; output: Output; ms: number }
  | Declined;

export type Capability = {
  task: Task;
  qualities: Quality[];
  now: boolean;
  paidOnly: boolean;
};

/** aipro's `broker` cell as a caller sees it:
 *  `(await peer("aipro"))?.cell<Broker>("broker")`. `who` = your appId
 *  (when aipro can prove the caller, it must match). */
export interface Broker {
  /** What this machine can serve — ask before showing an AI feature. */
  capabilities(): Capability[];
  /** One call, whole job: pick → run → release. */
  ask(who: string, need: Need, req: Request, priority?: Priority): Response;
  /** Hold a model across many runs: connect → run… → release. Beat every
   *  10 s or the lease lapses after 30 s. */
  connect(who: string, need: Need, priority?: Priority): Grant;
  run(leaseId: string, req: Request): Response;
  beat(leaseId: string): boolean;
  release(leaseId: string): void;
  /** Stop a running request by its `req.id`. */
  cancel(id: string): boolean;
}

/** The state a caller may read (`peer.subscribe`): live progress by `req.id`. */
export type AiproState = { broker: { reqs: Req[] } };
