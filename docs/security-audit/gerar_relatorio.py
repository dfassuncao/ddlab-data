#!/usr/bin/env python3
"""Gera docs/security-audit/relatorio-auditoria-seguranca.pdf a partir dos achados
da auditoria de seguranca do repositorio ddlab-data.

Rodar com o venv criado para a auditoria:
  python3 -m venv /tmp/audit-venv && /tmp/audit-venv/bin/pip install reportlab matplotlib
  /tmp/audit-venv/bin/python docs/security-audit/gerar_relatorio.py
"""
import io
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    Image, NextPageTemplate, PageBreak, KeepTogether, HRFlowable, ListFlowable, ListItem
)
from reportlab.pdfgen import canvas as pdfcanvas

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_PDF = os.path.join(HERE, "relatorio-auditoria-seguranca.pdf")

SEV_COLORS = {
    "critica": colors.HexColor("#B91C1C"),
    "alta": colors.HexColor("#EA580C"),
    "media": colors.HexColor("#D97706"),
    "baixa": colors.HexColor("#2563EB"),
    "informativa": colors.HexColor("#64748B"),
    "ponto_forte": colors.HexColor("#059669"),
}
SEV_LABEL = {
    "critica": "CRÍTICA",
    "alta": "ALTA",
    "media": "MÉDIA",
    "baixa": "BAIXA",
    "informativa": "INFORMATIVA",
}
INK = colors.HexColor("#1E293B")
MUTED = colors.HexColor("#64748B")
BORDER = colors.HexColor("#E2E8F0")
BG_SOFT = colors.HexColor("#F8FAFC")
PROJECT_NAME = "ddlab-data"
REPORT_TITLE = f"Relatório de Auditoria de Segurança — {PROJECT_NAME}"
REPORT_DATE = "21 de outubro de 2026 (2ª rodada — atualização)"

# ---------------------------------------------------------------------------
# Dados da auditoria
# ---------------------------------------------------------------------------

