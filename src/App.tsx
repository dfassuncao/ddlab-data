import { Route, Routes, Navigate } from "react-router-dom";
import { Shell } from "./components/Shell";
import { DecisionCenter } from "./pages/DecisionCenter";
import { Diagnostico } from "./pages/Diagnostico";
import { DataHealth } from "./pages/DataHealth";
import { Overview } from "./pages/Overview";
import { AiAnalysis } from "./pages/AiAnalysis";
import { ReportPage } from "./pages/ReportPage";
import { SearchConsole } from "./pages/SearchConsole";
import { Schedule } from "./pages/Schedule";
import { Waste } from "./pages/Waste";
import { Opportunities } from "./pages/Opportunities";
import { Settings } from "./pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        {/* Núcleo */}
        <Route path="/" element={<DecisionCenter />} />
        <Route path="/diagnostico" element={<Diagnostico />} />
        <Route path="/saude-dados" element={<DataHealth />} />

        {/* Relatórios (Google Ads) */}
        <Route path="/relatorios/visao-geral" element={<Overview />} />
        <Route path="/relatorios/analise-ia" element={<AiAnalysis />} />
        <Route path="/relatorios/campaigns" element={<ReportPage kind="campaigns" title="Campanhas" />} />
        <Route path="/relatorios/keywords" element={<ReportPage kind="keywords" title="Palavras‑chave" />} />
        <Route
          path="/relatorios/search-terms"
          element={<ReportPage kind="search-terms" title="Termos de busca" showNegativeExport />}
        />
        <Route path="/relatorios/geography" element={<ReportPage kind="geo" title="Geografia" />} />
        <Route path="/relatorios/schedule" element={<Schedule />} />
        <Route path="/relatorios/ads" element={<ReportPage kind="ads" title="Anúncios" />} />
        <Route path="/relatorios/audiences" element={<ReportPage kind="audiences" title="Públicos" />} />
        <Route path="/relatorios/products" element={<ReportPage kind="products" title="Produtos (Shopping/PMax)" />} />
        <Route path="/relatorios/landing-pages" element={<ReportPage kind="landing-pages" title="Landing pages" />} />
        <Route path="/relatorios/search-console" element={<SearchConsole />} />
        <Route path="/relatorios/waste" element={<Waste />} />
        <Route path="/relatorios/opportunities" element={<Opportunities />} />

        <Route path="/configuracoes" element={<Settings />} />

        {/* redirects de rotas antigas */}
        <Route path="/ai-analysis" element={<Navigate to="/relatorios/analise-ia" replace />} />
        <Route path="/campaigns" element={<Navigate to="/relatorios/campaigns" replace />} />
        <Route path="/settings" element={<Navigate to="/configuracoes" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
