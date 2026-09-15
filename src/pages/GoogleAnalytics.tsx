import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { usePage } from "../lib/usePage";
import { PageHeader, QueryState } from "../components/PageHeader";
import { DataTable, type Column } from "../components/DataTable";
import { int, pct, sumBy } from "../lib/format";

type Ga4Row = {
  channel: string;
  sessions: number;
  active_users: number;
  page_views: number;
  key_events: number;
  bounce_rate: number | null;
};

const COLUMNS: Column<Ga4Row>[] = [
  { key: "channel", header: "Canal", render: (r) => r.channel },
  {
    key: "active_users",
    header: "Usuários",
    align: "right",
    render: (r) => int(r.active_users),
    total: (rows) => int(sumBy(rows, "active_users")),
  },
  {
    key: "sessions",
    header: "Sessões",
    align: "right",
    render: (r) => int(r.sessions),
    total: (rows) => int(sumBy(rows, "sessions")),
  },
  {
    key: "page_views",
    header: "Pageviews",
    align: "right",
    render: (r) => int(r.page_views),
    total: (rows) => int(sumBy(rows, "page_views")),
  },
  {
    key: "key_events",
    header: "Leads",
    align: "right",
    render: (r) => int(r.key_events),
    total: (rows) => int(sumBy(rows, "key_events")),
  },
  {
    key: "bounce_rate",
    header: "Taxa de rejeição",
    align: "right",
    render: (r) => (r.bounce_rate == null ? "—" : pct(r.bounce_rate)),
    sortValue: (r) => r.bounce_rate ?? -1,
  },
];

export function GoogleAnalytics() {
  const { accounts, account, f } = usePage();

  const q = useQuery({
    queryKey: ["ga4", f.account, f.from, f.to],
    queryFn: () => api.ga4({ account: f.account, from: f.from, to: f.to }),
    enabled: !!account && !!account.ga4_dataset,
  });

  const rows: Ga4Row[] = q.data?.rows ?? [];
  const notConnected = !account?.ga4_dataset;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Google Analytics"
        subtitle="Usuários, sessões, pageviews, leads (key events) e taxa de rejeição por canal de aquisição, direto do GA4."
        accounts={accounts}
        f={f}
      />

      {notConnected ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
          Google Analytics não conectado para {account?.name}. Preencha o dataset do bulk export em
          Configurações.
        </p>
      ) : (
        <>
          <QueryState q={q} />
          {q.data && (
            <>
              <p className="text-xs text-slate-400">
                {rows.length} canais · {q.data.range.from} a {q.data.range.to}
              </p>
              <DataTable
                rows={rows}
                rowKey={(r) => r.channel}
                initialSort={{ key: "sessions", dir: "desc" }}
                columns={COLUMNS}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
