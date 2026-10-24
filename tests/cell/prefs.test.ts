import { assertEquals } from "@std/assert";
import { testCell } from "aio/testing";
import { LAYERS, prefs, PRESETS } from "../../src/cell/prefs.ts";

testCell(prefs, "tabs: switch, re-click collapses, toggleSidebar reopens", (t) => {
  t.send.setTab("news");
  t.expect.state((s) => s.tab === "news" && s.sidebar);
  t.send.setTab("news");
  t.expect.state((s) => !s.sidebar);
  t.send.toggleSidebar();
  t.expect.state((s) => s.sidebar && s.tab === "news");
});

testCell(prefs, "layers, projection, theme, region, magnitude", async (t) => {
  t.send.setLayer("air", true);
  t.send.setProjection("equal");
  t.send.setTheme("dark");
  t.send.setRegion("europe");
  t.send.setMinMag(6);
  t.expect.state((s) =>
    s.layers.air && s.projection === "equal" && s.theme === "dark" && s.region === "europe" && s.minMag === 6
  );
  await t.expect.rejects(() => t.send.setLayer("nope" as never, true), /no layer/);
  await t.expect.rejects(() => t.send.setMinMag(1), /2\.5–8/);
  await t.expect.rejects(() => t.send.setProjection("polar" as never), /no projection/);
  assertEquals(Object.keys(t.getState().layers).length, LAYERS.length);
});

testCell(prefs, "solo shows one layer; again restores the mix; a switch keeps the current mix", (t) => {
  const before = { ...t.getState().layers };
  t.send.solo("quakes");
  t.expect.state((s) => s.soloed === "quakes" && Object.entries(s.layers).every(([k, v]) => v === (k === "quakes")));
  t.send.solo("ports"); // solo another: still restores the ORIGINAL mix later
  t.expect.state((s) => s.soloed === "ports" && s.layers.ports && !s.layers.quakes);
  t.send.solo("ports");
  assertEquals(t.getState().layers, before);
  t.send.solo("air");
  t.send.setLayer("night", true); // manual change: solo ends, current mix kept
  t.expect.state((s) => s.soloed === null && s.saved === null && s.layers.air && s.layers.night && !s.layers.news);
});

testCell(prefs, "presets set layers + region and clear solo", (t) => {
  t.send.solo("bases");
  t.send.focus("security");
  t.expect.state((s) => s.preset === "security" && s.region === "defense" && s.soloed === null);
  assertEquals(t.getState().layers, PRESETS.security.layers);
  t.send.setLayer("night", true);
  t.expect.state((s) => s.preset === null);
});

testCell(prefs, "tv: float, move, dock (opens the tab), close; channel and rect validated", async (t) => {
  t.send.floatTv({ x: 10, y: 20, w: 400, h: 260 });
  t.expect.state((s) => s.tv.floating && s.tv.rect.w === 400);
  t.send.moveTv({ x: 30, y: 40, w: 500, h: 300 });
  t.send.setChannel("UCknLrEdhRCp1aegoMqRaCZg");
  t.send.dockTv();
  t.expect.state((s) => !s.tv.floating && s.tab === "tv" && s.sidebar && s.tv.rect.x === 30);
  t.send.floatTv({ x: 1, y: 1, w: 300, h: 200 });
  t.send.closeTv();
  t.expect.state((s) => !s.tv.floating && s.tv.channel === "UCknLrEdhRCp1aegoMqRaCZg");
  await t.expect.rejects(() => t.send.setChannel("nope"), /not a channel id/);
  t.expect.state((s) => s.lang === "en");
  t.send.setLang("cs");
  t.expect.state((s) => s.lang === "cs");
  await t.expect.rejects(() => t.send.setLang("xx"), /no language xx/);
  await t.expect.rejects(() => t.send.moveTv({ x: 1 } as never), /rect/);
});
