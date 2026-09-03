# Deploy — passo a passo

Ordem: **GCP service account → GitHub → Cloudflare (D1 + secrets + deploy) → Cloudflare Access → CI**.

---

## 1. Service account do GCP (leitura do BigQuery)

No Console GCP, projeto `studio-7861914720-de430`:

1. **IAM e Admin → Contas de serviço → Criar**.
   - Nome: `ddlab-ads-bq`
   - Papéis: **BigQuery Data Viewer** e **BigQuery Job User**.
2. Aba **Chaves → Adicionar chave → JSON**. Baixa o arquivo `xxx.json`.
3. Guarde o conteúdo — vira o secret `GCP_SA_KEY` (JSON inteiro em uma linha).

> A conta de serviço só lê. Não precisa de acesso ao Google Ads (o transfer já joga tudo no BigQuery).

---

## 2. GitHub

```bash
cd "C:/Users/dfass/OneDrive/DANIEL/CLIENTES/Doin Motors/MCP Doin"
git init
git add .
git commit -m "feat: ambiente de análise de Google Ads (Cloudflare + BigQuery)"
```

Crie um repo vazio em github.com (ex.: `ddlab/ads-intelligence`, **privado**) e:

```bash
git remote add origin https://github.com/ddlab/ads-intelligence.git
git branch -M main
git push -u origin main
```

---

## 3. Cloudflare — D1, secrets e primeiro deploy

```bash
npm install
npx wrangler login

# cria o banco e mostra um database_id
npx wrangler d1 create ddlab-ads
```

Cole o `database_id` retornado em `wrangler.toml` (campo `database_id`).

```bash
# schema + contas
npm run db:migrate
npm run db:seed

# secret da service account (cole o JSON inteiro quando pedir)
npx wrangler secret put GCP_SA_KEY

# build do frontend + deploy do Worker
npm run deploy
```

Isso publica em `https://ddlab-ads-intelligence.<seu-subdominio>.workers.dev`.

Primeira carga de dados (uma conta por vez para não estourar tempo):

```bash
curl -X POST "https://<seu-worker>/api/refresh?account=doin-motors&days=400"
# repita para ksc-advogados, prime-santos, vaz-galvao, ddlab-mkt-perf
```

> A rota `/api/refresh` fica atrás do Access — rode do navegador (DevTools → console:
> `fetch('/api/refresh?account=doin-motors&days=400',{method:'POST'}).then(r=>r.json())`)
> ou use a página **Configurações → Backfill**.

---

## 4. Cloudflare Access (a tela de login)

Ideal: um subdomínio próprio. Em **Cloudflare → Workers & Pages → seu Worker → Settings → Domains & Routes**,
adicione `ads.ddlab.com.br` (precisa da zona `ddlab.com.br` na Cloudflare). Fallback: use o `*.workers.dev`.

Em **Zero Trust → Access → Applications → Add an application → Self‑hosted**:

- **Application name**: DDLab Ads Intelligence
- **Session duration**: 24h
- **Application domain**: `ads.ddlab.com.br` (ou o hostname `*.workers.dev`)
- **Identity providers**: One‑time PIN (e/ou Google)
- **Policy**: `Allow` · Include → *Emails*: `dfassuncao@gmail.com` (+ outros) — ou *Emails ending in* `@ddlab.com.br`.

Depois de criar, copie:

- **Team domain**: `https://<seu-time>.cloudflareaccess.com` → só a parte `<seu-time>.cloudflareaccess.com`
- **Application Audience (AUD) Tag**: string longa

e configure no Worker:

```bash
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN   # ex.: ddlab.cloudflareaccess.com
npx wrangler secret put CF_ACCESS_AUD           # a AUD tag
```

(ou coloque em `[vars]` do `wrangler.toml` e `npm run deploy` — não são segredos sensíveis).

Teste: abrir a URL deve redirecionar para o login do Access. `curl` sem sessão deve dar 401/302.

---

## 5. Deploy automático no push

**Opção A (recomendada) — Workers Builds:**
Cloudflare → **Workers & Pages → seu Worker → Settings → Build → Connect** → escolha o repo GitHub e a branch `main`.
Build command: `npm run build` · Deploy command: `npx wrangler deploy`.

**Opção B — GitHub Actions:** já existe `.github/workflows/deploy.yml`.
Em GitHub → repo → Settings → Secrets and variables → Actions, adicione
`CLOUDFLARE_API_TOKEN` (permissão *Edit Cloudflare Workers* + *D1 Edit*) e `CLOUDFLARE_ACCOUNT_ID`.

---

## 6. Cron

O `wrangler.toml` já define `crons = ["0 9 * * *"]` (06:00 BRT). Confirme em
**Worker → Settings → Triggers → Cron Triggers** após o deploy. Ele roda janela curta (14 dias);
o histórico longo vem dos backfills manuais do passo 3.

---

## Verificação end‑to‑end

| Checagem | Como |
|---|---|
| Login | abrir a URL → tela do Access → entra |
| API viva | `GET /api/health` → `{ok:true}` |
| Contas | página carrega o seletor com as 5 contas |
| Dados | após o `/api/refresh`, **Visão geral** mostra KPIs; **Configurações → Atualização** sem erros |
| Colunas do BigQuery | algum fato com erro "Unrecognized name" → `GET /api/introspect?table=...` e ajustar `worker/etl/queries.ts` |
| Custo BigQuery | Console GCP → BigQuery → *Query history* → bytes processados por execução |
| CI | commit trivial → push → build dispara → nova versão |
