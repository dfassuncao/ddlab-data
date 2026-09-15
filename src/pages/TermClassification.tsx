import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

// Origem calculada ao vivo a partir dos cliques do período selecionado — não
// usa o campo origem_dados (congelado na janela fixa usada na classificação
// por IA), que diverge do período exibido e gerava cor/filtro inconsistentes.
function origemAoVivo(r: ClassificationRow): string | null {
  const temAds = r.ads_clicks > 0;
  const temGsc = r.gsc_clicks > 0;
  if (temAds && temGsc) return "Google Ads e Search Console";
  if (temAds) return "Google Ads";
  if (temGsc) return "Search Console";
  return null;
}

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
  const [filtroClassificacao, setFiltroClassificacao] = useState("");
  const [filtroOrigem, setFiltroOrigem] = useState("");
  const [busca, setBusca] = useState("");

  const q = useQuery({
    queryKey: ["term-classification", f.account, f.from, f.to],
    queryFn: () => api.termClassification({ account: f.account, from: f.from, to: f.to }),
    enabled: !!account,
  });

  const rows: ClassificationRow[] = q.data?.rows ?? [];

  const classificacoes = useMemo(
    () =>
      [...new Set(rows.map((r) => r.classificacao_principal).filter(Boolean))].sort() as string[],
    [rows],
  );

  const filtered = rows.filter((r) => {
    if (filtroClassificacao && r.classificacao_principal !== filtroClassificacao) return false;
    if (filtroOrigem && origemAoVivo(r) !== filtroOrigem) return false;
    if (busca && !r.term.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });

  const semClassificacao = rows.filter((r) => !r.classified).length;

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
            <select
              value={filtroClassificacao}
              onChange={(e) => setFiltroClassificacao(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="">Todas as classificações</option>
              {classificacoes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
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
            columns={COLUMNS}
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
