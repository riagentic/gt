// Raw feed items + WASM analysis → deduped, clustered stories. Pure.
import type { Region } from "../data/feeds.ts";

export type Raw = { title: string; link: string; at: number; summary: string; source: string; region: Region };
export type Mention = { source: string; title: string; link: string };
export type Story = {
  id: string;
  title: string;
  link: string;
  summary: string;
  source: string;
  region: Region;
  at: number;
  first: number;
  places: number[];
  size: number;
  also: Mention[];
};

export const hash = (s: string): string => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};

/** Newest-first, one per link and per normalized title. */
export const dedupe = (items: Raw[]): Raw[] => {
  const seen = new Set<string>();
  return [...items].sort((a, b) => b.at - a.at).filter((i) => {
    const t = i.title.toLowerCase().replace(/\W+/g, " ").trim();
    if (seen.has(i.link) || seen.has(t)) return false;
    seen.add(i.link).add(t);
    return true;
  });
};

/** Group by cluster id; lead = earliest report; ranked by latest activity. */
/** Newest `limit` stories, plus each source's newest `perSource` so slow feeds (agencies, papers, good news)
 *  are not crowded out by busy ones. Newest first. */
export const toStories = (
  items: Raw[],
  tags: number[][],
  clusters: number[],
  limit: number,
  perSource = 6,
): Story[] => {
  const groups = new Map<number, number[]>();
  const shown = new Map<string, number>(); // stories kept per source, newest first
  clusters.forEach((c, i) => groups.set(c, [...(groups.get(c) ?? []), i]));
  return [...groups.values()].map((idx): Story => {
    const members = idx.map((i) => items[i]).sort((a, b) => a.at - b.at);
    const lead = members[0];
    const places = [...new Set(idx.flatMap((i) => tags[i] ?? []))];
    const sources = new Set(members.map((m) => m.source));
    return {
      id: hash(lead.link),
      title: lead.title,
      link: lead.link,
      summary: lead.summary,
      source: lead.source,
      region: lead.region,
      at: members.at(-1)!.at,
      first: lead.at,
      places,
      size: sources.size,
      also: members.slice(1).filter((m) => m.source !== lead.source).slice(0, 6)
        .map(({ source, title, link }) => ({ source, title, link })),
    };
  }).sort((a, b) => b.at - a.at).filter((x, i) => {
    const n = (shown.get(x.source) ?? 0) + 1;
    shown.set(x.source, n);
    return i < limit || n <= perSource;
  });
};
