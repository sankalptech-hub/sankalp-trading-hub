import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSignals } from '@/hooks/useRealtime';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Radar, Bookmark, Zap, Gauge, Landmark, Brain } from 'lucide-react';
import {
  fetchPrice, fetchCandleData, computeRSI, computeATR, getCurrencySymbol,
  WATCHLIST_NSE_MAIN, WATCHLIST_NSE_TECH, WATCHLIST_US_TECH, WATCHLIST_US_FINANCE, WATCHLIST_CANADA_TSX, WATCHLIST_UK_LSE, WATCHLIST_GLOBAL_ETFS,
  SCAN_UNIVERSE_NSE, detectBreakout, computeScalpScore, detectBigMoney, detectSmartMoney,
  BreakoutSignal, ScalpScore, BigMoneySignal, SmartMoneySignal, CandleData,
} from '@/lib/marketData';
import { EXCHANGES, getExchangeForSymbol } from '@/lib/marketHours';

// Runs `fn` over `items` with at most `limit` in flight at once — avoids
// hammering the price/candle API with 45+ simultaneous requests.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

interface StrategyRow {
  symbol: string;
  price: number;
  changePercent: number;
  currency: string;
  breakout: BreakoutSignal | null;
  scalp: ScalpScore | null;
  bigMoney: BigMoneySignal | null;
  smartMoney: SmartMoneySignal | null;
}

interface ScanResult {
  symbol: string;
  price: number;
  changePct: number;
  volume: number;
  rsi14: number;
  atrPct: number;
  signal: 'BUY' | 'SELL' | 'HOLD';
  currency: string;
}

const signalTypeColor: Record<string, string> = {
  BUY: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  SELL: 'bg-red-500/20 text-red-400 border-red-500/30',
  STRONG_BUY: 'bg-emerald-500/30 text-emerald-300 border-emerald-400/50',
  STRONG_SELL: 'bg-red-500/30 text-red-300 border-red-400/50',
  HOLD: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
};

