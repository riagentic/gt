import { cell } from "aio";

// Per-window UI state: what is selected, what is searched. Never synced or persisted.
export type Pick =
  | { kind: "story"; id: string }
  | { kind: "quake"; id: string }
  | { kind: "event"; id: string }
  | { kind: "plane"; id: string }
  | { kind: "sat"; id: string }
  | { kind: "outbreak"; id: string }
  | { kind: "place"; id: string }
  | { kind: "weather"; id: string }
  | { kind: "siren"; id: string }
  | { kind: "protest"; id: string }
  | { kind: "site"; id: string } // static infrastructure: base, plant, spaceport, data center, port
  | { kind: "chokepoint"; id: string }
  | { kind: "sensor"; id: string }
  | { kind: "anomaly"; id: string }
  | { kind: "country"; id: number };
export type State = {
  pick: Pick | null;
  query: string;
  palette: boolean;
  /** Bumped on every select: the map re-centers even when the same item is picked again. */
  seq: number;
};

export const view = cell("view", {
  scope: "client",
  state: { pick: null, query: "", palette: false, seq: 0 } as State,
  methods: {
    select(s, pick: Pick | null) {
      s.pick = pick;
      s.seq++;
    },
    search(s, q: string) {
      s.query = q;
    },
    setPalette(s, open: boolean) {
      s.palette = open;
    },
  },
});
