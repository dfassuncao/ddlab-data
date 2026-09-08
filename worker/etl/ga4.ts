import type { Env } from "../env";
import { runQuery } from "../bq";
import { bulkInsert } from "../db";

const DEFAULT_KEY_EVENTS = [
  "generate_lead",
  "purchase",
  "contact",
  "form_submit",
  "submit_lead_form",
  "click_whatsapp",
  "whatsapp_click",
  "phone_call",
];

const safeIdent = (s: string) => /^[a-zA-Z0-9_]+$/.test(s);
const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

/**
 * Query agregada do BigQuery export do GA4: uma linha por (dia, canal).
 * Colunas escolhidas para máxima compatibilidade entre versões do export.
 * Se o schema da propriedade divergir, o erro vira alerta em Saúde dos dados
 * (o ETL não quebra) — mesmo padrão das queries do Google Ads.
 */
function ga4Sql(env: Env, dataset: string, keyEvents: string[], startYmd: string, endYmd: string): string {
  const evList = keyEvents.filter(safeIdent).map((e) => `'${e}'`).join(", ") || "'__none__'";
  const from = `\`${env.GCP_PROJECT_ID}.${dataset}.events_*\``;

  return `
    WITH s AS (
      SELECT
        event_date,
        user_pseudo_id,
        (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
        MAX((SELECT COALESCE(value.string_value, CAST(value.int_value AS STRING))
             FROM UNNEST(event_params) WHERE key = 'session_engaged')) AS engaged,
        LOWER(MAX(COALESCE(collected_traffic_source.manual_source, traffic_source.source))) AS src,
        LOWER(MAX(COALESCE(collected_traffic_source.manual_medium, traffic_source.medium))) AS med,
        COUNTIF(event_name IN (${evList})) AS key_events,
        SUM(CASE WHEN event_name = 'purchase'
                 THEN COALESCE(ecommerce.purchase_revenue,
                               (SELECT value.double_value FROM UNNEST(event_params) WHERE key = 'value'))
            END) AS revenue
      FROM ${from}
      WHERE _TABLE_SUFFIX BETWEEN '${startYmd}' AND '${endYmd}'
        AND (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') IS NOT NULL
      GROUP BY event_date, user_pseudo_id, session_id
    )
    SELECT
      PARSE_DATE('%Y%m%d', event_date) AS day,
      CASE
        WHEN med IN ('cpc','ppc','paid','paidsearch','cpm','display','banner','paid_social','retargeting') THEN 'Paga'
        WHEN med = 'organic' THEN 'Orgânica'
        WHEN (src = '(direct)' OR src IS NULL) AND (med IN ('(none)','(not set)') OR med IS NULL) THEN 'Direto'
        WHEN med IN ('social','organic_social','social-network','social-media','sm') THEN 'Social'
        WHEN src IN ('facebook','instagram','linkedin','l.instagram.com','lm.facebook.com','m.facebook.com','t.co','twitter','x.com','youtube','tiktok') THEN 'Social'
        WHEN med = 'referral' THEN 'Referral'
        WHEN med IN ('email','e-mail','newsletter') THEN 'Email'
        ELSE 'Outro'
      END AS channel,
      COUNT(*) AS sessions,
      COUNTIF(engaged = '1') AS engaged_sessions,
      COUNT(DISTINCT user_pseudo_id) AS active_users,
      SUM(key_events) AS key_events,
      SUM(IFNULL(revenue, 0)) AS revenue
    FROM s
    GROUP BY day, channel`;
}

export interface Ga4Account {
  id: string;
  ga4_dataset: string | null;
  ga4_key_events: string | null;
}

/** Retorna { status, rows, from } e grava fact_ga4_daily. status 'skip' se não configurado. */
export async function runGa4(
  env: Env,
  account: Ga4Account,
  lookbackDays: number,
): Promise<{ status: "ok" | "skip"; rows: number; from: string }> {
  const dataset = (account.ga4_dataset ?? "").trim();
  if (!dataset) return { status: "skip", rows: 0, from: "" };
  if (!/^[a-zA-Z0-9_]+$/.test(dataset)) {
    throw new Error(`ga4_dataset inválido: "${dataset}"`);
  }

  const keyEvents = (account.ga4_key_events ?? "")
    .split(/[,\n;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const list = keyEvents.length ? keyEvents : DEFAULT_KEY_EVENTS;

  const start = new Date(Date.now() - lookbackDays * 86_400_000);
  const startYmd = yyyymmdd(start);
  const endYmd = yyyymmdd(new Date());
  const fromIso = start.toISOString().slice(0, 10);

  const raw = await runQuery<Record<string, unknown>>(
    env,
    ga4Sql(env, dataset, list, startYmd, endYmd),
  );

  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const rows = raw.map((r) => ({
    account_id: account.id,
    day: String(r.day),
    channel: String(r.channel ?? "Outro"),
    sessions: num(r.sessions),
    engaged_sessions: num(r.engaged_sessions),
    active_users: num(r.active_users),
    key_events: num(r.key_events),
    revenue: num(r.revenue),
  }));

  await env.DB.prepare(`DELETE FROM fact_ga4_daily WHERE account_id = ? AND day >= ?`)
    .bind(account.id, fromIso)
    .run();
  await bulkInsert(
    env,
    "fact_ga4_daily",
    ["account_id", "day", "channel", "sessions", "engaged_sessions", "active_users", "key_events", "revenue"],
    rows,
  );

  return { status: "ok", rows: rows.length, from: fromIso };
}
