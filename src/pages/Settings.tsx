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
  const [profileEdit, setProfileEdit] = useState<
    Record<string, { profile_notes?: string; ideal_ticket_min?: string; lead_goal_monthly?: string }>
  >({});

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
        <h2 className="mb-1 text-sm font-semibold text-slate-700">Briefing do cliente</h2>
        <p className="mb-3 text-xs text-slate-500">
          Definição do negócio de cada conta: o que a empresa faz, posicionamento, o que conta como
          lead bom, contatos indesejados, região, etc. <strong>Não aparece nas telas de análise</strong>,
          mas é enviado como contexto para a <strong>Análise IA</strong> julgar os números.
          Os campos numéricos abaixo (ticket mínimo, meta de leads) alimentam os rankings de Oportunidades.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {accounts.map((a) => {
            const pe = profileEdit[a.id] ?? {};
            return (
              <div key={a.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">{a.name}</span>
                  <button
                    className="rounded bg-brand px-2.5 py-1 text-xs font-medium text-white"
                    onClick={() =>
                      save.mutate({
                        id: a.id,
                        profile_notes: pe.profile_notes ?? a.profile_notes ?? "",
                        ideal_ticket_min:
                          pe.ideal_ticket_min !== undefined
                            ? Number(pe.ideal_ticket_min) || null
                            : undefined,
                        lead_goal_monthly:
                          pe.lead_goal_monthly !== undefined
                            ? Number(pe.lead_goal_monthly) || null
                            : undefined,
                      })
                    }
                  >
                    Salvar
                  </button>
                </div>
                <textarea
                  className="mb-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  rows={6}
                  placeholder="Ex.: loja de veículos novos e seminovos em Santos, foco em modelos de padrão superior. Lead bom = intenção real de compra/troca/financiamento. Ignorar: emprego, peças, oficina, aluguel, quem só quer informação técnica."
                  defaultValue={a.profile_notes ?? ""}
                  onChange={(ev) =>
                    setProfileEdit((s) => ({ ...s, [a.id]: { ...s[a.id], profile_notes: ev.target.value } }))
                  }
                />
                <div className="flex gap-3 text-xs">
                  <label className="flex items-center gap-1.5">
                    Ticket mínimo relevante
                    <input
                      className="w-24 rounded border border-slate-300 px-2 py-1"
                      defaultValue={a.ideal_ticket_min ?? ""}
                      onChange={(ev) =>
                        setProfileEdit((s) => ({
                          ...s,
                          [a.id]: { ...s[a.id], ideal_ticket_min: ev.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="flex items-center gap-1.5">
                    Meta leads/mês
                    <input
                      className="w-20 rounded border border-slate-300 px-2 py-1"
                      defaultValue={a.lead_goal_monthly ?? ""}
                      onChange={(ev) =>
                        setProfileEdit((s) => ({
                          ...s,
                          [a.id]: { ...s[a.id], lead_goal_monthly: ev.target.value },
                        }))
                      }
                    />
                  </label>
                </div>
              </div>
            );
          })}
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