const Scanner = () => {
  const { user } = useAuth();
  const { signals } = useRealtimeSignals(user?.id);
  const [watchlist, setWatchlist] = useState('NSE_MAIN');
  const [results, setResults] = useState<ScanResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState<Date | null>(null);
  const [scanTime, setScanTime] = useState(0);
  const [customSymbols, setCustomSymbols] = useState(() => {
    try { return JSON.parse(localStorage.getItem('scanner_custom_symbols') || '[]') as string[]; } catch { return []; }
  });
  const [newSymbol, setNewSymbol] = useState('');
  const [userWatchlists, setUserWatchlists] = useState<any[]>([]);
  const [showSaveWl, setShowSaveWl] = useState(false);
  const [saveWlName, setSaveWlName] = useState('');

  const [strategyRows, setStrategyRows] = useState<StrategyRow[]>([]);
  const [strategyScanning, setStrategyScanning] = useState(false);
  const [strategyProgress, setStrategyProgress] = useState(0);
  const [strategyLastScanned, setStrategyLastScanned] = useState<Date | null>(null);
  const [strategyScanTime, setStrategyScanTime] = useState(0);

  const runStrategyScan = async () => {
    setStrategyScanning(true);
    setStrategyProgress(0);
    const start = Date.now();
    const universe = SCAN_UNIVERSE_NSE;
    let done = 0;

    const rows = await mapLimit(universe, 6, async (sym): Promise<StrategyRow | null> => {
      try {
        const candles: CandleData[] = await fetchCandleData(sym, '1d', '3mo');
        done++; setStrategyProgress(done);
        if (candles.length < 11) return null;
        const today = candles[candles.length - 1];
        const prevClose = candles[candles.length - 2]?.close ?? today.close;
        return {
          symbol: sym,
          price: today.close,
          changePercent: prevClose ? ((today.close - prevClose) / prevClose) * 100 : 0,
          currency: getCurrencySymbol(sym),
          breakout: detectBreakout(candles),
          scalp: computeScalpScore(candles),
          bigMoney: detectBigMoney(candles),
          smartMoney: detectSmartMoney(candles),
        };
      } catch {
        done++; setStrategyProgress(done);
        return null;
      }
    });

    setStrategyRows(rows.filter((r): r is StrategyRow => r !== null));
    setStrategyLastScanned(new Date());
    setStrategyScanTime((Date.now() - start) / 1000);
    setStrategyScanning(false);
  };

  const breakoutResults = strategyRows.filter(r => r.breakout).sort((a, b) => (b.breakout!.volumeRatio) - (a.breakout!.volumeRatio));
  const scalpResults = [...strategyRows].filter(r => r.scalp).sort((a, b) => b.scalp!.score - a.scalp!.score).slice(0, 15);
  const bigMoneyResults = strategyRows.filter(r => r.bigMoney).sort((a, b) => b.bigMoney!.turnoverRatio - a.bigMoney!.turnoverRatio);
  const smartMoneyResults = strategyRows.filter(r => r.smartMoney).sort((a, b) => b.smartMoney!.volumeRatio - a.smartMoney!.volumeRatio);

  useEffect(() => {
    if (!user) return;
    supabase.from('watchlists').select('*').eq('user_id', user.id).order('created_at').then(({ data }) => {
      setUserWatchlists(data || []);
    });
  }, [user]);

  const getSymbols = () => {
    if (watchlist === 'NSE_MAIN') return WATCHLIST_NSE_MAIN;
    if (watchlist === 'NSE_TECH') return WATCHLIST_NSE_TECH;
    if (watchlist === 'US_TECH') return WATCHLIST_US_TECH;
    if (watchlist === 'US_FINANCE') return WATCHLIST_US_FINANCE;
    if (watchlist === 'CANADA_TSX') return WATCHLIST_CANADA_TSX;
    if (watchlist === 'UK_LSE') return WATCHLIST_UK_LSE;
    if (watchlist === 'GLOBAL_ETFS') return WATCHLIST_GLOBAL_ETFS;
    if (watchlist === 'CUSTOM') return customSymbols;
    const wl = userWatchlists.find(w => w.id === watchlist);
    if (wl) return [];
    return customSymbols;
  };

  const scanUserWatchlist = async (wlId: string) => {
    const { data } = await supabase.from('watchlist_symbols').select('symbol').eq('watchlist_id', wlId).eq('user_id', user!.id);
    return data?.map((d: any) => d.symbol) || [];
  };

  const scan = async () => {
    let symbols = getSymbols();
    // If user watchlist selected, fetch symbols first
    if (watchlist !== 'NSE_MAIN' && watchlist !== 'NSE_TECH' && watchlist !== 'CUSTOM') {
      symbols = await scanUserWatchlist(watchlist);
    }
    if (symbols.length === 0) { toast.error('No symbols to scan'); return; }
    setScanning(true);
    const start = Date.now();
    const scanned: ScanResult[] = [];

    for (const sym of symbols) {
      try {
        const [data, candles] = await Promise.all([
          fetchPrice(sym),
          fetchCandleData(sym, '1d', '3mo'),
        ]);
        const rsiSeries = computeRSI(candles, 14);
        const atrSeries = computeATR(candles, 14);
        const rsi14 = rsiSeries[rsiSeries.length - 1] ?? 50;
        const lastAtr = atrSeries[atrSeries.length - 1];
        const atrPct = lastAtr !== null && data.price ? (lastAtr / data.price) * 100 : 0;
        const signal: 'BUY' | 'SELL' | 'HOLD' = rsi14 < 35 ? 'BUY' : rsi14 > 65 ? 'SELL' : 'HOLD';
        scanned.push({ symbol: sym, price: data.price, changePct: data.changePercent, volume: data.volume, rsi14, atrPct, signal, currency: getCurrencySymbol(sym) });
      } catch { /* skip */ }
    }
    setResults(scanned);
    setLastScanned(new Date());
    setScanTime((Date.now() - start) / 1000);
    setScanning(false);
  };

  const generateSignal = async (r: ScanResult) => {
    if (!user) return;
    await supabase.from('signals').insert({ user_id: user.id, symbol: r.symbol, signal_type: r.signal, price: r.price });
    toast.success(`Signal generated: ${r.signal} ${r.symbol}`);
  };

  const addCustomSymbol = () => {
    if (!newSymbol.trim()) return;
    const updated = [...customSymbols, newSymbol.toUpperCase()];
    setCustomSymbols(updated);
    localStorage.setItem('scanner_custom_symbols', JSON.stringify(updated));
    setNewSymbol('');
  };

  const removeCustomSymbol = (sym: string) => {
    const updated = customSymbols.filter(s => s !== sym);
    setCustomSymbols(updated);
    localStorage.setItem('scanner_custom_symbols', JSON.stringify(updated));
  };

  const saveAsWatchlist = async () => {
    if (!saveWlName.trim() || !user || results.length === 0) return;
    const { data: wl } = await supabase.from('watchlists').insert({ user_id: user.id, name: saveWlName.trim(), color: '#f59e0b', is_default: false } as any).select().single();
    if (!wl) { toast.error('Failed to create watchlist'); return; }
    await supabase.from('watchlist_symbols').insert(results.map(r => ({ watchlist_id: wl.id, user_id: user.id, symbol: r.symbol })) as any);
    toast.success(`Watchlist "${saveWlName}" created with ${results.length} symbols`);
    setShowSaveWl(false); setSaveWlName('');
  };

  const signalColor: Record<string, string> = { BUY: 'bg-emerald-500/20 text-emerald-400', SELL: 'bg-red-500/20 text-red-400', HOLD: 'bg-yellow-500/20 text-yellow-400' };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Radar className="h-6 w-6 text-primary" /> Scanner</h1>

      <Tabs defaultValue="scan">
        <TabsList>
          <TabsTrigger value="scan">Live Scan</TabsTrigger>
          <TabsTrigger value="strategy">Strategy Scan</TabsTrigger>
          <TabsTrigger value="signals">
            Saved Signals
            {signals.length > 0 && <span className="ml-2 bg-primary/20 text-primary text-xs rounded-full px-1.5">{signals.length}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scan" className="space-y-6">
      <Card className="card-glow">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Watchlist</label>
              <Select value={watchlist} onValueChange={setWatchlist}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NSE_MAIN">🇮🇳 NSE Main</SelectItem>
                  <SelectItem value="NSE_TECH">🇮🇳 NSE Tech</SelectItem>
                  <SelectItem value="US_TECH">🇺🇸 US Tech</SelectItem>
                  <SelectItem value="US_FINANCE">🇺🇸 US Finance</SelectItem>
                  <SelectItem value="CANADA_TSX">🇨🇦 TSX Canada</SelectItem>
                  <SelectItem value="UK_LSE">🇬🇧 LSE London</SelectItem>
                  <SelectItem value="GLOBAL_ETFS">🌍 Global ETFs</SelectItem>
                  <SelectItem value="CUSTOM">Custom</SelectItem>
                  {userWatchlists.map((wl: any) => <SelectItem key={wl.id} value={wl.id}>📌 {wl.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={scan} disabled={scanning}>
              {scanning ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Scanning...</> : 'Scan Now'}
            </Button>
            {lastScanned && <span className="text-xs text-muted-foreground">Last: {lastScanned.toLocaleTimeString()} • Scanned {results.length} symbols in {scanTime.toFixed(1)}s</span>}
          </div>
        </CardContent>
      </Card>

      {watchlist === 'CUSTOM' && (
        <Card className="card-glow">
          <CardHeader><CardTitle className="text-sm">Custom Symbols</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-3">
              <Input placeholder="e.g. TCS.NS" value={newSymbol} onChange={e => setNewSymbol(e.target.value)} className="w-40" onKeyDown={e => e.key === 'Enter' && addCustomSymbol()} />
              <Button size="sm" onClick={addCustomSymbol}>Add</Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {customSymbols.map(s => (
                <Badge key={s} variant="outline" className="cursor-pointer" onClick={() => removeCustomSymbol(s)}>{s} ×</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {results.length > 0 && (
        <Card className="card-glow">
          <CardContent className="pt-6">
            <div className="table-striped overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead><TableHead>Price</TableHead><TableHead>Change%</TableHead>
                    <TableHead>Volume</TableHead><TableHead>RSI14</TableHead><TableHead>ATR%</TableHead>
                    <TableHead>Signal</TableHead><TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map(r => (
                    <TableRow key={r.symbol}>
                      <TableCell className="font-mono font-semibold">
                        <span className="mr-1">{EXCHANGES[getExchangeForSymbol(r.symbol)]?.flag || '🌐'}</span>
                        {r.symbol}
                        <span className="text-[10px] text-muted-foreground ml-1">{getExchangeForSymbol(r.symbol)}</span>
                      </TableCell>
                      <TableCell className="font-mono">{r.currency}{r.price.toFixed(2)}</TableCell>
                      <TableCell className={`font-mono ${r.changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.changePct >= 0 ? '+' : ''}{r.changePct.toFixed(2)}%</TableCell>
                      <TableCell className="font-mono text-xs">{(r.volume / 1000000).toFixed(1)}M</TableCell>
                      <TableCell className="font-mono">{r.rsi14.toFixed(1)}</TableCell>
                      <TableCell className="font-mono">{r.atrPct.toFixed(2)}%</TableCell>
                      <TableCell><span className={`px-2 py-0.5 rounded text-xs ${signalColor[r.signal]}`}>{r.signal}</span></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => generateSignal(r)}>Signal</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => window.location.href = `/trade?symbol=${r.symbol}`}>Trade</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {results.length > 0 && (
        <Button variant="outline" onClick={() => setShowSaveWl(true)}>
          <Bookmark className="h-4 w-4 mr-2" /> Save scan results as new watchlist
        </Button>
      )}
        </TabsContent>

        <TabsContent value="strategy" className="space-y-6">
          <Card className="card-glow">
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-4 items-center">
                <Button onClick={runStrategyScan} disabled={strategyScanning}>
                  {strategyScanning
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Scanning {strategyProgress}/{SCAN_UNIVERSE_NSE.length}...</>
                    : `Scan ${SCAN_UNIVERSE_NSE.length} NSE large/mid-caps`}
                </Button>
                {strategyLastScanned && (
                  <span className="text-xs text-muted-foreground">
                    Last: {strategyLastScanned.toLocaleTimeString()} • {strategyRows.length}/{SCAN_UNIVERSE_NSE.length} symbols loaded in {strategyScanTime.toFixed(1)}s
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-3">
                Standard technical-analysis heuristics computed from real price/volume history — not signals from a paid data provider, not financial advice. See each tab's description for the exact rule.
              </p>
            </CardContent>
          </Card>

          {strategyRows.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">Run a scan to find setups across breakout, scalping, big money and smart money criteria.</div>
          ) : (
            <Tabs defaultValue="breakout">
              <TabsList>
                <TabsTrigger value="breakout"><Zap className="h-3.5 w-3.5 mr-1" /> Breakout ({breakoutResults.length})</TabsTrigger>
                <TabsTrigger value="scalp"><Gauge className="h-3.5 w-3.5 mr-1" /> Scalping ({scalpResults.length})</TabsTrigger>
                <TabsTrigger value="bigmoney"><Landmark className="h-3.5 w-3.5 mr-1" /> Big Money ({bigMoneyResults.length})</TabsTrigger>
                <TabsTrigger value="smartmoney"><Brain className="h-3.5 w-3.5 mr-1" /> Smart Money ({smartMoneyResults.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="breakout">
                <Card className="card-glow">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Breakout: close above the prior 20-session high on above-average volume</CardTitle></CardHeader>
                  <CardContent>
                    {breakoutResults.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">No breakouts found in this scan.</p> : (
                      <Table>
                        <TableHeader><TableRow><TableHead>Symbol</TableHead><TableHead>Price</TableHead><TableHead>Change%</TableHead><TableHead>20D Resistance</TableHead><TableHead>% Above</TableHead><TableHead>Vol Ratio</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {breakoutResults.map(r => (
                            <TableRow key={r.symbol}>
                              <TableCell className="font-mono font-semibold">{r.symbol}</TableCell>
                              <TableCell className="font-mono">{r.currency}{r.price.toFixed(2)}</TableCell>
                              <TableCell className={`font-mono ${r.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.changePercent >= 0 ? '+' : ''}{r.changePercent.toFixed(2)}%</TableCell>
                              <TableCell className="font-mono text-xs">{r.currency}{r.breakout!.resistance20.toFixed(2)}</TableCell>
                              <TableCell className="font-mono text-emerald-400">+{r.breakout!.pctAboveResistance.toFixed(2)}%</TableCell>
                              <TableCell className="font-mono">{r.breakout!.volumeRatio.toFixed(1)}x</TableCell>
                              <TableCell className="text-right"><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => window.location.href = `/stock-profile?symbol=${r.symbol}`}>View</Button></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="scalp">
                <Card className="card-glow">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Scalping suitability: high liquidity (turnover) + high volatility (ATR%) right now — top 15</CardTitle></CardHeader>
                  <CardContent>
                    {scalpResults.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">No candidates found in this scan.</p> : (
                      <Table>
                        <TableHeader><TableRow><TableHead>Symbol</TableHead><TableHead>Price</TableHead><TableHead>ATR%</TableHead><TableHead>Avg Turnover</TableHead><TableHead>Score</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {scalpResults.map(r => (
                            <TableRow key={r.symbol}>
                              <TableCell className="font-mono font-semibold">{r.symbol}</TableCell>
                              <TableCell className="font-mono">{r.currency}{r.price.toFixed(2)}</TableCell>
                              <TableCell className="font-mono">{r.scalp!.atrPct.toFixed(2)}%</TableCell>
                              <TableCell className="font-mono text-xs">₹{r.scalp!.avgTurnoverCr.toFixed(1)}Cr</TableCell>
                              <TableCell><Badge variant="outline" className={r.scalp!.score >= 70 ? 'text-emerald-400 border-emerald-400/30' : r.scalp!.score >= 40 ? 'text-yellow-400 border-yellow-400/30' : 'text-muted-foreground'}>{r.scalp!.score}</Badge></TableCell>
                              <TableCell className="text-right"><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => window.location.href = `/stock-profile?symbol=${r.symbol}`}>View</Button></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="bigmoney">
                <Card className="card-glow">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Big Money: today's turnover (price × volume) is 1.5x+ this stock's own recent average</CardTitle></CardHeader>
                  <CardContent>
                    {bigMoneyResults.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">No unusual turnover found in this scan.</p> : (
                      <Table>
                        <TableHeader><TableRow><TableHead>Symbol</TableHead><TableHead>Price</TableHead><TableHead>Change%</TableHead><TableHead>Turnover Today</TableHead><TableHead>Avg Turnover</TableHead><TableHead>Ratio</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {bigMoneyResults.map(r => (
                            <TableRow key={r.symbol}>
                              <TableCell className="font-mono font-semibold">{r.symbol}</TableCell>
                              <TableCell className="font-mono">{r.currency}{r.price.toFixed(2)}</TableCell>
                              <TableCell className={`font-mono ${r.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.changePercent >= 0 ? '+' : ''}{r.changePercent.toFixed(2)}%</TableCell>
                              <TableCell className="font-mono text-xs">₹{r.bigMoney!.turnoverTodayCr.toFixed(1)}Cr</TableCell>
                              <TableCell className="font-mono text-xs">₹{r.bigMoney!.avgTurnoverCr.toFixed(1)}Cr</TableCell>
                              <TableCell className="font-mono text-primary">{r.bigMoney!.turnoverRatio.toFixed(1)}x</TableCell>
                              <TableCell className="text-right"><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => window.location.href = `/stock-profile?symbol=${r.symbol}`}>View</Button></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="smartmoney">
                <Card className="card-glow">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Smart Money: volume 1.4x+ average alongside a 1%+ same-day move (accumulation/distribution footprint)</CardTitle></CardHeader>
                  <CardContent>
                    {smartMoneyResults.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">No footprints found in this scan.</p> : (
                      <Table>
                        <TableHeader><TableRow><TableHead>Symbol</TableHead><TableHead>Price</TableHead><TableHead>Change%</TableHead><TableHead>Vol Ratio</TableHead><TableHead>Direction</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {smartMoneyResults.map(r => (
                            <TableRow key={r.symbol}>
                              <TableCell className="font-mono font-semibold">{r.symbol}</TableCell>
                              <TableCell className="font-mono">{r.currency}{r.price.toFixed(2)}</TableCell>
                              <TableCell className={`font-mono ${r.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.changePercent >= 0 ? '+' : ''}{r.changePercent.toFixed(2)}%</TableCell>
                              <TableCell className="font-mono">{r.smartMoney!.volumeRatio.toFixed(1)}x</TableCell>
                              <TableCell><Badge variant="outline" className={r.smartMoney!.direction === 'Accumulation' ? 'text-emerald-400 border-emerald-400/30' : 'text-red-400 border-red-400/30'}>{r.smartMoney!.direction}</Badge></TableCell>
                              <TableCell className="text-right"><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => window.location.href = `/stock-profile?symbol=${r.symbol}`}>View</Button></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </TabsContent>

        <TabsContent value="signals">
          <Card className="card-glow">
            <CardHeader><CardTitle>Saved Signals (Real-time · last 50)</CardTitle></CardHeader>
            <CardContent>
              {signals.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">No signals yet. Run a scan and click "Signal" to save one.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {signals.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono font-semibold">{s.symbol}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded text-xs border ${signalTypeColor[s.signal_type] || signalTypeColor.HOLD}`}>
                            {s.signal_type}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono">₹{Number(s.price).toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {new Date(s.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showSaveWl} onOpenChange={setShowSaveWl}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save as Watchlist</DialogTitle>
            <DialogDescription>Create a new watchlist from {results.length} scanned symbols</DialogDescription>
          </DialogHeader>
          <Input placeholder="Watchlist name" value={saveWlName} onChange={e => setSaveWlName(e.target.value)} />
          <DialogFooter>
            <Button onClick={saveAsWatchlist} disabled={!saveWlName.trim()}>Create Watchlist</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Scanner;
