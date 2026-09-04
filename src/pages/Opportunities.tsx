import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { usePage } from "../lib/usePage";
import { PageHeader, QueryState } from "../components/PageHeader";
import { DataTable } from "../components/DataTable";
import { ProfileBanner } from "../components/ProfileBanner";
import { brl, dec, int, pct } from "../lib/format";

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
      {account && <ProfileBanner account={account} />}
      {d && (
        <>
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">
              Segmentos ideais — mais leads e maior valor, não só CPA baixo
            </h2>
            <p className="mb-2 text-xs text-slate-500">
              Combina volume de conversões e valor gerado num score único (0 a 1). Se você definiu um
              "ticket mínimo ideal" em Configurações, campanhas abaixo dele ficam marcadas.
            </p>
            <DataTable
              rows={d.ideal_segments}
              rowKey={(r) => r.label}
              initialSort={{ key: "score", dir: "desc" }}
              columns={[
                {
                  key: "label",
                  header: "Campanha",
                  render: (r) => (
                    <span>
                      {r.label}
                      {r.below_ideal_ticket && (
                        <span
                          className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                          title="Ticket médio abaixo do mínimo ideal definido para a conta"
                        >
                          abaixo do ticket ideal
                        </span>
                      )}
                    </span>
                  ),
                },
                { key: "cost", header: "Custo", align: "right", render: (r) => brl(r.cost, cur) },
                { key: "conversions", header: "Conv.", align: "right", render: (r) => dec(r.conversions, 1) },
                {
                  key: "conversions_value",
                  header: "Valor gerado",
                  align: "right",
                  render: (r) => brl(r.conversions_value, cur),
                },
                { key: "ticket_medio", header: "Ticket médio", align: "right", render: (r) => brl(r.ticket_medio, cur) },
                {
                  key: "score",
                  header: "Score",
                  align: "right",
                  render: (r) => pct(r.score * 100, 0),
                },
              ]}
            />
          </section>

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
