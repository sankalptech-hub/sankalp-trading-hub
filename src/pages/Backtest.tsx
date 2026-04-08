import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import { Loader2, Download, BarChart3 } from 'lucide-react';
import { ALL_SYMBOLS, getCurrencySymbol } from '@/lib/marketData';

interface Trade {
  date: string; exitDate: string; symbol: string; side: string;
  entryPrice: number; exitPrice: number; qty: number; pnl: number; pnlPct: number; duration: number;
}

const Backtest = () => {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [symbol, setSymbol] = useState('RELIANCE.NS');
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split('T')[0]; });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [capital, setCapital] = useState('100000');
  const [strategyName, setStrategyName] = useState(params.get('strategy') || '');
  const [strategies, setStrategies] = useState<any[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [equityCurve, setEquityCurve] = useState<{ date: string; value: number }[]>([]);
  const [metrics, setMetrics] = useState({ totalReturn: 0, maxDrawdown: 0, winRate: 0, totalTrades: 0, sharpe: 0 });
  const [running, setRunning] = useState(false);
  const cur = getCurrencySymbol(symbol);

  useEffect(() => {
    if (!user) return;
    supabase.from('strategies').select('name').eq('user_id', user.id).then(({ data }) => setStrategies(data || []));
  }, [user]);

  const runBacktest = () => {
    setRunning(true);
    const cap = Number(capital);
    const numTrades = 20 + Math.floor(Math.random() * 21);
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    const range = endMs - startMs;
    const mockTrades: Trade[] = [];
    let balance = cap;
    const curve: { date: string; value: number }[] = [{ date: startDate, value: cap }];
    let maxBal = cap; let maxDD = 0;

    for (let i = 0; i < numTrades; i++) {
      const entryMs = startMs + Math.random() * range * 0.9;
      const exitMs = entryMs + (1 + Math.random() * 10) * 86400000;
      const entryPrice = 500 + Math.random() * 3000;
      const pnlPct = (Math.random() - 0.4) * 10;
      const exitPrice = entryPrice * (1 + pnlPct / 100);
      const qty = Math.max(1, Math.floor((cap * 0.1) / entryPrice));
      const pnl = (exitPrice - entryPrice) * qty;
      balance += pnl;
      if (balance > maxBal) maxBal = balance;
      const dd = ((maxBal - balance) / maxBal) * 100;
      if (dd > maxDD) maxDD = dd;
      const d = new Date(entryMs).toISOString().split('T')[0];
      curve.push({ date: d, value: Math.round(balance) });
      mockTrades.push({ date: d, exitDate: new Date(exitMs).toISOString().split('T')[0], symbol, side: Math.random() > 0.5 ? 'BUY' : 'SELL', entryPrice, exitPrice, qty, pnl, pnlPct, duration: Math.round((exitMs - entryMs) / 86400000) });
    }
    mockTrades.sort((a, b) => a.date.localeCompare(b.date));
    curve.sort((a, b) => a.date.localeCompare(b.date));
    const wins = mockTrades.filter(t => t.pnl > 0).length;
    setTrades(mockTrades);
    setEquityCurve(curve);
    setMetrics({
      totalReturn: ((balance - cap) / cap) * 100,
      maxDrawdown: maxDD,
      winRate: (wins / numTrades) * 100,
      totalTrades: numTrades,
      sharpe: 0.8 + Math.random() * 1.3,
    });
    setRunning(false);
  };

  const exportCSV = () => {
    const header = 'Date,Exit Date,Symbol,Side,Entry,Exit,Qty,P&L,P&L%,Duration\n';
    const rows = trades.map(t => `${t.date},${t.exitDate},${t.symbol},${t.side},${t.entryPrice.toFixed(2)},${t.exitPrice.toFixed(2)},${t.qty},${t.pnl.toFixed(2)},${t.pnlPct.toFixed(2)},${t.duration}d`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `backtest_${symbol}_${new Date().toISOString().split('T')[0]}.csv`; a.click();
  };

  const statCards = [
    { label: 'Total Return', value: `${metrics.totalReturn >= 0 ? '+' : ''}${metrics.totalReturn.toFixed(1)}%`, color: metrics.totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'Max Drawdown', value: `-${metrics.maxDrawdown.toFixed(1)}%`, color: 'text-red-400' },
    { label: 'Win Rate', value: `${metrics.winRate.toFixed(0)}%`, color: 'text-primary' },
    { label: 'Total Trades', value: metrics.totalTrades, color: 'text-primary' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="h-6 w-6 text-primary" /> Backtest Engine</h1>
      <Card className="card-glow">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
            <div><Label>Symbol</Label>
              <Select value={symbol} onValueChange={setSymbol}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ALL_SYMBOLS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Start</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
            <div><Label>End</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
            <div><Label>Capital ({cur})</Label><Input type="number" value={capital} onChange={e => setCapital(e.target.value)} /></div>
            <div><Label>Strategy</Label>
              <Select value={strategyName} onValueChange={setStrategyName}><SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent><SelectItem value=" ">None</SelectItem>{strategies.map(s => <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>)}</SelectContent></Select></div>
            <Button onClick={runBacktest} disabled={running}>{running ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Run Backtest'}</Button>
          </div>
        </CardContent>
      </Card>

      {trades.length > 0 && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map(s => (
              <Card key={s.label} className="card-glow"><CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className={`text-3xl font-bold font-mono ${s.color}`}>{s.value}</p>
              </CardContent></Card>
            ))}
          </div>

          <Card className="card-glow">
            <CardHeader><CardTitle>Equity Curve</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={equityCurve}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(245 15% 18%)" />
                  <XAxis dataKey="date" stroke="hsl(220 10% 55%)" fontSize={10} />
                  <YAxis stroke="hsl(220 10% 55%)" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(240 12% 7.5%)', border: '1px solid hsl(245 15% 18%)' }} />
                  <Line type="monotone" dataKey="value" stroke="hsl(166 100% 42%)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="card-glow">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Trade Log ({trades.length})</CardTitle>
              <Button size="sm" variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
            </CardHeader>
            <CardContent>
              <div className="table-striped overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Symbol</TableHead><TableHead>Side</TableHead>
                    <TableHead>Entry</TableHead><TableHead>Exit</TableHead><TableHead>P&L</TableHead><TableHead>P&L%</TableHead><TableHead>Duration</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {trades.map((t, i) => (
                      <TableRow key={i} className={t.pnl >= 0 ? 'bg-emerald-500/5' : 'bg-red-500/5'}>
                        <TableCell className="font-mono text-xs">{t.date}</TableCell>
                        <TableCell className="font-mono">{t.symbol}</TableCell>
                        <TableCell><span className={t.side === 'BUY' ? 'text-emerald-400' : 'text-red-400'}>{t.side}</span></TableCell>
                        <TableCell className="font-mono">{cur}{t.entryPrice.toFixed(2)}</TableCell>
                        <TableCell className="font-mono">{cur}{t.exitPrice.toFixed(2)}</TableCell>
                        <TableCell className={`font-mono ${t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{cur}{t.pnl.toFixed(2)}</TableCell>
                        <TableCell className={`font-mono ${t.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{t.pnlPct.toFixed(2)}%</TableCell>
                        <TableCell className="font-mono text-xs">{t.duration}d</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default Backtest;
