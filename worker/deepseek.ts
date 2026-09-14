import type { Env } from "./env";
import type { ClaudeResult } from "./claude";

/**
 * Chama a API da DeepSeek (compatível com o formato OpenAI chat/completions).
 * Mesma forma de retorno do callClaude/callGemini — as três são
 * intercambiáveis via worker/ai.ts.
 * Requer o secret DEEPSEEK_API_KEY (platform.deepseek.com, billing próprio).
 */
export async function callDeepSeek(
  env: Env,
  system: string,
  userContent: string,
  maxTokens = 8000,
): Promise<ClaudeResult> {
  if (!env.DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY não configurado. Rode: wrangler secret put DEEPSEEK_API_KEY");
  }
  const model = env.DEEPSEEK_MODEL || "deepseek-chat";

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    }),
  });

  const json = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(`DeepSeek API ${res.status}: ${JSON.stringify(json.error ?? json)}`);
  }

  const text = json.choices?.[0]?.message?.content?.trim() ?? "";
  const finishReason = json.choices?.[0]?.finish_reason ?? null;
  if (!text) {
    throw new Error(
      `Resposta sem texto (finish_reason=${finishReason}, output_tokens=${json.usage?.completion_tokens}). Tente aumentar max_tokens.`,
    );
  }

  return {
    text,
    model,
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
    stopReason: finishReason,
  };
}
