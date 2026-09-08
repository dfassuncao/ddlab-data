import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { usePage } from "../lib/usePage";
import { PageTop } from "../components/PageTop";
import { QueryState } from "../components/PageHeader";
import { ScoreGauge } from "../components/ScoreGauge";

const STATUS: Record<string, { label: string; cls: string }> = {
  ok: { label: "OK", cls: "bg-emerald-100 text-emerald-700" },
  atrasado: { label: "Atrasado", cls: "bg-amber-100 text-amber-700" },
  erro: { label: "Erro", cls: "bg-rose-100 text-rose-700" },
  off: { label: "Não conectado", cls: "bg-slate-100 text-slate-500" },
};
const SEV: Record<string, string> = {
  urgente: "bg-rose-100 text-rose-700",
  alto: "bg-amber-100 text-amber-700",
  revisar: "bg-slate-100 text-slate-600",
};

export function DataHealth() {
  const { account, f } = usePage();
  const q = useQuery({
    queryKey: ["data-health", f.account],
    queryFn: () => api.dataHealth(f.account),
    enabled: !!account,
  });
  const d = q.data;

  return (
    <div>
      <PageTop
        title="Saúde dos dados"
        subtitle="Confiabilidade da mensuração e das integrações."
        hidePills
      />
      <QueryState q={q} />

      {d && (
        <div className="space-y-6">
          <div className="flex items-center gap-5 rounded-xl border border-slate-200 bg-white p-5">
            <ScoreGauge value={d.score} size={110} />
            <div>
              <div className="text-lg font-semibold text-slate-900">
                {d.score >= 85 ? "Mensuração confiável" : d.score >= 70 ? "Mensuração aceitável" : "Mensuração comprometida"}
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {d.alerts.length === 0
                  ? "Todas as fontes atualizadas e consistentes."
                  : `${d.alerts.length} ponto(s) afetam a leitura dos dados.`}
              </p>
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Checklist de integrações</h2>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {d.sources.map((s: any) => (
                <div key={s.key} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{s.label}</div>
                    <div className="text-xs text-slate-500">{s.last_day ? `dados até ${s.last_day}` : "—"}</div>
                  </div>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS[s.status]?.cls}`}>
                    {STATUS[s.status]?.label ?? s.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Alertas de qualidade</h2>
            {d.alerts.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
                Nenhum alerta.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {d.alerts.map((a: any, i: number) => (
                  <div key={i} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{a.titulo}</div>
                      <div className="text-xs text-slate-500">{a.detalhe}</div>
                    </div>
                    <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${SEV[a.severidade] ?? SEV.revisar}`}>
                      {a.severidade}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-slate-400">
            Regra de proteção: recomendações de automação no Diagnóstico IA ficam bloqueadas quando a
            confiança dos dados cai abaixo de 80%.
          </p>
        </div>
      )}
    </div>
  );
}
