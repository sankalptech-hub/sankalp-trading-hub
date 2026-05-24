import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, RefreshCw, Trash2, Layers3, Target, Calendar, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { fetchPrice, getCurrencySymbol } from '@/lib/marketData';

const OPT_PREFIX = '[OPTIONS]';

const POPULAR_UNDERLYINGS = [
  { sym: 'NIFTY', name: 'NIFTY 50', lot: 50, step: 50, currency: 'INR' },
  { sym: 'BANKNIFTY', name: 'BANK NIFTY', lot: 15, step: 100, currency: 'INR' },
  { sym: 'FINNIFTY', name: 'FIN NIFTY', lot: 40, step: 50, currency: 'INR' },
  { sym: 'RELIANCE.NS', name: 'Reliance', lot: 250, step: 10, currency: 'INR' },
  { sym: 'HDFCBANK.NS', name: 'HDFC Bank', lot: 550, step: 10, currency: 'INR' },
  { sym: 'TCS.NS', name: 'TCS', lot: 175, step: 20, currency: 'INR' },
  { sym: 'INFY.NS', name: 'Infosys', lot: 400, step: 10, currency: 'INR' },
  { sym: 'AAPL', name: 'Apple', lot: 100, step: 5, currency: 'USD' },
  { sym: 'TSLA', name: 'Tesla', lot: 100, step: 5, currency: 'USD' },
  { sym: 'SPY', name: 'S&P 500 ETF', lot: 100, step: 1, currency: 'USD' },
];

interface WlRow { id: string; name: string; description: string | null; color: string; is_default: boolean; }
interface OptMeta { underlying: string; strike: number; expiry: string; type: 'CE' | 'PE' | 'EQ'; lot: number; }
interface SymRow {
  id: string; watchlist_id: string; user_id: string; symbol: string;
  display_name: string | null; notes: string | null; added_at: string;
  meta?: OptMeta; spot?: number; spotCurrency?: string;
}

const parseMeta = (notes: string | null): OptMeta | undefined => {
  if (!notes) return undefined;
  try { return JSON.parse(notes); } catch { return undefined; }
};

const formatContract = (m: OptMeta): string => {
  if (m.type === 'EQ') return m.underlying;
  const exp = m.expiry.replace(/-/g, '').slice(2);
  return `${m.underlying}|${exp}|${m.strike}|${m.type}`;
};

const formatDisplay = (m: OptMeta): string => {
  if (m.type === 'EQ') return `${m.underlying} (Equity)`;
  const d = new Date(m.expiry);
  const exp = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  return `${m.underlying} ${m.strike} ${m.type} ${exp}`;
};

const daysToExpiry = (expiry: string): number => {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(expiry); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
};

const moneyness = (m: OptMeta, spot?: number) => {
  if (!spot || m.type === 'EQ') return { label: '—', tone: 'muted' as const, dist: 0 };
  const dist = ((m.strike - spot) / spot) * 100;
  let itm = false;
  if (m.type === 'CE') itm = spot > m.strike;
  if (m.type === 'PE') itm = spot < m.strike;
  const atm = Math.abs(dist) < 0.5;
  return {
    label: atm ? 'ATM' : itm ? 'ITM' : 'OTM',
    tone: atm ? ('warn' as const) : itm ? ('pos' as const) : ('neg' as const),
    dist,
  };
};

