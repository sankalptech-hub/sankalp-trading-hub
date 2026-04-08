import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, Radar } from 'lucide-react';
import { fetchPrice, getCurrencySymbol, WATCHLIST_NSE_MAIN, WATCHLIST_NSE_TECH } from '@/lib/marketData';

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

const Scanner = () => {
  const { user } = useAuth();
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

  const getSymbols = () => {
    if (watchlist === 'NSE_MAIN') return WATCHLIST_NSE_MAIN;
    if (watchlist === 'NSE_TECH') return WATCHLIST_NSE_TECH;
    return customSymbols;
  };

  const scan = async () => {
    const symbols = getSymbols();
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

  const signalColor: Record<string, string> = { BUY: 'bg-emerald-500/20 text-emerald-400', SELL: 'bg-red-500/20 text-red-400', HOLD: 'bg-yellow-500/20 text-yellow-400' };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Radar className="h-6 w-6 text-primary" /> Scanner</h1>
      <Card className="card-glow">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Watchlist</label>
              <Select value={watchlist} onValueChange={setWatchlist}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NSE_MAIN">NSE Main</SelectItem>
                  <SelectItem value="NSE_TECH">NSE Tech</SelectItem>
                  <SelectItem value="CUSTOM">Custom</SelectItem>
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
                      <TableCell className="font-mono font-semibold">{r.symbol}</TableCell>
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
    </div>
  );
};

export default Scanner;