FINDINGS = [
    {
        "id": "F1",
        "categoria": "Permissão / autorização",
        "severidade": "alta",
        "arquivo": (
            "worker/routes/reports.ts:753-803, worker/routes/adsActions.ts:60-261, "
            "worker/routes/analysis.ts:375-511, worker/index.ts:50-64"
        ),
        "titulo": "Ausência total de RBAC — qualquer usuário autenticado tem acesso irrestrito de leitura e escrita a todas as contas de clientes, incluindo mutações reais no Google Ads",
        "descricao": (
            "Não existe conceito de papel (admin/editor/leitor) nem de dono de conta em nenhuma "
            "camada do backend (confirmado: nenhuma ocorrência de role/isAdmin/canEdit em worker/ ou "
            "src/). accessMiddleware() só verifica \"é um e-mail permitido pela policy do Cloudflare "
            "Access\" (DEPLOY.md linha 91: `@ddlab.com.br` ou e-mails individuais) — a partir daí, o "
            "mesmo usuário pode ler dados de todas as contas, editar metas/orçamento/briefing "
            "(POST /api/settings/account), disparar ETL pago para qualquer conta (POST /api/refresh), "
            "gerar análises de IA pagas (POST /api/analysis, /api/diagnostico) e — desde a integração "
            "de escrita com o Google Ads (Fases 1 e 2) — propor E aprovar mutações reais em qualquer "
            "conta: negativar termos, pausar/reativar campanhas e palavras-chave "
            "(worker/routes/adsActions.ts). Não há checagem de posse — é tudo-ou-nada."
        ),
        "trecho": (
            "reports.post(\"/settings/account\", async (c) => {\n"
            "  const body = await c.req.json<{ id: string; ... }>();\n"
            "  if (!body.id) return c.json({ error: \"id obrigatório\" }, 400);\n"
            "  await c.env.DB.prepare(`UPDATE dim_account SET ... WHERE id = ?`)...\n"
            "  // nenhuma verificação de quem pode editar a conta `body.id`\n"
            "});\n\n"
            "adsActions.post(\"/ads-actions/:id/approve\", async (c) => {\n"
            "  // qualquer usuário autenticado aprova a mutação de QUALQUER conta\n"
            "  await addCampaignNegativeKeywords(c.env, payload.customerId, ...);\n"
            "});"
        ),
        "explorabilidade": (
            "Sempre explorável por qualquer conta liberada na policy do Cloudflare Access. Era um "
            "risco de exposição de dados/custo na 1ª rodada da auditoria; com a integração de escrita "
            "do Google Ads (commits #36-#38) o mesmo modelo tudo-ou-nada agora também cobre ações com "
            "efeito direto em campanhas reais de clientes (pausar campanha, negativar termo), o que "
            "amplia o dano possível de um acesso indevido ou de um colaborador despreparado. Ainda não "
            "documentado como decisão de produto deliberada em lugar nenhum do repositório."
        ),
        "impacto": (
            "Qualquer pessoa com acesso à ferramenta pode alterar configurações financeiras de "
            "qualquer cliente, pausar campanhas ou negativar termos na conta de Google Ads real de "
            "qualquer cliente, disparar custos reais (BigQuery, Anthropic, Google Ads API) em qualquer "
            "conta, e ver o briefing confidencial de todos os clientes da agência — não apenas dos que "
            "gerencia."
        ),
        "correcao": (
            "Definir explicitamente o modelo de autorização: se for intencional (equipe interna "
            "enxuta), documentar a decisão formalmente (ex.: no README/DEPLOY.md); se não, adicionar "
            "uma tabela de vínculo usuário↔conta (ou papel) e checar posse em cada endpoint de escrita "
            "— com prioridade para os endpoints de /ads-actions, que movem dinheiro de clientes de "
            "verdade."
        ),
    },
    {
        "id": "F2",
        "categoria": "Permissão / autorização",
        "severidade": "media",
        "arquivo": "worker/routes/adsActions.ts:197-245",
        "titulo": "Fluxo de aprovação de mutações no Google Ads não exige segregação entre quem propõe e quem aprova (sem maker-checker)",
        "descricao": (
            "POST /api/ads-actions/:id/approve só verifica se a ação ainda está `pending` — não "
            "compara `action.requested_by` com `c.get(\"user\").email`. O mesmo usuário que cria a "
            "proposta (negativar termo, pausar campanha/palavra-chave) pode aprová-la sozinho e "
            "disparar a mutação real no Google Ads (`addCampaignNegativeKeywords`/`setCampaignStatus`/"
            "`setKeywordStatus` em worker/googleAds.ts) sem qualquer segunda pessoa revisar. A fila de "
            "aprovação existe para dar visibilidade humana antes da mutação, mas nada no backend impede "
            "que essa revisão seja feita pela mesma pessoa que propôs."
        ),
        "trecho": (
            "adsActions.post(\"/ads-actions/:id/approve\", async (c) => {\n"
            "  const action = await loadPending(c.env, id);\n"
            "  if (action.status !== \"pending\") return c.json({ error: ... }, 400);\n"
            "  // sem comparar action.requested_by com c.get(\"user\").email\n"
            "  const reviewer = c.get(\"user\").email;\n"
            "  await c.env.DB.prepare(`UPDATE google_ads_actions SET status='approved', reviewed_by=? ...`)\n"
            "});"
        ),
        "explorabilidade": (
            "Sempre explorável por qualquer usuário autenticado — basta chamar propose-* e depois "
            "approve com a própria sessão. Mitigado em parte por F1 já afetar o mesmo grupo de "
            "usuários (equipe DDLab), mas é um controle de processo que a própria feature (uma fila de "
            "aprovação) sugere ter a intenção de prover e hoje não provê."
        ),
        "impacto": (
            "Erro humano ou ação indevida de um único colaborador pode pausar uma campanha ou "
            "negativar um termo relevante em produção, no Google Ads real do cliente, sem nenhuma "
            "segunda revisão — o que é justamente o cenário que a fila de aprovação foi desenhada para "
            "evitar."
        ),
        "correcao": (
            "Registrar `requested_by` e comparar com o usuário autenticado em /approve; se forem "
            "iguais, exigir uma segunda pessoa (retornar 403) ou, no mínimo, sinalizar claramente no "
            "frontend/log que a ação foi auto-aprovada, para decisão consciente da agência sobre se "
            "isso é aceitável."
        ),
    },
    {
        "id": "F3",
        "categoria": "Chaves/controles expostos ou inertes",
        "severidade": "alta",
        "arquivo": "worker/index.ts:50-64, .dev.vars.example:15-16",
        "titulo": "Endpoint POST /api/refresh dispara custo real (BigQuery) sem limite de taxa; a proteção REFRESH_TOKEN documentada nunca é verificada no código",
        "descricao": (
            ".dev.vars.example documenta REFRESH_TOKEN como \"Token simples para proteger POST "
            "/api/refresh quando chamado fora do Access\", e Env.REFRESH_TOKEN existe em worker/env.ts:19. "
            "Porém nenhum arquivo do worker lê ou compara REFRESH_TOKEN — o handler `app.post(\"/api/refresh\", "
            "...)` em worker/index.ts:50 dispara `runEtl()` (que consulta o BigQuery, custo real por bytes "
            "processados) sem checar esse token nem qualquer outro controle além do accessMiddleware() "
            "genérico, e sem rate limiting. Sem mudança desde a 1ª rodada da auditoria."
        ),
        "trecho": (
            'app.post("/api/refresh", async (c) => {\n'
            '  const account = c.req.query("account") || undefined;\n'
            '  // ... nenhuma verificação de c.env.REFRESH_TOKEN\n'
            '  c.executionCtx.waitUntil(runEtl(c.env, { accountIds: ..., lookbackDays: ..., facts }));\n'
            '  return c.json({ started: true, ... });\n'
            "});"
        ),
        "explorabilidade": (
            "Explorável por qualquer usuário autenticado: chamadas repetidas a /api/refresh?days=400 "
            "para todas as contas geram consultas pesadas e repetidas ao BigQuery (a doc do próprio "
            "README/DEPLOY recomenda backfill de 400 dias), inflando a fatura do GCP sem limite. O "
            "mesmo vale para `?facts=term_classification`/`keyword_volume`, que consomem quota da API "
            "do Google Ads e da API da Anthropic/Gemini/DeepSeek (o próprio README alerta sobre isso)."
        ),
        "impacto": "Consumo de custo (billing do GCP/BigQuery/Anthropic/Google Ads API) fora de controle, possível esgotamento de cota.",
        "correcao": (
            "Implementar de fato a checagem de REFRESH_TOKEN (ou removê-la da documentação se não for "
            "usada) e adicionar rate limiting/debounce por conta (ex.: recusar novo refresh se um já "
            "rodou nos últimos N minutos, usando meta_refresh.last_run_at)."
        ),
    },
    {
        "id": "F4",
        "categoria": "Superfície de informação",
        "severidade": "baixa",
        "arquivo": "worker/index.ts:23-39",
        "titulo": "GET /api/introspect expõe o schema interno do BigQuery (nomes de coluna/tabela) para qualquer usuário autenticado",
        "descricao": (
            "O endpoint de depuração /api/introspect roda `SELECT column_name, data_type FROM "
            "INFORMATION_SCHEMA.COLUMNS` para a tabela informada via querystring e devolve o schema. "
            "Está corretamente sob accessMiddleware() e o parâmetro `table` é validado por regex "
            "(`^[a-zA-Z0-9_]+$`) antes de entrar na query (sem SQL injection), mas é uma rota de "
            "debug interno deixada acessível em produção para qualquer usuário do Access, não só para "
            "quem ajusta o ETL. Sem mudança desde a 1ª rodada da auditoria."
        ),
        "trecho": (
            'app.get("/api/introspect", async (c) => {\n'
            '  const table = c.req.query("table");\n'
            '  if (!table || !/^[a-zA-Z0-9_]+$/.test(table)) return c.json({ error: "?table inválido" }, 400);\n'
            "  ...\n"
            "});"
        ),
        "explorabilidade": "Baixo risco — exige já estar autenticado via Access; vaza apenas nomes/tipos de coluna do dataset do BigQuery, não dados de linha.",
        "impacto": "Reconhecimento de schema interno por um usuário autenticado que não deveria ter esse nível de acesso operacional.",
        "correcao": "Mover para uma rota administrativa separada, ou gate-la atrás de uma flag de ambiente (só disponível em dev/staging).",
    },
]

