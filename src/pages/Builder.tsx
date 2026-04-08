import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Wrench, Trash2, Play } from 'lucide-react';

const CONDITIONS = [
  'RSI < 30 (Oversold)', 'RSI > 70 (Overbought)',
  'Price > 50 Day MA', 'Price < 50 Day MA', 'Volume Surge > 2x Average',
];
const TIMEFRAMES = ['1m', '5m', '15m', '1h', '1d'];

const Builder = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [strategies, setStrategies] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [entry, setEntry] = useState(CONDITIONS[0]);
  const [exit, setExit] = useState(CONDITIONS[1]);
  const [posSize, setPosSize] = useState('10');
  const [stopLoss, setStopLoss] = useState('2');
  const [takeProfit, setTakeProfit] = useState('5');
  const [timeframe, setTimeframe] = useState('1d');
  const [editId, setEditId] = useState<string | null>(null);

  const fetchStrategies = async () => {
    if (!user) return;
    const { data } = await supabase.from('strategies').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    setStrategies(data || []);
  };

  useEffect(() => { fetchStrategies(); }, [user]);

  const parseConfig = (s: any) => {
    try { return JSON.parse(s.description || '{}'); } catch { return {}; }
  };

  const save = async (andBacktest = false) => {
    if (!name.trim() || !user) { toast.error('Name required'); return; }
    const config = JSON.stringify({ entry, exit, posSize: Number(posSize), stopLoss: Number(stopLoss), takeProfit: Number(takeProfit), timeframe, userDesc: desc });
    
    if (editId) {
      await supabase.from('strategies').update({ name, description: config }).eq('id', editId);
      toast.success('Strategy updated');
    } else {
      await supabase.from('strategies').insert({ user_id: user.id, name, description: config });
      toast.success('Strategy saved');
    }
    setName(''); setDesc(''); setEditId(null);
    setEntry(CONDITIONS[0]); setExit(CONDITIONS[1]); setPosSize('10'); setStopLoss('2'); setTakeProfit('5'); setTimeframe('1d');
    fetchStrategies();
    if (andBacktest) navigate(`/backtest?strategy=${encodeURIComponent(name)}`);
  };

  const editStrategy = (s: any) => {
    const c = parseConfig(s);
    setEditId(s.id); setName(s.name); setDesc(c.userDesc || '');
    setEntry(c.entry || CONDITIONS[0]); setExit(c.exit || CONDITIONS[1]);
    setPosSize(String(c.posSize || 10)); setStopLoss(String(c.stopLoss || 2));
    setTakeProfit(String(c.takeProfit || 5)); setTimeframe(c.timeframe || '1d');
  };

  const deleteStrategy = async (id: string) => {
    await supabase.from('strategies').delete().eq('id', id);
    toast.success('Deleted'); fetchStrategies();
  };

  const toggleStatus = async (id: string, current: string) => {
    await supabase.from('strategies').update({ status: current === 'active' ? 'inactive' : 'active' }).eq('id', id);
    fetchStrategies();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="h-6 w-6 text-primary" /> Strategy Builder</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="card-glow">
          <CardHeader><CardTitle>{editId ? 'Edit Strategy' : 'Build Strategy'}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Momentum Breakout" /></div>
            <div><Label>Description</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Describe..." /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Entry Condition</Label>
                <Select value={entry} onValueChange={setEntry}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONDITIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Exit Condition</Label>
                <Select value={exit} onValueChange={setExit}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONDITIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Position Size %</Label><Input type="number" min="1" max="100" value={posSize} onChange={e => setPosSize(e.target.value)} /></div>
              <div><Label>Stop Loss %</Label><Input type="number" min="0.5" max="20" step="0.5" value={stopLoss} onChange={e => setStopLoss(e.target.value)} /></div>
              <div><Label>Take Profit %</Label><Input type="number" min="0.5" max="50" step="0.5" value={takeProfit} onChange={e => setTakeProfit(e.target.value)} /></div>
            </div>
            <div><Label>Timeframe</Label>
              <Select value={timeframe} onValueChange={setTimeframe}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>{TIMEFRAMES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex gap-3">
              <Button onClick={() => save(false)}>Save Strategy</Button>
              <Button variant="outline" onClick={() => save(true)}>Save & Backtest</Button>
              {editId && <Button variant="ghost" onClick={() => { setEditId(null); setName(''); }}>Cancel</Button>}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Saved Strategies ({strategies.length})</h2>
          {strategies.map(s => {
            const c = parseConfig(s);
            return (
              <Card key={s.id} className="card-glow">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <h3 className="font-semibold">{s.name}</h3>
                      {c.entry && <p className="text-xs text-muted-foreground">Entry: {c.entry}</p>}
                      {c.exit && <p className="text-xs text-muted-foreground">Exit: {c.exit}</p>}
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        {c.posSize && <span>Size: {c.posSize}%</span>}
                        {c.stopLoss && <span>SL: {c.stopLoss}%</span>}
                        {c.takeProfit && <span>TP: {c.takeProfit}%</span>}
                      </div>
                    </div>
                    <Switch checked={s.status === 'active'} onCheckedChange={() => toggleStatus(s.id, s.status)} />
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => editStrategy(s)}>Edit</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/backtest?strategy=${encodeURIComponent(s.name)}`)}><Play className="h-3 w-3 mr-1" />Backtest</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => deleteStrategy(s.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Builder;
