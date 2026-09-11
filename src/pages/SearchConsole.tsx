import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { usePage } from "../lib/usePage";
import { PageHeader, QueryState } from "../components/PageHeader";
import { DataTable, type Column } from "../components/DataTable";
import { int, pct, dec } from "../lib/format";

type Row = { label: string; clicks: number; impressions: number; ctr: number; position: number | null };

const TABS: { kind: "queries" | "pages"; label: string; itemLabel: string }[] = [
  { kind: "queries", label: "Consultas", itemLabel: "Consulta" },
  { kind: "pages", label: "Páginas", itemLabel: "Página" },
];

const COLUMNS = (itemLabel: string): Column<Row>[] => [
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

export function SearchConsole() {
  const { accounts, account, f } = usePage();
  const [tab, setTab] = useState<"queries" | "pages">("queries");

  const q = useQuery({
    queryKey: ["gsc", tab, f.account, f.from, f.to],
    queryFn: () => api.gsc(tab, { account: f.account, from: f.from, to: f.to }),
    enabled: !!account,
  });

  const notConnected = !account?.gsc_dataset;
  const rows: Row[] = q.data?.rows ?? [];
  const current = TABS.find((t) => t.kind === tab)!;

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

          <QueryState q={q} />
          {q.data && (
            <>
              <p className="text-xs text-slate-400">
                {rows.length} linhas · {q.data.range.from} a {q.data.range.to}
              </p>
              <DataTable
                rows={rows}
                rowKey={(r) => r.label}
                initialSort={{ key: "clicks", dir: "desc" }}
                columns={COLUMNS(current.itemLabel)}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
