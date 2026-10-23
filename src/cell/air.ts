import { cell, serverImport } from "aio";
import type { Aircraft } from "../lib/normalize.ts";
import { idle, message, type Status } from "../lib/status.ts";

export type State = { planes: Aircraft[]; status: Status };

// Live positions are stale within minutes: never persisted.
export const air = cell("air", {
  state: { planes: [], status: idle() } as State,
  persist: "none",
  concurrency: { refresh: "first" },
  methods: {
    async refresh(s) {
      s.status.busy = true;
      try {
        const src = await serverImport<typeof import("../server/sources.server.ts")>(
          "../server/sources.server.ts",
          import.meta.url,
        );
        s.planes = await src.aircraft();
        s.status = { at: Date.now(), ok: true, err: "", busy: false };
      } catch (e) {
        s.status = { ...s.status, ok: false, err: message(e), busy: false };
      }
    },
  },
});
