import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Settings2, AlertTriangle, Loader2, Eye, EyeOff, Sparkles, CheckCircle2 } from 'lucide-react';

const REGIONS = [
  { value: 'IN', label: '🇮🇳 India', currency: 'INR', exchange: 'NSE' },
  { value: 'US', label: '🇺🇸 United States', currency: 'USD', exchange: 'NYSE' },
  { value: 'CA', label: '🇨🇦 Canada', currency: 'CAD', exchange: 'TSX' },
  { value: 'GB', label: '🇬🇧 United Kingdom', currency: 'GBP', exchange: 'LSE' },
  { value: 'AU', label: '🇦🇺 Australia', currency: 'AUD', exchange: 'ASX' },
  { value: 'OTHER', label: '🌍 Other / Global', currency: 'USD', exchange: 'NYSE' },
];

const CURRENCIES = ['INR', 'USD', 'CAD', 'GBP', 'AUD', 'EUR', 'HKD'];
const EXCHANGES_LIST = ['NSE', 'BSE', 'NYSE', 'NASDAQ', 'TSX', 'LSE', 'ASX', 'HKEX', 'XETR'];

// Anthropic is native; everything else is treated as an OpenAI-compatible
// /models + /chat/completions surface, which covers OpenAI, NVIDIA NIM,
// OpenRouter, Groq and most free-tier model gateways. "Custom" lets the
// user point at any other OpenAI-compatible base URL.
const AI_PROVIDER_PRESETS = [
  { key: 'anthropic', label: 'Anthropic (Claude)', baseUrl: '', keyPlaceholder: 'sk-ant-...', keyHelp: 'console.anthropic.com → API Keys' },
  { key: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', keyPlaceholder: 'sk-...', keyHelp: 'platform.openai.com → API Keys' },
  { key: 'nvidia', label: 'NVIDIA NIM', baseUrl: 'https://integrate.api.nvidia.com/v1', keyPlaceholder: 'nvapi-...', keyHelp: 'build.nvidia.com → free API key' },
  { key: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', keyPlaceholder: 'sk-or-...', keyHelp: 'openrouter.ai/keys — includes free models' },
  { key: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', keyPlaceholder: 'gsk_...', keyHelp: 'console.groq.com/keys — fast, free tier' },
  { key: 'google', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', keyPlaceholder: 'AIza...', keyHelp: 'aistudio.google.com/apikey — free tier' },
  { key: 'custom', label: 'Custom (OpenAI-compatible)', baseUrl: '', keyPlaceholder: '', keyHelp: 'Any provider exposing an OpenAI-compatible API' },
] as const;

const Settings = () => {
  const { user, signOut } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [provider, setProvider] = useState(() => localStorage.getItem('data_provider') || 'yahoo');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [region, setRegion] = useState('IN');
  const [preferredCurrency, setPreferredCurrency] = useState('INR');
  const [preferredExchange, setPreferredExchange] = useState('NSE');

  const [aiConnected, setAiConnected] = useState(false);
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [aiConnectedProvider, setAiConnectedProvider] = useState('anthropic');
  const [aiModels, setAiModels] = useState<{ id: string; display_name: string }[]>([]);
  const [aiLoadingModels, setAiLoadingModels] = useState(false);

  // Not-yet-connected flow: pick a provider, paste a key, Test Connection
  // (validates + lists models WITHOUT saving), pick a model, then Save &
  // Connect actually persists it.
  const [aiProviderChoice, setAiProviderChoice] = useState<string>('anthropic');
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiKeyVisible, setAiKeyVisible] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTested, setAiTested] = useState(false);
  const [aiTestedModels, setAiTestedModels] = useState<{ id: string; display_name: string }[]>([]);
  const [aiPickedModel, setAiPickedModel] = useState('');
  const [aiSaving, setAiSaving] = useState(false);

  const currentPreset = AI_PROVIDER_PRESETS.find(p => p.key === aiProviderChoice) ?? AI_PROVIDER_PRESETS[0];
  const connectedPresetLabel = AI_PROVIDER_PRESETS.find(p => p.key === aiConnectedProvider)?.label ?? aiConnectedProvider;

  const loadAiStatus = async () => {
    const { data } = await supabase.from('ai_provider_settings').select('connected, selected_model, provider').eq('id', true).maybeSingle();
    setAiConnected(!!data?.connected);
    setAiModel(data?.selected_model ?? null);
    setAiConnectedProvider(data?.provider || 'anthropic');
  };

  const selectAiProvider = (key: string) => {
    setAiProviderChoice(key);
    setAiBaseUrl(AI_PROVIDER_PRESETS.find(p => p.key === key)?.baseUrl ?? '');
    setAiTested(false);
    setAiTestedModels([]);
    setAiPickedModel('');
  };

  const resetAiTest = () => { setAiTested(false); setAiTestedModels([]); setAiPickedModel(''); };

  const testAiConnection = async () => {
    if (!aiApiKey.trim()) { toast.error('Enter your API key'); return; }
    if (aiProviderChoice !== 'anthropic' && !aiBaseUrl.trim()) { toast.error('Enter a base URL'); return; }
    setAiTesting(true);
    const { data, error } = await supabase.functions.invoke('ai-provider', {
      body: { action: 'test', payload: { provider: aiProviderChoice, base_url: aiBaseUrl.trim(), api_key: aiApiKey.trim() } },
    });
    setAiTesting(false);
    if (error || data?.error) { toast.error('Test failed: ' + (data?.error || error?.message)); resetAiTest(); return; }
    setAiTestedModels(data.data.models);
    setAiPickedModel(data.data.models[0]?.id ?? '');
    setAiTested(true);
    toast.success(`Key is valid — ${data.data.models.length} model${data.data.models.length === 1 ? '' : 's'} found`);
  };

  const saveAndConnectAi = async () => {
    if (!aiPickedModel) { toast.error('Select a model first'); return; }
    setAiSaving(true);
    const { data, error } = await supabase.functions.invoke('ai-provider', {
      body: { action: 'connect', payload: { provider: aiProviderChoice, base_url: aiBaseUrl.trim(), api_key: aiApiKey.trim(), model: aiPickedModel } },
    });
    setAiSaving(false);
    if (error || data?.error) { toast.error('Connect failed: ' + (data?.error || error?.message)); return; }
    setAiApiKey(''); resetAiTest();
    toast.success(`Connected to ${currentPreset.label}`);
    await loadAiStatus();
  };

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('display_name, region, preferred_currency, preferred_exchange').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      if (data?.display_name) setDisplayName(data.display_name);
      if (data?.region) setRegion(data.region);
      if (data?.preferred_currency) setPreferredCurrency(data.preferred_currency);
      if (data?.preferred_exchange) setPreferredExchange(data.preferred_exchange);
    });
    loadAiStatus();
  }, [user]);

  const disconnectAiProvider = async () => {
    await supabase.functions.invoke('ai-provider', { body: { action: 'disconnect' } });
    setAiModels([]);
    toast.success('AI provider disconnected');
    await loadAiStatus();
  };

  const refreshAiModels = async () => {
    setAiLoadingModels(true);
    const { data, error } = await supabase.functions.invoke('ai-provider', { body: { action: 'list_models' } });
    setAiLoadingModels(false);
    if (error || data?.error) { toast.error('Could not fetch models: ' + (data?.error || error?.message)); return; }
    setAiModels(data.data.models);
  };

  const changeAiModel = async (model: string) => {
    setAiModel(model);
    const { error } = await supabase.functions.invoke('ai-provider', { body: { action: 'set_model', payload: { model } } });
    if (error) toast.error('Failed to update model: ' + error.message);
    else toast.success(`Model set to ${model}`);
  };

  const saveProfile = async () => {
    if (!user) return;
    await supabase.from('profiles').update({ display_name: displayName } as any).eq('user_id', user.id);
    toast.success('Profile saved');
  };

  const saveMarketPrefs = async () => {
    if (!user) return;
    await supabase.from('profiles').update({ region, preferred_currency: preferredCurrency, preferred_exchange: preferredExchange } as any).eq('user_id', user.id);
    toast.success('Market preferences saved');
  };

  const handleRegionChange = (val: string) => {
    setRegion(val);
    const r = REGIONS.find(r => r.value === val);
    if (r) { setPreferredCurrency(r.currency); setPreferredExchange(r.exchange); }
  };

  const setDataProvider = (p: string) => {
    setProvider(p);
    localStorage.setItem('data_provider', p);
    toast.success(`Data provider set to ${p === 'yahoo' ? 'Yahoo Finance' : p === 'twelvedata' ? 'Twelve Data' : 'Demo Mode'}`);
  };

  const changePassword = async () => {
    if (!user?.email) return;
    await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: window.location.origin });
    toast.success('Password reset email sent');
  };

  const deleteAccount = async () => {
    if (deleteConfirm !== 'DELETE' || !user) return;
    await Promise.all([
      supabase.from('orders').delete().eq('user_id', user.id),
      supabase.from('positions').delete().eq('user_id', user.id),
      supabase.from('signals').delete().eq('user_id', user.id),
      supabase.from('alerts').delete().eq('user_id', user.id),
      supabase.from('strategies').delete().eq('user_id', user.id),
      supabase.from('build_tasks').delete().eq('user_id', user.id),
      supabase.from('broker_orders').delete().eq('user_id', user.id),
      supabase.from('broker_accounts').delete().eq('user_id', user.id),
      supabase.from('brokers').delete().eq('user_id', user.id),
      supabase.from('risk_config').delete().eq('user_id', user.id),
      supabase.from('profiles').delete().eq('user_id', user.id),
      supabase.from('user_roles').delete().eq('user_id', user.id),
    ]);
    await signOut();
    toast.success('Account deleted');
  };

  const initials = displayName ? displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : user?.email?.charAt(0).toUpperCase() || '?';

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Settings2 className="h-6 w-6 text-primary" /> Settings</h1>

      <Card className="card-glow">
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary">{initials}</div>
            <div className="flex-1">
              <div><Label>Display Name</Label><Input value={displayName} onChange={e => setDisplayName(e.target.value)} /></div>
              <div className="mt-2"><Label>Email</Label><Input value={user?.email || ''} disabled /></div>
            </div>
          </div>
          <Button onClick={saveProfile}>Save Profile</Button>
        </CardContent>
      </Card>

      <Card className="card-glow">
        <CardHeader><CardTitle>🌍 Market Preferences</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Home Region</Label>
              <Select value={region} onValueChange={handleRegionChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REGIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Preferred Currency</Label>
              <Select value={preferredCurrency} onValueChange={setPreferredCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Default Exchange</Label>
              <Select value={preferredExchange} onValueChange={setPreferredExchange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXCHANGES_LIST.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={saveMarketPrefs}>Save Market Preferences</Button>
        </CardContent>
      </Card>

      <Card className="card-glow">
        <CardHeader><CardTitle>Data Provider</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Choose the market data source for live prices across the app.</p>
          <div className="flex gap-4 flex-wrap">
            {[{ key: 'yahoo', label: 'Yahoo Finance' }, { key: 'twelvedata', label: 'Twelve Data' }, { key: 'demo', label: 'Demo Mode' }].map(p => (
              <button key={p.key} onClick={() => setDataProvider(p.key)}
                className={`px-4 py-2 rounded-lg border text-sm transition-colors ${provider === p.key ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50'}`}>
                {p.label}
              </button>
            ))}
          </div>
          {provider === 'twelvedata' && <p className="text-xs text-muted-foreground">Twelve Data supports 10+ global exchanges. Free tier: 800 calls/day.</p>}
          {provider === 'yahoo' && <p className="text-xs text-muted-foreground">Yahoo Finance — good coverage for NSE and US markets.</p>}
        </CardContent>
      </Card>

      <Card className="card-glow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> AI Provider</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect your own AI provider — Claude, NVIDIA, OpenAI, or any OpenAI-compatible endpoint including free-tier ones — to power AI-authored trading signals across Scanner and Trade: real reasoning grounded in live price/technical/fundamental data, not a fixed formula. Billed to your own account with that provider.
          </p>

          {aiConnected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Connected</Badge>
                <span className="text-xs text-muted-foreground">{connectedPresetLabel}</span>
                {aiModel && <span className="text-xs font-mono text-muted-foreground">{aiModel}</span>}
              </div>
              <div className="flex items-end gap-3 flex-wrap">
                <div className="flex-1 max-w-xs min-w-[180px]">
                  <Label>Model</Label>
                  <Select value={aiModel ?? ''} onValueChange={changeAiModel} onOpenChange={(open) => { if (open && aiModels.length === 0) refreshAiModels(); }}>
                    <SelectTrigger>
                      {aiLoadingModels ? <span className="flex items-center gap-1 text-xs"><Loader2 className="h-3 w-3 animate-spin" /> Loading...</span> : <SelectValue placeholder="Select model" />}
                    </SelectTrigger>
                    <SelectContent>
                      {aiModel && !aiModels.some(m => m.id === aiModel) && <SelectItem value={aiModel}>{aiModel}</SelectItem>}
                      {aiModels.map(m => <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" variant="outline" onClick={refreshAiModels} disabled={aiLoadingModels}>Refresh models</Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={disconnectAiProvider}>Disconnect</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 max-w-md">
              <div>
                <Label>Provider</Label>
                <Select value={aiProviderChoice} onValueChange={selectAiProvider}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AI_PROVIDER_PRESETS.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {aiProviderChoice !== 'anthropic' && (
                <div>
                  <Label>Base URL</Label>
                  <Input value={aiBaseUrl} onChange={e => { setAiBaseUrl(e.target.value); resetAiTest(); }} placeholder="https://api.example.com/v1" />
                </div>
              )}

              <div>
                <Label>API Key</Label>
                <div className="relative">
                  <Input
                    type={aiKeyVisible ? 'text' : 'password'}
                    value={aiApiKey}
                    onChange={e => { setAiApiKey(e.target.value); resetAiTest(); }}
                    placeholder={currentPreset.keyPlaceholder || 'API key'}
                  />
                  <button className="absolute right-3 top-2.5 text-muted-foreground" onClick={() => setAiKeyVisible(v => !v)}>
                    {aiKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{currentPreset.keyHelp}. Never stored in your browser — sent straight to a server-side function.</p>
              </div>

              {!aiTested ? (
                <Button onClick={testAiConnection} disabled={aiTesting}>
                  {aiTesting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Testing...</> : 'Test Connection'}
                </Button>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Key is valid — {aiTestedModels.length} model{aiTestedModels.length === 1 ? '' : 's'} found
                  </p>
                  <div>
                    <Label>Model</Label>
                    <Select value={aiPickedModel} onValueChange={setAiPickedModel}>
                      <SelectTrigger><SelectValue placeholder="Select model" /></SelectTrigger>
                      <SelectContent>
                        {aiTestedModels.map(m => <SelectItem key={m.id} value={m.id}>{m.display_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={saveAndConnectAi} disabled={aiSaving || !aiPickedModel}>
                      {aiSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : 'Save & Connect'}
                    </Button>
                    <Button variant="outline" onClick={resetAiTest}>Re-test</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="card-glow border-destructive/30">
        <CardHeader><CardTitle className="text-destructive">Danger Zone</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div><p className="font-medium">Change Password</p><p className="text-xs text-muted-foreground">We'll send a reset email.</p></div>
            <Button variant="outline" onClick={changePassword}>Change Password</Button>
          </div>
          <div className="border-t border-border pt-4 flex items-center justify-between">
            <div><p className="font-medium text-destructive">Delete Account</p><p className="text-xs text-muted-foreground">Permanently delete all your data.</p></div>
            <Button variant="destructive" onClick={() => setShowDelete(true)}>Delete Account</Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" /> Delete Account</DialogTitle>
            <DialogDescription>This action is irreversible. Type DELETE to confirm.</DialogDescription>
          </DialogHeader>
          <Input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder="Type DELETE" />
          <div className="flex gap-3">
            <Button variant="destructive" disabled={deleteConfirm !== 'DELETE'} onClick={deleteAccount}>Delete Forever</Button>
            <Button variant="outline" onClick={() => setShowDelete(false)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
