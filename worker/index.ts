import { Hono } from "hono";
import type { Env } from "./env";
import { accessMiddleware, type AccessUser } from "./auth";
import { reports } from "./routes/reports";
import { runEtl } from "./etl/run";
import { runQuery } from "./bq";

type Vars = { Variables: { user: AccessUser }; Bindings: Env };

const app = new Hono<Vars>();

// Health check — sem Access (para monitoração externa).
app.get("/api/health", (c) => c.json({ ok: true, ts: new Date().toISOString() }));

// Tudo o mais sob /api exige Cloudflare Access.
app.use("/api/*", accessMiddleware());

app.get("/api/me", (c) => c.json(c.get("user")));

// Descobrir nomes reais de colunas (para ajustar as queries do ETL).
app.get("/api/introspect", async (c) => {
  const table = c.req.query("table");
  if (!table || !/^[a-zA-Z0-9_]+$/.test(table)) return c.json({ error: "?table inválido" }, 400);
  try {
    const rows = await runQuery(
      c.env,
      `SELECT column_name, data_type
       FROM \`${c.env.GCP_PROJECT_ID}.${c.env.BQ_DATASET}.INFORMATION_SCHEMA.COLUMNS\`
       WHERE table_name = @t ORDER BY ordinal_position`,
      [{ name: "t", type: "STRING", value: table }],
    );
    return c.json({ table, columns: rows });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// Refresh manual (backfill sob demanda). ?account=&days=&facts=campaign,keyword
app.post("/api/refresh", async (c) => {
  const account = c.req.query("account") || undefined;
  const days = c.req.query("days") ? Number(c.req.query("days")) : undefined;
  const facts = c.req.query("facts")?.split(",").filter(Boolean);
  c.executionCtx.waitUntil(
    runEtl(c.env, {
      accountIds: account ? [account] : undefined,
      lookbackDays: days,
      facts,
    }).catch((e) => console.error("manual etl failed", e)),
  );
  return c.json({ started: true, account: account ?? "all", days: days ?? "default", facts: facts ?? "all" });
});

app.route("/api", reports);

// SPA / assets estáticos.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Cron diário: janela curta (o histórico longo vem do refresh manual).
    ctx.waitUntil(
      runEtl(env, { lookbackDays: 14 })
        .then((r) => console.log("etl done", JSON.stringify(r)))
        .catch((e) => console.error("scheduled etl failed", e)),
    );
  },
};
