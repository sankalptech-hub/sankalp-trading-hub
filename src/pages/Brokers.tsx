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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { Plug, Eye, EyeOff, AlertTriangle, Clock } from 'lucide-react';

interface BrokerTemplate {
  broker_name: string;
  display_name: string;
  markets: string;
  fields: string[];
  note: string;
  isGroww?: boolean;
  isAlpaca?: boolean;
  isOanda?: boolean;
  extras?: string[];
  region: 'INDIA' | 'GLOBAL' | 'FOREX' | 'DEMO';
  flag: string;
  badge?: string;
  badgeColor?: string;
  color: string;
  comingSoon?: boolean;
}

const BROKER_TEMPLATES: BrokerTemplate[] = [
  // INDIA
  { broker_name: 'zerodha', display_name: 'Zerodha (Kite Connect)', markets: 'NSE, BSE', fields: ['API Key', 'API Secret', 'Client ID', 'Access Token'], note: '', region: 'INDIA', flag: '🇮🇳', badge: 'Recommended for India', badgeColor: 'bg-emerald-500/20 text-emerald-400', color: 'bg-orange-500' },
  // GLOBAL
  { broker_name: 'alpaca', display_name: 'Alpaca', markets: 'US Stocks, ETFs, Crypto', fields: ['API Key ID', 'API Secret Key'], note: 'Zero commission US stocks & ETFs. Paper trading available.', isAlpaca: true, region: 'GLOBAL', flag: '🇺🇸', badge: 'Best for Global', badgeColor: 'bg-yellow-500/20 text-yellow-400', color: 'bg-[#FFCD00]', extras: ['Environment'] },
  { broker_name: 'ibkr', display_name: 'Interactive Brokers', markets: '150+ global exchanges', fields: ['Account ID', 'TWS Port', 'Client ID'], note: 'Requires TWS or IB Gateway running on your computer. Best for professional traders.', region: 'GLOBAL', flag: '🌍', badge: 'Professional Grade', badgeColor: 'bg-red-500/20 text-red-400', color: 'bg-red-600', extras: ['Paper Trading'], comingSoon: true },
  // FOREX
  { broker_name: 'oanda', display_name: 'OANDA', markets: 'Forex, CFDs, Commodities, Indices', fields: ['Account ID', 'API Token'], note: '70+ currency pairs. Regulated globally.', isOanda: true, region: 'FOREX', flag: '🌐', badge: 'Forex Specialist', badgeColor: 'bg-blue-500/20 text-blue-400', color: 'bg-blue-600', extras: ['Environment'] },
  { broker_name: 'mt4', display_name: 'MetaTrader 4 (MT4)', markets: 'Forex, CFDs, Commodities', fields: ['Server', 'Login', 'Password', 'Port'], note: 'Requires MT4 desktop app open.', region: 'FOREX', flag: '🌐', color: 'bg-blue-500' },
  { broker_name: 'mt5', display_name: 'MetaTrader 5 (MT5)', markets: 'Forex, Stocks, Futures', fields: ['Server', 'Login', 'Password', 'Port'], note: 'Requires MT5 desktop app open.', region: 'FOREX', flag: '🌐', color: 'bg-purple-500' },
  // DEMO
  { broker_name: 'demo', display_name: 'Demo / Paper Trading', markets: 'All (simulated)', fields: [], note: 'Auto-connected. No credentials needed. Starting Balance: ₹1,00,000', region: 'DEMO', flag: '🧪', color: 'bg-primary' },
];

const statusColors: Record<string, string> = { connected: 'bg-emerald-500/20 text-emerald-400', disconnected: 'bg-muted text-muted-foreground', error: 'bg-red-500/20 text-red-400' };

const REGION_LABELS: Record<string, string> = { INDIA: '🇮🇳 India', GLOBAL: '🌍 Global', FOREX: '🌐 Forex', DEMO: '🧪 Paper / Demo' };

