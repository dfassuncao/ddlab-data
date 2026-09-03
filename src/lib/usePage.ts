import { useQuery } from "@tanstack/react-query";
import type { Account } from "@shared/types";
import { api } from "./api";
import { useFilters, type Filters } from "./useFilters";

export interface PageCtx {
  accountsQ: ReturnType<typeof useQuery<Account[]>>;
  accounts: Account[];
  account: Account | undefined;
  f: Filters;
}

export function usePage(): PageCtx {
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: api.accounts });
  const accounts = (accountsQ.data ?? []).filter((a) => a.active);
  const f = useFilters(accounts);
  const account = accounts.find((a) => a.id === f.account) ?? accounts[0];
  return { accountsQ, accounts, account, f };
}
