import { Hono } from "hono";
import type { Env } from "../env";
import type { AccessUser } from "../auth";
import { getAccount } from "../db";
import { withKpis, resolveRange, previousRange, round } from "../kpi";

type Vars = { Variables: { user: AccessUser }; Bindings: Env };
export const reports = new Hono<Vars>();

const METRIC_SUM = `
  SUM(impressions) AS impressions,
  SUM(clicks) AS clicks,
  SUM(cost) AS cost,
  SUM(conversions) AS conversions,
  SUM(conversions_value) AS conversions_value`;

async function q<T = Record<string, unknown>>(env: Env, sql: string, binds: unknown[]): Promise<T[]> {
  const r = await env.DB.prepare(sql).bind(...binds).all<T>();
  return r.results ?? [];
}

interface ReportKind {
  table: string;
  groupBy: string;
  keyCol: string;
  labelSql: string;
  join?: string;
  extraCols?: string; // colunas adicionais no SELECT
  extraGroup?: string;
}

const KINDS: Record<string, ReportKind> = {
  campaigns: {
    table: "fact_campaign_daily f",
    join: "LEFT JOIN dim_campaign d ON d.account_id = f.account_id AND d.campaign_id = f.campaign_id",
    groupBy: "f.campaign_id",
    keyCol: "f.campaign_id",
    labelSql: "COALESCE(d.name, f.campaign_id)",
    extraCols:
      "MAX(d.status) AS status, MAX(d.channel_type) AS channel_type, AVG(f.search_is) AS search_is, AVG(f.budget_lost_is) AS budget_lost_is, AVG(f.rank_lost_is) AS rank_lost_is",
  },
  keywords: {
    table: "fact_keyword_daily f",
    join: "LEFT JOIN dim_campaign d ON d.account_id = f.account_id AND d.campaign_id = f.campaign_id",
    groupBy: "f.criterion_id",
    keyCol: "f.criterion_id",
    labelSql: "MAX(f.keyword_text)",
    extraCols: "MAX(f.match_type) AS match_type, MAX(d.name) AS campaign",
  },
  "search-terms": {
    table: "fact_searchterm_daily f",
    join: "LEFT JOIN dim_campaign d ON d.account_id = f.account_id AND d.campaign_id = f.campaign_id",
    groupBy: "f.search_term",
    keyCol: "f.search_term",
    labelSql: "f.search_term",
    extraCols: "MAX(d.name) AS campaign",
  },
  geo: {
    table: "fact_geo_daily f",
    groupBy: "f.location_id",
    keyCol: "f.location_id",
    labelSql: "f.location_id",
  },
  ads: {
    table: "fact_ad_daily f",
    join: "LEFT JOIN dim_campaign d ON d.account_id = f.account_id AND d.campaign_id = f.campaign_id",
    groupBy: "f.ad_id",
    keyCol: "f.ad_id",
    labelSql: "f.ad_id",
    extraCols: "MAX(f.ad_group_id) AS ad_group_id, MAX(f.ad_type) AS ad_type, MAX(d.name) AS campaign",
  },
  audiences: {
    table: "fact_audience_daily f",
    groupBy: "f.dimension, f.bucket",
    keyCol: "f.dimension || ':' || f.bucket",
    labelSql: "f.bucket",
    extraCols: "MAX(f.dimension) AS dimension",
  },
  products: {
    table: "fact_product_daily f",
    groupBy: "f.product_id",
    keyCol: "f.product_id",
    labelSql: "COALESCE(MAX(f.title), f.product_id)",
  },
  "landing-pages": {
    table: "fact_landingpage_daily f",
    groupBy: "f.url",
    keyCol: "f.url",
    labelSql: "f.url",
    extraCols: "CAST(AVG(NULLIF(f.mobile_speed,0)) AS INT) AS mobile_speed",
  },
};

async function accountOr404(c: any) {
  const id = c.req.query("account");
  if (!id) return { error: c.json({ error: "missing ?account" }, 400) };
  const account = await getAccount(c.env, id);
  if (!account) return { error: c.json({ error: "account not found" }, 404) };
  return { account };
}

reports.get("/accounts", async (c) => {
  const { listAccounts } = await import("../db");
  return c.json(await listAccounts(c.env, false));
});

