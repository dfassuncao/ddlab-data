import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { api } from "../lib/api";
import { usePage } from "../lib/usePage";
import { PageHeader, QueryState } from "../components/PageHeader";
import { ProfileBanner } from "../components/ProfileBanner";

export function AiAnalysis() {
  const { accounts, account, f } = usePage();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const latest = useQuery({
    queryKey: ["analysis", f.account],
    queryFn: () => api.analysisLatest(f.account),
    enabled: !!account,
  });

  const generate = useMutation({
    mutationFn: () => api.analysisGenerate({ account: f.account, from: f.from, to: f.to }),
    onMutate: () => setError(null),
    onSuccess: (res) => {
      if (res?.error) {
        setError(res.error);
        return;
      }
      qc.invalidateQueries({ queryKey: ["analysis", f.account] });
    },
    onError: (e: any) => setError(e?.message ?? "Erro desconhecido"),
  });

  const record = latest.data?.latest;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Análise IA"
        subtitle="Leitura em linguagem natural dos dados do período, considerando o perfil do cliente ideal."
        accounts={accounts}
        f={f}
        actions={
          <button
            onClick={() => generate.mutate()}
            disabled={generate.isPending || !account}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {generate.isPending ? "Gerando…" : "Gerar análise"}
          </button>
        }
      />
      {account && <ProfileBanner account={account} />}

      <p className="text-xs text-slate-400">
        Cada clique em "Gerar análise" chama a API da Anthropic e consome créditos da sua conta —
        gere quando quiser uma leitura nova, não é automático. O período usado é o filtro acima
        ({f.from} a {f.to}).
      </p>

      <QueryState q={latest} />
      {(error || generate.isError) && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error ?? (generate.error as Error)?.message}
        </p>
      )}

      {generate.isPending && (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
          Analisando dados de {account?.name}… pode levar de 10 a 30 segundos.
        </p>
      )}

      {!generate.isPending && record && (
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-5">
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <span>
              Gerada em {new Date(record.generated_at).toLocaleString("pt-BR")} por {record.generated_by ?? "—"}
            </span>
            <span>· período {record.range_from} a {record.range_to}</span>
            <span>· modelo {record.model}</span>
          </div>
          <article className="prose prose-sm prose-slate max-w-none prose-h2:mt-5 prose-h2:text-base prose-h2:font-semibold prose-headings:text-slate-800">
            <ReactMarkdown>{record.content}</ReactMarkdown>
          </article>
        </div>
      )}

      {!generate.isPending && !record && !latest.isLoading && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
          Nenhuma análise gerada ainda para {account?.name}. Clique em "Gerar análise".
        </p>
      )}
    </div>
  );
}
