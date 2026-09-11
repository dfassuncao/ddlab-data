# Deploy — passo a passo

Ordem: **GCP service account → GitHub → Cloudflare (D1 + secrets + deploy) → Cloudflare Access → CI**.

---

## 1. Service account do GCP (leitura do BigQuery)

No Console GCP, projeto `studio-7861914720-de430`:

1. **IAM e Admin → Contas de serviço → Criar**.
   - Nome: `ddlab-data-bq`
   - Papéis: **BigQuery Data Viewer** e **BigQuery Job User**.
2. Aba **Chaves → Adicionar chave → JSON**. Baixa o arquivo `xxx.json`.
3. Guarde o conteúdo — vira o secret `GCP_SA_KEY` (JSON inteiro em uma linha).

> A conta de serviço só lê. Não precisa de acesso ao Google Ads (o transfer já joga tudo no BigQuery).

---

## 2. GitHub

O repositório já está iniciado (branch `main`, commits feitos). Crie um repo **privado**
vazio em github.com chamado `ddlab-data` (sem README), depois, na pasta do projeto
(`01 - WEBSITES/DDLab Report`):

```bash
git remote add origin https://github.com/SEU-USUARIO/ddlab-data.git
```

```bash
git push -u origin main
```

---

## 3. Cloudflare — D1, secrets e primeiro deploy

```bash
npm install
npx wrangler login

# cria o banco e mostra um database_id
npx wrangler d1 create ddlab-data
```

Cole o `database_id` retornado em `wrangler.toml` (campo `database_id`).

```bash
# schema + contas
npm run db:migrate
npm run db:seed

# secret da service account (cole o JSON inteiro quando pedir)
npx wrangler secret put GCP_SA_KEY

# opcional: chave da Anthropic para a página "Análise IA" (console.anthropic.com/settings/keys —
# conta própria com billing, chamada de API paga e separada da assinatura do Claude Code)
npx wrangler secret put ANTHROPIC_API_KEY

# build do frontend + deploy do Worker
npm run deploy
```

Isso publica em `https://ddlab-data.<seu-subdominio>.workers.dev`.

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

e configure no Worker como **secret** (nunca em `[vars]` — são credenciais que, mal
configuradas, derrubam a proteção; ver caixa de segurança abaixo):

```bash
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN   # ex.: ddlab.cloudflareaccess.com
npx wrangler secret put CF_ACCESS_AUD           # a AUD tag
```

> **Se o `wrangler secret put` der erro "the latest version of your Worker isn't
> currently deployed"**: rode `npx wrangler deploy` uma vez para publicar a versão
> atual por completo e tente de novo.
>
> ### ⚠️ Isso NÃO sobrevive sozinho a um deploy pelo Workers Builds
> Descobrimos (do jeito difícil, em produção) que um secret adicionado por
> `wrangler secret put` ou pelo dashboard (Settings → Runtime → Variables and
> Secrets) **some depois do próximo deploy automático** disparado por um push
> em `main` — o Workers Builds roda cada build numa máquina limpa e o
> `wrangler deploy` daquele pipeline não carrega esse estado. Resultado: a API
> falha fechada (500, ver caixa abaixo) até alguém notar e reconfigurar
> manualmente — e aí o próximo deploy derruba de novo.
>
> A correção (já aplicada no repo) é **reaplicar os dois secrets a cada
> deploy**, via `scripts/deploy.sh` (chamado por `npm run deploy`). Pra isso
> funcionar também nos deploys automáticos do Workers Builds, configure UMA
> VEZ:
>
> 1. Cloudflare → **Workers & Pages → ddlab-data → Settings → Builds**
> 2. Em **Variables and Secrets** (a seção de build, não a de Runtime),
>    adicionar `CF_ACCESS_TEAM_DOMAIN` e `CF_ACCESS_AUD` como **Secret** —
>    essas ficam disponíveis como variável de ambiente durante o build/deploy
> 3. Em **Build configuration**, trocar o **Deploy command** de
>    `npx wrangler deploy` para `bash scripts/deploy.sh`
>
> A partir daí, todo deploy (manual ou automático) roda `wrangler deploy` e
> em seguida reaplica os dois secrets lendo dessas variáveis — não depende
> mais de ninguém lembrar de rodar `wrangler secret put` depois.

Teste: abrir a URL deve redirecionar para o login do Access. Recarregue a página
logado e confira que o rodapé do menu mostra seu e‑mail real — se mostrar
`dev@localhost`, o Access não está configurado de verdade (ver caixa de
segurança abaixo).

