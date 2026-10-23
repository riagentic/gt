// Parsers for satellites, GPS interference, travel advisories, WHO outbreaks. Pure.
import { BY_ISO, COUNTRIES } from "../data/countries.ts";
import type { FeedItem } from "./rss.ts";

export type Tle = { id: string; name: string; group: SatGroup; l1: string; l2: string };
export type SatGroup = "stations" | "military" | "gnss" | "earth";
export type Advisory = { place: number; name: string; level: 1 | 2 | 3 | 4; url: string; at: number };
export type Outbreak = { id: string; title: string; url: string; at: number; places: number[] };
export type JamCell = { hex: string; level: 1 | 2; bad: number; total: number };

/** 3-line TLE text → records (name line, then lines 1 and 2). */
export const tles = (text: string, group: SatGroup): Tle[] => {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  const out: Tle[] = [];
  for (let i = 0; i + 2 < lines.length; i++) {
    const [name, l1, l2] = [lines[i], lines[i + 1], lines[i + 2]];
    if (l1.startsWith("1 ") && l2.startsWith("2 ") && l1.length >= 69 && l2.length >= 69) {
      out.push({ id: l1.slice(2, 7).trim(), name: name.trim(), group, l1, l2 });
      i += 2;
    }
  }
  return out;
};

/** "Iraq - Level 4: Do Not Travel" → ["Iraq", 4]. */
export const advisoryTitle = (title: string): [string, 1 | 2 | 3 | 4] | null => {
  const m = title.match(/^(.*?)\s+-\s+Level\s+([1-4])\b/i);
  return m ? [m[1].trim(), Number(m[2]) as 1 | 2 | 3 | 4] : null;
};

// State Dept spellings that differ from Natural Earth names.
const ADVISORY_ISO: Record<string, string> = {
  "bosnia and herzegovina": "BA",
  burma: "MM",
  "central african republic": "CF",
  "côte d'ivoire": "CI",
  "democratic republic of the congo": "CD",
  "dominican republic": "DO",
  "equatorial guinea": "GQ",
  gaza: "PS",
  "west bank": "PS",
  "kingdom of denmark": "DK",
  "republic of congo": "CG",
  "solomon islands": "SB",
  "south sudan": "SS",
  "kyrgyz republic": "KG",
  "mexico travel advisory": "MX",
};
const key = (name: string) => name.trim().toLowerCase().replace(/[’`]/g, "'").replace(/^the /, "");
const PLACE = new Map<string, number>([
  ...COUNTRIES.map((c, i): [string, number] => [key(c.name), i]),
  ...Object.entries(ADVISORY_ISO).map(([n, iso]): [string, number] => [n, BY_ISO[iso]]),
]);

/** Exact country lookup — territories (Aruba, French Polynesia…) deliberately resolve to nothing. */
export const advisoryPlace = (name: string): number | undefined => PLACE.get(key(name));

/** Advisory feed items → one per country, the most severe (then newest). */
export const advisories = (items: FeedItem[]): Advisory[] => {
  const best = new Map<number, Advisory>();
  for (const it of items) {
    const t = advisoryTitle(it.title), place = t ? advisoryPlace(t[0]) : undefined;
    if (!t || place === undefined) continue;
    const prev = best.get(place);
    if (!prev || t[1] > prev.level || (t[1] === prev.level && it.at > prev.at)) {
      best.set(place, { place, name: t[0].trim(), level: t[1], url: it.link, at: it.at });
    }
  }
  return [...best.values()].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
};

// deno-lint-ignore no-explicit-any
export const who = (j: any): { id: string; title: string; url: string; at: number }[] =>
  (j?.value ?? []).map((v: Record<string, unknown>) => ({
    id: String(v.ItemDefaultUrl ?? ""),
    title: String(v.Title ?? "").trim(),
    url: `https://www.who.int/emergencies/disease-outbreak-news/item${String(v.ItemDefaultUrl ?? "")}`,
    at: Date.parse(String(v.PublicationDateAndTime ?? "")) || 0,
  })).filter((o: { id: string; title: string }) => o.id && o.title);

/** gpsjam.org daily H3 CSV → cells with interference. gpsjam's bands: >10% bad = high, 2–10% = medium. */
export const jamCells = (csv: string, minAircraft = 5): JamCell[] =>
  csv.split("\n").slice(1).flatMap((line): JamCell[] => {
    const [hex, good, bad] = line.split(",");
    const g = Number(good), b = Number(bad), total = g + b;
    if (!hex || !Number.isFinite(total) || total < minAircraft) return [];
    const r = b / total;
    return r > 0.1 ? [{ hex, level: 2, bad: b, total }] : r > 0.02 ? [{ hex, level: 1, bad: b, total }] : [];
  });
