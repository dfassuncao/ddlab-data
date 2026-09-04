import type { Account } from "@shared/types";
import { brl, int } from "../lib/format";
import { Link } from "react-router-dom";

/** Contexto do "cliente ideal" da conta, para ler junto com os números. */
export function ProfileBanner({ account }: { account: Account }) {
  const hasProfile = !!(account.profile_notes || account.ideal_ticket_min || account.lead_goal_monthly);

  if (!hasProfile) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
        Perfil do cliente ideal ainda não definido para {account.name}.{" "}
        <Link to="/settings" className="font-medium text-brand hover:underline">
          Configurar em Configurações →
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-semibold uppercase tracking-wide text-blue-700">Cliente ideal</span>
        {account.ideal_ticket_min != null && (
          <span>Ticket mínimo: {brl(account.ideal_ticket_min, account.currency)}</span>
        )}
        {account.lead_goal_monthly != null && <span>Meta: {int(account.lead_goal_monthly)} leads/mês</span>}
      </div>
      {account.profile_notes && <p className="mt-1 whitespace-pre-wrap text-blue-900/90">{account.profile_notes}</p>}
    </div>
  );
}
