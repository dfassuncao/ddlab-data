import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { usePage } from "../lib/usePage";
import { PageHeader, QueryState } from "../components/PageHeader";
import { DataTable, type Column } from "../components/DataTable";
import { metricCols, qualityCol } from "../lib/columns";
import { brl, int, pct } from "../lib/format";

type Row = Record<string, any>;

const LABELS: Record<string, string> = {
  campaigns: "Campanha",
  keywords: "Palavra‑chave",
  "search-terms": "Termo de busca",
  geo: "Local (ID)",
  ads: "Anúncio (ID)",
  audiences: "Segmento",
  products: "Produto",
  "landing-pages": "URL",
};

const EXTRA: Record<string, Column<Row>[]> = {
  keywords: [
    { key: "match_type", header: "Match", render: (r) => r.match_type ?? "—" },
    { key: "campaign", header: "Campanha", render: (r) => r.campaign ?? "—" },
  ],
  "search-terms": [{ key: "campaign", header: "Campanha", render: (r) => r.campaign ?? "—" }],
  ads: [
    { key: "ad_group_id", header: "Grupo", render: (r) => r.ad_group_id ?? "—" },
    { key: "ad_type", header: "Tipo", render: (r) => r.ad_type ?? "—" },
    { key: "campaign", header: "Campanha", render: (r) => r.campaign ?? "—" },
  ],
  audiences: [{ key: "dimension", header: "Dimensão", render: (r) => r.dimension ?? "—" }],
};

// landing-pages: o transfer não traz conversão nessa tabela — só tráfego + velocidade.
const LP_COLS: Column<Row>[] = [
  { key: "impressions", header: "Impr.", align: "right", render: (r) => int(r.impressions) },
  { key: "clicks", header: "Cliques", align: "right", render: (r) => int(r.clicks) },
  { key: "ctr", header: "CTR", align: "right", render: (r) => pct(r.ctr) },
  { key: "cost", header: "Custo", align: "right", render: (r) => brl(r.cost) },
  { key: "cpc", header: "CPC", align: "right", render: (r) => brl(r.cpc) },
  {
    key: "mobile_speed",
    header: "Mobile speed",
    align: "right",
    render: (r) => (r.mobile_speed == null ? "—" : int(r.mobile_speed)),
    sortValue: (r) => r.mobile_speed ?? -1,
  },
];

function downloadNegativesCsv(rows: Row[]) {
  const header = "Campaign,Keyword,Match Type,Level";
  const body = rows
    .filter((r) => (r.conversions ?? 0) === 0 && (r.cost ?? 0) > 0)
    .map((r) => {
      const term = String(r.label ?? "").replace(/"/g, '""');
      const camp = String(r.campaign ?? "").replace(/"/g, '""');
      return `"${camp}","${term}",Phrase,Campaign`;
    });
  const csv = [header, ...body].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `negativas-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportPage({
  kind,
  title,
  showNegativeExport,
}: {
  kind: string;
  title: string;
  showNegativeExport?: boolean;
}) {
  const { accounts, account, f } = usePage();
  const q = useQuery({
    queryKey: ["report", kind, f.account, f.from, f.to],
    queryFn: () => api.report(kind, { account: f.account, from: f.from, to: f.to }),
    enabled: !!account,
  });
  const rows: Row[] = q.data?.rows ?? [];
  const cur = account?.currency ?? "BRL";

  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        accounts={accounts}
        f={f}
        actions={
          showNegativeExport && rows.length > 0 ? (
            <button
              onClick={() => downloadNegativesCsv(rows)}
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Exportar negativas (CSV)
            </button>
          ) : null
        }
      />
      <QueryState q={q} />
      {q.data && (
        <>
          <p className="text-xs text-slate-400">{rows.length} linhas · {q.data.range.from} a {q.data.range.to}</p>
          <DataTable
            rows={rows}
            rowKey={(r) => r.key}
            initialSort={{ key: "cost", dir: "desc" }}
            columns={[
              { key: "label", header: LABELS[kind] ?? "Item", render: (r) => r.label || "—" },
              ...(EXTRA[kind] ?? []),
              ...(kind === "landing-pages"
                ? LP_COLS
                : kind === "keywords"
                  ? [...metricCols(cur), qualityCol()]
                  : metricCols(cur)),
            ]}
          />
        </>
      )}
    </div>
  );
}
