export const brl = (n: number | null | undefined, currency = "BRL") =>
  n == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

export const int = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("pt-BR").format(Math.round(n));

export const dec = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

export const pct = (n: number | null | undefined, d = 1) =>
  n == null ? "—" : `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)}%`;

export const pctFrac = (n: number | null | undefined, d = 1) =>
  n == null ? "—" : pct(n * 100, d);

export const shortDate = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

export function delta(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return (cur - prev) / prev;
}