STRENGTHS = [
    {
        "titulo": "RESOLVIDO desde a 1ª rodada — autenticação do Cloudflare Access não falha mais aberta quando a configuração está ausente",
        "evidencia": (
            "O achado crítico F1 da auditoria anterior (fail-open quando CF_ACCESS_TEAM_DOMAIN/AUD "
            "estavam vazios e commitados em [vars]) está corrigido: wrangler.toml não declara mais "
            "essas duas chaves em [vars] (comentário explícito nas linhas 32-40 do porquê), e "
            "worker/auth.ts:97-104 agora retorna 500 fail-closed sempre que `c.env.ENVIRONMENT === "
            "\"production\"` e as vars estiverem ausentes — o fallback `dev@localhost` só é possível "
            "fora de produção. DEPLOY.md documenta a decisão (linhas 111-151) e scripts/deploy.sh "
            "reaplica os dois secrets a cada deploy para evitar regressão."
        ),
    },
    {
        "titulo": "RESOLVIDO desde a 1ª rodada — exportação CSV neutraliza injeção de fórmula (CSV/Excel formula injection)",
        "evidencia": (
            "O achado F4 da auditoria anterior está corrigido: src/lib/csv.ts:1-6 agora tem um "
            "`csvField()` central que prefixa com apóstrofo qualquer valor iniciando com `=`, `+`, `-` "
            "ou `@` antes de montar a linha CSV, e tanto `downloadNegativesCsv` (ReportPage.tsx) quanto "
            "`exportCsv` (TermClassification.tsx) foram migrados para usar o `downloadCsv()` compartilhado "
            "— não há mais um caminho de exportação que monte a linha CSV manualmente."
        ),
    },
    {
        "titulo": "Todas as queries ao D1 usam parâmetros bind (?), sem concatenação de entrada do usuário em SQL",
        "evidencia": (
            "Verificado em worker/routes/reports.ts, analysis.ts, decision.ts, adsActions.ts e rules.ts "
            "— o helper `q(env, sql, binds)` sempre usa `.bind(...binds)`. Os únicos identificadores de "
            "tabela/coluna interpolados diretamente no SQL vêm de mapas estáticos no código "
            "(`KINDS` em reports.ts, `FACTS` em etl/queries.ts), nunca de query string ou body do "
            "usuário."
        ),
    },
    {
        "titulo": "Consultas ao BigQuery neutralizam identificadores controláveis pelo usuário antes de interpolar no SQL",
        "evidencia": (
            "worker/etl/ga4.ts:5,90-92 valida `ga4_dataset` e cada item de `ga4_key_events` (campos "
            "editáveis em Configurações) com o regex `^[a-zA-Z0-9_]+$` (safeIdent) antes de usá-los na "
            "montagem da query GA4; mesmo padrão em worker/etl/gsc.ts:5,59 para `gsc_dataset`. "
            "`customer_id` é passado como parâmetro nomeado do BigQuery, não concatenado."
        ),
    },
    {
        "titulo": "Segredos reais nunca foram commitados no repositório (confirmado novamente nesta rodada)",
        "evidencia": (
            ".gitignore exclui .dev.vars, service-account*.json, *.key.json e o padrão específico do "
            "arquivo baixado do GCP (studio-*-*.json, *-de430-*.json). `git log --all -p | grep -i "
            "\"PRIVATE KEY|AIzaSy|sk-ant|GCP_SA_KEY=\"` não retornou nenhuma chave privada, API key ou "
            "token real em nenhum commit do histórico — apenas o placeholder \"...\" em "
            ".dev.vars.example. Segredos (GCP_SA_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, "
            "DEEPSEEK_API_KEY, GOOGLE_ADS_*, CF_ACCESS_*) são todos aplicados via `wrangler secret "
            "put`, fora do controle de versão — nenhum deles aparece em wrangler.toml [vars]."
        ),
    },
    {
        "titulo": "Verificação de JWT do Cloudflare Access implementada corretamente quando configurada",
        "evidencia": (
            "worker/auth.ts:60-87 valida assinatura RS256 contra o JWKS público do Access "
            "(cache de 1h), expiração (`exp`) e audience (`aud`, aceitando array ou string) antes de "
            "aceitar o token — nenhuma dessas checagens é pulada quando as vars estão presentes."
        ),
    },
    {
        "titulo": "Nenhum XSS de HTML bruto no frontend: conteúdo Markdown gerado por IA é renderizado com sanitização por padrão",
        "evidencia": (
            "src/pages/AiAnalysis.tsx usa `<ReactMarkdown remarkPlugins={[remarkGfm]}>` sem o plugin "
            "`rehype-raw` — por padrão o react-markdown NÃO renderiza tags HTML embutidas no texto, "
            "apenas Markdown. Busca em todo `src/` por `dangerouslySetInnerHTML`/`innerHTML`/`eval`/"
            "`new Function` não encontrou nenhum ponto de renderização de HTML não confiável."
        ),
    },
    {
        "titulo": "Integração de escrita com o Google Ads valida entrada com whitelist antes de montar a mutação, e o payload da mutação é gerado no servidor, não recebido do cliente",
        "evidencia": (
            "worker/routes/adsActions.ts valida `matchType` contra [\"BROAD\",\"PHRASE\",\"EXACT\"] e "
            "`status` contra PAUSED/ENABLED antes de persistir a proposta; o `customerId` usado na "
            "mutação vem de `getAccount()` (nunca do body da requisição), e o payload gravado em "
            "`google_ads_actions` no momento do /propose-* é o mesmo lido e enviado no /approve — o "
            "cliente não pode alterar o alvo da mutação entre propor e aprovar."
        ),
    },
    {
        "titulo": "Geração de JWT para a service account do GCP e chamadas OAuth2 do Google Ads usam Web Crypto nativa, sem expor chave/token em logs",
        "evidencia": (
            "worker/bq.ts:30-78 assina o JWT com `crypto.subtle.sign` e cacheia apenas o access "
            "token (não a chave privada) em memória do isolate, com expiração controlada; "
            "worker/googleAds.ts:9-30 segue o mesmo padrão de cache de token para o OAuth2 do Google Ads."
        ),
    },
]

