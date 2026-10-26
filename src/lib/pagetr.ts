// Scripts run inside the reader's web page to translate it in place (like a browser's Translate). Pure strings: the
// page runs them, the app only passes texts in and out. Originals are kept in the page (`window.__gn`) for "Original".

/** Readable blocks; a block holding another block is skipped (its inner ones are taken). */
const BLOCK = "h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,dt,dd,td,th,caption,summary";
const SKIP = "nav,footer,aside,form,button,select,script,style,noscript,[role=navigation],[aria-hidden=true]";
export const MAX_BLOCKS = 200;

/** Put every translated block back to its own HTML. */
const restore = `for (const [i, h] of Object.entries(window.__gn ?? {})) {
    const e = document.querySelector('[data-gt="' + i + '"]');
    if (e) e.innerHTML = h;
  }
  window.__gn = {};`;

/** Undo any earlier translation, tag each readable block `data-gt=<i>`, answer their texts in page order. */
export const COLLECT = `(() => {
  ${restore}
  const out = [];
  for (const e of document.querySelectorAll(${JSON.stringify(BLOCK)})) {
    if (out.length >= ${MAX_BLOCKS}) break;
    e.removeAttribute("data-gt");
    if (e.closest(${JSON.stringify(SKIP)}) || e.querySelector(${JSON.stringify(BLOCK)})) continue;
    const t = (e.innerText ?? e.textContent ?? "").replace(/\\s+/g, " ").trim();
    if (t.length < 2 || t.length > 4000 || !/\\p{L}/u.test(t)) continue;
    e.setAttribute("data-gt", String(out.length));
    out.push(t);
  }
  return out;
})()`;

/** Put translations into their blocks: { index: text }. Plain text only — never HTML. */
export const apply = (m: Record<number, string>): string =>
  `((m) => {
  const s = (window.__gn ??= {});
  for (const i in m) {
    const e = document.querySelector('[data-gt="' + i + '"]');
    if (!e) continue;
    if (!(i in s)) s[i] = e.innerHTML;
    e.textContent = m[i];
  }
})(${JSON.stringify(m)})`;

/** Back to the page's own text. */
export const RESTORE = `(() => { ${restore} })()`;

/** Was this document seen before (answers false once per document)? */
export const SEEN = `(() => { const s = window.__gnSeen === true; window.__gnSeen = true; return s; })()`;

/** The page's classes, ids and link targets not sent before (for ad filters): [classes, ids, hrefs]. */
export const FEATURES = `(() => {
  const seen = (window.__gnAb ??= new Set()), out = [[], [], []];
  const add = (k, v) => { const key = k + v; if (v && !seen.has(key)) { seen.add(key); out[k].push(v); } };
  for (const e of document.querySelectorAll("[class],[id],a[href]")) {
    for (const c of e.classList) add(0, c);
    add(1, e.id);
    if (e.localName === "a") add(2, e.getAttribute("href"));
  }
  return out;
})()`;
