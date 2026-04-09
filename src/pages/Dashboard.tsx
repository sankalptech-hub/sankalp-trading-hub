import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, ShoppingCart, Radio, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { fetchPrice, PriceData, DASHBOARD_WATCHLIST, getCurrencySymbol } from '@/lib/marketData';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';

const statusColor: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  filled: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [positions, setPositions] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [signals, setSignals] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [watchlist, setWatchlist] = useState<Record<string, PriceData & { symbol: string }>>({});
  const [userWatchlists, setUserWatchlists] = useState<any[]>([]);
  const [selectedWl, setSelectedWl] = useState<string>('default');
  const [activeSymbols, setActiveSymbols] = useState<string[]>(DASHBOARD_WATCHLIST);

  const fetchAll = async () => {
    if (!user) return;
    try {
      const [p, o, s, a] = await Promise.all([
        supabase.from('positions').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(5),
        supabase.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('signals').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('alerts').select('*').eq('user_id', user.id).eq('read', false).order('created_at', { ascending: false }).limit(5),
      ]);
      setPositions(p.data || []);
      setOrders(o.data || []);
      setSignals(s.data || []);
      setAlerts(a.data || []);
    } catch (err: any) {
      toast.error('Failed to load dashboard: ' + err.message);
    }
  };




  // Fetch user watchlists
  useEffect(() => {
    if (!user) return;
    supabase.from('watchlists').select('*').eq('user_id', user.id).order('created_at').then(({ data }) => {
      setUserWatchlists(data || []);
    });
  }, [user]);

  // When selected watchlist changes, load its symbols
  useEffect(() => {
    if (selectedWl === 'default' || !user) {
      setActiveSymbols(DASHBOARD_WATCHLIST);
      return;
    }
    supabase.from('watchlist_symbols').select('symbol').eq('watchlist_id', selectedWl).eq('user_id', user.id).then(({ data }) => {
      setActiveSymbols(data?.map((d: any) => d.symbol) || DASHBOARD_WATCHLIST);
    });
  }, [selectedWl, user]);

  const fetchWatchlistDataForSymbols = async () => {
    for (const sym of activeSymbols) {
      try {
        const data = await fetchPrice(sym);
        setWatchlist(prev => ({ ...prev, [sym]: { ...data, symbol: sym } }));
      } catch { /* skip */ }
    }
  };

  useEffect(() => {
    fetchAll();
    fetchWatchlistDataForSymbols();
    const interval = setInterval(fetchAll, 10000);
    const watchInterval = setInterval(fetchWatchlistDataForSymbols, 30000);
    return () => { clearInterval(interval); clearInterval(watchInterval); };
  }, [user, activeSymbols]);

  const stats = [
    { label: 'Open Positions', value: positions.length, icon: TrendingUp, color: 'text-primary' },
    { label: 'Pending Orders', value: orders.filter(o => o.status === 'pending').length, icon: ShoppingCart, color: 'text-yellow-400' },
    { label: 'Active Signals', value: signals.length, icon: Radio, color: 'text-primary' },
    { label: 'Unread Alerts', value: alerts.length, icon: Bell, color: 'text-destructive' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <Card key={s.label} className="card-glow">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className={`text-3xl font-bold font-mono ${s.color}`}>{s.value}</p>
                </div>
                <s.icon className={`h-8 w-8 ${s.color} opacity-50`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {Object.keys(watchlist).length > 0 && (
        <Card className="card-glow">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Market Watchlist</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={selectedWl} onValueChange={setSelectedWl}>
                  <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Default" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default (NSE)</SelectItem>
                    {userWatchlists.map((wl: any) => <SelectItem key={wl.id} value={wl.id}>{wl.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <button className="text-xs text-primary hover:underline" onClick={() => navigate('/watchlist')}>Manage</button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="table-striped">
              <Table>
                <TableHeader><TableRow><TableHead>Symbol</TableHead><TableHead>Price</TableHead><TableHead>Change %</TableHead><TableHead>Volume</TableHead><TableHead></TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {activeSymbols.map(sym => {
                    const w = watchlist[sym];
                    if (!w) return null;
                    const cur = getCurrencySymbol(sym);
                    return (
                      <TableRow key={sym}>
                        <TableCell className="font-mono font-semibold">{sym}</TableCell>
                        <TableCell className="font-mono">{cur}{w.price.toFixed(2)}</TableCell>
                        <TableCell className={`font-mono ${w.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {w.changePercent >= 0 ? '+' : ''}{w.changePercent.toFixed(2)}%
                        </TableCell>
                        <TableCell className="font-mono text-xs">{w.volume ? `${(w.volume / 1000000).toFixed(1)}M` : '-'}</TableCell>
                        <TableCell>{w.cached && <span className="text-xs text-muted-foreground">(cached)</span>}</TableCell>
                        <TableCell><button className="text-xs text-primary hover:underline" onClick={() => navigate(`/asset-analysis?symbol=${sym}`)}>📊</button></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="card-glow">
          <CardHeader><CardTitle className="text-lg">Recent Positions</CardTitle></CardHeader>
          <CardContent>
            <div className="table-striped">
              <Table>
                <TableHeader><TableRow><TableHead>Symbol</TableHead><TableHead>Qty</TableHead><TableHead>Avg Price</TableHead></TableRow></TableHeader>
                <TableBody>
                  {positions.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No positions</TableCell></TableRow> :
                    positions.map(p => (
                      <TableRow key={p.id}><TableCell className="font-mono">{p.symbol}</TableCell><TableCell className="font-mono">{p.qty}</TableCell><TableCell className="font-mono">{Number(p.avg_price).toFixed(2)}</TableCell></TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="card-glow">
          <CardHeader><CardTitle className="text-lg">Recent Orders</CardTitle></CardHeader>
          <CardContent>
            <div className="table-striped">
              <Table>
                <TableHeader><TableRow><TableHead>Symbol</TableHead><TableHead>Side</TableHead><TableHead>Qty</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {orders.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No orders</TableCell></TableRow> :
                    orders.map(o => (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono">{o.symbol}</TableCell>
                        <TableCell><Badge variant={o.side === 'BUY' ? 'default' : 'destructive'}>{o.side}</Badge></TableCell>
                        <TableCell className="font-mono">{o.qty}</TableCell>
                        <TableCell><span className={`px-2 py-0.5 rounded text-xs border ${statusColor[o.status] || ''}`}>{o.status}</span></TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="card-glow">
          <CardHeader><CardTitle className="text-lg">Recent Signals</CardTitle></CardHeader>
          <CardContent>
            <div className="table-striped">
              <Table>
                <TableHeader><TableRow><TableHead>Symbol</TableHead><TableHead>Type</TableHead><TableHead>Price</TableHead></TableRow></TableHeader>
                <TableBody>
                  {signals.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No signals</TableCell></TableRow> :
                    signals.map(s => (
                      <TableRow key={s.id}><TableCell className="font-mono">{s.symbol}</TableCell><TableCell><Badge>{s.signal_type}</Badge></TableCell><TableCell className="font-mono">{Number(s.price).toFixed(2)}</TableCell></TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="card-glow">
          <CardHeader><CardTitle className="text-lg">Unread Alerts</CardTitle></CardHeader>
          <CardContent>
            <div className="table-striped">
              <Table>
                <TableHeader><TableRow><TableHead>Message</TableHead><TableHead>Type</TableHead></TableRow></TableHeader>
                <TableBody>
                  {alerts.length === 0 ? <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No alerts</TableCell></TableRow> :
                    alerts.map(a => (
                      <TableRow key={a.id}><TableCell>{a.message}</TableCell><TableCell><AlertBadge type={a.type} /></TableCell></TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const AlertBadge = ({ type }: { type: string }) => {
  const colors: Record<string, string> = { info: 'bg-blue-500/20 text-blue-400', warning: 'bg-yellow-500/20 text-yellow-400', danger: 'bg-red-500/20 text-red-400', success: 'bg-emerald-500/20 text-emerald-400' };
  return <span className={`px-2 py-0.5 rounded text-xs ${colors[type] || colors.info}`}>{type}</span>;
};

export default Dashboard;
