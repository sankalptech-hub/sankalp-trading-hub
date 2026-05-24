import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Play, Pause, Plus, Cpu, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type EA = { id: string; name: string; symbol: string; strategy: string | null; status: string; lot_size: number; pnl: number; created_at: string };

const EAs = () => {
  const { user } = useAuth();
  const [eas, setEas] = useState<EA[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', symbol: 'EURUSD', strategy: 'Trend Follow', lot_size: '0.1' });

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from('eas').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    setEas((data as EA[]) || []);
  };
  useEffect(() => { load(); }, [user]);

  const createEa = async () => {
    if (!user || !form.name) return;
    const { error } = await supabase.from('eas').insert({
      user_id: user.id, name: form.name, symbol: form.symbol, strategy: form.strategy,
      lot_size: Number(form.lot_size) || 0.1, status: 'running',
    });
    if (error) { toast.error(error.message); return; }
    toast.success('EA created');
    setOpen(false); setForm({ name: '', symbol: 'EURUSD', strategy: 'Trend Follow', lot_size: '0.1' });
    load();
  };

  const toggle = async (ea: EA) => {
    const next = ea.status === 'running' ? 'paused' : 'running';
    await supabase.from('eas').update({ status: next }).eq('id', ea.id);
    toast.success(`${ea.name} is now ${next}`);
    load();
  };

  const remove = async (ea: EA) => {
    if (!confirm(`Remove EA "${ea.name}"?`)) return;
    await supabase.from('eas').delete().eq('id', ea.id);
    toast.success('EA removed'); load();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Cpu className="h-7 w-7 text-primary"/> Expert Advisors</h1>
          <p className="text-muted-foreground text-sm mt-1">Track and manage your algorithmic trading bots</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1"/>New EA</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Expert Advisor</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Name (e.g. EURUSD Scalper)" value={form.name} onChange={e=>setForm({...form, name:e.target.value})}/>
              <Input placeholder="Symbol" value={form.symbol} onChange={e=>setForm({...form, symbol:e.target.value.toUpperCase()})}/>
              <Input placeholder="Strategy" value={form.strategy} onChange={e=>setForm({...form, strategy:e.target.value})}/>
              <Input placeholder="Lot size" type="number" step="0.01" value={form.lot_size} onChange={e=>setForm({...form, lot_size:e.target.value})}/>
              <Button className="w-full" onClick={createEa}>Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Active EAs · {eas.length}</CardTitle></CardHeader>
        <CardContent>
          {eas.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">No EAs yet — create your first one.</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Symbol</TableHead><TableHead>Strategy</TableHead>
                <TableHead>Lot</TableHead><TableHead>Status</TableHead><TableHead className="text-right">P&L</TableHead><TableHead/>
              </TableRow></TableHeader>
              <TableBody>
                {eas.map(ea => (
                  <TableRow key={ea.id}>
                    <TableCell><Link className="text-primary hover:underline" to={`/eas/${ea.id}`}>{ea.name}</Link></TableCell>
                    <TableCell className="font-mono">{ea.symbol}</TableCell>
                    <TableCell>{ea.strategy || '—'}</TableCell>
                    <TableCell>{Number(ea.lot_size).toFixed(2)}</TableCell>
                    <TableCell><Badge variant={ea.status==='running'?'default':'secondary'}>{ea.status}</Badge></TableCell>
                    <TableCell className={`text-right font-mono ${Number(ea.pnl)>=0?'text-emerald-500':'text-destructive'}`}>
                      {Number(ea.pnl)>=0?'+':''}{Number(ea.pnl).toFixed(2)}
                    </TableCell>
                    <TableCell className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={()=>toggle(ea)}>
                        {ea.status==='running'?<Pause className="h-3 w-3"/>:<Play className="h-3 w-3"/>}
                      </Button>
                      <Button size="sm" variant="outline" onClick={()=>remove(ea)}><Trash2 className="h-3 w-3"/></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
export default EAs;