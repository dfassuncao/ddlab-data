import { Hono } from "hono";
import type { Env } from "../env";
import type { AccessUser } from "../auth";
import { getAccount } from "../db";
import { resolveRange } from "../kpi";
import { addCampaignNegativeKeywords, setCampaignStatus, setKeywordStatus, type EntityStatus } from "../googleAds";

type Vars = { Variables: { user: AccessUser }; Bindings: Env };
export const adsActions = new Hono<Vars>();

async function q<T = any>(env: Env, sql: string, binds: unknown[]): Promise<T[]> {
  const r = await env.DB.prepare(sql).bind(...binds).all<T>();
  return (r.results ?? []) as T[];
}

interface ActionRow {
  id: string;
  account_id: string;
  action_type: string;
  description: string;
  payload: string;
  status: string;
  requested_by: string | null;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  applied_at: string | null;
  error: string | null;
}

function serialize(r: ActionRow) {
  return { ...r, payload: JSON.parse(r.payload) };
}

// Lista a fila de aprovação — sem ?status, traz tudo (mais recente primeiro).
adsActions.get("/ads-actions", async (c) => {
  const account = c.req.query("account");
  const status = c.req.query("status");
  const conds = ["1=1"];
  const binds: unknown[] = [];
  if (account) {
    conds.push("account_id = ?");
    binds.push(account);
  }
  if (status) {
    conds.push("status = ?");
    binds.push(status);
  }
  const rows = await q<ActionRow>(
    c.env,
    `SELECT * FROM google_ads_actions WHERE ${conds.join(" AND ")} ORDER BY requested_at DESC LIMIT 200`,
    binds,
  );
  return c.json({ rows: rows.map(serialize) });
});

// Propõe negativar um termo de busca — acha em quais campanhas ele gerou
// clique/impressão no período informado (mesma dimensão usada em Classificação
// de termos) e enfileira UMA ação cobrindo todas elas.
adsActions.post("/ads-actions/propose-negative", async (c) => {
  const body = await c.req.json<{ account?: string; term?: string; from?: string; to?: string; matchType?: string }>();
  const accountId = body.account;
  const term = body.term?.toLowerCase().trim();
  if (!accountId || !term) return c.json({ error: "account e term são obrigatórios" }, 400);

  const account = await getAccount(c.env, accountId);
  if (!account) return c.json({ error: "account not found" }, 404);

  const matchType = (body.matchType ?? "PHRASE").toUpperCase();
  if (!["BROAD", "PHRASE", "EXACT"].includes(matchType)) {
    return c.json({ error: "matchType deve ser BROAD, PHRASE ou EXACT" }, 400);
  }

  const { from, to } = resolveRange(body.from, body.to);
  const campaigns = await q<{ campaign_id: string; name: string | null }>(
    c.env,
    `SELECT DISTINCT f.campaign_id, d.name
     FROM fact_searchterm_daily f
     LEFT JOIN dim_campaign d ON d.account_id = f.account_id AND d.campaign_id = f.campaign_id
     WHERE f.account_id = ? AND f.day >= ? AND f.day <= ? AND LOWER(TRIM(f.search_term)) = ?`,
    [accountId, from, to, term],
  );
  if (campaigns.length === 0) {
    return c.json({ error: `Termo "${term}" não apareceu em nenhuma campanha no período ${from} a ${to}` }, 404);
  }

  const nomes = campaigns.map((cp) => cp.name ?? cp.campaign_id).join(", ");
  const matchLabel = { BROAD: "ampla", PHRASE: "frase", EXACT: "exata" }[matchType as "BROAD" | "PHRASE" | "EXACT"];
  const description = `Negativar "${term}" (correspondência ${matchLabel}) na(s) campanha(s): ${nomes}`;

  const id = crypto.randomUUID();
  const payload = {
    customerId: account.customer_id,
    term,
    matchType,
    campaigns: campaigns.map((cp) => ({ id: cp.campaign_id, name: cp.name ?? cp.campaign_id })),
  };
  await c.env.DB.prepare(
    `INSERT INTO google_ads_actions (id, account_id, action_type, description, payload, status, requested_by)
     VALUES (?, ?, 'negative_keyword', ?, ?, 'pending', ?)`,
  )
    .bind(id, accountId, description, JSON.stringify(payload), c.get("user").email)
    .run();

  const row = (await q<ActionRow>(c.env, `SELECT * FROM google_ads_actions WHERE id = ?`, [id]))[0];
  return c.json(serialize(row));
});

