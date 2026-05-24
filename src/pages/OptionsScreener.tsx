import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Filter, RotateCcw, ArrowUp, ArrowDown } from 'lucide-react';

type Row = { symbol: string; type: 'CALL' | 'PUT'; strike: number; dte: number; iv: number; delta: number; volume: number; open_interest: number; last: number };

const SEED: Row[] = (() => {
  const sym = ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'INFY', 'HDFCBANK'];
  const out: Row[] = [];
  for (const s of sym) {
    const base = 100 + Math.random() * 1000;
    for (let i = -4; i <= 4; i++) {
      const strike = Math.round((base + i * 50) / 5) * 5;
      for (const type of ['CALL', 'PUT'] as const) {
        out.push({
          symbol: s, type, strike, dte: 7 + Math.floor(Math.random() * 30),
          iv: 15 + Math.random() * 50, delta: type === 'CALL' ? Math.random() : -Math.random(),
          volume: Math.floor(Math.random() * 50000), open_interest: Math.floor(Math.random() * 200000),
          last: Math.max(0.5, Math.random() * 50),
        });
      }
    }
  }
  return out;
})();

const SORTS = ['volume', 'open_interest', 'iv', 'delta', 'strike', 'dte', 'last'] as const;
type SortKey = typeof SORTS[number];

const OptionsScreener = () => {
  const [f, setF] = useState({ symbol: '', type: 'all', min_strike: '', max_strike: '', min_iv: '', max_iv: '', min_dte: '', max_dte: '' });
  const [sortBy, setSortBy] = useState<SortKey>('volume');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const rows = useMemo(() => {
    let r = SEED.filter(x =>
      (!f.symbol || x.symbol.includes(f.symbol.toUpperCase())) &&
      (f.type === 'all' || x.type === f.type) &&
      (!f.min_strike || x.strike >= Number(f.min_strike)) &&
      (!f.max_strike || x.strike <= Number(f.max_strike)) &&
      (!f.min_iv || x.iv >= Number(f.min_iv)) &&
      (!f.max_iv || x.iv <= Number(f.max_iv)) &&
      (!f.min_dte || x.dte >= Number(f.min_dte)) &&
      (!f.max_dte || x.dte <= Number(f.max_dte))
    );
    r = [...r].sort((a, b) => (dir === 'asc' ? a[sortBy] - b[sortBy] : b[sortBy] - a[sortBy]));
    return r.slice(0, 60);
  }, [f, sortBy, dir]);

  const reset = () => setF({ symbol: '', type: 'all', min_strike: '', max_strike: '', min_iv: '', max_iv: '', min_dte: '', max_dte: '' });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Filter className="h-7 w-7 text-primary"/>Options Screener</h1>
        <p className="text-muted-foreground text-sm mt-1">Scan options chain — filter by IV, OI, delta, volume, expiry</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Filters</CardTitle>
          <Button size="sm" variant="outline" onClick={reset}><RotateCcw className="h-3 w-3 mr-1"/>Reset</Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Input placeholder="Symbol" value={f.symbol} onChange={e=>setF({...f, symbol:e.target.value})}/>
          <Select value={f.type} onValueChange={v=>setF({...f, type:v})}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="CALL">Calls</SelectItem><SelectItem value="PUT">Puts</SelectItem></SelectContent>
          </Select>
          <Input placeholder="Min strike" type="number" value={f.min_strike} onChange={e=>setF({...f, min_strike:e.target.value})}/>
          <Input placeholder="Max strike" type="number" value={f.max_strike} onChange={e=>setF({...f, max_strike:e.target.value})}/>
          <Input placeholder="Min IV" type="number" value={f.min_iv} onChange={e=>setF({...f, min_iv:e.target.value})}/>
          <Input placeholder="Max IV" type="number" value={f.max_iv} onChange={e=>setF({...f, max_iv:e.target.value})}/>
          <Input placeholder="Min DTE" type="number" value={f.min_dte} onChange={e=>setF({...f, min_dte:e.target.value})}/>
          <Input placeholder="Max DTE" type="number" value={f.max_dte} onChange={e=>setF({...f, max_dte:e.target.value})}/>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Results · {rows.length}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Symbol</TableHead><TableHead>Type</TableHead>
              {SORTS.map(k => (
                <TableHead key={k} className="cursor-pointer select-none" onClick={()=>{ if (sortBy===k) setDir(d=>d==='asc'?'desc':'asc'); else { setSortBy(k); setDir('desc'); } }}>
                  <span className="inline-flex items-center gap-1">{k.replace('_',' ')}{sortBy===k && (dir==='asc'?<ArrowUp className="h-3 w-3"/>:<ArrowDown className="h-3 w-3"/>)}</span>
                </TableHead>
              ))}
            </TableRow></TableHeader>
            <TableBody>{rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-mono font-medium">{r.symbol}</TableCell>
                <TableCell><Badge variant={r.type==='CALL'?'default':'secondary'}>{r.type}</Badge></TableCell>
                <TableCell className="font-mono">{r.volume.toLocaleString()}</TableCell>
                <TableCell className="font-mono">{r.open_interest.toLocaleString()}</TableCell>
                <TableCell className="font-mono">{r.iv.toFixed(1)}%</TableCell>
                <TableCell className="font-mono">{r.delta.toFixed(3)}</TableCell>
                <TableCell className="font-mono">{r.strike}</TableCell>
                <TableCell className="font-mono">{r.dte}d</TableCell>
                <TableCell className="font-mono">{r.last.toFixed(2)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
export default OptionsScreener;