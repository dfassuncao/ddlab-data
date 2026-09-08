import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { api } from "../lib/api";
import { usePage } from "../lib/usePage";
import { PageTop } from "../components/PageTop";
import { QueryState } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { ScoreGauge } from "../components/ScoreGauge";
import { brl, int, dec, pct, shortDate } from "../lib/format";

const SEV: Record<string, { label: string; cls: string }> = {
  urgente: { label: "Urgente", cls: "bg-rose-100 text-rose-700" },
  alto: { label: "Alto impacto", cls: "bg-amber-100 text-amber-700" },
  revisar: { label: "Revisar", cls: "bg-slate-100 text-slate-600" },
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export function DecisionCenter() {
  const { account, f } = usePage();
  const q = useQuery({
    queryKey: ["decision-center", f.account, f.from, f.to],
    queryFn: () => api.decisionCenter({ account: f.account, from: f.from, to: f.to }),
    enabled: !!account,
  });
  const d = q.data;
  const cur = account?.currency ?? "BRL";
  const queue: any[] = d?.queue ?? [];

  return (
    <div>
      <PageTop
        title={
          <>
            {greeting()}. <span className="text-slate-400">{queue.length} decisões para hoje.</span>
          </>
        }
        subtitle="Central de decisão — mídia + comportamento no site."
      />
      <QueryState q={q} />

      {d && (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Score */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Score de performance integrada
              </div>
              <div className="mt-3 flex items-center gap-5">
                <ScoreGauge value={d.score} size={110} />
                <div>
                  <div className="text-lg font-semibold text-slate-900">{d.score_label}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>Eficiência {pct((d.score_parts?.eficiencia ?? 0) * 100, 0)}</span>
                    <span>Tendência {pct((d.score_parts?.tendencia ?? 0) * 100, 0)}</span>
                    <span>Engajamento {pct((d.score_parts?.engajamento ?? 0) * 100, 0)}</span>
                    <span>Dados {pct((d.score_parts?.saude_dados ?? 0) * 100, 0)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Fila de decisões (resumo) */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Fila de decisões</div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">{queue.length}</div>
              <div className="mt-1 text-xs text-slate-500">
                {queue.filter((i) => i.severidade === "urgente").length} urgentes ·{" "}
                {queue.filter((i) => i.severidade === "alto").length} alto impacto
              </div>
            </div>
          </div>

          {/* Pulso do negócio */}
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Pulso do negócio</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <KpiCard label="Investimento" value={brl(d.pulse.investimento, cur)} cur={d.pulse.investimento} prev={d.pulse.investimento_prev} invert />
              <KpiCard label="Conversões (Ads)" value={dec(d.pulse.conversoes, 1)} cur={d.pulse.conversoes} prev={d.pulse.conversoes_prev} />
              <KpiCard label="CPA" value={brl(d.pulse.cpa, cur)} />
              <KpiCard label="Sessões (GA4)" value={d.pulse.ga4_conectado ? int(d.pulse.sessoes) : "—"} cur={d.pulse.ga4_conectado ? d.pulse.sessoes : null} prev={d.pulse.ga4_conectado ? d.pulse.sessoes_prev : null} />
              <KpiCard label="Key events (GA4)" value={d.pulse.ga4_conectado ? dec(d.pulse.key_events, 1) : "—"} cur={d.pulse.ga4_conectado ? d.pulse.key_events : null} prev={d.pulse.ga4_conectado ? d.pulse.key_events_prev : null} />
              <KpiCard label="CPL (custo / key event)" value={d.pulse.cpl != null ? brl(d.pulse.cpl, cur) : "—"} />
            </div>
            {(d.pulse.leads_validos == null) && (
              <p className="mt-2 text-xs text-slate-400">
                Leads válidos, vendas, CAC real e ROAS confirmado aparecem quando o CRM for conectado.
              </p>
            )}
          </div>

          {/* Fila de decisões (detalhe) */}
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Priorizada por severidade × impacto</h2>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {queue.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-slate-400">
                  Sem decisões pendentes no período.
                </div>
              )}
              {queue.map((it, i) => (
                <div key={it.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">{it.titulo}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${SEV[it.severidade]?.cls}`}>
                        {SEV[it.severidade]?.label}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">{it.detalhe}</div>
                    <div className="mt-0.5 text-xs text-slate-600">→ {it.acao}</div>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{it.impacto_estimado}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Chart */}
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Investimento × conversões × sessões</h2>
            <div className="h-72 rounded-xl border border-slate-200 bg-white p-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={d.trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={shortDate} fontSize={11} stroke="#94a3b8" />
                  <YAxis yAxisId="l" fontSize={11} stroke="#94a3b8" />
                  <YAxis yAxisId="r" orientation="right" fontSize={11} stroke="#94a3b8" />
                  <Tooltip labelFormatter={(l) => shortDate(String(l))} formatter={(v: number, n) => (n === "Custo" ? brl(v, cur) : int(v))} />
                  <Legend />
                  <Bar yAxisId="l" dataKey="cost" name="Custo" fill="#bfdbfe" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Line yAxisId="r" type="monotone" dataKey="conversions" name="Conversões" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line yAxisId="r" type="monotone" dataKey="key_events" name="Key events" stroke="#059669" strokeWidth={2} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
