// Czech for every fixed UI text, keyed by the English text exactly as written in the UI (`L("…")`). Placeholders
// `{name}` stay as they are. One part per UI area; a missing entry shows the English.
import app from "./cs/app.ts";
import data from "./cs/data.ts";
import details from "./cs/details.ts";
import events from "./cs/events.ts";
import map from "./cs/map.ts";
import money from "./cs/money.ts";
import panels from "./cs/panels.ts";
import tv from "./cs/tv.ts";

export const CS: Record<string, string> = {
  ...data,
  ...app,
  ...panels,
  ...details,
  ...events,
  ...money,
  ...tv,
  ...map,
};