RECOMMENDATIONS = [
    ("P1", "Implementar de fato a checagem de REFRESH_TOKEN e/ou rate limiting em POST /api/refresh (F3) — agora cobre também quota de Google Ads API e Anthropic/Gemini/DeepSeek.", "alta"),
    ("P1", "Decidir e documentar o modelo de autorização (uso interno total-acesso vs. RBAC por conta) e, no mínimo, priorizar checagem de posse nos endpoints de /ads-actions, que movem dinheiro real de clientes (F1).", "alta"),
    ("P2", "Adicionar segregação entre quem propõe e quem aprova uma mutação no Google Ads, ou documentar que a auto-aprovação é aceita pela agência (F2).", "media"),
    ("P3", "Restringir /api/introspect a ambiente de desenvolvimento/staging (F4).", "baixa"),
    ("P3", "Adicionar teste automatizado que falhe o build/deploy se CF_ACCESS_TEAM_DOMAIN/AUD estiverem vazios em modo produção (consolidar a correção do antigo F1).", "informativa"),
]

ISSUES_MD = []  # preenchido abaixo


def build_issue(finding):
    sev = finding["severidade"]
    sev_label = SEV_LABEL.get(sev, sev)
    labels = f"security, severidade:{sev}"
    body = f"""[Segurança] {finding['titulo']}

**Labels sugeridas:** {labels}

## Descrição do problema
{finding['descricao']}

## Por que é explorável
{finding['explorabilidade']}

## Evidência
`{finding['arquivo']}`

```
{finding['trecho']}
```

## Impacto
{finding['impacto']}

## Sugestão de correção
{finding['correcao']}

## Critérios de aceite
- [ ] Comportamento corrigido conforme a sugestão de correção acima
- [ ] Cenário de exploração descrito não é mais reproduzível
- [ ] Teste (automatizado ou checklist manual) cobrindo a regressão adicionado
- [ ] Revisão de código por outra pessoa antes do merge
"""
    return f"[Segurança] {finding['titulo']}", body


