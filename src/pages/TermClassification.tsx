import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { usePage } from "../lib/usePage";
import { PageHeader, QueryState } from "../components/PageHeader";
import { DataTable, type Column } from "../components/DataTable";
import { brl, int, dec, sumBy } from "../lib/format";
import { downloadCsv } from "../lib/csv";

type ClassificationRow = {
  term: string;
  ads_clicks: number;
  ads_cost: number;
  ads_impressions: number;
  ads_conversions: number;
  gsc_clicks: number;
  gsc_impressions: number;
  gsc_position: number | null;
  classificacao_principal: string | null;
  etiquetas: string | null;
  intencao_busca: string | null;
  etapa_funil: string | null;
  temperatura: string | null;
  relevancia: string | null;
  adequacao_publico: string | null;
  localidade: string | null;
  relacionamento_marca: string | null;
  potencial_conversao: string | null;
  origem_dados: string | null;
  cobertura_atual: string | null;
  acao_recomendada: string | null;
  classified: boolean;
};

// Cor por origem do termo: só Ads = verde, só GSC = amarelo, as duas = azul.
const ORIGEM_ROW_BG: Record<string, string> = {
  "Google Ads": "bg-emerald-50",
  "Search Console": "bg-amber-50",
  "Google Ads e Search Console": "bg-blue-50",
};

const LEGENDA = [
  { cor: "bg-emerald-400", label: "Somente Google Ads", origem: "Google Ads" },
  { cor: "bg-amber-400", label: "Somente Search Console", origem: "Search Console" },
  { cor: "bg-blue-400", label: "Ambos", origem: "Google Ads e Search Console" },
];

// Origem calculada ao vivo a partir de impressões/cliques do período
// selecionado — não usa o campo origem_dados (congelado na janela fixa usada
// na classificação por IA), que diverge do período exibido e gerava
// cor/filtro inconsistentes. Considera impressões (não só cliques): um termo
// com impressões no GSC mas 0 cliques ainda tem dado real dessa fonte.
function origemAoVivo(r: ClassificationRow): string | null {
  const temAds = r.ads_impressions > 0 || r.ads_clicks > 0;
  const temGsc = r.gsc_impressions > 0 || r.gsc_clicks > 0;
  if (temAds && temGsc) return "Google Ads e Search Console";
  if (temAds) return "Google Ads";
  if (temGsc) return "Search Console";
  return null;
}

// Colunas de classificação com filtro dedicado (opções geradas a partir dos
// valores realmente presentes nos termos retornados, não de uma lista fixa).
const FILTER_FIELDS: { key: keyof ClassificationRow; label: string }[] = [
  { key: "classificacao_principal", label: "Classificação" },
  { key: "intencao_busca", label: "Intenção" },
  { key: "etapa_funil", label: "Etapa do funil" },
  { key: "temperatura", label: "Temperatura" },
  { key: "relevancia", label: "Relevância" },
  { key: "potencial_conversao", label: "Potencial conversão" },
  { key: "acao_recomendada", label: "Ação recomendada" },
];

const CSV_HEADER = [
  "Termo",
  "Impr. (Ads)",
  "Cliques (Ads)",
  "Custo (Ads)",
  "Conversões (Ads)",
  "Impr. (GSC)",
  "Cliques (GSC)",
  "Posição (GSC)",
  "Classificação principal",
  "Intenção",
  "Etapa do funil",
  "Temperatura",
  "Relevância",
  "Potencial conversão",
  "Ação recomendada",
  "Etiquetas",
];

function exportCsv(rows: ClassificationRow[], accountName: string) {
  const body = rows.map((r) => [
    r.term,
    r.ads_impressions,
    r.ads_clicks,
    r.ads_cost,
    r.ads_conversions,
    r.gsc_impressions,
    r.gsc_clicks,
    r.gsc_position ?? "",
    r.classificacao_principal ?? "",
    r.intencao_busca ?? "",
    r.etapa_funil ?? "",
    r.temperatura ?? "",
    r.relevancia ?? "",
    r.potencial_conversao ?? "",
    r.acao_recomendada ?? "",
    r.etiquetas ?? "",
  ]);
  const slug = accountName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  downloadCsv(`classificacao-termos-${slug}-${new Date().toISOString().slice(0, 10)}.csv`, CSV_HEADER, body);
}

