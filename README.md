# DDLab · Ads Intelligence

Aplicação de inteligência de marketing (Google Ads + GA4 + Search Console) da agência DDLab, multi‑conta.

- **Fontes** (todas via BigQuery, um dataset por conta/propriedade):
  - **Google Ads** — Data Transfer nativo, projeto `studio-7861914720-de430`, dataset `mcc_ddlab_google_ads`.
  - **GA4** (opcional por conta) — bulk export nativo do GA4, dataset `analytics_<id>`.
  - **Search Console** (opcional por conta) — bulk export nativo do GSC, dataset `searchconsole_<conta>`.
- **Pipeline**: um Cloudflare Worker roda 1x/dia (Cron) e pré‑agrega tudo no Cloudflare **D1**.
- **App**: SPA React servida pelo mesmo Worker; leitura só do D1 (rápido e barato).
- **Login**: Cloudflare Access (nada de senha no código) — ver nota de segurança abaixo.
- **Análise IA**: chamadas sob demanda a um provedor de LLM (Gemini por padrão, Claude ou
  DeepSeek opcionais por conta em Configurações), com histórico navegável das gerações passadas.

> ⚠️ **Segurança**: em produção, se `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` não estiverem
> configurados como *secrets* (não como var de build!) do Worker, a API recusa servir
> `/api/*` (500) em vez de abrir acesso sem login — ver `worker/auth.ts` e o passo 4 do
> [DEPLOY.md](./DEPLOY.md). Não desative essa checagem.

## Páginas

**Núcleo**: Central de decisão · Diagnóstico IA · Saúde dos dados · Ações pendentes
**Relatórios**: Visão geral · Análise IA (texto) · Campanhas · Palavras‑chave · Termos de busca ·
Geografia · Horário & Dispositivo · Anúncios · Públicos · Produtos · Landing pages ·
Search Console · Google Analytics · Desperdício · Oportunidades · Apresentação
**Configurações**: metas por conta, briefing do cliente, datasets de GA4/GSC, backfill manual

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
  auth.ts         verificação do JWT do Cloudflare Access (fail-closed em produção)
  etl/queries.ts  queries do Google Ads, uma por "fato"
  etl/ga4.ts      query do bulk export do GA4 (nível canal)
  etl/gsc.ts      queries do bulk export do Search Console (consultas + páginas)
  routes/         endpoints de relatório (leem o D1)
src/              frontend React
migrations/       schema e seed do D1
shared/           tipos compartilhados
docs/security-audit/  relatório de auditoria de segurança + script gerador
```

## Ajustar uma query do ETL

Se uma conta usa nome de coluna diferente no BigQuery, o fato aparece com erro
em **Configurações → Atualização de dados**. Descubra o nome real:

```bash
curl "https://SEU-WORKER/api/introspect?table=p_ads_SearchQueryStats"
```

e corrija em `worker/etl/queries.ts` (Google Ads), `worker/etl/ga4.ts` (GA4) ou
`worker/etl/gsc.ts` (Search Console).

## Disparar o ETL manualmente

`/api/refresh` fica atrás do Cloudflare Access — não dá para chamar com `curl` puro
em produção (sem sessão, cai no login). Rode pelo DevTools do navegador já logado:

```js
fetch('/api/refresh?facts=gsc&days=90', { method: 'POST' }).then(r => r.json()).then(console.log)
```

`facts` aceita `campaign,keyword,search_term,geo,hour,device,ad,audience_age,audience_gender,product,landing_page,ga4,gsc`
(vazio = todos). Omitir `account` roda para todas as contas ativas.

`keyword_volume` (volume de busca do Keyword Planner) e `term_classification`
(classificação por IA dos termos de busca/consultas — página **Classificação
de termos**) são exceção: **nunca** rodam com `facts` vazio/todos — só quando
pedidos explicitamente (`?facts=keyword_volume` / `?facts=term_classification`),
porque consomem quota da API do Google Ads / API da Anthropic e mudam pouco
mês a mês. `keyword_volume` requer as 5 vars `GOOGLE_ADS_*` (ver DEPLOY.md);
`term_classification` classifica TODOS os termos de busca (Ads) e consultas
(GSC) da conta no período, sem limite — requer `GEMINI_API_KEY` (padrão),
`ANTHROPIC_API_KEY` (Claude) ou `DEEPSEEK_API_KEY` (DeepSeek), conforme o
campo "IA" da conta em Configurações.

## Integração de escrita com o Google Ads (Ações pendentes)

Fase 1: negativar termos de busca. Nenhuma mutação é enviada para a API do
Ads sem aprovação manual — fluxo:

1. Em **Classificação de termos**, cada termo com `acao_recomendada = "Negativar"`
   ganha um botão "Propor negativação" → cria uma linha `pending` em
   `google_ads_actions` (`POST /api/ads-actions/propose-negative`), achando
   automaticamente em quais campanhas o termo apareceu no período.
2. Em **Ações pendentes**, a proposta aparece em texto claro (termo,
   correspondência, campanhas afetadas). Só ali é possível Aprovar/Rejeitar.
3. Aprovar chama `worker/googleAds.ts#addCampaignNegativeKeywords`
   (`campaignCriteria:mutate` da Google Ads API) e grava o resultado real —
   `applied` ou `error` (nunca fica "meio aplicada": só muda de status depois
   da resposta da API).

Usa as mesmas credenciais `GOOGLE_ADS_*` já configuradas para o
`keyword_volume` (mesmo escopo OAuth `adwords`, que cobre leitura e escrita
na API do Ads — não precisa de token/escopo novo). Próximas fases:
pausar/reativar campanhas e palavras-chave, ajuste de orçamento/lances,
criação de campanhas/anúncios.
