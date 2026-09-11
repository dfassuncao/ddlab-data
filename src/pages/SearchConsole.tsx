import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { usePage } from "../lib/usePage";
import { PageHeader, QueryState } from "../components/PageHeader";
import { DataTable, type Column } from "../components/DataTable";
import { brl, int, pct, dec } from "../lib/format";

type GscRow = { label: string; clicks: number; impressions: number; ctr: number; position: number | null };

type CruzamentoRow = {
  label: string;
  ads_impressions: number;
  ads_clicks: number;
  ads_ctr: number | null;
  ads_cost: number;
  ads_conversions: number;
  gsc_impressions: number;
  gsc_clicks: number;
  gsc_ctr: number | null;
  gsc_position: number | null;
  volume_busca: number | null;
};

type Tab = "queries" | "pages" | "cruzamento";

const TABS: { kind: Tab; label: string }[] = [
  { kind: "queries", label: "Consultas" },
  { kind: "pages", label: "Páginas" },
  { kind: "cruzamento", label: "Cruzamento com Ads" },
];

const GSC_COLUMNS = (itemLabel: string): Column<GscRow>[] => [
  { key: "label", header: itemLabel, render: (r) => r.label },
  { key: "clicks", header: "Cliques", align: "right", render: (r) => int(r.clicks) },
  { key: "impressions", header: "Impr.", align: "right", render: (r) => int(r.impressions) },
  { key: "ctr", header: "CTR", align: "right", render: (r) => pct(r.ctr) },
  {
    key: "position",
    header: "Posição média",
    align: "right",
    render: (r) => (r.position == null ? "—" : dec(r.position, 1)),
    sortValue: (r) => r.position ?? Number.MAX_SAFE_INTEGER,
  },
];

const CRUZAMENTO_COLUMNS = (currency: string): Column<CruzamentoRow>[] => [
  { key: "label", header: "Termo de busca", render: (r) => r.label },
  { key: "ads_impressions", header: "Impr. (Ads)", align: "right", render: (r) => int(r.ads_impressions) },
  { key: "ads_clicks", header: "Cliques (Ads)", align: "right", render: (r) => int(r.ads_clicks) },
  { key: "ads_ctr", header: "CTR (Ads)", align: "right", render: (r) => (r.ads_ctr == null ? "—" : pct(r.ads_ctr)) },
  { key: "ads_cost", header: "Custo (Ads)", align: "right", render: (r) => brl(r.ads_cost, currency) },
  { key: "gsc_impressions", header: "Impr. (GSC)", align: "right", render: (r) => int(r.gsc_impressions) },
  { key: "gsc_clicks", header: "Cliques (GSC)", align: "right", render: (r) => int(r.gsc_clicks) },
  { key: "gsc_ctr", header: "CTR (GSC)", align: "right", render: (r) => (r.gsc_ctr == null ? "—" : pct(r.gsc_ctr)) },
  {
    key: "gsc_position",
    header: "Posição (GSC)",
    align: "right",
    render: (r) => (r.gsc_position == null ? "—" : dec(r.gsc_position, 1)),
    sortValue: (r) => r.gsc_position ?? Number.MAX_SAFE_INTEGER,
  },
  {
    key: "volume_busca",
    header: "Volume de busca",
    align: "right",
    render: () => <span title="Requer integração com o Keyword Planner (API do Google Ads), ainda não conectada.">—</span>,
  },
];

export function SearchConsole() {
  const { accounts, account, f } = usePage();
  const [tab, setTab] = useState<Tab>("queries");
  const cur = account?.currency ?? "BRL";

  const gscQ = useQuery({
    queryKey: ["gsc", tab, f.account, f.from, f.to],
    queryFn: () => api.gsc(tab as "queries" | "pages", { account: f.account, from: f.from, to: f.to }),
    enabled: !!account && tab !== "cruzamento",
  });
  const cruzamentoQ = useQuery({
    queryKey: ["cruzamento", f.account, f.from, f.to],
    queryFn: () => api.cruzamento({ account: f.account, from: f.from, to: f.to }),
    enabled: !!account && tab === "cruzamento",
  });

  const notConnected = !account?.gsc_dataset;
  const q = tab === "cruzamento" ? cruzamentoQ : gscQ;
  const rows = q.data?.rows ?? [];
  const itemLabel = tab === "pages" ? "Página" : "Consulta";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Search Console"
        subtitle="Cliques, impressões, CTR e posição média orgânica no período."
        accounts={accounts}
        f={f}
      />

      {notConnected ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
          Search Console não conectado para {account?.name}. Preencha o dataset do bulk export em
          Configurações.
        </p>
      ) : (
        <>
          <div className="flex gap-1 border-b border-slate-200">
            {TABS.map((t) => (
              <button
                key={t.kind}
                onClick={() => setTab(t.kind)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                  tab === t.kind
                    ? "border-brand text-brand"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "cruzamento" && (
            <p className="text-xs text-slate-400">
              Cruza o termo literal de busca do Google Ads com as consultas orgânicas do Search Console.
              A coluna "Volume de busca" depende do Keyword Planner (API separada do Ads), ainda não
              conectado — por isso fica vazia.
            </p>
          )}

          <QueryState q={q} />
          {q.data && (
            <>
              <p className="text-xs text-slate-400">
                {rows.length} linhas · {q.data.range.from} a {q.data.range.to}
              </p>
              {tab === "cruzamento" ? (
                <DataTable
                  rows={rows as CruzamentoRow[]}
                  rowKey={(r) => r.label}
                  initialSort={{ key: "ads_clicks", dir: "desc" }}
                  columns={CRUZAMENTO_COLUMNS(cur)}
                />
              ) : (
                <DataTable
                  rows={rows as GscRow[]}
                  rowKey={(r) => r.label}
                  initialSort={{ key: "clicks", dir: "desc" }}
                  columns={GSC_COLUMNS(itemLabel)}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
