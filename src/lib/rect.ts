// Floating panel geometry. Pure.
export type Rect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };

export const MIN: Size = { w: 280, h: 190 };
/** How much of the title bar must stay on screen so the panel can always be grabbed again. */
const GRAB = 80;

/** Fit a rect into the viewport: minimum size, no wider/taller than the view, title bar reachable. */
export function clampRect(r: Rect, view: Size, min: Size = MIN): Rect {
  const w = Math.round(Math.min(Math.max(r.w, min.w), view.w));
  const h = Math.round(Math.min(Math.max(r.h, min.h), view.h));
  const x = Math.round(Math.min(Math.max(r.x, GRAB - w), view.w - GRAB));
  const y = Math.round(Math.min(Math.max(r.y, 0), view.h - 32));
  return { x, y, w, h };
}

/** Move by a pointer delta, then clamp. */
export const moveRect = (r: Rect, dx: number, dy: number, view: Size): Rect =>
  clampRect({ ...r, x: r.x + dx, y: r.y + dy }, view);

/** Resize from the bottom-right corner by a pointer delta, then clamp (top-left stays put). */
export const resizeRect = (r: Rect, dx: number, dy: number, view: Size): Rect => {
  const c = clampRect({ ...r, w: r.w + dx, h: r.h + dy }, view);
  return { ...c, x: r.x, y: r.y, w: Math.min(c.w, view.w - r.x), h: Math.min(c.h, view.h - r.y) };
};
