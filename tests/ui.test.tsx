import { testUI } from "aio/testing";
import App from "../src/App.tsx";
import { prefs } from "../src/cell/prefs.ts";
import { view } from "../src/cell/view.ts";
import { watch } from "../src/cell/watch.ts";
import { BY_ISO } from "../src/data/countries.ts";

// The page fetches its bundled assets (country shapes, infrastructure); hand testUI the files.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) =>
  /^assets\/[\w.-]+\.geojson$/.test(String(input))
    ? Deno.readTextFile(new URL(`../${input}`, import.meta.url)).then((t) => new Response(t))
    : realFetch(input, init);

const ISS1 = "1 25544U 98067A   26294.04791053  .00009575  00000+0  18188-3 0  9996";
const ISS2 = "2 25544  51.6327  37.2623 0006759 289.5321  70.4938 15.48967427591263";

const story = {
  id: "s1",
  title: "Ceasefire talks resume in Kyiv",
  link: "https://example.org/a",
  summary: "Delegations met.",
  source: "Example",
  region: "europe",
  at: Date.now(),
  first: Date.now(),
  places: [BY_ISO.UA],
  size: 3,
  also: [{ source: "Other", title: "Talks resume", link: "https://example.org/b" }],
};
const seed = { news: { stories: [story], failed: [], status: { at: Date.now(), ok: true, err: "", busy: false } } };

testUI(App, "rail switches tabs; re-click collapses the sidebar", { seed }, async (ui) => {
  ui.NewsButton.click();
  await ui.expectCell(prefs, (s) => s.tab === "news" && s.sidebar);
  ui.NewsButton.click();
  await ui.expectCell(prefs, (s) => !s.sidebar);
});

testUI(App, "story → inspector → country", { seed }, async (ui) => {
  ui.NewsButton.click();
  await ui.expectCell(prefs, (s) => s.tab === "news");
  ui.story_s1.click();
  await ui.waitFor(() => view.pick?.kind === "story");
  ui[`country_${BY_ISO.UA}`].click();
  await ui.waitFor(() => view.pick?.kind === "country" && view.pick.id === BY_ISO.UA);
  ui.CloseDetailsButton.click();
  await ui.waitFor(() => view.pick === null);
});

testUI(App, "region filter + text filter", { seed }, async (ui) => {
  ui.NewsButton.click();
  ui.region_asia.click();
  await ui.expectCell(prefs, (s) => s.region === "asia");
  const shows = (t: string) => JSON.stringify(ui.surface()).includes(t);
  await ui.waitFor(() => shows("No stories match") && !shows("Ceasefire talks"));
  ui.region_all.click();
  ui.FilterStoriesInput.type("ceasefire");
  await ui.waitFor(() => view.query === "ceasefire" && shows("Ceasefire talks"));
});

testUI(App, "⌘K palette finds a country and selects it", { seed }, async (ui) => {
  ui.SearchButton.click();
  await ui.waitFor(() => view.palette);
  ui.SearchEverythingInput.type("ukra");
  ui.SearchEverythingInput.press("Enter");
  await ui.waitFor(() => !view.palette && view.pick?.kind === "country");
});

testUI(App, "layer switch toggles prefs", { seed }, async (ui) => {
  ui.LayersButton.click();
  ui.layer_air.check();
  await ui.expectCell(prefs, (s) => s.layers.air);
});

testUI(App, "layer name solos it; clicking again restores; Brief presets switch focus", { seed }, async (ui) => {
  ui.LayersButton.click();
  ui.solo_bases.click();
  await ui.expectCell(prefs, (s) => s.soloed === "bases" && s.layers.bases && !s.layers.news);
  ui.solo_bases.click();
  await ui.expectCell(prefs, (s) => s.soloed === null && s.layers.news && !s.layers.bases);
  ui.BriefButton.click();
  ui.preset_security.click();
  await ui.expectCell(prefs, (s) => s.preset === "security" && s.layers.squawks && s.region === "defense");
});

testUI(App, "Watch: add a keyword, see matches, remove it", { seed }, async (ui) => {
  ui.WatchButton.click();
  ui.AddKeywordInput.type("Kyiv");
  ui.AddKeywordInput.press("Enter");
  await ui.expectCell(watch, (s) => s.words.includes("kyiv"));
  await ui.waitFor(() => JSON.stringify(ui.surface()).includes("Ceasefire talks"));
  ui.unwatch_kyiv.click();
  await ui.expectCell(watch, (s) => s.words.length === 0);
});

testUI(App, "⌘K finds a satellite and turns the layer on", {
  seed: {
    ...seed,
    sky: {
      tles: [{ id: "25544", name: "ISS (ZARYA)", group: "stations", l1: ISS1, l2: ISS2 }],
      status: seed.news.status,
    },
  },
}, async (ui) => {
  ui.SearchButton.click();
  ui.SearchEverythingInput.type("zarya");
  ui.SearchEverythingInput.press("Enter");
  await ui.waitFor(() => view.pick?.kind === "sat");
  await ui.expectCell(prefs, (s) => s.layers.sats);
  await ui.waitFor(() => JSON.stringify(ui.surface()).includes("NORAD ID"));
});
