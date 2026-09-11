import { Hono } from "hono";
import type { Env } from "../env";
import type { AccessUser } from "../auth";
import { getAccount } from "../db";
import { resolveRange, previousRange, round, withKpis } from "../kpi";
import { buildQueue } from "../rules";

type Vars = { Variables: { user: AccessUser }; Bindings: Env };
export const decision = new Hono<Vars>();

async function q<T = any>(env: Env, sql: string, binds: unknown[]): Promise<T[]> {
  const r = await env.DB.prepare(sql).bind(...binds).all<T>();
  return (r.results ?? []) as T[];
}

async function accountOr404(c: any) {
  const id = c.req.query("account");
  if (!id) return { error: c.json({ error: "missing ?account" }, 400) };
  const account = await getAccount(c.env, id);
  if (!account) return { error: c.json({ error: "account not found" }, 404) };
  return { account };
}

const MSUM = `SUM(impressions) impressions, SUM(clicks) clicks, SUM(cost) cost,
              SUM(conversions) conversions, SUM(conversions_value) conversions_value`;

async function adsTotals(env: Env, id: string, from: string, to: string) {
  const [r] = await q(env, `SELECT ${MSUM} FROM fact_campaign_daily WHERE account_id=? AND day>=? AND day<=?`, [id, from, to]);
  return withKpis(r ?? {});
}

async function ga4Totals(env: Env, id: string, from: string, to: string) {
  const [r] = await q(
    env,
    `SELECT SUM(sessions) sessions, SUM(engaged_sessions) engaged, SUM(active_users) users,
            SUM(key_events) key_events, SUM(revenue) revenue
     FROM fact_ga4_daily WHERE account_id=? AND day>=? AND day<=?`,
    [id, from, to],
  );
  const sessions = Number(r?.sessions ?? 0);
  return {
    sessions,
    engaged_sessions: Number(r?.engaged ?? 0),
    active_users: Number(r?.users ?? 0),
    key_events: round(Number(r?.key_events ?? 0), 1),
    revenue: round(Number(r?.revenue ?? 0)),
    engagement_rate: sessions > 0 ? round((Number(r?.engaged ?? 0) / sessions) * 100, 1) : 0,
    has_data: sessions > 0 || Number(r?.key_events ?? 0) > 0,
  };
}

