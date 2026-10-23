// Local AI via Ollama (http://127.0.0.1:11434). Nothing leaves the machine; ":cloud" models are skipped.
const OLLAMA = "http://127.0.0.1:11434";

/** Installed local models, smallest first (fast answers beat clever ones for a brief). */
export async function models(): Promise<string[]> {
  const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
  if (!r?.ok) throw new Error("Ollama is not running — install it from ollama.com, then `ollama pull qwen3:1.7b`");
  const j = await r.json() as { models?: { name: string; size?: number; remote_host?: string }[] };
  return (j.models ?? []).filter((m) => !/cloud/.test(m.name) && !m.remote_host)
    .sort((a, b) => (a.size ?? 0) - (b.size ?? 0)).map((m) => m.name);
}

/** One chat turn; thinking off so small reasoning models answer directly. */
export async function chat(model: string, system: string, prompt: string): Promise<string> {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      options: { temperature: 0.2, num_ctx: 8192 },
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!r.ok) throw new Error(`Ollama → HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
  const j = await r.json() as { message?: { content?: string } };
  // Some models still emit <think>…</think>; the brief is what follows.
  return String(j.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}
