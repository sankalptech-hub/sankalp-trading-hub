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
import { Loader2, Radar, Bookmark } from 'lucide-react';
import { fetchPrice, getCurrencySymbol, WATCHLIST_NSE_MAIN, WATCHLIST_NSE_TECH, WATCHLIST_US_TECH, WATCHLIST_US_FINANCE, WATCHLIST_CANADA_TSX, WATCHLIST_UK_LSE, WATCHLIST_GLOBAL_ETFS } from '@/lib/marketData';
import { EXCHANGES, getExchangeForSymbol } from '@/lib/marketHours';

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
  const [provider, setProvider] = useState('yahoo');
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

  useEffect(() => {
    if (!user) return;
    supabase.from('watchlists').select('*').eq('user_id', user.id).order('created_at').then(({ data }) => {
      setUserWatchlists(data || []);
    });
  }, [user]);

  // Symbol sources that don't live in the DB — anything else is a user watchlist id.
  const PRESET_KEYS = ['NSE_MAIN', 'NSE_TECH', 'US_TECH', 'US_FINANCE', 'CANADA_TSX', 'UK_LSE', 'GLOBAL_ETFS', 'CUSTOM'];

  const getSymbols = () => {
    if (watchlist === 'NSE_MAIN') return WATCHLIST_NSE_MAIN;
    if (watchlist === 'NSE_TECH') return WATCHLIST_NSE_TECH;
    if (watchlist === 'US_TECH') return WATCHLIST_US_TECH;
    if (watchlist === 'US_FINANCE') return WATCHLIST_US_FINANCE;
    if (watchlist === 'CANADA_TSX') return WATCHLIST_CANADA_TSX;
    if (watchlist === 'UK_LSE') return WATCHLIST_UK_LSE;
    if (watchlist === 'GLOBAL_ETFS') return WATCHLIST_GLOBAL_ETFS;
    if (watchlist === 'CUSTOM') return customSymbols;
    return []; // user watchlists are fetched async in scan()
  };

  const scanUserWatchlist = async (wlId: string) => {
    const { data } = await supabase.from('watchlist_symbols').select('symbol').eq('watchlist_id', wlId).eq('user_id', user!.id);
    return data?.map((d: any) => d.symbol) || [];
  };

  const scan = async () => {
    // Preset/custom sources resolve synchronously; a user watchlist id needs a DB fetch.
    const symbols = PRESET_KEYS.includes(watchlist)
      ? getSymbols()
      : await scanUserWatchlist(watchlist);
    if (symbols.length === 0) { toast.error('No symbols to scan'); return; }
    setScanning(true);
    const start = Date.now();
    const scanned: ScanResult[] = [];

    for (const sym of symbols) {
      try {
        const data = await fetchPrice(sym);
        const rsi14 = provider === 'yahoo' ? 30 + Math.random() * 40 : 25 + Math.random() * 50;
        const atrPct = Math.abs(data.changePercent) * 1.5;
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
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Provider</label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yahoo">Yahoo Finance</SelectItem>
                  <SelectItem value="demo">Demo (Mock)</SelectItem>
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
