import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Bookmark, Plus, RefreshCw, MoreVertical, TrendingUp, Search,
  Copy, Trash2, Loader2, ArrowRightLeft, Download, Radar,
} from 'lucide-react';
import { fetchPrice, getCurrencySymbol, PriceData } from '@/lib/marketData';

const PRESET_COLORS = ['#00d4aa', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981', '#f97316', '#ec4899'];

const ALL_SUGGESTIONS = [
  'RELIANCE.NS','TCS.NS','INFY.NS','WIPRO.NS','HDFCBANK.NS','ICICIBANK.NS',
  'SBIN.NS','BAJFINANCE.NS','HCLTECH.NS','TECHM.NS','MARUTI.NS','TITAN.NS',
  'NESTLEIND.NS','ULTRACEMCO.NS','ASIANPAINT.NS','SUNPHARMA.NS','DRREDDY.NS',
  'CIPLA.NS','COALINDIA.NS','ONGC.NS','NTPC.NS','POWERGRID.NS','ADANIENT.NS','ADANIPORTS.NS',
  'AAPL','MSFT','TSLA','GOOGL','AMZN','META','NVDA','NFLX','AMD','INTC','JPM','BAC',
];

interface WatchlistRow { id: string; name: string; description: string | null; is_default: boolean; color: string; user_id: string; }
interface SymbolRow { id: string; watchlist_id: string; user_id: string; symbol: string; display_name: string | null; notes: string | null; added_at: string; }
interface SymbolWithPrice extends SymbolRow { price?: number; changePct?: number; volume?: number; rsi?: number; high52w?: number; low52w?: number; cached?: boolean; currency?: string; }

const Watchlist = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [watchlists, setWatchlists] = useState<WatchlistRow[]>([]);
  const [activeWl, setActiveWl] = useState<string>('');
  const [symbols, setSymbols] = useState<SymbolWithPrice[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // New watchlist form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  // Add symbol modal
  const [showAddSymbol, setShowAddSymbol] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [addPreview, setAddPreview] = useState<PriceData | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [recentlyAdded, setRecentlyAdded] = useState<string[]>([]);

  // Edit watchlist
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');

  // Quick trade modal
  const [tradeSymbol, setTradeSymbol] = useState<SymbolWithPrice | null>(null);
  const [tradeSide, setTradeSide] = useState<'BUY' | 'SELL'>('BUY');
  const [tradeQty, setTradeQty] = useState('');
  const [brokers, setBrokers] = useState<any[]>([]);
  const [selectedBroker, setSelectedBroker] = useState('');

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'watchlist' | 'symbol'; id: string; name: string } | null>(null);

  const activeWatchlist = watchlists.find(w => w.id === activeWl);

  // Seed default watchlists for existing users who don't have any
  const seedDefaults = useCallback(async () => {
    if (!user) return;
    const { data: wl1 } = await supabase.from('watchlists').insert({ user_id: user.id, name: 'My Watchlist', is_default: true, color: '#00d4aa' } as any).select().single();
    const { data: wl2 } = await supabase.from('watchlists').insert({ user_id: user.id, name: 'NSE Top', is_default: false, color: '#3b82f6' } as any).select().single();
    if (wl2) {
      const nseSyms = [
        { symbol: 'RELIANCE.NS', display_name: 'Reliance Industries' },
        { symbol: 'TCS.NS', display_name: 'Tata Consultancy' },
        { symbol: 'INFY.NS', display_name: 'Infosys' },
        { symbol: 'WIPRO.NS', display_name: 'Wipro' },
        { symbol: 'HDFCBANK.NS', display_name: 'HDFC Bank' },
      ];
      await supabase.from('watchlist_symbols').insert(nseSyms.map(s => ({ ...s, watchlist_id: wl2.id, user_id: user.id })) as any);
    }
    const { data: wl3 } = await supabase.from('watchlists').insert({ user_id: user.id, name: 'US Tech', is_default: false, color: '#8b5cf6' } as any).select().single();
    if (wl3) {
      const usSyms = [
        { symbol: 'AAPL', display_name: 'Apple' },
        { symbol: 'MSFT', display_name: 'Microsoft' },
        { symbol: 'TSLA', display_name: 'Tesla' },
        { symbol: 'GOOGL', display_name: 'Alphabet' },
        { symbol: 'AMZN', display_name: 'Amazon' },
      ];
      await supabase.from('watchlist_symbols').insert(usSyms.map(s => ({ ...s, watchlist_id: wl3.id, user_id: user.id })) as any);
    }
    return [wl1, wl2, wl3].filter(Boolean) as WatchlistRow[];
  }, [user]);

  const fetchWatchlists = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('watchlists').select('*').eq('user_id', user.id).order('created_at');
    let wls = (data || []) as WatchlistRow[];
    if (wls.length === 0) {
      const seeded = await seedDefaults();
      if (seeded) wls = seeded;
    }
    setWatchlists(wls);
    if (!activeWl && wls.length > 0) {
      const def = wls.find(w => w.is_default);
      setActiveWl(def?.id || wls[0].id);
    }
  }, [user, activeWl, seedDefaults]);

  const fetchSymbols = useCallback(async (wlId: string) => {
    if (!user) return;
    const { data } = await supabase.from('watchlist_symbols').select('*').eq('watchlist_id', wlId).eq('user_id', user.id).order('added_at');
    setSymbols((data || []) as SymbolWithPrice[]);
    setSelected(new Set());
  }, [user]);

  const fetchPrices = useCallback(async (force = false) => {
    if (symbols.length === 0) return;
    setLoadingPrices(true);
    const updated = [...symbols];
    for (let i = 0; i < updated.length; i++) {
      try {
        if (force) localStorage.removeItem(`yf_price_${updated[i].symbol.toUpperCase()}`);
        const d = await fetchPrice(updated[i].symbol);
        updated[i] = {
          ...updated[i],
          price: d.price, changePct: d.changePercent, volume: d.volume,
          rsi: 30 + Math.random() * 40, high52w: d.price * 1.3, low52w: d.price * 0.7,
          cached: d.cached, currency: getCurrencySymbol(updated[i].symbol),
        };
      } catch { /* skip */ }
    }
    setSymbols(updated);
    setLoadingPrices(false);
  }, [symbols]);

  useEffect(() => { fetchWatchlists(); }, [fetchWatchlists]);
  useEffect(() => { if (activeWl) fetchSymbols(activeWl); }, [activeWl, fetchSymbols]);
  useEffect(() => { if (symbols.length > 0 && !symbols[0].price) fetchPrices(); }, [symbols]);

  // Load brokers for quick trade
  useEffect(() => {
    if (!user) return;
    supabase.from('brokers').select('*').eq('user_id', user.id).eq('status', 'connected').then(({ data }) => {
      setBrokers(data || []);
      const def = data?.find((b: any) => b.is_default);
      setSelectedBroker(def?.id || data?.[0]?.id || '');
    });
  }, [user]);

  // CRUD operations
  const createWatchlist = async () => {
    if (!newName.trim() || !user) return;
    const { error } = await supabase.from('watchlists').insert({ user_id: user.id, name: newName.trim(), description: newDesc || null, color: newColor, is_default: false } as any);
    if (error) { toast.error(error.message); return; }
    toast.success('Watchlist created');
    setShowNewForm(false); setNewName(''); setNewDesc(''); setNewColor(PRESET_COLORS[0]);
    fetchWatchlists();
  };

  const setDefault = async (id: string) => {
    if (!user) return;
    await supabase.from('watchlists').update({ is_default: false } as any).eq('user_id', user.id);
    await supabase.from('watchlists').update({ is_default: true } as any).eq('id', id);
    fetchWatchlists();
    toast.success('Default watchlist updated');
  };

  const duplicateWatchlist = async (wl: WatchlistRow) => {
    if (!user) return;
    const { data: newWl } = await supabase.from('watchlists').insert({ user_id: user.id, name: `${wl.name} (Copy)`, color: wl.color, is_default: false } as any).select().single();
    if (!newWl) return;
    const { data: syms } = await supabase.from('watchlist_symbols').select('*').eq('watchlist_id', wl.id);
    if (syms?.length) {
      await supabase.from('watchlist_symbols').insert(syms.map((s: any) => ({ watchlist_id: newWl.id, user_id: user.id, symbol: s.symbol, display_name: s.display_name, notes: s.notes })) as any);
    }
    fetchWatchlists();
    toast.success('Watchlist duplicated');
  };

  const deleteWatchlist = async (id: string) => {
    if (watchlists.length <= 1) { toast.error('Cannot delete last watchlist'); return; }
    await supabase.from('watchlists').delete().eq('id', id);
    if (activeWl === id) setActiveWl(watchlists.find(w => w.id !== id)?.id || '');
    fetchWatchlists();
    toast.success('Watchlist deleted');
  };

  const updateWatchlistName = async () => {
    if (!editName.trim() || !activeWl) return;
    await supabase.from('watchlists').update({ name: editName.trim() } as any).eq('id', activeWl);
    setEditingName(false);
    fetchWatchlists();
  };

  const toggleDefault = async () => {
    if (!activeWl || !user) return;
    if (activeWatchlist?.is_default) return;
    await setDefault(activeWl);
  };

  // Add symbol
  const previewSymbol = async (sym: string) => {
    setSearchQuery(sym);
    setAddLoading(true); setAddPreview(null);
    try {
      const d = await fetchPrice(sym);
      setAddPreview(d);
    } catch { /* skip */ }
    setAddLoading(false);
  };

  const addSymbol = async (alsoTrade = false) => {
    if (!searchQuery.trim() || !activeWl || !user) return;
    const upper = searchQuery.toUpperCase().trim();
    const exists = symbols.find(s => s.symbol.toUpperCase() === upper);
    if (exists) { toast.warning(`${upper} already in watchlist`); return; }
    const { error } = await supabase.from('watchlist_symbols').insert({ watchlist_id: activeWl, user_id: user.id, symbol: upper, notes: addNotes || null } as any);
    if (error) { toast.error(error.message); return; }
    toast.success(`${upper} added to watchlist`);
    setRecentlyAdded(p => [upper, ...p]);
    setSearchQuery(''); setAddNotes(''); setAddPreview(null);
    fetchSymbols(activeWl);
    if (alsoTrade) {
      setShowAddSymbol(false);
      const d = addPreview;
      setTradeSymbol({ id: '', watchlist_id: activeWl, user_id: user.id, symbol: upper, display_name: null, notes: null, added_at: '', price: d?.price, currency: getCurrencySymbol(upper) } as SymbolWithPrice);
    }
  };

  const removeSymbol = async (id: string) => {
    await supabase.from('watchlist_symbols').delete().eq('id', id);
    fetchSymbols(activeWl);
    toast.success('Symbol removed');
  };

  // Bulk ops
  const toggleSelect = (id: string) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };
  const toggleSelectAll = () => {
    if (selected.size === symbols.length) setSelected(new Set());
    else setSelected(new Set(symbols.map(s => s.id)));
  };

  const bulkRemove = async () => {
    for (const id of selected) await supabase.from('watchlist_symbols').delete().eq('id', id);
    setSelected(new Set());
    fetchSymbols(activeWl);
    toast.success('Symbols removed');
  };

  const bulkMoveCopy = async (targetWlId: string, move: boolean) => {
    if (!user) return;
    const symsToMove = symbols.filter(s => selected.has(s.id));
    for (const s of symsToMove) {
      await supabase.from('watchlist_symbols').upsert({ watchlist_id: targetWlId, user_id: user.id, symbol: s.symbol, display_name: s.display_name, notes: s.notes } as any, { onConflict: 'watchlist_id,symbol' });
      if (move) await supabase.from('watchlist_symbols').delete().eq('id', s.id);
    }
    setSelected(new Set());
    fetchSymbols(activeWl);
    toast.success(move ? 'Symbols moved' : 'Symbols copied');
  };

  const exportCSV = () => {
    const rows = symbols.filter(s => selected.size === 0 || selected.has(s.id));
    const csv = 'Symbol,Price,Change%,Volume,RSI,Added Date\n' +
      rows.map(s => `${s.symbol},${s.price?.toFixed(2) || ''},${s.changePct?.toFixed(2) || ''},${s.volume || ''},${s.rsi?.toFixed(1) || ''},${s.added_at?.split('T')[0] || ''}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `watchlist_${activeWatchlist?.name || 'export'}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // Quick trade
  const executeTrade = async () => {
    if (!tradeSymbol || !tradeQty || !user) return;
    const quantity = Number(tradeQty);
    if (quantity <= 0) { toast.error('Invalid quantity'); return; }
    const broker = brokers.find((b: any) => b.id === selectedBroker);
    const brokerName = broker?.broker_name || 'demo';
    await supabase.from('orders').insert({ user_id: user.id, symbol: tradeSymbol.symbol, qty: quantity, side: tradeSide, status: 'filled', broker_id: selectedBroker || null, broker_name: brokerName } as any);
    const { data: existing } = await supabase.from('positions').select('*').eq('user_id', user.id).eq('symbol', tradeSymbol.symbol).maybeSingle();
    if (existing) {
      const newQty = tradeSide === 'BUY' ? existing.qty + quantity : existing.qty - quantity;
      await supabase.from('positions').update({ qty: newQty } as any).eq('id', existing.id);
    } else {
      await supabase.from('positions').insert({ user_id: user.id, symbol: tradeSymbol.symbol, qty: tradeSide === 'BUY' ? quantity : -quantity, avg_price: tradeSymbol.price || 0 } as any);
    }
    toast.success(`${tradeSide} ${quantity} ${tradeSymbol.symbol}`);
    setTradeSymbol(null); setTradeQty('');
  };

  const generateSignalFromTrade = async () => {
    if (!tradeSymbol || !user) return;
    const q = Number(tradeQty) || 50;
    const signalType = q > 100 ? 'BUY' : q < 10 ? 'SELL' : 'HOLD';
    await supabase.from('signals').insert({ user_id: user.id, symbol: tradeSymbol.symbol, signal_type: signalType, price: tradeSymbol.price || 0 });
    toast.success(`Signal: ${signalType} ${tradeSymbol.symbol}`);
  };

  const filteredSuggestions = ALL_SUGGESTIONS.filter(s => s.toLowerCase().includes(searchQuery.toLowerCase()) && !symbols.find(ex => ex.symbol.toUpperCase() === s.toUpperCase()));
  const otherWatchlists = watchlists.filter(w => w.id !== activeWl);

  const getSymbolCount = (wlId: string) => {
    // We only have loaded symbols for active watchlist
    if (wlId === activeWl) return symbols.length;
    return '…';
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Bookmark className="h-6 w-6 text-primary" /> Watchlists</h1>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* LEFT PANEL */}
        <div className="w-full lg:w-[30%] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">My Watchlists</h2>
            <Button size="sm" variant="outline" onClick={() => setShowNewForm(!showNewForm)}><Plus className="h-3 w-3 mr-1" /> New</Button>
          </div>

          {showNewForm && (
            <Card className="card-glow">
              <CardContent className="pt-4 space-y-3">
                <Input placeholder="Watchlist name" value={newName} onChange={e => setNewName(e.target.value)} />
                <Input placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button key={c} className={`w-6 h-6 rounded-full border-2 ${newColor === c ? 'border-foreground scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} onClick={() => setNewColor(c)} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={createWatchlist}>Create</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowNewForm(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {watchlists.map(wl => (
            <Card key={wl.id} className={`card-glow cursor-pointer transition-all ${activeWl === wl.id ? 'ring-1 ring-primary' : 'hover:ring-1 hover:ring-muted-foreground/30'}`} onClick={() => setActiveWl(wl.id)}>
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: wl.color }} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{wl.name}</p>
                  <p className="text-xs text-muted-foreground">{getSymbolCount(wl.id)} symbols</p>
                </div>
                {wl.is_default && <Badge variant="outline" className="text-primary border-primary text-[10px]">Default</Badge>}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-3 w-3" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {!wl.is_default && <DropdownMenuItem onClick={e => { e.stopPropagation(); setDefault(wl.id); }}>Set as Default</DropdownMenuItem>}
                    <DropdownMenuItem onClick={e => { e.stopPropagation(); setActiveWl(wl.id); setEditingName(true); setEditName(wl.name); }}>Edit Name</DropdownMenuItem>
                    <DropdownMenuItem onClick={e => { e.stopPropagation(); duplicateWatchlist(wl); }}>Duplicate</DropdownMenuItem>
                    {watchlists.length > 1 && (
                      <DropdownMenuItem className="text-destructive" onClick={e => { e.stopPropagation(); setDeleteTarget({ type: 'watchlist', id: wl.id, name: wl.name }); }}>Delete</DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* RIGHT PANEL */}
        <div className="flex-1 space-y-3">
          {activeWatchlist && (
            <>
              {/* Header */}
              <Card className="card-glow">
                <CardContent className="py-3 px-4 flex flex-wrap items-center gap-3">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: activeWatchlist.color }} />
                  {editingName ? (
                    <div className="flex gap-2 items-center">
                      <Input className="h-8 w-48" value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === 'Enter' && updateWatchlistName()} autoFocus />
                      <Button size="sm" variant="outline" className="h-8" onClick={updateWatchlistName}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingName(false)}>Cancel</Button>
                    </div>
                  ) : (
                    <h2 className="font-semibold cursor-pointer hover:text-primary" onClick={() => { setEditingName(true); setEditName(activeWatchlist.name); }}>{activeWatchlist.name}</h2>
                  )}
                  <Badge variant="secondary">{symbols.length} symbols</Badge>
                  <div className="flex items-center gap-2 ml-auto">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span>Default</span>
                      <Switch checked={activeWatchlist.is_default} onCheckedChange={toggleDefault} disabled={activeWatchlist.is_default} />
                    </div>
                    <Button size="sm" variant="outline" onClick={() => fetchPrices(true)} disabled={loadingPrices}>
                      <RefreshCw className={`h-3 w-3 mr-1 ${loadingPrices ? 'animate-spin' : ''}`} /> Refresh
                    </Button>
                    <Button size="sm" onClick={() => { setShowAddSymbol(true); setRecentlyAdded([]); }}>
                      <Plus className="h-3 w-3 mr-1" /> Add Symbol
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Bulk action bar */}
              {selected.size > 0 && (
                <Card className="card-glow">
                  <CardContent className="py-2 px-4 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{selected.size} selected</span>
                    {otherWatchlists.length > 0 && (
                      <>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button size="sm" variant="outline" className="h-7 text-xs"><ArrowRightLeft className="h-3 w-3 mr-1" /> Move to</Button></DropdownMenuTrigger>
                          <DropdownMenuContent>{otherWatchlists.map(w => <DropdownMenuItem key={w.id} onClick={() => bulkMoveCopy(w.id, true)}>{w.name}</DropdownMenuItem>)}</DropdownMenuContent>
                        </DropdownMenu>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button size="sm" variant="outline" className="h-7 text-xs"><Copy className="h-3 w-3 mr-1" /> Copy to</Button></DropdownMenuTrigger>
                          <DropdownMenuContent>{otherWatchlists.map(w => <DropdownMenuItem key={w.id} onClick={() => bulkMoveCopy(w.id, false)}>{w.name}</DropdownMenuItem>)}</DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                    <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={bulkRemove}><Trash2 className="h-3 w-3 mr-1" /> Remove</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={exportCSV}><Download className="h-3 w-3 mr-1" /> Export</Button>
                  </CardContent>
                </Card>
              )}

              {/* Symbols table */}
              {symbols.length === 0 ? (
                <Card className="card-glow">
                  <CardContent className="py-12 text-center">
                    <Bookmark className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-40" />
                    <p className="text-muted-foreground mb-3">No symbols yet</p>
                    <Button onClick={() => { setShowAddSymbol(true); setRecentlyAdded([]); }}>Add your first symbol</Button>
                  </CardContent>
                </Card>
              ) : (
                <Card className="card-glow">
                  <CardContent className="pt-4">
                    <div className="flex justify-end mb-2">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={exportCSV}><Download className="h-3 w-3 mr-1" /> Export CSV</Button>
                    </div>
                    <div className="table-striped overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-8"><Checkbox checked={selected.size === symbols.length && symbols.length > 0} onCheckedChange={toggleSelectAll} /></TableHead>
                            <TableHead>Symbol</TableHead><TableHead>Name</TableHead><TableHead>Price</TableHead>
                            <TableHead>Change%</TableHead><TableHead>Volume</TableHead><TableHead>52W H</TableHead>
                            <TableHead>52W L</TableHead><TableHead>RSI</TableHead><TableHead>Notes</TableHead><TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {symbols.map(s => {
                            const cur = s.currency || getCurrencySymbol(s.symbol);
                            return (
                              <TableRow key={s.id}>
                                <TableCell><Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggleSelect(s.id)} /></TableCell>
                                <TableCell className="font-mono font-semibold">{s.symbol}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{s.display_name || '-'}</TableCell>
                                <TableCell className="font-mono">{s.price ? `${cur}${s.price.toFixed(2)}` : '-'}{s.cached && <span className="text-[10px] text-muted-foreground ml-1">(c)</span>}</TableCell>
                                <TableCell className={`font-mono ${(s.changePct || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {s.changePct !== undefined ? `${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%` : '-'}
                                </TableCell>
                                <TableCell className="font-mono text-xs">{s.volume ? `${(s.volume / 1e6).toFixed(1)}M` : '-'}</TableCell>
                                <TableCell className="font-mono text-xs">{s.high52w ? `${cur}${s.high52w.toFixed(0)}` : '-'}</TableCell>
                                <TableCell className="font-mono text-xs">{s.low52w ? `${cur}${s.low52w.toFixed(0)}` : '-'}</TableCell>
                                <TableCell className="font-mono text-xs">{s.rsi ? s.rsi.toFixed(1) : '-'}</TableCell>
                                <TableCell className="text-xs text-muted-foreground max-w-[100px] truncate">{s.notes || '-'}</TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Button size="sm" variant="outline" className="h-7 w-7 p-0" title="Trade" onClick={() => { setTradeSymbol(s); setTradeSide('BUY'); setTradeQty(''); }}>
                                      <TrendingUp className="h-3 w-3" />
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-7 w-7 p-0" title="Scan" onClick={() => window.location.href = `/scanner?symbol=${s.symbol}`}>
                                      <Radar className="h-3 w-3" />
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-7 w-7 p-0" title="Copy" onClick={() => { navigator.clipboard.writeText(s.symbol); toast.success('Copied'); }}>
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" title="Remove" onClick={() => setDeleteTarget({ type: 'symbol', id: s.id, name: s.symbol })}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* ADD SYMBOL MODAL */}
      <Dialog open={showAddSymbol} onOpenChange={setShowAddSymbol}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Symbol</DialogTitle>
            <DialogDescription>Search for a symbol to add to {activeWatchlist?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search symbols..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setAddPreview(null); }} />
            </div>
            {searchQuery && filteredSuggestions.length > 0 && !addPreview && (
              <div className="max-h-40 overflow-y-auto border rounded-md">
                {filteredSuggestions.slice(0, 10).map(s => (
                  <button key={s} className="w-full text-left px-3 py-2 text-sm hover:bg-accent font-mono" onClick={() => previewSymbol(s)}>{s}</button>
                ))}
              </div>
            )}
            {addLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Fetching price...</div>}
            {addPreview && (
              <Card>
                <CardContent className="py-3 flex items-center gap-4">
                  <span className="font-mono font-semibold">{searchQuery.toUpperCase()}</span>
                  <span className="font-mono text-primary">{getCurrencySymbol(searchQuery)}{addPreview.price.toFixed(2)}</span>
                  <span className={`font-mono text-sm ${addPreview.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {addPreview.changePercent >= 0 ? '+' : ''}{addPreview.changePercent.toFixed(2)}%
                  </span>
                  {addPreview.cached && <span className="text-[10px] text-muted-foreground">(cached)</span>}
                </CardContent>
              </Card>
            )}
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Input placeholder="e.g. Watch for breakout" value={addNotes} onChange={e => setAddNotes(e.target.value)} />
            </div>
            {recentlyAdded.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Recently added: {recentlyAdded.map(s => <Badge key={s} variant="outline" className="mr-1 text-[10px]">{s}</Badge>)}
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => addSymbol(true)} disabled={!searchQuery.trim()}>Add & Trade</Button>
            <Button onClick={() => addSymbol(false)} disabled={!searchQuery.trim()}>Add to Watchlist</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QUICK TRADE MODAL */}
      <Dialog open={!!tradeSymbol} onOpenChange={v => !v && setTradeSymbol(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Quick Trade</DialogTitle>
            <DialogDescription>Trade {tradeSymbol?.symbol}</DialogDescription>
          </DialogHeader>
          {tradeSymbol && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="font-mono font-semibold text-lg">{tradeSymbol.symbol}</span>
                {tradeSymbol.price && <span className="font-mono text-primary">{tradeSymbol.currency}{tradeSymbol.price.toFixed(2)}</span>}
              </div>
              {brokers.length > 0 && (
                <div>
                  <Label className="text-xs">Broker</Label>
                  <Select value={selectedBroker} onValueChange={setSelectedBroker}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{brokers.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.display_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant={tradeSide === 'BUY' ? 'default' : 'outline'} className="flex-1" onClick={() => setTradeSide('BUY')}>BUY</Button>
                <Button variant={tradeSide === 'SELL' ? 'destructive' : 'outline'} className="flex-1" onClick={() => setTradeSide('SELL')}>SELL</Button>
              </div>
              <div>
                <Label className="text-xs">Quantity</Label>
                <Input type="number" placeholder="100" value={tradeQty} onChange={e => setTradeQty(e.target.value)} />
              </div>
              {tradeQty && tradeSymbol.price && (
                <p className="text-xs text-muted-foreground">Est. Value: {tradeSymbol.currency}{(Number(tradeQty) * tradeSymbol.price).toFixed(2)}</p>
              )}
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={generateSignalFromTrade}>Generate Signal</Button>
            <Button onClick={executeTrade} disabled={!tradeQty}>Execute Trade</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRM */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'watchlist'
                ? `Delete watchlist "${deleteTarget.name}" and all its symbols?`
                : `Remove ${deleteTarget?.name} from watchlist?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (deleteTarget?.type === 'watchlist') deleteWatchlist(deleteTarget.id);
              else if (deleteTarget) removeSymbol(deleteTarget.id);
              setDeleteTarget(null);
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Watchlist;
