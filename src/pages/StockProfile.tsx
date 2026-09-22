import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, Info, AlertTriangle, Gauge } from 'lucide-react';
import {
  fetchCandleData, fetchPrice, fetchFundamentals, fetchFearGreedIndex, getPeerSymbols,
  getCurrencySymbol, computeRSI,
  CandleData, PriceData, FundamentalsData, FearGreedResult,
  NSE_SYMBOLS, US_SYMBOLS,
} from '@/lib/marketData';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const RANGES = [
  { label: '1D', value: '1d', interval: '5m' },
  { label: '1W', value: '5d', interval: '15m' },
  { label: '1M', value: '1mo', interval: '1d' },
  { label: '1Y', value: '1y', interval: '1d' },
  { label: '5Y', value: '5y', interval: '1wk' },
];

const SUGGESTIONS = [...NSE_SYMBOLS, ...US_SYMBOLS];

function fmtPct(v: number | null, digits = 1): string {
  return v === null ? 'N/A' : `${(v * 100).toFixed(digits)}%`;
}
function fmtNum(v: number | null, digits = 2): string {
  return v === null ? 'N/A' : v.toFixed(digits);
}
function fmtCap(v: number | null, cur: string): string {
  if (v === null || v === 0) return 'N/A';
  if (v >= 1e12) return `${cur}${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${cur}${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e7) return `${cur}${(v / 1e7).toFixed(2)}Cr`;
  return `${cur}${v.toLocaleString()}`;
}

type Grade = 'Low' | 'Avg' | 'High';
const gradeColor: Record<Grade, string> = {
  Low: 'text-red-400 border-red-400/30 bg-red-400/10',
  Avg: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
  High: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
};

const fearGreedColor = (score: number) =>
  score < 25 ? 'text-red-400' : score < 45 ? 'text-orange-400' : score < 55 ? 'text-yellow-400' : score < 75 ? 'text-emerald-400' : 'text-emerald-300';

const StockProfile = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [symbol, setSymbol] = useState(params.get('symbol') || 'RELIANCE.NS');
  const [searchInput, setSearchInput] = useState(params.get('symbol') || 'RELIANCE.NS');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [range, setRange] = useState('1y');
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [price, setPrice] = useState<PriceData | null>(null);
  const [fundamentals, setFundamentals] = useState<FundamentalsData | null>(null);
  const [fundamentalsError, setFundamentalsError] = useState('');
  const [fearGreed, setFearGreed] = useState<FearGreedResult | null>(null);
  const [peerPrices, setPeerPrices] = useState<Record<string, PriceData>>({});
  const [loading, setLoading] = useState(false);

  const cur = getCurrencySymbol(symbol);
  const rangeConfig = RANGES.find(r => r.value === range) || RANGES[3];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFundamentals(null);
    setFundamentalsError('');
    setPeerPrices({});

    (async () => {
      try {
        const [c, p] = await Promise.all([
          fetchCandleData(symbol, rangeConfig.interval, range),
          fetchPrice(symbol),
        ]);
        if (cancelled) return;
        setCandles(c);
        setPrice(p);
      } catch (err: any) {
        if (!cancelled) toast.error('Failed to load price data: ' + (err.message || 'Unknown error'));
      }
      try {
        const f = await fetchFundamentals(symbol);
        if (!cancelled) setFundamentals(f);
      } catch (err: any) {
        if (!cancelled) setFundamentalsError(err.message || 'Fundamentals unavailable for this symbol');
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, range]);

  useEffect(() => {
    fetchFearGreedIndex().then(setFearGreed).catch(() => {});
  }, []);

  useEffect(() => {
    if (!fundamentals) return;
    const peers = getPeerSymbols(symbol, fundamentals.sector, fundamentals.industry);
    if (peers.length === 0) return;
    let cancelled = false;
    Promise.all(peers.map(async p => [p, await fetchPrice(p).catch(() => null)] as const)).then(results => {
      if (cancelled) return;
      const map: Record<string, PriceData> = {};
      for (const [sym, data] of results) if (data) map[sym] = data;
      setPeerPrices(map);
    });
    return () => { cancelled = true; };
  }, [fundamentals, symbol]);

  const handleSymbolSelect = (sym: string) => {
    setSymbol(sym); setSearchInput(sym); setShowSuggestions(false);
  };

  const filtered = SUGGESTIONS.filter(s => s.toLowerCase().includes(searchInput.toLowerCase()));

  // ── Scorecard: our own heuristic estimate from real data — NOT Tickertape's
  // proprietary scoring methodology, which isn't public. ──────────────────────
  const rsiSeries = candles.length > 0 ? computeRSI(candles, 14) : [];
  const lastRsi = rsiSeries.filter((v): v is number => v !== null).pop() ?? null;

  const valuationGrade: Grade | null = fundamentals?.trailingPE == null ? null
    : fundamentals.trailingPE > 35 ? 'High' : fundamentals.trailingPE > 18 ? 'Avg' : 'Low';
  const growthGrade: Grade | null = fundamentals?.revenueGrowth == null ? null
    : fundamentals.revenueGrowth > 0.15 ? 'High' : fundamentals.revenueGrowth > 0.05 ? 'Avg' : 'Low';
  const profitabilityGrade: Grade | null = fundamentals?.returnOnEquity == null ? null
    : fundamentals.returnOnEquity > 0.20 ? 'High' : fundamentals.returnOnEquity > 0.10 ? 'Avg' : 'Low';
  const entryLabel: 'Good' | 'Fair' | 'Poor' | null = lastRsi === null ? null
    : lastRsi < 35 ? 'Good' : lastRsi > 65 ? 'Poor' : 'Fair';
  const entryColor = entryLabel === 'Good' ? gradeColor.High : entryLabel === 'Poor' ? gradeColor.Low : gradeColor.Avg;

  const periodReturn = candles.length > 1 ? ((candles[candles.length - 1].close - candles[0].close) / candles[0].close) * 100 : null;
  const performanceGrade: Grade | null = periodReturn === null ? null
    : periodReturn > 20 ? 'High' : periodReturn > 0 ? 'Avg' : 'Low';

  const redFlags: string[] = [];
  if (fundamentals) {
    if (fundamentals.debtToEquity !== null && fundamentals.debtToEquity > 150) redFlags.push('High debt-to-equity');
    if (fundamentals.earningsGrowth !== null && fundamentals.earningsGrowth < -0.10) redFlags.push('Declining earnings');
    if (fundamentals.trailingPE !== null && fundamentals.trailingPE > 60) redFlags.push('Very high valuation (PE > 60)');
    if (fundamentals.currentRatio !== null && fundamentals.currentRatio < 1) redFlags.push('Current ratio below 1 (liquidity risk)');
  }

  const scorecardRows: { label: string; grade: string | null; color: string; note: string }[] = [
    { label: 'Performance', grade: performanceGrade, color: performanceGrade ? gradeColor[performanceGrade] : '', note: periodReturn === null ? 'Not enough price history' : `${periodReturn >= 0 ? '+' : ''}${periodReturn.toFixed(1)}% over selected period` },
    { label: 'Valuation', grade: valuationGrade, color: valuationGrade ? gradeColor[valuationGrade] : '', note: fundamentals?.trailingPE != null ? `PE ${fundamentals.trailingPE.toFixed(1)}` : 'PE unavailable' },
    { label: 'Growth', grade: growthGrade, color: growthGrade ? gradeColor[growthGrade] : '', note: fundamentals?.revenueGrowth != null ? `Revenue growth ${fmtPct(fundamentals.revenueGrowth)}` : 'Growth data unavailable' },
    { label: 'Profitability', grade: profitabilityGrade, color: profitabilityGrade ? gradeColor[profitabilityGrade] : '', note: fundamentals?.returnOnEquity != null ? `ROE ${fmtPct(fundamentals.returnOnEquity)}` : 'ROE unavailable' },
    { label: 'Entry point', grade: entryLabel, color: entryColor, note: lastRsi !== null ? `RSI(14) ${lastRsi.toFixed(0)}` : 'RSI unavailable' },
    { label: 'Red flags', grade: redFlags.length === 0 ? 'None' : redFlags.length <= 1 ? 'Few' : 'Several', color: redFlags.length === 0 ? gradeColor.High : redFlags.length <= 1 ? gradeColor.Avg : gradeColor.Low, note: redFlags.length === 0 ? 'No flags detected' : redFlags.join(', ') },
  ];

  const chartData = candles.map(c => ({ date: c.date, close: c.close }));
  const recTrend = fundamentals?.recommendationTrend;
  const recTotal = recTrend ? recTrend.strongBuy + recTrend.buy + recTrend.hold + recTrend.sell + recTrend.strongSell : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Info className="h-6 w-6 text-primary" /> Stock Profile
        </h1>
        <div className="flex items-center gap-2 relative">
          <div className="relative">
            <Input
              value={searchInput}
              onChange={e => { setSearchInput(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Symbol..."
              className="w-44 font-mono"
              onKeyDown={e => { if (e.key === 'Enter') handleSymbolSelect(searchInput.toUpperCase()); }}
            />
            {showSuggestions && filtered.length > 0 && (
              <div className="absolute top-full mt-1 left-0 w-full bg-background border border-border rounded-md shadow-xl z-50 max-h-48 overflow-y-auto">
                {filtered.slice(0, 10).map(s => (
                  <button key={s} className="w-full text-left px-3 py-1.5 text-sm font-mono hover:bg-accent" onMouseDown={() => handleSymbolSelect(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate(`/asset-analysis?symbol=${symbol}`)}>Technicals</Button>
          <Button size="sm" onClick={() => navigate(`/trade?symbol=${symbol}`)}>Trade</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* ── Left column: summary + scorecard + fear/greed ── */}
        <div className="space-y-4 lg:col-span-1">
          <Card className="card-glow">
            <CardContent className="pt-6 space-y-1">
              <p className="text-lg font-bold font-mono">{symbol}</p>
              {fundamentals?.sector && (
                <Badge variant="outline" className="text-[10px]">{fundamentals.sector}{fundamentals.industry ? ` · ${fundamentals.industry}` : ''}</Badge>
              )}
              {price ? (
                <>
                  <p className="text-3xl font-bold font-mono text-primary mt-2">{cur}{price.price.toFixed(2)}</p>
                  <p className={`text-sm font-mono font-semibold ${price.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {price.changePercent >= 0 ? '+' : ''}{price.change.toFixed(2)} ({price.changePercent >= 0 ? '+' : ''}{price.changePercent.toFixed(2)}%)
                  </p>
                  <div className="grid grid-cols-2 gap-2 pt-3 text-xs">
                    <div><p className="text-muted-foreground">Day Range</p><p className="font-mono">{cur}{price.low.toFixed(2)} - {cur}{price.high.toFixed(2)}</p></div>
                    <div><p className="text-muted-foreground">52W Range</p><p className="font-mono">{cur}{price.fiftyTwoWeekLow.toFixed(0)} - {cur}{price.fiftyTwoWeekHigh.toFixed(0)}</p></div>
                    <div><p className="text-muted-foreground">Volume</p><p className="font-mono">{(price.volume / 1e6).toFixed(2)}M</p></div>
                    <div><p className="text-muted-foreground">Market Cap</p><p className="font-mono">{fmtCap(fundamentals?.marketCap ?? price.marketCap, cur)}</p></div>
                  </div>
                  <Badge variant="outline" className="text-[10px] mt-2">{price.source === 'groww' ? 'Live via Groww' : 'Yahoo (~15min delayed)'}</Badge>
                </>
              ) : loading ? (
                <div className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="card-glow">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Stock Scorecard</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-[10px] text-muted-foreground -mt-1">Our own estimate from live data — not an official rating or financial advice.</p>
              {scorecardRows.map(row => (
                <div key={row.label} className="flex items-start justify-between gap-2 border-b border-border/30 pb-2 last:border-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium">{row.label}</p>
                    <p className="text-[11px] text-muted-foreground">{row.note}</p>
                  </div>
                  {row.grade && <Badge variant="outline" className={`text-[10px] shrink-0 ${row.color}`}>{row.grade}</Badge>}
                </div>
              ))}
              {fundamentalsError && (
                <div className="flex items-start gap-1.5 text-[11px] text-yellow-400 pt-1">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> Fundamentals unavailable right now — grades relying on them are blank.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="card-glow">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Gauge className="h-4 w-4" /> Market Fear &amp; Greed</CardTitle></CardHeader>
            <CardContent>
              {fearGreed ? (
                <>
                  <p className={`text-3xl font-bold font-mono ${fearGreedColor(fearGreed.score)}`}>{fearGreed.score}</p>
                  <p className={`text-sm font-semibold ${fearGreedColor(fearGreed.score)}`}>{fearGreed.label}</p>
                  <div className="text-[11px] text-muted-foreground mt-2 space-y-0.5">
                    <p>India VIX: {fearGreed.vix !== null ? fearGreed.vix.toFixed(2) : 'N/A'}</p>
                    <p>Nifty RSI(14): {fearGreed.niftyRsi !== null ? fearGreed.niftyRsi.toFixed(1) : 'N/A'}</p>
                    <p>Nifty vs 50D avg: {fearGreed.niftyVsSma !== null ? `${fearGreed.niftyVsSma >= 0 ? '+' : ''}${fearGreed.niftyVsSma.toFixed(1)}%` : 'N/A'}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">Our own composite of India VIX + Nifty momentum/trend — not CNN's Fear &amp; Greed Index (no free official equivalent exists for Indian markets).</p>
                </>
              ) : (
                <div className="py-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right column: chart + tabs ── */}
        <div className="space-y-4 lg:col-span-3">
          <Card className="card-glow">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">{symbol} — {rangeConfig.label}</CardTitle>
              <div className="flex rounded-md border border-border overflow-hidden">
                {RANGES.map(r => (
                  <button key={r.value} onClick={() => setRange(r.value)} className={`px-3 py-1 text-xs font-medium transition-colors ${range === r.value ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'}`}>
                    {r.label}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center h-72"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : chartData.length === 0 ? (
                <div className="flex items-center justify-center h-72 text-sm text-muted-foreground">No chart data available</div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} interval={Math.max(Math.floor(chartData.length / 8), 0)} tickFormatter={v => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; }} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} domain={['auto', 'auto']} tickFormatter={v => `${cur}${v.toFixed(0)}`} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} formatter={(v: any) => [`${cur}${Number(v).toFixed(2)}`, 'Price']} />
                    <Area type="monotone" dataKey="close" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.12} strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="forecasts">Forecasts</TabsTrigger>
              <TabsTrigger value="peers">Peers</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <Card className="card-glow">
                <CardContent className="pt-6">
                  {fundamentalsError ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">{fundamentalsError}</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {[
                        { label: 'Trailing PE', value: fmtNum(fundamentals?.trailingPE ?? null) },
                        { label: 'Forward PE', value: fmtNum(fundamentals?.forwardPE ?? null) },
                        { label: 'Price/Book', value: fmtNum(fundamentals?.priceToBook ?? null) },
                        { label: 'Dividend Yield', value: fmtPct(fundamentals?.dividendYield ?? null, 2) },
                        { label: 'Beta', value: fmtNum(fundamentals?.beta ?? null) },
                        { label: 'EPS (TTM)', value: fundamentals?.trailingEps != null ? `${cur}${fundamentals.trailingEps.toFixed(2)}` : 'N/A' },
                        { label: 'Profit Margin', value: fmtPct(fundamentals?.profitMargins ?? null) },
                        { label: 'Operating Margin', value: fmtPct(fundamentals?.operatingMargins ?? null) },
                        { label: 'Return on Equity', value: fmtPct(fundamentals?.returnOnEquity ?? null) },
                        { label: 'Debt/Equity', value: fmtNum(fundamentals?.debtToEquity ?? null, 1) },
                        { label: 'Revenue Growth', value: fmtPct(fundamentals?.revenueGrowth ?? null) },
                        { label: 'Earnings Growth', value: fmtPct(fundamentals?.earningsGrowth ?? null) },
                      ].map(m => (
                        <div key={m.label}>
                          <p className="text-xs text-muted-foreground">{m.label}</p>
                          <p className="text-lg font-bold font-mono">{loading && !fundamentals ? '—' : m.value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="forecasts">
              <Card className="card-glow">
                <CardContent className="pt-6">
                  {fundamentalsError ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">{fundamentalsError}</p>
                  ) : !fundamentals ? (
                    <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                  ) : fundamentals.numberOfAnalystOpinions ? (
                    <div className="space-y-6">
                      <div className="grid grid-cols-3 gap-4">
                        <div><p className="text-xs text-muted-foreground">Target Low</p><p className="text-lg font-bold font-mono">{cur}{fundamentals.targetLowPrice?.toFixed(2) ?? 'N/A'}</p></div>
                        <div><p className="text-xs text-muted-foreground">Target Mean</p><p className="text-lg font-bold font-mono text-primary">{cur}{fundamentals.targetMeanPrice?.toFixed(2) ?? 'N/A'}</p></div>
                        <div><p className="text-xs text-muted-foreground">Target High</p><p className="text-lg font-bold font-mono">{cur}{fundamentals.targetHighPrice?.toFixed(2) ?? 'N/A'}</p></div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Consensus: <span className="text-foreground font-semibold capitalize">{fundamentals.recommendationKey?.replace('_', ' ') ?? 'N/A'}</span> ({fundamentals.numberOfAnalystOpinions} analysts)</p>
                        {recTrend && recTotal > 0 && (
                          <div className="flex h-6 rounded overflow-hidden mt-2">
                            {[
                              { label: 'Strong Buy', n: recTrend.strongBuy, color: 'bg-emerald-500' },
                              { label: 'Buy', n: recTrend.buy, color: 'bg-emerald-400/60' },
                              { label: 'Hold', n: recTrend.hold, color: 'bg-yellow-400/60' },
                              { label: 'Sell', n: recTrend.sell, color: 'bg-red-400/60' },
                              { label: 'Strong Sell', n: recTrend.strongSell, color: 'bg-red-500' },
                            ].filter(s => s.n > 0).map(s => (
                              <div key={s.label} className={s.color} style={{ width: `${(s.n / recTotal) * 100}%` }} title={`${s.label}: ${s.n}`} />
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">Real analyst estimates via Yahoo Finance, not our own opinion.</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-8 text-center">No analyst coverage data available for this symbol.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="peers">
              <Card className="card-glow">
                <CardContent className="pt-6">
                  {!fundamentals?.sector ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">Sector unknown — can't suggest peers for this symbol.</p>
                  ) : Object.keys(peerPrices).length === 0 ? (
                    <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow><TableHead>Symbol</TableHead><TableHead>Price</TableHead><TableHead>Change%</TableHead><TableHead>Volume</TableHead><TableHead className="text-right">Action</TableHead></TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(peerPrices).map(([sym, d]) => (
                          <TableRow key={sym}>
                            <TableCell className="font-mono font-medium">{sym}</TableCell>
                            <TableCell className="font-mono">{getCurrencySymbol(sym)}{d.price.toFixed(2)}</TableCell>
                            <TableCell className={`font-mono ${d.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{d.changePercent >= 0 ? '+' : ''}{d.changePercent.toFixed(2)}%</TableCell>
                            <TableCell className="font-mono text-xs">{(d.volume / 1e6).toFixed(2)}M</TableCell>
                            <TableCell className="text-right"><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleSymbolSelect(sym)}>View</Button></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default StockProfile;
