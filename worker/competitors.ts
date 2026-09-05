import type { Env } from "./env";
import { previousRange, round } from "./kpi";

export type CompetitorStatus = "entrou" | "saiu" | "cresceu" | "caiu" | "estável";

export interface CompetitorRow {
  name: string;
  status: CompetitorStatus;
  cost_cur: number;
  cost_prev: number;
  cost_delta_pct: number | null;
  impressions_cur: number;
  impressions_prev: number;
  clicks_cur: number;
  conversions_cur: number;
  conversions_prev: number;
  terms: string[];
}

export interface CompetitorAnalysis {
  configured: boolean;
  range: { from: string; to: string };
  prev_range: { from: string; to: string };
  competitors: CompetitorRow[];
  unmapped_top: { term: string; cost: number; clicks: number; conversions: number }[];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

interface TermAgg {
  term: string;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

async function termsInRange(env: Env, accountId: string, from: string, to: string): Promise<TermAgg[]> {
  const r = await env.DB.prepare(
    `SELECT search_term AS term,
       SUM(cost) AS cost, SUM(impressions) AS impressions,
       SUM(clicks) AS clicks, SUM(conversions) AS conversions
     FROM fact_searchterm_daily
     WHERE account_id = ? AND day >= ? AND day <= ?
     GROUP BY search_term`,
  )
    .bind(accountId, from, to)
    .all<any>();
  return (r.results ?? []).map((x) => ({
    term: String(x.term ?? ""),
    cost: Number(x.cost ?? 0),
    impressions: Number(x.impressions ?? 0),
    clicks: Number(x.clicks ?? 0),
    conversions: Number(x.conversions ?? 0),
  }));
}

export function parseCompetitors(raw: string | null): string[] {
  return (raw ?? "")
    .split(/[\n,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function analyzeCompetitors(
  env: Env,
  account: { id: string; competitors: string | null },
  from: string,
  to: string,
): Promise<CompetitorAnalysis> {
  const names = parseCompetitors(account.competitors);
  const prev = previousRange(from, to);

  if (names.length === 0) {
    return { configured: false, range: { from, to }, prev_range: prev, competitors: [], unmapped_top: [] };
  }

  const [cur, before] = await Promise.all([
    termsInRange(env, account.id, from, to),
    termsInRange(env, account.id, prev.from, prev.to),
  ]);

  const needles = names.map((n) => ({ name: n, key: norm(n) }));
  const matched = new Set<string>();

  const bucket = (rows: TermAgg[], key: string) =>
    rows.filter((r) => norm(r.term).includes(key));

  const competitors: CompetitorRow[] = needles.map(({ name, key }) => {
    const c = bucket(cur, key);
    const p = bucket(before, key);
    c.forEach((r) => matched.add(r.term));

    const sum = (rows: TermAgg[], f: keyof TermAgg) =>
      rows.reduce((s, r) => s + (r[f] as number), 0);

    const cost_cur = sum(c, "cost");
    const cost_prev = sum(p, "cost");
    const delta =
      cost_prev > 0 ? (cost_cur - cost_prev) / cost_prev : cost_cur > 0 ? null : 0;

    let status: CompetitorStatus;
    if (cost_cur > 0 && cost_prev === 0) status = "entrou";
    else if (cost_cur === 0 && cost_prev > 0) status = "saiu";
    else if (delta != null && delta > 0.15) status = "cresceu";
    else if (delta != null && delta < -0.15) status = "caiu";
    else status = "estável";

    return {
      name,
      status,
      cost_cur: round(cost_cur),
      cost_prev: round(cost_prev),
      cost_delta_pct: delta == null ? null : round(delta * 100, 1),
      impressions_cur: sum(c, "impressions"),
      impressions_prev: sum(p, "impressions"),
      clicks_cur: sum(c, "clicks"),
      conversions_cur: round(sum(c, "conversions"), 1),
      conversions_prev: round(sum(p, "conversions"), 1),
      terms: [...c].sort((a, b) => b.cost - a.cost).slice(0, 6).map((r) => r.term),
    };
  });

  const unmapped_top = cur
    .filter((r) => !matched.has(r.term) && r.cost > 3)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 12)
    .map((r) => ({
      term: r.term,
      cost: round(r.cost),
      clicks: r.clicks,
      conversions: round(r.conversions, 1),
    }));

  return { configured: true, range: { from, to }, prev_range: prev, competitors, unmapped_top };
}
