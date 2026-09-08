import type { Env } from "./env";
import { round } from "./kpi";

export type Severity = "urgente" | "alto" | "revisar";

export interface DecisionItem {
  id: string;
  titulo: string;
  detalhe: string;
  impacto_estimado: string;
  severidade: Severity;
  acao: string;
  fonte: "ads" | "ga4" | "cross";
}

async function q<T = any>(env: Env, sql: string, binds: unknown[]): Promise<T[]> {
  const r = await env.DB.prepare(sql).bind(...binds).all<T>();
  return (r.results ?? []) as T[];
}

const SEV_RANK: Record<Severity, number> = { urgente: 0, alto: 1, revisar: 2 };

/** Motor de regras: gera a fila de decisões priorizada (Ads + GA4). */
export async function buildQueue(
  env: Env,
  account: { id: string; currency: string; target_cpa: number | null },
  from: string,
  to: string,
): Promise<DecisionItem[]> {
  const b = [account.id, from, to];
  const items: DecisionItem[] = [];

  // 1. Campanhas com gasto e zero conversão
  const zeroConv = await q(
    env,
    `SELECT COALESCE(d.name, f.campaign_id) AS name, SUM(f.cost) AS cost, SUM(f.clicks) AS clicks
     FROM fact_campaign_daily f LEFT JOIN dim_campaign d ON d.account_id=f.account_id AND d.campaign_id=f.campaign_id
     WHERE f.account_id=? AND f.day>=? AND f.day<=?
     GROUP BY f.campaign_id HAVING SUM(f.conversions)=0 AND SUM(f.cost)>0
     ORDER BY cost DESC LIMIT 5`,
    b,
  );
  for (const r of zeroConv) {
    const cost = round(Number(r.cost));
    items.push({
      id: `zeroconv:${r.name}`,
      titulo: `Campanha sem conversão: ${r.name}`,
      detalhe: `${fmt(cost, account.currency)} · ${r.clicks} cliques · 0 conversões no período`,
      impacto_estimado: `Economia potencial ${fmt(cost, account.currency)}`,
      severidade: cost > 100 ? "urgente" : "alto",
      acao: `Pausar ou revisar a segmentação de "${r.name}"`,
      fonte: "ads",
    });
  }

  // 2. Termos de busca gastando sem converter (consolidado)
  const [wasteTerms] = await q(
    env,
    `SELECT SUM(cost) AS cost, COUNT(*) AS n FROM (
       SELECT search_term, SUM(cost) AS cost FROM fact_searchterm_daily
       WHERE account_id=? AND day>=? AND day<=?
       GROUP BY search_term HAVING SUM(conversions)=0 AND SUM(cost)>3
     )`,
    b,
  );
  if (wasteTerms && Number(wasteTerms.cost) > 0) {
    const cost = round(Number(wasteTerms.cost));
    items.push({
      id: "wasteterms",
      titulo: `${wasteTerms.n} termos de busca sem conversão`,
      detalhe: `Consumiram ${fmt(cost, account.currency)} sem gerar nenhuma conversão`,
      impacto_estimado: `Economia potencial ${fmt(cost, account.currency)}`,
      severidade: cost > 200 ? "alto" : "revisar",
      acao: "Revisar a lista em Termos de busca e adicionar negativas",
      fonte: "ads",
    });
  }

  // 3. Campanhas com CPA muito acima da meta (ou da mediana)
  const camps = await q(
    env,
    `SELECT COALESCE(d.name, f.campaign_id) AS name, SUM(f.cost) AS cost, SUM(f.conversions) AS conv
     FROM fact_campaign_daily f LEFT JOIN dim_campaign d ON d.account_id=f.account_id AND d.campaign_id=f.campaign_id
     WHERE f.account_id=? AND f.day>=? AND f.day<=?
     GROUP BY f.campaign_id HAVING SUM(f.conversions) >= 1`,
    b,
  );
  const withCpa = camps.map((r: any) => ({ name: r.name, cost: Number(r.cost), conv: Number(r.conv), cpa: Number(r.cost) / Number(r.conv) }));
  const totalConv = withCpa.reduce((s, c) => s + c.conv, 0);
  const totalCost = withCpa.reduce((s, c) => s + c.cost, 0);
  const benchmark = account.target_cpa ?? (totalConv > 0 ? totalCost / totalConv : 0);
  if (benchmark > 0) {
    for (const c of withCpa.filter((c) => c.cpa > benchmark * 1.6 && c.cost > 50).sort((a, b) => b.cost - a.cost).slice(0, 3)) {
      items.push({
        id: `highcpa:${c.name}`,
        titulo: `CPA alto: ${c.name}`,
        detalhe: `CPA ${fmt(round(c.cpa), account.currency)} vs referência ${fmt(round(benchmark), account.currency)}`,
        impacto_estimado: `${round((c.cpa - benchmark) * c.conv)} ${account.currency} acima da referência`,
        severidade: "alto",
        acao: `Revisar lances/palavras-chave de "${c.name}"`,
        fonte: "ads",
      });
    }
  }

  // 4. GA4: canal com tráfego e zero key events
  const ga4 = await q(
    env,
    `SELECT channel, SUM(sessions) AS sessions, SUM(engaged_sessions) AS engaged, SUM(key_events) AS ke
     FROM fact_ga4_daily WHERE account_id=? AND day>=? AND day<=? GROUP BY channel`,
    b,
  );
  for (const r of ga4) {
    const sessions = Number(r.sessions);
    const ke = Number(r.ke);
    const engRate = sessions > 0 ? Number(r.engaged) / sessions : 0;
    if (sessions > 150 && ke === 0) {
      items.push({
        id: `ga4noconv:${r.channel}`,
        titulo: `${r.channel}: tráfego sem conversão (GA4)`,
        detalhe: `${sessions} sessões, 0 key events no período`,
        impacto_estimado: `${sessions} sessões sem retorno`,
        severidade: "revisar",
        acao: `Checar rastreamento de conversão e a experiência de ${r.channel}`,
        fonte: "ga4",
      });
    } else if (sessions > 200 && engRate < 0.45) {
      items.push({
        id: `ga4eng:${r.channel}`,
        titulo: `${r.channel}: engajamento baixo (GA4)`,
        detalhe: `${Math.round(engRate * 100)}% de sessões engajadas em ${sessions} sessões`,
        impacto_estimado: "Qualidade de tráfego / página",
        severidade: "revisar",
        acao: `Revisar correspondência anúncio→página e velocidade para ${r.channel}`,
        fonte: "ga4",
      });
    }
  }

  return items.sort((a, b) => SEV_RANK[a.severidade] - SEV_RANK[b.severidade]).slice(0, 8);
}

function fmt(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n}`;
  }
}
