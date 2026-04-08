import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Shield, Check, Trash2 } from 'lucide-react';

const Risk = () => {
  const { user } = useAuth();
  const [config, setConfig] = useState({ max_position_pct: 20, max_concentration_pct: 50, daily_loss_limit: 10000, max_positions: 10 });
  const [configId, setConfigId] = useState<string | null>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('risk_config').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('positions').select('*').eq('user_id', user.id),
      supabase.from('alerts').select('*').eq('user_id', user.id).in('type', ['warning', 'danger']).order('created_at', { ascending: false }).limit(20),
    ]).then(([rc, pos, al]) => {
      if (rc.data) { setConfigId(rc.data.id); setConfig({ max_position_pct: Number(rc.data.max_position_pct), max_concentration_pct: Number(rc.data.max_concentration_pct), daily_loss_limit: Number(rc.data.daily_loss_limit), max_positions: Number(rc.data.max_positions) }); }
      setPositions(pos.data || []);
      setAlerts(al.data || []);
    });
  }, [user]);

  const saveConfig = async () => {
    if (!user) return;
    if (configId) {
      await supabase.from('risk_config').update(config as any).eq('id', configId);
    } else {
      const { data } = await supabase.from('risk_config').insert({ user_id: user.id, ...config } as any).select().single();
      if (data) setConfigId(data.id);
    }
    toast.success('Risk config saved');
  };

  const totalValue = positions.reduce((s, p) => s + Math.abs(p.qty) * Number(p.avg_price), 0);
  const exposure = positions.map(p => {
    const val = Math.abs(p.qty) * Number(p.avg_price);
    const pct = totalValue > 0 ? (val / totalValue) * 100 : 0;
    const risk = pct > 30 ? 'HIGH' : pct > 15 ? 'MEDIUM' : 'LOW';
    return { symbol: p.symbol, qty: Math.abs(p.qty), value: val, pct, risk };
  });

  const riskColor: Record<string, string> = { HIGH: 'text-red-400 bg-red-500/20', MEDIUM: 'text-yellow-400 bg-yellow-500/20', LOW: 'text-emerald-400 bg-emerald-500/20' };

  const dismissAlert = async (id: string) => {
    await supabase.from('alerts').update({ read: true }).eq('id', id);
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="h-6 w-6 text-primary" /> Risk Manager</h1>

      <Card className="card-glow">
        <CardHeader><CardTitle>Risk Configuration</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div><Label>Max Position Size %</Label><Input type="number" value={config.max_position_pct} onChange={e => setConfig(p => ({ ...p, max_position_pct: Number(e.target.value) }))} /></div>
            <div><Label>Max Concentration %</Label><Input type="number" value={config.max_concentration_pct} onChange={e => setConfig(p => ({ ...p, max_concentration_pct: Number(e.target.value) }))} /></div>
            <div><Label>Daily Loss Limit</Label><Input type="number" value={config.daily_loss_limit} onChange={e => setConfig(p => ({ ...p, daily_loss_limit: Number(e.target.value) }))} /></div>
            <div><Label>Max Open Positions</Label><Input type="number" value={config.max_positions} onChange={e => setConfig(p => ({ ...p, max_positions: Number(e.target.value) }))} /></div>
          </div>
          <Button className="mt-4" onClick={saveConfig}>Save Config</Button>
        </CardContent>
      </Card>

      <Card className="card-glow">
        <CardHeader><CardTitle>Current Exposure</CardTitle></CardHeader>
        <CardContent>
          <div className="table-striped">
            <Table>
              <TableHeader><TableRow><TableHead>Symbol</TableHead><TableHead>Qty</TableHead><TableHead>Value</TableHead><TableHead>% Portfolio</TableHead><TableHead>Risk</TableHead></TableRow></TableHeader>
              <TableBody>
                {exposure.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No positions</TableCell></TableRow> :
                  exposure.map(e => (
                    <TableRow key={e.symbol}>
                      <TableCell className="font-mono font-semibold">{e.symbol}</TableCell>
                      <TableCell className="font-mono">{e.qty}</TableCell>
                      <TableCell className="font-mono">{e.value.toFixed(2)}</TableCell>
                      <TableCell className="font-mono">{e.pct.toFixed(1)}%</TableCell>
                      <TableCell><span className={`px-2 py-0.5 rounded text-xs ${riskColor[e.risk]}`}>{e.risk}</span></TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="card-glow">
        <CardHeader><CardTitle>Portfolio Heatmap</CardTitle></CardHeader>
        <CardContent>
          {exposure.length === 0 ? <p className="text-muted-foreground text-center py-4">No positions</p> : (
            <div className="flex flex-wrap gap-3">
              {exposure.map(e => (
                <div key={e.symbol} className={`rounded-lg p-4 border ${e.risk === 'HIGH' ? 'border-red-500/30 bg-red-500/10' : e.risk === 'MEDIUM' ? 'border-yellow-500/30 bg-yellow-500/10' : 'border-emerald-500/30 bg-emerald-500/10'}`}
                  style={{ minWidth: `${Math.max(80, e.pct * 2)}px` }}>
                  <p className="font-mono font-bold text-sm">{e.symbol}</p>
                  <p className="font-mono text-xs text-muted-foreground">{e.pct.toFixed(1)}%</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="card-glow">
        <CardHeader><CardTitle>Risk Alerts</CardTitle></CardHeader>
        <CardContent>
          {alerts.length === 0 ? <p className="text-muted-foreground text-center py-4">No risk alerts</p> : (
            <div className="space-y-2">
              {alerts.map(a => (
                <div key={a.id} className={`flex items-center justify-between p-3 rounded border-l-4 ${a.type === 'danger' ? 'border-l-red-500 bg-red-500/5' : 'border-l-yellow-500 bg-yellow-500/5'}`}>
                  <div>
                    <p className="text-sm">{a.message}</p>
                    <p className="text-xs text-muted-foreground font-mono">{new Date(a.created_at).toLocaleString()}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => dismissAlert(a.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Risk;