reports.get("/report/:kind", async (c) => {
  const kind = c.req.param("kind");
  const spec = KINDS[kind];
  if (!spec) return c.json({ error: "unknown report kind" }, 404);
  const { account, error } = await accountOr404(c);
  if (error) return error;
  const { from, to } = resolveRange(c.req.query("from"), c.req.query("to"));

  const sql = `
    SELECT ${spec.keyCol} AS key, ${spec.labelSql} AS label,
      ${METRIC_SUM}${spec.extraCols ? ", " + spec.extraCols : ""}
    FROM ${spec.table}
    ${spec.join ?? ""}
    WHERE f.account_id = ? AND f.day >= ? AND f.day <= ?
    GROUP BY ${spec.groupBy}
    ORDER BY cost DESC
    LIMIT 2000`;
  const rows = await q(c.env, sql, [account!.id, from, to]);

  const data = rows.map((r: any) => {
    const kpis = withKpis(r);
    const { impressions, clicks, cost, conversions, conversions_value, key, label, ...rest } = r;
    return { key: String(key), label: label ?? String(key), ...kpis, ...stripMetrics(rest) };
  });
  return c.json({ account, range: { from, to }, rows: data });
});

function stripMetrics(o: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (["search_is", "budget_lost_is", "rank_lost_is"].includes(k) && typeof v === "number") {
      out[k] = round(v, 4);
    } else out[k] = v;
  }
  return out;
}

reports.get("/schedule", async (c) => {
  const { account, error } = await accountOr404(c);
  if (error) return error;
  const { from, to } = resolveRange(c.req.query("from"), c.req.query("to"));

  const heat = await q(
    c.env,
    `SELECT hour, day_of_week, ${METRIC_SUM}
     FROM fact_hour_daily
     WHERE account_id = ? AND day >= ? AND day <= ? AND hour >= 0
     GROUP BY hour, day_of_week`,
    [account!.id, from, to],
  );
  const devices = await q(
    c.env,
    `SELECT device, ${METRIC_SUM}
     FROM fact_hour_daily
     WHERE account_id = ? AND day >= ? AND day <= ? AND hour = -1
     GROUP BY device`,
    [account!.id, from, to],
  );
  return c.json({
    account,
    range: { from, to },
    heatmap: heat.map((r: any) => ({ hour: r.hour, day_of_week: r.day_of_week, ...withKpis(r) })),
    devices: devices.map((r: any) => ({ device: r.device ?? "?", ...withKpis(r) })),
  });
});

reports.get("/overview", async (c) => {
  const { account, error } = await accountOr404(c);
  if (error) return error;
  const { from, to } = resolveRange(c.req.query("from"), c.req.query("to"));
  const prev = previousRange(from, to);

  const totalsFor = async (a: string, b: string) => {
    const [row] = await q(
      c.env,
      `SELECT ${METRIC_SUM} FROM fact_campaign_daily WHERE account_id = ? AND day >= ? AND day <= ?`,
      [account!.id, a, b],
    );
    return withKpis((row as any) ?? { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversions_value: 0 });
  };

  const trend = await q(
    c.env,
    `SELECT day, ${METRIC_SUM} FROM fact_campaign_daily
     WHERE account_id = ? AND day >= ? AND day <= ? GROUP BY day ORDER BY day`,
    [account!.id, from, to],
  );

  const campaigns = await q(
    c.env,
    `SELECT f.campaign_id AS campaign_id, COALESCE(d.name, f.campaign_id) AS name,
       MAX(d.status) AS status, MAX(d.channel_type) AS channel_type,
       AVG(f.search_is) AS search_is, AVG(f.budget_lost_is) AS budget_lost_is, AVG(f.rank_lost_is) AS rank_lost_is,
       ${METRIC_SUM}
     FROM fact_campaign_daily f
     LEFT JOIN dim_campaign d ON d.account_id = f.account_id AND d.campaign_id = f.campaign_id
     WHERE f.account_id = ? AND f.day >= ? AND f.day <= ?
     GROUP BY f.campaign_id ORDER BY cost DESC`,
    [account!.id, from, to],
  );

  // Pacing do mês corrente
  const monthStart = to.slice(0, 8) + "01";
  const [monthRow] = await q(
    c.env,
    `SELECT SUM(cost) AS cost, SUM(conversions) AS conversions FROM fact_campaign_daily
     WHERE account_id = ? AND day >= ? AND day <= ?`,
    [account!.id, monthStart, to],
  );
  const dayOfMonth = Number(to.slice(8, 10));
  const daysInMonth = new Date(Number(to.slice(0, 4)), Number(to.slice(5, 7)), 0).getDate();
  const monthCost = Number((monthRow as any)?.cost ?? 0);
  const monthConv = Number((monthRow as any)?.conversions ?? 0);

  const freshness = await q(
    c.env,
    `SELECT * FROM meta_refresh WHERE account_id = ?`,
    [account!.id],
  );

  return c.json({
    account,
    range: { from, to },
    totals: { current: await totalsFor(from, to), previous: await totalsFor(prev.from, prev.to) },
    trend: trend.map((r: any) => ({
      day: r.day,
      cost: round(r.cost),
      clicks: r.clicks,
      conversions: round(r.conversions, 2),
      impressions: r.impressions,
      conversions_value: round(r.conversions_value),
    })),
    campaigns: campaigns.map((r: any) => ({
      campaign_id: String(r.campaign_id),
      name: r.name,
      status: r.status,
      channel_type: r.channel_type,
      search_is: r.search_is != null ? round(r.search_is, 4) : null,
      budget_lost_is: r.budget_lost_is != null ? round(r.budget_lost_is, 4) : null,
      rank_lost_is: r.rank_lost_is != null ? round(r.rank_lost_is, 4) : null,
      ...withKpis(r),
    })),
    pacing: {
      month_cost: round(monthCost),
      monthly_budget: account!.monthly_budget,
      projected_month_cost: dayOfMonth > 0 ? round((monthCost / dayOfMonth) * daysInMonth) : null,
      target_cpa: account!.target_cpa,
      cpa: monthConv > 0 ? round(monthCost / monthConv, 2) : null,
    },
    freshness,
  });
});

