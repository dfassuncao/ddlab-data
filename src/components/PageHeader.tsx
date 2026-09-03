import type { ReactNode } from "react";
import type { Account } from "@shared/types";
import type { Filters } from "../lib/useFilters";
import { FilterBar } from "./Filters";

export function PageHeader({
  title,
  subtitle,
  accounts,
  f,
  actions,
}: {
  title: string;
  subtitle?: string;
  accounts: Account[];
  f: Filters;
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {accounts.length > 0 && <FilterBar accounts={accounts} f={f} />}
    </div>
  );
}

export function QueryState({ q }: { q: { isLoading: boolean; isError: boolean; error?: unknown } }) {
  if (q.isLoading) return <p className="py-4 text-sm text-slate-400">Carregando dados…</p>;
  if (q.isError)
    return (
      <p className="py-4 text-sm text-rose-600">Erro: {(q.error as Error)?.message ?? "desconhecido"}</p>
    );
  return null;
}
