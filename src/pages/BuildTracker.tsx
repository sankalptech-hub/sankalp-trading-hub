import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const SEED_TASKS = [
  { task_name: 'Setup project structure', module: 'Backend', status: 'Completed', priority: 'High' },
  { task_name: 'Setup Supabase connection', module: 'Backend', status: 'Completed', priority: 'High' },
  { task_name: 'Create database schema', module: 'Backend', status: 'Completed', priority: 'High' },
  { task_name: 'Build authentication system', module: 'Auth', status: 'Completed', priority: 'High' },
  { task_name: 'Trade execution UI', module: 'UI', status: 'Completed', priority: 'High' },
  { task_name: 'Signal generation flow', module: 'Trading', status: 'Completed', priority: 'High' },
  { task_name: 'Order lifecycle tracking', module: 'Trading', status: 'Completed', priority: 'Medium' },
  { task_name: 'Portfolio management', module: 'Trading', status: 'Completed', priority: 'Medium' },
  { task_name: 'Market data integration', module: 'Data', status: 'Completed', priority: 'Medium' },
  { task_name: 'Price updates', module: 'Data', status: 'Completed', priority: 'Medium' },
  { task_name: 'Data caching', module: 'Data', status: 'Completed', priority: 'Low' },
  { task_name: 'Trade validation rules', module: 'Risk', status: 'Completed', priority: 'High' },
  { task_name: 'Risk alerts', module: 'Risk', status: 'Completed', priority: 'High' },
  { task_name: 'Exposure limits', module: 'Risk', status: 'Completed', priority: 'Medium' },
  { task_name: 'Dashboard page', module: 'UI', status: 'Completed', priority: 'High' },
  { task_name: 'Trade console', module: 'UI', status: 'Completed', priority: 'High' },
  { task_name: 'Alerts page', module: 'UI', status: 'Completed', priority: 'Medium' },
  { task_name: 'Strategy page', module: 'UI', status: 'Completed', priority: 'Medium' },
  { task_name: 'Analytics page', module: 'UI', status: 'Completed', priority: 'Low' },
  { task_name: 'AI assistant', module: 'UI', status: 'Completed', priority: 'Low' },
  { task_name: 'Admin Panel', module: 'UI', status: 'Completed', priority: 'High' },
  { task_name: 'NSE market data Yahoo Finance', module: 'Data', status: 'Completed', priority: 'High' },
  { task_name: 'Scanner page', module: 'UI', status: 'Completed', priority: 'High' },
  { task_name: 'Strategy Builder page', module: 'UI', status: 'Completed', priority: 'High' },
  { task_name: 'Backtest engine', module: 'Trading', status: 'Completed', priority: 'High' },
  { task_name: 'Trade History page', module: 'UI', status: 'Completed', priority: 'Medium' },
  { task_name: 'Risk Manager page', module: 'Risk', status: 'Completed', priority: 'High' },
  { task_name: 'Multi-broker management', module: 'Backend', status: 'Completed', priority: 'High' },
  { task_name: 'Demo paper trading', module: 'Trading', status: 'Completed', priority: 'High' },
  { task_name: 'Broker-aware trade execution', module: 'Trading', status: 'Completed', priority: 'High' },
  { task_name: 'Light Dark theme toggle', module: 'UI', status: 'Completed', priority: 'Low' },
  { task_name: 'Settings page', module: 'UI', status: 'Completed', priority: 'Medium' },
  { task_name: 'Zerodha live API execution', module: 'Backend', status: 'In Progress', priority: 'High' },
  { task_name: 'Groww API integration', module: 'Backend', status: 'In Progress', priority: 'High' },
  { task_name: 'IBKR TWS bridge', module: 'Backend', status: 'In Progress', priority: 'High' },
  { task_name: 'MT4 MT5 bridge', module: 'Backend', status: 'In Progress', priority: 'Medium' },
  { task_name: 'Automation workflows', module: 'Backend', status: 'Not Started', priority: 'Low' },
];

const statusColors: Record<string, string> = {
  'Not Started': 'bg-muted text-muted-foreground',
  'In Progress': 'bg-yellow-500/20 text-yellow-400',
  'Completed': 'bg-emerald-500/20 text-emerald-400',
};

const priorityColors: Record<string, string> = {
  'High': 'bg-red-500/20 text-red-400',
  'Medium': 'bg-yellow-500/20 text-yellow-400',
  'Low': 'bg-blue-500/20 text-blue-400',
};

