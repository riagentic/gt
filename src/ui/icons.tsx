// Line icons (24-grid, 1.75 stroke), SF Symbols in spirit.
import type { JSX } from "aio";

const P: Record<string, string> = {
  brief: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2",
  news: "M5 4h11a2 2 0 0 1 2 2v13H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1Zm13 5h2v9a2 2 0 0 1-2 2M8 8h6M8 12h6M8 16h4",
  events: "M12 3 2.5 20h19L12 3Zm0 6v5m0 3v.01",
  markets: "M3 17l5-5 4 4 8-8m0 0h-5m5 0v5",
  bets: "M12 3a9 9 0 1 0 9 9h-9V3Zm3-1a7 7 0 0 1 7 7h-7V2Z",
  layers: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
  settings:
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm7.4 3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4-4",
  close: "M6 6l12 12M18 6 6 18",
  back: "M15 5l-7 7 7 7",
  equal: "M12 5c5.5 0 9 3.1 9 7s-3.5 7-9 7-9-3.1-9-7 3.5-7 9-7Zm-9 7h18M12 5v14",
  globe:
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3Z",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14",
  external: "M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  sidebar: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm5 0v14",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  plane:
    "M12 3c.8 0 1.5.7 1.5 1.5V9l7 4v2l-7-2v4l2 1.5V20L12 19l-3.5 1v-1.5l2-1.5v-4l-7 2v-2l7-4V4.5C10.5 3.7 11.2 3 12 3Z",
  pin: "M12 21s-6-5.4-6-10.5a6 6 0 1 1 12 0C18 15.6 12 21 12 21Zm0-8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  wave: "M3 12h3l2-6 4 12 3-9 2 3h4",
  bell: "M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Zm4 10a2 2 0 0 0 4 0",
  sat: "M13 7 17 3l4 4-4 4-4-4Zm-2 10-4 4-4-4 4-4 4 4Zm-4-6 6 6m-3-3 3-3m1 5a4 4 0 0 0 4-4",
  plus: "M12 5v14M5 12h14",
  locate: "M12 3v3m0 12v3M3 12h3m12 0h3m-9-5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z",
  pulse: "M3 12h4l2-5 4 10 2-5h6",
  tv: "M4 7h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Zm5-4 3 4 3-4",
  sparkle:
    "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 12 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z",
};

export type IconName = keyof typeof P;

export const Icon = (props: { name: IconName; size?: number }): JSX.Element => (
  <svg
    width={props.size ?? 18}
    height={props.size ?? 18}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={P[props.name]} />
  </svg>
);