# Agrupar F1 (RBAC) sozinho; F2 (maker-checker) sozinho; F3+F4 (controles de admin/debug) numa issue única de tema.
ISSUE_GROUPS = [
    ("issue-1", [FINDINGS[0]]),
    ("issue-2", [FINDINGS[1]]),
    ("issue-3", [FINDINGS[2], FINDINGS[3]]),  # refresh sem token + introspect exposto: mesmo tema (rotas administrativas/debug sem controle extra)
]


def build_grouped_issue(findings):
    if len(findings) == 1:
        return build_issue(findings[0])
    sevs = [f["severidade"] for f in findings]
    top_sev = "critica" if "critica" in sevs else ("alta" if "alta" in sevs else ("media" if "media" in sevs else "baixa"))
    title = "[Segurança] Rotas administrativas/de debug sem controles adicionais (refresh sem rate limit, introspect exposto)"
    labels = f"security, severidade:{top_sev}"
    parts = [f"[Segurança] Rotas administrativas/de debug sem controles adicionais\n\n**Labels sugeridas:** {labels}\n"]
    for f in findings:
        parts.append(f"""
---
### {f['titulo']} ({f['arquivo']})

**Descrição:** {f['descricao']}

**Por que é explorável:** {f['explorabilidade']}

**Evidência:**
```
{f['trecho']}
```

**Impacto:** {f['impacto']}

**Sugestão de correção:** {f['correcao']}
""")
    parts.append("""
## Critérios de aceite
- [ ] REFRESH_TOKEN validado em POST /api/refresh (ou removido da documentação se descontinuado)
- [ ] Rate limiting/debounce por conta implementado em POST /api/refresh
- [ ] /api/introspect restrito a ambiente não-produção
- [ ] Teste cobrindo a regressão adicionado
""")
    return title, "\n".join(parts)


for _id, fl in ISSUE_GROUPS:
    ISSUES_MD.append(build_grouped_issue(fl))

# ---------------------------------------------------------------------------
# Gráficos
# ---------------------------------------------------------------------------

def make_donut_chart():
    order = ["critica", "alta", "media", "baixa", "informativa"]
    counts = {s: 0 for s in order}
    for f in FINDINGS:
        counts[f["severidade"]] += 1
    labels, sizes, cols = [], [], []
    for s in order:
        if counts[s] > 0:
            labels.append(f"{SEV_LABEL[s]} ({counts[s]})")
            sizes.append(counts[s])
            cols.append(SEV_COLORS[s].hexval().replace("0x", "#"))

    fig, ax = plt.subplots(figsize=(4.6, 3.6), dpi=200)
    wedges, _ = ax.pie(
        sizes, colors=cols, startangle=90, counterclock=False,
        wedgeprops=dict(width=0.42, edgecolor="white", linewidth=2),
    )
    ax.text(0, 0.08, str(sum(sizes)), ha="center", va="center", fontsize=22, fontweight="bold", color="#1E293B")
    ax.text(0, -0.18, "achados", ha="center", va="center", fontsize=9, color="#64748B")
    ax.legend(wedges, labels, loc="center left", bbox_to_anchor=(1.0, 0.5), frameon=False, fontsize=9)
    ax.set_aspect("equal")
    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", transparent=True, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return buf


def make_bar_chart():
    cats = {}
    for f in FINDINGS:
        cats.setdefault(f["categoria"], []).append(f["severidade"])
    names = list(cats.keys())
    values = [len(v) for v in cats.values()]
    # cor da barra = severidade mais alta da categoria
    order = ["critica", "alta", "media", "baixa", "informativa"]
    bar_colors = []
    for v in cats.values():
        top = min(v, key=lambda s: order.index(s))
        bar_colors.append(SEV_COLORS[top].hexval().replace("0x", "#"))

    fig, ax = plt.subplots(figsize=(6.4, 3.6), dpi=200)
    y_pos = range(len(names))
    ax.barh(y_pos, values, color=bar_colors, height=0.55)
    ax.set_yticks(list(y_pos))
    wrapped = [n if len(n) < 28 else n[:26] + "…" for n in names]
    ax.set_yticklabels(wrapped, fontsize=9, color="#1E293B")
    ax.invert_yaxis()
    ax.set_xlabel("Achados", fontsize=9, color="#64748B")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_visible(False)
    ax.tick_params(axis="x", labelsize=8, colors="#64748B")
    ax.xaxis.set_major_locator(plt.MaxNLocator(integer=True))
    for i, v in enumerate(values):
        ax.text(v + 0.03, i, str(v), va="center", fontsize=9, color="#1E293B")
    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", transparent=True, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return buf


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------

