import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ArrowLeft, Play, Pause, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const EADetail = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const [ea, setEa] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [equity, setEquity] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    const { data: e } = await supabase.from('eas').select('*').eq('id', id).maybeSingle();
    setEa(e);
    const { data: t } = await supabase.from('ea_trades').select('*').eq('ea_id', id).order('opened_at', { ascending: false });
    setTrades(t || []);
    const { data: eq } = await supabase.from('equity_points').select('*').eq('ea_id', id).order('ts');
    setEquity((eq || []).map(p => ({ t: new Date(p.ts).toLocaleDateString(), equity: Number(p.equity) })));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!ea) return <div className="p-6 text-muted-foreground">Loading EA…</div>;

  const toggle = async () => {
    const next = ea.status === 'running' ? 'paused' : 'running';
    await supabase.from('eas').update({ status: next }).eq('id', ea.id);
    toast.success(`EA is now ${next}`); load();
  };
  const remove = async () => {
    if (!confirm('Remove this EA?')) return;
    await supabase.from('eas').delete().eq('id', ea.id);
    nav('/eas');
  };

  const closed = trades.filter(t => !t.is_open);
  const open = trades.filter(t => t.is_open);
  const wins = closed.filter(t => Number(t.pnl) > 0).length;
  const winRate = closed.length ? ((wins / closed.length) * 100).toFixed(1) : '0';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link to="/eas" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4"/>Back to EAs</Link>
        <div className="flex gap-2">
          <Badge variant={ea.status==='running'?'default':'secondary'}>{ea.status}</Badge>
          <Button size="sm" variant="outline" onClick={toggle}>{ea.status==='running'?<><Pause className="h-3 w-3 mr-1"/>Pause</>:<><Play className="h-3 w-3 mr-1"/>Resume</>}</Button>
          <Button size="sm" variant="outline" onClick={remove}><Trash2 className="h-3 w-3 mr-1"/>Remove</Button>
        </div>
      </div>

      <div>
        <h1 className="text-3xl font-bold">{ea.name}</h1>
        <p className="text-sm text-muted-foreground">{ea.symbol} · {ea.strategy || 'Strategy'}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardHeader><CardTitle className="text-xs text-muted-foreground">P&L</CardTitle></CardHeader>
          <CardContent><div className={`text-2xl font-bold ${Number(ea.pnl)>=0?'text-emerald-500':'text-destructive'}`}>{Number(ea.pnl)>=0?'+':''}{Number(ea.pnl).toFixed(2)}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-xs text-muted-foreground">Win Rate</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{winRate}%</div><div className="text-xs text-muted-foreground">{closed.length} closed trades</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-xs text-muted-foreground">Open Positions</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{open.length}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-xs text-muted-foreground">Lot Size</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{Number(ea.lot_size).toFixed(2)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Equity Curve</CardTitle></CardHeader>
        <CardContent>
          {equity.length === 0 ? <div className="text-muted-foreground text-sm py-12 text-center">No equity points yet</div> : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={equity}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3"/>
                <XAxis dataKey="t" stroke="hsl(var(--muted-foreground))" fontSize={11}/>
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11}/>
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}/>
                <Line type="monotone" dataKey="equity" stroke="hsl(var(--primary))" strokeWidth={2} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Trades · {trades.length}</CardTitle></CardHeader>
        <CardContent>
          {trades.length === 0 ? <div className="text-center text-muted-foreground py-8">No trades yet</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Side</TableHead><TableHead>Lots</TableHead><TableHead>Entry</TableHead><TableHead>Exit</TableHead><TableHead className="text-right">P&L</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{trades.slice(0, 20).map(t => (
                <TableRow key={t.id}>
                  <TableCell className={t.side==='BUY'?'text-emerald-500':'text-destructive'}>{t.side}</TableCell>
                  <TableCell className="font-mono">{Number(t.lots).toFixed(2)}</TableCell>
                  <TableCell className="font-mono">{Number(t.entry).toFixed(2)}</TableCell>
                  <TableCell className="font-mono">{t.exit ? Number(t.exit).toFixed(2) : '—'}</TableCell>
                  <TableCell className={`text-right font-mono ${Number(t.pnl)>=0?'text-emerald-500':'text-destructive'}`}>{Number(t.pnl)>=0?'+':''}{Number(t.pnl).toFixed(2)}</TableCell>
                  <TableCell><Badge variant={t.is_open?'default':'secondary'}>{t.is_open?'OPEN':'CLOSED'}</Badge></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
export default EADetail;