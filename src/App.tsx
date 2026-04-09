import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import ProtectedLayout from "@/components/ProtectedLayout";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeProvider>
        <TooltipProvider>
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
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
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
