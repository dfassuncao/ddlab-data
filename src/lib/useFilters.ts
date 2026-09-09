import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

const iso = (d: Date) => d.toISOString().slice(0, 10);

const LS = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(`ddlab.${k}`);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(`ddlab.${k}`, v);
    } catch {
      /* ignore */
    }
  },
};

export interface Filters {
  account: string;
  from: string;
  to: string;
  setAccount: (a: string) => void;
  setRange: (from: string, to: string) => void;
  preset: (days: number) => void;
}

/**
 * Filtros (conta + período) persistidos.
 * Prioridade de leitura: URL → localStorage → default.
 * A conta escolhida NÃO se perde ao trocar de relatório (mesmo que o link
 * não carregue o ?account): cai no localStorage e é reescrita na URL.
 */
export function useFilters(accounts: { id: string }[]): Filters {
  const [params, setParams] = useSearchParams();

  const defTo = iso(new Date(Date.now() - 86_400_000));
  const defFrom = iso(new Date(Date.now() - 30 * 86_400_000));

  const urlAccount = params.get("account");
  const known = (id: string | null) => (id && accounts.some((a) => a.id === id) ? id : null);
  const account =
    known(urlAccount) || known(LS.get("account")) || accounts[0]?.id || "";
  const from = params.get("from") || LS.get("from") || defFrom;
  const to = params.get("to") || LS.get("to") || defTo;

  // Mantém a URL canônica quando a navegação dropou os params.
  useEffect(() => {
    if (!account) return;
    const missing =
      params.get("account") !== account || params.get("from") !== from || params.get("to") !== to;
    if (missing) {
      const p = new URLSearchParams(params);
      p.set("account", account);
      p.set("from", from);
      p.set("to", to);
      setParams(p, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, from, to]);

  const patch = (next: Record<string, string>) => {
    for (const [k, v] of Object.entries(next)) LS.set(k, v);
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) p.set(k, v);
    setParams(p, { replace: true });
  };

  return {
    account,
    from,
    to,
    setAccount: (a) => patch({ account: a }),
    setRange: (f, t) => patch({ from: f, to: t }),
    preset: (days) => patch({ from: iso(new Date(Date.now() - days * 86_400_000)), to: defTo }),
  };
}
