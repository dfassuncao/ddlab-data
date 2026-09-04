import type { Env } from "../env";
import { runQuery } from "../bq";
import { listAccounts, bulkInsert, bulkUpdate, chunk } from "../db";
import { FACTS, type FactSpec } from "./queries";

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

  for (const account of accounts) {
    for (const spec of FACTS) {
      if (opts.facts?.length && !opts.facts.includes(spec.fact)) continue;
      if (spec.shoppingOnly && !account.has_shopping) continue;

      const lookback = opts.lookbackDays ?? spec.lookbackDays;
      const now = new Date().toISOString();
      try {
        const { rows, from } = await runFact(env, spec, account, lookback);
        await env.DB.prepare(
          `INSERT OR REPLACE INTO meta_refresh
             (account_id, fact, last_run_at, status, rows_written, data_from, data_to, error)
           VALUES (?, ?, ?, 'ok', ?, ?, ?, NULL)`,
        )
          .bind(account.id, spec.fact, now, rows, from || null, new Date().toISOString().slice(0, 10))
          .run();
        results.push({ account: account.id, fact: spec.fact, status: "ok", rows });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await env.DB.prepare(
          `INSERT OR REPLACE INTO meta_refresh
             (account_id, fact, last_run_at, status, rows_written, data_from, data_to, error)
           VALUES (?, ?, ?, 'error', 0, NULL, NULL, ?)`,
        )
          .bind(account.id, spec.fact, now, msg.slice(0, 500))
          .run();
        results.push({ account: account.id, fact: spec.fact, status: "error", rows: 0, error: msg });
      }
    }
  }

  // Retenção: mantém 400 dias em cada fato.
  const cutoff = startDate(400);
  for (const table of Object.keys(NUM_COLS)) {
    await env.DB.prepare(`DELETE FROM ${table} WHERE day < ?`).bind(cutoff).run();
  }

  return results;
}

export { chunk };
