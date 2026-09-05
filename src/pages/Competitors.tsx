import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { usePage } from "../lib/usePage";
import { PageHeader, QueryState } from "../components/PageHeader";
import { DataTable } from "../components/DataTable";
import { brl, int, dec } from "../lib/format";

const STATUS: Record<string, { label: string; cls: string }> = {
  entrou: { label: "entrou", cls: "bg-blue-100 text-blue-700" },
  saiu: { label: "saiu", cls: "bg-slate-200 text-slate-600" },
  cresceu: { label: "cresceu", cls: "bg-rose-100 text-rose-700" },
  caiu: { label: "caiu", cls: "bg-emerald-100 text-emerald-700" },
  "estável": { label: "estável", cls: "bg-slate-100 text-slate-500" },
};

export function Competitors() {
  const { accounts, account, f } = usePage();
  const q = useQuery({
    queryKey: ["competitors", f.account, f.from, f.to],
    queryFn: () => api.competitors({ account: f.account, from: f.from, to: f.to }),
    enabled: !!account,
  });
  const cur = account?.currency ?? "BRL";
  const d = q.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Concorrentes"
        subtitle="Movimento no leilão pelos termos de busca que mencionam cada concorrente."
        accounts={accounts}
        f={f}
      />
      <QueryState q={q} />

      <p className="text-xs text-slate-400">
        Proxy baseado nos termos de busca — o Google não expõe o Auction Insights real (impression
        share vs concorrente, overlap) via API/BigQuery. "Entrou"/"saiu" = passou a ter / deixou de
        ter gasto nesses termos; "cresceu"/"caiu" = variação de custo &gt; 15% vs o período anterior
        {d?.prev_range && ` (${d.prev_range.from} a ${d.prev_range.to})`}.
      </p>

      {d && !d.configured && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          Nenhum concorrente cadastrado para {account?.name}.{" "}
          <Link to="/settings" className="font-medium text-brand hover:underline">
            Adicionar em Configurações →
          </Link>
        </p>
      )}

      {d?.configured && (
        <>
          <DataTable
            rows={d.competitors}
            rowKey={(r) => r.name}
            initialSort={{ key: "cost_cur", dir: "desc" }}
            columns={[
              { key: "name", header: "Concorrente", render: (r) => r.name },
              {
                key: "status",
                header: "Status",
                render: (r) => (
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS[r.status]?.cls ?? ""}`}>
                    {STATUS[r.status]?.label ?? r.status}
                  </span>
                ),
              },
              { key: "cost_prev", header: "Custo ant.", align: "right", render: (r) => brl(r.cost_prev, cur) },
              { key: "cost_cur", header: "Custo atual", align: "right", render: (r) => brl(r.cost_cur, cur) },
              {
                key: "cost_delta_pct",
                header: "Variação",
                align: "right",
                render: (r) =>
                  r.cost_delta_pct == null ? "—" : `${r.cost_delta_pct > 0 ? "+" : ""}${dec(r.cost_delta_pct, 0)}%`,
                sortValue: (r) => r.cost_delta_pct ?? -999,
              },
              { key: "impressions_cur", header: "Impr.", align: "right", render: (r) => int(r.impressions_cur) },
              { key: "clicks_cur", header: "Cliques", align: "right", render: (r) => int(r.clicks_cur) },
              { key: "conversions_cur", header: "Conv.", align: "right", render: (r) => dec(r.conversions_cur, 1) },
            ]}
          />

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">Termos por concorrente</h2>
            <div className="grid gap-2 md:grid-cols-2">
              {d.competitors
                .filter((c: any) => c.terms.length)
                .map((c: any) => (
                  <div key={c.name} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                    <div className="mb-1 font-medium">{c.name}</div>
                    <ul className="list-disc pl-4 text-slate-600">
                      {c.terms.map((t: string) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          </div>

          {d.unmapped_top?.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-slate-700">
                Termos de maior custo ainda não classificados
              </h2>
              <p className="mb-2 text-xs text-slate-500">
                Se algum destes for concorrente, adicione o nome em Configurações para passar a rastreá‑lo.
              </p>
              <DataTable
                rows={d.unmapped_top}
                rowKey={(r) => r.term}
                initialSort={{ key: "cost", dir: "desc" }}
                columns={[
                  { key: "term", header: "Termo", render: (r) => r.term },
                  { key: "clicks", header: "Cliques", align: "right", render: (r) => int(r.clicks) },
                  { key: "conversions", header: "Conv.", align: "right", render: (r) => dec(r.conversions, 1) },
                  { key: "cost", header: "Custo", align: "right", render: (r) => brl(r.cost, cur) },
                ]}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
