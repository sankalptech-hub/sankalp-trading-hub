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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Play, Pause, Plus, Cpu, Trash2, Zap, TrendingUp, Target, Activity, Sparkles, Clock, Goal } from 'lucide-react';
import { toast } from 'sonner';
import { EA_TEMPLATES, EATemplate } from '@/lib/eaTemplates';

type EA = { id: string; name: string; symbol: string; strategy: string | null; status: string; lot_size: number; pnl: number; created_at: string };

const EAs = () => {
  const { user } = useAuth();
  const [eas, setEas] = useState<EA[]>([]);
  const [open, setOpen] = useState(false);
  const [deploying, setDeploying] = useState<string | null>(null);
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

  const deployTemplate = async (t: EATemplate) => {
    if (!user) return;
    setDeploying(t.id);
    const { error } = await supabase.from('eas').insert({
      user_id: user.id,
      name: t.name,
      symbol: t.symbol,
      strategy: t.strategy,
      lot_size: t.lot_size,
      status: 'running',
    });
    setDeploying(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`${t.name} deployed and running`);
    load();
  };

  const riskColor = (r: EATemplate['risk']) =>
    r === 'Low' ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10'
    : r === 'Medium' ? 'text-amber-500 border-amber-500/30 bg-amber-500/10'
    : 'text-destructive border-destructive/30 bg-destructive/10';

  const categories: Array<'All' | EATemplate['category']> = ['All', 'Forex', 'Stocks', 'Options'];
  const renderGrid = (items: EATemplate[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map(t => (
        <div key={t.id} className="border rounded-lg p-4 bg-card/50 hover:border-primary/50 transition-colors flex flex-col">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="font-semibold flex items-center gap-1.5"><Zap className="h-4 w-4 text-primary" />{t.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5 font-mono">{t.symbol} · {t.timeframe} · {t.strategy}</div>
            </div>
            <div className="flex flex-col gap-1 items-end">
              <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
              <Badge variant="outline" className={`text-[10px] ${riskColor(t.risk)}`}>{t.risk} risk</Badge>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-3 flex-1">{t.description}</p>
          <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
            <div className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3"/><span className="truncate">{t.holdingTime}</span></div>
            <div className="flex items-center gap-1 text-emerald-500"><Goal className="h-3 w-3"/><span className="truncate font-medium">{t.target}</span></div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center mb-3 pt-3 border-t">
            <div><div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5"><Target className="h-2.5 w-2.5"/>Win</div><div className="text-sm font-mono font-semibold text-emerald-500">{t.metrics.winRate}%</div></div>
            <div><div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5"><TrendingUp className="h-2.5 w-2.5"/>PF</div><div className="text-sm font-mono font-semibold">{t.metrics.profitFactor}</div></div>
            <div><div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5"><Activity className="h-2.5 w-2.5"/>Sharpe</div><div className="text-sm font-mono font-semibold">{t.metrics.sharpe}</div></div>
            <div><div className="text-[10px] text-muted-foreground">Max DD</div><div className="text-sm font-mono font-semibold text-destructive">{t.metrics.maxDD}%</div></div>
          </div>
          <Button size="sm" className="w-full" disabled={deploying === t.id} onClick={() => deployTemplate(t)}>
            {deploying === t.id ? 'Deploying…' : <><Play className="h-3 w-3 mr-1"/>Deploy EA</>}
          </Button>
        </div>
      ))}
    </div>
  );

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

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Strategy Marketplace
            <Badge variant="outline" className="ml-2 text-xs">Back-tested · One-click deploy</Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Pre-built, back-tested strategies for Forex, Stocks and Options — each with target return and holding time. Deploy in one click.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="All">
            <TabsList className="mb-4">
              {categories.map(c => (
                <TabsTrigger key={c} value={c}>
                  {c} {c !== 'All' && <span className="ml-1 text-xs opacity-60">({EA_TEMPLATES.filter(t => t.category === c).length})</span>}
                </TabsTrigger>
              ))}
            </TabsList>
            {categories.map(c => (
              <TabsContent key={c} value={c}>
                {renderGrid(c === 'All' ? EA_TEMPLATES : EA_TEMPLATES.filter(t => t.category === c))}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

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