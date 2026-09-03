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

export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-72 w-full rounded-lg border border-slate-200 bg-white p-4">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#eef2f7" vertical={false} />
          <XAxis dataKey="day" tickFormatter={shortDate} fontSize={11} stroke="#94a3b8" />
          <YAxis yAxisId="l" fontSize={11} stroke="#94a3b8" tickFormatter={(v) => int(v)} />
          <YAxis yAxisId="r" orientation="right" fontSize={11} stroke="#94a3b8" />
          <Tooltip
            formatter={(v: number, name) =>
              name === "Custo" ? brl(v) : int(v)
            }
            labelFormatter={(l) => shortDate(String(l))}
          />
          <Legend />
          <Bar yAxisId="l" dataKey="cost" name="Custo" fill="#bfdbfe" radius={[3, 3, 0, 0]} />
          <Line
            yAxisId="r"
            type="monotone"
            dataKey="conversions"
            name="Conversões"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
