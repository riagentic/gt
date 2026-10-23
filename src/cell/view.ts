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
  /** Web page open in the in-app reader (right panel), or null. */
  page: string | null;
  /** The page fills the whole panel (details hidden). */
  full: boolean;
  /** Bumped on every select: the map re-centers even when the same item is picked again. */
  seq: number;
};

export const view = cell("view", {
  scope: "client",
  state: { pick: null, query: "", palette: false, seq: 0, page: null, full: false } as State,
  methods: {
    select(s, pick: Pick | null) {
      s.pick = pick;
      s.page = null;
      s.full = false;
      s.seq++;
    },
    /** Open a web page in the reader; null returns to the details (or closes when there are none). */
    read(s, url: string | null) {
      s.page = url;
      s.full = false;
    },
    setFull(s, on: boolean) {
      s.full = on && s.page !== null;
    },
    search(s, q: string) {
      s.query = q;
    },
    setPalette(s, open: boolean) {
      s.palette = open;
    },
  },
});
