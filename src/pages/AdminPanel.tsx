import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';
import { toast } from 'sonner';
import { Users, ShoppingCart, TrendingUp, Shield, Bell, Zap, CheckSquare } from 'lucide-react';
import { groww } from '@/lib/growwService';
import { adminOps, type BuildTaskStatus } from '@/lib/adminOps';
import type { Tables } from '@/integrations/supabase/types';

type Profile   = Tables<'profiles'>;
type Order     = Tables<'orders'>;
type Alert     = Tables<'alerts'>;
type Signal    = Tables<'signals'>;
type BuildTask = Tables<'build_tasks'>;

const COLORS = [
  'hsl(166 100% 42%)', 'hsl(348 90% 65%)', 'hsl(30 100% 64%)',
  'hsl(220 70% 55%)', 'hsl(280 60% 55%)',
];

interface ProfileWithRole extends Profile {
  role: string;
}

const AdminPanel = () => {
  const { isAdmin, user, loading } = useAuth();

  const [usersData,   setUsersData]   = useState<ProfileWithRole[]>([]);
  const [allOrders,   setAllOrders]   = useState<Order[]>([]);
  const [allAlerts,   setAllAlerts]   = useState<Alert[]>([]);
  const [allSignals,  setAllSignals]  = useState<Signal[]>([]);
  const [buildTasks,  setBuildTasks]  = useState<BuildTask[]>([]);
  const [profileMap,  setProfileMap]  = useState<Record<string, string>>({});
  const [scanLoading, setScanLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [profilesRes, rolesRes, ordersRes, alertsRes, signalsRes] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('user_roles').select('*'),
        supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('alerts').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('signals').select('*').order('created_at', { ascending: false }).limit(200),
      ]);

      if (profilesRes.error) throw profilesRes.error;

      const profiles = profilesRes.data ?? [];
      const roles    = rolesRes.data ?? [];

      const pMap: Record<string, string> = {};
      profiles.forEach(p => { pMap[p.user_id] = p.display_name || p.user_id.slice(0, 8) + '…'; });
      setProfileMap(pMap);

      const joined: ProfileWithRole[] = profiles.map(p => {
        const adminRole = roles.find(r => r.user_id === p.user_id && r.role === 'admin');
        return { ...p, role: adminRole ? 'admin' : 'user' };
      });
      setUsersData(joined);
      setAllOrders(ordersRes.data ?? []);
      setAllAlerts(alertsRes.data ?? []);
      setAllSignals(signalsRes.data ?? []);

      // Build tasks: admins read all rows directly (RLS admin policy allows it)
      const { data: tasks, error: tasksErr } = await supabase.from('build_tasks').select('*').order('updated_at', { ascending: false });
      if (tasksErr) throw tasksErr;
      setBuildTasks(tasks ?? []);
    } catch (err: unknown) {
      toast.error('Failed to load admin data: ' + (err instanceof Error ? err.message : String(err)));
    }
  }, [isAdmin]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground font-mono">
      Loading…
    </div>
  );
  if (!isAdmin && user) return <Navigate to="/dashboard" replace />;
  if (!user) return <Navigate to="/login" replace />;

  const getName = (uid: string) => profileMap[uid] || uid.slice(0, 8) + '…';

  // ── Role toggle (via admin-ops edge function; direct RPC is revoked) ──────
  const toggleRole = async (uid: string, currentRole: string) => {
    if (uid === user?.id) { toast.error('You cannot change your own role'); return; }
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    const res = await adminOps.setUserRole(uid, newRole);
    if (res.error) { toast.error('Failed to update role: ' + res.error); return; }
    toast.success(`Role updated to ${newRole}`);
    loadData();
  };

  // ── Build task status update (via admin-ops for cross-user tasks) ────────
  const updateTaskStatus = async (id: string, status: string) => {
    const res = await adminOps.updateBuildTask(id, status as BuildTaskStatus);
    if (res.error) { toast.error('Failed to update task: ' + res.error); return; }
    setBuildTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
  };

  // ── Run signal scan for all users ────────────────────────────────────────
  const runGlobalScan = async () => {
    setScanLoading(true);
    const res = await groww.runScan();
    setScanLoading(false);
    if (res.error) toast.error('Scan failed: ' + res.error);
    else toast.success(`Scan complete — signals: ${(res.data as { signals_created?: number } | undefined)?.signals_created ?? 0}`);
    loadData();
  };

  // ── Chart data ───────────────────────────────────────────────────────────
  const ordersByDay = allOrders.reduce<Record<string, number>>((acc, o) => {
    const day = new Date(o.created_at).toLocaleDateString();
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {});
  const orderTimeData = Object.entries(ordersByDay).map(([date, count]) => ({ date, count }));

  const symbolMap = allOrders.reduce<Record<string, number>>((acc, o) => {
    acc[o.symbol] = (acc[o.symbol] || 0) + 1;
    return acc;
  }, {});
  const symbolData = Object.entries(symbolMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  const signalsByType = allSignals.reduce<Record<string, number>>((acc, s) => {
    acc[s.signal_type] = (acc[s.signal_type] || 0) + 1;
    return acc;
  }, {});
  const signalData = Object.entries(signalsByType).map(([name, value]) => ({ name, value }));

  const stats = [
    { label: 'Total Users',   value: usersData.length,                             icon: Users },
    { label: 'Total Orders',  value: allOrders.length,                              icon: ShoppingCart },
    { label: 'Admin Users',   value: usersData.filter(u => u.role === 'admin').length, icon: Shield },
    { label: 'Signals Today', value: allSignals.filter(s => {
        const d = new Date(s.created_at);
        const now = new Date();
        return d.toDateString() === now.toDateString();
      }).length,                                                                     icon: Zap },
  ];

  const taskStatusColor: Record<string, string> = {
    pending:     'bg-yellow-500/20 text-yellow-300',
    in_progress: 'bg-blue-500/20 text-blue-300',
    done:        'bg-emerald-500/20 text-emerald-300',
    blocked:     'bg-red-500/20 text-red-300',
  };
  const priorityColor: Record<string, string> = {
    low:      'text-muted-foreground',
    medium:   'text-yellow-400',
    high:     'text-orange-400',
    critical: 'text-red-400',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <Button onClick={runGlobalScan} disabled={scanLoading} size="sm" variant="outline">
          <Zap className="h-4 w-4 mr-2" />
          {scanLoading ? 'Scanning…' : 'Run Signal Scan'}
        </Button>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <Card key={s.label} className="card-glow">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-3xl font-bold font-mono text-primary">{s.value}</p>
                </div>
                <s.icon className="h-8 w-8 text-primary opacity-40" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="users"><Users className="h-3.5 w-3.5 mr-1.5" />Users</TabsTrigger>
          <TabsTrigger value="analytics"><TrendingUp className="h-3.5 w-3.5 mr-1.5" />Analytics</TabsTrigger>
          <TabsTrigger value="orders"><ShoppingCart className="h-3.5 w-3.5 mr-1.5" />Orders</TabsTrigger>
          <TabsTrigger value="alerts"><Bell className="h-3.5 w-3.5 mr-1.5" />Alerts</TabsTrigger>
          <TabsTrigger value="signals"><Zap className="h-3.5 w-3.5 mr-1.5" />Signals</TabsTrigger>
          <TabsTrigger value="tasks"><CheckSquare className="h-3.5 w-3.5 mr-1.5" />Build Tasks</TabsTrigger>
        </TabsList>

        {/* ── Users tab ── */}
        <TabsContent value="users">
          <Card className="card-glow">
            <CardHeader><CardTitle>User Management ({usersData.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="table-striped">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Referral Code</TableHead>
                      <TableHead>Rank</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersData.map(u => (
                      <TableRow key={u.user_id}>
                        <TableCell className="font-medium">{u.display_name || '—'}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{u.referral_code || '—'}</TableCell>
                        <TableCell><Badge variant="outline">{u.rank}</Badge></TableCell>
                        <TableCell>
                          <Badge variant={u.role === 'admin' ? 'default' : 'outline'}>{u.role}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {new Date(u.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline" size="sm"
                            disabled={u.user_id === user?.id}
                            onClick={() => toggleRole(u.user_id, u.role)}
                          >
                            {u.user_id === user?.id ? 'You' : u.role === 'admin' ? 'Demote' : 'Promote'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Analytics tab ── */}
        <TabsContent value="analytics">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="card-glow">
              <CardHeader><CardTitle>Orders Over Time</CardTitle></CardHeader>
              <CardContent>
                {orderTimeData.length === 0
                  ? <EmptyState msg="No orders yet" />
                  : <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={orderTimeData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(245 15% 18%)" />
                        <XAxis dataKey="date" stroke="hsl(220 10% 55%)" fontSize={11} />
                        <YAxis stroke="hsl(220 10% 55%)" fontSize={11} />
                        <Tooltip contentStyle={chartTooltipStyle} />
                        <Line type="monotone" dataKey="count" stroke="hsl(166 100% 42%)" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                }
              </CardContent>
            </Card>

            <Card className="card-glow">
              <CardHeader><CardTitle>Top Traded Symbols</CardTitle></CardHeader>
              <CardContent>
                {symbolData.length === 0
                  ? <EmptyState msg="No orders yet" />
                  : <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={symbolData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(245 15% 18%)" />
                        <XAxis type="number" stroke="hsl(220 10% 55%)" fontSize={11} />
                        <YAxis type="category" dataKey="name" stroke="hsl(220 10% 55%)" fontSize={11} width={70} />
                        <Tooltip contentStyle={chartTooltipStyle} />
                        <Bar dataKey="value" fill="hsl(166 100% 42%)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                }
              </CardContent>
            </Card>

            <Card className="card-glow lg:col-span-2">
              <CardHeader><CardTitle>Signal Distribution</CardTitle></CardHeader>
              <CardContent className="flex justify-center">
                {signalData.length === 0
                  ? <EmptyState msg="No signals yet — run a scan first" />
                  : <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={signalData} cx="50%" cy="50%" outerRadius={90} dataKey="value" nameKey="name"
                          label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                          {signalData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={chartTooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                }
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Orders tab ── */}
        <TabsContent value="orders">
          <Card className="card-glow">
            <CardHeader><CardTitle>All Orders ({allOrders.length})</CardTitle></CardHeader>
            <CardContent>
              {allOrders.length === 0 ? <EmptyState msg="No orders yet" /> : (
                <div className="table-striped">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Side</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Broker</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allOrders.slice(0, 100).map(o => (
                        <TableRow key={o.id}>
                          <TableCell className="text-xs">{getName(o.user_id)}</TableCell>
                          <TableCell className="font-mono font-medium">{o.symbol}</TableCell>
                          <TableCell>
                            <Badge variant={o.side === 'BUY' ? 'default' : 'destructive'}>{o.side}</Badge>
                          </TableCell>
                          <TableCell className="font-mono">{o.qty}</TableCell>
                          <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{o.broker_name || '—'}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {new Date(o.created_at).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Alerts tab ── */}
        <TabsContent value="alerts">
          <Card className="card-glow">
            <CardHeader><CardTitle>All Alerts ({allAlerts.length})</CardTitle></CardHeader>
            <CardContent>
              {allAlerts.length === 0 ? <EmptyState msg="No alerts yet" /> : (
                <div className="table-striped">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Read</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allAlerts.slice(0, 100).map(a => (
                        <TableRow key={a.id}>
                          <TableCell className="text-xs">{getName(a.user_id)}</TableCell>
                          <TableCell className="text-sm max-w-xs truncate">{a.message}</TableCell>
                          <TableCell><TypeBadge type={a.type} /></TableCell>
                          <TableCell className="font-mono text-xs">{a.read ? '✓' : '—'}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {new Date(a.created_at).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Signals tab ── */}
        <TabsContent value="signals">
          <Card className="card-glow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>All Signals ({allSignals.length})</CardTitle>
                <Button onClick={runGlobalScan} disabled={scanLoading} size="sm">
                  <Zap className="h-3.5 w-3.5 mr-1.5" />
                  {scanLoading ? 'Scanning…' : 'Scan Now'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {allSignals.length === 0
                ? <EmptyState msg="No signals yet — click 'Scan Now' or wait for the 9:15 AM daily cron" />
                : (
                  <div className="table-striped">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Symbol</TableHead>
                          <TableHead>Signal</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead>Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allSignals.slice(0, 100).map(s => (
                          <TableRow key={s.id}>
                            <TableCell className="text-xs">{getName(s.user_id)}</TableCell>
                            <TableCell className="font-mono font-medium">{s.symbol}</TableCell>
                            <TableCell>
                              <SignalBadge type={s.signal_type} />
                            </TableCell>
                            <TableCell className="font-mono">₹{s.price.toFixed(2)}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {new Date(s.created_at).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )
              }
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Build Tasks tab ── */}
        <TabsContent value="tasks">
          <Card className="card-glow">
            <CardHeader><CardTitle>Build Tracker ({buildTasks.length} tasks)</CardTitle></CardHeader>
            <CardContent>
              {buildTasks.length === 0
                ? <EmptyState msg="No build tasks yet" />
                : (
                  <div className="table-striped">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Task</TableHead>
                          <TableHead>Module</TableHead>
                          <TableHead>Priority</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Updated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {buildTasks.map(t => (
                          <TableRow key={t.id}>
                            <TableCell className="font-medium max-w-xs">
                              <div>{t.task_name}</div>
                              {t.notes && <div className="text-xs text-muted-foreground truncate">{t.notes}</div>}
                            </TableCell>
                            <TableCell className="text-sm">{t.module}</TableCell>
                            <TableCell>
                              <span className={`text-xs font-semibold uppercase ${priorityColor[t.priority] || ''}`}>
                                {t.priority}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={t.status}
                                onValueChange={(val) => updateTaskStatus(t.id, val)}
                              >
                                <SelectTrigger className="h-7 text-xs w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {['pending', 'in_progress', 'done', 'blocked'].map(s => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {new Date(t.updated_at).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )
              }
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const chartTooltipStyle = {
  backgroundColor: 'hsl(240 12% 7.5%)',
  border: '1px solid hsl(245 15% 18%)',
  fontSize: 12,
};

const EmptyState = ({ msg }: { msg: string }) => (
  <p className="text-muted-foreground text-center py-10 text-sm">{msg}</p>
);

const TypeBadge = ({ type }: { type: string }) => {
  const map: Record<string, string> = {
    info:         'bg-blue-500/20 text-blue-400',
    warning:      'bg-yellow-500/20 text-yellow-400',
    danger:       'bg-red-500/20 text-red-400',
    success:      'bg-emerald-500/20 text-emerald-400',
    signal_buy:   'bg-emerald-500/20 text-emerald-300',
    signal_sell:  'bg-red-500/20 text-red-300',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono ${map[type] || map.info}`}>
      {type}
    </span>
  );
};

const SignalBadge = ({ type }: { type: string }) => {
  const map: Record<string, string> = {
    BUY:         'bg-emerald-500/20 text-emerald-300',
    SELL:        'bg-red-500/20 text-red-300',
    STRONG_BUY:  'bg-emerald-600/30 text-emerald-200 font-bold',
    STRONG_SELL: 'bg-red-600/30 text-red-200 font-bold',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono ${map[type] || 'bg-muted text-muted-foreground'}`}>
      {type}
    </span>
  );
};

export default AdminPanel;