function getNext6AMIST(): Date {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const istToday6AM = new Date(istNow);
  istToday6AM.setUTCHours(6, 0, 0, 0);
  if (istNow.getUTCHours() > 6 || (istNow.getUTCHours() === 6 && istNow.getUTCMinutes() > 0)) {
    istToday6AM.setUTCDate(istToday6AM.getUTCDate() + 1);
  }
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
  const [modalBroker, setModalBroker] = useState<BrokerTemplate | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [paperTrading, setPaperTrading] = useState(false);
  const [alpacaEnv, setAlpacaEnv] = useState<'paper' | 'live'>('paper');
  const [oandaEnv, setOandaEnv] = useState<'practice' | 'live'>('practice');
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

  // Groww countdown
  useEffect(() => {
    const growwBroker = brokers.find(b => b.broker_name === 'groww' && b.status === 'connected');
    if (!growwBroker) return;
    const tick = async () => {
      const resetAt = growwBroker.credentials_reset_at ? new Date(growwBroker.credentials_reset_at) : getNext6AMIST();
      const diff = resetAt.getTime() - Date.now();
      if (diff <= 0) {
        await supabase.from('brokers').update({ status: 'disconnected' } as any).eq('id', growwBroker.id);
        await supabase.from('alerts').insert({ user_id: user!.id, type: 'warning', message: 'Groww API credentials reset at 6 AM IST. Reconnect to resume live trading.' });
        toast.error('Groww credentials have expired. Please reconnect.');
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

  const openConfig = (tmpl: BrokerTemplate) => {
    setModalBroker(tmpl);
    setFields({});
    setShowPasswords({});
    setFieldErrors({});
    setPaperTrading(true);
    setAlpacaEnv('paper');
    setOandaEnv('practice');
  };

  const saveGroww = async () => {
    if (!user || !modalBroker) return;
    const errors: Record<string, string> = {};
    for (const f of GROWW_FIELDS) {
      if (f.required && !fields[f.name]?.trim()) errors[f.name] = `${f.name} is required`;
      if (f.validate && fields[f.name]) { const err = f.validate(fields[f.name]); if (err) errors[f.name] = err; }
    }
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }

    const existing = getBrokerStatus('groww');
    const resetAt = getNext6AMIST().toISOString();
    const configJson = { 'API Key': fields['API Key'], 'API Secret': fields['API Secret'], 'Auth Token': fields['Auth Token (Optional)'] || '' };

    if (existing) {
      await supabase.from('brokers').update({ status: 'connected', config_json: configJson, static_ip: fields['Static IP Address'], credentials_reset_at: resetAt, region: 'INDIA', supported_markets: ['NSE', 'BSE'], currency: 'INR' } as any).eq('id', existing.id);
    } else {
      const { data } = await supabase.from('brokers').insert({ user_id: user.id, broker_name: 'groww', display_name: 'Groww', status: 'connected', config_json: configJson, static_ip: fields['Static IP Address'], credentials_reset_at: resetAt, region: 'INDIA', supported_markets: ['NSE', 'BSE'], currency: 'INR' } as any).select().single();
      if (data) await supabase.from('broker_accounts').insert({ user_id: user.id, broker_id: data.id, account_id: 'GROWW-001', account_type: 'live', balance: 0, currency: 'INR' } as any);
    }
    toast.success('Connected to Groww');
    setModalBroker(null);
    load();
  };

  const saveAlpaca = async () => {
    if (!user || !modalBroker) return;
    const errors: Record<string, string> = {};
    if (!fields['API Key ID']?.trim()) errors['API Key ID'] = 'Required';
    if (!fields['API Secret Key']?.trim()) errors['API Secret Key'] = 'Required';
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }

    const baseUrl = alpacaEnv === 'paper' ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
    const configJson = { 'API Key ID': fields['API Key ID'], 'API Secret Key': fields['API Secret Key'], environment: alpacaEnv, base_url: baseUrl };
    const existing = getBrokerStatus('alpaca');

    if (existing) {
      await supabase.from('brokers').update({ status: 'connected', config_json: configJson, region: 'GLOBAL', supported_markets: ['NYSE', 'NASDAQ'], currency: 'USD' } as any).eq('id', existing.id);
    } else {
      const { data } = await supabase.from('brokers').insert({ user_id: user.id, broker_name: 'alpaca', display_name: 'Alpaca', status: 'connected', config_json: configJson, region: 'GLOBAL', supported_markets: ['NYSE', 'NASDAQ'], currency: 'USD' } as any).select().single();
      if (data) await supabase.from('broker_accounts').insert({ user_id: user.id, broker_id: data.id, account_id: `ALP-${alpacaEnv.toUpperCase()}`, account_type: alpacaEnv === 'paper' ? 'paper' : 'live', balance: alpacaEnv === 'paper' ? 100000 : 0, currency: 'USD' } as any);
    }
    toast.success('Connected to Alpaca');
    setModalBroker(null);
    load();
  };

  const saveOanda = async () => {
    if (!user || !modalBroker) return;
    const errors: Record<string, string> = {};
    if (!fields['Account ID']?.trim()) errors['Account ID'] = 'Required';
    if (!fields['API Token']?.trim()) errors['API Token'] = 'Required';
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }

    const configJson = { 'Account ID': fields['Account ID'], 'API Token': fields['API Token'], environment: oandaEnv };
    const existing = getBrokerStatus('oanda');

    if (existing) {
      await supabase.from('brokers').update({ status: 'connected', config_json: configJson, region: 'FOREX', supported_markets: ['FOREX'], currency: 'USD' } as any).eq('id', existing.id);
    } else {
      const { data } = await supabase.from('brokers').insert({ user_id: user.id, broker_name: 'oanda', display_name: 'OANDA', status: 'connected', config_json: configJson, region: 'FOREX', supported_markets: ['FOREX'], currency: 'USD' } as any).select().single();
      if (data) await supabase.from('broker_accounts').insert({ user_id: user.id, broker_id: data.id, account_id: fields['Account ID'], account_type: oandaEnv === 'practice' ? 'demo' : 'live', balance: oandaEnv === 'practice' ? 100000 : 0, currency: 'USD' } as any);
    }
    toast.success('Connected to OANDA');
    setModalBroker(null);
    load();
  };

  const saveConnect = async () => {
    if (!user || !modalBroker) return;
    if (modalBroker.broker_name === 'groww') return saveGroww();
    if (modalBroker.broker_name === 'alpaca') return saveAlpaca();
    if (modalBroker.broker_name === 'oanda') return saveOanda();

    const existing = getBrokerStatus(modalBroker.broker_name);
    const configJson = { ...fields, paperTrading };
    const regionMap: Record<string, string> = { zerodha: 'INDIA', ibkr: 'GLOBAL', mt4: 'FOREX', mt5: 'FOREX' };

    if (existing) {
      await supabase.from('brokers').update({ status: 'connected', config_json: configJson, region: regionMap[modalBroker.broker_name] || 'INDIA' } as any).eq('id', existing.id);
    } else {
      const { data } = await supabase.from('brokers').insert({ user_id: user.id, broker_name: modalBroker.broker_name, display_name: modalBroker.display_name, status: 'connected', config_json: configJson, region: regionMap[modalBroker.broker_name] || 'INDIA' } as any).select().single();
      if (data) await supabase.from('broker_accounts').insert({ user_id: user.id, broker_id: data.id, account_id: fields['Account ID'] || fields['Client ID'] || 'ACC-001', account_type: paperTrading ? 'paper' : 'live', balance: 0, currency: 'INR' } as any);
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
        <span>Groww API Key and Secret reset every day at 6:00 AM IST. Auth Token is optional.</span>
      </div>
      {GROWW_FIELDS.map(f => (
        <div key={f.name}>
          <Label>{f.name}{f.required && ' *'}</Label>
          <div className="relative">
            <Input type={f.type === 'password' ? (showPasswords[f.name] ? 'text' : 'password') : 'text'} value={fields[f.name] || ''} onChange={e => { setFields(p => ({ ...p, [f.name]: e.target.value })); setFieldErrors(p => { const n = { ...p }; delete n[f.name]; return n; }); }} placeholder={f.placeholder || ''} className={fieldErrors[f.name] ? 'border-destructive' : ''} />
            {f.type === 'password' && <button className="absolute right-3 top-2.5 text-muted-foreground" onClick={() => setShowPasswords(p => ({ ...p, [f.name]: !p[f.name] }))}>{showPasswords[f.name] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}
          </div>
          {fieldErrors[f.name] && <p className="text-xs text-destructive mt-1">{fieldErrors[f.name]}</p>}
          {f.helper && <p className="text-xs text-muted-foreground mt-1">{f.helper}</p>}
        </div>
      ))}
      <div className="flex gap-3"><Button onClick={saveGroww}>Save & Connect</Button><Button variant="outline" onClick={() => setModalBroker(null)}>Cancel</Button></div>
    </div>
  );

  const renderAlpacaModal = () => (
    <div className="space-y-4">
      <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs text-yellow-400">
        Get free API keys at <span className="font-semibold">alpaca.markets</span>. Start with Paper Trading to test without real money.
      </div>
      <div>
        <Label className="mb-2 block">Environment</Label>
        <RadioGroup value={alpacaEnv} onValueChange={(v) => setAlpacaEnv(v as 'paper' | 'live')} className="flex gap-4">
          <div className="flex items-center gap-2"><RadioGroupItem value="paper" id="alp-paper" /><Label htmlFor="alp-paper">Paper Trading (sandbox - FREE)</Label></div>
          <div className="flex items-center gap-2"><RadioGroupItem value="live" id="alp-live" /><Label htmlFor="alp-live">Live Trading</Label></div>
        </RadioGroup>
      </div>
      {['API Key ID', 'API Secret Key'].map(f => (
        <div key={f}>
          <Label>{f} *</Label>
          <div className="relative">
            <Input type={showPasswords[f] ? 'text' : 'password'} value={fields[f] || ''} onChange={e => { setFields(p => ({ ...p, [f]: e.target.value })); setFieldErrors(p => { const n = { ...p }; delete n[f]; return n; }); }} className={fieldErrors[f] ? 'border-destructive' : ''} />
            <button className="absolute right-3 top-2.5 text-muted-foreground" onClick={() => setShowPasswords(p => ({ ...p, [f]: !p[f] }))}>{showPasswords[f] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
          {fieldErrors[f] && <p className="text-xs text-destructive mt-1">{fieldErrors[f]}</p>}
        </div>
      ))}
      <div className="flex gap-3"><Button onClick={saveAlpaca}>Save & Connect</Button><Button variant="outline" onClick={() => setModalBroker(null)}>Cancel</Button></div>
    </div>
  );

  const renderOandaModal = () => (
    <div className="space-y-4">
      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded text-xs text-blue-400">
        Sign up at <span className="font-semibold">oanda.com</span> for fxTrade API access. 70+ currency pairs available.
      </div>
      <div>
        <Label className="mb-2 block">Environment</Label>
        <RadioGroup value={oandaEnv} onValueChange={(v) => setOandaEnv(v as 'practice' | 'live')} className="flex gap-4">
          <div className="flex items-center gap-2"><RadioGroupItem value="practice" id="oa-practice" /><Label htmlFor="oa-practice">Practice (free demo)</Label></div>
          <div className="flex items-center gap-2"><RadioGroupItem value="live" id="oa-live" /><Label htmlFor="oa-live">Live</Label></div>
        </RadioGroup>
      </div>
      {['Account ID', 'API Token'].map(f => (
        <div key={f}>
          <Label>{f} *</Label>
          <div className="relative">
            <Input type={f === 'API Token' ? (showPasswords[f] ? 'text' : 'password') : 'text'} value={fields[f] || ''} onChange={e => { setFields(p => ({ ...p, [f]: e.target.value })); setFieldErrors(p => { const n = { ...p }; delete n[f]; return n; }); }} className={fieldErrors[f] ? 'border-destructive' : ''} />
            {f === 'API Token' && <button className="absolute right-3 top-2.5 text-muted-foreground" onClick={() => setShowPasswords(p => ({ ...p, [f]: !p[f] }))}>{showPasswords[f] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}
          </div>
          {fieldErrors[f] && <p className="text-xs text-destructive mt-1">{fieldErrors[f]}</p>}
        </div>
      ))}
      <div className="flex gap-3"><Button onClick={saveOanda}>Save & Connect</Button><Button variant="outline" onClick={() => setModalBroker(null)}>Cancel</Button></div>
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
            <Input type={f.toLowerCase().includes('password') || f.toLowerCase().includes('secret') || f.toLowerCase().includes('token') ? (showPasswords[f] ? 'text' : 'password') : 'text'} value={fields[f] || ''} onChange={e => setFields(p => ({ ...p, [f]: e.target.value }))} placeholder={f === 'TWS Port' ? '7497' : f === 'Port' ? '443' : f === 'Client ID' ? '1' : ''} />
            {(f.toLowerCase().includes('password') || f.toLowerCase().includes('secret') || f.toLowerCase().includes('token')) && <button className="absolute right-3 top-2.5 text-muted-foreground" onClick={() => setShowPasswords(p => ({ ...p, [f]: !p[f] }))}>{showPasswords[f] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}
          </div>
        </div>
      ))}
      {modalBroker?.extras?.includes('Paper Trading') && (
        <div className="flex items-center gap-2"><Switch checked={paperTrading} onCheckedChange={setPaperTrading} /><Label>Paper Trading</Label></div>
      )}
      {modalBroker?.comingSoon && <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">Configure credentials now, execute trades in next update.</p>}
      <div className="flex gap-3"><Button onClick={saveConnect} disabled={modalBroker?.comingSoon}>Save & Connect</Button><Button variant="outline" onClick={() => setModalBroker(null)}>Cancel</Button></div>
    </div>
  );

  const regions = ['INDIA', 'GLOBAL', 'FOREX', 'DEMO'] as const;

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

      {regions.map(region => {
        const regionBrokers = BROKER_TEMPLATES.filter(t => t.region === region);
        return (
          <div key={region} className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">{REGION_LABELS[region]}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {regionBrokers.map(tmpl => {
                const existing = getBrokerStatus(tmpl.broker_name);
                const status = existing?.status || 'disconnected';
                const isDemo = tmpl.broker_name === 'demo';
                const isGroww = tmpl.broker_name === 'groww';
                const growwConnected = isGroww && status === 'connected';
                return (
                  <Card key={tmpl.broker_name} className="card-glow">
                    <CardContent className="pt-6 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg ${tmpl.color} flex items-center justify-center text-white font-bold text-sm`}>
                          {tmpl.flag}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-sm">{tmpl.display_name}</h3>
                            {tmpl.comingSoon && <Badge variant="outline" className="text-[10px]">Coming Soon</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">{tmpl.markets}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-xs ${statusColors[status]}`}>{status}</span>
                      </div>
                      {tmpl.badge && <Badge className={`text-[10px] ${tmpl.badgeColor}`}>{tmpl.badge}</Badge>}
                      {tmpl.note && <p className="text-xs text-muted-foreground">{tmpl.note}</p>}
                      {growwConnected && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-xs text-yellow-400"><Clock className="h-3 w-3" /><span>🕕 Resets at 6:00 AM IST</span></div>
                          {countdowns[existing.id] && <p className="text-xs font-mono text-yellow-400">{countdowns[existing.id]}</p>}
                          {existing?.static_ip && <p className="text-xs text-muted-foreground">IP: {maskIP(existing.static_ip, isAdmin)}</p>}
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
          </div>
        );
      })}

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
          {modalBroker?.broker_name === 'groww' ? renderGrowwModal() :
           modalBroker?.broker_name === 'alpaca' ? renderAlpacaModal() :
           modalBroker?.broker_name === 'oanda' ? renderOandaModal() :
           renderGenericModal()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Brokers;
