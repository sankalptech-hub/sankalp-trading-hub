import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { toast } from 'sonner';

const Analytics = () => {
  const { user } = useAuth();
  const [ordersByDay, setOrdersByDay] = useState<any[]>([]);
  const [positionsBySymbol, setPositionsBySymbol] = useState<any[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [filledOrders, setFilledOrders] = useState(0);
  const [totalSymbols, setTotalSymbols] = useState(0);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const { data: orders, error: oe } = await supabase.from('orders').select('*').eq('user_id', user.id);
        if (oe) throw oe;
        const { data: positions, error: pe } = await supabase.from('positions').select('*').eq('user_id', user.id);
        if (pe) throw pe;

        setTotalOrders(orders?.length || 0);
        setFilledOrders(orders?.filter(o => o.status === 'filled').length || 0);
        setTotalSymbols(positions?.length || 0);

        // Group orders by day
        const dayMap: Record<string, number> = {};
        orders?.forEach(o => {
          const day = new Date(o.created_at).toLocaleDateString();
          dayMap[day] = (dayMap[day] || 0) + 1;
        });
        setOrdersByDay(Object.entries(dayMap).map(([date, count]) => ({ date, count })));

        // Positions by symbol
        setPositionsBySymbol(positions?.map(p => ({ symbol: p.symbol, qty: Math.abs(p.qty) })) || []);
      } catch (err: any) {
        toast.error(err.message);
      }
    };
    load();
  }, [user]);

  const stats = [
    { label: 'Total Orders', value: totalOrders },
    { label: 'Filled Orders', value: filledOrders },
    { label: 'Portfolio Symbols', value: totalSymbols },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map(s => (
          <Card key={s.label} className="card-glow">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="text-3xl font-bold font-mono text-primary">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

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
    </div>
  );
};

export default Analytics;
