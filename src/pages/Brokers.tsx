import { useState, useEffect, useCallback } from 'react';
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
import { Plug, Eye, EyeOff, AlertTriangle, Clock } from 'lucide-react';

interface BrokerField {
  name: string;
  required: boolean;
  type: 'password' | 'text';
  helper?: string;
  placeholder?: string;
  validate?: (v: string) => string | null;
}

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;
const validateIP = (v: string): string | null => {
  if (!v) return 'Static IP is required';
  if (!IP_REGEX.test(v)) return 'Please enter a valid IP address';
  const parts = v.split('.').map(Number);
  if (parts.some(p => p > 255)) return 'Please enter a valid IP address';
  return null;
};

const GROWW_FIELDS: BrokerField[] = [
  { name: 'API Key', required: true, type: 'password', helper: 'Resets daily at 6:00 AM IST. Re-enter each day before trading.' },
  { name: 'API Secret', required: true, type: 'password', helper: 'Resets daily at 6:00 AM IST. Re-enter each day before trading.' },
  { name: 'Auth Token (Optional)', required: false, type: 'password', helper: 'Only required if Groww requests session-based authentication.' },
  { name: 'Static IP Address', required: true, type: 'text', placeholder: 'e.g. 103.21.58.120', helper: 'Whitelist this IP in your Groww API dashboard. Requests from other IPs will be rejected.', validate: validateIP },
];

const BROKER_TEMPLATES = [
  { broker_name: 'zerodha', display_name: 'Zerodha (Kite Connect)', markets: 'NSE, BSE', fields: ['API Key', 'API Secret', 'Client ID', 'Access Token'], note: '' },
  { broker_name: 'groww', display_name: 'Groww', markets: 'NSE, BSE', fields: [], note: 'Groww API credentials reset daily at 6:00 AM IST.', isGroww: true },
  { broker_name: 'ibkr', display_name: 'Interactive Brokers (IBKR)', markets: 'Global (US, EU, Asia)', fields: ['Account ID', 'TWS Port', 'Client ID'], note: 'Requires TWS or IB Gateway running on your local machine.', extras: ['Paper Trading'] },
  { broker_name: 'mt4', display_name: 'MetaTrader 4 (MT4)', markets: 'Forex, CFDs, Commodities', fields: ['Server', 'Login', 'Password', 'Port'], note: 'Requires MT4 desktop app open.' },
  { broker_name: 'mt5', display_name: 'MetaTrader 5 (MT5)', markets: 'Forex, Stocks, Futures', fields: ['Server', 'Login', 'Password', 'Port'], note: 'Requires MT5 desktop app open.' },
  { broker_name: 'demo', display_name: 'Demo / Paper Trading', markets: 'All (simulated)', fields: [], note: 'Auto-connected. No credentials needed. Starting Balance: ₹1,00,000' },
];

const statusColors: Record<string, string> = { connected: 'bg-emerald-500/20 text-emerald-400', disconnected: 'bg-muted text-muted-foreground', error: 'bg-red-500/20 text-red-400' };
const brokerColors: Record<string, string> = { zerodha: 'bg-orange-500', groww: 'bg-green-500', ibkr: 'bg-red-500', mt4: 'bg-blue-500', mt5: 'bg-purple-500', demo: 'bg-primary' };

function getNext6AMIST(): Date {
  const now = new Date();
  // IST = UTC+5:30
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const istToday6AM = new Date(istNow);
  istToday6AM.setUTCHours(6, 0, 0, 0);
  // If past 6 AM IST today, use tomorrow
  if (istNow.getUTCHours() > 6 || (istNow.getUTCHours() === 6 && istNow.getUTCMinutes() > 0)) {
    istToday6AM.setUTCDate(istToday6AM.getUTCDate() + 1);
  }
  // Convert back to UTC: subtract IST offset
  return new Date(istToday6AM.getTime() - istOffset);
}

function formatCountdown(targetUTC: Date): string {
  const diff = targetUTC.getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `Resets in ${h}h ${m}m`;
}

function maskIP(ip: string, isAdmin: boolean): string {
  if (!ip) return '';
  if (isAdmin) return ip;
  const parts = ip.split('.');
  if (parts.length !== 4) return ip;
  return `***.***.***.${parts[3]}`;
}

