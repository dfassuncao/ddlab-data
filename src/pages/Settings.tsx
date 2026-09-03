import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { usePage } from "../lib/usePage";
import { PageHeader } from "../components/PageHeader";
import { brl } from "../lib/format";

export function Settings() {
  const { accounts, account, f } = usePage();
  const qc = useQueryClient();
  const fresh = useQuery({
    queryKey: ["freshness", "all"],
    queryFn: () => api.freshness(),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.saveAccount(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });
  const refresh = useMutation({
    mutationFn: (v: { account?: string; days?: number }) => api.refresh(v.account, v.days),
  });

  const [edit, setEdit] = useState<Record<string, { target_cpa?: string; monthly_budget?: string }>>({});

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" accounts={accounts} f={f} />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Contas</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Conta</th>
                <th className="px-3 py-2">Customer ID</th>
                <th className="px-3 py-2">Meta CPA</th>
                <th className="px-3 py-2">Verba mensal</th>
                <th className="px-3 py-2">Shopping/PMax</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const e = edit[a.id] ?? {};
                return (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{a.name}</td>
                    <td className="num px-3 py-2 text-slate-500">{a.customer_id}</td>
                    <td className="px-3 py-2">
                      <input
                        className="w-24 rounded border border-slate-300 px-2 py-1"
                        defaultValue={a.target_cpa ?? ""}
                        onChange={(ev) =>
                          setEdit((s) => ({ ...s, [a.id]: { ...s[a.id], target_cpa: ev.target.value } }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-28 rounded border border-slate-300 px-2 py-1"
                        defaultValue={a.monthly_budget ?? ""}
                        onChange={(ev) =>
                          setEdit((s) => ({ ...s, [a.id]: { ...s[a.id], monthly_budget: ev.target.value } }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        defaultChecked={a.has_shopping}
                        onChange={(ev) => save.mutate({ id: a.id, has_shopping: ev.target.checked })}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        className="rounded bg-brand px-2.5 py-1 text-xs font-medium text-white"
                        onClick={() =>
                          save.mutate({
                            id: a.id,
                            target_cpa: e.target_cpa ? Number(e.target_cpa) : undefined,
                            monthly_budget: e.monthly_budget ? Number(e.monthly_budget) : undefined,
                          })
                        }
                      >
                        Salvar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Atualização de dados</h2>
          <div className="flex gap-2">
            <button
              onClick={() => refresh.mutate({ account: account?.id, days: 30 })}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
            >
              Atualizar {account?.name} (30d)
            </button>
            <button
              onClick={() => refresh.mutate({ account: account?.id, days: 400 })}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
            >
              Backfill {account?.name} (400d)
            </button>
          </div>
        </div>
        {refresh.isSuccess && (
          <p className="text-xs text-emerald-600">
            Refresh disparado em background. Recarregue em alguns minutos.
          </p>
        )}
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Conta</th>
                <th className="px-3 py-2">Fato</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Linhas</th>
                <th className="px-3 py-2">Dados até</th>
                <th className="px-3 py-2">Última execução</th>
                <th className="px-3 py-2">Erro</th>
              </tr>
            </thead>
            <tbody>
              {(fresh.data?.rows ?? []).map((r: any) => (
                <tr key={`${r.account_id}-${r.fact}`} className="border-t border-slate-100">
                  <td className="px-3 py-2">{r.account_id}</td>
                  <td className="px-3 py-2">{r.fact}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        r.status === "ok" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="num px-3 py-2">{r.rows_written}</td>
                  <td className="px-3 py-2">{r.data_to ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {r.last_run_at ? new Date(r.last_run_at).toLocaleString("pt-BR") : "—"}
                  </td>
                  <td className="px-3 py-2 text-rose-600" title={r.error ?? ""}>
                    {r.error ? r.error.slice(0, 60) + "…" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Coluna de erro com "Unrecognized name" → nome de coluna do BigQuery diferente nessa conta.
          Use <code>/api/introspect?table=NOME_DA_TABELA</code> e ajuste <code>worker/etl/queries.ts</code>.
        </p>
      </section>

      <section className="text-xs text-slate-400">
        Contas ativas: {accounts.map((a) => `${a.name} (${brl(a.monthly_budget, a.currency)})`).join(" · ")}
      </section>
    </div>
  );
}
