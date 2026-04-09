import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Settings2, AlertTriangle } from 'lucide-react';

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

const Settings = () => {
  const { user, signOut } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [provider, setProvider] = useState(() => localStorage.getItem('data_provider') || 'yahoo');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [region, setRegion] = useState('IN');
  const [preferredCurrency, setPreferredCurrency] = useState('INR');
  const [preferredExchange, setPreferredExchange] = useState('NSE');

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('display_name, region, preferred_currency, preferred_exchange').eq('user_id', user.id).maybeSingle().then(({ data }) => {
      if (data?.display_name) setDisplayName(data.display_name);
      if (data?.region) setRegion(data.region);
      if (data?.preferred_currency) setPreferredCurrency(data.preferred_currency);
      if (data?.preferred_exchange) setPreferredExchange(data.preferred_exchange);
    });
  }, [user]);

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
