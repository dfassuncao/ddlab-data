import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { usePage } from "../lib/usePage";
import { PageHeader, QueryState } from "../components/PageHeader";
import { DataTable } from "../components/DataTable";
import { brl, dec, int } from "../lib/format";

export function Opportunities() {
  const { accounts, account, f } = usePage();
  const q = useQuery({
    queryKey: ["opportunities", f.account, f.from, f.to],
    queryFn: () => api.opportunities({ account: f.account, from: f.from, to: f.to }),
    enabled: !!account,
  });
  const cur = account?.currency ?? "BRL";
  const d = q.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Oportunidades"
        subtitle="Onde investir mais: demanda comprovada limitada por verba ou não explorada."
        accounts={accounts}
        f={f}
      />
      <QueryState q={q} />
      {d && (
        <>
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">
              Campanhas mais eficientes — CPA abaixo da média da conta
              {d.account_cpa != null && (
                <span className="ml-2 font-normal text-slate-400">
                  (média {brl(d.account_cpa, cur)})
                </span>
              )}
            </h2>
            <DataTable
              rows={d.efficient}
              rowKey={(r) => r.label}
              initialSort={{ key: "cpa", dir: "asc" }}
              columns={[
                { key: "label", header: "Campanha", render: (r) => r.label },
                { key: "cost", header: "Custo", align: "right", render: (r) => brl(r.cost, cur) },
                { key: "conversions", header: "Conv.", align: "right", render: (r) => dec(r.conversions, 1) },
                { key: "cpa", header: "CPA", align: "right", render: (r) => brl(r.cpa, cur) },
              ]}
            />
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">
              Termos que convertem (avaliar como palavra‑chave exata / negativar concorrência)
            </h2>
            <DataTable
              rows={d.converting_terms}
              rowKey={(r) => r.label}
              initialSort={{ key: "conversions", dir: "desc" }}
              columns={[
                { key: "label", header: "Termo", render: (r) => r.label },
                { key: "clicks", header: "Cliques", align: "right", render: (r) => int(r.clicks) },
                { key: "cost", header: "Custo", align: "right", render: (r) => brl(r.cost, cur) },
                { key: "conversions", header: "Conv.", align: "right", render: (r) => dec(r.conversions, 1) },
                { key: "cpa", header: "CPA", align: "right", render: (r) => brl(r.cpa, cur) },
              ]}
            />
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">
              Locais com melhor eficiência (escalar lance/verba)
            </h2>
            <DataTable
              rows={d.scale_geo}
              rowKey={(r) => r.label}
              initialSort={{ key: "conversions", dir: "desc" }}
              columns={[
                { key: "label", header: "Local (ID)", render: (r) => r.label },
                { key: "cost", header: "Custo", align: "right", render: (r) => brl(r.cost, cur) },
                { key: "conversions", header: "Conv.", align: "right", render: (r) => dec(r.conversions, 1) },
                { key: "cpa", header: "CPA", align: "right", render: (r) => brl(r.cpa, cur) },
              ]}
            />
          </section>
        </>
      )}
    </div>
  );
}
