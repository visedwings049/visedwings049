/**
 * Optional offline LLM-backed prompt drafting via Ollama (https://ollama.com),
 * running entirely on the user's own machine — no API key, no cloud call.
 * Falls back to the deterministic template in promptBuilder.ts when unset
 * or unreachable; nothing here is required for the app to work.
 */
export interface OfflineModelConfig {
  baseUrl: string;
  model: string;
}

export function getOfflineModelConfig(): OfflineModelConfig {
  return {
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    model: process.env.OLLAMA_MODEL ?? "llama3.2",
  };
}

export async function generatePromptWithOfflineModel(
  phrase: string,
  context: string,
  style: string,
  config: OfflineModelConfig = getOfflineModelConfig()
): Promise<string> {
  const system =
    "You write short, vivid prompts for an AI video generator that produces seamless looping background " +
    "visuals for a church sermon screen. Reply with ONLY the prompt text: one paragraph, no preamble, no quotes, no markdown.";
  const user = [
    style.trim() && `Visual style: ${style.trim()}.`,
    `Sermon phrase to depict: "${phrase}".`,
    context.trim() && `Surrounding context from the sermon: "${context.trim()}".`,
    "Describe an abstract or symbolic visual (never literal on-screen text), and explicitly require a seamless " +
      "continuous loop with a matching first and last frame.",
  ]
    .filter(Boolean)
    .join(" ");

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: config.model, system, prompt: user, stream: false }),
    });
  } catch (err) {
    throw new Error(
      `Couldn't reach the offline model at ${config.baseUrl} (is Ollama running? \`ollama serve\`). ${
        (err as Error).message
      }`
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Offline model request failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { response?: string };
  const text = data.response?.trim();
  if (!text) throw new Error("Offline model returned an empty response");
  return text;
}
