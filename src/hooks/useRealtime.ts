/**
 * useRealtime hooks — live Supabase subscriptions for TradeSphere
 * Alerts, positions, and signals update in real-time without page refresh.
 */

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

// ─── Types ───────────────────────────────────────────────────────────────────
type Alert          = Tables<'alerts'>;
type Position       = Tables<'positions'>;
type Signal         = Tables<'signals'>;
type WatchlistSymbol = Tables<'watchlist_symbols'>;

// ─── useRealtimeAlerts ────────────────────────────────────────────────────────
export function useRealtimeAlerts(userId: string | undefined) {
  const [alerts, setAlerts]           = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading]         = useState(true);

  const markRead = useCallback(async (alertId: string) => {
    await supabase.from('alerts').update({ read: true }).eq('id', alertId);
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, read: true } : a));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    await supabase.from('alerts').update({ read: true }).eq('user_id', userId).eq('read', false);
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
    setUnreadCount(0);
  }, [userId]);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }

    // Initial fetch
    supabase
      .from('alerts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        const rows = data ?? [];
        setAlerts(rows);
        setUnreadCount(rows.filter(a => !a.read).length);
        setLoading(false);
      });

    // Real-time subscription
    const channel = supabase
      .channel(`alerts:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'alerts',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const newAlert = payload.new as Alert;
        setAlerts(prev => [newAlert, ...prev]);
        if (!newAlert.read) setUnreadCount(prev => prev + 1);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'alerts',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const updated = payload.new as Alert;
        setAlerts(prev => prev.map(a => a.id === updated.id ? updated : a));
        // Recount
        setAlerts(prev => {
          setUnreadCount(prev.filter(a => !a.read).length);
          return prev;
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return { alerts, unreadCount, loading, markRead, markAllRead };
}

// ─── useRealtimePositions ─────────────────────────────────────────────────────
export function useRealtimePositions(userId: string | undefined) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading]     = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', userId)
      .order('symbol');
    setPositions(data ?? []);
  }, [userId]);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }

    refresh().then(() => setLoading(false));

    const channel = supabase
      .channel(`positions:${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'positions',
        filter: `user_id=eq.${userId}`,
      }, () => { refresh(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, refresh]);

  return { positions, loading, refresh };
}

// ─── useRealtimeSignals ───────────────────────────────────────────────────────
export function useRealtimeSignals(userId: string | undefined) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }

    supabase
      .from('signals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setSignals(data ?? []);
        setLoading(false);
      });

    const channel = supabase
      .channel(`signals:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'signals',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        setSignals(prev => [payload.new as Signal, ...prev.slice(0, 49)]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return { signals, loading };
}

// ─── useRealtimeWatchlist ─────────────────────────────────────────────────────
export function useRealtimeWatchlist(watchlistId: string | undefined) {
  const [symbols, setSymbols] = useState<WatchlistSymbol[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!watchlistId) { setLoading(false); return; }

    supabase
      .from('watchlist_symbols')
      .select('*')
      .eq('watchlist_id', watchlistId)
      .order('added_at', { ascending: false })
      .then(({ data }) => {
        setSymbols(data ?? []);
        setLoading(false);
      });

    const channel = supabase
      .channel(`watchlist:${watchlistId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'watchlist_symbols',
        filter: `watchlist_id=eq.${watchlistId}`,
      }, async () => {
        const { data } = await supabase
          .from('watchlist_symbols')
          .select('*')
          .eq('watchlist_id', watchlistId)
          .order('added_at', { ascending: false });
        setSymbols(data ?? []);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [watchlistId]);

  return { symbols, loading };
}
