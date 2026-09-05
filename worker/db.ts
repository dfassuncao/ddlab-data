import type { Env } from "./env";
import type { Account } from "../shared/types";

export async function listAccounts(env: Env, onlyActive = true): Promise<Account[]> {
  const rows = await env.DB.prepare(
    `SELECT id, customer_id, name, currency, timezone, target_cpa, monthly_budget, has_shopping, active,
            profile_notes, ideal_ticket_min, lead_goal_monthly, competitors
     FROM dim_account ${onlyActive ? "WHERE active = 1" : ""} ORDER BY sort_order, name`,
  ).all<Record<string, unknown>>();
  return (rows.results ?? []).map((r) => ({
    id: r.id as string,
    customer_id: r.customer_id as string,
    name: r.name as string,
    currency: r.currency as string,
    timezone: r.timezone as string,
    target_cpa: (r.target_cpa as number) ?? null,
    monthly_budget: (r.monthly_budget as number) ?? null,
    has_shopping: !!r.has_shopping,
    active: !!r.active,
    profile_notes: (r.profile_notes as string) ?? null,
    ideal_ticket_min: (r.ideal_ticket_min as number) ?? null,
    lead_goal_monthly: (r.lead_goal_monthly as number) ?? null,
    competitors: (r.competitors as string) ?? null,
  }));
}

export async function getAccount(env: Env, id: string): Promise<Account | null> {
  const all = await listAccounts(env, false);
  return all.find((a) => a.id === id) ?? null;
}

/** Divide um array em pedaços de tamanho n. */
export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * Insere linhas em lote via multi-row INSERT, respeitando o limite de
 * ~100 variáveis ligadas por statement do D1.
 */
export async function bulkInsert(
  env: Env,
  table: string,
  columns: string[],
  rows: Record<string, unknown>[],
  orReplace = true,
): Promise<number> {
  if (rows.length === 0) return 0;
  const perStmt = Math.max(1, Math.floor(90 / columns.length));
  const verb = orReplace ? "INSERT OR REPLACE" : "INSERT OR IGNORE";
  const stmts: D1PreparedStatement[] = [];
  for (const group of chunk(rows, perStmt)) {
    const placeholders = group
      .map(() => `(${columns.map(() => "?").join(",")})`)
      .join(",");
    const binds: unknown[] = [];
    for (const row of group) for (const c of columns) binds.push(row[c] ?? null);
    stmts.push(
      env.DB.prepare(
        `${verb} INTO ${table} (${columns.join(",")}) VALUES ${placeholders}`,
      ).bind(...binds),
    );
  }
  for (const b of chunk(stmts, 50)) await env.DB.batch(b);
  return rows.length;
}

export async function bulkUpdate(
  env: Env,
  table: string,
  keyCols: string[],
  setCols: string[],
  rows: Record<string, unknown>[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const stmts = rows.map((row) =>
    env.DB.prepare(
      `UPDATE ${table} SET ${setCols.map((c) => `${c} = ?`).join(", ")}
       WHERE ${keyCols.map((c) => `${c} = ?`).join(" AND ")}`,
    ).bind(...setCols.map((c) => row[c] ?? null), ...keyCols.map((c) => row[c])),
  );
  for (const b of chunk(stmts, 50)) await env.DB.batch(b);
  return rows.length;
}