/** Saúde dos dados: por fonte + alertas + score. */
async function dataHealth(env: Env, account: any) {
  const fresh = await q(env, `SELECT fact, status, data_to, last_run_at, error FROM meta_refresh WHERE account_id=?`, [account.id]);
  const byFact = Object.fromEntries(fresh.map((r: any) => [r.fact, r]));
  const today = new Date().toISOString().slice(0, 10);
  const daysBetween = (d: string | null) =>
    d ? Math.round((Date.parse(today) - Date.parse(d)) / 86_400_000) : 999;

  const adsTo = byFact.campaign?.data_to ?? null;
  const ga4Meta = byFact.ga4;
  const gscMeta = byFact.gsc;

  const sources = [
    {
      key: "ads",
      label: "Google Ads",
      connected: true,
      last_day: adsTo,
      status: byFact.campaign?.status === "error" ? "erro" : daysBetween(adsTo) > 2 ? "atrasado" : "ok",
    },
    {
      key: "ga4",
      label: "Google Analytics 4",
      connected: !!(account.ga4_dataset && ga4Meta && ga4Meta.status !== "skip"),
      last_day: ga4Meta?.status === "ok" ? ga4Meta?.data_to ?? null : null,
      status: !account.ga4_dataset
        ? "off"
        : ga4Meta?.status === "error"
          ? "erro"
          : ga4Meta?.status === "skip"
            ? "off"
            : daysBetween(ga4Meta?.data_to) > 3
              ? "atrasado"
              : "ok",
    },
    {
      key: "gsc",
      label: "Search Console",
      connected: !!(account.gsc_dataset && gscMeta && gscMeta.status !== "skip"),
      last_day: gscMeta?.status === "ok" ? gscMeta?.data_to ?? null : null,
      status: !account.gsc_dataset
        ? "off"
        : gscMeta?.status === "error"
          ? "erro"
          : gscMeta?.status === "skip"
            ? "off"
            // GSC tem defasagem natural de ~2-3 dias mesmo saudável.
            : daysBetween(gscMeta?.data_to) > 4
              ? "atrasado"
              : "ok",
    },
    { key: "crm", label: "CRM", connected: false, last_day: null, status: "off" },
  ];

  const alerts: { titulo: string; detalhe: string; severidade: string }[] = [];
  if (sources[0].status === "atrasado")
    alerts.push({ titulo: "Google Ads sem dados recentes", detalhe: `Último dia: ${adsTo ?? "—"}`, severidade: "alto" });
  if (byFact.campaign?.status === "error")
    alerts.push({ titulo: "Falha na carga do Google Ads", detalhe: String(byFact.campaign?.error ?? "").slice(0, 120), severidade: "urgente" });
  if (!account.ga4_dataset)
    alerts.push({ titulo: "GA4 não conectado", detalhe: "Preencha o dataset do export do GA4 em Configurações", severidade: "revisar" });
  else if (ga4Meta?.status === "error")
    alerts.push({ titulo: "Falha na carga do GA4", detalhe: String(ga4Meta?.error ?? "").slice(0, 140), severidade: "alto" });
  if (!account.gsc_dataset)
    alerts.push({ titulo: "Search Console não conectado", detalhe: "Preencha o dataset do export do GSC em Configurações", severidade: "revisar" });
  else if (gscMeta?.status === "error")
    alerts.push({ titulo: "Falha na carga do Search Console", detalhe: String(gscMeta?.error ?? "").slice(0, 140), severidade: "alto" });

  // Divergência Ads x GA4 — só sobre os dias em que AMBAS as fontes têm dados,
  // e só se a sobreposição for de pelo menos 7 dias (evita falso positivo quando
  // o GA4 acabou de ser conectado e só tem 1-2 dias).
  const range = resolveRange(undefined, undefined);
  const [cmp] = await q<any>(
    env,
    `WITH ads AS (SELECT day, SUM(conversions) c FROM fact_campaign_daily WHERE account_id=? AND day>=? AND day<=? GROUP BY day),
          ga AS  (SELECT day, SUM(key_events) k  FROM fact_ga4_daily       WHERE account_id=? AND day>=? AND day<=? GROUP BY day)
     SELECT COUNT(*) dias, SUM(ads.c) ads_conv, SUM(ga.k) ga_ke
     FROM ads JOIN ga USING (day)`,
    [account.id, range.from, range.to, account.id, range.from, range.to],
  );
  let divergence: number | null = null;
  const overlapDays = Number(cmp?.dias ?? 0);
  if (overlapDays >= 7 && Number(cmp?.ads_conv) > 0 && Number(cmp?.ga_ke) > 0) {
    const a = Number(cmp.ads_conv);
    const g = Number(cmp.ga_ke);
    divergence = round(Math.abs(a - g) / a, 2);
    if (divergence > 0.3)
      alerts.push({
        titulo: "Conversões Ads × key events GA4 divergentes",
        detalhe: `${overlapDays} dias · Ads: ${round(a, 1)} · GA4: ${round(g, 1)} (${Math.round(divergence * 100)}%)`,
        severidade: "revisar",
      });
  }

  // score: 100 - penalidades
  let score = 100;
  for (const s of sources) {
    if (s.key === "ads" && s.status !== "ok") score -= s.status === "erro" ? 40 : 15;
    if (s.key === "ga4") {
      if (s.status === "erro") score -= 25;
      else if (s.status === "atrasado") score -= 10;
      else if (s.status === "off") score -= 8;
    }
    if (s.key === "gsc") {
      if (s.status === "erro") score -= 15;
      else if (s.status === "atrasado") score -= 5;
      else if (s.status === "off") score -= 4;
    }
  }
  if (divergence != null && divergence > 0.3) score -= 8;
  score = Math.max(0, Math.min(100, score));

  return { score, sources, alerts, divergence, range };
}

decision.get("/data-health", async (c) => {
  const r = await accountOr404(c);
  if (r.error) return r.error;
  return c.json({ account: r.account, ...(await dataHealth(c.env, r.account!)) });
});

