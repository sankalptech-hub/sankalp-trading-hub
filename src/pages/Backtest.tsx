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
import { ALL_SYMBOLS, getCurrencySymbol, fetchCandleData, computeRSI } from '@/lib/marketData';

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

  // Runs a simple RSI(14) mean-reversion strategy (enter on oversold <30, exit on
  // overbought >70 or after a max hold period) against real historical daily
  // candles for the selected symbol — not simulated/random data.
  const MAX_HOLD_DAYS = 15;

  const runBacktest = async () => {
    setRunning(true);
    try {
      const cap = Number(capital);
      const days = Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000));
      const range = days <= 30 ? '3mo' : days <= 90 ? '6mo' : days <= 200 ? '1y' : days <= 400 ? '2y' : days <= 900 ? '5y' : '10y';
      const candles = await fetchCandleData(symbol, '1d', range, true);
      const inRange = candles.filter(c => c.date >= startDate && c.date <= endDate);

      if (inRange.length < 20) {
        toast.error('Not enough historical data for this symbol/date range');
        setTrades([]); setEquityCurve([]);
        setMetrics({ totalReturn: 0, maxDrawdown: 0, winRate: 0, totalTrades: 0, sharpe: 0 });
        return;
      }

      const rsi = computeRSI(inRange, 14);
      const realTrades: Trade[] = [];
      let balance = cap;
      let maxBal = cap, maxDD = 0;
      const curve: { date: string; value: number }[] = [];
      let position: { entryIdx: number; entryPrice: number; qty: number } | null = null;

      for (let i = 0; i < inRange.length; i++) {
        const r = rsi[i];
        if (!position && r !== null && r < 30) {
          const entryPrice = inRange[i].close;
          const qty = Math.max(1, Math.floor((cap * 0.1) / entryPrice));
          position = { entryIdx: i, entryPrice, qty };
        } else if (position) {
          const heldDays = i - position.entryIdx;
          const isLast = i === inRange.length - 1;
          if ((r !== null && r > 70) || heldDays >= MAX_HOLD_DAYS || isLast) {
            const exitPrice = inRange[i].close;
            const pnl = (exitPrice - position.entryPrice) * position.qty;
            balance += pnl;
            realTrades.push({
              date: inRange[position.entryIdx].date,
              exitDate: inRange[i].date,
              symbol,
              side: 'BUY',
              entryPrice: position.entryPrice,
              exitPrice,
              qty: position.qty,
              pnl,
              pnlPct: (pnl / (position.entryPrice * position.qty)) * 100,
              duration: heldDays,
            });
            position = null;
          }
        }
        if (balance > maxBal) maxBal = balance;
        const dd = ((maxBal - balance) / maxBal) * 100;
        if (dd > maxDD) maxDD = dd;
        curve.push({ date: inRange[i].date, value: Math.round(balance) });
      }

      const wins = realTrades.filter(t => t.pnl > 0).length;
      const returns = realTrades.map(t => t.pnlPct);
      const meanReturn = returns.length ? returns.reduce((s, v) => s + v, 0) / returns.length : 0;
      const stdReturn = returns.length > 1
        ? Math.sqrt(returns.reduce((s, v) => s + (v - meanReturn) ** 2, 0) / (returns.length - 1))
        : 0;
      const sharpe = stdReturn > 0 ? (meanReturn / stdReturn) * Math.sqrt(252) : 0;

      setTrades(realTrades);
      setEquityCurve(curve);
      setMetrics({
        totalReturn: ((balance - cap) / cap) * 100,
        maxDrawdown: maxDD,
        winRate: realTrades.length ? (wins / realTrades.length) * 100 : 0,
        totalTrades: realTrades.length,
        sharpe,
      });
      if (realTrades.length === 0) toast.info('Strategy generated no trades in this date range');
    } catch (err: any) {
      toast.error(err.message || 'Backtest failed');
    } finally {
      setRunning(false);
    }
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
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="h-6 w-6 text-primary" /> Backtest Engine</h1>
        <p className="text-xs text-muted-foreground mt-1">Runs a fixed RSI(14) mean-reversion strategy (buy oversold &lt;30, sell overbought &gt;70 or after {MAX_HOLD_DAYS}d) against real historical daily prices. The Strategy field below is a label for your saved-strategy dropdown only — it doesn't yet change the rules run.</p>
      </div>
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
