import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, TrendingUp, Activity, BarChart3 } from 'lucide-react';
import { fetchCandleData, fetchPrice, getCurrencySymbol, CandleData, PriceData, NSE_SYMBOLS, US_SYMBOLS } from '@/lib/marketData';
import CandlestickChart from '@/components/CandlestickChart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ComposedChart, Bar, Cell } from 'recharts';

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

function computeSMA(data: CandleData[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    return slice.reduce((s, c) => s + c.close, 0) / period;
  });
}

function computeRSI(data: CandleData[], period = 14): (number | null)[] {
  const rsi: (number | null)[] = new Array(data.length).fill(null);
  if (data.length < period + 1) return rsi;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i].close - data[i - 1].close;
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period; avgLoss /= period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i].close - data[i - 1].close;
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

function computeMACD(data: CandleData[]) {
  const ema = (arr: number[], period: number) => {
    const result: number[] = [];
    const k = 2 / (period + 1);
    result[0] = arr[0];
    for (let i = 1; i < arr.length; i++) result[i] = arr[i] * k + result[i - 1] * (1 - k);
    return result;
  };
  const closes = data.map(c => c.close);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = ema(macdLine, 9);
  return data.map((_, i) => ({
    macd: i >= 25 ? macdLine[i] : null,
    signal: i >= 33 ? signal[i] : null,
    histogram: i >= 33 ? macdLine[i] - signal[i] : null,
  }));
}

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

  const sma20 = computeSMA(candles, 20);
  const sma50 = computeSMA(candles, 50);
  const rsiValues = computeRSI(candles);
  const macdValues = computeMACD(candles);

  const enrichedData = candles.map((c, i) => ({
    ...c,
    sma20: sma20[i],
    sma50: sma50[i],
    rsi: rsiValues[i],
    ...macdValues[i],
  }));

  const lastCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const firstCandle = candles.length > 0 ? candles[0] : null;
  const periodChange = lastCandle && firstCandle ? lastCandle.close - firstCandle.open : 0;
  const periodChangePct = firstCandle && firstCandle.open > 0 ? (periodChange / firstCandle.open) * 100 : 0;
  const highInPeriod = candles.length > 0 ? Math.max(...candles.map(c => c.high)) : 0;
  const lowInPeriod = candles.length > 0 ? Math.min(...candles.map(c => c.low)) : 0;
  const avgVolume = candles.length > 0 ? candles.reduce((s, c) => s + c.volume, 0) / candles.length : 0;
  const lastRSI = rsiValues.filter(v => v !== null).pop();

  const filtered = SUGGESTIONS.filter(s => s.toLowerCase().includes(searchInput.toLowerCase()));

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

      {/* Live price banner */}
      {livePrice && (
        <Card className="card-glow">
          <CardContent className="py-4 flex flex-wrap items-center gap-6">
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
              <p className="text-xs text-muted-foreground">Volume</p>
              <p className="text-sm font-mono">{(livePrice.volume / 1000000).toFixed(2)}M</p>
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

      {/* Range + chart type selectors */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border overflow-hidden">
          {RANGES.map(r => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${range === r.value ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex rounded-md border border-border overflow-hidden ml-2">
          {[
            { type: 'candle' as const, label: 'Candle' },
            { type: 'line' as const, label: 'Line' },
            { type: 'area' as const, label: 'Area' },
          ].map(ct => (
            <button
              key={ct.type}
              onClick={() => setChartType(ct.type)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${chartType === ct.type ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'}`}
            >
              {ct.label}
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
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={v => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; }} interval={Math.max(Math.floor(enrichedData.length / 8), 0)} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={v => `${cur}${v.toFixed(0)}`} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} formatter={(v: any) => [`${cur}${Number(v).toFixed(2)}`, '']} />
                  <Area type="monotone" dataKey="close" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.1} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="sma20" stroke="#f59e0b" strokeWidth={1} dot={false} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="sma50" stroke="#8b5cf6" strokeWidth={1} dot={false} strokeDasharray="4 2" />
                </AreaChart>
              ) : (
                <LineChart data={enrichedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={v => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; }} interval={Math.max(Math.floor(enrichedData.length / 8), 0)} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={v => `${cur}${v.toFixed(0)}`} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} formatter={(v: any) => [`${cur}${Number(v).toFixed(2)}`, '']} />
                  <Line type="monotone" dataKey="close" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="sma20" stroke="#f59e0b" strokeWidth={1} dot={false} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="sma50" stroke="#8b5cf6" strokeWidth={1} dot={false} strokeDasharray="4 2" />
                </LineChart>
              )}
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Technical indicators */}
      <Tabs defaultValue="stats">
        <TabsList>
          <TabsTrigger value="stats">Statistics</TabsTrigger>
          <TabsTrigger value="rsi">RSI</TabsTrigger>
          <TabsTrigger value="macd">MACD</TabsTrigger>
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
              { label: 'Total Bars', value: `${candles.length}`, color: 'text-foreground' },
              { label: 'RSI(14)', value: lastRSI !== null && lastRSI !== undefined ? lastRSI.toFixed(1) : 'N/A', color: lastRSI && lastRSI < 30 ? 'text-emerald-400' : lastRSI && lastRSI > 70 ? 'text-red-400' : 'text-yellow-400' },
              { label: 'Volatility', value: candles.length > 1 ? `${((highInPeriod - lowInPeriod) / lowInPeriod * 100).toFixed(1)}%` : 'N/A', color: 'text-foreground' },
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
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={v => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; }} interval={Math.max(Math.floor(enrichedData.length / 8), 0)} />
                  <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={10} ticks={[0, 30, 50, 70, 100]} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} formatter={(v: any) => [Number(v).toFixed(1), 'RSI']} />
                  <Line type="monotone" dataKey="rsi" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  {/* Overbought/Oversold lines */}
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
                <ComposedChartMACD data={enrichedData} />
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span className="text-primary">— MACD</span>
                <span className="text-orange-400">— Signal</span>
                <span>Histogram: Green = bullish, Red = bearish</span>
              </div>
            </CardContent>
          </Card>
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
                      <TableHead>Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...candles].reverse().slice(0, 50).map((c, i) => {
                      const change = c.close - c.open;
                      const changePct = c.open > 0 ? (change / c.open) * 100 : 0;
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

// MACD chart subcomponent

const ComposedChartMACD = ({ data }: { data: any[] }) => (
  <ComposedChart data={data}>
    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={v => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; }} interval={Math.max(Math.floor(data.length / 8), 0)} />
    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))' }} />
    <Bar dataKey="histogram" isAnimationActive={false}>
      {data.map((entry, i) => (
        <Cell key={i} fill={entry.histogram && entry.histogram >= 0 ? 'hsla(152, 69%, 53%, 0.6)' : 'hsla(0, 84%, 60%, 0.6)'} />
      ))}
    </Bar>
    <Line type="monotone" dataKey="macd" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} />
    <Line type="monotone" dataKey="signal" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
  </ComposedChart>
);

export default AssetAnalysis;
