import { Hono } from "hono";
import type { Env } from "../env";
import type { AccessUser } from "../auth";
import { getAccount } from "../db";
import { callClaude } from "../claude";
import { resolveRange, previousRange, round } from "../kpi";

type Vars = { Variables: { user: AccessUser }; Bindings: Env };
export const analysis = new Hono<Vars>();

async function q<T = Record<string, unknown>>(env: Env, sql: string, binds: unknown[]): Promise<T[]> {
  const r = await env.DB.prepare(sql).bind(...binds).all<T>();
  return r.results ?? [];
}

async function accountOr404(c: any) {
  const id = c.req.query("account");
  if (!id) return { error: c.json({ error: "missing ?account" }, 400) };
  const account = await getAccount(c.env, id);
  if (!account) return { error: c.json({ error: "account not found" }, 404) };
  return { account };
}

const M = (n: number, d = 2) => round(n, d);

/** Monta o contexto agregado (compacto, sem PII) que vai para o prompt. */
async function buildContext(env: Env, account: any, from: string, to: string) {
  const binds = [account.id, from, to];
  const prev = previousRange(from, to);

  const totalsOf = async (a: string, b: string) => {
    const [r] = await q<any>(
      env,
      `SELECT SUM(impressions) impressions, SUM(clicks) clicks, SUM(cost) cost,
              SUM(conversions) conversions, SUM(conversions_value) conversions_value
       FROM fact_campaign_daily WHERE account_id=? AND day>=? AND day<=?`,
      [account.id, a, b],
    );
    const cost = Number(r?.cost ?? 0);
    const conversions = Number(r?.conversions ?? 0);
    const clicks = Number(r?.clicks ?? 0);
    const impressions = Number(r?.impressions ?? 0);
    const value = Number(r?.conversions_value ?? 0);
    return {
      custo: M(cost),
      cliques: clicks,
      impressoes: impressions,
      conversoes: M(conversions, 1),
      valor_gerado: M(value),
      ctr_pct: impressions > 0 ? M((clicks / impressions) * 100) : 0,
      cpa: conversions > 0 ? M(cost / conversions) : null,
      roas: cost > 0 ? M(value / cost) : null,
    };
  };

  const weekly = await q<any>(
    env,
    `SELECT strftime('%Y-%W', day) AS semana, SUM(cost) custo, SUM(conversions) conversoes
     FROM fact_campaign_daily WHERE account_id=? AND day>=? AND day<=? GROUP BY semana ORDER BY semana`,
    binds,
  );

  const campaigns = await q<any>(
    env,
    `SELECT COALESCE(d.name, f.campaign_id) AS nome, MAX(d.status) status, MAX(d.channel_type) canal,
       SUM(f.cost) custo, SUM(f.clicks) cliques, SUM(f.conversions) conversoes,
       SUM(f.conversions_value) valor_gerado
     FROM fact_campaign_daily f LEFT JOIN dim_campaign d ON d.account_id=f.account_id AND d.campaign_id=f.campaign_id
     WHERE f.account_id=? AND f.day>=? AND f.day<=?
     GROUP BY f.campaign_id ORDER BY custo DESC LIMIT 15`,
    binds,
  );

  const geoCross = await q<any>(
    env,
    `WITH ranked AS (
       SELECT f.campaign_id, COALESCE(d.name, f.campaign_id) AS campanha, f.location_id AS local,
              SUM(f.cost) custo, SUM(f.conversions) conversoes,
              ROW_NUMBER() OVER (PARTITION BY f.campaign_id ORDER BY SUM(f.cost) DESC) rn
       FROM fact_geo_daily f LEFT JOIN dim_campaign d ON d.account_id=f.account_id AND d.campaign_id=f.campaign_id
       WHERE f.account_id=? AND f.day>=? AND f.day<=?
       GROUP BY f.campaign_id, f.location_id
     )
     SELECT campanha, local, custo, conversoes FROM ranked WHERE rn <= 3 ORDER BY campanha, custo DESC`,
    binds,
  );

  const deviceCross = await q<any>(
    env,
    `SELECT COALESCE(d.name, f.campaign_id) AS campanha, f.device dispositivo,
       SUM(f.cost) custo, SUM(f.conversions) conversoes
     FROM fact_hour_daily f LEFT JOIN dim_campaign d ON d.account_id=f.account_id AND d.campaign_id=f.campaign_id
     WHERE f.account_id=? AND f.day>=? AND f.day<=? AND f.hour = -1
     GROUP BY f.campaign_id, f.device
     HAVING SUM(f.cost) > 0
     ORDER BY campanha, custo DESC`,
    binds,
  );

  const adGroupCross = await q<any>(
    env,
    `WITH ranked AS (
       SELECT f.campaign_id, COALESCE(d.name, f.campaign_id) AS campanha, f.ad_group_id AS grupo_anuncio,
              SUM(f.cost) custo, SUM(f.conversions) conversoes,
              ROW_NUMBER() OVER (PARTITION BY f.campaign_id ORDER BY SUM(f.cost) DESC) rn
       FROM fact_ad_daily f LEFT JOIN dim_campaign d ON d.account_id=f.account_id AND d.campaign_id=f.campaign_id
       WHERE f.account_id=? AND f.day>=? AND f.day<=?
       GROUP BY f.campaign_id, f.ad_group_id
     )
     SELECT campanha, grupo_anuncio, custo, conversoes FROM ranked WHERE rn <= 3 ORDER BY campanha, custo DESC`,
    binds,
  );

  const hourly = await q<any>(
    env,
    `SELECT hour, day_of_week, SUM(cost) custo, SUM(conversions) conversoes
     FROM fact_hour_daily WHERE account_id=? AND day>=? AND day<=? AND hour >= 0
     GROUP BY hour, day_of_week`,
    binds,
  );
  const withCpa = hourly
    .map((h: any) => ({ ...h, cpa: h.conversoes > 0 ? h.custo / h.conversoes : null }))
    .filter((h: any) => h.custo > 0);
  const melhores_horarios = [...withCpa]
    .filter((h) => h.cpa != null)
    .sort((a, b) => a.cpa - b.cpa)
    .slice(0, 5)
    .map((h) => ({ hora: h.hour, dia: h.day_of_week, custo: M(h.custo), conversoes: M(h.conversoes, 1), cpa: M(h.cpa) }));
  const piores_horarios_sem_conversao = withCpa
    .filter((h) => h.conversoes === 0)
    .sort((a: any, b: any) => b.custo - a.custo)
    .slice(0, 5)
    .map((h: any) => ({ hora: h.hour, dia: h.day_of_week, custo: M(h.custo) }));

  const mk = (scope: string) => (r: any) => ({ tipo: scope, item: r.label ?? "(sem rótulo)", custo: M(r.cost) });
  const wasteCampaigns = await q<any>(
    env,
    `SELECT COALESCE(d.name, f.campaign_id) AS label, SUM(f.cost) AS cost
     FROM fact_campaign_daily f LEFT JOIN dim_campaign d ON d.account_id=f.account_id AND d.campaign_id=f.campaign_id
     WHERE f.account_id=? AND f.day>=? AND f.day<=? GROUP BY f.campaign_id
     HAVING SUM(f.conversions)=0 AND SUM(f.cost)>0 ORDER BY cost DESC LIMIT 10`,
    binds,
  );
  const wasteTerms = await q<any>(
    env,
    `SELECT search_term AS label, SUM(cost) AS cost FROM fact_searchterm_daily
     WHERE account_id=? AND day>=? AND day<=? GROUP BY search_term
     HAVING SUM(conversions)=0 AND SUM(cost)>0 ORDER BY cost DESC LIMIT 10`,
    binds,
  );
  const wasteGeo = await q<any>(
    env,
    `SELECT location_id AS label, SUM(cost) AS cost FROM fact_geo_daily
     WHERE account_id=? AND day>=? AND day<=? GROUP BY location_id
     HAVING SUM(conversions)=0 AND SUM(cost)>0 ORDER BY cost DESC LIMIT 10`,
    binds,
  );
  const desperdicio = [
    ...wasteCampaigns.map(mk("campanha")),
    ...wasteTerms.map(mk("termo_busca")),
    ...wasteGeo.map(mk("local")),
  ].sort((a, b) => b.custo - a.custo);

  const convertingTerms = await q<any>(
    env,
    `SELECT search_term AS termo, SUM(cost) custo, SUM(conversions) conversoes
     FROM fact_searchterm_daily WHERE account_id=? AND day>=? AND day<=?
     GROUP BY search_term HAVING SUM(conversions) >= 1 ORDER BY conversoes DESC LIMIT 10`,
    binds,
  );

  const idealRaw = await q<any>(
    env,
    `SELECT COALESCE(d.name, f.campaign_id) AS nome, SUM(f.cost) custo,
       SUM(f.conversions) conversoes, SUM(f.conversions_value) valor_gerado
     FROM fact_campaign_daily f LEFT JOIN dim_campaign d ON d.account_id=f.account_id AND d.campaign_id=f.campaign_id
     WHERE f.account_id=? AND f.day>=? AND f.day<=? GROUP BY f.campaign_id HAVING SUM(f.conversions) > 0`,
    binds,
  );
  const maxConv = Math.max(1, ...idealRaw.map((r: any) => Number(r.conversoes)));
  const maxVal = Math.max(1, ...idealRaw.map((r: any) => Number(r.valor_gerado)));
  const segmentosIdeais = idealRaw
    .map((r: any) => {
      const conv = Number(r.conversoes);
      const val = Number(r.valor_gerado);
      const ticket = conv > 0 ? val / conv : 0;
      return {
        nome: r.nome,
        custo: M(r.custo),
        conversoes: M(conv, 1),
        valor_gerado: M(val),
        ticket_medio: M(ticket),
        abaixo_do_ticket_ideal: account.ideal_ticket_min != null ? ticket < account.ideal_ticket_min : null,
        score: M(0.5 * (conv / maxConv) + 0.5 * (val / maxVal), 3),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return {
    conta: {
      nome: account.name,
      moeda: account.currency,
      briefing_do_cliente: account.profile_notes || null,
      ticket_minimo_relevante: account.ideal_ticket_min,
      meta_leads_mes: account.lead_goal_monthly,
      target_cpa: account.target_cpa,
      verba_mensal: account.monthly_budget,
    },
    periodo: { de: from, ate: to },
    totais_periodo_atual: await totalsOf(from, to),
    totais_periodo_anterior: await totalsOf(prev.from, prev.to),
    tendencia_semanal: weekly.map((w: any) => ({ semana: w.semana, custo: M(w.custo), conversoes: M(w.conversoes, 1) })),
    campanhas: campaigns.map((r: any) => ({
      nome: r.nome,
      status: r.status,
      canal: r.canal,
      custo: M(r.custo),
      cliques: r.cliques,
      conversoes: M(r.conversoes, 1),
      valor_gerado: M(r.valor_gerado),
      cpa: r.conversoes > 0 ? M(r.custo / r.conversoes) : null,
    })),
    cruzamento_campanha_x_geografia_top3: geoCross.map((r: any) => ({
      campanha: r.campanha,
      local_id: r.local,
      custo: M(r.custo),
      conversoes: M(r.conversoes, 1),
    })),
    cruzamento_campanha_x_dispositivo: deviceCross.map((r: any) => ({
      campanha: r.campanha,
      dispositivo: r.dispositivo,
      custo: M(r.custo),
      conversoes: M(r.conversoes, 1),
    })),
    cruzamento_campanha_x_grupo_anuncio_top3: adGroupCross.map((r: any) => ({
      campanha: r.campanha,
      grupo_anuncio_id: r.grupo_anuncio,
      custo: M(r.custo),
      conversoes: M(r.conversoes, 1),
    })),
    horario_melhores_cpa: melhores_horarios,
    horario_gasto_sem_conversao: piores_horarios_sem_conversao,
    desperdicio_top10: desperdicio.slice(0, 10),
    termos_que_convertem_avaliar_como_keyword: convertingTerms.map((r: any) => ({
      termo: r.termo,
      custo: M(r.custo),
      conversoes: M(r.conversoes, 1),
    })),
    segmentos_ideais_volume_e_valor: segmentosIdeais,
  };
}

const SYSTEM_PROMPT = `Você é um analista de dados sênior especializado em Google Ads, trabalhando para uma agência de marketing (DDLab) que atende múltiplos clientes.

Você recebe um JSON com dados agregados de UMA conta de Google Ads: totais, tendência, campanhas, cruzamentos (campanha × geografia, campanha × dispositivo, campanha × grupo de anúncio), horários, desperdício de verba e um ranking de "segmentos ideais" que já combina volume de conversão e valor gerado.

O campo "conta.briefing_do_cliente" (quando presente) é a definição do negócio do cliente feita pela agência: o que a empresa faz, posicionamento, região, o que conta como lead bom e quais contatos são indesejados. Use isso como LENTE de julgamento, mas NÃO repita nem resuma o briefing na resposta — o leitor já o conhece. Aplicação prática: um número que parece bom isoladamente (muitas conversões, CTR alto) pode não interessar se a campanha está atraindo o público ou os termos que o briefing marca como indesejados, ou se o ticket médio está abaixo de "ticket_minimo_relevante".

Responda em português do Brasil, em Markdown, com estas seções nesta ordem:

## Resumo
2-3 frases sobre a saúde geral da conta no período, comparando com o período anterior e com a meta de leads/mês.

## O que está funcionando
Cite campanhas/cruzamentos específicos com números (ex.: "campanha X na cidade Y: R$ Z de custo, N conversões, ticket médio de R$ W").

## O que está ruim / desperdício
Onde há gasto sem conversão (campanha, termo de busca, local, horário), com valores. Destaque termos/públicos que contrariam o briefing.

## Cruzamentos que chamam atenção
Pelo menos um insight que só aparece ao cruzar duas dimensões (uma campanha boa no geral mas ruim num dispositivo/região específica; um grupo de anúncio puxando o resultado para baixo; etc.).

## Checklist de ações
A parte mais importante. Uma lista de tarefas objetivas, cada uma no formato de checkbox markdown:
- [ ] Ação concreta (o quê + onde) — justificativa curta com o número que a sustenta

Ordene da mais urgente/maior impacto para a menor. Cada item deve ser executável por quem gerencia a conta sem precisar de mais análise. Inclua quantos itens forem necessários (normalmente entre 4 e 10). Quando fizer sentido, agrupe negativas de palavras-chave num único item listando os termos.

Regras: não invente números que não estão no JSON. Se um dado não existir ou vier vazio, diga isso em vez de inventar. Seja direto — o leitor gerencia contas de Google Ads, não precisa de explicação de conceitos básicos.`;

analysis.get("/analysis", async (c) => {
  const { account, error } = await accountOr404(c);
  if (error) return error;
  const rows = await q(
    c.env,
    `SELECT * FROM ai_analysis WHERE account_id = ? ORDER BY generated_at DESC LIMIT 1`,
    [account!.id],
  );
  return c.json({ account, latest: rows[0] ?? null });
});

analysis.post("/analysis", async (c) => {
  const { account, error } = await accountOr404(c);
  if (error) return error;
  const { from, to } = resolveRange(c.req.query("from"), c.req.query("to"));
  const user = c.get("user");

  let context: Awaited<ReturnType<typeof buildContext>>;
  try {
    context = await buildContext(c.env, account, from, to);
  } catch (e) {
    return c.json({ error: `Falha ao montar contexto: ${(e as Error).message}` }, 500);
  }

  try {
    const result = await callClaude(
      c.env,
      SYSTEM_PROMPT,
      `Dados agregados da conta "${account!.name}" (${from} a ${to}):\n\n${JSON.stringify(context)}`,
    );
    await c.env.DB.prepare(
      `INSERT INTO ai_analysis (account_id, range_from, range_to, model, content, input_tokens, output_tokens, generated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(account!.id, from, to, result.model, result.text, result.inputTokens, result.outputTokens, user.email)
      .run();

    return c.json({
      account,
      range: { from, to },
      content: result.text,
      model: result.model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
    });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});
