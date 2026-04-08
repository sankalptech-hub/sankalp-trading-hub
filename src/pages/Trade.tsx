import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { fetchPrice } from '@/lib/marketData';

const statusColor: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  filled: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const Trade = () => {
  const { user } = useAuth();
  const [symbol, setSymbol] = useState('');
  const [qty, setQty] = useState('');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orders, setOrders] = useState<any[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastSignal, setLastSignal] = useState<any>(null);
  const [livePrice, setLivePrice] = useState<{ price: number; cached: boolean } | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState('');

  const fetchOrders = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
    if (error) { toast.error(error.message); return; }
    setOrders(data || []);
  };

  useEffect(() => { fetchOrders(); }, [user]);

  const lookupPrice = async () => {
    if (!symbol.trim()) return;
    const apiKey = import.meta.env.VITE_ALPHA_VANTAGE_KEY;
    if (!apiKey) return;
    setPriceLoading(true);
    setPriceError('');
    setLivePrice(null);
    try {
      const data = await fetchPrice(symbol, apiKey);
      setLivePrice({ price: data.price, cached: data.cached });
    } catch (err: any) {
      setPriceError(err.message || 'Price lookup failed');
    } finally {
      setPriceLoading(false);
    }
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
    const q = Number(qty) || 50;
    const signalType = q > 100 ? 'BUY' : q < 10 ? 'SELL' : 'HOLD';
    const { data, error } = await supabase.from('signals').insert({
      user_id: user.id, symbol: symbol.toUpperCase(), signal_type: signalType, price: q,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setLastSignal(data);
    toast.success(`Signal: ${signalType} ${symbol.toUpperCase()}`);
  };

  const checkRisks = async (upperSymbol: string, quantity: number) => {
    if (!user) return;
    // Large order warning
    if (quantity > 5000) {
      await supabase.from('alerts').insert({ user_id: user.id, message: `Large order: ${upperSymbol} ${quantity} units exceeds recommended size`, type: 'warning' });
    }
    // Portfolio concentration
    const { count } = await supabase.from('positions').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
    if ((count || 0) > 10) {
      await supabase.from('alerts').insert({ user_id: user.id, message: 'Portfolio concentration warning: more than 10 open positions', type: 'warning' });
    }
    // Overtrading check
    const today = new Date().toISOString().split('T')[0];
    const { data: todayOrders } = await supabase.from('orders').select('id').eq('user_id', user.id).eq('symbol', upperSymbol).gte('created_at', today);
    if ((todayOrders?.length || 0) > 3) {
      await supabase.from('alerts').insert({ user_id: user.id, message: `Overtrading detected: ${upperSymbol} traded ${todayOrders?.length} times today`, type: 'danger' });
    }
  };

  const executeTrade = async () => {
    if (!validate() || !user) return;
    const upperSymbol = symbol.toUpperCase();
    const quantity = Number(qty);

    // Exposure limit check
    const { data: existingPos } = await supabase.from('positions').select('qty').eq('user_id', user.id).eq('symbol', upperSymbol).maybeSingle();
    if (existingPos && Math.abs(existingPos.qty) > 5000) {
      setErrors({ symbol: `Exposure limit: existing position in ${upperSymbol} exceeds 5000 units` });
      return;
    }

    const { error: orderErr } = await supabase.from('orders').insert({
      user_id: user.id, symbol: upperSymbol, qty: quantity, side, status: 'filled',
    });
    if (orderErr) { toast.error(orderErr.message); return; }

    // Upsert position
    const { data: existing } = await supabase.from('positions').select('*').eq('user_id', user.id).eq('symbol', upperSymbol).maybeSingle();
    if (existing) {
      const newQty = side === 'BUY' ? existing.qty + quantity : existing.qty - quantity;
      await supabase.from('positions').update({ qty: newQty }).eq('id', existing.id);
    } else {
      await supabase.from('positions').insert({
        user_id: user.id, symbol: upperSymbol, qty: side === 'BUY' ? quantity : -quantity, avg_price: livePrice?.price || Math.random() * 1000,
      });
    }

    await supabase.from('alerts').insert({ user_id: user.id, message: `Trade executed: ${side} ${quantity} ${upperSymbol}`, type: 'success' });
    await checkRisks(upperSymbol, quantity);

    toast.success(`Trade executed: ${side} ${quantity} ${upperSymbol}`);
    setSymbol(''); setQty(''); setErrors({});
    setLivePrice(null); setLastSignal(null);
    fetchOrders();
  };

  const updateOrderStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('orders').update({ status, updated_at: new Date().toISOString() } as any).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Order ${status}`);
    fetchOrders();
  };

  const signalColor: Record<string, string> = { BUY: 'bg-emerald-500/20 text-emerald-400', SELL: 'bg-red-500/20 text-red-400', HOLD: 'bg-yellow-500/20 text-yellow-400' };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Trade Console</h1>
      <Card className="card-glow max-w-2xl">
        <CardHeader><CardTitle>New Trade</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Symbol</Label>
              <Input placeholder="AAPL" value={symbol} onChange={e => { setSymbol(e.target.value); setErrors(p => ({ ...p, symbol: '' })); }} onBlur={lookupPrice} />
              {errors.symbol && <p className="text-xs text-destructive">{errors.symbol}</p>}
              {priceLoading && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Loading price...</p>}
              {priceError && <p className="text-xs text-destructive">{priceError}</p>}
              {livePrice && <p className="text-xs text-primary font-mono">Current Price: ${livePrice.price.toFixed(2)} {livePrice.cached && <span className="text-muted-foreground">(cached)</span>}</p>}
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
            <span className="text-muted-foreground text-sm">Qty: {lastSignal.price}</span>
            <span className="text-xs text-muted-foreground font-mono ml-auto">{new Date(lastSignal.created_at).toLocaleString()}</span>
          </CardContent>
        </Card>
      )}

      <Card className="card-glow">
        <CardHeader><CardTitle>Recent Orders</CardTitle></CardHeader>
        <CardContent>
          <div className="table-striped">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Symbol</TableHead><TableHead>Side</TableHead><TableHead>Qty</TableHead><TableHead>Status</TableHead><TableHead>Time</TableHead><TableHead>Actions</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {orders.map(o => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono">{o.symbol}</TableCell>
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
