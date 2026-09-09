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
REPORT_DATE = "09 de setembro de 2026"

# ---------------------------------------------------------------------------
# Dados da auditoria
# ---------------------------------------------------------------------------

FINDINGS = [
    {
        "id": "F1",
        "categoria": "Isolamento / mecanismo de tranca",
        "severidade": "critica",
        "arquivo": "worker/auth.ts:88-94 (+ wrangler.toml:29-31)",
        "titulo": "Autenticação falha aberta (fail-open) quando CF_ACCESS_TEAM_DOMAIN/CF_ACCESS_AUD não estão configurados",
        "descricao": (
            "accessMiddleware() só valida o JWT do Cloudflare Access se as vars "
            "CF_ACCESS_TEAM_DOMAIN e CF_ACCESS_AUD estiverem preenchidas. Se qualquer uma "
            "estiver vazia — que é exatamente o valor commitado em wrangler.toml (linhas 30-31, "
            "CF_ACCESS_TEAM_DOMAIN = \"\" e CF_ACCESS_AUD = \"\") — a verificação é pulada "
            "inteiramente e o usuário vira { email: \"dev@localhost\" } com acesso total, "
            "sem exigir nenhuma credencial."
        ),
        "trecho": (
            'if (!CF_ACCESS_TEAM_DOMAIN || !CF_ACCESS_AUD) {\n'
            '  c.set("user", { email: "dev@localhost" });\n'
            '  return next();\n'
            '}'
        ),
        "explorabilidade": (
            "Condição de exploração: deploy feito antes do passo 4 do DEPLOY.md (criar a "
            "Cloudflare Access Application e rodar `wrangler secret put CF_ACCESS_TEAM_DOMAIN/AUD`), "
            "ou qualquer redeploy que rode `wrangler deploy` sem os secrets aplicados (os secrets não "
            "são reaplicados automaticamente e o `[vars]` do wrangler.toml sobrescreve com string vazia "
            "os nomes homônimos se alguém mover para vars por engano). Nesse cenário a aplicação inteira "
            "— dados de custo/receita/conversão de 5 contas de clientes reais, edição de metas e "
            "orçamento, criação de anotações e disparo de refresh pago — fica acessível sem login a "
            "qualquer pessoa na internet que descubra a URL do Worker."
        ),
        "impacto": (
            "Exposição total e não autenticada de dados de negócio de clientes da agência (Google Ads "
            "+ GA4: investimento, receita, conversões, briefing confidencial do cliente) e escrita "
            "irrestrita (alterar metas de CPA/orçamento, disparar ETL pago no BigQuery, gerar análises "
            "pagas via API da Anthropic)."
        ),
        "correcao": (
            "Tratar CF_ACCESS_TEAM_DOMAIN/AUD ausentes como erro de configuração em produção, não como "
            "bypass: checar `c.env.ENVIRONMENT` (ou similar) e só permitir o fallback dev@localhost fora "
            "de produção; em produção, retornar 500 (fail-closed) se as vars estiverem vazias. Adicionar "
            "validação de startup que rejeite o deploy/serve se essas vars estiverem vazias em ambiente "
            "não-dev."
        ),
    },
    {
        "id": "F2",
        "categoria": "Permissão / autorização",
        "severidade": "alta",
        "arquivo": (
            "worker/routes/reports.ts:438-491, worker/index.ts:41-53, "
            "worker/routes/analysis.ts:367-442"
        ),
        "titulo": "Ausência total de RBAC — qualquer usuário autenticado tem acesso irrestrito de leitura e escrita a todas as contas de clientes",
        "descricao": (
            "Não existe conceito de papel (admin/editor/leitor) nem de dono de conta em nenhuma "
            "camada do backend. accessMiddleware() só verifica \"é um e-mail permitido pela policy do "
            "Cloudflare Access\" — a partir daí, o mesmo usuário pode ler dados de TODAS as 5 contas "
            "(GET /api/report/*, /api/overview, /api/waste, /api/opportunities, /api/decision-center), "
            "editar metas/orçamento/briefing de qualquer conta (POST /api/settings/account), criar "
            "anotações em nome de qualquer conta (POST /api/annotations), disparar ETL pago para "
            "qualquer conta (POST /api/refresh) e gerar análises de IA pagas para qualquer conta "
            "(POST /api/analysis, POST /api/diagnostico). Não há checagem de posse — é tudo-ou-nada."
        ),
        "trecho": (
            "reports.post(\"/settings/account\", async (c) => {\n"
            "  const body = await c.req.json<{ id: string; ... }>();\n"
            "  if (!body.id) return c.json({ error: \"id obrigatório\" }, 400);\n"
            "  await c.env.DB.prepare(`UPDATE dim_account SET ... WHERE id = ?`)...\n"
            "  // nenhuma verificação de quem pode editar a conta `body.id`\n"
            "});"
        ),
        "explorabilidade": (
            "Sempre explorável por qualquer conta liberada na policy do Cloudflare Access (hoje: "
            "dfassuncao@gmail.com e/ou @ddlab.com.br, conforme DEPLOY.md). É um risco aceitável se o "
            "produto é deliberadamente \"ferramenta interna de agência, todo colaborador vê tudo\" — mas "
            "isso não está documentado como decisão de produto em lugar nenhum, e cresce de risco assim "
            "que a policy do Access for ampliada (ex.: incluir um cliente final, um estagiário, um "
            "freelancer pontual)."
        ),
        "impacto": (
            "Qualquer pessoa com acesso à ferramenta pode alterar configurações financeiras de qualquer "
            "cliente, disparar custos reais (BigQuery, Anthropic) em qualquer conta, e ver o briefing "
            "confidencial de todos os clientes da agência — não apenas dos que gerencia."
        ),
        "correcao": (
            "Definir explicitamente o modelo de autorização: se for intencional (equipe interna "
            "enxuta), documentar a decisão; se não, adicionar uma tabela de vínculo usuário↔conta (ou "
            "papel) e checar posse em cada endpoint de escrita antes de aplicar a mutação."
        ),
    },
    {
        "id": "F3",
        "categoria": "Chaves/controles expostos ou inertes",
        "severidade": "alta",
        "arquivo": "worker/index.ts:41-53, .dev.vars.example:15-16",
        "titulo": "Endpoint POST /api/refresh dispara custo real (BigQuery) sem limite de taxa; a proteção REFRESH_TOKEN documentada nunca é verificada no código",
        "descricao": (
            ".dev.vars.example documenta REFRESH_TOKEN como \"Token simples para proteger POST "
            "/api/refresh quando chamado fora do Access\", e Env.REFRESH_TOKEN existe em worker/env.ts:15. "
            "Porém nenhum arquivo do worker lê ou compara REFRESH_TOKEN — o handler `app.post(\"/api/refresh\", "
            "...)` em worker/index.ts:41 dispara `runEtl()` (que consulta o BigQuery, custo real por bytes "
            "processados) sem checar esse token nem qualquer outro controle além do accessMiddleware() "
            "genérico, e sem rate limiting."
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
            "Explorável por qualquer usuário autenticado (ou, combinado com F1, por qualquer visitante "
            "não autenticado): chamadas repetidas a /api/refresh?days=400 para as 5 contas geram "
            "consultas pesadas e repetidas ao BigQuery (a doc do próprio README/DEPLOY recomenda "
            "backfill de 400 dias), inflando a fatura do GCP sem limite."
        ),
        "impacto": "Consumo de custo (billing do GCP/BigQuery) fora de controle, possível esgotamento de cota.",
        "correcao": (
            "Implementar de fato a checagem de REFRESH_TOKEN (ou removê-la da documentação se não for "
            "usada) e adicionar rate limiting/debounce por conta (ex.: recusar novo refresh se um já "
            "rodou nos últimos N minutos, usando meta_refresh.last_run_at)."
        ),
    },
    {
        "id": "F4",
        "categoria": "Inputs sem tratamento",
        "severidade": "media",
        "arquivo": "src/pages/ReportPage.tsx:52-68",
        "titulo": "Exportação CSV de negativas não neutraliza injeção de fórmula (CSV/Excel formula injection)",
        "descricao": (
            "downloadNegativesCsv() escapa aspas duplas nos campos `label` (termo de busca) e "
            "`campaign`, mas não verifica se o valor começa com `=`, `+`, `-` ou `@` — caracteres que o "
            "Excel/Google Sheets interpretam como início de fórmula. `label` nesse relatório vem de "
            "`search_term` do Google Ads (fact_searchterm_daily), que por sua vez reflete termos de "
            "busca reais digitados por usuários — um dado de origem externa que a agência não controla "
            "totalmente."
        ),
        "trecho": (
            "const term = String(r.label ?? \"\").replace(/\"/g, '\"\"');\n"
            "const camp = String(r.campaign ?? \"\").replace(/\"/g, '\"\"');\n"
            "return `\"${camp}\",\"${term}\",Phrase,Campaign`;"
        ),
        "explorabilidade": (
            "Exige que (a) um termo de busca real acionando os anúncios do cliente contenha uma "
            "fórmula válida de planilha logo no início do texto — algo incomum mas não impossível de "
            "ser induzido por um agente malicioso pesquisando termos elaborados —, e (b) o operador da "
            "DDLab abra o CSV exportado no Excel/Sheets com fórmulas habilitadas. Severidade limitada "
            "pela baixa probabilidade de ambas condições, mas o padrão de exportação deveria ser seguro "
            "por padrão."
        ),
        "impacto": "Execução de fórmula/DDE ao abrir o CSV no Excel, potencialmente levando a exfiltração de dados locais ou execução de comando (dependendo da configuração do Excel do operador).",
        "correcao": (
            "Prefixar com um apóstrofo (ou aspas simples neutralizando) qualquer campo que comece com "
            "`=`, `+`, `-` ou `@` antes de montar a linha CSV, tanto para `label` quanto `campaign`."
        ),
    },
    {
        "id": "F5",
        "categoria": "Superfície de informação",
        "severidade": "baixa",
        "arquivo": "worker/index.ts:23-38",
        "titulo": "GET /api/introspect expõe o schema interno do BigQuery (nomes de coluna/tabela) para qualquer usuário autenticado",
        "descricao": (
            "O endpoint de depuração /api/introspect roda `SELECT column_name, data_type FROM "
            "INFORMATION_SCHEMA.COLUMNS` para a tabela informada via querystring e devolve o schema. "
            "Está corretamente sob accessMiddleware() e o parâmetro `table` é validado por regex "
            "(`^[a-zA-Z0-9_]+$`) antes de entrar na query (sem SQL injection), mas é uma rota de "
            "debug interno deixada acessível em produção para qualquer usuário do Access, não só para "
            "quem ajusta o ETL."
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
        "titulo": "Todas as queries ao D1 usam parâmetros bind (?), sem concatenação de entrada do usuário em SQL",
        "evidencia": (
            "Verificado em worker/routes/reports.ts, analysis.ts, decision.ts e rules.ts — o helper "
            "`q(env, sql, binds)` sempre usa `.bind(...binds)`. Os únicos identificadores de "
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
            "montagem da query GA4; `customer_id` é passado como parâmetro nomeado `@customer_id` do "
            "BigQuery (worker/etl/run.ts:60-63), não concatenado."
        ),
    },
    {
        "titulo": "Segredos reais nunca foram commitados no repositório",
        "evidencia": (
            ".gitignore exclui .dev.vars, service-account*.json, *.key.json e o padrão específico do "
            "arquivo baixado do GCP (studio-*-*.json). `git log --all -p` não retornou nenhuma chave "
            "privada, API key ou token real — apenas o placeholder \"...\" em .dev.vars.example. "
            "Segredos (GCP_SA_KEY, ANTHROPIC_API_KEY, CF_ACCESS_*) são aplicados via `wrangler secret "
            "put`, fora do controle de versão."
        ),
    },
    {
        "titulo": "Verificação de JWT do Cloudflare Access implementada corretamente quando configurada",
        "evidencia": (
            "worker/auth.ts:58-86 valida assinatura RS256 contra o JWKS público do Access "
            "(cache de 1h), expiração (`exp`) e audience (`aud`, aceitando array ou string) antes de "
            "aceitar o token — nenhuma dessas checagens é pulada quando as vars estão presentes."
        ),
    },
    {
        "titulo": "Nenhum XSS de HTML bruto no frontend: conteúdo Markdown gerado por IA é renderizado com sanitização por padrão",
        "evidencia": (
            "src/pages/AiAnalysis.tsx usa `<ReactMarkdown remarkPlugins={[remarkGfm]}>` sem o plugin "
            "`rehype-raw` — por padrão o react-markdown NÃO renderiza tags HTML embutidas no texto, "
            "apenas Markdown. Busca em todo `src/` por `dangerouslySetInnerHTML`/`innerHTML` não "
            "encontrou nenhum outro ponto de renderização de HTML não confiável."
        ),
    },
    {
        "titulo": "Geração de JWT para a service account do GCP usa Web Crypto nativa, sem expor a chave privada em logs",
        "evidencia": (
            "worker/bq.ts:30-78 assina o JWT com `crypto.subtle.sign` e cacheia apenas o access "
            "token (não a chave privada) em memória do isolate, com expiração controlada."
        ),
    },
]

RECOMMENDATIONS = [
    ("P1", "Corrigir o fail-open de autenticação (F1): produção nunca deve rodar sem CF_ACCESS_TEAM_DOMAIN/AUD válidos.", "critica"),
    ("P1", "Implementar de fato a checagem de REFRESH_TOKEN e/ou rate limiting em POST /api/refresh (F3).", "alta"),
    ("P2", "Decidir e documentar o modelo de autorização (uso interno total-acesso vs. RBAC por conta) e implementar checagem de posse se não for total-acesso deliberado (F2).", "alta"),
    ("P2", "Neutralizar injeção de fórmula na exportação CSV de negativas (F4).", "media"),
    ("P3", "Restringir /api/introspect a ambiente de desenvolvimento/staging (F5).", "baixa"),
    ("P3", "Adicionar teste automatizado que falhe o build/deploy se CF_ACCESS_TEAM_DOMAIN/AUD estiverem vazios em modo produção.", "informativa"),
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


# Agrupar F1 (fail-open) sozinho por criticidade; agrupar F3+F5 (controles de admin/debug) numa issue única de tema.
ISSUE_GROUPS = [
    ("issue-1", [FINDINGS[0]]),
    ("issue-2", [FINDINGS[1]]),
    ("issue-3", [FINDINGS[2], FINDINGS[4]]),  # refresh sem token + introspect exposto: mesmo tema (rotas administrativas/debug sem controle extra)
    ("issue-4", [FINDINGS[3]]),
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
    "Repositório <b>dfassuncao/ddlab-data</b> (branch de trabalho "
    "<font face='Courier'>claude/ddlab-security-analysis-ter837</font>): aplicação interna da agência "
    "DDLab para inteligência de campanhas Google Ads/GA4 — Cloudflare Worker (Hono) como backend/API, "
    "SPA React como frontend, Cloudflare D1 (SQLite) como banco pré-agregado, BigQuery como fonte de "
    "dados e Cloudflare Access como camada de login. Todos os arquivos de <font face='Courier'>worker/</font>, "
    "<font face='Courier'>src/</font>, <font face='Courier'>shared/</font>, <font face='Courier'>migrations/</font> "
    "e arquivos de configuração/deploy (wrangler.toml, DEPLOY.md, .dev.vars.example, package.json) foram "
    "revisados; o histórico completo do git foi varrido em busca de segredos commitados.",
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
    f"A auditoria percorreu 100% dos handlers de rota do backend (worker/index.ts e worker/routes/*.ts), "
    f"o middleware de autenticação, a camada de acesso a dados (D1 e BigQuery), o ETL e os pontos de "
    f"renderização do frontend. Foram identificados <b>{len(FINDINGS)} achados</b> — destaque para "
    f"<b>F1 (crítico)</b>: a autenticação do Cloudflare Access falha aberta quando as variáveis de "
    f"configuração não estão presentes, e esse é justamente o valor commitado por padrão no repositório. "
    f"Como pontos fortes, o código evita consistentemente SQL injection (D1 e BigQuery) e XSS via HTML "
    f"bruto, e nenhum segredo real foi encontrado no histórico do git.",
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
    "O risco central é estrutural: o mecanismo único de \"tranca\" (Cloudflare Access) pode falhar aberto "
    "por configuração ausente (F1), e, mesmo quando ligado, não há segunda camada de autorização — todo "
    "usuário autenticado é, na prática, administrador de todas as contas de todos os clientes (F2), "
    "incluindo a capacidade de gerar custo real em serviços pagos de terceiros sem controle adicional (F3).",
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
