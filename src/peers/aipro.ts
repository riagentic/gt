// Types published by aipro 0.1.19-dirty.78aa35cb — saved by `am peer aipro --types=src/peers/aipro.ts`. Re-run to refresh; do not edit.
// aipro's contract as types only — no imports, so aipro publishes this file's
// text to callers (`aio.run({ peerTypes })`; `am peer aipro --types=…` saves
// it). Apps call `peer("aipro")` and type it with `Broker`, with no aipro
// source. Wire version: v = 1.

/** What an app asks for: one task = one input shape = one default model
 *  (Default Models tab). `<group>.<action>`; the group is only for display. */
export type TaskId =
  | "text.chat" // messages / prompt → text: write · fix · reply · summarize · extract
  | "text.translate" // text → text in another language
  | "text.classify" // text + labels → label (+ scores)
  | "text.code" // messages → code (agentic coding: tools, long context)
  | "text.reason" // messages → a worked answer (expert reasoning)
  | "vision.read" // image (+ question) → text: caption · OCR · Q&A
  | "image.generate" // prompt → image
  | "image.edit" // image + prompt → that image changed
  | "image.colorize" // black-and-white image → colour image
  | "video.generate" // prompt → video
  | "video.animate" // image (+ prompt) → video that starts from it
  | "video.talk" // face image + spoken audio → that face speaking
  | "video.colorize" // black-and-white video → colour video
  | "speech.transcribe" // audio → text
  | "speech.say" // text → voice
  | "speech.clone" // text + a short recording → speech in that voice
  | "audio.music" // prompt (+ lyrics) → music
  | "audio.effects"; // prompt / video → sound effects · ambience

/** What an engine can do — the older, coarser task names, still accepted:
 *  each serves as its own task with any model of that kind. */
export type Cap =
  | "text"
  | "translate"
  | "vision"
  | "transcribe"
  | "classify"
  | "image"
  | "video"
  | "speech"
  | "audio"
  | "music"
  | "colorize";

export type Task = TaskId | Cap;
export type Quality = "low" | "normal" | "best";
export type Priority = "interactive" | "background";

/** What an app asks for. `task` and/or `model`:
 *  - task only → aipro picks the model for that quality level (the default
 *    — best: models are shared, so less GPU memory for everyone)
 *  - model → preferred; aipro falls back to `task` when it can't serve it.
 *    An id from `models()`, or any Hugging Face model this machine can run:
 *    "hf:owner/repo" (its Q4_K_M GGUF), "hf:owner/repo:Q8_0",
 *    "hf:owner/repo/file.gguf" — aipro downloads it on first use
 *  - model + strict → exactly that model, or a refusal
 *  - paid → paid cloud AI may serve it (costs money, data leaves the
 *    machine). Never used unless the app asks. */
export type Need = {
  task?: Task;
  model?: string;
  strict?: boolean;
  quality?: Quality;
  paid?: boolean;
  /** speech: the language you will speak ("cs", "en" …) — only models that
   *  speak it qualify. \`ask\` takes it from \`input.lang\` when absent. */
  lang?: string;
  /** image: you will pass \`input.image\` to change it — only models that
   *  edit qualify. \`ask\` sets it when the input has an image. */
  edit?: boolean;
};

/** Why aipro chose the model — for the app's own UI and logs. */
export type Why = "asked" | "pinned" | "shared" | "quality" | "fallback";

