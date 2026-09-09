import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { usePage } from "../lib/usePage";

const NUCLEO = [
  { to: "/", label: "Central de decisão", end: true },
  { to: "/diagnostico", label: "Diagnóstico IA" },
  { to: "/saude-dados", label: "Saúde dos dados" },
];

const RELATORIOS = [
  { to: "/relatorios/visao-geral", label: "Visão geral" },
  { to: "/relatorios/analise-ia", label: "Análise IA (texto)" },
  { to: "/relatorios/campaigns", label: "Campanhas" },
  { to: "/relatorios/keywords", label: "Palavras‑chave" },
  { to: "/relatorios/search-terms", label: "Termos de busca" },
  { to: "/relatorios/geography", label: "Geografia" },
  { to: "/relatorios/schedule", label: "Horário & Dispositivo" },
  { to: "/relatorios/ads", label: "Anúncios" },
  { to: "/relatorios/audiences", label: "Públicos" },
  { to: "/relatorios/products", label: "Produtos" },
  { to: "/relatorios/landing-pages", label: "Landing pages" },
  { to: "/relatorios/waste", label: "Desperdício" },
  { to: "/relatorios/opportunities", label: "Oportunidades" },
];

function Section({
  label,
  items,
  search,
}: {
  label: string;
  items: { to: string; label: string; end?: boolean }[];
  search: string;
}) {
  return (
    <div className="mb-4">
      <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      {items.map((n) => (
        <NavLink
          key={n.to}
          to={{ pathname: n.to, search }}
          end={n.end}
          className={({ isActive }) =>
            `block rounded-md px-3 py-1.5 text-sm ${
              isActive ? "bg-brand/10 font-medium text-brand" : "text-slate-600 hover:bg-slate-100"
            }`
          }
        >
          {n.label}
        </NavLink>
      ))}
    </div>
  );
}

export function Shell() {
  const { accounts, account, f } = usePage();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const search = `?account=${encodeURIComponent(f.account)}&from=${f.from}&to=${f.to}`;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 flex w-56 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="grid h-7 w-7 place-items-center rounded bg-brand text-sm text-white">◧</span>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-900">DDLab</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Intelligence</div>
          </div>
        </div>

        <div className="px-3 pb-3">
          <label className="mb-1 block px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Workspace
          </label>
          <select
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium"
            value={f.account}
            onChange={(e) => f.setAccount(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2">
          <Section label="Núcleo" items={NUCLEO} search={search} />
          <Section label="Relatórios" items={RELATORIOS} search={search} />
          <Section label="" items={[{ to: "/configuracoes", label: "Configurações" }]} search={search} />
        </nav>

        <div className="border-t border-slate-100 px-4 py-3 text-[11px] text-slate-400">
          {me.data?.email}
          {account && <div className="mt-0.5 truncate">{account.name}</div>}
        </div>
      </aside>

      <main className="ml-56 flex-1 px-8 py-6">
        <div className="mx-auto max-w-[1400px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
