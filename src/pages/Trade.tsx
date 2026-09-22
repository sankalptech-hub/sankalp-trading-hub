import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTradingMode } from '@/contexts/TradingModeContext';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, AlertTriangle, Link as LinkIcon, FlaskConical } from 'lucide-react';
import { fetchPrice, fetchCandleData, computeRSI, getCurrencySymbol, ALL_SYMBOLS } from '@/lib/marketData';

const statusColor: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  filled: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const Trade = () => {
  const { user } = useAuth();
  const { brokers: ctxBrokers, paperMode, defaultBrokerName, defaultBroker, togglePaperLive, setDefaultBroker: setCtxDefault } = useTradingMode();
  const [params] = useSearchParams();
  const [symbol, setSymbol] = useState(params.get('symbol') || '');
  const [qty, setQty] = useState('');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orders, setOrders] = useState<any[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastSignal, setLastSignal] = useState<any>(null);
  const [livePrice, setLivePrice] = useState<{ price: number; cached: boolean } | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const fetchOrders = async () => {
    if (!user) return;
    const { data } = await supabase.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
    setOrders(data || []);
  };

  useEffect(() => { fetchOrders(); }, [user]);

  // Only connected brokers can be used for trading
  const brokers = ctxBrokers.filter(b => b.status === 'connected');
  const selectedBroker = defaultBroker?.id || brokers[0]?.id || '';
  const setSelectedBroker = (id: string) => { setCtxDefault(id); };

  const lookupPrice = async () => {
    if (!symbol.trim()) return;
    setPriceLoading(true); setPriceError(''); setLivePrice(null);
    try {
      const data = await fetchPrice(symbol);
      setLivePrice({ price: data.price, cached: data.cached });
    } catch (err: any) {
      setPriceError(err.message || 'Price lookup failed');
    } finally { setPriceLoading(false); }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!symbol.trim()) e.symbol = 'Symbol is required';
    else if (symbol.trim().length > 10) e.symbol = 'Symbol max 10 characters';
    const q = Number(qty);
    if (!qty || q <= 0) e.qty = 'Quantity must be > 0';
    else if (q > 10000) e.qty = 'Max single order size is 10,000';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const generateSignal = async () => {
    if (!symbol.trim()) { setErrors({ symbol: 'Symbol is required' }); return; }
    if (!user) return;
    const upperSymbol = symbol.toUpperCase();
    try {
      const [priceData, candles] = await Promise.all([
        fetchPrice(upperSymbol),
        fetchCandleData(upperSymbol, '1d', '3mo'),
      ]);
      const rsi = computeRSI(candles, 14);
      const latestRsi = rsi[rsi.length - 1];
      const signalType: 'BUY' | 'SELL' | 'HOLD' = latestRsi === null ? 'HOLD' : latestRsi < 35 ? 'BUY' : latestRsi > 65 ? 'SELL' : 'HOLD';
      const { data, error } = await supabase.from('signals').insert({ user_id: user.id, symbol: upperSymbol, signal_type: signalType, price: priceData.price }).select().single();
      if (error) { toast.error(error.message); return; }
      setLastSignal(data);
      toast.success(`Signal: ${signalType} ${upperSymbol}${latestRsi !== null ? ` (RSI ${latestRsi.toFixed(1)})` : ''}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate signal');
    }
  };

  const checkRisks = async (upperSymbol: string, quantity: number) => {
    if (!user) return;
    if (quantity > 5000) await supabase.from('alerts').insert({ user_id: user.id, message: `Large order: ${upperSymbol} ${quantity} units exceeds recommended size`, type: 'warning' });
    const { count } = await supabase.from('positions').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
    if ((count || 0) > 10) await supabase.from('alerts').insert({ user_id: user.id, message: 'Portfolio concentration warning: more than 10 open positions', type: 'warning' });
    const today = new Date().toISOString().split('T')[0];
    const { data: todayOrders } = await supabase.from('orders').select('id').eq('user_id', user.id).eq('symbol', upperSymbol).gte('created_at', today);
    if ((todayOrders?.length || 0) > 3) await supabase.from('alerts').insert({ user_id: user.id, message: `Overtrading detected: ${upperSymbol} traded ${todayOrders?.length} times today`, type: 'danger' });
  };

  const executeTrade = async () => {
    if (!validate() || !user) return;
    const upperSymbol = symbol.toUpperCase();
    const quantity = Number(qty);
    const { data: existingPos } = await supabase.from('positions').select('qty').eq('user_id', user.id).eq('symbol', upperSymbol).maybeSingle();
    if (existingPos && Math.abs(existingPos.qty) > 5000) { setErrors({ symbol: `Exposure limit: existing position in ${upperSymbol} exceeds 5000 units` }); return; }

    let executionPrice = livePrice?.price;
    if (!executionPrice) {
      try {
        const data = await fetchPrice(upperSymbol);
        executionPrice = data.price;
      } catch (err: any) {
        setErrors({ symbol: err.message || `Could not fetch a live price for ${upperSymbol}` });
        return;
      }
    }

    const broker = brokers.find(b => b.id === selectedBroker);
    const brokerName = broker?.broker_name || 'demo';
    const isDemo = brokerName === 'demo';

    const { error: orderErr } = await supabase.from('orders').insert({
      user_id: user.id, symbol: upperSymbol, qty: quantity, side, status: 'filled',
      broker_id: selectedBroker || null, broker_name: brokerName,
    } as any);
    if (orderErr) { toast.error(orderErr.message); return; }

    if (!isDemo && selectedBroker) {
      await supabase.from('broker_orders').insert({
        user_id: user.id, broker_id: selectedBroker, symbol: upperSymbol,
        qty: quantity, side, price: executionPrice, status: 'filled',
      } as any);
    }

    const { data: existing } = await supabase.from('positions').select('*').eq('user_id', user.id).eq('symbol', upperSymbol).maybeSingle();
    if (existing) {
      const newQty = side === 'BUY' ? existing.qty + quantity : existing.qty - quantity;
      await supabase.from('positions').update({ qty: newQty }).eq('id', existing.id);
    } else {
      await supabase.from('positions').insert({ user_id: user.id, symbol: upperSymbol, qty: side === 'BUY' ? quantity : -quantity, avg_price: executionPrice });
    }

    await supabase.from('alerts').insert({ user_id: user.id, message: `Trade executed: ${side} ${quantity} ${upperSymbol}`, type: 'success' });
    await checkRisks(upperSymbol, quantity);

    toast.success(isDemo ? `Demo order placed: ${side} ${quantity} ${upperSymbol}` : `Order sent to ${broker?.display_name}: ${side} ${quantity} ${upperSymbol}`);
    setSymbol(''); setQty(''); setErrors({}); setLivePrice(null); setLastSignal(null);
    fetchOrders();
  };

  const updateOrderStatus = async (id: string, status: string) => {
    await supabase.from('orders').update({ status, updated_at: new Date().toISOString() } as any).eq('id', id);
    toast.success(`Order ${status}`); fetchOrders();
  };

  const signalColor: Record<string, string> = { BUY: 'bg-emerald-500/20 text-emerald-400', SELL: 'bg-red-500/20 text-red-400', HOLD: 'bg-yellow-500/20 text-yellow-400' };
  const cur = getCurrencySymbol(symbol);
  const isDemo = brokers.find(b => b.id === selectedBroker)?.broker_name === 'demo' || !selectedBroker;
  const filteredSuggestions = ALL_SYMBOLS.filter(s => s.toLowerCase().includes(symbol.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Trade Console</h1>
        <div className="flex items-center gap-3 bg-card border rounded-lg px-4 py-2">
          <FlaskConical className={`h-4 w-4 ${paperMode ? 'text-primary' : 'text-muted-foreground'}`} />
          <span className={`text-sm font-medium ${paperMode ? 'text-primary' : 'text-muted-foreground'}`}>Paper</span>
          <Switch checked={!paperMode} onCheckedChange={(checked) => togglePaperLive(!checked)} />
          <span className={`text-sm font-medium ${!paperMode ? 'text-emerald-400' : 'text-muted-foreground'}`}>Live</span>
          <Badge variant="outline" className={`text-[10px] ml-1 ${paperMode ? 'border-primary/30 text-primary' : 'border-emerald-500/30 text-emerald-400'}`}>
            {defaultBrokerName}
          </Badge>
        </div>
      </div>

      {isDemo && brokers.length <= 1 && (
        <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-sm text-yellow-400">
          <AlertTriangle className="h-4 w-4" /> You are trading in Demo mode. <a href="/brokers" className="underline flex items-center gap-1">Connect Broker <LinkIcon className="h-3 w-3" /></a>
        </div>
      )}

      <Card className="card-glow max-w-2xl">
        <CardHeader><CardTitle>New Trade</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {brokers.length > 0 && (
            <div>
              <Label>Trading via</Label>
              <Select value={selectedBroker} onValueChange={setSelectedBroker}>
                <SelectTrigger className="w-60"><SelectValue placeholder="Select broker" /></SelectTrigger>
                <SelectContent>{brokers.map(b => <SelectItem key={b.id} value={b.id}>{b.display_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1 relative">
              <Label>Symbol</Label>
              <Input placeholder="RELIANCE.NS" value={symbol} onChange={e => { setSymbol(e.target.value); setErrors(p => ({ ...p, symbol: '' })); setShowSuggestions(true); }} onBlur={() => { setTimeout(() => setShowSuggestions(false), 200); lookupPrice(); }} onFocus={() => setShowSuggestions(true)} />
              {showSuggestions && symbol && filteredSuggestions.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {filteredSuggestions.slice(0, 8).map(s => (
                    <button key={s} className="w-full text-left px-3 py-2 text-sm hover:bg-accent font-mono" onClick={() => { setSymbol(s); setShowSuggestions(false); }}>{s}</button>
                  ))}
                </div>
              )}
              {errors.symbol && <p className="text-xs text-destructive">{errors.symbol}</p>}
              {priceLoading && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Loading...</p>}
              {priceError && <p className="text-xs text-destructive">{priceError}</p>}
              {livePrice && <p className="text-xs text-primary font-mono">Price: {cur}{livePrice.price.toFixed(2)} {livePrice.cached && <span className="text-muted-foreground">(cached)</span>}</p>}
            </div>
            <div className="space-y-1">
              <Label>Quantity</Label>
              <Input type="number" placeholder="100" value={qty} onChange={e => { setQty(e.target.value); setErrors(p => ({ ...p, qty: '' })); }} />
              {errors.qty && <p className="text-xs text-destructive">{errors.qty}</p>}
            </div>
            <div className="space-y-1">
              <Label>Side</Label>
              <div className="flex gap-2">
                <Button variant={side === 'BUY' ? 'default' : 'outline'} className="flex-1" onClick={() => setSide('BUY')}>BUY</Button>
                <Button variant={side === 'SELL' ? 'destructive' : 'outline'} className="flex-1" onClick={() => setSide('SELL')}>SELL</Button>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={generateSignal}>Generate Signal</Button>
            <Button onClick={executeTrade}>Execute Trade</Button>
          </div>
        </CardContent>
      </Card>

      {lastSignal && (
        <Card className="card-glow max-w-2xl">
          <CardContent className="pt-6 flex items-center gap-4">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${signalColor[lastSignal.signal_type] || ''}`}>{lastSignal.signal_type}</span>
            <span className="font-mono font-semibold">{lastSignal.symbol}</span>
            <span className="text-muted-foreground text-sm">Price: {getCurrencySymbol(lastSignal.symbol)}{Number(lastSignal.price).toFixed(2)}</span>
            <span className="text-xs text-muted-foreground font-mono ml-auto">{new Date(lastSignal.created_at).toLocaleString()}</span>
          </CardContent>
        </Card>
      )}

      <Card className="card-glow">
        <CardHeader><CardTitle>Recent Orders</CardTitle></CardHeader>
        <CardContent>
          <div className="table-striped overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Symbol</TableHead><TableHead>Broker</TableHead><TableHead>Side</TableHead><TableHead>Qty</TableHead><TableHead>Status</TableHead><TableHead>Time</TableHead><TableHead>Actions</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {orders.map(o => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono">{o.symbol}</TableCell>
                    <TableCell><Badge variant="outline">{o.broker_name || 'demo'}</Badge></TableCell>
                    <TableCell><Badge variant={o.side === 'BUY' ? 'default' : 'destructive'}>{o.side}</Badge></TableCell>
                    <TableCell className="font-mono">{o.qty}</TableCell>
                    <TableCell><span className={`px-2 py-0.5 rounded text-xs border ${statusColor[o.status] || ''}`}>{o.status}</span></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</TableCell>
                    <TableCell>
                      {o.status === 'pending' && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateOrderStatus(o.id, 'filled')}>Fill</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => updateOrderStatus(o.id, 'cancelled')}>Cancel</Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Trade;
