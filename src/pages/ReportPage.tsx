import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { usePage } from "../lib/usePage";
import { PageHeader, QueryState } from "../components/PageHeader";
import { DataTable, type Column } from "../components/DataTable";
import { metricCols, qualityCol } from "../lib/columns";
import { brl, int, pct, sumBy } from "../lib/format";
import { downloadCsv } from "../lib/csv";

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
  {
    key: "impressions",
    header: "Impr.",
    align: "right",
    render: (r) => int(r.impressions),
    total: (rows) => int(sumBy(rows, "impressions")),
  },
  {
    key: "clicks",
    header: "Cliques",
    align: "right",
    render: (r) => int(r.clicks),
    total: (rows) => int(sumBy(rows, "clicks")),
  },
  { key: "ctr", header: "CTR", align: "right", render: (r) => pct(r.ctr) },
  {
    key: "cost",
    header: "Custo",
    align: "right",
    render: (r) => brl(r.cost),
    total: (rows) => brl(sumBy(rows, "cost")),
  },
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
  const body = rows
    .filter((r) => (r.conversions ?? 0) === 0 && (r.cost ?? 0) > 0)
    .map((r) => [r.campaign ?? "", r.label ?? "", "Phrase", "Campaign"]);
  downloadCsv(`negativas-${new Date().toISOString().slice(0, 10)}.csv`, ["Campaign", "Keyword", "Match Type", "Level"], body);
}

// Botão(ões) para propor pausar/reativar direto no Google Ads (fila de
// aprovação em Ações pendentes — nenhuma mutação sai daqui sem aprovação).
// Campanhas têm status conhecido (ENABLED/PAUSED via dim_campaign), então
// mostra um único botão que alterna; palavras-chave não têm status rastreado
// no D1, então mostra as duas opções.
function useProposeStatus(account: string) {
  const [propostos, setPropostos] = useState<Record<string, string>>({});
  const campanha = useMutation({
    mutationFn: (v: { campaignId: string; status: "PAUSED" | "ENABLED" }) =>
      api.proposeCampaignStatus({ account, ...v }),
    onSuccess: (_d, v) => setPropostos((s) => ({ ...s, [`c:${v.campaignId}:${v.status}`]: "ok" })),
    onError: (err: Error, v) => setPropostos((s) => ({ ...s, [`c:${v.campaignId}:${v.status}`]: err.message })),
  });
  const keyword = useMutation({
    mutationFn: (v: { criterionId: string; status: "PAUSED" | "ENABLED" }) =>
      api.proposeKeywordStatus({ account, ...v }),
    onSuccess: (_d, v) => setPropostos((s) => ({ ...s, [`k:${v.criterionId}:${v.status}`]: "ok" })),
    onError: (err: Error, v) => setPropostos((s) => ({ ...s, [`k:${v.criterionId}:${v.status}`]: err.message })),
  });
  return { propostos, campanha, keyword };
}

function StatusButton({
  proposto,
  pending,
  label,
  onClick,
}: {
  proposto: string | undefined;
  pending: boolean;
  label: string;
  onClick: () => void;
}) {
  if (proposto === "ok") return <span className="text-xs text-emerald-600">Enviado p/ aprovação</span>;
  if (proposto) return <span className="text-xs text-rose-600" title={proposto}>Erro</span>;
  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs hover:bg-slate-50 disabled:opacity-50"
    >
      {label}
    </button>
  );
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
  const { propostos, campanha, keyword } = useProposeStatus(f.account);

  const actionCol: Column<Row> | null =
    kind === "campaigns"
      ? {
          key: "ads_action",
          header: "Google Ads",
          render: (r) => {
            if (r.status === "REMOVED") return "—";
            const status: "PAUSED" | "ENABLED" = r.status === "PAUSED" ? "ENABLED" : "PAUSED";
            return (
              <StatusButton
                proposto={propostos[`c:${r.key}:${status}`]}
                pending={campanha.isPending}
                label={status === "PAUSED" ? "Pausar" : "Reativar"}
                onClick={() => campanha.mutate({ campaignId: r.key, status })}
              />
            );
          },
        }
      : kind === "keywords"
        ? {
            key: "ads_action",
            header: "Google Ads",
            render: (r) => (
              <div className="flex gap-1.5">
                <StatusButton
                  proposto={propostos[`k:${r.key}:PAUSED`]}
                  pending={keyword.isPending}
                  label="Pausar"
                  onClick={() => keyword.mutate({ criterionId: r.key, status: "PAUSED" })}
                />
                <StatusButton
                  proposto={propostos[`k:${r.key}:ENABLED`]}
                  pending={keyword.isPending}
                  label="Reativar"
                  onClick={() => keyword.mutate({ criterionId: r.key, status: "ENABLED" })}
                />
              </div>
            ),
          }
        : null;

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
              ...(actionCol ? [actionCol] : []),
            ]}
          />
        </>
      )}
    </div>
  );
}
