import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { usePage } from "../lib/usePage";

const NUCLEO = [
  { to: "/", label: "Central de decisão", end: true },
  { to: "/diagnostico", label: "Diagnóstico IA" },
  { to: "/saude-dados", label: "Saúde dos dados" },
  { to: "/acoes-pendentes", label: "Ações pendentes" },
];

const RELATORIOS_GERAL = [
  { to: "/relatorios/visao-geral", label: "Visão geral" },
  { to: "/relatorios/analise-ia", label: "Análise IA (texto)" },
];

const RELATORIOS_ADS = [
  { to: "/relatorios/campaigns", label: "Campanhas" },
  { to: "/relatorios/keywords", label: "Palavras‑chave" },
  { to: "/relatorios/search-terms", label: "Termos de busca" },
  { to: "/relatorios/geography", label: "Geografia" },
  { to: "/relatorios/schedule", label: "Horário & Dispositivo" },
  { to: "/relatorios/ads", label: "Anúncios" },
  { to: "/relatorios/audiences", label: "Públicos" },
  { to: "/relatorios/products", label: "Produtos" },
  { to: "/relatorios/landing-pages", label: "Landing pages" },
];

const RELATORIOS_ORGANICO = [
  { to: "/relatorios/search-console", label: "Search Console" },
  { to: "/relatorios/google-analytics", label: "Google Analytics" },
  { to: "/relatorios/classificacao-termos", label: "Classificação de termos" },
];

const RELATORIOS_OTIMIZACAO = [
  { to: "/relatorios/waste", label: "Desperdício" },
  { to: "/relatorios/opportunities", label: "Oportunidades" },
];

const RELATORIOS_OUTROS = [{ to: "/relatorios/apresentacao", label: "Apresentação" }];

type NavItem = { to: string; label: string; end?: boolean };

function NavItems({ items, search }: { items: NavItem[]; search: string }) {
  return (
    <>
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
    </>
  );
}

function Section({ label, items, search }: { label: string; items: NavItem[]; search: string }) {
  return (
    <div className="mb-4">
      <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <NavItems items={items} search={search} />
    </div>
  );
}

// "Relatórios" agrupa vários sub-temas (Google Ads, Orgânico/Analytics,
// Otimização) — um cabeçalho secundário mais discreto separa cada um, sem
// repetir o peso visual do cabeçalho principal da seção.
function GroupedSection({
  label,
  groups,
  search,
}: {
  label: string;
  groups: { subLabel?: string; items: NavItem[] }[];
  search: string;
}) {
  return (
    <div className="mb-4">
      <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      {groups.map((g, i) => (
        <div key={g.subLabel ?? i} className={i > 0 ? "mt-2" : undefined}>
          {g.subLabel && <div className="px-3 py-0.5 text-[10px] text-slate-400">{g.subLabel}</div>}
          <NavItems items={g.items} search={search} />
        </div>
      ))}
    </div>
  );
}

const COLLAPSE_KEY = "ddlab.sidebar.collapsed";

export function Shell() {
  const { accounts, account, f } = usePage();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const search = `?account=${encodeURIComponent(f.account)}&from=${f.from}&to=${f.to}`;

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // localStorage indisponível (modo privado etc.) — ok ignorar
      }
      return next;
    });
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside
        className={`fixed inset-y-0 left-0 flex flex-col border-r border-slate-200 bg-white transition-[width] duration-150 ${
          collapsed ? "w-14" : "w-56"
        }`}
      >
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-brand text-sm text-white">◧</span>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold text-slate-900">DDLab</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Intelligence</div>
            </div>
          )}
        </div>

        {!collapsed && (
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
        )}

        {!collapsed && (
          <nav className="flex-1 overflow-y-auto px-2 py-2">
            <Section label="Núcleo" items={NUCLEO} search={search} />
            <GroupedSection
              label="Relatórios"
              groups={[
                { items: RELATORIOS_GERAL },
                { subLabel: "Google Ads", items: RELATORIOS_ADS },
                { subLabel: "Orgânico & Analytics", items: RELATORIOS_ORGANICO },
                { subLabel: "Otimização", items: RELATORIOS_OTIMIZACAO },
                { items: RELATORIOS_OUTROS },
              ]}
              search={search}
            />
            <Section label="" items={[{ to: "/configuracoes", label: "Configurações" }]} search={search} />
          </nav>
        )}
        {collapsed && <div className="flex-1" />}

        <button
          onClick={toggle}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className="mx-2 mb-2 rounded-md border border-slate-200 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
        >
          {collapsed ? "»" : "« Recolher"}
        </button>

        {!collapsed && (
          <div className="border-t border-slate-100 px-4 py-3 text-[11px] text-slate-400">
            {me.data?.email}
            {account && <div className="mt-0.5 truncate">{account.name}</div>}
          </div>
        )}
      </aside>

      <main className={`flex-1 px-8 py-6 transition-[margin] duration-150 ${collapsed ? "ml-14" : "ml-56"}`}>
        <div className="mx-auto max-w-[1400px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
