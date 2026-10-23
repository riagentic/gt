// Keyword matching for the watchlist. Pure.
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word, case-insensitive; a phrase matches as written. Returns the first word that hits. */
export const match = (title: string, words: string[]): string | null =>
  words.find((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(w)}($|[^\\p{L}\\p{N}])`, "iu").test(title)) ?? null;

export const normalizeWord = (w: string): string => w.trim().replace(/\s+/g, " ").toLowerCase();
