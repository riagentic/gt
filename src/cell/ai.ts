import { cell, serverImport } from "aio";
import { idle, type Status, tracked } from "../lib/status.ts";

// Local AI briefs (Ollama). `notes` holds one brief per subject: "world" or a country ISO code.
export type Note = { text: string; at: number; model: string };
export type State = {
  model: string;
  models: string[];
  notes: Record<string, Note>;
  status: Status;
  modelStatus: Status;
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

export const ai = cell("ai", {
  state: { model: "", models: [], notes: {}, status: idle(), modelStatus: idle() } as State,
  persist: { exclude: ["status.busy", "modelStatus.busy"] },
  concurrency: { refreshModels: "first", summarize: "queue" },
  long: ["summarize"],
  args: {
    summarize: [
      (v) => (typeof v === "string" && v.length > 0 && v.length <= 60) || "subject: 1–60 characters",
      (v) => (typeof v === "string" && v.length > 0) || "a key",
      (v) => (Array.isArray(v) && v.length > 0 && v.length <= 80) || "1–80 headlines",
    ],
  },
  methods: {
    async refreshModels(s) {
      await tracked(s, "modelStatus", async () => {
        const models = await (await io()).models();
        s.models = models;
        // aio-ok: the CURRENT choice on purpose — keep it if still installed (setModel may have run meanwhile)
        if (!models.includes(s.model)) s.model = models[0] ?? "";
      });
    },
    setModel(s, model: string) {
      if (!s.models.includes(model)) throw new Error(`model ${model} not installed`);
      s.model = model;
    },
    /** Brief `subject` from headlines (newest, most-reported first); stored under `key`. */
    async summarize(s, subject: string, key: string, headlines: string[]) {
      const model = s.model;
      await tracked(s, "status", async () => {
        if (!model) throw new Error("No local model — install Ollama and pull one (e.g. qwen3:1.7b)");
        const text = await (await io()).chat(
          model,
          SYSTEM,
          `${ask(subject)}\n\nHeadlines:\n- ${headlines.join("\n- ")}`,
        );
        if (!text) throw new Error(`${model} returned nothing`);
        s.notes[key] = { text, at: Date.now(), model };
      });
    },
  },
});
