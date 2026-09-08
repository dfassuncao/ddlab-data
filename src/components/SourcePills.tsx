import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

const DOT: Record<string, string> = {
  ok: "bg-emerald-500",
  atrasado: "bg-amber-500",
  erro: "bg-rose-500",
  off: "bg-slate-300",
};

export function SourcePills({ account }: { account: string }) {
  const q = useQuery({
    queryKey: ["data-health", account],
    queryFn: () => api.dataHealth(account),
    enabled: !!account,
  });
  const sources: any[] = q.data?.sources ?? [
    { key: "ads", label: "Google Ads", status: "off" },
    { key: "ga4", label: "GA4", status: "off" },
    { key: "gsc", label: "Search Console", status: "off" },
    { key: "crm", label: "CRM", status: "off" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {sources.map((s) => (
        <span
          key={s.key}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600"
          title={s.last_day ? `dados até ${s.last_day}` : s.status === "off" ? "não conectado" : s.status}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${DOT[s.status] ?? "bg-slate-300"}`} />
          {s.label}
        </span>
      ))}
      {q.data?.score != null && (
        <span className="text-slate-400">· confiança dos dados {q.data.score}%</span>
      )}
    </div>
  );
}