reports.get("/waste", async (c) => {
  const { account, error } = await accountOr404(c);
  if (error) return error;
  const { from, to } = resolveRange(c.req.query("from"), c.req.query("to"));
  const binds = [account!.id, from, to];

  const campaigns = await q(
    c.env,
    `SELECT COALESCE(d.name, f.campaign_id) AS label, SUM(f.cost) AS cost, SUM(f.clicks) AS clicks
     FROM fact_campaign_daily f LEFT JOIN dim_campaign d ON d.account_id=f.account_id AND d.campaign_id=f.campaign_id
     WHERE f.account_id=? AND f.day>=? AND f.day<=?
     GROUP BY f.campaign_id HAVING SUM(f.conversions)=0 AND SUM(f.cost)>0 ORDER BY cost DESC`,
    binds,
  );
  const keywords = await q(
    c.env,
    `SELECT MAX(f.keyword_text) AS label, SUM(f.cost) AS cost, SUM(f.clicks) AS clicks
     FROM fact_keyword_daily f WHERE f.account_id=? AND f.day>=? AND f.day<=?
     GROUP BY f.criterion_id HAVING SUM(f.conversions)=0 AND SUM(f.cost)>0 ORDER BY cost DESC LIMIT 200`,
    binds,
  );
  const terms = await q(
    c.env,
    `SELECT f.search_term AS label, SUM(f.cost) AS cost, SUM(f.clicks) AS clicks
     FROM fact_searchterm_daily f WHERE f.account_id=? AND f.day>=? AND f.day<=?
     GROUP BY f.search_term HAVING SUM(f.conversions)=0 AND SUM(f.cost)>0 ORDER BY cost DESC LIMIT 200`,
    binds,
  );
  const geo = await q(
    c.env,
    `SELECT f.location_id AS label, SUM(f.cost) AS cost, SUM(f.clicks) AS clicks
     FROM fact_geo_daily f WHERE f.account_id=? AND f.day>=? AND f.day<=?
     GROUP BY f.location_id HAVING SUM(f.conversions)=0 AND SUM(f.cost)>0 ORDER BY cost DESC LIMIT 200`,
    binds,
  );

  const mk = (scope: string) => (r: any) => ({
    scope,
    label: r.label ?? "(sem rótulo)",
    cost: round(r.cost),
    clicks: r.clicks,
  });
  const items = [
    ...campaigns.map(mk("campaign")),
    ...keywords.map(mk("keyword")),
    ...terms.map(mk("search_term")),
    ...geo.map(mk("geo")),
  ];
  const recoverable = round(
    campaigns.reduce((s: number, r: any) => s + Number(r.cost), 0),
  );
  return c.json({ account, range: { from, to }, recoverable, items });
});

