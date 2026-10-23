// Outbound HTTP for every source: browser-like headers, hard timeout, loud failure.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36";

export async function get(
  url: string,
  accept = "*/*",
  timeoutMs = 20_000,
  init: RequestInit & { headers?: Record<string, string> } = {},
): Promise<Response> {
  const r = await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, Accept: accept, ...init.headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) {
    await r.body?.cancel();
    throw new Error(`${new URL(url).hostname} → HTTP ${r.status}`);
  }
  return r;
}

export const json = async (url: string, init?: Parameters<typeof get>[3], timeoutMs?: number): Promise<unknown> =>
  (await get(url, "application/json", timeoutMs, init)).json();
export const text = async (url: string): Promise<string> =>
  (await get(url, "application/rss+xml, application/atom+xml, application/xml, text/xml, */*")).text();

/** Run fn over items with at most `limit` in flight. */
export async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (t: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]).then(
        (value) => ({ status: "fulfilled", value }) as const,
        (reason) => ({ status: "rejected", reason }) as const,
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
