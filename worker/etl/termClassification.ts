import type { Env } from "../env";
import { callAI } from "../ai";
import { bulkInsert, chunk } from "../db";

/**
 * Classificação por IA (marca própria, concorrente, intenção de busca, etapa
 * do funil etc.) de cada termo de busca do Ads / consulta do GSC. Não entra
 * no cron diário (custa API do provedor de IA) — só roda sob demanda via
 * ?facts=term_classification em /api/refresh, como o keyword_volume.
 */

const TERMS_PER_BATCH = 15;
const MAX_TOKENS = 16000;
/** Quantos lotes rodam em paralelo por vez — Workers tem limite de conexões
 * simultâneas por invocação, então sem isso uma conta com milhares de termos
 * estouraria esse limite. */
const CONCURRENCY = 20;

const CLASSIFICACOES_PRINCIPAIS = [
  "Marca própria",
  "Concorrente",
  "Marca comercializada",
  "Produto ou serviço",
  "Categoria",
  "Tipo ou modalidade",
  "Característica ou atributo",
  "Problema ou necessidade",
  "Localização",
  "Preço ou condição comercial",
  "Comparação ou alternativa",
  "Dúvida ou informação",
  "Avaliação ou reputação",
  "Contato ou navegação",
  "Pós-venda ou suporte",
  "Emprego ou carreira",
  "Irrelevante",
  "Negativa potencial",
];

interface TermRow {
  term: string;
  ads_clicks: number;
  gsc_clicks: number;
}

async function fetchCandidateTerms(env: Env, accountId: string, from: string): Promise<TermRow[]> {
  const { results } = await env.DB.prepare(
    `WITH ads AS (
       SELECT LOWER(TRIM(search_term)) AS term, SUM(clicks) AS clicks
       FROM fact_searchterm_daily WHERE account_id = ? AND day >= ? AND TRIM(search_term) != '' GROUP BY term
     ),
     gsc AS (
       SELECT LOWER(TRIM(query)) AS term, SUM(clicks) AS clicks
       FROM fact_gsc_query_daily WHERE account_id = ? AND day >= ? AND TRIM(query) != '' GROUP BY term
     ),
     terms AS (SELECT term FROM ads UNION SELECT term FROM gsc)
     SELECT t.term AS term, COALESCE(a.clicks, 0) AS ads_clicks, COALESCE(g.clicks, 0) AS gsc_clicks
     FROM terms t
     LEFT JOIN ads a ON a.term = t.term
     LEFT JOIN gsc g ON g.term = t.term
     ORDER BY (COALESCE(a.clicks, 0) + COALESCE(g.clicks, 0)) DESC`,
  )
    .bind(accountId, from, accountId, from)
    .all<TermRow>();
  return results ?? [];
}

function origemDados(t: TermRow): string {
  if (t.ads_clicks > 0 && t.gsc_clicks > 0) return "Google Ads e Search Console";
  if (t.ads_clicks > 0) return "Google Ads";
  if (t.gsc_clicks > 0) return "Search Console";
  return "Google Ads"; // termo com 0 cliques nas duas fontes, mas que ainda apareceu (impressões)
}

