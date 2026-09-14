import type { Env } from "./env";
import type { ClaudeResult } from "./claude";

/**
 * Chama a API do Gemini (generateContent). Mesma forma de retorno do
 * callClaude — as duas são intercambiáveis via worker/ai.ts.
 * Requer o secret GEMINI_API_KEY (Google AI Studio / Vertex, billing próprio).
 */
export async function callGemini(
  env: Env,
  system: string,
  userContent: string,
  maxTokens = 8000,
): Promise<ClaudeResult> {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY não configurado. Rode: wrangler secret put GEMINI_API_KEY");
  }
  const model = env.GEMINI_MODEL || "gemini-3.7-flash";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": env.GEMINI_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: userContent }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    },
  );

  const json = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(`Gemini API ${res.status}: ${JSON.stringify(json.error ?? json)}`);
  }

  const candidate = json.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((p: any) => p.text ?? "")
    .join("\n")
    .trim();

  const finishReason = candidate?.finishReason ?? null;
  if (!text) {
    throw new Error(
      `Resposta sem texto (finishReason=${finishReason}, output_tokens=${json.usageMetadata?.candidatesTokenCount}). Tente aumentar max_tokens.`,
    );
  }

  return {
    text,
    model,
    inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
    stopReason: finishReason,
  };
}