/** What serves a lease / served a result — everything an app may report. */
export type Served = {
  model: string; // stable id, e.g. "ollama/qwen3:1.7b"
  name: string;
  engine: string; // ollama · lmstudio · llama · whisper · speech · music · media
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

/** A tool the model asked to run (OpenAI's shape): `arguments` is JSON. */
export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

/** One turn. With tools: the assistant turn that asked carries
 *  `tool_calls`; each answer is a "tool" turn naming its `tool_call_id`. */
export type Msg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: string[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

/** A text task asked with `params.tools`: the reply text, and the tools the
 *  model wants run (empty: it answered). */
export type ToolReply = { text: string; tool_calls: ToolCall[] };

/** Task input — one flat object; each task reads the fields it needs.
 *  Paths are local files (aipro and the app share the machine). */
export type Input = {
  text?: string; // text.* (as a prompt) · speech.say · speech.clone
  messages?: Msg[]; // text.chat · text.code · text.reason · vision.read
  to?: string; // text.translate: target language
  from?: string; // text.translate: source language (optional)
  labels?: string[]; // text.classify
  prompt?: string; // image.* · video.* · audio.*
  negative?: string; // image.* · video.* · audio.effects: what to keep out
  image?: string; // vision.read · image.edit · image.colorize · video.animate (first frame) · video.talk (the face)
  audio?: string; // speech.transcribe · video.talk (the spoken line)
  video?: string; // video.colorize · audio.effects (sound for this clip)
  lyrics?: string; // audio.music
  voice?: string; // speech.say: a voice name · speech.clone: a short recording to imitate
  lang?: string; // speech.* : language ("cs", "en" …); transcribe guesses when absent
};

/** `id`: the caller's own request id — watch its progress, cancel it.
 *  `params`: model settings (steps, seed, size…) passed through unread. */
export type Request = {
  /** ms aipro may hold the request while there is no room (it shows as
   *  queued; served in priority order). Absent: up to the user's queue
   *  limit (Settings, 24 h by default); 0: answer busy at once. Needs a
   *  call timeout ≥ this (peer ackTimeoutMs: 0) — or cancel(id) to stop. */
  wait?: number;
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
  boost?: number; // queue order the user set (Requests tab): higher starts first
  ran?: number; // when it started running (its run time = end - ran)
  priority?: Priority; // the app's: interactive or background
};

/** A file aipro wrote (in ~/.aipro/outputs) — the app copies or moves it. */
export type File = {
  path: string; // on aipro's machine (~/.aipro/outputs)
  mime: string;
  blob: string; // remote callers (the door): the bytes, peer.blob(blob); "" here — read path
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
    step?: number; // media: the sampler's own step, of `steps` (all passes)
    steps?: number;
    mode?: Mode; // media: where the work runs, as the engine placed it
    modeDetail?: string; // e.g. "2 cards", "layer by layer from RAM"
  };

/** Where a media job runs, fastest first: every weight on the GPUs; weights
 *  in RAM streamed to a GPU; no GPU at all. */
export type Mode = "vram" | "hybrid" | "ram";

/** text / labels → value · images, audio, video → files */
export type Output =
  | { kind: "value"; value: unknown }
  | { kind: "files"; files: File[] };

export type Response =
  | { v: 1; ok: true; id: string; served: Served; output: Output; ms: number }
  | Declined;

export type Capability = {
  task: Task; // every task id, then the older names
  label: string; // "Talking head"
  about: string; // "face + voice → video"
  /** The input it reads and the output it gives (task ids only). */
  takes?: string;
  gives?: string;
  qualities: Quality[];
  /** A model on this machine can serve it — not "aipro has room now": a
   *  request may still wait its turn. aipro is up when \`peer()\` connects;
   *  show "offline" only then. */
  now: boolean;
  paidOnly: boolean;
  /** The model a plain `{ task, quality }` gets now, per quality. */
  defaults: Partial<Record<Quality, string>>;
};

/** A model this machine can run (`models()`): the default first, then those
 *  on disk, then those aipro would download. */
export type ModelInfo = {
  id: string; // what `need.model` takes
  name: string;
  engine: string;
  tasks: TaskId[];
  tiers: Partial<Record<TaskId, Quality>>; // the quality it reaches per task
  defaultFor: TaskId[]; // a plain `{ task }` gets this model now
  state: "loaded" | "on disk" | "download";
  sizeB: number; // on disk, or to download
  needB: number; // GPU memory (+ RAM) while loaded; 0 = runs on the CPU
  params: string;
  quant: string;
  langs?: string[]; // languages it speaks (speech); absent = any
  edits?: boolean; // image: also changes a given image
  license?: string; // set when it limits use, e.g. "… — non-commercial"
  spec?: ModelSpec; // media: what it renders — sizes, steps, clip length …
  byName?: boolean; // never picked for a plain task: ask for it by id
};

/** aipro's `broker` cell as a caller sees it:
 *  `(await peer("aipro"))?.cell<Broker>("broker")`. `who` = your appId
 *  (when aipro can prove the caller, it must match). */
export interface Broker {
  /** What this machine can serve — ask before showing an AI feature. */
  capabilities(): Capability[];
  /** The models this machine can run, for one task or all. */
  models(task?: Task): ModelInfo[];
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
  /** Hold a running media request between sampler steps (its model stays
   *  loaded), or let it go on. false: nothing of that id to hold. */
  pause(id: string, on: boolean): boolean;
  /** How much of `prompt` a media model reads, counted by its own
   *  tokenizer (no model loads). `limit` 0: it states none. */
  tokens(model: string, prompt: string): { count: number; limit: number };
  /** Fetch a model (and what it needs) ahead of first use. Stream it for
   *  progress chunks; false: it is already on this machine. */
  download(model: string): boolean;
  /** The LoRAs aipro holds — pass one as `params.loras: [{ name, strength? }]`. */
  loras(): LoraFile[];
  /** Fetch a LoRA: a .safetensors URL, or "owner/repo:file.safetensors" on
   *  Hugging Face. Stream it for progress chunks. */
  addLora(source: string): LoraFile;
  removeLora(name: string): boolean;
}

/** A LoRA file in aipro's store. */
export type LoraFile = {
  name: string; // what params.loras[].name takes
  sizeB: number;
  family: string | null; // the architecture it was trained on; null = unknown
  label: string; // that architecture, for people ("SDXL / Pony")
  title: string; // what its trainer called it ("" if nothing)
  role: "image" | "video";
  models: string[]; // the media models it attaches to
  steps?: number; // a distillation LoRA: the steps it runs at (CFG off)
};

// ── media models' facts (ModelInfo.spec) ──────────────────────────────

export type ModelKind = "t2i" | "i2v" | "audio" | "speech";

/**
 * The architecture a single-file checkpoint turns out to be. Lives here rather
 * than beside its detector because two unrelated things need it: the checkpoint
 * reader that produces it, and the LoRA matcher that consumes it — an adapter
 * attaches to an architecture, never to a filename.
 */
export type CheckpointFamily =
  | "sd15"
  | "sd21"
  | "sdxl"
  | "sd3"
  | "flux"
  | "ltx"
  | "ltx2"
  | "unknown";

/** A downloadable, runnable model. Pure data — the catalog is a constant. */
export type ModelSpec = {
  readonly id: string;
  readonly kind: ModelKind;
  readonly name: string;
  /** Hugging Face repo id — the single source of weights. */
  readonly repo: string;
  /** Pinned revision; `main` is never used, so a repo edit cannot change a build. */
  readonly revision: string;
  /** diffusers pipeline class the engine instantiates. */
  readonly pipeline: string;
  /**
   * Absolute path to a single-file checkpoint. Set only for weights the user
   * dropped in themselves: the engine builds the pipeline with
   * `from_single_file` instead of reading a diffusers repo layout.
   */
  readonly singleFile?: string;
  /**
   * Reference repo the pipeline config comes from, for a `singleFile` model.
   * The checkpoint carries weights only — the module layout, scheduler and
   * tokenizer are read from here (small, and cached after the first load).
   */
  readonly configRepo?: string;
  /**
   * Who renders it. Absent: diffusers, in the engine's own process. `comfy`:
   * a private ComfyUI server the engine starts on demand — for models
   * diffusers cannot run yet (Krea 2 and its fine-tunes). `pipeline` then
   * names the ComfyUI workflow the engine builds, not a diffusers class.
   */
  readonly backend?: "comfy";
  readonly params: string;
  /**
   * How the weights are STORED in the repo — which is not how they run.
   *
   * Everything here is quantised to float8 on the way to the card, so this is
   * about the download and the disk, not the VRAM: `fp32` means the repo ships
   * four bytes per weight and half of every gigabyte fetched is thrown away at
   * load. Stated on the model row because it is the difference between a 32 GB
   * download and a 16 GB one for the same model.
   */
  readonly precision: "fp32" | "bf16" | "fp8" | "nvfp4" | "mixed";
  /**
   * The one file in the repo that IS the model, for repos that ship a
   * checkpoint rather than a diffusers layout. Resolved to an absolute path
   * when the request is built; the loader then reads it with `from_single_file`
   * exactly as it reads a checkpoint the user dropped in.
   */
  readonly singleFileName?: string;
  readonly license: string;
  /** Approximate on-disk size, bytes (exact size is read from the HF tree). */
  readonly sizeBytes: number;
  /**
   * Resident footprint on ONE card with the engine's default quantisation —
   * derived from the repo's own weight files, not estimated by hand. The
   * engine re-measures this from disk at load time; the number here is what
   * the UI shows before anything is downloaded.
   */
  readonly vramGB: number;
  /**
   * True when the footprint exceeds a 24 GB card, so the engine streams the
   * model from system RAM instead of holding it resident. It still runs — it
   * is slower, and saying so beats an out-of-memory error.
   */
  readonly streams: boolean;
  /** True when a second 24 GB card measurably helps (sharding / MoE experts). */
  readonly multiGpu: boolean;
  /**
   * True when the model is driven BY the audio — the spoken line goes into the
   * model, so the mouth follows the words. Everything else animates a still
   * from a text prompt alone and can never be in sync, however it is prompted.
   */
  readonly audioDriven?: boolean;
  /** How hard the audio drives the mouth, separate from prompt guidance. */
  readonly audioGuidance?: number;
  /** Weight on the audio cross-attention. 1.0 is upstream's default. */
  readonly audioScale?: number;
  /** Other models this one cannot run without (a base model, an encoder). */
  readonly companions?: readonly string[];
  /**
   * The job this model does in a pipeline. Absent for companions — a base or
   * an encoder is never picked directly.
   */
  readonly role?: "image" | "video" | "talk" | "voice" | "ambience";
  /**
   * False only for models that ship trained-in content restrictions. Marked
   * honestly: most video and speech models impose none, so hiding them behind
   * the uncensored switch would leave no working pipeline.
   */
  readonly uncensored?: boolean;
  /** Native pixel budget: generation is capped at this and upscaled after. */
  readonly maxPixels: number;
  /**
   * The smallest frame the model still draws well. A request below it is
   * rendered AT this budget and downscaled — Qwen-Image 2.1 at 0.4 MP garbles
   * text it spells cleanly at 2 MP. Absent: no floor.
   */
  readonly minPixels?: number;
  /** Width/height must be a multiple of this. */
  readonly sizeMultiple: number;
  /** Default sampler steps — tuned per model, not a global guess. */
  readonly steps: number;
  readonly guidance: number;
  /**
   * Seconds of compute per megapixel per sampler step on ONE 24 GB Blackwell
   * card. These are order-of-magnitude estimates from published throughput for
   * each architecture, not measurements taken on this machine — they only have
   * to be close, because `remainingMs` switches to the run's own measured step
   * rate within the first quarter of the steps.
   */
  readonly secPerMpStep: number;
  /** i2v only — native frame rate and the frame-count constraint. */
  readonly fps?: number;
  readonly frameMultiple?: number;
  readonly maxFrames?: number;
  readonly note: string;
};

/** The state a caller may read (`peer.subscribe`): live progress by `req.id`. */
export type AiproState = { broker: { reqs: Req[] } };
