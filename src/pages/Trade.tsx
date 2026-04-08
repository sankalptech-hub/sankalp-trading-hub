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

const Trade = () => {
  const { user } = useAuth();
  const [symbol, setSymbol] = useState('');
  const [qty, setQty] = useState('');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orders, setOrders] = useState<any[]>([]);
  const [errors, setErrors] = useState<{ symbol?: string; qty?: string }>({});

  const fetchOrders = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
    if (error) { toast.error(error.message); return; }
    setOrders(data || []);
  };

  useEffect(() => { fetchOrders(); }, [user]);

  const validate = () => {
    const e: { symbol?: string; qty?: string } = {};
    if (!symbol.trim()) e.symbol = 'Symbol is required';
    if (!qty || Number(qty) <= 0) e.qty = 'Quantity must be > 0';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const generateSignal = async () => {
    if (!symbol.trim()) { setErrors({ symbol: 'Symbol is required' }); return; }
    if (!user) return;
    const { error } = await supabase.from('signals').insert({
      user_id: user.id, symbol: symbol.toUpperCase(), signal_type: side, price: Math.random() * 1000,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`Signal generated: ${side} ${symbol.toUpperCase()}`);
  };

  const executeTrade = async () => {
    if (!validate() || !user) return;
    const upperSymbol = symbol.toUpperCase();
    const quantity = Number(qty);

    // Insert order
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
        user_id: user.id, symbol: upperSymbol, qty: side === 'BUY' ? quantity : -quantity, avg_price: Math.random() * 1000,
      });
    }

    // Create alert
    await supabase.from('alerts').insert({
      user_id: user.id, message: `Trade executed: ${side} ${quantity} ${upperSymbol}`, type: 'success',
    });

    toast.success(`Trade executed: ${side} ${quantity} ${upperSymbol}`);
    setSymbol(''); setQty(''); setErrors({});
    fetchOrders();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Trade Console</h1>
      <Card className="card-glow max-w-2xl">
        <CardHeader><CardTitle>New Trade</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Symbol</Label>
              <Input placeholder="AAPL" value={symbol} onChange={e => { setSymbol(e.target.value); setErrors(p => ({ ...p, symbol: undefined })); }} />
              {errors.symbol && <p className="text-xs text-destructive">{errors.symbol}</p>}
            </div>
            <div className="space-y-1">
              <Label>Quantity</Label>
              <Input type="number" placeholder="100" value={qty} onChange={e => { setQty(e.target.value); setErrors(p => ({ ...p, qty: undefined })); }} />
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

      <Card className="card-glow">
        <CardHeader><CardTitle>Recent Orders</CardTitle></CardHeader>
        <CardContent>
          <div className="table-striped">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Symbol</TableHead><TableHead>Side</TableHead><TableHead>Qty</TableHead><TableHead>Status</TableHead><TableHead>Time</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {orders.map(o => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono">{o.symbol}</TableCell>
                    <TableCell><Badge variant={o.side === 'BUY' ? 'default' : 'destructive'}>{o.side}</Badge></TableCell>
                    <TableCell className="font-mono">{o.qty}</TableCell>
                    <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</TableCell>
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
