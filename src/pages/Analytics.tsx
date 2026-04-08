import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { toast } from 'sonner';

const Analytics = () => {
  const { user } = useAuth();
  const [ordersByDay, setOrdersByDay] = useState<any[]>([]);
  const [positionsBySymbol, setPositionsBySymbol] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [filledOrders, setFilledOrders] = useState(0);
  const [totalSymbols, setTotalSymbols] = useState(0);
  const [portfolioValue, setPortfolioValue] = useState(0);

  const loadData = async () => {
    if (!user) return;
    try {
      const [ordersRes, positionsRes] = await Promise.all([
        supabase.from('orders').select('*').eq('user_id', user.id),
        supabase.from('positions').select('*').eq('user_id', user.id),
      ]);
      if (ordersRes.error) throw ordersRes.error;
      if (positionsRes.error) throw positionsRes.error;
      const orders = ordersRes.data || [];
      const pos = positionsRes.data || [];

      setTotalOrders(orders.length);
      setFilledOrders(orders.filter(o => o.status === 'filled').length);
      setTotalSymbols(pos.length);
      setPositions(pos);
      setPortfolioValue(pos.reduce((sum, p) => sum + Math.abs(p.qty) * Number(p.avg_price), 0));

      const dayMap: Record<string, number> = {};
      orders.forEach(o => {
        const day = new Date(o.created_at).toLocaleDateString();
        dayMap[day] = (dayMap[day] || 0) + 1;
      });
      setOrdersByDay(Object.entries(dayMap).map(([date, count]) => ({ date, count })));
      setPositionsBySymbol(pos.map(p => ({ symbol: p.symbol, qty: Math.abs(p.qty) })));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  useEffect(() => { loadData(); }, [user]);

  const closePosition = async (pos: any) => {
    if (!user) return;
    const { error } = await supabase.from('positions').delete().eq('id', pos.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from('alerts').insert({ user_id: user.id, message: `Position closed: ${pos.symbol} ${Math.abs(pos.qty)} units`, type: 'info' });
    toast.success(`Closed ${pos.symbol}`);
    loadData();
  };

  const stats = [
    { label: 'Total Orders', value: totalOrders },
    { label: 'Filled Orders', value: filledOrders },
    { label: 'Portfolio Symbols', value: totalSymbols },
    { label: 'Portfolio Value', value: `$${portfolioValue.toFixed(2)}` },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {stats.map(s => (
          <Card key={s.label} className="card-glow">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="text-3xl font-bold font-mono text-primary">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="charts">
        <TabsList>
          <TabsTrigger value="charts">Charts</TabsTrigger>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
        </TabsList>

        <TabsContent value="charts">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="card-glow">
              <CardHeader><CardTitle>Orders Over Time</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={ordersByDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(245 15% 18%)" />
                    <XAxis dataKey="date" stroke="hsl(220 10% 55%)" fontSize={12} />
                    <YAxis stroke="hsl(220 10% 55%)" fontSize={12} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(240 12% 7.5%)', border: '1px solid hsl(245 15% 18%)' }} />
                    <Line type="monotone" dataKey="count" stroke="hsl(166 100% 42%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="card-glow">
              <CardHeader><CardTitle>Positions by Symbol</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={positionsBySymbol}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(245 15% 18%)" />
                    <XAxis dataKey="symbol" stroke="hsl(220 10% 55%)" fontSize={12} />
                    <YAxis stroke="hsl(220 10% 55%)" fontSize={12} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(240 12% 7.5%)', border: '1px solid hsl(245 15% 18%)' }} />
                    <Bar dataKey="qty" fill="hsl(166 100% 42%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="portfolio">
          <Card className="card-glow">
            <CardHeader><CardTitle>Portfolio Positions</CardTitle></CardHeader>
            <CardContent>
              <div className="table-striped">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead><TableHead>Qty</TableHead><TableHead>Avg Price</TableHead>
                      <TableHead>Value</TableHead><TableHead>Updated</TableHead><TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {positions.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No positions</TableCell></TableRow>
                    ) : positions.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono font-semibold">{p.symbol}</TableCell>
                        <TableCell className="font-mono">{p.qty}</TableCell>
                        <TableCell className="font-mono">${Number(p.avg_price).toFixed(2)}</TableCell>
                        <TableCell className="font-mono text-primary">${(Math.abs(p.qty) * Number(p.avg_price)).toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{new Date(p.updated_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => closePosition(p)}>Close</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Analytics;
