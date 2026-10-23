import { cell, serverImport } from "aio";
import type { Macro, Mood, Positioning } from "../lib/econ.ts";
import type { Bet, Quote } from "../lib/normalize.ts";
import type { PolicyRate } from "../lib/world.ts";
import { idle, type Status, tracked } from "../lib/status.ts";

export type State = {
  quotes: Quote[];
  fear: number;
  mood: Mood | null; // CNN Fear & Greed (stocks); `fear` is alternative.me (crypto)
  rates: Macro[];
  cot: Positioning[];
  policy: PolicyRate[]; // central bank rates (BIS)
  bets: Bet[];
  status: Status;
  betStatus: Status;
  macroStatus: Status;
};
const src = () =>
  serverImport<typeof import("../server/sources.server.ts")>("../server/sources.server.ts", import.meta.url);
const world = () =>
  serverImport<typeof import("../server/world.server.ts")>("../server/world.server.ts", import.meta.url);

const INITIAL: State = {
  quotes: [],
  fear: 0,
  mood: null,
  rates: [],
  cot: [],
  policy: [],
  bets: [],
  status: idle(),
  betStatus: idle(),
  macroStatus: idle(),
};

export const markets = cell("markets", {
  version: 3,
  onMigrate: (s) => ({ ...INITIAL, ...s }),
  state: INITIAL,
  persist: { exclude: ["status.busy", "betStatus.busy", "macroStatus.busy"] },
  concurrency: { refresh: "first", refreshBets: "first", refreshMacro: "first" },
  long: ["refresh", "refreshBets"],
  methods: {
    async refresh(s) {
      await tracked(s, "status", async () => {
        const { quotes, fear } = await (await src()).markets();
        s.quotes = quotes;
        s.fear = fear;
      });
    },
    /** Polymarket + Kalshi; either alone is enough. */
    async refreshBets(s) {
      await tracked(s, "betStatus", async () => {
        const [a, b] = await Promise.all([src(), world()]); // load both first: no promise left dangling mid-await
        const [poly, kal] = await Promise.allSettled([a.bets(), b.kalshi()]);
        if (poly.status === "rejected" && kal.status === "rejected") throw poly.reason;
        const all = [
          ...(poly.status === "fulfilled" ? poly.value : []),
          ...(kal.status === "fulfilled" ? kal.value : []),
        ];
        s.bets = all;
        return [poly, kal].some((r) => r.status === "rejected") ? "one venue unreachable" : "";
      });
    },
    async refreshMacro(s) {
      await tracked(s, "macroStatus", async () => {
        const { mood, rates, cot, policy } = await (await world()).macro();
        s.mood = mood;
        s.rates = rates;
        s.cot = cot;
        s.policy = policy;
      });
    },
  },
});