const OptionsWatchlist = () => {
  const { user } = useAuth();
  const [lists, setLists] = useState<WlRow[]>([]);
  const [activeWl, setActiveWl] = useState<string>('');
  const [rows, setRows] = useState<SymRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [underlying, setUnderlying] = useState('NIFTY');
  const [customUnderlying, setCustomUnderlying] = useState('');
  const [optType, setOptType] = useState<'CE' | 'PE' | 'EQ'>('CE');
  const [strike, setStrike] = useState('');
  const [expiry, setExpiry] = useState('');
  const [lot, setLot] = useState('50');
  const [spotPreview, setSpotPreview] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const activeList = lists.find(l => l.id === activeWl);

  const fetchLists = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('watchlists').select('*').eq('user_id', user.id).like('description', `${OPT_PREFIX}%`).order('created_at');
    let wls = (data || []) as WlRow[];
    if (wls.length === 0) {
      const { data: created } = await supabase.from('watchlists').insert({
        user_id: user.id, name: 'My Options', description: `${OPT_PREFIX} Default options watchlist`,
        color: '#f59e0b', is_default: false,
      } as any).select().single();
      if (created) wls = [created as WlRow];
    }
    setLists(wls);
    if (!activeWl && wls.length > 0) setActiveWl(wls[0].id);
  }, [user, activeWl]);

  const fetchRows = useCallback(async (wlId: string) => {
    if (!user || !wlId) return;
    const { data } = await supabase.from('watchlist_symbols').select('*').eq('watchlist_id', wlId).eq('user_id', user.id).order('added_at', { ascending: false });
    const parsed: SymRow[] = (data || []).map((r: any) => ({ ...r, meta: parseMeta(r.notes) })).filter((r: SymRow) => !!r.meta);
    setRows(parsed);
  }, [user]);

  const refreshSpots = useCallback(async () => {
    if (rows.length === 0) return;
    setLoading(true);
    const updated = [...rows];
    const cache: Record<string, number> = {};
    for (let i = 0; i < updated.length; i++) {
      const u = updated[i].meta?.underlying;
      if (!u) continue;
      try {
        if (cache[u] == null) {
          const yfSym = /^[A-Z]+$/.test(u) && ['NIFTY', 'BANKNIFTY', 'FINNIFTY'].includes(u)
            ? (u === 'NIFTY' ? '^NSEI' : u === 'BANKNIFTY' ? '^NSEBANK' : '^CNXFIN')
            : u;
          const p = await fetchPrice(yfSym);
          cache[u] = p.price;
        }
        updated[i] = { ...updated[i], spot: cache[u], spotCurrency: getCurrencySymbol(u) };
      } catch { /* skip */ }
    }
    setRows(updated);
    setLoading(false);
  }, [rows]);

  useEffect(() => { fetchLists(); }, [fetchLists]);
  useEffect(() => { if (activeWl) fetchRows(activeWl); }, [activeWl, fetchRows]);
  useEffect(() => { if (rows.length > 0 && rows.every(r => r.spot == null)) refreshSpots(); /* eslint-disable-next-line */ }, [rows.length]);

  const selectUnderlying = (sym: string) => {
    setUnderlying(sym);
    const cfg = POPULAR_UNDERLYINGS.find(u => u.sym === sym);
    if (cfg) setLot(String(cfg.lot));
    previewSpot(sym);
  };

  const previewSpot = async (sym: string) => {
    setPreviewLoading(true); setSpotPreview(null);
    try {
      const yfSym = ['NIFTY', 'BANKNIFTY', 'FINNIFTY'].includes(sym)
        ? (sym === 'NIFTY' ? '^NSEI' : sym === 'BANKNIFTY' ? '^NSEBANK' : '^CNXFIN')
        : sym;
      const p = await fetchPrice(yfSym);
      setSpotPreview(p.price);
      const cfg = POPULAR_UNDERLYINGS.find(u => u.sym === sym);
      const step = cfg?.step || 10;
      if (!strike) setStrike(String(Math.round(p.price / step) * step));
    } catch {
      toast.error('Could not fetch spot price');
    }
    setPreviewLoading(false);
  };

  const resetForm = () => {
    setUnderlying('NIFTY'); setCustomUnderlying(''); setOptType('CE');
    setStrike(''); setExpiry(''); setLot('50'); setSpotPreview(null);
  };

  const addContract = async () => {
    if (!user || !activeWl) return;
    const u = (customUnderlying || underlying).toUpperCase().trim();
    if (!u) { toast.error('Underlying required'); return; }
    if (optType !== 'EQ' && (!strike || !expiry)) { toast.error('Strike and expiry required'); return; }
    const meta: OptMeta = {
      underlying: u,
      strike: Number(strike) || 0,
      expiry: optType === 'EQ' ? '' : expiry,
      type: optType,
      lot: Number(lot) || 1,
    };
    const symbol = formatContract(meta);
    const display = formatDisplay(meta);
    if (rows.find(r => r.symbol === symbol)) { toast.warning('Already in list'); return; }
    const { error } = await supabase.from('watchlist_symbols').insert({
      watchlist_id: activeWl, user_id: user.id, symbol, display_name: display, notes: JSON.stringify(meta),
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success(`${display} added`);
    resetForm();
    fetchRows(activeWl);
  };

  const remove = async (id: string) => {
    await supabase.from('watchlist_symbols').delete().eq('id', id);
    fetchRows(activeWl);
    toast.success('Removed');
  };

  const createList = async () => {
    if (!newListName.trim() || !user) return;
    const { error } = await supabase.from('watchlists').insert({
      user_id: user.id, name: newListName.trim(),
      description: `${OPT_PREFIX} ${newListName.trim()}`, color: '#f59e0b', is_default: false,
    } as any);
    if (error) { toast.error(error.message); return; }
    setShowNewList(false); setNewListName('');
    fetchLists();
    toast.success('Watchlist created');
  };

  const removeList = async (id: string) => {
    if (lists.length <= 1) { toast.error('Cannot delete last watchlist'); return; }
    await supabase.from('watchlists').delete().eq('id', id);
    if (activeWl === id) setActiveWl(lists.find(l => l.id !== id)?.id || '');
    fetchLists();
  };

  const stats = useMemo(() => {
    const calls = rows.filter(r => r.meta?.type === 'CE').length;
    const puts = rows.filter(r => r.meta?.type === 'PE').length;
    const eq = rows.filter(r => r.meta?.type === 'EQ').length;
    const expiringSoon = rows.filter(r => r.meta && r.meta.type !== 'EQ' && daysToExpiry(r.meta.expiry) <= 7 && daysToExpiry(r.meta.expiry) >= 0).length;
    return { calls, puts, eq, expiringSoon };
  }, [rows]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display flex items-center gap-2">
            <Layers3 className="h-6 w-6 text-warning" />
            Options Watchlist
          </h1>
          <p className="text-sm text-muted-foreground">Track option strikes (CE / PE) and equity positions side-by-side.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refreshSpots} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh Spots
          </Button>
          <Button onClick={() => setShowAdd(true)} disabled={!activeWl}>
            <Plus className="h-4 w-4 mr-2" />Add Contract
          </Button>
        </div>
      </div>

      {/* Watchlist tabs */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 flex-wrap">
            {lists.map(l => (
              <div key={l.id} className="flex items-center">
                <Button
                  variant={activeWl === l.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveWl(l.id)}
                  style={activeWl === l.id ? { background: l.color, borderColor: l.color } : { borderLeftColor: l.color, borderLeftWidth: 3 }}
                >
                  {l.name}
                </Button>
                {lists.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 ml-1" onClick={() => removeList(l.id)}>
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setShowNewList(true)}>
              <Plus className="h-4 w-4 mr-1" />New List
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Calls</div><div className="text-2xl font-display text-success">{stats.calls}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Puts</div><div className="text-2xl font-display text-destructive">{stats.puts}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Equity</div><div className="text-2xl font-display">{stats.eq}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Expiring ≤ 7d</div><div className="text-2xl font-display text-warning">{stats.expiringSoon}</div></CardContent></Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader><CardTitle className="text-base">{activeList?.name || 'Contracts'}</CardTitle></CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Target className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="mb-3">No contracts yet</p>
              <Button onClick={() => setShowAdd(true)} disabled={!activeWl}><Plus className="h-4 w-4 mr-2" />Add your first contract</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contract</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Strike</TableHead>
                    <TableHead className="text-right">Spot</TableHead>
                    <TableHead className="text-right">Distance</TableHead>
                    <TableHead>Moneyness</TableHead>
                    <TableHead className="text-right">DTE</TableHead>
                    <TableHead className="text-right">Lot</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => {
                    const m = r.meta!;
                    const mn = moneyness(m, r.spot);
                    const dte = m.type !== 'EQ' ? daysToExpiry(m.expiry) : null;
                    const tone = mn.tone === 'pos' ? 'bg-success/15 text-success' : mn.tone === 'neg' ? 'bg-destructive/15 text-destructive' : mn.tone === 'warn' ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground';
                    const sym = r.spotCurrency || '';
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium">{m.underlying}</div>
                          <div className="text-xs text-muted-foreground">{r.display_name}</div>
                        </TableCell>
                        <TableCell>
                          {m.type === 'CE' && <Badge className="bg-success/20 text-success border-success/30">CE</Badge>}
                          {m.type === 'PE' && <Badge className="bg-destructive/20 text-destructive border-destructive/30">PE</Badge>}
                          {m.type === 'EQ' && <Badge variant="outline">EQ</Badge>}
                        </TableCell>
                        <TableCell className="text-right font-mono">{m.type === 'EQ' ? '—' : m.strike.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono">{r.spot ? `${sym}${r.spot.toFixed(2)}` : '—'}</TableCell>
                        <TableCell className="text-right font-mono">
                          {m.type !== 'EQ' && r.spot ? (
                            <span className={mn.dist >= 0 ? 'text-success' : 'text-destructive'}>
                              {mn.dist >= 0 ? '+' : ''}{mn.dist.toFixed(2)}%
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell><span className={`px-2 py-0.5 rounded text-xs font-medium ${tone}`}>{mn.label}</span></TableCell>
                        <TableCell className="text-right font-mono">
                          {dte != null ? (
                            <span className={dte <= 0 ? 'text-destructive' : dte <= 7 ? 'text-warning' : ''}>
                              {dte < 0 ? 'Expired' : `${dte}d`}
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono">{m.lot}</TableCell>
                        <TableCell><Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New list dialog */}
      <Dialog open={showNewList} onOpenChange={setShowNewList}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Options Watchlist</DialogTitle></DialogHeader>
          <Input placeholder="e.g. Weekly NIFTY plays" value={newListName} onChange={e => setNewListName(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewList(false)}>Cancel</Button>
            <Button onClick={createList}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add contract dialog */}
      <Dialog open={showAdd} onOpenChange={(o) => { setShowAdd(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Option / Equity Contract</DialogTitle>
            <DialogDescription>Pick the underlying, expiry and strike. Stocks can be tracked as Equity.</DialogDescription>
          </DialogHeader>

          <Tabs value={optType} onValueChange={(v) => setOptType(v as any)}>
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="CE"><TrendingUp className="h-4 w-4 mr-1" />Call (CE)</TabsTrigger>
              <TabsTrigger value="PE"><TrendingDown className="h-4 w-4 mr-1" />Put (PE)</TabsTrigger>
              <TabsTrigger value="EQ">Equity</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs">Underlying</Label>
              <div className="flex flex-wrap gap-1 mt-1 mb-2">
                {POPULAR_UNDERLYINGS.slice(0, 7).map(u => (
                  <Button key={u.sym} variant={underlying === u.sym && !customUnderlying ? 'default' : 'outline'} size="sm" onClick={() => { setCustomUnderlying(''); selectUnderlying(u.sym); }}>
                    {u.name}
                  </Button>
                ))}
              </div>
              <Input placeholder="Or type ticker (AAPL, TSLA, RELIANCE.NS)" value={customUnderlying} onChange={e => setCustomUnderlying(e.target.value.toUpperCase())} onBlur={() => customUnderlying && previewSpot(customUnderlying)} />
              {(spotPreview || previewLoading) && (
                <div className="text-xs text-muted-foreground mt-1">
                  Spot: {previewLoading ? <Loader2 className="h-3 w-3 inline animate-spin" /> : <span className="font-mono text-foreground">{spotPreview?.toFixed(2)}</span>}
                </div>
              )}
            </div>

            {optType !== 'EQ' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Strike Price</Label>
                  <Input type="number" placeholder="e.g. 25000" value={strike} onChange={e => setStrike(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1"><Calendar className="h-3 w-3" />Expiry</Label>
                  <Input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} />
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs">Lot Size</Label>
              <Input type="number" value={lot} onChange={e => setLot(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={addContract}><Plus className="h-4 w-4 mr-1" />Add to Watchlist</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OptionsWatchlist;