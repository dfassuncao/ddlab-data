import type { Env } from "../env";
import { fetchKeywordVolumes } from "../googleAds";
import { bulkInsert } from "../db";

/**
 * Volume de busca não entra no cron diário (custa quota da API do Google Ads
 * e muda pouco mês a mês) — só roda quando pedido explicitamente via
 * ?facts=keyword_volume em /api/refresh.
 */
export async function runKeywordVolume(
  env: Env,
  account: { id: string; customer_id: string },
  lookbackDays: number,
): Promise<{ status: "ok"; rows: number }> {
  const from = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10);

  const { results } = await env.DB.prepare(
    `SELECT LOWER(TRIM(search_term)) AS term, SUM(cost) AS cost
     FROM fact_searchterm_daily
     WHERE account_id = ? AND day >= ? AND TRIM(search_term) != ''
     GROUP BY term
     ORDER BY cost DESC
     LIMIT 200`,
  )
    .bind(account.id, from)
    .all<{ term: string }>();

  const terms = (results ?? []).map((r) => r.term).filter(Boolean);
  if (terms.length === 0) return { status: "ok", rows: 0 };

  const volumes = await fetchKeywordVolumes(env, account.customer_id, terms);

  const rows = volumes.map((v) => ({
    account_id: account.id,
    keyword: v.keyword.toLowerCase().trim(),
    avg_monthly_searches: v.avg_monthly_searches,
    competition: v.competition,
    competition_index: v.competition_index,
  }));

  await bulkInsert(
    env,
    "fact_keyword_volume",
    ["account_id", "keyword", "avg_monthly_searches", "competition", "competition_index"],
    rows,
  );

  return { status: "ok", rows: rows.length };
}
