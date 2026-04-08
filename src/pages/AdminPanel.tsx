import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'sonner';
import { Users, ShoppingCart, TrendingUp, Shield } from 'lucide-react';

const COLORS = ['hsl(166 100% 42%)', 'hsl(348 90% 65%)', 'hsl(30 100% 64%)', 'hsl(220 70% 55%)', 'hsl(280 60% 55%)'];

interface ProfileWithRole {
  user_id: string;
  display_name: string | null;
  created_at: string;
  role: string;
  role_id: string;
}

const AdminPanel = () => {
  const { isAdmin, user, loading } = useAuth();
  const [usersData, setUsersData] = useState<ProfileWithRole[]>([]);
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [allPositions, setAllPositions] = useState<any[]>([]);
  const [allAlerts, setAllAlerts] = useState<any[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});

  const loadData = async () => {
    if (!isAdmin) return;
    try {
      // Load profiles and roles separately, join client-side
      const [profilesRes, rolesRes, ordersRes, positionsRes, alertsRes] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('user_roles').select('*'),
        supabase.from('orders').select('*').order('created_at', { ascending: false }),
        supabase.from('positions').select('*'),
        supabase.from('alerts').select('*').order('created_at', { ascending: false }),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;
      if (ordersRes.error) throw ordersRes.error;
      if (positionsRes.error) throw positionsRes.error;
      if (alertsRes.error) throw alertsRes.error;

      const profiles = profilesRes.data || [];
      const roles = rolesRes.data || [];

      // Build profile map for email lookups
      const pMap: Record<string, string> = {};
      profiles.forEach(p => { pMap[p.user_id] = p.display_name || p.user_id.slice(0, 8) + '...'; });
      setProfileMap(pMap);

      // Join profiles with roles
      const joined: ProfileWithRole[] = profiles.map(p => {
        const role = roles.find(r => r.user_id === p.user_id);
        return {
          user_id: p.user_id,
          display_name: p.display_name,
          created_at: p.created_at,
          role: role?.role || 'user',
          role_id: role?.id || '',
        };
      });
      setUsersData(joined);
      setAllOrders(ordersRes.data || []);
      setAllPositions(positionsRes.data || []);
      setAllAlerts(alertsRes.data || []);
    } catch (err: any) {
      toast.error('Failed to load admin data: ' + err.message);
    }
  };

  useEffect(() => { loadData(); }, [isAdmin]);

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground font-mono">Loading...</div>;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const getUserEmail = (userId: string) => profileMap[userId] || userId.slice(0, 8) + '...';

  const toggleRole = async (userId: string, currentRole: string, roleId: string) => {
    if (userId === user?.id) {
      toast.error("You cannot change your own role");
      return;
    }
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
      const { error } = await supabase.rpc('update_user_role', { _user_id: userId, _new_role: newRole });
      if (error) throw error;
      toast.success(`Role updated to ${newRole}`);
      loadData();
    } catch (err: any) {
      toast.error('Failed to update role: ' + err.message);
    }
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
    { label: 'Total Users', value: usersData.length, icon: Users },
    { label: 'Total Orders', value: allOrders.length, icon: ShoppingCart },
    { label: 'Total Positions', value: allPositions.length, icon: TrendingUp },
    { label: 'Admin Users', value: usersData.filter(u => u.role === 'admin').length, icon: Shield },
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
                    {usersData.map(u => (
                      <TableRow key={u.user_id}>
                        <TableCell className="font-medium">{u.display_name || 'N/A'}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{u.user_id.slice(0, 12)}...</TableCell>
                        <TableCell>
                          <Badge variant={u.role === 'admin' ? 'default' : 'outline'}>{u.role}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={u.user_id === user?.id}
                            onClick={() => toggleRole(u.user_id, u.role, u.role_id)}
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

        <TabsContent value="analytics">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="card-glow">
              <CardHeader><CardTitle>Orders Over Time (All Users)</CardTitle></CardHeader>
              <CardContent>
                {orderTimeData.length === 0 ? (
                  <p className="text-muted-foreground text-center py-12">No orders yet across any users.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={orderTimeData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(245 15% 18%)" />
                      <XAxis dataKey="date" stroke="hsl(220 10% 55%)" fontSize={12} />
                      <YAxis stroke="hsl(220 10% 55%)" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(240 12% 7.5%)', border: '1px solid hsl(245 15% 18%)' }} />
                      <Line type="monotone" dataKey="count" stroke="hsl(166 100% 42%)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="card-glow">
              <CardHeader><CardTitle>Orders by User</CardTitle></CardHeader>
              <CardContent>
                {userOrderData.length === 0 ? (
                  <p className="text-muted-foreground text-center py-12">No orders yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={userOrderData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(245 15% 18%)" />
                      <XAxis dataKey="name" stroke="hsl(220 10% 55%)" fontSize={12} />
                      <YAxis stroke="hsl(220 10% 55%)" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(240 12% 7.5%)', border: '1px solid hsl(245 15% 18%)' }} />
                      <Bar dataKey="count" fill="hsl(166 100% 42%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="card-glow lg:col-span-2">
              <CardHeader><CardTitle>Portfolio Distribution (All Users)</CardTitle></CardHeader>
              <CardContent className="flex justify-center">
                {symbolData.length === 0 ? (
                  <p className="text-muted-foreground text-center py-12">No positions yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={symbolData} cx="50%" cy="50%" outerRadius={100} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}`}>
                        {symbolData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(240 12% 7.5%)', border: '1px solid hsl(245 15% 18%)' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="orders">
          <Card className="card-glow">
            <CardHeader><CardTitle>All Orders ({allOrders.length})</CardTitle></CardHeader>
            <CardContent>
              {allOrders.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No orders across any users.</p>
              ) : (
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
                      {allOrders.slice(0, 100).map(o => (
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts">
          <Card className="card-glow">
            <CardHeader><CardTitle>All Alerts ({allAlerts.length})</CardTitle></CardHeader>
            <CardContent>
              {allAlerts.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No alerts across any users.</p>
              ) : (
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
                          <TableCell className="text-xs">{getUserEmail(a.user_id)}</TableCell>
                          <TableCell>{a.message}</TableCell>
                          <TableCell><AlertTypeBadge type={a.type} /></TableCell>
                          <TableCell className="font-mono">{a.read ? '✓' : '—'}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
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
