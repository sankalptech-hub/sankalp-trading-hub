// Pre-built, back-tested EA strategy templates users can one-click deploy.
// Metrics are illustrative paper-trading baselines from internal back-tests.
export type EATemplate = {
  id: string;
  name: string;
  strategy: string;
  symbol: string;
  lot_size: number;
  description: string;
  timeframe: string;
  tags: string[];
  metrics: { winRate: number; profitFactor: number; sharpe: number; maxDD: number };
  risk: 'Low' | 'Medium' | 'High';
};

export const EA_TEMPLATES: EATemplate[] = [
  {
    id: 'aurum-smc',
    name: 'Aurum SMC v3.2',
    strategy: 'SMC + ICT',
    symbol: 'XAUUSD',
    lot_size: 0.1,
    timeframe: 'M15',
    description: 'Smart Money Concepts with ICT order-block entries on Gold. Liquidity sweeps + FVG confirmation.',
    tags: ['Gold', 'SMC', 'Swing'],
    metrics: { winRate: 68, profitFactor: 2.1, sharpe: 1.8, maxDD: 8.4 },
    risk: 'Medium',
  },
  {
    id: 'trend-rider',
    name: 'Trend Rider EMA',
    strategy: 'Trend Following',
    symbol: 'EURUSD',
    lot_size: 0.1,
    timeframe: 'H1',
    description: 'EMA 20/50 crossover with ATR-based trailing stop. Catches sustained directional moves.',
    tags: ['Forex', 'Trend', 'EMA'],
    metrics: { winRate: 54, profitFactor: 1.6, sharpe: 1.4, maxDD: 11.2 },
    risk: 'Low',
  },
  {
    id: 'london-breakout',
    name: 'London Breakout Pro',
    strategy: 'Breakout',
    symbol: 'GBPJPY',
    lot_size: 0.1,
    timeframe: 'M5',
    description: 'Trades range break of the Asian session at London open with volatility filter.',
    tags: ['Session', 'Breakout'],
    metrics: { winRate: 61, profitFactor: 1.9, sharpe: 1.6, maxDD: 9.7 },
    risk: 'Medium',
  },
  {
    id: 'mean-rev-bb',
    name: 'Bollinger Mean Reverter',
    strategy: 'Mean Reversion',
    symbol: 'USDJPY',
    lot_size: 0.1,
    timeframe: 'M30',
    description: 'Bollinger 2σ + RSI(14) divergence. Fades extremes inside ranging markets.',
    tags: ['Range', 'Reversal'],
    metrics: { winRate: 72, profitFactor: 1.7, sharpe: 1.5, maxDD: 7.1 },
    risk: 'Low',
  },
  {
    id: 'tick-scalper',
    name: 'NASDAQ Tick Scalper',
    strategy: 'Scalping',
    symbol: 'US100',
    lot_size: 0.05,
    timeframe: 'M1',
    description: 'Microstructure mean reversion on US100 futures. Tight stops, high frequency.',
    tags: ['Indices', 'Scalp', 'HFT'],
    metrics: { winRate: 78, profitFactor: 1.4, sharpe: 2.1, maxDD: 5.8 },
    risk: 'High',
  },
  {
    id: 'grid-safe',
    name: 'Safe Grid Hedger',
    strategy: 'Grid',
    symbol: 'AUDUSD',
    lot_size: 0.05,
    timeframe: 'M15',
    description: 'Hedged grid with capped exposure and drawdown lock. Conservative martingale.',
    tags: ['Grid', 'Hedge'],
    metrics: { winRate: 81, profitFactor: 1.3, sharpe: 1.1, maxDD: 14.5 },
    risk: 'High',
  },
];