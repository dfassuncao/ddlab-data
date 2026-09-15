import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { shortDate, brl, int } from "../lib/format";
import type { TrendPoint } from "@shared/types";

// Tooltip customizado, exibido só ao clicar (trigger="click"): além de
// custo/conversões, mostra o valor do lead (CPA) do dia clicado.
function ClickTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const point: TrendPoint = payload[0].payload;
  const cpa = point.conversions > 0 ? point.cost / point.conversions : null;
  return (
    <div className="rounded-md border border-slate-200 bg-white p-2.5 text-xs shadow-md">
      <p className="mb-1 font-medium text-slate-700">{shortDate(String(label))}</p>
      <p className="text-blue-500">Custo: {brl(point.cost)}</p>
      <p className="text-blue-700">Conversões: {int(point.conversions)}</p>
      <p className="mt-1 border-t border-slate-100 pt-1 font-medium text-slate-600">
        Valor do lead (CPA): {cpa != null ? brl(cpa) : "—"}
      </p>
    </div>
  );
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-72 w-full rounded-lg border border-slate-200 bg-white p-4">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#eef2f7" vertical={false} />
          <XAxis dataKey="day" tickFormatter={shortDate} fontSize={11} stroke="#94a3b8" />
          <YAxis yAxisId="l" fontSize={11} stroke="#94a3b8" tickFormatter={(v) => int(v)} />
          <YAxis yAxisId="r" orientation="right" fontSize={11} stroke="#94a3b8" />
          <Tooltip content={<ClickTooltip />} trigger="click" />
          <Legend />
          <Bar
            yAxisId="l"
            dataKey="cost"
            name="Custo"
            fill="#bfdbfe"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
          <Line
            yAxisId="r"
            type="monotone"
            dataKey="conversions"
            name="Conversões"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