function extractJsonArray(text: string): any[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Resposta da IA sem array JSON reconhecível: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

const SYSTEM_PROMPT = `Você classifica termos de busca (Google Ads) e consultas orgânicas (Search Console) de UMA conta de anúncios, para ajudar a agência a organizar campanhas e conteúdo de SEO.

Para CADA termo da lista recebida, gere um objeto JSON com estes campos (todos em português, valores curtos e consistentes entre os termos):

- "termo": o termo exatamente como recebido (não altere).
- "classificacao_principal": UMA destas opções, a que melhor representa o assunto da busca: ${CLASSIFICACOES_PRINCIPAIS.map((c) => `"${c}"`).join(", ")}.
- "etiquetas": array de 2 a 4 strings curtas com elementos adicionais encontrados no termo (ex.: localização, característica, condição comercial, modelo/versão — o que fizer sentido para o negócio).
- "intencao_busca": "Informacional" | "Navegacional" | "Comercial" | "Transacional".
- "etapa_funil": "Descoberta" | "Consideração" | "Decisão" | "Relacionamento".
- "temperatura": "Fria" | "Morna" | "Quente".
- "relevancia": "Alta" | "Média" | "Baixa" | "Irrelevante".
- "adequacao_publico": "Ideal" | "Aceitável" | "Inadequado".
- "localidade": "Sem localização" | "Nacional" | "Regional" | "Cidade" | "Bairro" | "Perto de mim" (a que aparecer no termo).
- "relacionamento_marca": "Própria" | "Concorrente" | "Parceira" | "Terceiro" | "Sem marca".
- "potencial_conversao": "Alto" | "Médio" | "Baixo".
- "cobertura_atual": com base no campo "origem_dados" fornecido para o termo, escolha "Somente Ads" | "Somente orgânico" | "Ads + orgânico" | "Sem cobertura".
- "acao_recomendada": "Escalar Ads" | "Otimizar Ads" | "Produzir SEO" | "SEO + Ads" | "Monitorar" | "Negativar".

Use o briefing do cliente (quando fornecido) para julgar o que é "marca própria" (nome da empresa/domínio/variações), "concorrente" e o que é relevante para o negócio.

Responda SOMENTE com um array JSON válido, um objeto por termo recebido, na mesma ordem. Sem markdown, sem texto antes/depois.`;

interface ClassificationRow extends Record<string, unknown> {
  account_id: string;
  term: string;
  classificacao_principal: string | null;
  etiquetas: string | null;
  intencao_busca: string | null;
  etapa_funil: string | null;
  temperatura: string | null;
  relevancia: string | null;
  adequacao_publico: string | null;
  localidade: string | null;
  relacionamento_marca: string | null;
  potencial_conversao: string | null;
  origem_dados: string;
  cobertura_atual: string | null;
  acao_recomendada: string | null;
  updated_at: string;
}

export async function runTermClassification(
  env: Env,
  account: { id: string; name: string; profile_notes?: string | null; ai_provider?: string },
  lookbackDays: number,
): Promise<{ status: "ok"; rows: number }> {
  const from = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10);
  const terms = await fetchCandidateTerms(env, account.id, from);
  if (terms.length === 0) return { status: "ok", rows: 0 };

  const now = new Date().toISOString();
  const columns = [
    "account_id",
    "term",
    "classificacao_principal",
    "etiquetas",
    "intencao_busca",
    "etapa_funil",
    "temperatura",
    "relevancia",
    "adequacao_publico",
    "localidade",
    "relacionamento_marca",
    "potencial_conversao",
    "origem_dados",
    "cobertura_atual",
    "acao_recomendada",
    "updated_at",
  ];

  async function runBatch(batch: TermRow[]): Promise<number> {
    const origemByTerm = new Map(batch.map((t) => [t.term, origemDados(t)]));
    const userContent = JSON.stringify({
      conta: account.name,
      briefing_do_cliente: account.profile_notes || null,
      termos: batch.map((t) => ({ termo: t.term, origem_dados: origemByTerm.get(t.term) })),
    });

    const { text } = await callAI(env, account.ai_provider, SYSTEM_PROMPT, userContent, MAX_TOKENS);
    const parsed = extractJsonArray(text);

    const rows: ClassificationRow[] = [];
    for (const item of parsed) {
      const term = String(item.termo ?? "").toLowerCase().trim();
      if (!term || !origemByTerm.has(term)) continue;
      rows.push({
        account_id: account.id,
        term,
        classificacao_principal: item.classificacao_principal ?? null,
        etiquetas: Array.isArray(item.etiquetas) ? item.etiquetas.join(", ") : null,
        intencao_busca: item.intencao_busca ?? null,
        etapa_funil: item.etapa_funil ?? null,
        temperatura: item.temperatura ?? null,
        relevancia: item.relevancia ?? null,
        adequacao_publico: item.adequacao_publico ?? null,
        localidade: item.localidade ?? null,
        relacionamento_marca: item.relacionamento_marca ?? null,
        potencial_conversao: item.potencial_conversao ?? null,
        origem_dados: origemByTerm.get(term)!,
        cobertura_atual: item.cobertura_atual ?? null,
        acao_recomendada: item.acao_recomendada ?? null,
        updated_at: now,
      });
    }

    await bulkInsert(env, "fact_term_classification", columns, rows);
    return rows.length;
  }

  // Roda em "ondas" de até CONCURRENCY lotes simultâneos (não tudo de uma vez
  // nem um atrás do outro): paralelo o bastante pra não estourar o tempo de
  // background do Worker, mas sem passar do limite de conexões simultâneas
  // por invocação — importante agora que não há mais teto de termos por conta.
  const batches = chunk(terms, TERMS_PER_BATCH);
  let totalRows = 0;
  let lastError: unknown = null;
  for (const wave of chunk(batches, CONCURRENCY)) {
    const results = await Promise.allSettled(wave.map(runBatch));
    for (const r of results) {
      if (r.status === "fulfilled") totalRows += r.value;
      else lastError = r.reason;
    }
  }

  if (lastError && totalRows === 0) {
    throw new Error(lastError instanceof Error ? lastError.message : String(lastError));
  }

  return { status: "ok", rows: totalRows };
}
