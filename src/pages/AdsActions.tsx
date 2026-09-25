import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { usePage } from "../lib/usePage";
import { PageHeader, QueryState } from "../components/PageHeader";

type ActionRow = {
  id: string;
  account_id: string;
  action_type: string;
  description: string;
  payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "applied" | "error";
  requested_by: string | null;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  applied_at: string | null;
  error: string | null;
};

const STATUS_LABEL: Record<ActionRow["status"], string> = {
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Rejeitada",
  applied: "Aplicada",
  error: "Erro",
};

const STATUS_BADGE: Record<ActionRow["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  rejected: "bg-slate-200 text-slate-600",
  applied: "bg-emerald-100 text-emerald-700",
  error: "bg-rose-100 text-rose-700",
};

export function AdsActions() {
  const { accounts, account, f } = usePage();
  const qc = useQueryClient();
  const [statusFiltro, setStatusFiltro] = useState("pending");

  const q = useQuery({
    queryKey: ["ads-actions", f.account, statusFiltro],
    queryFn: () => api.adsActions({ account: f.account, status: statusFiltro || undefined }),
    enabled: !!account,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["ads-actions"] });
  const approve = useMutation({ mutationFn: (id: string) => api.approveAdsAction(id), onSuccess: invalidate });
  const reject = useMutation({ mutationFn: (id: string) => api.rejectAdsAction(id), onSuccess: invalidate });

  const rows: ActionRow[] = q.data?.rows ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ações pendentes"
        subtitle="Mudanças propostas para o Google Ads (a partir da análise ou cadastradas manualmente). Nada é aplicado sem aprovação aqui."
        accounts={accounts}
        f={f}
      />

      <div className="flex items-center gap-3">
        <select
          value={statusFiltro}
          onChange={(e) => setStatusFiltro(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="pending">Pendentes</option>
          <option value="approved">Aprovadas</option>
          <option value="applied">Aplicadas</option>
          <option value="rejected">Rejeitadas</option>
          <option value="error">Com erro</option>
          <option value="">Todas</option>
        </select>
      </div>

      <QueryState q={q} />

      {q.data && (
        <div className="space-y-2">
          {rows.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
              Nenhuma ação {statusFiltro ? STATUS_LABEL[statusFiltro as ActionRow["status"]]?.toLowerCase() : ""} para{" "}
              {account?.name}.
            </p>
          )}
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                    <span className="text-xs text-slate-400">{r.action_type}</span>
                  </div>
                  <p className="text-sm text-slate-800">{r.description}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Pedido por {r.requested_by ?? "—"} em {new Date(r.requested_at).toLocaleString("pt-BR")}
                    {r.reviewed_by && (
                      <>
                        {" "}
                        · {r.status === "rejected" ? "Rejeitado" : "Revisado"} por {r.reviewed_by} em{" "}
                        {new Date(r.reviewed_at!).toLocaleString("pt-BR")}
                      </>
                    )}
                  </p>
                  {r.error && <p className="mt-1 text-xs text-rose-600">{r.error}</p>}
                </div>
                {r.status === "pending" && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => approve.mutate(r.id)}
                      disabled={approve.isPending || reject.isPending}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      Aprovar
                    </button>
                    <button
                      onClick={() => reject.mutate(r.id)}
                      disabled={approve.isPending || reject.isPending}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-50"
                    >
                      Rejeitar
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
