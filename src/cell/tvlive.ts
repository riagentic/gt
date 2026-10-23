import { cell, serverImport } from "aio";
import { YOUTUBE } from "../data/channels.ts";
import { idle, type Status, tracked } from "../lib/status.ts";

// Which Live TV channels are on air, and the live video each one plays. Checked only while Live TV is in use (each
// check reads ~25 MB of YouTube pages).
export type State = {
  /** Channel id → live video id; null = off air. Absent = not checked yet. */
  videos: Record<string, string | null>;
  status: Status;
};
const io = () => serverImport<typeof import("../server/world.server.ts")>("../server/world.server.ts", import.meta.url);
const INITIAL: State = { videos: {}, status: idle() };

export const tvlive = cell("tvlive", {
  version: 2,
  onMigrate: () => INITIAL, // v1 kept booleans: just check again
  state: INITIAL,
  persist: { exclude: ["status.busy"] },
  concurrency: { check: "first" },
  long: ["check"],
  methods: {
    /** At most every 30 min, unless `force` (a channel's video stopped). */
    async check(s, force: boolean) {
      if (!force && s.status.ok && Date.now() - s.status.at < 30 * 60_000) return;
      await tracked(s, "status", async () => {
        s.videos = await (await io()).liveChannels(YOUTUBE);
      });
    },
  },
});
