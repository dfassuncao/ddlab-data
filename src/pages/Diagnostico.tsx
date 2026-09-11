import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { usePage } from "../lib/usePage";
import { PageTop } from "../components/PageTop";
import { QueryState } from "../components/PageHeader";
import { downloadCsv } from "../lib/csv";

const CAT: Record<string, { label: string; bar: string; chip: string }> = {
  critico: { label: "Crítico", bar: "border-l-rose-500", chip: "text-rose-600" },
  desperdicio: { label: "Desperdício", bar: "border-l-amber-500", chip: "text-amber-600" },
  oportunidade: { label: "Oportunidade", bar: "border-l-sky-500", chip: "text-sky-600" },
  escala: { label: "Escala", bar: "border-l-emerald-500", chip: "text-emerald-600" },
  criativo: { label: "Criativo", bar: "border-l-violet-500", chip: "text-violet-600" },
  mensuracao: { label: "Mensuração", bar: "border-l-slate-400", chip: "text-slate-500" },
};

export function Diagnostico() {
  const { account, f } = usePage();
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const latest = useQuery({
    queryKey: ["diagnostico", f.account],
    queryFn: () => api.diagnosticoLatest(f.account),
    enabled: !!account,
  });
  const history = useQuery({
    queryKey: ["diagnostico-history", f.account],
    queryFn: () => api.diagnosticoHistory(f.account),
    enabled: !!account,
  });
  const selected = useQuery({
    queryKey: ["diagnostico-record", f.account, selectedId],
    queryFn: () => api.diagnosticoById(f.account, selectedId!),
    enabled: !!account && selectedId != null,
  });
  const health = useQuery({
    queryKey: ["data-health", f.account],
    queryFn: () => api.dataHealth(f.account),
    enabled: !!account,
  });

  const gen = useMutation({
    mutationFn: () => api.diagnosticoGenerate({ account: f.account, from: f.from, to: f.to }),
    onMutate: () => setErr(null),
    onSuccess: (r) => {
      if (r?.error) {
        setErr(r.error);
        return;
      }
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["diagnostico", f.account] });
      qc.invalidateQueries({ queryKey: ["diagnostico-history", f.account] });
    },
    onError: (e: any) => setErr(e?.message ?? "Erro"),
  });

  useEffect(() => setSelectedId(null), [f.account]);

  const rows: { id: number; range_from: string; range_to: string; generated_at: string; generated_by?: string }[] =
    history.data?.rows ?? [];
  const isViewingSelected = selectedId != null;
  const data = isViewingSelected ? selected.data?.data ?? null : gen.data?.data ?? latest.data?.data ?? null;
  const record = isViewingSelected ? selected.data?.record : latest.data?.latest;
  const lowConfidence = (health.data?.score ?? 100) < 80;

  return (
    <div>
      <PageTop
        title="Diagnóstico IA"
        subtitle="O que mudou, por que mudou e o que fazer."
        actions={
          <button
            onClick={() => gen.mutate()}
            disabled={gen.isPending || !account}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {gen.isPending ? "Gerando…" : "Gerar diagnóstico"}
          </button>
        }
      />
      <QueryState q={latest} />

      {rows.length > 0 && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Histórico de diagnósticos
          </div>
          <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto">
            {rows.map((r) => {
              const isSelected = selectedId == null ? r.id === rows[0].id : r.id === selectedId;
              return (
                <li key={r.id}>
                  <button
                    onClick={() => setSelectedId(r.id)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                      isSelected ? "bg-brand/5 font-medium text-brand" : "text-slate-700"
                    }`}
                  >
                    <span>
                      {new Date(r.generated_at).toLocaleString("pt-BR")}
                      <span className="ml-2 text-xs text-slate-400">
                        período {r.range_from} a {r.range_to}
                      </span>
                    </span>
                    {r.generated_by && <span className="text-xs text-slate-400">{r.generated_by}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {lowConfidence && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Confiança dos dados em {health.data?.score}%. Recomendações de automação ficam bloqueadas
          abaixo de 80% — trate primeiro a Saúde dos dados.
        </p>
      )}
      {err && (
        <p className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p>
      )}
      {gen.isPending && (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
          Analisando {account?.name}… 10 a 40 segundos.
        </p>
      )}

      {!gen.isPending && isViewingSelected && selected.isLoading && (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
          Carregando diagnóstico selecionado…
        </p>
      )}

      {!gen.isPending && data && !(isViewingSelected && selected.isLoading) && (
        <div className="space-y-6">
          {record && (
            <p className="text-xs text-slate-400">
              Gerado em {new Date(record.generated_at).toLocaleString("pt-BR")} · período {record.range_from} a{" "}
              {record.range_to} · {record.model}
            </p>
          )}
          {data.resumo && <p className="text-sm text-slate-700">{data.resumo}</p>}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(data.findings ?? []).map((fd: any, i: number) => {
              const c = CAT[fd.categoria] ?? CAT.mensuracao;
              return (
                <div key={i} className={`rounded-lg border border-slate-200 border-l-4 bg-white p-4 ${c.bar}`}>
                  <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide">
                    <span className={c.chip}>{c.label}</span>
                    <span className="text-slate-400">{fd.confianca}% confiança</span>
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{fd.titulo}</div>
                  <p className="mt-1 text-xs text-slate-600">{fd.evidencia}</p>
                  <div className="mt-2 text-xs font-medium text-slate-700">{fd.impacto}</div>
                  <div className="mt-1 text-xs text-slate-600">→ {fd.acao}</div>
                </div>
              );
            })}
          </div>

          {(data.causal ?? []).length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-slate-700">Explicação causal</h2>
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Mudança</th>
                      <th className="px-3 py-2">Evidência cruzada</th>
                      <th className="px-3 py-2">Efeito</th>
                      <th className="px-3 py-2">Confiança</th>
                      <th className="px-3 py-2">Próxima ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.causal.map((r: any, i: number) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-2">{r.mudanca}</td>
                        <td className="px-3 py-2 text-slate-500">{r.evidencia_cruzada}</td>
                        <td className="px-3 py-2">{r.efeito}</td>
                        <td className="num px-3 py-2">{r.confianca}%</td>
                        <td className="px-3 py-2 text-slate-600">{r.proxima_acao}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Checklist de ações</h2>
            <ul className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
              {(data.findings ?? [])
                .slice()
                .sort((a: any, b: any) => (b.confianca ?? 0) - (a.confianca ?? 0))
                .map((fd: any, i: number) => {
                  const termos: string[] = fd.termos_negativos ?? [];
                  const estrutura: { grupo: string; itens?: string[] }[] = fd.estrutura_sugerida ?? [];
                  return (
                    <li key={i} className="flex gap-2">
                      <input type="checkbox" className="mt-1" />
                      <div className="flex-1">
                        <span>
                          {fd.acao} <span className="text-slate-400">— {fd.impacto}</span>
                        </span>

                        {termos.length > 0 && (
                          <div className="mt-1">
                            <button
                              onClick={() =>
                                downloadCsv(
                                  `negativas-diagnostico-${i + 1}.csv`,
                                  ["Keyword", "Match Type", "Level"],
                                  termos.map((t) => [t, "Phrase", "Campaign"]),
                                )
                              }
                              className="text-xs font-medium text-brand hover:underline"
                            >
                              ↓ Baixar lista de negativas ({termos.length} termo{termos.length > 1 ? "s" : ""})
                            </button>
                          </div>
                        )}

                        {estrutura.length > 0 && (
                          <div className="mt-1.5 space-y-1 rounded-md bg-slate-50 p-2">
                            {estrutura.map((g, gi) => (
                              <div key={gi} className="text-xs">
                                <span className="font-medium text-slate-700">{g.grupo}</span>
                                {(g.itens ?? []).length > 0 && (
                                  <span className="text-slate-500"> — {g.itens!.join(", ")}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
            </ul>
          </div>
        </div>
      )}

      {!gen.isPending && !data && !latest.isLoading && !isViewingSelected && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
          Nenhum diagnóstico gerado ainda para {account?.name}. Clique em "Gerar diagnóstico".
        </p>
      )}
    </div>
  );
}