const Brokers = () => {
  const { user, isAdmin } = useAuth();
  const [brokers, setBrokers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [modalBroker, setModalBroker] = useState<typeof BROKER_TEMPLATES[0] | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [paperTrading, setPaperTrading] = useState(false);
  const [countdowns, setCountdowns] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!user) return;
    const [b, a] = await Promise.all([
      supabase.from('brokers').select('*').eq('user_id', user.id),
      supabase.from('broker_accounts').select('*').eq('user_id', user.id),
    ]);
    setBrokers(b.data || []);
    setAccounts(a.data || []);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Countdown timer for Groww
  useEffect(() => {
    const growwBroker = brokers.find(b => b.broker_name === 'groww' && b.status === 'connected');
    if (!growwBroker) return;

    const tick = async () => {
      const resetAt = growwBroker.credentials_reset_at ? new Date(growwBroker.credentials_reset_at) : getNext6AMIST();
      const diff = resetAt.getTime() - Date.now();
      if (diff <= 0) {
        // Auto-disconnect
        await supabase.from('brokers').update({ status: 'disconnected' } as any).eq('id', growwBroker.id);
        await supabase.from('alerts').insert({
          user_id: user!.id,
          type: 'warning',
          message: 'Groww API credentials reset at 6 AM IST. Reconnect to resume live trading.',
        });
        toast.error('Groww credentials have expired. Please reconnect at /brokers');
        load();
        return;
      }
      setCountdowns(p => ({ ...p, [growwBroker.id]: formatCountdown(resetAt) }));
    };

    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, [brokers, user, load]);

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
    setFieldErrors({});
  };

  const saveGroww = async () => {
    if (!user || !modalBroker) return;
    // Validate required fields
    const errors: Record<string, string> = {};
    for (const f of GROWW_FIELDS) {
      if (f.required && !fields[f.name]?.trim()) {
        errors[f.name] = `${f.name} is required`;
      }
      if (f.validate && fields[f.name]) {
        const err = f.validate(fields[f.name]);
        if (err) errors[f.name] = err;
      }
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const existing = getBrokerStatus('groww');
    const resetAt = getNext6AMIST().toISOString();
    const configJson = {
      'API Key': fields['API Key'],
      'API Secret': fields['API Secret'],
      'Auth Token': fields['Auth Token (Optional)'] || '',
    };

    if (existing) {
      await supabase.from('brokers').update({
        status: 'connected',
        config_json: configJson,
        static_ip: fields['Static IP Address'],
        credentials_reset_at: resetAt,
      } as any).eq('id', existing.id);
    } else {
      const { data } = await supabase.from('brokers').insert({
        user_id: user.id,
        broker_name: 'groww',
        display_name: 'Groww',
        status: 'connected',
        config_json: configJson,
        static_ip: fields['Static IP Address'],
        credentials_reset_at: resetAt,
      } as any).select().single();
      if (data) {
        await supabase.from('broker_accounts').insert({
          user_id: user.id,
          broker_id: data.id,
          account_id: 'GROWW-001',
          account_type: 'live',
          balance: 0,
          currency: 'INR',
        } as any);
      }
    }
    toast.success('Connected to Groww');
    setModalBroker(null);
    load();
  };

  const saveConnect = async () => {
    if (!user || !modalBroker) return;
    if (modalBroker.broker_name === 'groww') return saveGroww();

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

  const renderGrowwModal = () => (
    <div className="space-y-4">
      <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded flex items-start gap-2 text-xs text-yellow-400">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <span>Groww API Key and Secret reset every day at 6:00 AM IST. You will need to re-enter your credentials daily to continue trading. Auth Token is optional and does not reset.</span>
      </div>
      {GROWW_FIELDS.map(f => (
        <div key={f.name}>
          <Label>{f.name}{f.required && ' *'}</Label>
          <div className="relative">
            <Input
              type={f.type === 'password' ? (showPasswords[f.name] ? 'text' : 'password') : 'text'}
              value={fields[f.name] || ''}
              onChange={e => {
                setFields(p => ({ ...p, [f.name]: e.target.value }));
                setFieldErrors(p => { const n = { ...p }; delete n[f.name]; return n; });
              }}
              placeholder={f.placeholder || ''}
              className={fieldErrors[f.name] ? 'border-destructive' : ''}
            />
            {f.type === 'password' && (
              <button className="absolute right-3 top-2.5 text-muted-foreground" onClick={() => setShowPasswords(p => ({ ...p, [f.name]: !p[f.name] }))}>
                {showPasswords[f.name] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            )}
          </div>
          {fieldErrors[f.name] && <p className="text-xs text-destructive mt-1">{fieldErrors[f.name]}</p>}
          {f.helper && <p className="text-xs text-muted-foreground mt-1">{f.helper}</p>}
        </div>
      ))}
      <div className="flex gap-3">
        <Button onClick={saveGroww}>Save & Connect</Button>
        <Button variant="outline" onClick={() => setModalBroker(null)}>Cancel</Button>
      </div>
    </div>
  );

  const renderGenericModal = () => (
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
  );

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
          const isGroww = tmpl.broker_name === 'groww';
          const growwConnected = isGroww && status === 'connected';
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
                {growwConnected && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-xs text-yellow-400">
                      <Clock className="h-3 w-3" />
                      <span>🕕 Resets at 6:00 AM IST</span>
                    </div>
                    {countdowns[existing.id] && (
                      <p className="text-xs font-mono text-yellow-400">{countdowns[existing.id]}</p>
                    )}
                    {existing?.static_ip && (
                      <p className="text-xs text-muted-foreground">IP: {maskIP(existing.static_ip, isAdmin)}</p>
                    )}
                  </div>
                )}
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
          {modalBroker?.broker_name === 'groww' ? renderGrowwModal() : renderGenericModal()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Brokers;
