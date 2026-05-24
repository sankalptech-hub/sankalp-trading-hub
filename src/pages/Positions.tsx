import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Briefcase } from 'lucide-react';

const Positions = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!user) return;
    supabase.from('positions').select('*').eq('user_id', user.id).then(({ data }) => setRows(data || []));
  }, [user]);

  const filtered = rows.filter(r => r.symbol.toLowerCase().includes(q.toLowerCase()));
  const totalValue = filtered.reduce((s, r) => s + Number(r.base_currency_value || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Briefcase className="h-7 w-7 text-primary"/>Positions</h1>
          <p className="text-muted-foreground text-sm mt-1">Open positions across all connected brokers</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Portfolio value</div>
          <div className="text-2xl font-bold font-mono">₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>All Positions · {filtered.length}</CardTitle>
          <Input placeholder="Filter symbol…" value={q} onChange={e=>setQ(e.target.value)} className="max-w-xs"/>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">No positions{q ? ' match your filter' : ' yet'}.</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Symbol</TableHead><TableHead>Exchange</TableHead><TableHead>Qty</TableHead>
                <TableHead>Avg Price</TableHead><TableHead>Currency</TableHead><TableHead className="text-right">Value (INR)</TableHead>
              </TableRow></TableHeader>
              <TableBody>{filtered.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono font-medium">{p.symbol}</TableCell>
                  <TableCell className="text-muted-foreground">{p.exchange || '—'}</TableCell>
                  <TableCell className="font-mono">{p.qty}</TableCell>
                  <TableCell className="font-mono">{Number(p.avg_price).toFixed(2)}</TableCell>
                  <TableCell>{p.currency}</TableCell>
                  <TableCell className="text-right font-mono">₹{Number(p.base_currency_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
export default Positions;