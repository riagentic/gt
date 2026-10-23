// TV sound carried across channel switches. Pure.
export type Sound = { muted: boolean; volume: number }; // volume 0–100, YouTube's scale
/** First play of a session: sound on, medium volume. */
export const START: Sound = { muted: false, volume: 50 };
/** Console prefix the guest page uses to report its sound to the app. */
export const TAG = "bwm:sound:";

/** Read a guest report; anything else (other console lines, bad JSON, bad values) is null. */
export function readSound(line: string): Sound | null {
  if (!line.startsWith(TAG)) return null;
  try {
    const s = JSON.parse(line.slice(TAG.length));
    return typeof s?.muted === "boolean" && Number.isFinite(s?.volume) && s.volume >= 0 && s.volume <= 100
      ? { muted: s.muted, volume: Math.round(s.volume) }
      : null;
  } catch {
    return null;
  }
}

/** Script run in the YouTube embed: wait for its player, apply `s`, then report every volume change. */
export const guestScript = (s: Sound): string =>
  `(() => {
  const want = ${JSON.stringify(s)}, tag = ${JSON.stringify(TAG)}, t0 = Date.now();
  const id = setInterval(() => {
    const p = document.getElementById("movie_player"), v = document.querySelector("video");
    if (Date.now() - t0 > 30000) return clearInterval(id);
    if (!p || !v || typeof p.setVolume !== "function") return;
    clearInterval(id);
    p.setVolume(want.volume);
    want.muted ? p.mute() : p.unMute();
    v.addEventListener("volumechange", () =>
      console.info(tag + JSON.stringify({ muted: p.isMuted(), volume: p.getVolume() })));
  }, 250);
})()`;

/** A channel's /live page (its first ~1 MB) → the live video's id when on air and embeddable, else null. The
 *  canonical link names a video only while live; playability decides whether our embed can show it. We embed that
 *  video directly: YouTube's "whatever this channel streams" embed says "video unavailable" for many live channels. */
export const liveVideo = (html: string): string | null => {
  const id = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/)?.[1];
  return id && /"playabilityStatus":\{"status":"OK"/.test(html) && !/"playableInEmbed":false/.test(html) ? id : null;
};