styles = getSampleStyleSheet()
styles.add(ParagraphStyle("CoverTitle", fontName="Helvetica-Bold", fontSize=25, leading=30, textColor=INK, spaceAfter=6))
styles.add(ParagraphStyle("CoverSub", fontName="Helvetica", fontSize=12, leading=17, textColor=MUTED))
styles.add(ParagraphStyle("H1", fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=INK, spaceBefore=14, spaceAfter=8))
styles.add(ParagraphStyle("H2", fontName="Helvetica-Bold", fontSize=12.5, leading=16, textColor=INK, spaceBefore=10, spaceAfter=6))
styles.add(ParagraphStyle("Body", fontName="Helvetica", fontSize=9.5, leading=13.5, textColor=INK))
styles.add(ParagraphStyle("BodyMuted", fontName="Helvetica", fontSize=9, leading=13, textColor=MUTED))
styles.add(ParagraphStyle("Small", fontName="Helvetica", fontSize=8, leading=11, textColor=MUTED))
styles.add(ParagraphStyle("Mono", fontName="Courier", fontSize=7.6, leading=10.4, textColor=INK, backColor=BG_SOFT))
styles.add(ParagraphStyle("Cell", fontName="Helvetica", fontSize=8.3, leading=11.5, textColor=INK))
styles.add(ParagraphStyle("CellBold", fontName="Helvetica-Bold", fontSize=8.5, leading=11.5, textColor=INK))
styles.add(ParagraphStyle("IssueTitle", fontName="Helvetica-Bold", fontSize=11.5, leading=15, textColor=INK, spaceBefore=4, spaceAfter=4))
styles.add(ParagraphStyle("IssueMono", fontName="Courier", fontSize=7.4, leading=10, textColor=colors.HexColor("#E2E8F0"), backColor=colors.HexColor("#0F172A"), textTransform=None))

PAGE_W, PAGE_H = A4
MARGIN = 2 * cm


def chip(text, sev):
    bg = SEV_COLORS.get(sev, MUTED)
    t = Table([[text]], colWidths=[2.35 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.6)
    if doc.page > 1:
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(MARGIN, PAGE_H - 1.35 * cm, REPORT_TITLE)
        canvas.line(MARGIN, PAGE_H - 1.5 * cm, PAGE_W - MARGIN, PAGE_H - 1.5 * cm)
    canvas.line(MARGIN, 1.4 * cm, PAGE_W - MARGIN, 1.4 * cm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN, 1.05 * cm, "Relatório de Auditoria de Segurança · ddlab-data")
    canvas.drawRightString(PAGE_W - MARGIN, 1.05 * cm, f"Página {doc.page}")
    canvas.restoreState()


def cover_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#0F172A"))
    canvas.rect(0, PAGE_H - 7.5 * cm, PAGE_W, 7.5 * cm, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#059669"))
    canvas.rect(0, PAGE_H - 7.5 * cm, PAGE_W, 0.18 * cm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 24)
    canvas.drawString(MARGIN, PAGE_H - 3.6 * cm, "Relatório de Auditoria")
    canvas.drawString(MARGIN, PAGE_H - 4.4 * cm, "de Segurança")
    canvas.setFont("Helvetica", 13)
    canvas.setFillColor(colors.HexColor("#94A3B8"))
    canvas.drawString(MARGIN, PAGE_H - 5.5 * cm, PROJECT_NAME)
    canvas.setFont("Helvetica", 9)
    canvas.drawString(MARGIN, PAGE_H - 6.3 * cm, REPORT_DATE)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN, 1.05 * cm, "Relatório de Auditoria de Segurança · ddlab-data")
    canvas.drawRightString(PAGE_W - MARGIN, 1.05 * cm, "Página 1")
    canvas.restoreState()


doc = BaseDocTemplate(OUT_PDF, pagesize=A4,
                       leftMargin=MARGIN, rightMargin=MARGIN,
                       topMargin=2.0 * cm, bottomMargin=1.8 * cm,
                       title=REPORT_TITLE, author="Auditoria de Segurança")

frame_cover = Frame(MARGIN, 1.6 * cm, PAGE_W - 2 * MARGIN, PAGE_H - 8.2 * cm, id="cover")
frame_normal = Frame(MARGIN, 1.6 * cm, PAGE_W - 2 * MARGIN, PAGE_H - 3.3 * cm, id="normal")

doc.addPageTemplates([
    PageTemplate(id="Cover", frames=[frame_cover], onPage=cover_page),
    PageTemplate(id="Normal", frames=[frame_normal], onPage=header_footer),
])

story = []

# ---- CAPA (conteúdo abaixo do bloco escuro) ----
story.append(NextPageTemplate("Normal"))
story.append(Spacer(1, 8.6 * cm))
story.append(Paragraph("Escopo auditado", styles["H2"]))
story.append(Paragraph(
    "Repositório <b>dfassuncao/ddlab-data</b> (branch <font face='Courier'>main</font>, HEAD "
    "06d80a4): aplicação interna da agência DDLab para inteligência de campanhas Google Ads/GA4/"
    "Search Console — Cloudflare Worker (Hono) como backend/API, SPA React como frontend, Cloudflare "
    "D1 (SQLite) como banco pré-agregado, BigQuery como fonte de dados, Cloudflare Access como camada "
    "de login, e uma integração de escrita com a Google Ads API (negativar termos, pausar/reativar "
    "campanhas e palavras-chave, Fases 1 e 2, commits #36-#38) adicionada desde a 1ª rodada desta "
    "auditoria. Todos os arquivos de <font face='Courier'>worker/</font> (incluindo as rotas novas "
    "<font face='Courier'>routes/adsActions.ts</font> e <font face='Courier'>googleAds.ts</font>), "
    "<font face='Courier'>src/</font>, <font face='Courier'>shared/</font>, "
    "<font face='Courier'>migrations/</font> e arquivos de configuração/deploy (wrangler.toml, "
    "DEPLOY.md, .dev.vars.example, package.json, scripts/deploy.sh) foram revisados; o histórico "
    "completo do git foi varrido novamente em busca de segredos commitados. Esta é a <b>2ª rodada</b> "
    "da auditoria — os achados F1 e F4 da rodada anterior (fail-open de autenticação e injeção de "
    "fórmula em CSV) foram verificados como corrigidos e migraram para a seção de pontos fortes.",
    styles["Body"]))
story.append(Spacer(1, 8))
story.append(Paragraph("Nota metodológica — mapeamento das 5 categorias para esta stack", styles["H2"]))
story.append(Paragraph(
    "<b>1. Isolamento de inquilino/dono:</b> a aplicação é single-tenant por desenho (uma agência, "
    "múltiplas contas de clientes finais, sem conceito de usuário-por-cliente) — o mecanismo de "
    "\"tranca\" é o Cloudflare Access na borda mais a verificação de JWT em worker/auth.ts. Auditado como "
    "\"esse mecanismo pode falhar aberto?\" e \"há segmentação de dados por conta dentro do banco?\".<br/>"
    "<b>2. Permissão definida no navegador:</b> mapeado como \"o frontend esconde alguma ação atrás de "
    "papel/isAdmin e o backend replica essa checagem?\" — buscado em todo <font face='Courier'>src/</font> "
    "por lógica de papel/permissão.<br/>"
    "<b>3. IDOR:</b> todos os handlers de rota de <font face='Courier'>worker/routes/*.ts</font> e "
    "<font face='Courier'>worker/index.ts</font> foram percorridos individualmente, verificando se "
    "buscas/updates por <font face='Courier'>?account=</font> ou <font face='Courier'>id</font> no corpo "
    "confirmam posse.<br/>"
    "<b>4. Chaves expostas:</b> checado wrangler.toml, .dev.vars.example, package.json, migrations, "
    "seed/, DEPLOY.md/README.md e histórico do git (<font face='Courier'>git log --all -p</font>) por "
    "segredo real, e cada var não-secreta com default vazio por ausência de validação de startup.<br/>"
    "<b>5. Inputs sem tratamento (XSS):</b> mapeado para React "
    "(<font face='Courier'>dangerouslySetInnerHTML</font>, renderização de Markdown) no frontend, e para "
    "escaping em exportação CSV/templates no backend.",
    styles["Body"]))

story.append(PageBreak())

# ---- RESUMO EXECUTIVO ----
story.append(Paragraph("Resumo executivo", styles["H1"]))
sev_order = ["critica", "alta", "media", "baixa", "informativa"]
sev_counts = {s: 0 for s in sev_order}
for f in FINDINGS:
    sev_counts[f["severidade"]] += 1

summary_rows = [["Severidade", "Qtde"]]
for s in sev_order:
    if sev_counts[s]:
        summary_rows.append([SEV_LABEL[s], str(sev_counts[s])])
summary_tbl = Table(summary_rows, colWidths=[4 * cm, 2 * cm])
summary_tbl.setStyle(TableStyle([
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG_SOFT]),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
]))

