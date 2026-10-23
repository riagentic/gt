import { cell, serverImport } from "aio";
import type { Tle } from "../lib/intel.ts";
import { idle, message, type Status } from "../lib/status.ts";

// Orbital elements only; positions are propagated in the window (SGP4), never stored.
export type State = { tles: Tle[]; status: Status };
const HOURS_6 = 6 * 3_600_000;

export const sky = cell("sky", {
  state: { tles: [], status: idle() } as State,
  persist: { exclude: ["status.busy"] },
  concurrency: { refresh: "first" },
  methods: {
    async refresh(s, force: boolean) {
      if (!force && s.tles.length && Date.now() - s.status.at < HOURS_6) return; // CelesTrak asks ≥2h
      s.status.busy = true;
      try {
        const src = await serverImport<typeof import("../server/sources.server.ts")>(
          "../server/sources.server.ts",
          import.meta.url,
        );
        s.tles = await src.satellites();
        s.status = { at: Date.now(), ok: true, err: "", busy: false };
      } catch (e) {
        s.status = { ...s.status, ok: false, err: message(e), busy: false };
      }
    },
  },
});
