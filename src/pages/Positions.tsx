import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimePositions } from '@/hooks/useRealtime';
import { groww } from '@/lib/growwService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Briefcase, RefreshCw, DownloadCloud } from 'lucide-react';

const Positions = () => {
  const { user } = useAuth();
  const { positions, loading, refresh } = useRealtimePositions(user?.id);
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Pull live holdings from Groww and upsert them into the local positions ledger.
  const syncFromGroww = async () => {
    if (!user) return;
    setSyncing(true);
    const res = await groww.portfolio();
    if (res.error || !res.data?.data) {
      toast.error(`Groww sync failed: ${res.error}`);
      setSyncing(false);
      return;
    }
    const holdings = res.data.data;
    if (holdings.length === 0) { toast.info('No Groww holdings to import'); setSyncing(false); return; }

    const { data: existing } = await supabase.from('positions').select('id, symbol').eq('user_id', user.id);
    const bySymbol = new Map((existing ?? []).map(p => [p.symbol.toUpperCase(), p.id]));
    let inserted = 0, updated = 0, failed = 0;
    for (const h of holdings) {
      const sym = `${h.tradingSymbol}.NS`;
      const row = {
        user_id: user.id,
        symbol: sym,
        qty: h.quantity,
        avg_price: h.averagePrice,
        exchange: 'NSE',
        currency: 'INR',
        exchange_rate_to_inr: 1,
        base_currency_value: h.currentValue,
        updated_at: new Date().toISOString(),
      };
      const existingId = bySymbol.get(sym.toUpperCase());
      if (existingId) {
        const { error } = await supabase.from('positions').update(row).eq('id', existingId);
        if (error) failed++; else updated++;
      } else {
        const { error } = await supabase.from('positions').insert(row);
        if (error) failed++; else inserted++;
      }
    }
    setSyncing(false);
    if (failed > 0) toast.warning(`Groww sync: ${inserted} added, ${updated} updated, ${failed} failed`);
    else toast.success(`Groww sync complete: ${inserted} added, ${updated} updated`);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const filtered = positions.filter(r => r.symbol.toLowerCase().includes(q.toLowerCase()));
  const totalValue = filtered.reduce((s, r) => s + Number(r.base_currency_value || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Briefcase className="h-7 w-7 text-primary" />Positions
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Open positions across all connected brokers · live</p>
        </div>
        <div className="text-right flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={syncFromGroww} disabled={syncing} title="Sync from Groww">
            <DownloadCloud className={`h-4 w-4 ${syncing ? 'animate-bounce' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={refreshing} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <div>
            <div className="text-xs text-muted-foreground">Portfolio value</div>
            <div className="text-2xl font-bold font-mono">
              ₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>All Positions · {filtered.length}</CardTitle>
          <Input
            placeholder="Filter symbol…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center text-muted-foreground py-12">Loading positions…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              No positions{q ? ' match your filter' : ' yet'}.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Exchange</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Avg Price</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Value (INR)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono font-medium">{p.symbol}</TableCell>
                    <TableCell className="text-muted-foreground">{p.exchange || '—'}</TableCell>
                    <TableCell className="font-mono">{p.qty}</TableCell>
                    <TableCell className="font-mono">{Number(p.avg_price).toFixed(2)}</TableCell>
                    <TableCell>{p.currency}</TableCell>
                    <TableCell className="text-right font-mono">
                      ₹{Number(p.base_currency_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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

export default Positions;