function parseStatus(raw: string | undefined): EntityStatus | null {
  const s = raw?.toUpperCase();
  return s === "PAUSED" || s === "ENABLED" ? s : null;
}

// Propõe pausar/reativar uma campanha inteira.
adsActions.post("/ads-actions/propose-campaign-status", async (c) => {
  const body = await c.req.json<{ account?: string; campaignId?: string; status?: string }>();
  const accountId = body.account;
  const campaignId = body.campaignId;
  const status = parseStatus(body.status);
  if (!accountId || !campaignId || !status) return c.json({ error: "account, campaignId e status (PAUSED/ENABLED) são obrigatórios" }, 400);

  const account = await getAccount(c.env, accountId);
  if (!account) return c.json({ error: "account not found" }, 404);

  const rows = await q<{ name: string | null }>(
    c.env,
    `SELECT name FROM dim_campaign WHERE account_id = ? AND campaign_id = ?`,
    [accountId, campaignId],
  );
  const nome = rows[0]?.name ?? campaignId;
  const acao = status === "PAUSED" ? "Pausar" : "Reativar";
  const description = `${acao} a campanha "${nome}"`;

  const id = crypto.randomUUID();
  const payload = { customerId: account.customer_id, campaignId, status };
  await c.env.DB.prepare(
    `INSERT INTO google_ads_actions (id, account_id, action_type, description, payload, status, requested_by)
     VALUES (?, ?, 'campaign_status', ?, ?, 'pending', ?)`,
  )
    .bind(id, accountId, description, JSON.stringify(payload), c.get("user").email)
    .run();

  const row = (await q<ActionRow>(c.env, `SELECT * FROM google_ads_actions WHERE id = ?`, [id]))[0];
  return c.json(serialize(row));
});

// Propõe pausar/reativar uma palavra-chave específica — acha o ad_group_id e
// a campanha a partir do criterion_id (o front só precisa saber o criterion_id).
adsActions.post("/ads-actions/propose-keyword-status", async (c) => {
  const body = await c.req.json<{ account?: string; criterionId?: string; status?: string }>();
  const accountId = body.account;
  const criterionId = body.criterionId;
  const status = parseStatus(body.status);
  if (!accountId || !criterionId || !status) return c.json({ error: "account, criterionId e status (PAUSED/ENABLED) são obrigatórios" }, 400);

  const account = await getAccount(c.env, accountId);
  if (!account) return c.json({ error: "account not found" }, 404);

  const rows = await q<{ keyword_text: string | null; ad_group_id: string; campaign_id: string }>(
    c.env,
    `SELECT keyword_text, ad_group_id, campaign_id FROM fact_keyword_daily
     WHERE account_id = ? AND criterion_id = ? ORDER BY day DESC LIMIT 1`,
    [accountId, criterionId],
  );
  if (rows.length === 0) return c.json({ error: "palavra-chave não encontrada" }, 404);
  const kw = rows[0];

  const campRows = await q<{ name: string | null }>(
    c.env,
    `SELECT name FROM dim_campaign WHERE account_id = ? AND campaign_id = ?`,
    [accountId, kw.campaign_id],
  );
  const campanhaNome = campRows[0]?.name ?? kw.campaign_id;
  const acao = status === "PAUSED" ? "Pausar" : "Reativar";
  const description = `${acao} a palavra-chave "${kw.keyword_text ?? criterionId}" (campanha "${campanhaNome}")`;

  const id = crypto.randomUUID();
  const payload = { customerId: account.customer_id, adGroupId: kw.ad_group_id, criterionId, status };
  await c.env.DB.prepare(
    `INSERT INTO google_ads_actions (id, account_id, action_type, description, payload, status, requested_by)
     VALUES (?, ?, 'keyword_status', ?, ?, 'pending', ?)`,
  )
    .bind(id, accountId, description, JSON.stringify(payload), c.get("user").email)
    .run();

  const row = (await q<ActionRow>(c.env, `SELECT * FROM google_ads_actions WHERE id = ?`, [id]))[0];
  return c.json(serialize(row));
});

