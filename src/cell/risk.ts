import { cell, serverImport } from "aio";
import type { Advisory, Outbreak } from "../lib/intel.ts";
import { idle, message, type Status } from "../lib/status.ts";

export type State = { advisories: Advisory[]; outbreaks: Outbreak[]; status: Status };
const src = () =>
  serverImport<typeof import("../server/sources.server.ts")>("../server/sources.server.ts", import.meta.url);

export const risk = cell("risk", {
  state: { advisories: [], outbreaks: [], status: idle() } as State,
  persist: { exclude: ["status.busy"] },
  concurrency: { refresh: "first" },
  long: ["refresh"],
  methods: {
    async refresh(s) {
      s.status.busy = true;
      const io = await src();
      const [adv, out] = await Promise.allSettled([io.advisories(Date.now()), io.outbreaks()]);
      if (adv.status === "fulfilled") s.advisories = adv.value;
      if (out.status === "fulfilled") s.outbreaks = out.value;
      const errs = [adv, out].flatMap((r) => (r.status === "rejected" ? [message(r.reason)] : []));
      s.status = { at: Date.now(), ok: errs.length < 2, err: errs.join("; "), busy: false };
    },
  },
});