donut_buf = make_donut_chart()
bar_buf = make_bar_chart()
donut_img = Image(donut_buf, width=8.6 * cm, height=6.7 * cm)
bar_img = Image(bar_buf, width=8.6 * cm, height=4.9 * cm)

charts_tbl = Table([[donut_img], [Paragraph("Achados por severidade", styles["Small"])],
                     [Spacer(1, 6)], [bar_img], [Paragraph("Achados por categoria", styles["Small"])]],
                    colWidths=[8.6 * cm])
charts_tbl.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))

top_row = Table([[summary_tbl, charts_tbl]], colWidths=[7.5 * cm, 9.5 * cm])
top_row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
story.append(top_row)

story.append(Spacer(1, 10))
story.append(Paragraph(
    f"A auditoria percorreu 100% dos handlers de rota do backend (worker/index.ts e worker/routes/*.ts, "
    f"incluindo a rota nova de ações no Google Ads), o middleware de autenticação, a camada de acesso a "
    f"dados (D1 e BigQuery), o ETL, a integração de escrita com a Google Ads API e os pontos de "
    f"renderização do frontend. Foram identificados <b>{len(FINDINGS)} achados</b> nesta rodada — "
    f"destaque para <b>F1 (alta)</b>: a ausência de RBAC agora também cobre mutações reais em contas de "
    f"clientes no Google Ads, não só leitura de dados. Os dois achados críticos/médios da rodada "
    f"anterior (autenticação fail-open e injeção de fórmula em CSV) foram verificados como corrigidos. "
    f"Como pontos fortes, o código continua evitando consistentemente SQL injection (D1 e BigQuery) e "
    f"XSS via HTML bruto, a nova integração de escrita valida entrada por whitelist, e nenhum segredo "
    f"real foi encontrado no histórico do git.",
    styles["Body"]))

story.append(PageBreak())

