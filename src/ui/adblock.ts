// Takes ads and annoyances out of a reader <webview>: as its page starts, the site's own rules and scripts and the
// generic rules; when it has loaded, and again as late ads arrive, the rules its classes, ids and links match
// (server/adblock). Both go in through the <webview> itself, so a page's Content-Security-Policy cannot refuse them.
import { serverFn } from "aio";
import type { adblock } from "../server/adblock.server.ts";
import { FEATURES } from "../lib/pagetr.ts";
import type { Guest } from "./pagetr.ts";

const api = serverFn<typeof adblock>("adblock");
/** After the page loads, look again for ads that come late (ms). */
const LATER = [3_000, 10_000];
/** Sites whose scripts already ran here (host → when), kept a month. */
const PRIMED = "gn.adblock.primed", MONTH = 30 * 24 * 3600_000;

const primed = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(PRIMED) ?? "{}");
  } catch {
    return {};
  }
};

/** First time on this site? Then remember it. A site's scripts mostly leave a cookie (a consent wall's answer): they
 *  run after the page's own, so its first visit shows the wall once more — one reload, and the cookie is there. */
const firstVisit = (host: string): boolean => {
  const all = primed(), now = Date.now();
  if (now - (all[host] ?? 0) < MONTH) return false;
  all[host] = now;
  try {
    localStorage.setItem(
      PRIMED,
      JSON.stringify(Object.fromEntries(Object.entries(all).filter(([, at]) => now - at < MONTH))),
    );
  } catch {
    /* no storage: never reload, rather than reload every time */
    return false;
  }
  return true;
};

const hide = async (el: Guest, site: boolean) => {
  try {
    const url = el.getURL();
    const [classes, ids, hrefs] = site ? [[], [], []] : (await el.executeJavaScript(FEATURES)) as string[][];
    if (!site && !classes.length && !ids.length && !hrefs.length) return;
    const { css, scripts } = await api.rules(url, site, classes, ids, hrefs);
    for (const s of scripts) await el.executeJavaScript(s).catch(() => {});
    if (css) await el.insertCSS(css);
    if (scripts.length && firstVisit(new URL(url).hostname)) el.reload();
  } catch { /* the page went away, or the lists are not loaded: show it as it is */ }
};

/** Hook a reader <webview> (once per element). */
export const unclutter = (el: Guest) => {
  el.addEventListener("did-navigate", () => void hide(el, true));
  el.addEventListener("did-stop-loading", () => {
    void hide(el, false);
    for (const ms of LATER) setTimeout(() => el.isConnected && void hide(el, false), ms);
  });
};
