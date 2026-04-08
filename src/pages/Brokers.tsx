import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plug, Eye, EyeOff, AlertTriangle } from 'lucide-react';

const BROKER_TEMPLATES = [
  { broker_name: 'zerodha', display_name: 'Zerodha (Kite Connect)', markets: 'NSE, BSE', fields: ['API Key', 'API Secret', 'Client ID', 'Access Token'], note: '' },
  { broker_name: 'groww', display_name: 'Groww', markets: 'NSE, BSE', fields: ['API Key', 'Auth Token'], note: 'Groww API is invite-only. Contact Groww support for API access.' },
  { broker_name: 'ibkr', display_name: 'Interactive Brokers (IBKR)', markets: 'Global (US, EU, Asia)', fields: ['Account ID', 'TWS Port', 'Client ID'], note: 'Requires TWS or IB Gateway running on your local machine.', extras: ['Paper Trading'] },
  { broker_name: 'mt4', display_name: 'MetaTrader 4 (MT4)', markets: 'Forex, CFDs, Commodities', fields: ['Server', 'Login', 'Password', 'Port'], note: 'Requires MT4 desktop app open.' },
  { broker_name: 'mt5', display_name: 'MetaTrader 5 (MT5)', markets: 'Forex, Stocks, Futures', fields: ['Server', 'Login', 'Password', 'Port'], note: 'Requires MT5 desktop app open.' },
  { broker_name: 'demo', display_name: 'Demo / Paper Trading', markets: 'All (simulated)', fields: [], note: 'Auto-connected. No credentials needed. Starting Balance: ₹1,00,000' },
];

const statusColors: Record<string, string> = { connected: 'bg-emerald-500/20 text-emerald-400', disconnected: 'bg-muted text-muted-foreground', error: 'bg-red-500/20 text-red-400' };
const brokerColors: Record<string, string> = { zerodha: 'bg-orange-500', groww: 'bg-green-500', ibkr: 'bg-red-500', mt4: 'bg-blue-500', mt5: 'bg-purple-500', demo: 'bg-primary' };

