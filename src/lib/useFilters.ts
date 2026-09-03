import { useSearchParams } from "react-router-dom";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface Filters {
  account: string;
  from: string;
  to: string;
  setAccount: (a: string) => void;
  setRange: (from: string, to: string) => void;
  preset: (days: number) => void;
}

export function useFilters(accounts: { id: string }[]): Filters {
  const [params, setParams] = useSearchParams();

  const defTo = iso(new Date(Date.now() - 86_400_000));
  const defFrom = iso(new Date(Date.now() - 30 * 86_400_000));

  const account = params.get("account") || accounts[0]?.id || "";
  const from = params.get("from") || defFrom;
  const to = params.get("to") || defTo;

  const patch = (next: Record<string, string>) => {
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
    preset: (days) =>
      patch({
        from: iso(new Date(Date.now() - days * 86_400_000)),
        to: defTo,
      }),
  };
}
