import { useMemo, useState } from "react";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  render?: (row: T) => React.ReactNode;
  sortValue?: (row: T) => number | string;
  className?: string;
}

export function DataTable<T extends Record<string, any>>({
  rows,
  columns,
  initialSort,
  rowKey,
}: {
  rows: T[];
  columns: Column<T>[];
  initialSort?: { key: string; dir: "asc" | "desc" };
  rowKey: (row: T) => string;
}) {
  const [sort, setSort] = useState(initialSort ?? { key: columns[0].key, dir: "desc" as const });

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const val = col.sortValue ?? ((r: T) => r[col.key]);
    return [...rows].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, columns, sort]);

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            {columns.map((c) => (
              <th
                key={c.key}
                onClick={() =>
                  setSort((s) => ({
                    key: c.key,
                    dir: s.key === c.key && s.dir === "desc" ? "asc" : "desc",
                  }))
                }
                className={`cursor-pointer select-none px-3 py-2 font-medium hover:text-slate-700 ${
                  c.align === "right" ? "text-right" : ""
                }`}
              >
                {c.header}
                {sort.key === c.key ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 py-2 ${c.align === "right" ? "num text-right" : ""} ${c.className ?? ""}`}
                >
                  {c.render ? c.render(row) : String(row[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-400">
                Sem dados no período. Rode o refresh / aguarde o backfill do Google Ads.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