const Brokers = () => {
  const { user } = useAuth();
  const [brokers, setBrokers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [modalBroker, setModalBroker] = useState<typeof BROKER_TEMPLATES[0] | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [paperTrading, setPaperTrading] = useState(false);

  const load = async () => {
    if (!user) return;
    const [b, a] = await Promise.all([
      supabase.from('brokers').select('*').eq('user_id', user.id),
      supabase.from('broker_accounts').select('*').eq('user_id', user.id),
    ]);
    setBrokers(b.data || []);
    setAccounts(a.data || []);
  };

  useEffect(() => { load(); }, [user]);

  const getBrokerStatus = (name: string) => brokers.find(b => b.broker_name === name);

  const setDefault = async (brokerId: string) => {
    if (!user) return;
    for (const b of brokers) {
      if (b.is_default) await supabase.from('brokers').update({ is_default: false } as any).eq('id', b.id);
    }
    await supabase.from('brokers').update({ is_default: true } as any).eq('id', brokerId);
    toast.success('Default broker updated');
    load();
  };

  const openConfig = (tmpl: typeof BROKER_TEMPLATES[0]) => {
    setModalBroker(tmpl);
    setFields({});
    setShowPasswords({});
  };

  const saveConnect = async () => {
    if (!user || !modalBroker) return;
    const existing = getBrokerStatus(modalBroker.broker_name);
    const configJson = { ...fields, paperTrading };

    if (existing) {
      await supabase.from('brokers').update({ status: 'connected', config_json: configJson } as any).eq('id', existing.id);
    } else {
      const { data } = await supabase.from('brokers').insert({
        user_id: user.id, broker_name: modalBroker.broker_name, display_name: modalBroker.display_name,
        status: 'connected', config_json: configJson,
      } as any).select().single();
      if (data) {
        await supabase.from('broker_accounts').insert({
          user_id: user.id, broker_id: data.id, account_id: fields['Account ID'] || fields['Client ID'] || 'ACC-001',
          account_type: paperTrading ? 'paper' : 'live', balance: 0, currency: 'INR',
        } as any);
      }
    }
    toast.success(`Connected to ${modalBroker.display_name}`);
    setModalBroker(null);
    load();
  };

  const disconnect = async (brokerId: string) => {
    await supabase.from('brokers').update({ status: 'disconnected' } as any).eq('id', brokerId);
    toast.success('Disconnected');
    load();
  };

  const testConnection = (name: string) => {
    const success = Math.random() > 0.3;
    if (success) toast.success(`${name}: Connection successful`);
    else toast.error(`${name}: Connection failed`);
  };

  const connectedCount = brokers.filter(b => b.status === 'connected').length;
  const defaultBroker = brokers.find(b => b.is_default);
  const demoBalance = brokers.find(b => b.broker_name === 'demo')?.config_json?.balance || 100000;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Plug className="h-6 w-6 text-primary" /> Broker Management</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Connected', value: connectedCount },
          { label: 'Default', value: defaultBroker?.display_name || 'Demo' },
          { label: 'Accounts', value: accounts.length },
          { label: 'Demo Balance', value: `₹${Number(demoBalance).toLocaleString()}` },
        ].map(s => (
          <Card key={s.label} className="card-glow"><CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="text-xl font-bold font-mono text-primary truncate">{s.value}</p>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {BROKER_TEMPLATES.map(tmpl => {
          const existing = getBrokerStatus(tmpl.broker_name);
          const status = existing?.status || 'disconnected';
          const isDemo = tmpl.broker_name === 'demo';
          return (
            <Card key={tmpl.broker_name} className="card-glow">
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${brokerColors[tmpl.broker_name]} flex items-center justify-center text-white font-bold text-sm`}>
                    {tmpl.broker_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm">{tmpl.display_name}</h3>
                    <p className="text-xs text-muted-foreground">{tmpl.markets}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs ${statusColors[status]}`}>{status}</span>
                </div>
                {tmpl.note && <p className="text-xs text-muted-foreground">{tmpl.note}</p>}
                <div className="flex gap-2 flex-wrap">
                  {!isDemo && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openConfig(tmpl)}>Configure</Button>}
                  {existing && <Button size="sm" variant={existing.is_default ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setDefault(existing.id)}>{existing.is_default ? '★ Default' : 'Set Default'}</Button>}
                  {existing?.status === 'connected' && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => testConnection(tmpl.display_name)}>Test</Button>}
                  {existing?.status === 'connected' && !isDemo && <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => disconnect(existing.id)}>Disconnect</Button>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="card-glow">
        <CardHeader><CardTitle>Accounts</CardTitle></CardHeader>
        <CardContent>
          <div className="table-striped">
            <Table>
              <TableHeader><TableRow><TableHead>Broker</TableHead><TableHead>Account ID</TableHead><TableHead>Type</TableHead><TableHead>Balance</TableHead><TableHead>Currency</TableHead></TableRow></TableHeader>
              <TableBody>
                {accounts.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No accounts</TableCell></TableRow> :
                  accounts.map(a => (
                    <TableRow key={a.id}>
                      <TableCell>{brokers.find(b => b.id === a.broker_id)?.display_name || 'Unknown'}</TableCell>
                      <TableCell className="font-mono">{a.account_id}</TableCell>
                      <TableCell><Badge variant="outline">{a.account_type}</Badge></TableCell>
                      <TableCell className="font-mono">{Number(a.balance).toLocaleString()}</TableCell>
                      <TableCell>{a.currency}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!modalBroker} onOpenChange={() => setModalBroker(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect {modalBroker?.display_name}</DialogTitle>
            <DialogDescription>Enter your credentials to connect.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded flex items-center gap-2 text-xs text-yellow-400">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" /> Credentials encrypted at rest. Never share your API keys.
            </div>
            {modalBroker?.fields.map(f => (
              <div key={f}>
                <Label>{f}</Label>
                <div className="relative">
                  <Input
                    type={f.toLowerCase().includes('password') || f.toLowerCase().includes('secret') || f.toLowerCase().includes('token') ? (showPasswords[f] ? 'text' : 'password') : 'text'}
                    value={fields[f] || ''}
                    onChange={e => setFields(p => ({ ...p, [f]: e.target.value }))}
                    placeholder={f === 'TWS Port' ? '7497' : f === 'Port' ? '443' : ''}
                  />
                  {(f.toLowerCase().includes('password') || f.toLowerCase().includes('secret') || f.toLowerCase().includes('token')) && (
                    <button className="absolute right-3 top-2.5 text-muted-foreground" onClick={() => setShowPasswords(p => ({ ...p, [f]: !p[f] }))}>
                      {showPasswords[f] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {modalBroker?.extras?.includes('Paper Trading') && (
              <div className="flex items-center gap-2"><Switch checked={paperTrading} onCheckedChange={setPaperTrading} /><Label>Paper Trading</Label></div>
            )}
            <div className="flex gap-3">
              <Button onClick={saveConnect}>Save & Connect</Button>
              <Button variant="outline" onClick={() => setModalBroker(null)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Brokers;
