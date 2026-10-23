import { cell, serverImport } from "aio";
import type { Hazard, Quake } from "../lib/normalize.ts";
import { idle, message, type Status } from "../lib/status.ts";
import { watch } from "./watch.ts";

export type State = { quakes: Quake[]; events: Hazard[]; status: Status };

export const hazards = cell("hazards", {
  state: { quakes: [], events: [], status: idle() } as State,
  persist: { exclude: ["status.busy"] },
  concurrency: { refresh: "first" },
  long: ["refresh"],
  methods: {
    async refresh(s) {
      s.status.busy = true;
      try {
        const src = await serverImport<typeof import("../server/sources.server.ts")>(
          "../server/sources.server.ts",
          import.meta.url,
        );
        const { quakes, events } = await src.hazards();
        s.quakes = quakes;
        s.events = events;
        await watch.scanHazards([
          ...events.filter((e) => e.level === 2).map((e) => ({ id: e.id, title: e.title })),
          ...quakes.filter((q) => q.mag >= 6.5).map((q) => ({
            id: q.id,
            title: `M${q.mag.toFixed(1)} earthquake · ${q.place}`,
          })),
        ]);
        s.status = { at: Date.now(), ok: true, err: "", busy: false };
      } catch (e) {
        s.status = { ...s.status, ok: false, err: message(e), busy: false };
      }
    },
  },
});
