// In-app reader fallback: links that are data files (CSV, XML, JSON, text bulletins) download instead of rendering
// in a <webview>. The reader asks here first; web pages come back null and load normally.
import { serverFns } from "aio";
import { get } from "./net.server.ts";

const MAX = 400_000;
const tag = (xml: string, name: string) =>
  xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() ?? "";

const CAP_FIELDS = {
  headline: "HEADLINE",
  event: "EVENT",
  areaDesc: "AREA",
  senderName: "ISSUED BY",
  effective: "FROM",
  expires: "UNTIL",
  description: "DETAILS",
  instruction: "WHAT TO DO",
};

/** CAP alert XML → readable text: the English <info> block (or the first). */
export const cap = (xml: string): string => {
  const infos = xml.match(/<info>[\s\S]*?<\/info>/g) ?? [];
  const info = infos.find((i) => /<language>en/i.test(i)) ?? infos[0] ?? "";
  return Object.entries(CAP_FIELDS).map(([k, label]) => [label, tag(info, k)]).filter(([, v]) => v)
    .map(([label, v]) => `${label}\n${v}`).join("\n\n");
};

export const reader = serverFns("reader", {
  /** null = a web page (or unreachable): let the webview load it. */
  peek: async (url: string): Promise<{ text: string } | null> => {
    if (!/^https?:\/\//.test(url)) return null;
    const r = await get(url, "*/*", 15_000).catch(() => null);
    const type = r?.headers.get("content-type") ?? "";
    if (!r || /html/i.test(type)) {
      await r?.body?.cancel();
      return null;
    }
    const body = (await r.text()).slice(0, MAX);
    if (/<alert[\s>]/.test(body) && /<info>/.test(body)) return { text: cap(body) };
    if (/json/i.test(type)) {
      try {
        return { text: JSON.stringify(JSON.parse(body), null, 2) };
      } catch { /* truncated: raw */ }
    }
    return /^(text|application)\/(plain|csv|xml|octet-stream|.*json)|^binary\//i.test(type) &&
        !/\0/.test(body.slice(0, 2000))
      ? { text: body }
      : null;
  },
});
