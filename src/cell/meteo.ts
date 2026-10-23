import { cell, serverImport } from "aio";
import type { Storm, Temps } from "../lib/meteo.ts";
import { idle, type Status, tracked } from "../lib/status.ts";

// Global weather layers: temperature grid and tropical cyclones (rain is map tiles: no state).
export type State = {
  temps: Temps | null;
  storms: Storm[];
  /** Blob URL of the cyclones' cone / wind / track GeoJSON. */
  stormsUrl: string;
  tempStatus: Status;
  stormStatus: Status;
};
const io = () => serverImport<typeof import("../server/world.server.ts")>("../server/world.server.ts", import.meta.url);

export const meteo = cell("meteo", {
  state: { temps: null, storms: [], stormsUrl: "", tempStatus: idle(), stormStatus: idle() } as State,
  persist: { exclude: ["tempStatus.busy", "stormStatus.busy"] },
  concurrency: { refreshTemps: "first", refreshStorms: "first" },
  long: ["refreshTemps", "refreshStorms"],
  methods: {
    /** At most every 2.5 h (the schedule runs every 3): a restart must not spend another 540 free calls. */
    async refreshTemps(s) {
      if (s.temps && Date.now() - s.temps.at < 150 * 60_000) return;
      await tracked(s, "tempStatus", async () => {
        s.temps = await (await io()).temps(Date.now());
      });
    },
    async refreshStorms(s) {
      await tracked(s, "stormStatus", async () => {
        const prev = s.stormsUrl;
        const r = await (await io()).cyclones(prev);
        [s.storms, s.stormsUrl] = [r.storms, r.url];
      });
    },
  },
});
