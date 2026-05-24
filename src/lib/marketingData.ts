// Static data for TradeSphere marketing pages

export const HERO_FEATURES = [
  { icon: 'zap', label: '0ms Latency' },
  { icon: 'lock', label: 'Encrypted Keys' },
  { icon: 'trending-up', label: '24/7 Execution' },
  { icon: 'bar-chart-2', label: 'Real-time Analytics' },
] as const;

export const HERO_STAT_CARDS = [
  { topLabel: '24/7', subLabel: 'AUTOMATED' },
  { topLabel: 'Auto', subLabel: 'BUY/SELL SIGNALS' },
  { topLabel: 'All', subLabel: 'MT5 BROKERS' },
];

export const WHAT_TRADERS_GET = [
  'MT5 / MT4 Support',
  'TradingView PineScript',
  'Trading Robots',
  'Trading Strategies',
  'Custom Indicators',
  'Custom Strategies',
];

export const SUPPORTED_BROKERS = [
  { code: 'EX', name: 'Exness' },
  { code: 'VA', name: 'Vantage' },
  { code: 'GT', name: 'GTC' },
  { code: 'IC', name: 'IC Markets' },
  { code: 'PE', name: 'PepperStone' },
  { code: 'CF', name: 'CFI' },
  { code: 'XM', name: 'XM Groups' },
  { code: 'AL', name: 'Alpaca' },
  { code: 'OA', name: 'OANDA' },
  { code: 'ZE', name: 'Zerodha' },
];

export const FOOTER_LINKS = [
  { label: 'Privacy Policy', path: '/privacy-policy' },
  { label: 'Terms of Service', path: '/terms-of-service' },
  { label: 'Payment & Refund', path: '/payment-refund-policy' },
];

export const RISK_DISCLOSURES = [
  'We provide automated trading tools only — not financial advice, signals, or profit guarantees.',
  'All trading involves risk; any gains or losses are solely your responsibility.',
  'TradeSphere is an independent technology company, not a broker or prop firm.',
  'Automation may underperform or fail under certain market conditions.',
];

export const MLM_LEVELS = [
  { level: 1, percent: '12%', value: 12, label: 'Direct Referral' },
  { level: 2, percent: '6%', value: 6, label: 'Tier 2 Network' },
  { level: 3, percent: '3%', value: 3, label: 'Tier 3 Network' },
  { level: 4, percent: '2%', value: 2, label: 'Tier 4 Network' },
  { level: 5, percent: '1%', value: 1, label: 'Tier 5 Network' },
];

export const PRODUCT_FEATURES = [
  { id: 'ea', title: 'MT5 Expert Advisors', desc: 'Production-grade EAs with multi-strategy logic, smart money concepts, and adaptive risk management.', icon: 'cpu', bullets: ['SMC + ICT logic', 'Adaptive lot sizing', 'News-aware filter', 'Drawdown circuit breaker'] },
  { id: 'pinescript', title: 'TradingView PineScript', desc: 'Custom indicators and strategies in PineScript v5/v6, fully back-testable with alerts to MT5.', icon: 'line-chart', bullets: ['Multi-timeframe scanners', 'Auto-alert webhooks', 'Backtest reports', 'Open libraries'] },
  { id: 'vps', title: 'Low-Latency VPS', desc: 'Co-located with major brokers in LD4 / NY4 / TY3. <0.4ms ping, NVMe storage, 99.99% uptime SLA.', icon: 'server', bullets: ['NVMe SSD', 'DDoS protected', 'Auto-restart', 'One-click EA deploy'] },
  { id: 'analytics', title: 'Real-time Analytics', desc: 'Live P&L, equity curve, drawdown, win-rate and Sharpe ratio with broker-side reconciliation every 30s.', icon: 'bar-chart-3', bullets: ['Equity & DD charts', 'Per-symbol stats', 'CSV / JSON export', 'Daily PDF reports'] },
  { id: 'license', title: 'Encrypted License Manager', desc: 'AES-256 encrypted license keys bound to account number. Revoke or transfer in one click.', icon: 'shield-check', bullets: ['Account-bound', 'Hot-swap brokers', 'Activity audit log', 'Hardware fingerprint'] },
  { id: 'partners', title: 'Partner Network', desc: '5-tier MLM with weekly payouts, transparent referral tree and a built-in commission calculator.', icon: 'users', bullets: ['12% direct', 'Up to 5 levels deep', 'Weekly auto-payout', 'Live leaderboard'] },
];

export const PERFORMANCE_HIGHLIGHTS = [
  { label: 'Avg. Monthly Return', value: '+8.4%', trend: 'up' },
  { label: 'Sharpe Ratio', value: '2.31', trend: 'up' },
  { label: 'Max Drawdown', value: '−8.6%', trend: 'down' },
  { label: 'Win Rate', value: '64.2%', trend: 'up' },
];