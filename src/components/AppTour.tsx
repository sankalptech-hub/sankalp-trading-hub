import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Rocket, LayoutDashboard, Eye, Zap, LineChart, Cpu, Plug,
  ShieldCheck, Bell, Users, Brain, Trophy, ChevronLeft, ChevronRight, X,
  Layers3, Filter, Briefcase,
  Banknote,
} from 'lucide-react';

const TOUR_KEY = 'tradesphere_tour_completed_v3';

type Step = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  tip: string;
  route?: string;
  cta?: string;
};

const STEPS: Step[] = [
  {
    icon: Rocket,
    title: 'Welcome to TradeSphere',
    body: 'Your all-in-one platform to trade Forex, Stocks and Options — with live market data, AI insights, automated strategies and a referral income network.',
    tip: 'You start in safe Paper Trading mode with ₹1,00,000 virtual balance. Switch to Live anytime once you connect a real broker.',
  },
  {
    icon: LayoutDashboard,
    title: 'Dashboard',
    body: 'See your open positions, pending orders, fresh signals and unread alerts at a glance. Toggle Paper / Live mode from the top right of every page.',
    tip: 'The mode toggle stays synced across Dashboard, Trade and Brokers pages.',
    route: '/dashboard',
    cta: 'Open Dashboard',
  },
  {
    icon: Eye,
    title: 'Watchlists & Market Data',
    body: 'Track symbols across NSE, BSE, NYSE, NASDAQ and Forex. Prices stream from Twelve Data with Yahoo Finance fallback, cached for 60 seconds.',
    tip: 'Click any watchlist symbol to jump into Trade with the symbol pre-filled.',
    route: '/watchlist',
    cta: 'Open Watchlists',
  },
  {
    icon: Layers3,
    title: 'Options Watchlist',
    body: 'Track CE / PE strikes for NIFTY, BANKNIFTY, FINNIFTY and any stock alongside plain equity tickers. Each row shows live spot, strike distance %, ITM / ATM / OTM badge, days-to-expiry and lot size.',
    tip: 'Add weekly expiries close to spot for fast-decaying premium plays — and keep an eye on the "Expiring ≤ 7d" counter at the top.',
    route: '/options-watchlist',
    cta: 'Open Options Watchlist',
  },
  {
    icon: Filter,
    title: 'Options Screener',
    body: 'Filter the option chain by underlying, expiry, moneyness and liquidity to find high-probability strikes before adding them to your watchlist.',
    tip: 'Pair the screener with the Options Watchlist — screen → shortlist → track → trade.',
    route: '/options-screener',
    cta: 'Open Options Screener',
  },
  {
    icon: Zap,
    title: 'Place Your First Trade',
    body: 'Enter a symbol, quantity and side, then Execute. Generate a BUY/SELL signal first if you want a quick read on the symbol.',
    tip: 'In Paper mode, trades are simulated — perfect for learning without risk.',
    route: '/trade',
    cta: 'Open Trade Console',
  },
  {
    icon: Briefcase,
    title: 'Positions & History',
    body: 'Live positions show unrealised P&L and exposure across currencies. History gives you closed-trade analytics — win rate, average R, holding time.',
    tip: 'Review History weekly. Cut strategies whose win-rate slips below your backtest baseline.',
    route: '/positions',
    cta: 'Open Positions',
  },
  {
    icon: LineChart,
    title: 'Scanner & Backtest',
    body: 'Run technical scans across indices, test strategies on historical data, and inspect single assets in deep analysis mode before committing capital.',
    tip: 'Always backtest a strategy on 6-12 months of data before deploying it live.',
    route: '/scanner',
    cta: 'Open Scanner',
  },
  {
    icon: Banknote,
    title: 'Smart Money Flow',
    body: 'Open this every morning. See exactly where money is flowing — sector by sector, index pulse, top inflows / outflows, and a Smart Money panel showing names with 1.3-1.5x average volume. Toggle Intraday / Weekly / Monthly to pick the right setup.',
    tip: 'Trade with the flow: pick a stock from the green sectors, confirm on Scanner, then add to Options Watchlist.',
    route: '/money-flow',
    cta: 'Open Money Flow',
  },
  {
    icon: Cpu,
    title: 'Expert Advisors & Strategy Marketplace',
    body: 'Deploy back-tested EAs for Forex, Stocks and Options in one click. Each strategy shows win rate, profit factor, max drawdown, target return and holding time.',
    tip: 'Start with a Low-risk strategy in Paper mode. Pause anytime from the EA list.',
    route: '/eas',
    cta: 'Browse Strategies',
  },
  {
    icon: Plug,
    title: 'Connect a Real Broker',
    body: 'When you are ready for real money, connect Alpaca, Zerodha, OANDA, IBKR and more. Paper sandboxes are available for safe testing.',
    tip: 'Once a live broker is connected, flip the Paper / Live switch to route orders there.',
    route: '/brokers',
    cta: 'View Brokers',
  },
  {
    icon: ShieldCheck,
    title: 'Risk Management',
    body: 'Set daily loss limits, max position size, max concentration and max open positions. TradeSphere blocks trades that breach your rules.',
    tip: 'Conservative defaults: 2% per trade, 6% daily loss cap. Edit anytime in Risk.',
    route: '/risk',
    cta: 'Configure Risk',
  },
  {
    icon: Bell,
    title: 'Alerts & AI Assistant',
    body: 'Get notified on price moves, EA fills and risk breaches. Ask the AI Assistant anything — market context, strategy ideas, position analysis.',
    tip: 'The AI sees your portfolio and watchlists, so its answers are personalized.',
    route: '/ai-assistant',
    cta: 'Try AI Assistant',
  },
  {
    icon: Users,
    title: 'Earn with the Associate Network',
    body: 'Share your referral code and earn commission across 5 levels as your network trades. Track downline, rank and payouts from the Associate Hub.',
    tip: 'Your referral code is on the Associate page. Share it on socials or with friends.',
    route: '/associate',
    cta: 'Open Associate Hub',
  },
  {
    icon: Trophy,
    title: 'You Are Ready to Trade',
    body: 'Quick playbook to make money: 1) Pick a strategy from the marketplace. 2) Backtest it. 3) Deploy in Paper. 4) Once profitable, connect a live broker. 5) Scale gradually using Risk rules.',
    tip: 'You can restart this tour anytime from Settings → Restart App Tour.',
  },
];

