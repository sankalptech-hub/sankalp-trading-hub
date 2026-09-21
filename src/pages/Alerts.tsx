import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeAlerts, useRealtimePositions } from '@/hooks/useRealtime';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Check, CheckCheck, Trash2 } from 'lucide-react';

const typeColors: Record<string, string> = {
  info: 'border-l-blue-500 bg-blue-500/5',
  warning: 'border-l-yellow-500 bg-yellow-500/5',
  danger: 'border-l-red-500 bg-red-500/5',
  success: 'border-l-emerald-500 bg-emerald-500/5',
};

const riskColor: Record<string, string> = {
  High: 'text-red-400 bg-red-500/20',
  Medium: 'text-yellow-400 bg-yellow-500/20',
  Low: 'text-emerald-400 bg-emerald-500/20',
};

const Alerts = () => {
  const { user } = useAuth();
  const { alerts, unreadCount, markRead, markAllRead } = useRealtimeAlerts(user?.id);
  const { positions } = useRealtimePositions(user?.id);

  const deleteAlert = async (id: string) => {
    const { error } = await supabase.from('alerts').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Alert deleted');
  };

  // Exposure calculations from live positions
  const totalPortfolioQty = positions.reduce((sum, p) => sum + Math.abs(p.qty), 0);
  const exposureData = positions.map(p => {
    const absQty = Math.abs(p.qty);
    const pct = totalPortfolioQty > 0 ? (absQty / totalPortfolioQty) * 100 : 0;
    const riskLevel = pct > 50 ? 'High' : pct > 20 ? 'Medium' : 'Low';
    return { symbol: p.symbol, qty: absQty, pct, riskLevel };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Alerts</h1>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark all read ({unreadCount})
          </Button>
        )}
      </div>

      <Tabs defaultValue="alerts">
        <TabsList>
          <TabsTrigger value="alerts">
            Alerts
            {unreadCount > 0 && (
              <span className="ml-2 bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5">{unreadCount}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="exposure">Exposure</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts">
          {alerts.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">No alerts yet. They'll appear here in real-time.</p>
          ) : (
            <div className="space-y-3">
              {alerts.map(a => (
                <Card key={a.id} className={`border-l-4 ${typeColors[a.type] || typeColors.info} ${a.read ? 'opacity-60' : ''}`}>
                  <CardContent className="py-4 flex items-center justify-between">
                    <div>
                      <p className={a.read ? 'text-muted-foreground' : ''}>{a.message}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-1">{new Date(a.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2">
                      {!a.read && (
                        <Button variant="ghost" size="icon" onClick={() => markRead(a.id)} title="Mark as read">
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => deleteAlert(a.id)} title="Delete">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="exposure">
          <Card className="card-glow">
            <CardHeader><CardTitle>Portfolio Exposure (Live)</CardTitle></CardHeader>
            <CardContent>
              <div className="table-striped">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Total Qty</TableHead>
                      <TableHead>% of Portfolio</TableHead>
                      <TableHead>Risk Level</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exposureData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">No positions</TableCell>
                      </TableRow>
                    ) : exposureData.map(e => (
                      <TableRow key={e.symbol}>
                        <TableCell className="font-mono font-semibold">{e.symbol}</TableCell>
                        <TableCell className="font-mono">{e.qty}</TableCell>
                        <TableCell className="font-mono">{e.pct.toFixed(1)}%</TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded text-xs ${riskColor[e.riskLevel]}`}>{e.riskLevel}</span>
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

export default Alerts;
