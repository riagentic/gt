import { cell, serverImport } from "aio";
import type { Story } from "../lib/stories.ts";
import { watch } from "./watch.ts";
import { idle, message, type Status } from "../lib/status.ts";

export type State = { stories: Story[]; failed: string[]; status: Status };

export const news = cell("news", {
  state: { stories: [], failed: [], status: idle() } as State,
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
        const { stories, failed } = await src.news(Date.now());
        s.stories = stories;
        await watch.scan(stories.map(({ id, title }) => ({ id, title })));
        s.failed = failed;
        s.status = { at: Date.now(), ok: true, err: failed.length ? `${failed.length} feeds failed` : "", busy: false };
      } catch (e) {
        s.status = { ...s.status, ok: false, err: message(e), busy: false };
      }
    },
  },
});