> ### ⚠️ Por que isso é crítico
> `worker/auth.ts` só pula a verificação do JWT do Access quando
> `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` estão vazios **e** a var `ENVIRONMENT`
> (já setada como `"production"` em `wrangler.toml`) não é `"production"`. Ou
> seja: em produção, se essas duas secrets sumirem ou nunca forem configuradas, a
> API responde 500 em vez de abrir sem login — isso é intencional (fail‑closed),
> não um bug. Se você ver a mensagem de erro *"Access não configurado ...
> bloqueado por segurança"*, é exatamente essa checagem funcionando; a correção é
> configurar as secrets certas, nunca remover/relaxar a checagem no código.

---

## 5. Deploy automático no push

**Já configurado: Workers Builds.**
Cloudflare → **Workers & Pages → ddlab-data → Settings → Build** está conectado ao repo
`dfassuncao/ddlab-data`, branch `main`. Todo push em `main` dispara um build.
Build command: `npm run build` · **Deploy command: `bash scripts/deploy.sh`**
(não `npx wrangler deploy` puro — ver a caixa de segurança do passo 4 sobre
por que isso reaplica os secrets do Access a cada deploy).

Não existe workflow de GitHub Actions para deploy (removido de propósito, para não
duplicar/disputar com o Workers Builds). Se precisar rodar migrations do D1 em CI,
faça isso à parte com `wrangler d1 migrations apply ddlab-data --remote` — o
Workers Builds só cuida do deploy do Worker, não do banco.

> **Nunca rode `npx wrangler deploy` sozinho na máquina local.** Ele publica o
> Worker mas NÃO reconstrói o frontend antes (sobe o `dist/client` que já
> estiver no seu disco, possivelmente desatualizado) e NÃO reaplica os secrets
> do Access. Use sempre `npm run deploy` (que roda `npm run build && bash
> scripts/deploy.sh`) se precisar publicar manualmente; o normal é nem
> precisar disso, já que todo push em `main` dispara o Workers Builds sozinho.

---

## 5.1. GA4 e Search Console (opcionais, por conta)

Ambos usam o **bulk export nativo pro BigQuery** (não a API paga) — configurado
direto na propriedade do GA4 / no Search Console, sem custo extra de quota.

**GA4**: em Admin da propriedade → Integrações do BigQuery → Link, escolher o
projeto `studio-7861914720-de430`. Cria um dataset `analytics_<id_da_propriedade>`.
Leva algumas horas para os primeiros dados chegarem.

**Search Console**: em Configurações da propriedade → Exportações em massa →
Criar exportação, escolher o mesmo projeto GCP. Cria um dataset
`searchconsole_<algum-nome>` (você escolhe o nome). **Leva até 48h** para os
dados começarem a aparecer — e mesmo depois de "maduro", o GSC tem uma
defasagem natural de ~2-3 dias entre a data real e a data disponível no export
(normal, não é erro).

Depois que o dataset aparecer no BigQuery (confira em **BigQuery Studio** do
projeto — o dataset só terá uma tabela `temp_*` até os dados reais chegarem, aí
viram `searchdata_site_impression`/`searchdata_url_impression` pro GSC, ou
`events_*` pro GA4):

1. Preencher o dataset em **Configurações** do app, no campo `ga4_dataset` ou
   `Search Console — dataset` da conta correspondente
2. Rodar o refresh (pelo DevTools, ver README) com `facts=ga4` ou `facts=gsc`
3. Conferir em **Saúde dos dados** que a fonte aparece como "OK"

Se uma conta trouxer schema diferente do esperado (nomes de coluna do GSC
mudam raramente, mas acontece), o fato aparece com erro em **Saúde dos dados**
e o ETL segue normalmente para as outras fontes/contas — ajuste em
`worker/etl/ga4.ts`/`worker/etl/gsc.ts`.

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
| Access de verdade configurado | logado, rodapé do menu mostra seu e‑mail real — **nunca** `dev@localhost` em produção |
| API viva | `GET /api/health` → `{ok:true}` |
| Contas | página carrega o seletor com as 5 contas |
| Dados (Ads) | após o `/api/refresh`, **Visão geral** mostra KPIs; **Saúde dos dados** sem erro em "Google Ads" |
| Dados (GA4/GSC) | se configurados, **Saúde dos dados** mostra "OK" (não "Não conectado"/"Atrasado" além do esperado) |
| Colunas do BigQuery | algum fato com erro "Unrecognized name" → `GET /api/introspect?table=...` e ajustar `worker/etl/*.ts` |
| Custo BigQuery | Console GCP → BigQuery → *Query history* → bytes processados por execução |
| CI | commit trivial → push → build dispara → nova versão (confira em Deployments) |
| Frontend em dia | se uma tela nova não aparecer após um deploy manual, você provavelmente rodou `wrangler deploy` sem `npm run build` antes — ver aviso na seção 5 |
