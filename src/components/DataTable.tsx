import { useEffect, useMemo, useState } from "react";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  render?: (row: T) => React.ReactNode;
  sortValue?: (row: T) => number | string;
  className?: string;
  /** Quando definido, soma a coluna no rodapé com base em TODAS as linhas (não só a página atual). */
  total?: (rows: T[]) => React.ReactNode;
}

const PAGE_SIZE = 50;

export function DataTable<T extends Record<string, any>>({
  rows,
  columns,
  initialSort,
  rowKey,
  stickyFirstColumn,
  rowClassName,
}: {
  rows: T[];
  columns: Column<T>[];
  initialSort?: { key: string; dir: "asc" | "desc" };
  rowKey: (row: T) => string;
  /** Fixa a primeira coluna ao rolar horizontalmente (útil em tabelas com muitas colunas). */
  stickyFirstColumn?: boolean;
  /** Classe(s) de fundo por linha (ex.: cor por categoria) — aplicada na linha inteira, inclusive na coluna fixa. */
  rowClassName?: (row: T) => string | undefined;
}) {
  const [sort, setSort] = useState(initialSort ?? { key: columns[0].key, dir: "desc" as const });
  const [page, setPage] = useState(0);

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

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  useEffect(() => setPage(0), [rows, sort.key, sort.dir]);
  const clampedPage = Math.min(page, pageCount - 1);
  const paged = sorted.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);
  const hasTotals = columns.some((c) => c.total);
  const stickyCls = (i: number) => (stickyFirstColumn && i === 0 ? "sticky left-0 z-10" : "");

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            {columns.map((c, i) => (
              <th
                key={c.key}
                onClick={() =>
                  setSort((s) => ({
                    key: c.key,
                    dir: s.key === c.key && s.dir === "desc" ? "asc" : "desc",
                  }))
                }
                className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 font-medium hover:text-slate-700 ${
                  c.align === "right" ? "text-right" : ""
                } ${stickyCls(i)} ${stickyCls(i) && "bg-slate-50"}`}
              >
                {c.header}
                {sort.key === c.key ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paged.map((row) => {
            const rowBg = rowClassName?.(row) ?? "";
            return (
              <tr
                key={rowKey(row)}
                className={`group border-b border-slate-100 last:border-0 hover:brightness-[0.97] ${rowBg}`}
              >
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={`px-3 py-2 ${c.align === "right" ? "num text-right" : ""} ${c.className ?? ""} ${stickyCls(i)} ${
                      stickyCls(i) ? rowBg || "bg-white" : ""
                    }`}
                  >
                    {c.render ? c.render(row) : String(row[c.key] ?? "—")}
                  </td>
                ))}
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-400">
                Sem dados no período. Rode o refresh / aguarde o backfill do Google Ads.
              </td>
            </tr>
          )}
        </tbody>
        {hasTotals && sorted.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-medium">
              {columns.map((c, i) => (
                <td
                  key={c.key}
                  className={`px-3 py-2 ${c.align === "right" ? "num text-right" : ""} ${stickyCls(i)} ${stickyCls(i) && "bg-slate-50"}`}
                >
                  {c.total ? c.total(sorted) : i === 0 ? "Total" : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      {sorted.length > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
          <span>
            {clampedPage * PAGE_SIZE + 1}–{Math.min((clampedPage + 1) * PAGE_SIZE, sorted.length)} de {sorted.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={clampedPage === 0}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
            >
              Anterior
            </button>
            <span>
              Página {clampedPage + 1} de {pageCount}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={clampedPage >= pageCount - 1}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
