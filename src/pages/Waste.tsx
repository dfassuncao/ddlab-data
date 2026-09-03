import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { usePage } from "../lib/usePage";
import { PageHeader, QueryState } from "../components/PageHeader";
import { DataTable } from "../components/DataTable";
import { brl, int } from "../lib/format";

const SCOPE_PT: Record<string, string> = {
  campaign: "Campanha",
  keyword: "Palavra‑chave",
  search_term: "Termo de busca",
  geo: "Local",
};

export function Waste() {
  const { accounts, account, f } = usePage();
  const q = useQuery({
    queryKey: ["waste", f.account, f.from, f.to],
    queryFn: () => api.waste({ account: f.account, from: f.from, to: f.to }),
    enabled: !!account,
  });
  const cur = account?.currency ?? "BRL";
  const items: any[] = q.data?.items ?? [];
  const total = items.reduce((s, i) => s + i.cost, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Desperdício"
        subtitle="Gasto com 0 conversão no período — candidatos a corte / negativa / exclusão."
        accounts={accounts}
        f={f}
      />
      <QueryState q={q} />
      {q.data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
              <div className="text-xs font-medium uppercase text-rose-500">Gasto sem conversão</div>
              <div className="num mt-1 text-2xl font-semibold text-rose-700">{brl(total, cur)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium uppercase text-slate-500">Recuperável (campanhas)</div>
              <div className="num mt-1 text-2xl font-semibold text-slate-900">{brl(q.data.recoverable, cur)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs font-medium uppercase text-slate-500">Itens</div>
              <div className="num mt-1 text-2xl font-semibold text-slate-900">{int(items.length)}</div>
            </div>
          </div>

          <DataTable
            rows={items}
            rowKey={(r) => `${r.scope}:${r.label}`}
            initialSort={{ key: "cost", dir: "desc" }}
            columns={[
              { key: "scope", header: "Tipo", render: (r) => SCOPE_PT[r.scope] ?? r.scope },
              { key: "label", header: "Item", render: (r) => r.label },
              { key: "clicks", header: "Cliques", align: "right", render: (r) => int(r.clicks) },
              { key: "cost", header: "Custo", align: "right", render: (r) => brl(r.cost, cur) },
            ]}
          />
        </>
      )}
    </div>
  );
}