export const shouldShowTour = () => {
  try { return !localStorage.getItem(TOUR_KEY); } catch { return false; }
};

export const resetTour = () => {
  try { localStorage.removeItem(TOUR_KEY); } catch { /* no-op */ }
};

export const AppTour = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  useEffect(() => { if (open) setStep(0); }, [open]);

  const finish = () => {
    try { localStorage.setItem(TOUR_KEY, new Date().toISOString()); } catch { /* no-op */ }
    onClose();
  };

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;
  const progress = ((step + 1) / STEPS.length) * 100;

  const goTo = () => { if (current.route) navigate(current.route); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) finish(); }}>
      <DialogContent className="max-w-xl p-0 overflow-hidden border-primary/30">
        <div className="bg-gradient-to-br from-primary/15 via-background to-background p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <Badge variant="outline" className="text-[10px] mb-1">Step {step + 1} of {STEPS.length}</Badge>
                <h2 className="text-xl font-bold leading-tight">{current.title}</h2>
              </div>
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={finish} aria-label="Skip tour">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <Progress value={progress} className="h-1.5" />

          <p className="text-sm text-foreground/90 leading-relaxed">{current.body}</p>

          <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
            <p className="text-xs text-primary/90 flex gap-2">
              <Brain className="h-4 w-4 shrink-0 mt-0.5" />
              <span><span className="font-semibold">Pro tip:</span> {current.tip}</span>
            </p>
          </div>

          {current.cta && current.route && (
            <Button variant="outline" size="sm" className="w-full" onClick={goTo}>
              {current.cta} →
            </Button>
          )}

          <div className="flex items-center justify-between pt-2 border-t">
            <Button variant="ghost" size="sm" disabled={step === 0} onClick={() => setStep(s => Math.max(0, s - 1))}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <button onClick={finish} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Skip tour
            </button>
            {isLast ? (
              <Button size="sm" onClick={finish}>Start Trading 🚀</Button>
            ) : (
              <Button size="sm" onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AppTour;