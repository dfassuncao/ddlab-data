import type { Freshness } from "@shared/types";

export function FreshnessBadge({ rows }: { rows: Freshness[] }) {
  if (!rows?.length) return <span className="text-xs text-slate-400">sem carga ainda</span>;
  const errors = rows.filter((r) => r.status === "error");
  const last = rows
    .map((r) => r.last_run_at)
    .sort()
    .at(-1);
  const dataTo = rows
    .filter((r) => r.data_to)
    .map((r) => r.data_to!)
    .sort()
    .at(-1);

  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
          errors.length ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
        }`}
        title={
          errors.length
            ? `Fatos com erro: ${errors.map((e) => e.fact).join(", ")}`
            : "Todas as cargas OK"
        }
      >
        ● {errors.length ? `${errors.length} fato(s) com erro` : "dados OK"}
      </span>
      {dataTo && <span className="text-slate-500">até {dataTo}</span>}
      {last && (
        <span className="text-slate-400">
          · atualizado {new Date(last).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
        </span>
      )}
    </div>
  );
}
