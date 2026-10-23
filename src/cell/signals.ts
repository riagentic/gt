import { cell, serverImport } from "aio";
import type { Signals } from "../lib/signals.ts";
import { idle, type Status, tracked } from "../lib/status.ts";

// Market signals (risk-off pressure, Fed/recession odds shifts). Each refresh also appends to <data>/signals.jsonl.
export type State = { now: Signals | null; status: Status };
const io = () =>
  serverImport<typeof import("../server/signals.server.ts")>("../server/signals.server.ts", import.meta.url);

export const signals = cell("signals", {
  state: { now: null, status: idle() } as State,
  persist: { exclude: ["status.busy"] },
  concurrency: { refresh: "first" },
  long: ["refresh"],
  methods: {
    async refresh(s) {
      await tracked(s, "status", async () => {
        s.now = await (await io()).signals(Date.now());
      });
    },
  },
});
