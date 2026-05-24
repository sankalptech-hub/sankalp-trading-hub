import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { TradingModeProvider } from "@/contexts/TradingModeContext";
import ProtectedLayout from "@/components/ProtectedLayout";
import RiskDisclosureModal from "@/components/marketing/RiskDisclosureModal";
import Landing from "./pages/marketing/Landing";
import Features from "./pages/marketing/Features";
import MlmInfo from "./pages/marketing/MlmInfo";
import StaticPage from "./pages/marketing/StaticPage";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Trade from "./pages/Trade";
import Scanner from "./pages/Scanner";
import Watchlist from "./pages/Watchlist";
import Builder from "./pages/Builder";
import Backtest from "./pages/Backtest";
import Strategies from "./pages/Strategies";
import History from "./pages/History";
import Analytics from "./pages/Analytics";
import Risk from "./pages/Risk";
import Brokers from "./pages/Brokers";
import Alerts from "./pages/Alerts";
import AIAssistant from "./pages/AIAssistant";
import BuildTracker from "./pages/BuildTracker";
import Settings from "./pages/Settings";
import AdminPanel from "./pages/AdminPanel";
import AssetAnalysis from "./pages/AssetAnalysis";
import EAs from "./pages/EAs";
import EADetail from "./pages/EADetail";
import Positions from "./pages/Positions";
import OptionsScreener from "./pages/OptionsScreener";
import OptionsWatchlist from "./pages/OptionsWatchlist";
import MarketAnalysis from "./pages/MarketAnalysis";
import MoneyFlow from "./pages/MoneyFlow";
import AssociateDashboard from "./pages/AssociateDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const [showRisk, setShowRisk] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem('tradesphere_risk_accepted')) setShowRisk(true);
  }, []);
  const acceptRisk = () => {
    localStorage.setItem('tradesphere_risk_accepted', 'yes');
    setShowRisk(false);
  };

  return (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeProvider>
        <TradingModeProvider>
        <TooltipProvider>
          <Sonner />
          {showRisk && <RiskDisclosureModal onAccept={acceptRisk} />}
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/features" element={<Features />} />
              <Route path="/mlm-info" element={<MlmInfo />} />
              <Route path="/privacy-policy" element={<StaticPage slug="privacy" />} />
              <Route path="/terms-of-service" element={<StaticPage slug="terms" />} />
              <Route path="/payment-refund-policy" element={<StaticPage slug="refund" />} />
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/trade" element={<Trade />} />
                <Route path="/scanner" element={<Scanner />} />
                <Route path="/watchlist" element={<Watchlist />} />
                <Route path="/builder" element={<Builder />} />
                <Route path="/backtest" element={<Backtest />} />
                <Route path="/strategies" element={<Strategies />} />
                <Route path="/history" element={<History />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/asset-analysis" element={<AssetAnalysis />} />
                <Route path="/eas" element={<EAs />} />
                <Route path="/eas/:id" element={<EADetail />} />
                <Route path="/positions" element={<Positions />} />
                <Route path="/options-screener" element={<OptionsScreener />} />
                <Route path="/options-watchlist" element={<OptionsWatchlist />} />
                <Route path="/market-analysis" element={<MarketAnalysis />} />
                <Route path="/money-flow" element={<MoneyFlow />} />
                <Route path="/associate" element={<AssociateDashboard />} />
                <Route path="/risk" element={<Risk />} />
                <Route path="/brokers" element={<Brokers />} />
                <Route path="/alerts" element={<Alerts />} />
                <Route path="/ai-assistant" element={<AIAssistant />} />
                <Route path="/build-tracker" element={<BuildTracker />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/admin" element={<AdminPanel />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
        </TradingModeProvider>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
  );
};

export default App;