const BuildTracker = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [filterModule, setFilterModule] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [seeded, setSeeded] = useState(false);

  const fetchTasks = async (skipSync = false) => {
    if (!user) return;
    const { data, error } = await supabase.from('build_tasks').select('*').eq('user_id', user.id).order('updated_at', { ascending: false });
    if (error) { toast.error(error.message); return; }

    if (!data || data.length === 0) {
      if (seeded) { setTasks([]); return; }
      setSeeded(true);
      await supabase.from('build_tasks').insert(
        SEED_TASKS.map(t => ({ task_name: t.task_name, module: t.module, status: t.status, priority: t.priority, notes: '', user_id: user.id }))
      );
      fetchTasks(true);
      return;
    }

    if (!skipSync && !seeded) {
      setSeeded(true);
      let needsRefresh = false;
      const existingNames = new Set(data.map(t => t.task_name));
      
      // Sync statuses for all tasks
      for (const seed of SEED_TASKS) {
        const existing = data.find(t => t.task_name === seed.task_name);
        if (existing && existing.status !== seed.status) {
          await supabase.from('build_tasks').update({ status: seed.status } as any).eq('id', existing.id);
          needsRefresh = true;
        }
        if (!existingNames.has(seed.task_name)) {
          await supabase.from('build_tasks').insert({ task_name: seed.task_name, module: seed.module, status: seed.status, priority: seed.priority, notes: '', user_id: user.id });
          needsRefresh = true;
        }
      }

      if (needsRefresh) { fetchTasks(true); return; }
    }

    setTasks(data);
  };

  useEffect(() => { fetchTasks(); }, [user]);

  const updateField = async (id: string, field: 'status' | 'priority' | 'notes', value: string) => {
    const updateData = { [field]: value } as any;
    await supabase.from('build_tasks').update(updateData).eq('id', id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const filtered = tasks.filter(t =>
    (filterModule === 'all' || t.module === filterModule) &&
    (filterStatus === 'all' || t.status === filterStatus)
  );

  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'Completed').length;
  const inProgress = tasks.filter(t => t.status === 'In Progress').length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Build Tracker</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="card-glow"><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total Tasks</p><p className="text-3xl font-bold font-mono text-primary">{total}</p></CardContent></Card>
        <Card className="card-glow"><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Completed</p><p className="text-3xl font-bold font-mono text-primary">{completed}</p></CardContent></Card>
        <Card className="card-glow"><CardContent className="pt-6"><p className="text-sm text-muted-foreground">In Progress</p><p className="text-3xl font-bold font-mono text-primary">{inProgress}</p></CardContent></Card>
      </div>

      <div className="flex gap-4 flex-wrap">
        <Select value={filterModule} onValueChange={setFilterModule}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Module" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modules</SelectItem>
            {['UI', 'Backend', 'Trading', 'Risk', 'Data', 'Auth'].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {['Not Started', 'In Progress', 'Completed'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="card-glow">
        <CardContent className="pt-6">
          <div className="table-striped overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task Name</TableHead><TableHead>Module</TableHead><TableHead>Status</TableHead><TableHead>Priority</TableHead><TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.task_name}</TableCell>
                    <TableCell><Badge variant="outline">{t.module}</Badge></TableCell>
                    <TableCell>
                      <Select value={t.status} onValueChange={v => updateField(t.id, 'status', v)}>
                        <SelectTrigger className="w-32 h-8"><span className={`px-2 py-0.5 rounded text-xs ${statusColors[t.status]}`}>{t.status}</span></SelectTrigger>
                        <SelectContent>{['Not Started', 'In Progress', 'Completed'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={t.priority} onValueChange={v => updateField(t.id, 'priority', v)}>
                        <SelectTrigger className="w-24 h-8"><span className={`px-2 py-0.5 rounded text-xs ${priorityColors[t.priority]}`}>{t.priority}</span></SelectTrigger>
                        <SelectContent>{['High', 'Medium', 'Low'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input className="h-8 text-xs min-w-[150px]" value={t.notes || ''} placeholder="Add notes..."
                        onChange={e => setTasks(prev => prev.map(x => x.id === t.id ? { ...x, notes: e.target.value } : x))}
                        onBlur={e => updateField(t.id, 'notes', e.target.value)} />
                    </TableCell>
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

export default BuildTracker;
