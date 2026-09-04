import type { Env } from "./env";

export interface ClaudeResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}

/**
 * Chama a API da Anthropic (Messages API) direto do Worker.
 * Requer o secret ANTHROPIC_API_KEY (conta Anthropic própria, com billing —
 * é uma chamada de API paga, separada da assinatura do Claude Code).
 */
export async function callClaude(
  env: Env,
  system: string,
  userContent: string,
  maxTokens = 8000,
): Promise<ClaudeResult> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY não configurado. Rode: wrangler secret put ANTHROPIC_API_KEY",
    );
  }
  const model = env.ANTHROPIC_MODEL || "claude-sonnet-5";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  const json = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${JSON.stringify(json.error ?? json)}`);
  }
  const text = (json.content ?? [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");

  const stopReason = json.stop_reason ?? null;
  if (!text) {
    // Aconteceu de bater o teto de tokens antes de emitir texto (ex.: em "thinking").
    // Sobe um erro em vez de guardar uma análise vazia.
    const blockTypes = (json.content ?? []).map((b: any) => b.type).join(",") || "nenhum";
    throw new Error(
      `Resposta sem texto (stop_reason=${stopReason}, blocos=[${blockTypes}], output_tokens=${json.usage?.output_tokens}). Tente aumentar max_tokens.`,
    );
  }

  return {
    text,
    model,
    inputTokens: json.usage?.input_tokens ?? 0,
    outputTokens: json.usage?.output_tokens ?? 0,
    stopReason,
  };
}
