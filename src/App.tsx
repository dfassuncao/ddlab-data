import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./lib/api";
import { Overview } from "./pages/Overview";
import { AiAnalysis } from "./pages/AiAnalysis";
import { Competitors } from "./pages/Competitors";
import { ReportPage } from "./pages/ReportPage";
import { Schedule } from "./pages/Schedule";
import { Waste } from "./pages/Waste";
import { Opportunities } from "./pages/Opportunities";
import { Settings } from "./pages/Settings";

const NAV = [
  { to: "/", label: "Visão geral", end: true },
  { to: "/ai-analysis", label: "Análise IA" },
  { to: "/campaigns", label: "Campanhas" },
  { to: "/keywords", label: "Palavras‑chave" },
  { to: "/search-terms", label: "Termos de busca" },
  { to: "/geography", label: "Geografia" },
  { to: "/schedule", label: "Horário & Dispositivo" },
  { to: "/ads", label: "Anúncios" },
  { to: "/audiences", label: "Públicos" },
  { to: "/products", label: "Produtos" },
  { to: "/landing-pages", label: "Landing pages" },
  { to: "/waste", label: "Desperdício" },
  { to: "/opportunities", label: "Oportunidades" },
  { to: "/competitors", label: "Concorrentes" },
  { to: "/settings", label: "Configurações" },
];

export default function App() {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-5 py-3">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="grid h-7 w-7 place-items-center rounded bg-brand text-white">◧</span>
            DDLab · Ads Intelligence
          </div>
          <nav className="flex flex-1 flex-wrap gap-1 text-sm">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `rounded-md px-2.5 py-1.5 ${
                    isActive ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="text-xs text-slate-400">{me.data?.email}</div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-5 py-6">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/ai-analysis" element={<AiAnalysis />} />
          <Route path="/campaigns" element={<ReportPage kind="campaigns" title="Campanhas" />} />
          <Route path="/keywords" element={<ReportPage kind="keywords" title="Palavras‑chave" />} />
          <Route
            path="/search-terms"
            element={<ReportPage kind="search-terms" title="Termos de busca" showNegativeExport />}
          />
          <Route path="/geography" element={<ReportPage kind="geo" title="Geografia" />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/ads" element={<ReportPage kind="ads" title="Anúncios" />} />
          <Route path="/audiences" element={<ReportPage kind="audiences" title="Públicos" />} />
          <Route path="/products" element={<ReportPage kind="products" title="Produtos (Shopping/PMax)" />} />
          <Route
            path="/landing-pages"
            element={<ReportPage kind="landing-pages" title="Landing pages" />}
          />
          <Route path="/waste" element={<Waste />} />
          <Route path="/opportunities" element={<Opportunities />} />
          <Route path="/competitors" element={<Competitors />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
