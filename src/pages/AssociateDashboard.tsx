import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Users, Copy, Award, Wallet, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

const AssociateDashboard = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [network, setNetwork] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [levels, setLevels] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: p } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
      setProfile(p);
      const { data: n } = await supabase.from('associate_network').select('*').eq('user_id', user.id);
      setNetwork(n || []);
      const { data: pay } = await supabase.from('associate_payouts').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      setPayouts(pay || []);
      const { data: l } = await supabase.from('mlm_levels').select('*').order('level');
      setLevels(l || []);
    })();
  }, [user]);

  const totalEarned = payouts.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0);
  const pendingAmt = payouts.filter(p => p.status === 'pending').reduce((s, p) => s + Number(p.amount), 0);

  const byLevel = levels.map(l => ({ level: `T${l.level}`, count: network.filter(n => n.level === l.level).length, commission: Number(l.commission_pct) }));
  const trend = payouts.slice(0, 12).reverse().map((p, i) => ({ t: p.period || `#${i+1}`, amount: Number(p.amount) }));

  const referralUrl = profile?.referral_code ? `${window.location.origin}/?ref=${profile.referral_code}` : '';
  const copy = () => { navigator.clipboard.writeText(referralUrl); toast.success('Referral link copied'); };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Award className="h-7 w-7 text-primary"/>Associate Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Your 5-tier downline, referrals and payouts</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardHeader><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3"/>Network Size</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{network.length}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Wallet className="h-3 w-3"/>Total Earned</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-emerald-500">₹{totalEarned.toLocaleString('en-IN')}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3"/>Pending</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">₹{pendingAmt.toLocaleString('en-IN')}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Award className="h-3 w-3"/>Rank</CardTitle></CardHeader>
          <CardContent><Badge className="text-base">{profile?.rank || 'Bronze'}</Badge></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Your Referral Link</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input readOnly value={referralUrl || 'Generating…'}/>
          <Button onClick={copy} disabled={!referralUrl}><Copy className="h-4 w-4 mr-1"/>Copy</Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Network by Tier</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Level</TableHead><TableHead>Members</TableHead><TableHead className="text-right">Commission</TableHead></TableRow></TableHeader>
              <TableBody>{byLevel.map(b => (
                <TableRow key={b.level}><TableCell><Badge variant="outline">{b.level}</Badge></TableCell>
                  <TableCell className="font-mono">{b.count}</TableCell>
                  <TableCell className="text-right font-mono text-primary">{b.commission}%</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Earnings Trend</CardTitle></CardHeader>
          <CardContent>
            {trend.length === 0 ? <div className="text-center text-muted-foreground py-12">No payouts yet</div> : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trend}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3"/>
                  <XAxis dataKey="t" stroke="hsl(var(--muted-foreground))" fontSize={11}/>
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11}/>
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}/>
                  <Line type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={2}/>
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Payout History · {payouts.length}</CardTitle></CardHeader>
        <CardContent>
          {payouts.length === 0 ? <div className="text-center text-muted-foreground py-8">No payouts yet</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>{payouts.map(p => (
                <TableRow key={p.id}>
                  <TableCell>{p.period}</TableCell>
                  <TableCell><Badge variant={p.status==='paid'?'default':'secondary'}>{p.status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right font-mono">₹{Number(p.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
export default AssociateDashboard;