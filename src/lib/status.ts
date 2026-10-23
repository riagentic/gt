// Per-source freshness, shown as a dot next to each source.
export type Status = { at: number; ok: boolean; err: string; busy: boolean };
export const idle = (): Status => ({ at: 0, ok: true, err: "", busy: false });
export const message = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 200);

/** Run one source refresh: busy while it runs, then a fresh ok status or the error. Old data stays on failure. */
export async function tracked<K extends string>(
  s: { [k in K]: Status },
  key: K,
  fn: () => Promise<string | void>,
): Promise<void> {
  s[key].busy = true;
  try {
    const warn = await fn();
    s[key] = { at: Date.now(), ok: true, err: warn ?? "", busy: false };
  } catch (e) {
    s[key] = { ...s[key], ok: false, err: message(e), busy: false };
  }
}
