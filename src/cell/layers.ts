import { cell, serverImport } from "aio";
import { idle, message, type Status } from "../lib/status.ts";

// Big geometry lives in blobs; state holds only URLs + summaries.
export type Jam = { url: string; date: string; high: number; medium: number };
export type State = { cablesUrl: string; status: Status; jam: Jam; jamStatus: Status };
const WEEK = 7 * 86_400_000;
const INITIAL: State = {
  cablesUrl: "",
  status: idle(),
  jam: { url: "", date: "", high: 0, medium: 0 },
  jamStatus: idle(),
};
const io = () => serverImport<typeof import("../server/blobs.server.ts")>("../server/blobs.server.ts", import.meta.url);

export const layers = cell("layers", {
  version: 2,
  onMigrate: (s) => ({ ...INITIAL, ...s }),
  state: INITIAL,
  persist: { exclude: ["status.busy", "jamStatus.busy"] },
  concurrency: { refresh: "first", refreshJam: "first" },
  long: ["refreshJam"],
  methods: {
    async refresh(s, force: boolean) {
      if (!force && s.cablesUrl && Date.now() - s.status.at < WEEK) return;
      const previous = s.cablesUrl;
      s.status.busy = true;
      try {
        s.cablesUrl = await (await io()).storeCables(previous);
        s.status = { at: Date.now(), ok: true, err: "", busy: false };
      } catch (e) {
        s.status = { ...s.status, ok: false, err: message(e), busy: false };
      }
    },
    async refreshJam(s) {
      const previous = s.jam.url;
      s.jamStatus.busy = true;
      try {
        s.jam = await (await io()).storeJam(previous);
        s.jamStatus = { at: Date.now(), ok: true, err: "", busy: false };
      } catch (e) {
        s.jamStatus = { ...s.jamStatus, ok: false, err: message(e), busy: false };
      }
    },
  },
});
