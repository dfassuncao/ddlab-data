import type { Env } from "../env";
import { runQuery } from "../bq";
import { listAccounts, bulkInsert, bulkUpdate, chunk } from "../db";
import { FACTS, type FactSpec } from "./queries";
import { runGa4 } from "./ga4";
import { runGsc } from "./gsc";
import { runKeywordVolume } from "./keywordVolume";
import { runTermClassification } from "./termClassification";

const NUM_COLS: Record<string, string[]> = {
  fact_campaign_daily: [
    "impressions",
    "clicks",
    "cost",
    "conversions",
    "conversions_value",
    "search_is",
    "budget_lost_is",
    "rank_lost_is",
  ],
  fact_keyword_daily: ["impressions", "clicks", "cost", "conversions", "conversions_value", "quality_score"],
  fact_searchterm_daily: ["impressions", "clicks", "cost", "conversions", "conversions_value"],
  fact_geo_daily: ["impressions", "clicks", "cost", "conversions", "conversions_value"],
  fact_hour_daily: ["impressions", "clicks", "cost", "conversions", "conversions_value", "hour"],
  fact_ad_daily: ["impressions", "clicks", "cost", "conversions", "conversions_value"],
  fact_audience_daily: ["impressions", "clicks", "cost", "conversions", "conversions_value"],
  fact_product_daily: ["impressions", "clicks", "cost", "conversions", "conversions_value"],
  fact_landingpage_daily: [
    "impressions",
    "clicks",
    "cost",
    "conversions",
    "conversions_value",
    "mobile_speed",
  ],
};

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function startDate(lookbackDays: number): string {
  const d = new Date(Date.now() - lookbackDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export interface EtlOptions {
  accountIds?: string[];
  /** força uma janela específica (ex.: 400 para backfill, 14 para o cron) */
  lookbackDays?: number;
  facts?: string[];
}

async function runFact(
  env: Env,
  spec: FactSpec,
  account: { id: string; customer_id: string },
  lookbackDays: number,
): Promise<{ rows: number; from: string }> {
  const from = spec.lookbackDays === 0 ? "" : startDate(lookbackDays);
  const raw = await runQuery(env, spec.sql(env), [
    { name: "customer_id", type: "INT64", value: account.customer_id },
    { name: "start_date", type: "DATE", value: from || "2000-01-01" },
  ]);

  // Normaliza linhas: injeta account_id, converte números.
  const cols = new Set<string>(["account_id"]);
  const rows = raw.map((r) => {
    const out: Record<string, unknown> = { account_id: account.id };
    for (const [k, v] of Object.entries(r)) {
      cols.add(k);
      out[k] = NUM_COLS[spec.table]?.includes(k) ? toNum(v) : v;
    }
    return out;
  });
  const columns = [...cols];

  if (spec.mode === "update") {
    const setCols = columns.filter((c) => !spec.pk.includes(c));
    await bulkUpdate(env, spec.table, spec.pk, [...spec.pk, ...setCols], rows);
    return { rows: rows.length, from };
  }

  if (spec.mode === "upsert") {
    await bulkInsert(env, spec.table, columns, rows);
    return { rows: rows.length, from };
  }

  // replace: apaga janela e reinsere
  const del = [`account_id = ?`];
  const binds: unknown[] = [account.id];
  if (from) {
    del.push(`day >= ?`);
    binds.push(from);
  }
  if (spec.deleteFilter) del.push(spec.deleteFilter);
  await env.DB.prepare(`DELETE FROM ${spec.table} WHERE ${del.join(" AND ")}`)
    .bind(...binds)
    .run();
  await bulkInsert(env, spec.table, columns, rows);
  return { rows: rows.length, from };
}

export async function runEtl(env: Env, opts: EtlOptions = {}) {
  const all = await listAccounts(env, true);
  const accounts = opts.accountIds?.length
    ? all.filter((a) => opts.accountIds!.includes(a.id))
    : all;

  const results: Array<{ account: string; fact: string; status: string; rows: number; error?: string }> =
    [];

  const writeMeta = async (
    accountId: string,
    fact: string,
    status: string,
    rows: number,
    from: string,
    error: string | null,
  ) => {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO meta_refresh
         (account_id, fact, last_run_at, status, rows_written, data_from, data_to, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        accountId,
        fact,
        new Date().toISOString(),
        status,
        rows,
        from || null,
        error ? null : new Date().toISOString().slice(0, 10),
        error,
      )
      .run();
  };

  for (const account of accounts) {
    for (const spec of FACTS) {
      if (opts.facts?.length && !opts.facts.includes(spec.fact)) continue;
      if (spec.shoppingOnly && !account.has_shopping) continue;

      const lookback = opts.lookbackDays ?? spec.lookbackDays;
      try {
        const { rows, from } = await runFact(env, spec, account, lookback);
        await writeMeta(account.id, spec.fact, "ok", rows, from, null);
        results.push({ account: account.id, fact: spec.fact, status: "ok", rows });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await writeMeta(account.id, spec.fact, "error", 0, "", msg.slice(0, 500));
        results.push({ account: account.id, fact: spec.fact, status: "error", rows: 0, error: msg });
      }
    }

    // GA4 (nível canal) — só se a conta tem ga4_dataset configurado.
    if (!opts.facts?.length || opts.facts.includes("ga4")) {
      const lookback = opts.lookbackDays ?? 400;
      try {
        const { status, rows, from } = await runGa4(env, account, lookback);
        await writeMeta(account.id, "ga4", status, rows, from, null);
        results.push({ account: account.id, fact: "ga4", status, rows });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await writeMeta(account.id, "ga4", "error", 0, "", msg.slice(0, 500));
        results.push({ account: account.id, fact: "ga4", status: "error", rows: 0, error: msg });
      }
    }

    // Search Console (queries + páginas) — só se a conta tem gsc_dataset configurado.
    if (!opts.facts?.length || opts.facts.includes("gsc")) {
      const lookback = opts.lookbackDays ?? 400;
      try {
        const { status, rows, from } = await runGsc(env, account, lookback);
        await writeMeta(account.id, "gsc", status, rows, from, null);
        results.push({ account: account.id, fact: "gsc", status, rows });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await writeMeta(account.id, "gsc", "error", 0, "", msg.slice(0, 500));
        results.push({ account: account.id, fact: "gsc", status: "error", rows: 0, error: msg });
      }
    }

    // Volume de busca (Keyword Planner) — NUNCA roda no cron (opts.facts vazio),
    // só quando pedido explicitamente: custa quota da API do Google Ads.
    if (opts.facts?.includes("keyword_volume")) {
      try {
        const { status, rows } = await runKeywordVolume(env, account, opts.lookbackDays ?? 90);
        await writeMeta(account.id, "keyword_volume", status, rows, "", null);
        results.push({ account: account.id, fact: "keyword_volume", status, rows });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await writeMeta(account.id, "keyword_volume", "error", 0, "", msg.slice(0, 500));
        results.push({ account: account.id, fact: "keyword_volume", status: "error", rows: 0, error: msg });
      }
    }

    // Classificação por IA dos termos (Ads/GSC) — mesma exceção do keyword_volume:
    // NUNCA roda no cron, só quando pedido explicitamente (custa API da Anthropic).
    if (opts.facts?.includes("term_classification")) {
      try {
        const { status, rows } = await runTermClassification(env, account, opts.lookbackDays ?? 90);
        await writeMeta(account.id, "term_classification", status, rows, "", null);
        results.push({ account: account.id, fact: "term_classification", status, rows });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await writeMeta(account.id, "term_classification", "error", 0, "", msg.slice(0, 500));
        results.push({ account: account.id, fact: "term_classification", status: "error", rows: 0, error: msg });
      }
    }
  }

  // Retenção: mantém 400 dias em cada fato.
  const cutoff = startDate(400);
  for (const table of [...Object.keys(NUM_COLS), "fact_ga4_daily", "fact_gsc_query_daily", "fact_gsc_page_daily"]) {
    await env.DB.prepare(`DELETE FROM ${table} WHERE day < ?`).bind(cutoff).run();
  }

  return results;
}

export { chunk };