reports.get("/opportunities", async (c) => {
  const { account, error } = await accountOr404(c);
  if (error) return error;
  const { from, to } = resolveRange(c.req.query("from"), c.req.query("to"));
  const binds = [account!.id, from, to];

  const budgetLimited = await q(
    c.env,
    `SELECT COALESCE(d.name, f.campaign_id) AS label, SUM(f.cost) AS cost,
       SUM(f.conversions) AS conversions, AVG(f.budget_lost_is) AS budget_lost_is
     FROM fact_campaign_daily f LEFT JOIN dim_campaign d ON d.account_id=f.account_id AND d.campaign_id=f.campaign_id
     WHERE f.account_id=? AND f.day>=? AND f.day<=?
     GROUP BY f.campaign_id HAVING AVG(f.budget_lost_is) > 0.05 AND SUM(f.conversions) > 0
     ORDER BY budget_lost_is DESC`,
    binds,
  );
  const convertingTerms = await q(
    c.env,
    `SELECT f.search_term AS label, SUM(f.cost) AS cost, SUM(f.conversions) AS conversions,
       SUM(f.clicks) AS clicks
     FROM fact_searchterm_daily f WHERE f.account_id=? AND f.day>=? AND f.day<=?
     GROUP BY f.search_term HAVING SUM(f.conversions) >= 1 ORDER BY conversions DESC LIMIT 100`,
    binds,
  );
  const scaleGeo = await q(
    c.env,
    `SELECT f.location_id AS label, SUM(f.cost) AS cost, SUM(f.conversions) AS conversions,
       SUM(f.clicks) AS clicks
     FROM fact_geo_daily f WHERE f.account_id=? AND f.day>=? AND f.day<=?
     GROUP BY f.location_id HAVING SUM(f.conversions) >= 1
     ORDER BY (SUM(f.conversions) / NULLIF(SUM(f.cost),0)) DESC LIMIT 50`,
    binds,
  );

  return c.json({
    account,
    range: { from, to },
    budget_limited: budgetLimited.map((r: any) => ({
      label: r.label,
      cost: round(r.cost),
      conversions: round(r.conversions, 2),
      budget_lost_is: round(r.budget_lost_is, 4),
    })),
    converting_terms: convertingTerms.map((r: any) => ({
      label: r.label,
      cost: round(r.cost),
      conversions: round(r.conversions, 2),
      clicks: r.clicks,
      cpa: r.conversions > 0 ? round(r.cost / r.conversions, 2) : null,
    })),
    scale_geo: scaleGeo.map((r: any) => ({
      label: r.label,
      cost: round(r.cost),
      conversions: round(r.conversions, 2),
      cpa: r.conversions > 0 ? round(r.cost / r.conversions, 2) : null,
    })),
  });
});

reports.get("/freshness", async (c) => {
  const acc = c.req.query("account");
  const rows = acc
    ? await q(c.env, `SELECT * FROM meta_refresh WHERE account_id = ? ORDER BY fact`, [acc])
    : await q(c.env, `SELECT * FROM meta_refresh ORDER BY account_id, fact`, []);
  return c.json({ rows });
});

reports.get("/annotations", async (c) => {
  const acc = c.req.query("account");
  if (!acc) return c.json({ error: "missing ?account" }, 400);
  const rows = await q(
    c.env,
    `SELECT id, day, text, author, created_at FROM annotations WHERE account_id = ? ORDER BY day DESC`,
    [acc],
  );
  return c.json({ rows });
});

reports.post("/annotations", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ account: string; day: string; text: string }>();
  if (!body.account || !body.day || !body.text) return c.json({ error: "account, day, text obrigatórios" }, 400);
  await c.env.DB.prepare(
    `INSERT INTO annotations (account_id, day, text, author) VALUES (?, ?, ?, ?)`,
  )
    .bind(body.account, body.day, body.text, user.email)
    .run();
  return c.json({ ok: true });
});

reports.post("/settings/account", async (c) => {
  const body = await c.req.json<{
    id: string;
    target_cpa?: number | null;
    monthly_budget?: number | null;
    has_shopping?: boolean;
    active?: boolean;
  }>();
  if (!body.id) return c.json({ error: "id obrigatório" }, 400);
  await c.env.DB.prepare(
    `UPDATE dim_account SET
       target_cpa = COALESCE(?, target_cpa),
       monthly_budget = COALESCE(?, monthly_budget),
       has_shopping = COALESCE(?, has_shopping),
       active = COALESCE(?, active)
     WHERE id = ?`,
  )
    .bind(
      body.target_cpa ?? null,
      body.monthly_budget ?? null,
      body.has_shopping == null ? null : body.has_shopping ? 1 : 0,
      body.active == null ? null : body.active ? 1 : 0,
      body.id,
    )
    .run();
  return c.json({ ok: true });
});
