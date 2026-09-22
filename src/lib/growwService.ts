/**
 * growwService.ts — Frontend service layer for the groww-proxy edge function.
 * The user's Groww API key/secret never touch this file's storage — they're
 * posted once to `connect()` and held server-side only (public.broker_secrets,
 * service-role only). Every other call here just asks the proxy to act using
 * those stored credentials.
 * Usage: import { groww } from '@/lib/growwService'
 */

import { supabase } from '@/integrations/supabase/client';

// ─── Response types (field names match the real Groww API payloads) ──────────

export interface GrowwHolding {
  isin: string;
  trading_symbol: string;
  quantity: number;
  average_price: number;
  demat_free_quantity?: number;
  pledge_quantity?: number;
  t1_quantity?: number;
}

export interface GrowwPosition {
  trading_symbol: string;
  exchange: string;
  symbol_isin?: string;
  quantity: number;
  product: string;
  net_price?: number;
  realised_pnl?: number;
}

export interface GrowwOrder {
  groww_order_id: string;
  trading_symbol: string;
  exchange: string;
  transaction_type: 'BUY' | 'SELL';
  order_type: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  price: number;
  quantity: number;
  filled_quantity?: number;
  order_status: string;
  order_reference_id?: string;
  created_at?: string;
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
    return { data: data?.data as T };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// Converts an app symbol (RELIANCE.NS / RELIANCE.BO) into Groww's
// { tradingSymbol, exchange } shape. Groww only supports NSE/BSE — anything
// else (US tickers, forex, etc.) can't be traded through this broker.
export function toGrowwSymbol(symbol: string): { tradingSymbol: string; exchange: 'NSE' | 'BSE' } | null {
  const upper = symbol.toUpperCase();
  if (upper.endsWith('.NS')) return { tradingSymbol: upper.slice(0, -3), exchange: 'NSE' };
  if (upper.endsWith('.BO')) return { tradingSymbol: upper.slice(0, -3), exchange: 'BSE' };
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const groww = {
  connect: (apiKey: string, totpSecret: string) =>
    callProxy<{ connected: boolean }>('connect', { api_key: apiKey, totp_secret: totpSecret }),

  disconnect: () => callProxy<{ connected: boolean }>('disconnect'),

  /** Fetch equity holdings (long-term portfolio) */
  holdings: () => callProxy<GrowwHolding[]>('holdings'),

  /** Fetch intraday / F&O positions */
  positions: () => callProxy<GrowwPosition[]>('positions'),

  /** Fetch all orders (open + completed) */
  orders: () => callProxy<GrowwOrder[]>('orders'),

  /** Fetch available funds / margin */
  funds: () => callProxy<GrowwFunds>('funds'),

  /** Place a new order. Real money moves if the account isn't in Groww's paper mode. */
  placeOrder: (payload: PlaceOrderPayload) => callProxy<{ groww_order_id: string; order_status: string }>('place_order', payload),

  /** Cancel an existing order */
  cancelOrder: (orderId: string) => callProxy<{ groww_order_id: string; order_status: string }>('cancel_order', { order_id: orderId }),

  /** Get live LTP for a list of app-style symbols (e.g. RELIANCE.NS) */
  marketQuote: (symbols: string[]) => callProxy<Record<string, { ltp: number }>>('market_quote', { symbols }),

  /**
   * Admin-only global signal scan. NOTE: this calls a `signal-scanner` edge
   * function that doesn't exist yet in this repo (pre-existing gap, not part
   * of the Groww broker integration) — the "Run Global Scan" admin button
   * will error until that function is built.
   */
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

export async function checkGrowwConnected(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('brokers')
    .select('id')
    .eq('user_id', userId)
    .eq('broker_name', 'groww')
    .eq('status', 'connected')
    .maybeSingle();
  return !!data;
}
