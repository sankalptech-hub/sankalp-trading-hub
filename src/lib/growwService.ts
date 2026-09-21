/**
 * growwService.ts — Frontend service layer for the groww-proxy edge function.
 * Wraps every action with typed request/response shapes.
 * Usage: import { groww } from '@/lib/growwService'
 */

import { supabase } from '@/integrations/supabase/client';

// ─── Response types ───────────────────────────────────────────────────────────

export interface GrowwHolding {
  tradingSymbol: string;
  exchange: string;
  isin: string;
  quantity: number;
  averagePrice: number;
  ltp: number;              // last traded price
  currentValue: number;
  pnl: number;
  pnlPercent: number;
}

export interface GrowwPosition {
  tradingSymbol: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
  ltp: number;
  pnl: number;
  side: 'BUY' | 'SELL';
}

export interface GrowwOrder {
  orderId: string;
  tradingSymbol: string;
  exchange: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  price: number;
  quantity: number;
  filledQuantity: number;
  status: string;
  createdAt: string;
}

export interface GrowwFunds {
  availableBalance: number;
  usedMargin: number;
  totalBalance: number;
  currency: string;
}

export interface PlaceOrderPayload {
  tradingSymbol: string;
  exchange: 'NSE' | 'BSE';
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  quantity: number;
  price?: number;
  triggerPrice?: number;
  product?: 'CNC' | 'MIS' | 'NRML';
}

export interface GrowwApiResponse<T> {
  data?: T;
  error?: string;
  status?: number;
}

// ─── Internal helper ──────────────────────────────────────────────────────────

async function callProxy<T>(action: string, payload?: unknown): Promise<GrowwApiResponse<T>> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Not authenticated' };

    const { data, error } = await supabase.functions.invoke('groww-proxy', {
      body: { action, payload },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    return { data: data as T };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const groww = {
  /** Fetch equity holdings (long-term portfolio) */
  portfolio: () => callProxy<{ data: GrowwHolding[] }>('portfolio'),

  /** Fetch intraday / F&O positions */
  positions: () => callProxy<{ data: GrowwPosition[] }>('positions'),

  /** Fetch all orders (open + completed) */
  orders: () => callProxy<{ data: GrowwOrder[] }>('orders'),

  /** Fetch available funds / margin */
  funds: () => callProxy<GrowwFunds>('funds'),

  /** Place a new order */
  placeOrder: (payload: PlaceOrderPayload) =>
    callProxy<{ orderId: string; status: string }>('place_order', payload),

  /** Cancel an existing order */
  cancelOrder: (orderId: string) =>
    callProxy<{ success: boolean }>('cancel_order', { order_id: orderId }),

  /** Get live market quotes for a list of symbols */
  marketQuote: (symbols: string[]) =>
    callProxy<Record<string, { ltp: number; open: number; high: number; low: number; volume: number }>>('market_quote', { symbols }),

  /** Trigger a signal scan for the current user via the scanner function */
  runScan: async (symbols?: string[]) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { error: 'Not authenticated' };
      const { data, error } = await supabase.functions.invoke('signal-scanner', {
        body: { action: 'scan', symbols },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) return { error: error.message };
      return { data };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : 'Unknown error' };
    }
  },
};

// ─── Connection status check ──────────────────────────────────────────────────

export async function checkGrowwConnected(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('integrations')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'groww')
    .maybeSingle();
  return !!data;
}

export async function saveGrowwApiKey(userId: string, apiKey: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('integrations').upsert({
    user_id: userId,
    provider: 'groww',
    config_json: { api_key: apiKey },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,provider' });
  return { error: error?.message };
}

export async function removeGrowwApiKey(userId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('integrations')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'groww');
  return { error: error?.message };
}