async function loadPending(env: Env, id: string): Promise<ActionRow | null> {
  const rows = await q<ActionRow>(env, `SELECT * FROM google_ads_actions WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

// Aprovar = a única forma de uma mutação sair daqui e chegar no Google Ads de
// verdade. Aplica na hora (síncrono) e já devolve o resultado real (applied/error).
adsActions.post("/ads-actions/:id/approve", async (c) => {
  const id = c.req.param("id");
  const action = await loadPending(c.env, id);
  if (!action) return c.json({ error: "ação não encontrada" }, 404);
  if (action.status !== "pending") return c.json({ error: `ação já está '${action.status}'` }, 400);

  const reviewer = c.get("user").email;
  await c.env.DB.prepare(
    `UPDATE google_ads_actions SET status='approved', reviewed_by=?, reviewed_at=datetime('now') WHERE id=?`,
  )
    .bind(reviewer, id)
    .run();

  try {
    const payload = JSON.parse(action.payload);
    if (action.action_type === "negative_keyword") {
      await addCampaignNegativeKeywords(
        c.env,
        payload.customerId,
        payload.campaigns.map((cp: { id: string }) => ({
          campaignId: cp.id,
          keyword: payload.term,
          matchType: payload.matchType,
        })),
      );
    } else if (action.action_type === "campaign_status") {
      await setCampaignStatus(c.env, payload.customerId, payload.campaignId, payload.status);
    } else if (action.action_type === "keyword_status") {
      await setKeywordStatus(c.env, payload.customerId, payload.adGroupId, payload.criterionId, payload.status);
    } else {
      throw new Error(`action_type '${action.action_type}' ainda não é aplicável (fase futura)`);
    }
    await c.env.DB.prepare(`UPDATE google_ads_actions SET status='applied', applied_at=datetime('now') WHERE id=?`)
      .bind(id)
      .run();
  } catch (e) {
    // A requisição em si teve sucesso (chegou até tentar a mutação no Ads) —
    // só a mutação falhou. Devolve 200 com status='error' no corpo, não um
    // 4xx/5xx: isso faz o frontend tratar como resposta válida e atualizar a
    // lista mostrando o erro, em vez de descartar o corpo e travar a tela.
    const msg = e instanceof Error ? e.message : String(e);
    await c.env.DB.prepare(`UPDATE google_ads_actions SET status='error', error=? WHERE id=?`).bind(msg.slice(0, 1000), id).run();
    const row = await loadPending(c.env, id);
    return c.json(serialize(row!));
  }

  const row = await loadPending(c.env, id);
  return c.json(serialize(row!));
});

adsActions.post("/ads-actions/:id/reject", async (c) => {
  const id = c.req.param("id");
  const action = await loadPending(c.env, id);
  if (!action) return c.json({ error: "ação não encontrada" }, 404);
  if (action.status !== "pending") return c.json({ error: `ação já está '${action.status}'` }, 400);

  await c.env.DB.prepare(
    `UPDATE google_ads_actions SET status='rejected', reviewed_by=?, reviewed_at=datetime('now') WHERE id=?`,
  )
    .bind(c.get("user").email, id)
    .run();

  const row = await loadPending(c.env, id);
  return c.json(serialize(row!));
});
