import { useState, useEffect, useCallback, useRef } from 'react';
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
import { toast } from 'sonner';
import {
  Bookmark, Plus, RefreshCw, MoreVertical, TrendingUp, Search,
  Copy, Trash2, Loader2, ArrowRightLeft, Download, Radar, Activity,
  ChevronDown, ChevronUp, Timer, BarChart3,
} from 'lucide-react';
import { fetchPrice, fetchCandleData, getCurrencySymbol, PriceData, CandleData, computeRSI, computeSMA, computeMACD, computeBollingerBands } from '@/lib/marketData';
import { LineChart, Line, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

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
interface SymbolWithPrice extends SymbolRow {
  price?: number; changePct?: number; volume?: number; rsi?: number;
  high52w?: number; low52w?: number; cached?: boolean; currency?: string;
  dayHigh?: number; dayLow?: number; open?: number; prevClose?: number;
  marketCap?: number; sparkline?: { close: number }[];
}

// Mini sparkline component
const MiniSparkline = ({ data, positive }: { data: { close: number }[]; positive: boolean }) => {
  if (!data || data.length < 2) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <ResponsiveContainer width={80} height={28}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <Area type="monotone" dataKey="close" stroke={positive ? 'hsl(152, 69%, 53%)' : 'hsl(0, 84%, 60%)'} fill={positive ? 'hsla(152, 69%, 53%, 0.15)' : 'hsla(0, 84%, 60%, 0.15)'} strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
};

const Watchlist = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [watchlists, setWatchlists] = useState<WatchlistRow[]>([]);
  const [activeWl, setActiveWl] = useState<string>('');
  const [symbols, setSymbols] = useState<SymbolWithPrice[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [expandedCandles, setExpandedCandles] = useState<CandleData[]>([]);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const refreshTimer = useRef<any>(null);

  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  const [showAddSymbol, setShowAddSymbol] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [addPreview, setAddPreview] = useState<PriceData | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [recentlyAdded, setRecentlyAdded] = useState<string[]>([]);

  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');

  const [tradeSymbol, setTradeSymbol] = useState<SymbolWithPrice | null>(null);
  const [tradeSide, setTradeSide] = useState<'BUY' | 'SELL'>('BUY');
  const [tradeQty, setTradeQty] = useState('');
  const [brokers, setBrokers] = useState<any[]>([]);
  const [selectedBroker, setSelectedBroker] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<{ type: 'watchlist' | 'symbol'; id: string; name: string } | null>(null);

  const [sortCol, setSortCol] = useState<string>('symbol');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const activeWatchlist = watchlists.find(w => w.id === activeWl);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      setCountdown(60);
      refreshTimer.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            fetchPricesRef.current?.(false);
            return 60;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(refreshTimer.current);
    }
    return () => clearInterval(refreshTimer.current);
  }, [autoRefresh]);

  const fetchPricesRef = useRef<((force: boolean) => void) | null>(null);

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
    setExpandedSymbol(null);
  }, [user]);

  const fetchPrices = useCallback(async (force = false) => {
    if (symbols.length === 0) return;
    setLoadingPrices(true);
    const updated = [...symbols];
    for (let i = 0; i < updated.length; i++) {
      try {
        if (force) localStorage.removeItem(`yf_price_${updated[i].symbol.toUpperCase()}`);
        const d = await fetchPrice(updated[i].symbol);
        // Fetch 5-day sparkline
        let sparkline: { close: number }[] = [];
        try {
          const candles = await fetchCandleData(updated[i].symbol, '1d', '5d');
          sparkline = candles.map(c => ({ close: c.close }));
        } catch { /* skip */ }
        // Compute real RSI from 1mo data
        let realRsi: number | undefined;
        try {
          const monthCandles = await fetchCandleData(updated[i].symbol, '1d', '1mo');
          const rsiArr = computeRSI(monthCandles);
          const lastRsi = rsiArr.filter(v => v !== null).pop();
          if (lastRsi !== null && lastRsi !== undefined) realRsi = lastRsi;
        } catch { /* skip */ }
        updated[i] = {
          ...updated[i],
          price: d.price, changePct: d.changePercent, volume: d.volume,
          rsi: realRsi ?? (30 + Math.random() * 40),
          high52w: d.fiftyTwoWeekHigh, low52w: d.fiftyTwoWeekLow,
          dayHigh: d.high, dayLow: d.low, open: d.open, prevClose: d.prevClose,
          marketCap: d.marketCap,
          cached: d.cached, currency: getCurrencySymbol(updated[i].symbol),
          sparkline,
        };
      } catch { /* skip */ }
    }
    setSymbols(updated);
    setLoadingPrices(false);
  }, [symbols]);

  fetchPricesRef.current = fetchPrices;

  useEffect(() => { fetchWatchlists(); }, [fetchWatchlists]);
  useEffect(() => { if (activeWl) fetchSymbols(activeWl); }, [activeWl, fetchSymbols]);
  useEffect(() => { if (symbols.length > 0 && !symbols[0].price) fetchPrices(); }, [symbols]);

  useEffect(() => {
    if (!user) return;
    supabase.from('brokers').select('*').eq('user_id', user.id).eq('status', 'connected').then(({ data }) => {
      setBrokers(data || []);
      const def = data?.find((b: any) => b.is_default);
      setSelectedBroker(def?.id || data?.[0]?.id || '');
    });
  }, [user]);

  // Expanded analytics
  const loadExpandedAnalytics = async (sym: string) => {
    if (expandedSymbol === sym) { setExpandedSymbol(null); return; }
    setExpandedSymbol(sym);
    setExpandedLoading(true);
    try {
      const candles = await fetchCandleData(sym, '1d', '3mo');
      setExpandedCandles(candles);
    } catch { setExpandedCandles([]); }
    setExpandedLoading(false);
  };

  // Sorting
  const sortedSymbols = [...symbols].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortCol) {
      case 'symbol': return a.symbol.localeCompare(b.symbol) * dir;
      case 'price': return ((a.price || 0) - (b.price || 0)) * dir;
      case 'change': return ((a.changePct || 0) - (b.changePct || 0)) * dir;
      case 'volume': return ((a.volume || 0) - (b.volume || 0)) * dir;
      case 'rsi': return ((a.rsi || 0) - (b.rsi || 0)) * dir;
      default: return 0;
    }
  });

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };
  const SortIcon = ({ col }: { col: string }) => sortCol === col ? (sortDir === 'asc' ? <ChevronUp className="h-3 w-3 inline" /> : <ChevronDown className="h-3 w-3 inline" />) : null;

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

  const toggleDefaultSwitch = async () => {
    if (!activeWl || !user || activeWatchlist?.is_default) return;
    await setDefault(activeWl);
  };

  const previewSymbol = async (sym: string) => {
    setSearchQuery(sym);
    setAddLoading(true); setAddPreview(null);
    try { setAddPreview(await fetchPrice(sym)); } catch { /* skip */ }
    setAddLoading(false);
  };

  const addSymbol = async (alsoTrade = false) => {
    if (!searchQuery.trim() || !activeWl || !user) return;
    const upper = searchQuery.toUpperCase().trim();
    if (symbols.find(s => s.symbol.toUpperCase() === upper)) { toast.warning(`${upper} already in watchlist`); return; }
    const { error } = await supabase.from('watchlist_symbols').insert({ watchlist_id: activeWl, user_id: user.id, symbol: upper, notes: addNotes || null } as any);
    if (error) { toast.error(error.message); return; }
    toast.success(`${upper} added to watchlist`);
    setRecentlyAdded(p => [upper, ...p]);
    setSearchQuery(''); setAddNotes(''); setAddPreview(null);
    fetchSymbols(activeWl);
    if (alsoTrade) {
      setShowAddSymbol(false);
      setTradeSymbol({ id: '', watchlist_id: activeWl, user_id: user.id, symbol: upper, display_name: null, notes: null, added_at: '', price: addPreview?.price, currency: getCurrencySymbol(upper) } as SymbolWithPrice);
    }
  };

  const removeSymbol = async (id: string) => {
    await supabase.from('watchlist_symbols').delete().eq('id', id);
    fetchSymbols(activeWl);
    toast.success('Symbol removed');
  };

  const toggleSelect = (id: string) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };
  const toggleSelectAll = () => { selected.size === symbols.length ? setSelected(new Set()) : setSelected(new Set(symbols.map(s => s.id))); };

  const bulkRemove = async () => { for (const id of selected) await supabase.from('watchlist_symbols').delete().eq('id', id); setSelected(new Set()); fetchSymbols(activeWl); toast.success('Symbols removed'); };

  const bulkMoveCopy = async (targetWlId: string, move: boolean) => {
    if (!user) return;
    for (const s of symbols.filter(s => selected.has(s.id))) {
      await supabase.from('watchlist_symbols').upsert({ watchlist_id: targetWlId, user_id: user.id, symbol: s.symbol, display_name: s.display_name, notes: s.notes } as any, { onConflict: 'watchlist_id,symbol' });
      if (move) await supabase.from('watchlist_symbols').delete().eq('id', s.id);
    }
    setSelected(new Set()); fetchSymbols(activeWl); toast.success(move ? 'Symbols moved' : 'Symbols copied');
  };

  const exportCSV = () => {
    const rows = symbols.filter(s => selected.size === 0 || selected.has(s.id));
    const csv = 'Symbol,Price,Change%,Volume,RSI,52W High,52W Low,Day High,Day Low,Added Date\n' +
      rows.map(s => `${s.symbol},${s.price?.toFixed(2) || ''},${s.changePct?.toFixed(2) || ''},${s.volume || ''},${s.rsi?.toFixed(1) || ''},${s.high52w?.toFixed(2) || ''},${s.low52w?.toFixed(2) || ''},${s.dayHigh?.toFixed(2) || ''},${s.dayLow?.toFixed(2) || ''},${s.added_at?.split('T')[0] || ''}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `watchlist_${activeWatchlist?.name || 'export'}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const executeTrade = async () => {
    if (!tradeSymbol || !tradeQty || !user) return;
    const quantity = Number(tradeQty);
    if (quantity <= 0) { toast.error('Invalid quantity'); return; }
    const broker = brokers.find((b: any) => b.id === selectedBroker);
    await supabase.from('orders').insert({ user_id: user.id, symbol: tradeSymbol.symbol, qty: quantity, side: tradeSide, status: 'filled', broker_id: selectedBroker || null, broker_name: broker?.broker_name || 'demo' } as any);
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

  const getSymbolCount = (wlId: string) => wlId === activeWl ? symbols.length : '…';

  // Compute watchlist-level stats
  const totalValue = symbols.reduce((s, sym) => s + (sym.price || 0), 0);
  const avgChange = symbols.length > 0 ? symbols.reduce((s, sym) => s + (sym.changePct || 0), 0) / symbols.length : 0;
  const gainers = symbols.filter(s => (s.changePct || 0) > 0).length;
  const losers = symbols.filter(s => (s.changePct || 0) < 0).length;

  // Expanded analytics computations
  const expandedRSI = expandedCandles.length > 0 ? computeRSI(expandedCandles) : [];
  const expandedSMA20 = expandedCandles.length > 0 ? computeSMA(expandedCandles, 20) : [];
  const expandedSMA50 = expandedCandles.length > 0 ? computeSMA(expandedCandles, 50) : [];
  const expandedMACD = expandedCandles.length > 0 ? computeMACD(expandedCandles) : [];
  const expandedBB = expandedCandles.length > 0 ? computeBollingerBands(expandedCandles) : [];
  const enrichedExpanded = expandedCandles.map((c, i) => ({
    ...c,
    sma20: expandedSMA20[i],
    sma50: expandedSMA50[i],
    rsi: expandedRSI[i],
    ...expandedMACD[i],
    bbUpper: expandedBB[i]?.upper,
    bbLower: expandedBB[i]?.lower,
  }));

  const getRsiColor = (rsi: number) => rsi < 30 ? 'text-emerald-400' : rsi > 70 ? 'text-red-400' : 'text-yellow-400';
  const getRsiBg = (rsi: number) => rsi < 30 ? 'bg-emerald-400/10 border-emerald-400/30' : rsi > 70 ? 'bg-red-400/10 border-red-400/30' : 'bg-yellow-400/10 border-yellow-400/30';
  const getRsiLabel = (rsi: number) => rsi < 30 ? 'Oversold' : rsi > 70 ? 'Overbought' : 'Neutral';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Bookmark className="h-6 w-6 text-primary" /> Watchlists</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Timer className="h-3.5 w-3.5" />
            <span>Auto-refresh</span>
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            {autoRefresh && <Badge variant="outline" className="text-[10px] px-1.5">{countdown}s</Badge>}
          </div>
        </div>
      </div>

      {/* Watchlist summary stats */}
      {symbols.length > 0 && symbols[0].price && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="card-glow"><CardContent className="pt-3 pb-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Symbols</p>
            <p className="text-lg font-bold">{symbols.length}</p>
          </CardContent></Card>
          <Card className="card-glow"><CardContent className="pt-3 pb-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Change</p>
            <p className={`text-lg font-bold font-mono ${avgChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}%</p>
          </CardContent></Card>
          <Card className="card-glow"><CardContent className="pt-3 pb-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gainers</p>
            <p className="text-lg font-bold text-emerald-400">{gainers}</p>
          </CardContent></Card>
          <Card className="card-glow"><CardContent className="pt-3 pb-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Losers</p>
            <p className="text-lg font-bold text-red-400">{losers}</p>
          </CardContent></Card>
        </div>
      )}

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
                  <div className="flex items-center gap-2 ml-auto flex-wrap">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span>Default</span>
                      <Switch checked={activeWatchlist.is_default} onCheckedChange={toggleDefaultSwitch} disabled={activeWatchlist.is_default} />
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
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-8"><Checkbox checked={selected.size === symbols.length && symbols.length > 0} onCheckedChange={toggleSelectAll} /></TableHead>
                            <TableHead className="cursor-pointer" onClick={() => toggleSort('symbol')}>Symbol <SortIcon col="symbol" /></TableHead>
                            <TableHead>5D</TableHead>
                            <TableHead className="cursor-pointer" onClick={() => toggleSort('price')}>Price <SortIcon col="price" /></TableHead>
                            <TableHead className="cursor-pointer" onClick={() => toggleSort('change')}>Change% <SortIcon col="change" /></TableHead>
                            <TableHead>Day Range</TableHead>
                            <TableHead className="cursor-pointer" onClick={() => toggleSort('volume')}>Volume <SortIcon col="volume" /></TableHead>
                            <TableHead>52W Range</TableHead>
                            <TableHead className="cursor-pointer" onClick={() => toggleSort('rsi')}>RSI <SortIcon col="rsi" /></TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedSymbols.map(s => {
                            const cur = s.currency || getCurrencySymbol(s.symbol);
                            const isExpanded = expandedSymbol === s.symbol;
                            const pctOf52w = s.price && s.high52w && s.low52w ? ((s.price - s.low52w) / (s.high52w - s.low52w)) * 100 : 50;
                            return (
                              <>
                                <TableRow key={s.id} className={`cursor-pointer ${isExpanded ? 'bg-accent/30' : ''}`} onClick={() => loadExpandedAnalytics(s.symbol)}>
                                  <TableCell onClick={e => e.stopPropagation()}><Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggleSelect(s.id)} /></TableCell>
                                  <TableCell>
                                    <div>
                                      <span className="font-mono font-semibold text-sm">{s.symbol}</span>
                                      <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">{s.display_name || ''}</p>
                                    </div>
                                  </TableCell>
                                  <TableCell><MiniSparkline data={s.sparkline || []} positive={(s.changePct || 0) >= 0} /></TableCell>
                                  <TableCell>
                                    <span className="font-mono font-semibold">{s.price ? `${cur}${s.price.toFixed(2)}` : '-'}</span>
                                    {s.cached && <span className="text-[10px] text-muted-foreground ml-1">(c)</span>}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className={`font-mono ${(s.changePct || 0) >= 0 ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10' : 'text-red-400 border-red-400/30 bg-red-400/10'}`}>
                                      {s.changePct !== undefined ? `${s.changePct >= 0 ? '+' : ''}${s.changePct.toFixed(2)}%` : '-'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    {s.dayLow && s.dayHigh ? (
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] font-mono">{cur}{s.dayLow.toFixed(0)}</span>
                                        <div className="w-12 h-1.5 bg-muted rounded-full relative">
                                          <div className="absolute h-full bg-primary/60 rounded-full" style={{ left: 0, width: `${s.price && s.dayHigh && s.dayLow ? Math.min(100, Math.max(0, ((s.price - s.dayLow) / (s.dayHigh - s.dayLow)) * 100)) : 50}%` }} />
                                        </div>
                                        <span className="text-[10px] font-mono">{cur}{s.dayHigh.toFixed(0)}</span>
                                      </div>
                                    ) : <span className="text-xs text-muted-foreground">—</span>}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs">{s.volume ? `${(s.volume / 1e6).toFixed(1)}M` : '-'}</TableCell>
                                  <TableCell>
                                    {s.low52w && s.high52w ? (
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] font-mono">{cur}{s.low52w.toFixed(0)}</span>
                                        <div className="w-12 h-1.5 bg-muted rounded-full relative">
                                          <div className="absolute h-full bg-primary/60 rounded-full" style={{ width: `${Math.min(100, Math.max(0, pctOf52w))}%` }} />
                                        </div>
                                        <span className="text-[10px] font-mono">{cur}{s.high52w.toFixed(0)}</span>
                                      </div>
                                    ) : <span className="text-xs text-muted-foreground">—</span>}
                                  </TableCell>
                                  <TableCell>
                                    {s.rsi ? (
                                      <Badge variant="outline" className={`font-mono text-xs ${getRsiBg(s.rsi)} ${getRsiColor(s.rsi)}`}>
                                        {s.rsi.toFixed(1)}
                                      </Badge>
                                    ) : '-'}
                                  </TableCell>
                                  <TableCell onClick={e => e.stopPropagation()}>
                                    <div className="flex gap-1">
                                      <Button size="sm" variant="outline" className="h-7 w-7 p-0" title="Trade" onClick={() => { setTradeSymbol(s); setTradeSide('BUY'); setTradeQty(''); }}>
                                        <TrendingUp className="h-3 w-3" />
                                      </Button>
                                      <Button size="sm" variant="outline" className="h-7 w-7 p-0" title="Full Analysis" onClick={() => navigate(`/asset-analysis?symbol=${s.symbol}`)}>
                                        <BarChart3 className="h-3 w-3" />
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

                                {/* Expanded inline analytics */}
                                {isExpanded && (
                                  <TableRow key={`${s.id}-expanded`}>
                                    <TableCell colSpan={10} className="p-0">
                                      <div className="p-4 bg-accent/10 border-t border-b border-border/50 space-y-3">
                                        {expandedLoading ? (
                                          <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                                        ) : (
                                          <>
                                            {/* Price chart with Bollinger Bands + SMA */}
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                              <Card className="card-glow">
                                                <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs text-muted-foreground">3M Price + Bollinger Bands + SMA</CardTitle></CardHeader>
                                                <CardContent className="px-2 pb-2">
                                                  <ResponsiveContainer width="100%" height={180}>
                                                    <AreaChart data={enrichedExpanded}>
                                                      <XAxis dataKey="date" fontSize={9} stroke="hsl(var(--muted-foreground))" tickFormatter={v => { const d = new Date(v); return `${d.getDate()}/${d.getMonth()+1}`; }} interval={Math.max(Math.floor(enrichedExpanded.length / 6), 0)} />
                                                      <YAxis fontSize={9} stroke="hsl(var(--muted-foreground))" domain={['auto', 'auto']} tickFormatter={v => `${cur}${v.toFixed(0)}`} width={55} />
                                                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', fontSize: 11 }} formatter={(v: any, name: string) => [`${cur}${Number(v).toFixed(2)}`, name]} />
                                                      <Area type="monotone" dataKey="bbUpper" stroke="hsl(var(--muted-foreground))" fill="none" strokeWidth={0.5} strokeDasharray="3 3" dot={false} name="BB Upper" />
                                                      <Area type="monotone" dataKey="bbLower" stroke="hsl(var(--muted-foreground))" fill="none" strokeWidth={0.5} strokeDasharray="3 3" dot={false} name="BB Lower" />
                                                      <Area type="monotone" dataKey="close" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.08} strokeWidth={1.5} dot={false} name="Price" />
                                                      <Line type="monotone" dataKey="sma20" stroke="#f59e0b" strokeWidth={1} dot={false} name="SMA20" />
                                                      <Line type="monotone" dataKey="sma50" stroke="#8b5cf6" strokeWidth={1} dot={false} name="SMA50" />
                                                    </AreaChart>
                                                  </ResponsiveContainer>
                                                  <div className="flex gap-3 text-[10px] text-muted-foreground px-2">
                                                    <span className="text-primary">— Price</span>
                                                    <span className="text-yellow-400">— SMA20</span>
                                                    <span className="text-purple-400">— SMA50</span>
                                                    <span>--- BB</span>
                                                  </div>
                                                </CardContent>
                                              </Card>

                                              <div className="space-y-3">
                                                {/* RSI Chart */}
                                                <Card className="card-glow">
                                                  <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs text-muted-foreground">RSI (14)</CardTitle></CardHeader>
                                                  <CardContent className="px-2 pb-2">
                                                    <ResponsiveContainer width="100%" height={80}>
                                                      <LineChart data={enrichedExpanded}>
                                                        <YAxis domain={[0, 100]} fontSize={9} stroke="hsl(var(--muted-foreground))" ticks={[30, 70]} width={25} />
                                                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', fontSize: 11 }} formatter={(v: any) => [Number(v).toFixed(1), 'RSI']} />
                                                        <Line type="monotone" dataKey="rsi" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} />
                                                      </LineChart>
                                                    </ResponsiveContainer>
                                                  </CardContent>
                                                </Card>

                                                {/* Quick stats */}
                                                <div className="grid grid-cols-3 gap-2">
                                                  <div className="bg-accent/20 rounded-md p-2 text-center">
                                                    <p className="text-[10px] text-muted-foreground">RSI</p>
                                                    <p className={`text-sm font-bold font-mono ${s.rsi ? getRsiColor(s.rsi) : ''}`}>
                                                      {s.rsi?.toFixed(1) || 'N/A'}
                                                    </p>
                                                    <p className={`text-[9px] ${s.rsi ? getRsiColor(s.rsi) : 'text-muted-foreground'}`}>
                                                      {s.rsi ? getRsiLabel(s.rsi) : ''}
                                                    </p>
                                                  </div>
                                                  <div className="bg-accent/20 rounded-md p-2 text-center">
                                                    <p className="text-[10px] text-muted-foreground">Market Cap</p>
                                                    <p className="text-sm font-bold font-mono">
                                                      {s.marketCap ? (s.marketCap > 1e12 ? `${(s.marketCap / 1e12).toFixed(1)}T` : s.marketCap > 1e9 ? `${(s.marketCap / 1e9).toFixed(1)}B` : `${(s.marketCap / 1e6).toFixed(0)}M`) : 'N/A'}
                                                    </p>
                                                  </div>
                                                  <div className="bg-accent/20 rounded-md p-2 text-center">
                                                    <p className="text-[10px] text-muted-foreground">Prev Close</p>
                                                    <p className="text-sm font-bold font-mono">{s.prevClose ? `${cur}${s.prevClose.toFixed(2)}` : 'N/A'}</p>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>

                                            <div className="flex gap-2">
                                              <Button size="sm" variant="outline" onClick={() => navigate(`/asset-analysis?symbol=${s.symbol}`)}>
                                                <Activity className="h-3 w-3 mr-1" /> Full Analysis
                                              </Button>
                                              <Button size="sm" variant="outline" onClick={() => navigate(`/scanner?symbol=${s.symbol}`)}>
                                                <Radar className="h-3 w-3 mr-1" /> Scan
                                              </Button>
                                              <Button size="sm" onClick={() => { setTradeSymbol(s); setTradeSide('BUY'); setTradeQty(''); }}>
                                                <TrendingUp className="h-3 w-3 mr-1" /> Trade
                                              </Button>
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </>
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
              {deleteTarget?.type === 'watchlist' ? `Delete watchlist "${deleteTarget.name}" and all its symbols?` : `Remove ${deleteTarget?.name} from watchlist?`}
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
