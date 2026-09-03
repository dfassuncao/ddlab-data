import { delta } from "../lib/format";

interface Props {
  label: string;
  value: string;
  prev?: number | null;
  cur?: number | null;
  invert?: boolean; // menor é melhor (CPA, custo)
}

export function KpiCard({ label, value, prev, cur, invert }: Props) {
  const d = cur != null && prev != null ? delta(cur, prev) : null;
  const good = d == null ? null : invert ? d < 0 : d > 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 num text-2xl font-semibold text-slate-900">{value}</div>
      {d != null && (
        <div
          className={`mt-1 text-xs font-medium ${
            good == null ? "text-slate-400" : good ? "text-emerald-600" : "text-rose-600"
          }`}
        >
          {d > 0 ? "▲" : "▼"} {new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(Math.abs(d))}{" "}
          <span className="text-slate-400">vs período anterior</span>
        </div>
      )}
    </div>
  );
}
