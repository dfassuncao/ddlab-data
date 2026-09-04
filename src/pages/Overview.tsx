import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { usePage } from "../lib/usePage";
import { PageHeader, QueryState } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { TrendChart } from "../components/TrendChart";
import { FreshnessBadge } from "../components/FreshnessBadge";
import { ProfileBanner } from "../components/ProfileBanner";
import { DataTable } from "../components/DataTable";
import { metricCols } from "../lib/columns";
import { brl, dec, int, pct } from "../lib/format";

export function Overview() {
  const { accounts, account, f } = usePage();
  const q = useQuery({
    queryKey: ["overview", f.account, f.from, f.to],
    queryFn: () => api.overview({ account: f.account, from: f.from, to: f.to }),
    enabled: !!account,
  });
  const d = q.data;
  const cur = account?.currency ?? "BRL";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Visão geral"
        subtitle="Saúde da conta no período — comece por aqui."
        accounts={accounts}
        f={f}
      />
      <QueryState q={q} />
      {account && <ProfileBanner account={account} />}
      {d && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FreshnessBadge rows={d.freshness} />
            {d.pacing.monthly_budget != null && (
              <div className="text-xs text-slate-500">
                Mês: {brl(d.pacing.month_cost, cur)} de {brl(d.pacing.monthly_budget, cur)} · projeção{" "}
                {brl(d.pacing.projected_month_cost, cur)}
                {d.pacing.target_cpa != null && (
                  <> · meta CPA {brl(d.pacing.target_cpa, cur)} (atual {brl(d.pacing.cpa, cur)})</>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <KpiCard label="Custo" value={brl(d.totals.current.cost, cur)} cur={d.totals.current.cost} prev={d.totals.previous?.cost} invert />
            <KpiCard label="Conversões" value={dec(d.totals.current.conversions, 1)} cur={d.totals.current.conversions} prev={d.totals.previous?.conversions} />
            <KpiCard label="CPA" value={brl(d.totals.current.cpa, cur)} cur={d.totals.current.cpa} prev={d.totals.previous?.cpa} invert />
            <KpiCard label="Cliques" value={int(d.totals.current.clicks)} cur={d.totals.current.clicks} prev={d.totals.previous?.clicks} />
            <KpiCard label="CTR" value={pct(d.totals.current.ctr)} cur={d.totals.current.ctr} prev={d.totals.previous?.ctr} />
            <KpiCard label="ROAS" value={d.totals.current.roas == null ? "—" : `${dec(d.totals.current.roas, 2)}x`} cur={d.totals.current.roas} prev={d.totals.previous?.roas} />
          </div>

          <TrendChart data={d.trend} />

          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Campanhas</h2>
            <DataTable
              rows={d.campaigns}
              rowKey={(r) => r.campaign_id}
              initialSort={{ key: "cost", dir: "desc" }}
              columns={[
                {
                  key: "name",
                  header: "Campanha",
                  render: (r) => (
                    <span>
                      {r.name}
                      {r.status && r.status !== "ENABLED" && (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                          {r.status}
                        </span>
                      )}
                    </span>
                  ),
                },
                ...metricCols(cur),
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}
