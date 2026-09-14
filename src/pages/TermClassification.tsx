import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { usePage } from "../lib/usePage";
import { PageHeader, QueryState } from "../components/PageHeader";
import { DataTable, type Column } from "../components/DataTable";
import { brl, int, sumBy } from "../lib/format";

type ClassificationRow = {
  term: string;
  ads_clicks: number;
  ads_cost: number;
  gsc_clicks: number;
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

const COLUMNS: Column<ClassificationRow>[] = [
  { key: "term", header: "Termo", render: (r) => r.term },
  { key: "origem_dados", header: "Origem", render: (r) => r.origem_dados ?? "—" },
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
    key: "gsc_clicks",
    header: "Cliques (GSC)",
    align: "right",
    render: (r) => int(r.gsc_clicks),
    total: (rows) => int(sumBy(rows, "gsc_clicks")),
  },
  {
    key: "classificacao_principal",
    header: "Classificação principal",
    render: (r) => r.classificacao_principal ?? "—",
  },
  { key: "etiquetas", header: "Etiquetas", render: (r) => r.etiquetas ?? "—" },
  { key: "intencao_busca", header: "Intenção", render: (r) => r.intencao_busca ?? "—" },
  { key: "etapa_funil", header: "Etapa do funil", render: (r) => r.etapa_funil ?? "—" },
  { key: "temperatura", header: "Temperatura", render: (r) => r.temperatura ?? "—" },
  { key: "relevancia", header: "Relevância", render: (r) => r.relevancia ?? "—" },
  { key: "relacionamento_marca", header: "Relação c/ marca", render: (r) => r.relacionamento_marca ?? "—" },
  { key: "potencial_conversao", header: "Potencial conversão", render: (r) => r.potencial_conversao ?? "—" },
  { key: "cobertura_atual", header: "Cobertura atual", render: (r) => r.cobertura_atual ?? "—" },
  { key: "acao_recomendada", header: "Ação recomendada", render: (r) => r.acao_recomendada ?? "—" },
];

export function TermClassification() {
  const { accounts, account, f } = usePage();
  const [filtroClassificacao, setFiltroClassificacao] = useState("");
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
          </div>

          <DataTable
            rows={filtered}
            rowKey={(r) => r.term}
            initialSort={{ key: "ads_clicks", dir: "desc" }}
            columns={COLUMNS}
          />
        </>
      )}
    </div>
  );
}