const COLUMNS: Column<ClassificationRow>[] = [
  { key: "term", header: "Termo", className: "whitespace-nowrap", render: (r) => r.term },
  {
    key: "ads_impressions",
    header: "Impr. (Ads)",
    align: "right",
    render: (r) => int(r.ads_impressions),
    total: (rows) => int(sumBy(rows, "ads_impressions")),
  },
  {
    key: "ads_clicks",
    header: "Cliques (Ads)",
    align: "right",
    render: (r) => int(r.ads_clicks),
    total: (rows) => int(sumBy(rows, "ads_clicks")),
  },
  {
    key: "ads_cost",
    header: "Custo (Ads)",
    align: "right",
    render: (r) => brl(r.ads_cost),
    total: (rows) => brl(sumBy(rows, "ads_cost")),
  },
  {
    key: "ads_conversions",
    header: "Conversões (Ads)",
    align: "right",
    render: (r) => dec(r.ads_conversions, 1),
    total: (rows) => dec(sumBy(rows, "ads_conversions"), 1),
  },
  {
    key: "gsc_impressions",
    header: "Impr. (GSC)",
    align: "right",
    render: (r) => int(r.gsc_impressions),
    total: (rows) => int(sumBy(rows, "gsc_impressions")),
  },
  {
    key: "gsc_clicks",
    header: "Cliques (GSC)",
    align: "right",
    render: (r) => int(r.gsc_clicks),
    total: (rows) => int(sumBy(rows, "gsc_clicks")),
  },
  {
    key: "gsc_position",
    header: "Posição (GSC)",
    align: "right",
    render: (r) => (r.gsc_position == null ? "—" : dec(r.gsc_position, 1)),
    sortValue: (r) => r.gsc_position ?? Number.MAX_SAFE_INTEGER,
  },
  {
    key: "classificacao_principal",
    header: "Classificação principal",
    render: (r) => r.classificacao_principal ?? "—",
  },
  { key: "intencao_busca", header: "Intenção", render: (r) => r.intencao_busca ?? "—" },
  { key: "etapa_funil", header: "Etapa do funil", render: (r) => r.etapa_funil ?? "—" },
  { key: "temperatura", header: "Temperatura", render: (r) => r.temperatura ?? "—" },
  { key: "relevancia", header: "Relevância", render: (r) => r.relevancia ?? "—" },
  { key: "potencial_conversao", header: "Potencial conversão", render: (r) => r.potencial_conversao ?? "—" },
  { key: "acao_recomendada", header: "Ação recomendada", render: (r) => r.acao_recomendada ?? "—" },
  {
    key: "etiquetas",
    header: "Etiquetas",
    className: "whitespace-nowrap",
    render: (r) => r.etiquetas ?? "—",
  },
];

