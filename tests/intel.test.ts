import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import { BY_ISO } from "../src/data/countries.ts";
import * as intel from "../src/lib/intel.ts";
import { period, position, track } from "../src/lib/orbit.ts";
import { match, normalizeWord } from "../src/lib/watch.ts";

const ISS = [
  "ISS (ZARYA)",
  "1 25544U 98067A   26294.04791053  .00009575  00000+0  18188-3 0  9996",
  "2 25544  51.6327  37.2623 0006759 289.5321  70.4938 15.48967427591263",
].join("\n");

Deno.test("tle: parses 3-line sets, skips junk", () => {
  const t = intel.tles(`garbage\n${ISS}\n\nHALF\n1 short`, "stations");
  assertEquals(t.map((x) => [x.id, x.name, x.group]), [["25544", "ISS (ZARYA)", "stations"]]);
});

Deno.test("orbit: ISS ~420 km, ~7.66 km/s, ~93 min, track splits at antimeridian", () => {
  const [t] = intel.tles(ISS, "stations");
  const at = new Date("2026-10-21T12:00:00Z");
  const p = position(t, at)!;
  assert(p.alt > 380 && p.alt < 460, `alt ${p.alt}`);
  assertAlmostEquals(p.speed, 7.66, 0.05);
  assert(Math.abs(p.lat) <= 51.7);
  assertAlmostEquals(period(t), 92.97, 0.1);
  const segs = track(t, at);
  assert(segs.length >= 1 && segs.every((s) => s.every(([lon], i) => i === 0 || Math.abs(lon - s[i - 1][0]) < 180)));
});

Deno.test("advisories: exact names + State Dept spellings, most severe wins, territories ignored", () => {
  const item = (title: string, at = 1) => ({ title, link: `https://t/${title}`, at, summary: "" });
  const list = intel.advisories([
    item("France - Level 2: Exercise Increased Caution"),
    item("French Polynesia - Level 1: Exercise Normal Precautions", 9),
    item("Burma - Level 4: Do Not Travel"),
    item("The West Bank - Level 3: Reconsider Travel"),
    item("Gaza - Level 4: Do Not Travel"),
    item("Côte d’Ivoire - Level 2: Exercise Increased Caution"),
    item("Aruba - Level 1: Exercise Normal Precautions"),
    item("travel.state.gov: Travel Advisories"),
  ]);
  assertEquals(list.map((a) => [a.place, a.level]), [
    [BY_ISO.MM, 4],
    [BY_ISO.PS, 4],
    [BY_ISO.CI, 2],
    [BY_ISO.FR, 2],
  ]);
});

Deno.test("who + gpsjam parsers", () => {
  const w = intel.who({
    value: [{ ItemDefaultUrl: "/2026-DON1", Title: " Ebola - DRC ", PublicationDateAndTime: "2026-10-01T00:00:00Z" }, {
      Title: "no id",
    }],
  });
  assertEquals(w, [{
    id: "/2026-DON1",
    title: "Ebola - DRC",
    url: "https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON1",
    at: Date.parse("2026-10-01T00:00:00Z"),
  }]);
  // >10% bad = high, 2–10% = medium, ≤2% or <5 aircraft = nothing
  const cells = intel.jamCells(
    "hex,count_good_aircraft,count_bad_aircraft\na,90,10\nb,95,5\nc,100,1\nd,1,3\ne,80,20\n",
  );
  assertEquals(cells.map((c) => [c.hex, c.level]), [["a", 1], ["b", 1], ["e", 2]]);
});

Deno.test("watch: whole words, phrases, unicode, case", () => {
  assertEquals(match("Iran says ships hit", ["iran"]), "iran");
  assertEquals(match("Iranian oil exports", ["iran"]), null);
  assertEquals(match("Drone strike hits base", ["taiwan", "drone strike"]), "drone strike");
  assertEquals(match("São Paulo floods", ["são paulo"]), "são paulo");
  assertEquals(match("C++ (lang) news", ["c++"]), "c++");
  assertEquals(normalizeWord("  Drone   Strike "), "drone strike");
});