decision.get("/decision-center", async (c) => {
  const r = await accountOr404(c);
  if (r.error) return r.error;
  const account = r.account!;
  const { from, to } = resolveRange(c.req.query("from"), c.req.query("to"));
  const prev = previousRange(from, to);

  const [adsCur, adsPrev, ga4Cur, ga4Prev, queue, health] = await Promise.all([
    adsTotals(c.env, account.id, from, to),
    adsTotals(c.env, account.id, prev.from, prev.to),
    ga4Totals(c.env, account.id, from, to),
    ga4Totals(c.env, account.id, prev.from, prev.to),
    buildQueue(c.env, account, from, to),
    dataHealth(c.env, account),
  ]);

  const trendRows = await q(
    c.env,
    `SELECT day,
       (SELECT SUM(cost) FROM fact_campaign_daily x WHERE x.account_id=t.account_id AND x.day=t.day) cost,
       (SELECT SUM(conversions) FROM fact_campaign_daily x WHERE x.account_id=t.account_id AND x.day=t.day) conversions,
       (SELECT SUM(sessions) FROM fact_ga4_daily g WHERE g.account_id=t.account_id AND g.day=t.day) sessions,
       (SELECT SUM(key_events) FROM fact_ga4_daily g WHERE g.account_id=t.account_id AND g.day=t.day) key_events,
       (SELECT SUM(revenue) FROM fact_ga4_daily g WHERE g.account_id=t.account_id AND g.day=t.day) revenue
     FROM (
       SELECT DISTINCT account_id, day FROM fact_campaign_daily WHERE account_id=? AND day>=? AND day<=?
       UNION SELECT DISTINCT account_id, day FROM fact_ga4_daily WHERE account_id=? AND day>=? AND day<=?
     ) t ORDER BY day`,
    [account.id, from, to, account.id, from, to],
  );

  // Score integrado (0-100): eficiência de mídia + tendência + engajamento GA4 + saúde dos dados
  const benchmark = account.target_cpa ?? adsPrev.cpa ?? adsCur.cpa ?? 0;
  const eff = benchmark && adsCur.cpa ? clamp(1 - (adsCur.cpa - benchmark) / benchmark, 0, 1) : 0.6;
  const trend =
    adsPrev.conversions > 0 ? clamp(0.5 + (adsCur.conversions - adsPrev.conversions) / adsPrev.conversions, 0, 1) : 0.6;
  const eng = ga4Cur.has_data ? clamp(ga4Cur.engagement_rate / 70, 0, 1) : 0.6;
  const healthN = health.score / 100;
  const score = Math.round((eff * 0.35 + trend * 0.25 + eng * 0.15 + healthN * 0.25) * 100);
  const label =
    score >= 80 ? "Performance saudável, com margem de ganho" : score >= 60 ? "Performance ok, requer ajustes" : "Performance exige atenção";

  return c.json({
    account,
    range: { from, to },
    score,
    score_label: label,
    score_parts: { eficiencia: round(eff, 2), tendencia: round(trend, 2), engajamento: round(eng, 2), saude_dados: round(healthN, 2) },
    queue,
    data_health: { score: health.score, sources: health.sources, alerts: health.alerts },
    pulse: {
      investimento: adsCur.cost,
      investimento_prev: adsPrev.cost,
      cliques: adsCur.clicks,
      conversoes: adsCur.conversions,
      conversoes_prev: adsPrev.conversions,
      cpa: adsCur.cpa,
      sessoes: ga4Cur.sessions,
      sessoes_prev: ga4Prev.sessions,
      key_events: ga4Cur.key_events,
      key_events_prev: ga4Prev.key_events,
      engajamento_pct: ga4Cur.engagement_rate,
      cpl: ga4Cur.key_events > 0 ? round(adsCur.cost / ga4Cur.key_events, 2) : null,
      receita_ga4: ga4Cur.revenue,
      ga4_conectado: ga4Cur.has_data,
      // placeholders até o CRM entrar
      leads_validos: null,
      vendas: null,
      cac_real: null,
      roas_confirmado: null,
    },
    trend: trendRows.map((r: any) => ({
      day: r.day,
      cost: round(Number(r.cost ?? 0)),
      conversions: round(Number(r.conversions ?? 0), 1),
      sessions: Number(r.sessions ?? 0),
      key_events: round(Number(r.key_events ?? 0), 1),
      revenue: round(Number(r.revenue ?? 0)),
    })),
  });
});

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export { dataHealth };
