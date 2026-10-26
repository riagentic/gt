import { cell, serverImport } from "aio";
import type { Response } from "../peers/aipro.ts";
import { idle, message, type Status, tracked } from "../lib/status.ts";

// Local AI briefs, served by aipro (the machine's AI provider app). `notes` holds one brief per subject: "world" or a
// country ISO code. `live` is the brief being written, streamed as it comes; `id` is its aipro request (Cancel).
export type Note = { text: string; at: number; model: string; note: string };
/** `phase` "queue" = waiting its turn in aipro; `note` says what for. */
export type Live = { id: string; key: string; text: string; phase: string; note: string; pct: number };
/** How aipro answered the last brief: ok · busy · refused (unsupported) · failed. */
export type Last = {
  kind: "ok" | "busy" | "refused" | "failed";
  reason: string;
  model: string;
  at: number;
  ms: number;
};
export type State = {
  /** The user's switch (AI tab): use aipro at all. */
  on: boolean;
  /** aipro is running and can write text. */
  up: boolean;
  /** AI features work: `on` and `up`. */
  ready: boolean;
  notes: Record<string, Note>;
  live: Live | null;
  last: Last | null;
  status: Status;
  link: Status;
};
const io = () => serverImport<typeof import("../server/ai.server.ts")>("../server/ai.server.ts", import.meta.url);

const SYSTEM = [
  "You are a calm, precise news analyst writing for a busy reader.",
  "Use only the headlines given. Never invent facts, numbers or names.",
  "Write plain English. No preamble, no headings, no closing remarks.",
].join(" ");

const ask = (subject: string) =>
  subject === "world"
    ? "Write a world brief: 5 bullet points, one line each, most important first. Start each with a bold topic word."
    : `Write a brief about ${subject}: 3 bullet points, one line each, most important first. Then one line starting "Watch:" naming what to watch next.`;

/** Reasoning models may think aloud first (`<think>…`, maybe still open); the brief is what follows. */
export const clean = (t: string): string => t.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();

/** aipro's answer → the status line Settings shows. */
export const lastOf = (r: Response, at: number): Last =>
  r.ok
    ? { kind: "ok", reason: r.served.note, model: r.served.name, at, ms: r.ms }
    : { kind: r.kind === "unsupported" ? "refused" : r.kind, reason: r.reason, model: "", at, ms: 0 };

const INITIAL: State = {
  on: true,
  up: false,
  ready: false,
  notes: {},
  live: null,
  last: null,
  status: idle(),
  link: idle(),
};

export const ai = cell("ai", {
  version: 4,
  // v2: Ollama model picking moved to aipro; only the briefs carry over. v3: `last`. v4: `on`, `up`.
  onMigrate: (s) => {
    const o = s as Partial<Omit<State, "notes">> & { notes?: Record<string, Omit<Note, "note"> & { note?: string }> };
    return {
      ...INITIAL,
      on: o.on ?? true,
      last: o.last ?? null,
      notes: Object.fromEntries(Object.entries(o.notes ?? {}).map(([k, n]) => [k, { ...n, note: n.note ?? "" }])),
    };
  },
  state: INITIAL,
  persist: { exclude: ["status.busy", "link.busy", "live"] },
  concurrency: { check: "first", summarize: "queue" },
  long: ["summarize"],
  args: {
    setOn: [(v) => typeof v === "boolean" || "true or false"],
    summarize: [
      (v) => (typeof v === "string" && v.length > 0 && v.length <= 60) || "subject: 1–60 characters",
      (v) => (typeof v === "string" && v.length > 0) || "a key",
      (v) => (Array.isArray(v) && v.length > 0 && v.length <= 80) || "1–80 headlines",
    ],
  },
  methods: {
    /** Use aipro, or not (off: no briefs, no translations; the UI also drops what is queued for translation). */
    setOn(s, on: boolean) {
      s.on = on;
      s.ready = s.up && on;
    },
    /** Is aipro up, and can it write text on this machine? */
    async check(s) {
      await tracked(s, "link", async () => {
        const caps = await (await io()).capabilities();
        s.up = !!caps?.some((c) => c.task === "text.chat" && !c.paidOnly);
        s.ready = s.up && s.on;
        if (!caps) throw new Error("aipro is not running");
        if (!s.up) throw new Error("aipro has no local text model");
      });
    },
    /** Cancel button: stop the brief being written (aipro answers it "cancelled"). */
    async cancel(s) {
      const id = s.live?.id;
      if (id) await (await io()).cancel(id);
    },
    /** Brief `subject` from headlines (newest, most-reported first); stored under `key`. */
    async summarize(s, subject: string, key: string, headlines: string[]) {
      await tracked(s, "status", async () => {
        if (!s.ready) throw new Error(s.on ? "aipro is not running" : "AI is turned off");
        const id = crypto.randomUUID();
        s.live = { id, key, text: "", phase: "", note: "", pct: -1 };
        let r: Response;
        try {
          const it = (await io()).brief(id, [
            { role: "system", content: SYSTEM },
            { role: "user", content: `${ask(subject)}\n\nHeadlines:\n- ${headlines.join("\n- ")}` },
          ]);
          let text = "", shown = 0;
          for (let n = await it.next();; n = await it.next()) {
            if (n.done) {
              r = n.value;
              break;
            }
            const c = n.value;
            if (c.type === "delta") text += c.text;
            else {
              const l: Live = s.live!, phase = c.phase ?? l.phase;
              // A new phase drops the old one's note ("2 ahead" must not outlive the queue).
              s.live = { ...l, phase, note: c.note ?? (phase === l.phase ? l.note : ""), pct: c.pct ?? -1 };
            }
            // ~6 updates a second: smooth to read, cheap to sync.
            if (Date.now() - shown > 150) {
              s.live = { ...s.live!, text: clean(text) };
              shown = Date.now();
            }
          }
        } catch (e) {
          // The link broke mid-brief (aipro quit): no briefs until the next check finds it again.
          r = { v: 1, ok: false, kind: "failed", reason: `aipro connection lost: ${message(e)}` };
          s.up = s.ready = false;
        } finally {
          s.live = null;
        }
        // Cancelled by the user: nothing to report, the old brief stays.
        if (!r.ok && r.reason === "cancelled") return;
        s.last = lastOf(r, Date.now());
        if (!r.ok) {
          if (r.kind === "unsupported") s.up = s.ready = false;
          throw new Error(r.reason);
        }
        const out = clean(String(r.output.kind === "value" ? r.output.value : ""));
        if (!out) throw new Error(`${r.served.name} returned nothing`);
        s.notes[key] = { text: out, at: Date.now(), model: r.served.name, note: r.served.note };
      });
    },
  },
});
