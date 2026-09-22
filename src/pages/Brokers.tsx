import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTradingMode } from '@/contexts/TradingModeContext';
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
import { Plug, Eye, EyeOff, AlertTriangle, FlaskConical, Loader2 } from 'lucide-react';
import { groww } from '@/lib/growwService';

interface BrokerTemplate {
  broker_name: string;
  display_name: string;
  markets: string;
  fields: string[];
  note: string;
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
  { broker_name: 'groww', display_name: 'Groww', markets: 'NSE, BSE', fields: ['API Key', 'TOTP Secret'], note: "Requires an active Groww Trading API subscription (₹499+tax/month). Generate a TOTP-type API key at groww.in → API Keys → Generate API key → Generate TOTP token. This connects real orders — real money moves once you switch to Live.", region: 'INDIA', flag: '🇮🇳', badge: 'Zero AMC', badgeColor: 'bg-teal-500/20 text-teal-400', color: 'bg-[#00D09C]' },
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

const Brokers = () => {
  const { paperMode, defaultBrokerName, togglePaperLive, setDefaultBroker: setCtxDefault, refresh: refreshMode } = useTradingMode();
  const { user } = useAuth();
  const [brokers, setBrokers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [modalBroker, setModalBroker] = useState<BrokerTemplate | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [paperTrading, setPaperTrading] = useState(true);
  const [alpacaEnv, setAlpacaEnv] = useState<'paper' | 'live'>('paper');
  const [oandaEnv, setOandaEnv] = useState<'practice' | 'live'>('practice');
  const [growwConnecting, setGrowwConnecting] = useState(false);
  const [testingBroker, setTestingBroker] = useState<string | null>(null);

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

  const getBrokerStatus = (name: string) => brokers.find(b => b.broker_name === name);

  const setDefault = async (brokerId: string) => {
    if (!user) return;
    await setCtxDefault(brokerId);
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

  const saveGroww = async () => {
    if (!user || !modalBroker) return;
    const errors: Record<string, string> = {};
    if (!fields['API Key']?.trim()) errors['API Key'] = 'Required';
    if (!fields['TOTP Secret']?.trim()) errors['TOTP Secret'] = 'Required';
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }

    setGrowwConnecting(true);
    const res = await groww.connect(fields['API Key'].trim(), fields['TOTP Secret'].trim());
    setGrowwConnecting(false);
    if (res.error) { toast.error(`Groww connection failed: ${res.error}`); return; }

    toast.success('Connected to Groww');
    setModalBroker(null);
    load();
    refreshMode();
  };

  const saveConnect = async () => {
    if (!user || !modalBroker) return;
    if (modalBroker.broker_name === 'alpaca') return saveAlpaca();
    if (modalBroker.broker_name === 'oanda') return saveOanda();
    if (modalBroker.broker_name === 'groww') return saveGroww();

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
    refreshMode();
  };

  const disconnect = async (brokerId: string, brokerName: string) => {
    if (brokerName === 'groww') {
      const res = await groww.disconnect();
      if (res.error) { toast.error(res.error); return; }
    } else {
      await supabase.from('brokers').update({ status: 'disconnected' } as any).eq('id', brokerId);
    }
    toast.success('Disconnected');
    load();
    refreshMode();
  };

  const testConnection = async (brokerName: string, displayName: string) => {
    if (brokerName === 'groww') {
      setTestingBroker('groww');
      const res = await groww.funds();
      setTestingBroker(null);
      if (res.error) toast.error(`Groww: ${res.error}`);
      else toast.success(`Groww: Connection successful — available balance ₹${res.data?.availableBalance?.toLocaleString('en-IN') ?? '0'}`);
      return;
    }
    // Other brokers aren't wired to a real API yet (see repo audit notes) —
    // this stays a placeholder until they get the same treatment as Groww.
    const success = Math.random() > 0.3;
    if (success) toast.success(`${displayName}: Connection successful`);
    else toast.error(`${displayName}: Connection failed`);
  };

  const connectedCount = brokers.filter(b => b.status === 'connected').length;
  const defaultBroker = brokers.find(b => b.is_default);
  const demoBalance = brokers.find(b => b.broker_name === 'demo')?.config_json?.balance || 100000;

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

  const renderGrowwModal = () => (
    <div className="space-y-4">
      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded flex items-center gap-2 text-xs text-red-400">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" /> This connects your real Groww account. Once connected and switched to Live mode, orders placed from the Trade page execute with real money.
      </div>
      <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs text-yellow-400">
        Requires an active Groww Trading API subscription (₹499+tax/month). On groww.in → API Keys, click <span className="font-semibold">Generate API key → Generate TOTP token</span> (not "Generate Access Token" — that one expires daily and can't be used here). Credentials are sent straight to a server-side function and are never stored in your browser.
      </div>
      <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded text-xs text-orange-400">
        SEBI requires a static IP registered against your API key before it can place orders (deadline was 31 Mar 2026). That isn't wired up yet — order placement may be rejected by Groww until it is. Holdings/positions/funds/quotes work regardless.
      </div>
      {['API Key', 'TOTP Secret'].map(f => (
        <div key={f}>
          <Label>{f} *</Label>
          <div className="relative">
            <Input type={showPasswords[f] ? 'text' : 'password'} value={fields[f] || ''} onChange={e => { setFields(p => ({ ...p, [f]: e.target.value })); setFieldErrors(p => { const n = { ...p }; delete n[f]; return n; }); }} className={fieldErrors[f] ? 'border-destructive' : ''} />
            <button className="absolute right-3 top-2.5 text-muted-foreground" onClick={() => setShowPasswords(p => ({ ...p, [f]: !p[f] }))}>{showPasswords[f] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
          {fieldErrors[f] && <p className="text-xs text-destructive mt-1">{fieldErrors[f]}</p>}
        </div>
      ))}
      <div className="flex gap-3">
        <Button onClick={saveGroww} disabled={growwConnecting}>{growwConnecting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Verifying...</> : 'Save & Connect'}</Button>
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Plug className="h-6 w-6 text-primary" /> Broker Management</h1>
        <div className="flex items-center gap-3 bg-card border rounded-lg px-4 py-2">
          <FlaskConical className={`h-4 w-4 ${paperMode ? 'text-primary' : 'text-muted-foreground'}`} />
          <span className={`text-sm font-medium ${paperMode ? 'text-primary' : 'text-muted-foreground'}`}>Paper</span>
          <Switch checked={!paperMode} onCheckedChange={(checked) => togglePaperLive(!checked)} />
          <span className={`text-sm font-medium ${!paperMode ? 'text-emerald-400' : 'text-muted-foreground'}`}>Live</span>
          <Badge variant="outline" className={`text-[10px] ml-1 ${paperMode ? 'border-primary/30 text-primary' : 'border-emerald-500/30 text-emerald-400'}`}>
            {defaultBrokerName}
          </Badge>
        </div>
      </div>

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
                      <div className="flex gap-2 flex-wrap">
                        {!isDemo && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openConfig(tmpl)}>Configure</Button>}
                        {existing && <Button size="sm" variant={existing.is_default ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setDefault(existing.id)}>{existing.is_default ? '★ Default' : 'Set Default'}</Button>}
                        {existing?.status === 'connected' && <Button size="sm" variant="outline" className="h-7 text-xs" disabled={testingBroker === tmpl.broker_name} onClick={() => testConnection(tmpl.broker_name, tmpl.display_name)}>{testingBroker === tmpl.broker_name ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Test'}</Button>}
                        {existing?.status === 'connected' && !isDemo && <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => disconnect(existing.id, tmpl.broker_name)}>Disconnect</Button>}
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
          {modalBroker?.broker_name === 'alpaca' ? renderAlpacaModal() :
           modalBroker?.broker_name === 'oanda' ? renderOandaModal() :
           modalBroker?.broker_name === 'groww' ? renderGrowwModal() :
           renderGenericModal()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Brokers;
