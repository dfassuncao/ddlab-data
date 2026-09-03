import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { usePage } from "../lib/usePage";
import { PageHeader, QueryState } from "../components/PageHeader";
import { DataTable } from "../components/DataTable";
import { metricCols } from "../lib/columns";
import { brl } from "../lib/format";

const DOW = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const DOW_PT: Record<string, string> = {
  MONDAY: "Seg",
  TUESDAY: "Ter",
  WEDNESDAY: "Qua",
  THURSDAY: "Qui",
  FRIDAY: "Sex",
  SATURDAY: "Sáb",
  SUNDAY: "Dom",
};

export function Schedule() {
  const { accounts, account, f } = usePage();
  const q = useQuery({
    queryKey: ["schedule", f.account, f.from, f.to],
    queryFn: () => api.schedule({ account: f.account, from: f.from, to: f.to }),
    enabled: !!account,
  });
  const cur = account?.currency ?? "BRL";
  const heat: any[] = q.data?.heatmap ?? [];

  const cell = new Map<string, any>();
  let max = 0;
  for (const h of heat) {
    cell.set(`${h.day_of_week}-${h.hour}`, h);
    max = Math.max(max, h.cost);
  }
  const color = (v: number) => {
    if (!v) return "#f8fafc";
    const t = Math.min(1, v / (max || 1));
    return `rgba(37, 99, 235, ${0.12 + t * 0.8})`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Horário & Dispositivo"
        subtitle="Quando o lead converte e em qual aparelho."
        accounts={accounts}
        f={f}
      />
      <QueryState q={q} />
      {q.data && (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Custo por dia × hora</h2>
            <table className="num text-[11px]">
              <thead>
                <tr>
                  <th className="w-10"></th>
                  {Array.from({ length: 24 }, (_, h) => (
                    <th key={h} className="px-1 text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DOW.map((d) => (
                  <tr key={d}>
                    <td className="pr-2 text-right font-medium text-slate-500">{DOW_PT[d]}</td>
                    {Array.from({ length: 24 }, (_, h) => {
                      const c = cell.get(`${d}-${h}`);
                      return (
                        <td
                          key={h}
                          title={c ? `${DOW_PT[d]} ${h}h — ${brl(c.cost, cur)} · ${c.conversions} conv` : ""}
                          style={{ background: color(c?.cost ?? 0) }}
                          className="h-6 w-6 border border-white"
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Dispositivo</h2>
            <DataTable
              rows={q.data.devices}
              rowKey={(r) => r.device}
              initialSort={{ key: "cost", dir: "desc" }}
              columns={[
                { key: "device", header: "Dispositivo", render: (r) => r.device },
                ...metricCols(cur),
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}