export function TermClassification() {
  const { accounts, account, f } = usePage();
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [filtroOrigem, setFiltroOrigem] = useState("");
  const [busca, setBusca] = useState("");
  const [propostos, setPropostos] = useState<Record<string, "ok" | string>>({});

  const propor = useMutation({
    mutationFn: (term: string) => api.proposeNegative({ account: f.account, term, from: f.from, to: f.to }),
    onSuccess: (_data, term) => setPropostos((s) => ({ ...s, [term]: "ok" })),
    onError: (err: Error, term) => setPropostos((s) => ({ ...s, [term]: err.message })),
  });

  const q = useQuery({
    queryKey: ["term-classification", f.account, f.from, f.to],
    queryFn: () => api.termClassification({ account: f.account, from: f.from, to: f.to }),
    enabled: !!account,
  });

  const rows: ClassificationRow[] = q.data?.rows ?? [];

  const optionsByField = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of FILTER_FIELDS) {
      map[f.key] = [...new Set(rows.map((r) => r[f.key]).filter(Boolean))].sort() as string[];
    }
    return map;
  }, [rows]);

  const filtrosAtivos = Object.values(filtros).filter(Boolean).length + (filtroOrigem ? 1 : 0);

  const filtered = rows.filter((r) => {
    for (const f of FILTER_FIELDS) {
      const v = filtros[f.key];
      if (v && r[f.key] !== v) return false;
    }
    if (filtroOrigem && origemAoVivo(r) !== filtroOrigem) return false;
    if (busca && !r.term.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });

  const semClassificacao = rows.filter((r) => !r.classified).length;

  const columnsComAcao: Column<ClassificationRow>[] = [
    ...COLUMNS,
    {
      key: "negativar_action",
      header: "Negativar",
      className: "whitespace-nowrap",
      render: (r) => {
        if (r.acao_recomendada !== "Negativar" || (r.ads_clicks <= 0 && r.ads_impressions <= 0)) return "—";
        const status = propostos[r.term];
        if (status === "ok") return <span className="text-xs text-emerald-600">Enviado p/ aprovação</span>;
        if (status) return <span className="text-xs text-rose-600" title={status}>Erro</span>;
        return (
          <button
            onClick={() => propor.mutate(r.term)}
            disabled={propor.isPending}
            className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs hover:bg-slate-50 disabled:opacity-50"
          >
            Propor negativação
          </button>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Classificação de termos"
        subtitle="Classificação por IA de cada termo de busca (Ads) e consulta orgânica (Search Console): marca, categoria, intenção, funil e ação recomendada."
        accounts={accounts}
        f={f}
      />

      <p className="text-xs text-slate-400">
        Gerado sob demanda — rode o refresh com <code>facts=term_classification</code> para
        classificar/atualizar os termos desta conta (consome a API da Anthropic).
      </p>

      <QueryState q={q} />

      {q.data && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar termo…"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            {FILTER_FIELDS.map((f) => (
              <select
                key={f.key}
                value={filtros[f.key] ?? ""}
                onChange={(e) => setFiltros((s) => ({ ...s, [f.key]: e.target.value }))}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="">{f.label} (todas)</option>
                {optionsByField[f.key]?.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            ))}
            {filtrosAtivos > 0 && (
              <button
                onClick={() => {
                  setFiltros({});
                  setFiltroOrigem("");
                }}
                className="text-xs text-slate-400 underline hover:text-slate-600"
              >
                Limpar filtros
              </button>
            )}
            <p className="text-xs text-slate-400">
              {filtered.length} de {rows.length} termos
              {semClassificacao > 0 ? ` · ${semClassificacao} ainda sem classificação` : ""}
            </p>
            <button
              onClick={() => exportCsv(filtered, account?.name ?? "conta")}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Exportar CSV
            </button>
            <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
              {LEGENDA.map((l) => (
                <button
                  key={l.label}
                  onClick={() => setFiltroOrigem((cur) => (cur === l.origem ? "" : l.origem))}
                  className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 ${
                    filtroOrigem === l.origem ? "bg-slate-100 font-medium text-slate-700" : "hover:bg-slate-50"
                  }`}
                  title={filtroOrigem === l.origem ? "Clique para remover o filtro" : `Filtrar por ${l.label}`}
                >
                  <span className={`h-2.5 w-2.5 rounded-sm ${l.cor}`} />
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <DataTable
            rows={filtered}
            rowKey={(r) => r.term}
            initialSort={{ key: "ads_clicks", dir: "desc" }}
            columns={columnsComAcao}
            stickyFirstColumn
            rowClassName={(r) => {
              const o = origemAoVivo(r);
              return o ? ORIGEM_ROW_BG[o] : undefined;
            }}
          />
        </>
      )}
    </div>
  );
}