# ---- PONTOS FORTES / FRACOS ----
story.append(Paragraph("Pontos fortes", styles["H1"]))
story.append(Paragraph("O que já está protegido, com a evidência verificada no código.", styles["BodyMuted"]))
story.append(Spacer(1, 6))
for s in STRENGTHS:
    row = Table([[chip("PONTO FORTE", "ponto_forte"), Paragraph(f"<b>{s['titulo']}</b>", styles["Cell"])]],
                colWidths=[2.6 * cm, 13.4 * cm])
    row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 2)]))
    story.append(row)
    story.append(Paragraph(s["evidencia"], styles["Cell"]))
    story.append(Spacer(1, 8))

story.append(Spacer(1, 6))
story.append(Paragraph("Pontos fracos (riscos centrais)", styles["H1"]))
story.append(Paragraph(
    "O risco central é estrutural: não há segunda camada de autorização além do Cloudflare Access — "
    "todo usuário autenticado é, na prática, administrador de todas as contas de todos os clientes "
    "(F1), incluindo a capacidade de aprovar sozinho mutações reais no Google Ads que ele mesmo propôs "
    "(F2) e de gerar custo real em serviços pagos de terceiros sem controle adicional (F3). O mecanismo "
    "de autenticação em si (fail-open) e a exportação CSV (injeção de fórmula) — os dois riscos mais "
    "graves da rodada anterior — já foram corrigidos.",
    styles["Body"]))

story.append(PageBreak())

# ---- TABELA DE ACHADOS ----
story.append(Paragraph("Achados detalhados", styles["H1"]))
cat_order = []
for f in FINDINGS:
    if f["categoria"] not in cat_order:
        cat_order.append(f["categoria"])

for cat in cat_order:
    story.append(Paragraph(cat, styles["H2"]))
    rows = [[Paragraph("<b>Sev.</b>", styles["CellBold"]), Paragraph("<b>Arquivo:linha</b>", styles["CellBold"]),
             Paragraph("<b>Descrição</b>", styles["CellBold"])]]
    heights = [None]
    for f in FINDINGS:
        if f["categoria"] != cat:
            continue
        rows.append([
            chip(SEV_LABEL[f["severidade"]], f["severidade"]),
            Paragraph(f["arquivo"].replace(", ", "<br/>"), styles["Cell"]),
            Paragraph(f"<b>{f['titulo']}</b><br/>{f['descricao']}", styles["Cell"]),
        ])
    tbl = Table(rows, colWidths=[2.5 * cm, 4.3 * cm, 9.2 * cm], repeatRows=1)
    tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG_SOFT]),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 10))

story.append(PageBreak())

# ---- Achados: detalhe técnico (trecho + explorabilidade) ----
story.append(Paragraph("Evidência técnica por achado", styles["H1"]))
for f in FINDINGS:
    block = []
    block.append(Table([[chip(SEV_LABEL[f["severidade"]], f["severidade"]),
                          Paragraph(f"<b>{f['id']} · {f['titulo']}</b>", styles["CellBold"])]],
                        colWidths=[2.5 * cm, 13.5 * cm],
                        style=TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")])))
    block.append(Spacer(1, 3))
    block.append(Paragraph(f"<font face='Courier' size=8>{f['arquivo']}</font>", styles["BodyMuted"]))
    block.append(Spacer(1, 4))
    code_txt = f["trecho"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
    block.append(Paragraph(code_txt, styles["Mono"]))
    block.append(Spacer(1, 4))
    block.append(Paragraph(f"<b>Condições de explorabilidade:</b> {f['explorabilidade']}", styles["Cell"]))
    block.append(Spacer(1, 10))
    story.append(KeepTogether(block))

story.append(PageBreak())

# ---- RECOMENDAÇÕES ----
story.append(Paragraph("Recomendações priorizadas", styles["H1"]))
rec_rows = [[Paragraph("<b>Prio.</b>", styles["CellBold"]), Paragraph("<b>Recomendação</b>", styles["CellBold"]),
             Paragraph("<b>Sev.</b>", styles["CellBold"])]]
for prio, text, sev in RECOMMENDATIONS:
    rec_rows.append([Paragraph(f"<b>{prio}</b>", styles["Cell"]), Paragraph(text, styles["Cell"]), chip(SEV_LABEL[sev], sev)])
rec_tbl = Table(rec_rows, colWidths=[1.6 * cm, 11.9 * cm, 2.5 * cm], repeatRows=1)
rec_tbl.setStyle(TableStyle([
    ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
    ("TOPPADDING", (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG_SOFT]),
]))
story.append(rec_tbl)

story.append(PageBreak())

# ---- ISSUES PARA O GITHUB ----
story.append(Paragraph("Issues para o GitHub", styles["H1"]))
story.append(Paragraph(
    "Texto completo em Markdown, pronto para copiar e colar na criação de cada issue no repositório.",
    styles["BodyMuted"]))
story.append(Spacer(1, 8))

for i, (title, body) in enumerate(ISSUES_MD, start=1):
    block = []
    block.append(Paragraph(f"--- ISSUE {i} ---", styles["Small"]))
    block.append(Paragraph(title, styles["IssueTitle"]))
    esc = body.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
    block.append(Paragraph(esc, styles["IssueMono"]))
    block.append(Paragraph(f"--- FIM ISSUE {i} ---", styles["Small"]))
    block.append(Spacer(1, 14))
    story.append(KeepTogether(block[:2]))
    story.extend(block[2:])

doc.build(story)
print(f"PDF gerado em: {OUT_PDF}")
