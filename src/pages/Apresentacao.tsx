import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { usePage } from "../lib/usePage";
import { PageHeader } from "../components/PageHeader";
import { downloadJson } from "../lib/csv";

export function Apresentacao() {
  const { accounts, account, f } = usePage();
  const [comparativo, setComparativo] = useState(true);
  const [contexto, setContexto] = useState("");

  const gerar = useMutation({
    mutationFn: () => api.presentationData({ account: f.account, from: f.from, to: f.to, comparar: comparativo }),
    onSuccess: (data) => {
      const slug = (account?.name ?? "conta").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      downloadJson(`apresentacao-${slug}-${data.periodo.from}_a_${data.periodo.to}.json`, {
        ...data,
        contexto_briefing: contexto.trim() || null,
      });
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Apresentação"
        subtitle="Exporta um pacote de dados (Ads + Search Console + Google Analytics) do período — e do período anterior, se marcado — para gerar a apresentação em PPTX/PDF numa conversa com a IA."
        accounts={accounts}
        f={f}
      />

      <div className="max-w-2xl space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={comparativo}
              onChange={(e) => setComparativo(e.target.checked)}
            />
            Comparar com o período anterior de mesma duração
          </label>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Contexto / briefing</label>
          <textarea
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            rows={4}
            placeholder='Ex.: "Fazer uma apresentação de recorrência, mensal, dando ênfase em números que mostrem que o trabalho de SEO e Mídia Paga foram ótimos. Dar um contexto de seriedade e motivador."'
            value={contexto}
            onChange={(e) => setContexto(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-400">
            Vai junto no arquivo exportado — cole esse arquivo numa conversa pedindo a apresentação.
          </p>
        </div>

        <button
          onClick={() => gerar.mutate()}
          disabled={!account || gerar.isPending}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {gerar.isPending ? "Gerando…" : "Gerar pacote de dados (JSON)"}
        </button>

        {gerar.isSuccess && (
          <p className="text-xs text-emerald-600">
            Arquivo baixado. Envie-o numa conversa com a IA junto do briefing para gerar o PPTX/PDF.
          </p>
        )}
        {gerar.isError && (
          <p className="text-xs text-rose-600">Erro: {(gerar.error as Error)?.message ?? "desconhecido"}</p>
        )}
      </div>
    </div>
  );
}
