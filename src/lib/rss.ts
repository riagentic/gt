// Minimal RSS 2.0 / Atom parser. Pure; tolerant of the junk real feeds ship.
export type FeedItem = { title: string; link: string; at: number; summary: string };

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export const decode = (s: string): string =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
      e[0] === "#"
        ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1))
        : ENT[e.toLowerCase()] ?? m)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tag = (block: string, name: string): string => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
};

const atomLink = (block: string): string =>
  block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)/i)?.[1] ??
    block.match(/<link[^>]*href=["']([^"']+)/i)?.[1] ?? "";

export function parseFeed(xml: string, now: number): FeedItem[] {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) ?? [];
  return blocks.map((b) => {
    const date = tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date");
    const at = Date.parse(decode(date));
    return {
      title: decode(tag(b, "title")),
      link: decode(tag(b, "link")) || atomLink(b),
      at: Number.isFinite(at) ? Math.min(at, now) : now,
      summary: decode(tag(b, "description") || tag(b, "summary") || tag(b, "content")).slice(0, 400),
    };
  }).filter((i) => i.title && /^https?:\/\//.test(i.link));
}
