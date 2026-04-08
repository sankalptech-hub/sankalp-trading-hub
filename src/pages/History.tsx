import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Clock, Download } from 'lucide-react';
import { getCurrencySymbol } from '@/lib/marketData';

const History = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [brokerOrders, setBrokerOrders] = useState<any[]>([]);
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterSide, setFilterSide] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('broker_orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]).then(([o, bo]) => {
      setOrders(o.data || []);
      setBrokerOrders(bo.data || []);
    });
  }, [user]);

  const allTrades = [
    ...orders.map(o => ({ ...o, broker: o.broker_name || 'demo', entryPrice: 0, exitPrice: 0, source: 'orders' })),
    ...brokerOrders.map(o => ({ ...o, broker: 'broker', entryPrice: Number(o.price), exitPrice: Number(o.filled_price || 0), source: 'broker' })),
  ];

  const filtered = allTrades.filter(t =>
    (!filterSymbol || t.symbol?.toLowerCase().includes(filterSymbol.toLowerCase())) &&
    (filterSide === 'all' || t.side === filterSide) &&
    (filterStatus === 'all' || t.status === filterStatus)
  );

  const filledOrders = filtered.filter(o => o.status === 'filled');
  const totalPnL = filledOrders.reduce((s, o) => s + (o.exitPrice - o.entryPrice) * o.qty, 0);
  const wins = filledOrders.filter(o => (o.exitPrice - o.entryPrice) * o.qty > 0).length;
  const winRate = filledOrders.length > 0 ? (wins / filledOrders.length) * 100 : 0;
  const bestTrade = filledOrders.reduce((best, o) => { const pnl = (o.exitPrice - o.entryPrice) * o.qty; return pnl > best ? pnl : best; }, 0);

  const stats = [
    { label: 'Total Trades', value: filtered.length },
    { label: 'Win Rate', value: `${winRate.toFixed(0)}%` },
    { label: 'Total P&L', value: `${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}`, color: totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'Best Trade', value: `+${bestTrade.toFixed(2)}` },
  ];

  const exportCSV = () => {
    const header = 'Symbol,Broker,Side,Qty,Status,Date\n';
    const rows = filtered.map(t => `${t.symbol},${t.broker},${t.side},${t.qty},${t.status},${new Date(t.created_at).toLocaleDateString()}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `trade_history_${new Date().toISOString().split('T')[0]}.csv`; a.click();
  };

  const statusColor: Record<string, string> = { pending: 'bg-yellow-500/20 text-yellow-400', filled: 'bg-emerald-500/20 text-emerald-400', cancelled: 'bg-red-500/20 text-red-400' };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Clock className="h-6 w-6 text-primary" /> Trade History</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <Card key={s.label} className="card-glow"><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className={`text-3xl font-bold font-mono ${(s as any).color || 'text-primary'}`}>{s.value}</p>
          </CardContent></Card>
        ))}
      </div>

      <div className="flex gap-4 flex-wrap items-end">
        <Input placeholder="Search symbol..." value={filterSymbol} onChange={e => setFilterSymbol(e.target.value)} className="w-40" />
        <Select value={filterSide} onValueChange={setFilterSide}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Sides</SelectItem><SelectItem value="BUY">BUY</SelectItem><SelectItem value="SELL">SELL</SelectItem></SelectContent></Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="filled">Filled</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select>
        <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
      </div>

      <Card className="card-glow">
        <CardContent className="pt-6">
          <div className="table-striped overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Symbol</TableHead><TableHead>Broker</TableHead><TableHead>Side</TableHead><TableHead>Qty</TableHead>
                <TableHead>Status</TableHead><TableHead>Date</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No trades found</TableCell></TableRow> :
                  filtered.map((t, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono font-semibold">{t.symbol}</TableCell>
                      <TableCell><Badge variant="outline">{t.broker}</Badge></TableCell>
                      <TableCell><Badge variant={t.side === 'BUY' ? 'default' : 'destructive'}>{t.side}</Badge></TableCell>
                      <TableCell className="font-mono">{t.qty}</TableCell>
                      <TableCell><span className={`px-2 py-0.5 rounded text-xs ${statusColor[t.status] || ''}`}>{t.status}</span></TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</TableCell>
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

export default History;
