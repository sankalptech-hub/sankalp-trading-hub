import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type Broker = {
  id: string;
  broker_name: string;
  display_name: string;
  status: string;
  is_default: boolean;
};

type TradingModeCtx = {
  brokers: Broker[];
  defaultBroker: Broker | null;
  paperMode: boolean;
  defaultBrokerName: string;
  loading: boolean;
  refresh: () => Promise<void>;
  setDefaultBroker: (brokerId: string) => Promise<void>;
  togglePaperLive: (toPaper: boolean) => Promise<void>;
};

const Ctx = createContext<TradingModeCtx | null>(null);

export const TradingModeProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setBrokers([]); setLoading(false); return; }
    const { data } = await supabase
      .from('brokers')
      .select('id, broker_name, display_name, status, is_default')
      .eq('user_id', user.id);
    setBrokers((data as Broker[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime sync across tabs/pages
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`brokers-mode-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brokers', filter: `user_id=eq.${user.id}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, refresh]);

  const defaultBroker = brokers.find(b => b.is_default) || null;
  const paperMode = !defaultBroker || defaultBroker.broker_name === 'demo';
  const defaultBrokerName = defaultBroker
    ? (defaultBroker.broker_name === 'demo' ? 'Demo / Paper' : defaultBroker.display_name)
    : 'Demo / Paper';

  const setDefaultBroker = useCallback(async (brokerId: string) => {
    if (!user) return;
    const current = brokers.find(b => b.is_default);
    if (current && current.id !== brokerId) {
      await supabase.from('brokers').update({ is_default: false } as any).eq('id', current.id);
    }
    await supabase.from('brokers').update({ is_default: true } as any).eq('id', brokerId);
    await refresh();
  }, [user, brokers, refresh]);

  const togglePaperLive = useCallback(async (toPaper: boolean) => {
    if (!user) return;
    const demo = brokers.find(b => b.broker_name === 'demo');
    const liveBrokers = brokers.filter(b => b.broker_name !== 'demo' && b.status === 'connected');
    if (toPaper) {
      if (!demo) { toast.error('No demo broker found'); return; }
      await setDefaultBroker(demo.id);
      toast.success('Switched to Paper Trading mode');
    } else {
      const live = liveBrokers.find(b => b.is_default) || liveBrokers[0];
      if (!live) {
        toast.error('No live broker connected. Configure one in Brokers page.');
        return;
      }
      await setDefaultBroker(live.id);
      toast.success(`Switched to Live Trading via ${live.display_name}`);
    }
  }, [user, brokers, setDefaultBroker]);

  return (
    <Ctx.Provider value={{ brokers, defaultBroker, paperMode, defaultBrokerName, loading, refresh, setDefaultBroker, togglePaperLive }}>
      {children}
    </Ctx.Provider>
  );
};

export const useTradingMode = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTradingMode must be used within TradingModeProvider');
  return v;
};