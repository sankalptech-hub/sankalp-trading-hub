import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'sonner';
import { Users, ShoppingCart, TrendingUp, Shield } from 'lucide-react';

const COLORS = ['hsl(166 100% 42%)', 'hsl(348 90% 65%)', 'hsl(30 100% 64%)', 'hsl(220 70% 55%)', 'hsl(280 60% 55%)'];

const AdminPanel = () => {
  const { isAdmin, loading } = useAuth();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [allPositions, setAllPositions] = useState<any[]>([]);
  const [allSignals, setAllSignals] = useState<any[]>([]);
  const [allAlerts, setAllAlerts] = useState<any[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    const load = async () => {
      try {
        const [p, r, o, pos, s, a] = await Promise.all([
          supabase.from('profiles').select('*'),
          supabase.from('user_roles').select('*'),
          supabase.from('orders').select('*').order('created_at', { ascending: false }),
          supabase.from('positions').select('*'),
          supabase.from('signals').select('*').order('created_at', { ascending: false }),
          supabase.from('alerts').select('*').order('created_at', { ascending: false }),
        ]);
        if (p.error) throw p.error;
        setProfiles(p.data || []);
        setRoles(r.data || []);
        setAllOrders(o.data || []);
        setAllPositions(pos.data || []);
        setAllSignals(s.data || []);
        setAllAlerts(a.data || []);
      } catch (err: any) {
        toast.error('Failed to load admin data: ' + err.message);
      }
    };
    load();
  }, [isAdmin]);

  if (loading) return <div className="text-muted-foreground">Loading...</div>;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const getUserEmail = (userId: string) => {
    const profile = profiles.find(p => p.user_id === userId);
    return profile?.display_name || userId.slice(0, 8) + '...';
  };

  const getUserRole = (userId: string) => {
    const role = roles.find(r => r.user_id === userId);
    return role?.role || 'user';
  };

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    // Update existing role
    const existingRole = roles.find(r => r.user_id === userId);
    if (existingRole) {
      const { error } = await supabase.from('user_roles').update({ role: newRole } as any).eq('id', existingRole.id);
      if (error) { toast.error(error.message); return; }
    }
    toast.success(`Role updated to ${newRole}`);
    // Refresh roles
    const { data } = await supabase.from('user_roles').select('*');
    setRoles(data || []);
  };

  // Cross-user analytics
  const ordersByDay: Record<string, number> = {};
  allOrders.forEach(o => {
    const day = new Date(o.created_at).toLocaleDateString();
    ordersByDay[day] = (ordersByDay[day] || 0) + 1;
  });
  const orderTimeData = Object.entries(ordersByDay).map(([date, count]) => ({ date, count }));

  const ordersByUser: Record<string, number> = {};
  allOrders.forEach(o => {
    const name = getUserEmail(o.user_id);
    ordersByUser[name] = (ordersByUser[name] || 0) + 1;
  });
  const userOrderData = Object.entries(ordersByUser).map(([name, count]) => ({ name, count }));

  const symbolMap: Record<string, number> = {};
  allPositions.forEach(p => {
    symbolMap[p.symbol] = (symbolMap[p.symbol] || 0) + Math.abs(p.qty);
  });
  const symbolData = Object.entries(symbolMap).map(([name, value]) => ({ name, value }));

  const stats = [
    { label: 'Total Users', value: profiles.length, icon: Users },
    { label: 'Total Orders', value: allOrders.length, icon: ShoppingCart },
    { label: 'Total Positions', value: allPositions.length, icon: TrendingUp },
    { label: 'Admin Users', value: roles.filter(r => r.role === 'admin').length, icon: Shield },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin Panel</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <Card key={s.label} className="card-glow">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-3xl font-bold font-mono text-primary">{s.value}</p>
                </div>
                <s.icon className="h-8 w-8 text-primary opacity-50" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">Users & Roles</TabsTrigger>
          <TabsTrigger value="analytics">Cross-User Analytics</TabsTrigger>
          <TabsTrigger value="orders">All Orders</TabsTrigger>
          <TabsTrigger value="alerts">All Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card className="card-glow">
            <CardHeader><CardTitle>User Management</CardTitle></CardHeader>
            <CardContent>
              <div className="table-striped">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Display Name</TableHead>
                      <TableHead>User ID</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profiles.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.display_name || 'N/A'}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{p.user_id.slice(0, 12)}...</TableCell>
                        <TableCell>
                          <Badge variant={getUserRole(p.user_id) === 'admin' ? 'default' : 'outline'}>
                            {getUserRole(p.user_id)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{new Date(p.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleRole(p.user_id, getUserRole(p.user_id))}
                          >
                            {getUserRole(p.user_id) === 'admin' ? 'Demote' : 'Promote'}
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

        <TabsContent value="analytics">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="card-glow">
              <CardHeader><CardTitle>Orders Over Time (All Users)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={orderTimeData}>
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
              <CardHeader><CardTitle>Orders by User</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={userOrderData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(245 15% 18%)" />
                    <XAxis dataKey="name" stroke="hsl(220 10% 55%)" fontSize={12} />
                    <YAxis stroke="hsl(220 10% 55%)" fontSize={12} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(240 12% 7.5%)', border: '1px solid hsl(245 15% 18%)' }} />
                    <Bar dataKey="count" fill="hsl(166 100% 42%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="card-glow lg:col-span-2">
              <CardHeader><CardTitle>Portfolio Distribution (All Users)</CardTitle></CardHeader>
              <CardContent className="flex justify-center">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={symbolData} cx="50%" cy="50%" outerRadius={100} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}`}>
                      {symbolData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(240 12% 7.5%)', border: '1px solid hsl(245 15% 18%)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="orders">
          <Card className="card-glow">
            <CardHeader><CardTitle>All Orders</CardTitle></CardHeader>
            <CardContent>
              <div className="table-striped">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allOrders.slice(0, 50).map(o => (
                      <TableRow key={o.id}>
                        <TableCell className="text-xs">{getUserEmail(o.user_id)}</TableCell>
                        <TableCell className="font-mono">{o.symbol}</TableCell>
                        <TableCell><Badge variant={o.side === 'BUY' ? 'default' : 'destructive'}>{o.side}</Badge></TableCell>
                        <TableCell className="font-mono">{o.qty}</TableCell>
                        <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts">
          <Card className="card-glow">
            <CardHeader><CardTitle>All Alerts</CardTitle></CardHeader>
            <CardContent>
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
                    {allAlerts.slice(0, 50).map(a => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs">{getUserEmail(a.user_id)}</TableCell>
                        <TableCell>{a.message}</TableCell>
                        <TableCell><AlertTypeBadge type={a.type} /></TableCell>
                        <TableCell>{a.read ? '✓' : '—'}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</TableCell>
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

const AlertTypeBadge = ({ type }: { type: string }) => {
  const colors: Record<string, string> = {
    info: 'bg-blue-500/20 text-blue-400',
    warning: 'bg-yellow-500/20 text-yellow-400',
    danger: 'bg-red-500/20 text-red-400',
    success: 'bg-emerald-500/20 text-emerald-400',
  };
  return <span className={`px-2 py-0.5 rounded text-xs ${colors[type] || colors.info}`}>{type}</span>;
};

export default AdminPanel;
