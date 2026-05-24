import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  TrendingUp, TrendingDown, RefreshCw, Activity, ArrowUpRight, ArrowDownRight,
  Banknote, Layers, Eye, Zap, Building2,
} from 'lucide-react';
import { fetchPrice, fetchCandleData, getCurrencySymbol } from '@/lib/marketData';

type Timeframe = 'intraday' | 'weekly' | 'monthly';

interface Sector {
  name: string;
  symbols: string[];
  icon: string;
}

const SECTORS: Sector[] = [
  { name: 'Banking & Financials', icon: '🏦', symbols: ['HDFCBANK.NS', 'ICICIBANK.NS', 'SBIN.NS', 'AXISBANK.NS', 'KOTAKBANK.NS', 'BAJFINANCE.NS'] },
  { name: 'IT & Tech', icon: '💻', symbols: ['TCS.NS', 'INFY.NS', 'WIPRO.NS', 'HCLTECH.NS', 'TECHM.NS'] },
  { name: 'Energy & Oil', icon: '⛽', symbols: ['RELIANCE.NS', 'ONGC.NS', 'COALINDIA.NS', 'NTPC.NS', 'POWERGRID.NS'] },
  { name: 'Auto', icon: '🚗', symbols: ['MARUTI.NS', 'TATAMOTORS.NS', 'M&M.NS', 'BAJAJ-AUTO.NS', 'EICHERMOT.NS'] },
  { name: 'Pharma & Healthcare', icon: '💊', symbols: ['SUNPHARMA.NS', 'DRREDDY.NS', 'CIPLA.NS', 'DIVISLAB.NS'] },
  { name: 'FMCG & Consumer', icon: '🛒', symbols: ['HINDUNILVR.NS', 'NESTLEIND.NS', 'ITC.NS', 'BRITANNIA.NS', 'TITAN.NS'] },
  { name: 'Metals & Materials', icon: '⛏️', symbols: ['TATASTEEL.NS', 'JSWSTEEL.NS', 'HINDALCO.NS', 'ULTRACEMCO.NS', 'ASIANPAINT.NS'] },
  { name: 'US Mega Caps', icon: '🇺🇸', symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'] },
];

const INDICES = [
  { sym: '^NSEI', name: 'NIFTY 50' },
  { sym: '^NSEBANK', name: 'BANK NIFTY' },
  { sym: '^BSESN', name: 'SENSEX' },
  { sym: '^GSPC', name: 'S&P 500' },
  { sym: '^IXIC', name: 'NASDAQ' },
];

interface SymbolFlow {
  symbol: string;
  price: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  moneyFlowValue: number; // price * volume (₹ / $ traded)
  volumeRatio: number;    // current vol / avg vol — smart money signal
  direction: 'in' | 'out' | 'neutral';
  smartMoney: boolean;    // volume ratio > 1.5 AND meaningful move
  currency: string;
}

interface SectorFlow {
  name: string;
  icon: string;
  netFlow: number;        // sum of signed money flow
  totalFlow: number;      // sum of absolute money flow
  advanceCount: number;
  declineCount: number;
  avgChangePct: number;
  topMover: SymbolFlow | null;
}

interface IndexFlow {
  sym: string;
  name: string;
  price: number;
  changePct: number;
  volume: number;
}

const formatMoney = (val: number, currency: string): string => {
  const abs = Math.abs(val);
  if (currency === '₹') {
    if (abs >= 1e7) return `${currency}${(val / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `${currency}${(val / 1e5).toFixed(2)} L`;
    return `${currency}${val.toFixed(0)}`;
  }
  if (abs >= 1e9) return `${currency}${(val / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${currency}${(val / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${currency}${(val / 1e3).toFixed(2)}K`;
  return `${currency}${val.toFixed(0)}`;
};

const MoneyFlow = () => {
  const navigate = useNavigate();
  const [tf, setTf] = useState<Timeframe>('intraday');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [symbolData, setSymbolData] = useState<Record<Timeframe, SymbolFlow[]>>({ intraday: [], weekly: [], monthly: [] });
  const [indexFlow, setIndexFlow] = useState<IndexFlow[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchFlow = useCallback(async (force = false) => {
    setLoading(true);
    setProgress(0);

    const allSymbols = Array.from(new Set(SECTORS.flatMap(s => s.symbols)));
    const total = allSymbols.length + INDICES.length;
    let done = 0;

    // Indices
    const idx: IndexFlow[] = [];
    for (const i of INDICES) {
      try {
        const p = await fetchPrice(i.sym);
        idx.push({ sym: i.sym, name: i.name, price: p.price, changePct: p.changePercent, volume: p.volume });
      } catch { /* skip */ }
      done++;
      setProgress(Math.round((done / total) * 100));
    }
    setIndexFlow(idx);

    // Per-symbol flows for each timeframe
    const intraday: SymbolFlow[] = [];
    const weekly: SymbolFlow[] = [];
    const monthly: SymbolFlow[] = [];

    for (const sym of allSymbols) {
      try {
        const [price, monthCandles] = await Promise.all([
          fetchPrice(sym),
          fetchCandleData(sym, '1d', '3mo', force),
        ]);
        const currency = getCurrencySymbol(sym);

        // Intraday: today vs avg 20d volume
        const last20 = monthCandles.slice(-20);
        const avgVol20 = last20.reduce((s, c) => s + c.volume, 0) / Math.max(last20.length, 1);
        const intradayFlow = price.volume * price.price;
        intraday.push({
          symbol: sym, price: price.price, changePct: price.changePercent,
          volume: price.volume, avgVolume: avgVol20,
          moneyFlowValue: intradayFlow,
          volumeRatio: avgVol20 > 0 ? price.volume / avgVol20 : 1,
          direction: price.changePercent > 0.2 ? 'in' : price.changePercent < -0.2 ? 'out' : 'neutral',
          smartMoney: (avgVol20 > 0 ? price.volume / avgVol20 : 0) > 1.5 && Math.abs(price.changePercent) > 1,
          currency,
        });

        // Weekly: last 5 days
        const last5 = monthCandles.slice(-5);
        if (last5.length >= 2) {
          const startPrice = last5[0].open;
          const endPrice = last5[last5.length - 1].close;
          const wkChange = ((endPrice - startPrice) / startPrice) * 100;
          const wkVol = last5.reduce((s, c) => s + c.volume, 0);
          const wkAvgVol = last5.reduce((s, c) => s + c.volume * c.close, 0);
          const prev20Avg = monthCandles.slice(-25, -5).reduce((s, c) => s + c.volume, 0) / 20;
          weekly.push({
            symbol: sym, price: endPrice, changePct: wkChange,
            volume: wkVol, avgVolume: prev20Avg * 5,
            moneyFlowValue: wkAvgVol,
            volumeRatio: prev20Avg > 0 ? (wkVol / 5) / prev20Avg : 1,
            direction: wkChange > 1 ? 'in' : wkChange < -1 ? 'out' : 'neutral',
            smartMoney: (prev20Avg > 0 ? (wkVol / 5) / prev20Avg : 0) > 1.4 && Math.abs(wkChange) > 3,
            currency,
          });
        }

        // Monthly: full 3mo bucket but report monthly trend (last 22)
        const last22 = monthCandles.slice(-22);
        if (last22.length >= 2) {
          const startPrice = last22[0].open;
          const endPrice = last22[last22.length - 1].close;
          const moChange = ((endPrice - startPrice) / startPrice) * 100;
          const moVol = last22.reduce((s, c) => s + c.volume, 0);
          const moTraded = last22.reduce((s, c) => s + c.volume * c.close, 0);
          const prevAvg = monthCandles.slice(0, -22).reduce((s, c) => s + c.volume, 0) / Math.max(monthCandles.length - 22, 1);
          monthly.push({
            symbol: sym, price: endPrice, changePct: moChange,
            volume: moVol, avgVolume: prevAvg * 22,
            moneyFlowValue: moTraded,
            volumeRatio: prevAvg > 0 ? (moVol / 22) / prevAvg : 1,
            direction: moChange > 2 ? 'in' : moChange < -2 ? 'out' : 'neutral',
            smartMoney: (prevAvg > 0 ? (moVol / 22) / prevAvg : 0) > 1.3 && Math.abs(moChange) > 5,
            currency,
          });
        }
      } catch { /* skip */ }
      done++;
      setProgress(Math.round((done / total) * 100));
    }

    setSymbolData({ intraday, weekly, monthly });
    setLastUpdated(new Date());
    setLoading(false);
    if (force) toast.success('Money flow refreshed');
  }, []);

  useEffect(() => { fetchFlow(); }, [fetchFlow]);

  // Aggregate to sectors for current timeframe
  const sectorFlows: SectorFlow[] = useMemo(() => {
    const rows = symbolData[tf];
    if (rows.length === 0) return [];
    return SECTORS.map(sec => {
      const sectorRows = rows.filter(r => sec.symbols.includes(r.symbol));
      const netFlow = sectorRows.reduce((s, r) => s + (r.direction === 'in' ? r.moneyFlowValue : r.direction === 'out' ? -r.moneyFlowValue : 0), 0);
      const totalFlow = sectorRows.reduce((s, r) => s + r.moneyFlowValue, 0);
      const advanceCount = sectorRows.filter(r => r.changePct > 0).length;
      const declineCount = sectorRows.filter(r => r.changePct < 0).length;
      const avgChangePct = sectorRows.length > 0 ? sectorRows.reduce((s, r) => s + r.changePct, 0) / sectorRows.length : 0;
      const topMover = [...sectorRows].sort((a, b) => b.moneyFlowValue - a.moneyFlowValue)[0] || null;
      return { name: sec.name, icon: sec.icon, netFlow, totalFlow, advanceCount, declineCount, avgChangePct, topMover };
    }).sort((a, b) => b.netFlow - a.netFlow);
  }, [symbolData, tf]);

  const topInflows = useMemo(() => [...symbolData[tf]].filter(r => r.direction === 'in').sort((a, b) => b.moneyFlowValue - a.moneyFlowValue).slice(0, 10), [symbolData, tf]);
  const topOutflows = useMemo(() => [...symbolData[tf]].filter(r => r.direction === 'out').sort((a, b) => b.moneyFlowValue - a.moneyFlowValue).slice(0, 10), [symbolData, tf]);
  const smartMoneyPicks = useMemo(() => symbolData[tf].filter(r => r.smartMoney).sort((a, b) => b.volumeRatio - a.volumeRatio).slice(0, 12), [symbolData, tf]);

  const totals = useMemo(() => {
    const rows = symbolData[tf];
    const inflow = rows.filter(r => r.direction === 'in').reduce((s, r) => s + r.moneyFlowValue, 0);
    const outflow = rows.filter(r => r.direction === 'out').reduce((s, r) => s + r.moneyFlowValue, 0);
    const adv = rows.filter(r => r.changePct > 0).length;
    const dec = rows.filter(r => r.changePct < 0).length;
    return { inflow, outflow, net: inflow - outflow, adv, dec, breadth: adv + dec > 0 ? (adv / (adv + dec)) * 100 : 50 };
  }, [symbolData, tf]);

  const tfLabel = tf === 'intraday' ? 'Today' : tf === 'weekly' ? 'This Week (5d)' : 'This Month (22d)';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display flex items-center gap-2">
            <Banknote className="h-6 w-6 text-success" />
            Smart Money Flow
          </h1>
          <p className="text-sm text-muted-foreground">
            Where institutional and retail money is flowing — across sectors, indices, and individual names.
          </p>
          {lastUpdated && <p className="text-xs text-muted-foreground mt-1">Last updated: {lastUpdated.toLocaleTimeString()} · {tfLabel}</p>}
        </div>
        <Button onClick={() => fetchFlow(true)} disabled={loading} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {loading ? `Loading ${progress}%` : 'Refresh'}
        </Button>
      </div>

      {loading && progress < 100 && <Progress value={progress} className="h-1" />}

      {/* Timeframe tabs */}
      <Tabs value={tf} onValueChange={(v) => setTf(v as Timeframe)}>
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="intraday"><Zap className="h-4 w-4 mr-1" />Intraday</TabsTrigger>
          <TabsTrigger value="weekly">Weekly</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><ArrowUpRight className="h-3 w-3 text-success" />Inflow</div>
            <div className="text-xl font-display text-success mt-1">{formatMoney(totals.inflow, '₹')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><ArrowDownRight className="h-3 w-3 text-destructive" />Outflow</div>
            <div className="text-xl font-display text-destructive mt-1">{formatMoney(totals.outflow, '₹')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Net Flow</div>
            <div className={`text-xl font-display mt-1 ${totals.net >= 0 ? 'text-success' : 'text-destructive'}`}>
              {totals.net >= 0 ? '+' : ''}{formatMoney(totals.net, '₹')}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Market Breadth</div>
            <div className="text-xl font-display mt-1">{totals.breadth.toFixed(0)}%</div>
            <div className="text-[10px] text-muted-foreground"><span className="text-success">{totals.adv}↑</span> / <span className="text-destructive">{totals.dec}↓</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Index pulse */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" />Index Pulse</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {indexFlow.length === 0 && [...Array(5)].map((_, i) => <Skeleton key={i} className="h-20" />)}
            {indexFlow.map(i => (
              <div key={i.sym} className="border border-border rounded-lg p-3 bg-card/50">
                <div className="text-xs text-muted-foreground">{i.name}</div>
                <div className="text-lg font-display mt-1">{i.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                <div className={`text-xs font-medium ${i.changePct >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {i.changePct >= 0 ? '▲' : '▼'} {Math.abs(i.changePct).toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Sector flow */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4" />Sector Money Flow — {tfLabel}</CardTitle></CardHeader>
        <CardContent>
          {sectorFlows.length === 0 ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <div className="space-y-2">
              {sectorFlows.map(s => {
                const maxFlow = Math.max(...sectorFlows.map(x => Math.abs(x.netFlow)), 1);
                const width = (Math.abs(s.netFlow) / maxFlow) * 100;
                const inflow = s.netFlow >= 0;
                return (
                  <div key={s.name} className="border border-border rounded-lg p-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{s.icon}</span>
                        <div>
                          <div className="text-sm font-medium">{s.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            <span className="text-success">{s.advanceCount}↑</span> · <span className="text-destructive">{s.declineCount}↓</span>
                            {s.topMover && <> · top: <span className="text-foreground">{s.topMover.symbol.replace('.NS','')}</span></>}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-mono font-medium ${inflow ? 'text-success' : 'text-destructive'}`}>
                          {inflow ? '+' : ''}{formatMoney(s.netFlow, '₹')}
                        </div>
                        <div className={`text-[11px] ${s.avgChangePct >= 0 ? 'text-success' : 'text-destructive'}`}>
                          avg {s.avgChangePct >= 0 ? '+' : ''}{s.avgChangePct.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted/40 rounded overflow-hidden">
                      <div className={`h-full ${inflow ? 'bg-success' : 'bg-destructive'}`} style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inflows / Outflows */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2 text-success"><TrendingUp className="h-4 w-4" />Top Money Inflows</CardTitle></CardHeader>
          <CardContent>
            <FlowTable rows={topInflows} positive onTrade={(sym) => navigate(`/trade?symbol=${encodeURIComponent(sym)}`)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2 text-destructive"><TrendingDown className="h-4 w-4" />Top Money Outflows</CardTitle></CardHeader>
          <CardContent>
            <FlowTable rows={topOutflows} positive={false} onTrade={(sym) => navigate(`/trade?symbol=${encodeURIComponent(sym)}`)} />
          </CardContent>
        </Card>
      </div>

      {/* Smart money picks */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-warning">
            <Building2 className="h-4 w-4" />Smart Money Signals — {tfLabel}
          </CardTitle>
          <p className="text-xs text-muted-foreground">Symbols where volume is at least 1.3-1.5x average AND price moved meaningfully — typical institutional footprint.</p>
        </CardHeader>
        <CardContent>
          {smartMoneyPicks.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {loading ? 'Scanning…' : 'No smart money signals on this timeframe yet — try Weekly or Monthly.'}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {smartMoneyPicks.map(r => (
                <button
                  key={r.symbol}
                  onClick={() => navigate(`/trade?symbol=${encodeURIComponent(r.symbol)}`)}
                  className="border border-warning/30 hover:border-warning bg-warning/5 hover:bg-warning/10 rounded-lg p-3 text-left transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{r.symbol.replace('.NS', '')}</div>
                    <Badge className="bg-warning/20 text-warning border-warning/30 text-[10px]">{r.volumeRatio.toFixed(1)}x VOL</Badge>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs font-mono">{r.currency}{r.price.toFixed(2)}</span>
                    <span className={`text-xs font-mono ${r.changePct >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">{formatMoney(r.moneyFlowValue, r.currency)} traded</div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Money flow is estimated from price × volume vs 20-day baseline. Use with your own confirmation — not financial advice.
      </p>
    </div>
  );
};

const FlowTable = ({ rows, positive, onTrade }: { rows: SymbolFlow[]; positive: boolean; onTrade: (sym: string) => void }) => {
  if (rows.length === 0) {
    return <div className="text-center py-6 text-sm text-muted-foreground">No data yet</div>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead className="text-right">Change</TableHead>
          <TableHead className="text-right">Flow</TableHead>
          <TableHead className="text-right">Vol×</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(r => (
          <TableRow key={r.symbol} className="cursor-pointer" onClick={() => onTrade(r.symbol)}>
            <TableCell className="font-medium">{r.symbol.replace('.NS', '')}</TableCell>
            <TableCell className={`text-right font-mono text-xs ${positive ? 'text-success' : 'text-destructive'}`}>
              {r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%
            </TableCell>
            <TableCell className="text-right font-mono text-xs">{formatMoney(r.moneyFlowValue, r.currency)}</TableCell>
            <TableCell className="text-right font-mono text-xs">
              <Badge variant={r.volumeRatio > 1.3 ? 'default' : 'outline'} className="text-[10px]">{r.volumeRatio.toFixed(1)}x</Badge>
            </TableCell>
            <TableCell><Eye className="h-3 w-3 text-muted-foreground" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default MoneyFlow;