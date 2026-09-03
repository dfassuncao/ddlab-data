# DDLab · Ads Intelligence

Aplicação de análise de campanhas de Google Ads da MCC da DDLab, começando pela **Doin Motors** e já multi‑conta.

- **Fonte**: BigQuery (Google Ads Data Transfer) — projeto `studio-7861914720-de430`, dataset `mcc_ddlab_google_ads`.
- **Pipeline**: um Cloudflare Worker roda 1x/dia (Cron) e pré‑agrega os dados no Cloudflare **D1**.
- **App**: SPA React servida pelo mesmo Worker; leitura só do D1 (rápido e barato).
- **Login**: Cloudflare Access (nada de senha no código).

## Páginas

Visão geral · Campanhas · Palavras‑chave · Termos de busca · Geografia · Horário & Dispositivo ·
Anúncios · Públicos · Produtos · Landing pages · Desperdício · Oportunidades · Configurações

## Rodar local

```bash
npm install
cp .dev.vars.example .dev.vars   # preencha GCP_SA_KEY
npm run db:migrate:local
npm run db:seed:local
npm run dev:worker               # Worker em :8787
npm run dev                      # Frontend em :5173 (proxy /api -> :8787)
```

Sem `CF_ACCESS_*` configurado, a verificação de login é ignorada em local.

Popular o D1 local com dados reais do BigQuery:

```bash
curl -X POST "http://localhost:8787/api/refresh?account=doin-motors&days=120"
```

## Deploy

Ver [DEPLOY.md](./DEPLOY.md).

## Estrutura

```
worker/           API (Hono) + ETL (BigQuery -> D1) + handler scheduled
  etl/queries.ts  as queries do BigQuery, uma por "fato"
  routes/         endpoints de relatório (leem o D1)
src/              frontend React
migrations/       schema e seed do D1
shared/           tipos compartilhados
```

## Ajustar uma query do ETL

Se uma conta usa nome de coluna diferente no BigQuery, o fato aparece com erro
em **Configurações → Atualização de dados**. Descubra o nome real:

```bash
curl "https://SEU-WORKER/api/introspect?table=p_ads_SearchQueryStats"
```

e corrija em `worker/etl/queries.ts`.
