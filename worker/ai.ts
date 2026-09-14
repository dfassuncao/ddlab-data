import type { Env } from "./env";
import { callClaude, type ClaudeResult } from "./claude";
import { callGemini } from "./gemini";

export type AiProvider = "gemini" | "claude";

/**
 * Ponto único de chamada de IA generativa — despacha para Gemini (padrão) ou
 * Claude conforme o "ai_provider" configurado na conta (Configurações).
 */
export async function callAI(
  env: Env,
  provider: string | null | undefined,
  system: string,
  userContent: string,
  maxTokens?: number,
): Promise<ClaudeResult> {
  if (provider === "claude") return callClaude(env, system, userContent, maxTokens);
  return callGemini(env, system, userContent, maxTokens);
}
