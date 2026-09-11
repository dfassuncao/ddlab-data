import type { Env } from "../env";
import { runQuery } from "../bq";
import { bulkInsert } from "../db";

const safeIdent = (s: string) => /^[a-zA-Z0-9_]+$/.test(s);

export interface GscAccount {
  id: string;
  gsc_dataset: string | null;
}

/**
 * Bulk export nativo do Search Console para BigQuery: um dataset por propriedade
 * (ex.: searchconsole_doin), com as tabelas fixas searchdata_site_impression
 * (nível consulta, sum_top_position) e searchdata_url_impression (nível página,
 * sum_position) — ambas 0-indexadas, por isso o +1 para virar posição "humana".
 * Schema validado direto no BigQuery em 2026-09-11.
 */
function queriesSql(env: Env, dataset: string): string {
  return `
    SELECT
      data_date AS day,
      query,
      SUM(impressions) AS impressions,
      SUM(clicks) AS clicks,
      ROUND(SAFE_DIVIDE(SUM(sum_top_position), SUM(impressions)) + 1, 2) AS position
    FROM \`${env.GCP_PROJECT_ID}.${dataset}.searchdata_site_impression\`
    WHERE data_date >= @start_date
    GROUP BY day, query
    HAVING impressions > 0
    ORDER BY clicks DESC
    LIMIT 20000`;
}

function pagesSql(env: Env, dataset: string): string {
  return `
    SELECT
      data_date AS day,
      url AS page,
      SUM(impressions) AS impressions,
      SUM(clicks) AS clicks,
      ROUND(SAFE_DIVIDE(SUM(sum_position), SUM(impressions)) + 1, 2) AS position
    FROM \`${env.GCP_PROJECT_ID}.${dataset}.searchdata_url_impression\`
    WHERE data_date >= @start_date
    GROUP BY day, page
    HAVING impressions > 0
    ORDER BY clicks DESC
    LIMIT 20000`;
}

/** Retorna { status, rows, from } e grava fact_gsc_query_daily + fact_gsc_page_daily. */
export async function runGsc(
  env: Env,
  account: GscAccount,
  lookbackDays: number,
): Promise<{ status: "ok" | "skip"; rows: number; from: string }> {
  const dataset = (account.gsc_dataset ?? "").trim();
  if (!dataset) return { status: "skip", rows: 0, from: "" };
  if (!safeIdent(dataset)) throw new Error(`gsc_dataset inválido: "${dataset}"`);

  const from = new Date(Date.now() - lookbackDays * 86_400_000);
  const fromIso = from.toISOString().slice(0, 10);
  const params = [{ name: "start_date", type: "DATE" as const, value: fromIso }];

  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const rawQueries = await runQuery<Record<string, unknown>>(env, queriesSql(env, dataset), params);
  const queryRows = rawQueries.map((r) => ({
    account_id: account.id,
    day: String(r.day),
    query: String(r.query ?? ""),
    clicks: num(r.clicks),
    impressions: num(r.impressions),
    position: r.position != null ? num(r.position) : null,
  }));

  const rawPages = await runQuery<Record<string, unknown>>(env, pagesSql(env, dataset), params);
  const pageRows = rawPages.map((r) => ({
    account_id: account.id,
    day: String(r.day),
    page: String(r.page ?? ""),
    clicks: num(r.clicks),
    impressions: num(r.impressions),
    position: r.position != null ? num(r.position) : null,
  }));

  await env.DB.prepare(`DELETE FROM fact_gsc_query_daily WHERE account_id = ? AND day >= ?`)
    .bind(account.id, fromIso)
    .run();
  await env.DB.prepare(`DELETE FROM fact_gsc_page_daily WHERE account_id = ? AND day >= ?`)
    .bind(account.id, fromIso)
    .run();

  await bulkInsert(env, "fact_gsc_query_daily", ["account_id", "day", "query", "clicks", "impressions", "position"], queryRows);
  await bulkInsert(env, "fact_gsc_page_daily", ["account_id", "day", "page", "clicks", "impressions", "position"], pageRows);

  return { status: "ok", rows: queryRows.length + pageRows.length, from: fromIso };
}
