import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, TrendingUp, Activity, BarChart3, Shield, Target } from 'lucide-react';
import {
  fetchCandleData, fetchPrice, getCurrencySymbol, CandleData, PriceData,
  NSE_SYMBOLS, US_SYMBOLS, computeSMA, computeEMA, computeRSI, computeMACD,
  computeBollingerBands, computeVWAP, computeATR, computeStochastic, findSupportResistance,
} from '@/lib/marketData';
import CandlestickChart from '@/components/CandlestickChart';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, ComposedChart, Bar, Cell, ReferenceLine,
} from 'recharts';

const RANGES = [
  { label: '1D', value: '1d', interval: '5m' },
  { label: '5D', value: '5d', interval: '15m' },
  { label: '1M', value: '1mo', interval: '1d' },
  { label: '3M', value: '3mo', interval: '1d' },
  { label: '6M', value: '6mo', interval: '1d' },
  { label: '1Y', value: '1y', interval: '1d' },
  { label: '5Y', value: '5y', interval: '1wk' },
];

const SUGGESTIONS = [...NSE_SYMBOLS, ...US_SYMBOLS];

const AssetAnalysis = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [symbol, setSymbol] = useState(params.get('symbol') || 'RELIANCE.NS');
  const [searchInput, setSearchInput] = useState(params.get('symbol') || 'RELIANCE.NS');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [range, setRange] = useState('3mo');
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(false);
  const [livePrice, setLivePrice] = useState<PriceData | null>(null);
  const [chartType, setChartType] = useState<'candle' | 'line' | 'area'>('candle');
  const [showOverlays, setShowOverlays] = useState({ sma: true, bb: true, vwap: false, ema: false });

  const cur = getCurrencySymbol(symbol);
  const rangeConfig = RANGES.find(r => r.value === range) || RANGES[2];

  const loadData = async (forceRefresh = false) => {
    setLoading(true);
    try {
      const [candleResult, priceResult] = await Promise.all([
        fetchCandleData(symbol, rangeConfig.interval, range, forceRefresh),
        fetchPrice(symbol),
      ]);
      setCandles(candleResult);
      setLivePrice(priceResult);
    } catch (err: any) {
      toast.error('Failed to load data: ' + (err.message || 'Unknown error'));
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [symbol, range]);

  const handleSymbolSelect = (sym: string) => {
    setSymbol(sym);
    setSearchInput(sym);
    setShowSuggestions(false);
  };

  // Compute all indicators
  const sma20 = computeSMA(candles, 20);
  const sma50 = computeSMA(candles, 50);
  const closes = candles.map(c => c.close);
  const ema12 = closes.length > 0 ? computeEMA(closes, 12) : [];
  const ema26 = closes.length > 0 ? computeEMA(closes, 26) : [];
  const rsiValues = computeRSI(candles);
  const macdValues = computeMACD(candles);
  const bbValues = computeBollingerBands(candles);
  const vwapValues = computeVWAP(candles);
  const atrValues = computeATR(candles);
  const stochValues = computeStochastic(candles);
  const { supports, resistances } = findSupportResistance(candles);

  const enrichedData = candles.map((c, i) => ({
    ...c,
    sma20: sma20[i],
    sma50: sma50[i],
    ema12: ema12[i] ?? null,
    ema26: ema26[i] ?? null,
    rsi: rsiValues[i],
    ...macdValues[i],
    bbUpper: bbValues[i]?.upper,
    bbMiddle: bbValues[i]?.middle,
    bbLower: bbValues[i]?.lower,
    vwap: vwapValues[i],
    atr: atrValues[i],
    stochK: stochValues[i]?.k,
    stochD: stochValues[i]?.d,
  }));

  const lastCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const firstCandle = candles.length > 0 ? candles[0] : null;
  const periodChange = lastCandle && firstCandle ? lastCandle.close - firstCandle.open : 0;
  const periodChangePct = firstCandle && firstCandle.open > 0 ? (periodChange / firstCandle.open) * 100 : 0;
  const highInPeriod = candles.length > 0 ? Math.max(...candles.map(c => c.high)) : 0;
  const lowInPeriod = candles.length > 0 ? Math.min(...candles.map(c => c.low)) : 0;
  const avgVolume = candles.length > 0 ? candles.reduce((s, c) => s + c.volume, 0) / candles.length : 0;
  const lastRSI = rsiValues.filter(v => v !== null).pop();
  const lastATR = atrValues.filter(v => v !== null).pop();
  const lastStochK = stochValues.map(s => s.k).filter(v => v !== null).pop();
  const lastBBUpper = bbValues.map(b => b.upper).filter(v => v !== null).pop();
  const lastBBLower = bbValues.map(b => b.lower).filter(v => v !== null).pop();
  const bbWidth = lastBBUpper && lastBBLower && lastCandle ? ((lastBBUpper - lastBBLower) / lastCandle.close * 100) : null;

  // Signal generation
  const getSignal = () => {
    let score = 0;
    if (lastRSI !== null && lastRSI !== undefined) {
      if (lastRSI < 30) score += 2;
      else if (lastRSI < 40) score += 1;
      else if (lastRSI > 70) score -= 2;
      else if (lastRSI > 60) score -= 1;
    }
    const lastMACD = macdValues[macdValues.length - 1];
    if (lastMACD?.histogram !== null && lastMACD?.histogram !== undefined) {
      if (lastMACD.histogram > 0) score += 1;
      else score -= 1;
    }
    if (lastCandle && sma20[sma20.length - 1]) {
      if (lastCandle.close > (sma20[sma20.length - 1] || 0)) score += 1;
      else score -= 1;
    }
    if (score >= 2) return { label: 'Strong Buy', color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/30' };
    if (score >= 1) return { label: 'Buy', color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/30' };
    if (score <= -2) return { label: 'Strong Sell', color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/30' };
    if (score <= -1) return { label: 'Sell', color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/30' };
    return { label: 'Neutral', color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/30' };
  };
  const signal = getSignal();

  const filtered = SUGGESTIONS.filter(s => s.toLowerCase().includes(searchInput.toLowerCase()));

  const xAxisProps = {
    dataKey: 'date', stroke: 'hsl(var(--muted-foreground))', fontSize: 10,
    tickFormatter: (v: string) => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; },
    interval: Math.max(Math.floor(enrichedData.length / 8), 0),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" /> Asset Analysis
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
          <Button size="sm" onClick={() => loadData(true)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate(`/trade?symbol=${symbol}`)}>
            Trade
          </Button>
        </div>
      </div>

      {/* Live price + signal banner */}
      {livePrice && (
        <Card className="card-glow">
          <CardContent className="py-4 flex flex-wrap items-center gap-4 sm:gap-6">
            <div>
              <p className="text-xs text-muted-foreground">Symbol</p>
              <p className="text-xl font-bold font-mono">{symbol}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Price</p>
              <p className="text-2xl font-bold font-mono text-primary">{cur}{livePrice.price.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Day Change</p>
              <p className={`text-lg font-mono font-semibold ${livePrice.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {livePrice.changePercent >= 0 ? '+' : ''}{livePrice.changePercent.toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Day Range</p>
              <p className="text-sm font-mono">{cur}{livePrice.low.toFixed(2)} — {cur}{livePrice.high.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Volume</p>
              <p className="text-sm font-mono">{(livePrice.volume / 1000000).toFixed(2)}M</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">52W Range</p>
              <p className="text-sm font-mono">{cur}{livePrice.fiftyTwoWeekLow.toFixed(0)} — {cur}{livePrice.fiftyTwoWeekHigh.toFixed(0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Signal</p>
              <Badge variant="outline" className={`${signal.bg} ${signal.color} font-semibold`}>
                {signal.label}
              </Badge>
            </div>
            {lastRSI !== null && lastRSI !== undefined && (
              <div>
                <p className="text-xs text-muted-foreground">RSI(14)</p>
                <Badge variant="outline" className={lastRSI < 30 ? 'text-emerald-400 border-emerald-400' : lastRSI > 70 ? 'text-red-400 border-red-400' : 'text-yellow-400 border-yellow-400'}>
                  {lastRSI.toFixed(1)}
                </Badge>
              </div>
            )}
            {livePrice.cached && <span className="text-xs text-muted-foreground">(cached)</span>}
          </CardContent>
        </Card>
      )}

      {/* Range + chart type + overlay selectors */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border overflow-hidden">
          {RANGES.map(r => (
            <button key={r.value} onClick={() => setRange(r.value)} className={`px-3 py-1.5 text-xs font-medium transition-colors ${range === r.value ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'}`}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex rounded-md border border-border overflow-hidden ml-2">
          {(['candle', 'line', 'area'] as const).map(ct => (
            <button key={ct} onClick={() => setChartType(ct)} className={`px-3 py-1.5 text-xs font-medium transition-colors ${chartType === ct ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'}`}>
              {ct.charAt(0).toUpperCase() + ct.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 ml-2 text-xs text-muted-foreground">
          <span>Overlays:</span>
          {[
            { key: 'sma' as const, label: 'SMA' },
            { key: 'bb' as const, label: 'BB' },
            { key: 'vwap' as const, label: 'VWAP' },
            { key: 'ema' as const, label: 'EMA' },
          ].map(o => (
            <button key={o.key} onClick={() => setShowOverlays(p => ({ ...p, [o.key]: !p[o.key] }))}
              className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${showOverlays[o.key] ? 'bg-primary/20 border-primary/40 text-primary' : 'border-border hover:bg-accent'}`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main chart */}
      <Card className="card-glow">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {chartType === 'candle' ? <BarChart3 className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
            {symbol} — {rangeConfig.label} ({rangeConfig.interval})
            <span className="ml-auto text-xs text-muted-foreground">{candles.length} bars</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : chartType === 'candle' ? (
            <CandlestickChart data={candles} symbol={symbol} height={400} />
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              {chartType === 'area' ? (
                <AreaChart data={enrichedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis {...xAxisProps} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={v => `${cur}${v.toFixed(0)}`} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} formatter={(v: any, name: string) => [`${cur}${Number(v).toFixed(2)}`, name]} />
                  {showOverlays.bb && <Area type="monotone" dataKey="bbUpper" stroke="hsl(var(--muted-foreground))" fill="none" strokeWidth={0.5} strokeDasharray="3 3" dot={false} name="BB Upper" />}
                  {showOverlays.bb && <Area type="monotone" dataKey="bbLower" stroke="hsl(var(--muted-foreground))" fill="none" strokeWidth={0.5} strokeDasharray="3 3" dot={false} name="BB Lower" />}
                  <Area type="monotone" dataKey="close" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.1} strokeWidth={2} dot={false} name="Price" />
                  {showOverlays.sma && <Line type="monotone" dataKey="sma20" stroke="#f59e0b" strokeWidth={1} dot={false} name="SMA20" />}
                  {showOverlays.sma && <Line type="monotone" dataKey="sma50" stroke="#8b5cf6" strokeWidth={1} dot={false} name="SMA50" />}
                  {showOverlays.ema && <Line type="monotone" dataKey="ema12" stroke="#06b6d4" strokeWidth={1} dot={false} name="EMA12" />}
                  {showOverlays.ema && <Line type="monotone" dataKey="ema26" stroke="#d946ef" strokeWidth={1} dot={false} name="EMA26" />}
                  {showOverlays.vwap && <Line type="monotone" dataKey="vwap" stroke="#f97316" strokeWidth={1.5} dot={false} name="VWAP" strokeDasharray="5 3" />}
                  {supports.map((s, i) => <ReferenceLine key={`s${i}`} y={s} stroke="hsla(152, 69%, 53%, 0.4)" strokeDasharray="4 4" label={{ value: `S ${cur}${s.toFixed(0)}`, fontSize: 9, fill: 'hsl(152, 69%, 53%)' }} />)}
                  {resistances.map((r, i) => <ReferenceLine key={`r${i}`} y={r} stroke="hsla(0, 84%, 60%, 0.4)" strokeDasharray="4 4" label={{ value: `R ${cur}${r.toFixed(0)}`, fontSize: 9, fill: 'hsl(0, 84%, 60%)' }} />)}
                </AreaChart>
              ) : (
                <LineChart data={enrichedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis {...xAxisProps} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={v => `${cur}${v.toFixed(0)}`} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} formatter={(v: any, name: string) => [`${cur}${Number(v).toFixed(2)}`, name]} />
                  <Line type="monotone" dataKey="close" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Price" />
                  {showOverlays.sma && <Line type="monotone" dataKey="sma20" stroke="#f59e0b" strokeWidth={1} dot={false} strokeDasharray="4 2" name="SMA20" />}
                  {showOverlays.sma && <Line type="monotone" dataKey="sma50" stroke="#8b5cf6" strokeWidth={1} dot={false} strokeDasharray="4 2" name="SMA50" />}
                  {showOverlays.ema && <Line type="monotone" dataKey="ema12" stroke="#06b6d4" strokeWidth={1} dot={false} name="EMA12" />}
                  {showOverlays.ema && <Line type="monotone" dataKey="ema26" stroke="#d946ef" strokeWidth={1} dot={false} name="EMA26" />}
                  {showOverlays.bb && <Line type="monotone" dataKey="bbUpper" stroke="hsl(var(--muted-foreground))" strokeWidth={0.5} dot={false} strokeDasharray="3 3" name="BB Upper" />}
                  {showOverlays.bb && <Line type="monotone" dataKey="bbLower" stroke="hsl(var(--muted-foreground))" strokeWidth={0.5} dot={false} strokeDasharray="3 3" name="BB Lower" />}
                  {showOverlays.vwap && <Line type="monotone" dataKey="vwap" stroke="#f97316" strokeWidth={1.5} dot={false} name="VWAP" strokeDasharray="5 3" />}
                  {supports.map((s, i) => <ReferenceLine key={`s${i}`} y={s} stroke="hsla(152, 69%, 53%, 0.4)" strokeDasharray="4 4" />)}
                  {resistances.map((r, i) => <ReferenceLine key={`r${i}`} y={r} stroke="hsla(0, 84%, 60%, 0.4)" strokeDasharray="4 4" />)}
                </LineChart>
              )}
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Technical indicators tabs */}
      <Tabs defaultValue="stats">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="stats">Statistics</TabsTrigger>
          <TabsTrigger value="rsi">RSI</TabsTrigger>
          <TabsTrigger value="macd">MACD</TabsTrigger>
          <TabsTrigger value="stoch">Stochastic</TabsTrigger>
          <TabsTrigger value="sr">S/R Levels</TabsTrigger>
          <TabsTrigger value="data">OHLC Data</TabsTrigger>
        </TabsList>

        <TabsContent value="stats">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Period Change', value: `${periodChange >= 0 ? '+' : ''}${cur}${periodChange.toFixed(2)}`, color: periodChange >= 0 ? 'text-emerald-400' : 'text-red-400' },
              { label: 'Period Change %', value: `${periodChangePct >= 0 ? '+' : ''}${periodChangePct.toFixed(2)}%`, color: periodChangePct >= 0 ? 'text-emerald-400' : 'text-red-400' },
              { label: 'Period High', value: `${cur}${highInPeriod.toFixed(2)}`, color: 'text-emerald-400' },
              { label: 'Period Low', value: `${cur}${lowInPeriod.toFixed(2)}`, color: 'text-red-400' },
              { label: 'Avg Volume', value: `${(avgVolume / 1000000).toFixed(2)}M`, color: 'text-foreground' },
              { label: 'RSI(14)', value: lastRSI !== null && lastRSI !== undefined ? lastRSI.toFixed(1) : 'N/A', color: lastRSI && lastRSI < 30 ? 'text-emerald-400' : lastRSI && lastRSI > 70 ? 'text-red-400' : 'text-yellow-400' },
              { label: 'ATR(14)', value: lastATR ? `${cur}${lastATR.toFixed(2)}` : 'N/A', color: 'text-foreground' },
              { label: 'BB Width', value: bbWidth ? `${bbWidth.toFixed(2)}%` : 'N/A', color: 'text-foreground' },
              { label: 'Stoch %K', value: lastStochK ? `${lastStochK.toFixed(1)}` : 'N/A', color: lastStochK && lastStochK < 20 ? 'text-emerald-400' : lastStochK && lastStochK > 80 ? 'text-red-400' : 'text-foreground' },
              { label: 'Volatility', value: candles.length > 1 ? `${((highInPeriod - lowInPeriod) / lowInPeriod * 100).toFixed(1)}%` : 'N/A', color: 'text-foreground' },
              { label: 'Total Bars', value: `${candles.length}`, color: 'text-foreground' },
              { label: 'Signal', value: signal.label, color: signal.color },
            ].map(s => (
              <Card key={s.label} className="card-glow">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="rsi">
          <Card className="card-glow">
            <CardContent className="pt-6">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={enrichedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis {...xAxisProps} />
                  <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={10} ticks={[0, 30, 50, 70, 100]} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} formatter={(v: any) => [Number(v).toFixed(1), 'RSI']} />
                  <ReferenceLine y={70} stroke="hsla(0, 84%, 60%, 0.5)" strokeDasharray="3 3" />
                  <ReferenceLine y={30} stroke="hsla(152, 69%, 53%, 0.5)" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="rsi" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span>🟢 Below 30 = Oversold (Buy signal)</span>
                <span>🔴 Above 70 = Overbought (Sell signal)</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="macd">
          <Card className="card-glow">
            <CardContent className="pt-6">
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={enrichedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis {...xAxisProps} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                  <Bar dataKey="histogram" isAnimationActive={false}>
                    {enrichedData.map((entry, i) => (
                      <Cell key={i} fill={entry.histogram && entry.histogram >= 0 ? 'hsla(152, 69%, 53%, 0.6)' : 'hsla(0, 84%, 60%, 0.6)'} />
                    ))}
                  </Bar>
                  <Line type="monotone" dataKey="macd" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} name="MACD" />
                  <Line type="monotone" dataKey="signal" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="Signal" />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span className="text-primary">— MACD</span>
                <span className="text-yellow-400">— Signal</span>
                <span>Histogram: Green = bullish, Red = bearish</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stoch">
          <Card className="card-glow">
            <CardContent className="pt-6">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={enrichedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis {...xAxisProps} />
                  <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={10} ticks={[0, 20, 50, 80, 100]} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} formatter={(v: any, name: string) => [Number(v).toFixed(1), name]} />
                  <ReferenceLine y={80} stroke="hsla(0, 84%, 60%, 0.5)" strokeDasharray="3 3" />
                  <ReferenceLine y={20} stroke="hsla(152, 69%, 53%, 0.5)" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="stochK" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} name="%K" />
                  <Line type="monotone" dataKey="stochD" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="%D" />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span className="text-primary">— %K (Fast)</span>
                <span className="text-yellow-400">— %D (Slow)</span>
                <span>🟢 Below 20 = Oversold</span>
                <span>🔴 Above 80 = Overbought</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sr">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="card-glow">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4 text-emerald-400" /> Support Levels</CardTitle></CardHeader>
              <CardContent>
                {supports.length > 0 ? supports.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                    <span className="text-sm text-muted-foreground">Support {i + 1}</span>
                    <span className="font-mono font-semibold text-emerald-400">{cur}{s.toFixed(2)}</span>
                    <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-400/30">
                      {lastCandle ? `${(((lastCandle.close - s) / lastCandle.close) * 100).toFixed(1)}% below` : ''}
                    </Badge>
                  </div>
                )) : <p className="text-sm text-muted-foreground">No clear support levels detected</p>}
              </CardContent>
            </Card>
            <Card className="card-glow">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4 text-red-400" /> Resistance Levels</CardTitle></CardHeader>
              <CardContent>
                {resistances.length > 0 ? resistances.map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                    <span className="text-sm text-muted-foreground">Resistance {i + 1}</span>
                    <span className="font-mono font-semibold text-red-400">{cur}{r.toFixed(2)}</span>
                    <Badge variant="outline" className="text-[10px] text-red-400 border-red-400/30">
                      {lastCandle ? `${(((r - lastCandle.close) / lastCandle.close) * 100).toFixed(1)}% above` : ''}
                    </Badge>
                  </div>
                )) : <p className="text-sm text-muted-foreground">No clear resistance levels detected</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="data">
          <Card className="card-glow">
            <CardContent className="pt-6">
              <div className="overflow-x-auto max-h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead><TableHead>Open</TableHead><TableHead>High</TableHead>
                      <TableHead>Low</TableHead><TableHead>Close</TableHead><TableHead>Volume</TableHead>
                      <TableHead>Change</TableHead><TableHead>RSI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...candles].reverse().slice(0, 50).map((c, i) => {
                      const idx = candles.length - 1 - i;
                      const change = c.close - c.open;
                      const changePct = c.open > 0 ? (change / c.open) * 100 : 0;
                      const rsi = rsiValues[idx];
                      return (
                        <TableRow key={c.date + i}>
                          <TableCell className="font-mono text-xs">{c.date}</TableCell>
                          <TableCell className="font-mono text-xs">{cur}{c.open.toFixed(2)}</TableCell>
                          <TableCell className="font-mono text-xs">{cur}{c.high.toFixed(2)}</TableCell>
                          <TableCell className="font-mono text-xs">{cur}{c.low.toFixed(2)}</TableCell>
                          <TableCell className={`font-mono text-xs ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{cur}{c.close.toFixed(2)}</TableCell>
                          <TableCell className="font-mono text-xs">{(c.volume / 1000000).toFixed(2)}M</TableCell>
                          <TableCell className={`font-mono text-xs ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {change >= 0 ? '+' : ''}{changePct.toFixed(2)}%
                          </TableCell>
                          <TableCell className={`font-mono text-xs ${rsi && rsi < 30 ? 'text-emerald-400' : rsi && rsi > 70 ? 'text-red-400' : ''}`}>
                            {rsi !== null && rsi !== undefined ? rsi.toFixed(1) : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AssetAnalysis;
