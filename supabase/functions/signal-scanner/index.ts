// Supabase Edge Function: signal-scanner
// Runs an RSI-14 scan over a symbol universe server-side (Yahoo Finance via the
// same upstream as get-price), persists generated signals and alert rows, and
// returns a summary. Invoked from the Admin Panel ("Run Signal Scan") and can
// be scheduled daily at 09:15 IST via Supabase cron.
//
// Body: { symbols?: string[] }   — defaults to the app's NSE_MAIN watchlist.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_SYMBOLS = [
  "RELIANCE.NS", "TCS.NS", "INFY.NS", "WIPRO.NS", "HDFCBANK.NS",
  "ICICIBANK.NS", "SBIN.NS", "BAJFINANCE.NS",
];

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** RSI-14 over daily closes (Wilder's smoothing, same as client-side computeRSI). */
function rsi14(closes: number[]): number | null {
  if (closes.length < 15) return null;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= 14; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= 14; avgLoss /= 14;
  if (avgLoss === 0) return 100;
  let rsi = 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = 15; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * 13 + (d > 0 ? d : 0)) / 14;
    avgLoss = (avgLoss * 13 + (d < 0 ? -d : 0)) / 14;
    rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonError(405, "Use POST");

  const authHeader = req.headers.get("authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Require an authenticated caller (admin panel or cron with service key).
  const verify = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user } } = await verify.auth.getUser();
  if (!user) return jsonError(401, "Unauthorized");

  let symbols = DEFAULT_SYMBOLS;
  try {
    const body = await req.json();
    if (Array.isArray(body?.symbols) && body.symbols.length > 0) symbols = body.symbols.slice(0, 50);
  } catch { /* default universe */ }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // All users get the generated signals/alerts (admin-triggered global scan).
  const { data: roles, error: rolesErr } = await admin.from("user_roles").select("user_id");
  if (rolesErr) return jsonError(500, "Failed to load users: " + rolesErr.message);
  const userIds = Array.from(new Set((roles ?? []).map((r) => r.user_id)));

  // Fetch candles for each symbol, compute RSI, derive signal.
  const signals: { user_id: string; symbol: string; signal_type: string; price: number }[] = [];
  const scanned: { symbol: string; rsi: number | null; price: number; signal: string }[] = [];

  for (const symbol of symbols) {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`,
        { headers: { "User-Agent": "Mozilla/5.0 (compatible; SankalpTradingHub/1.0)" } }
      );
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      const closes: number[] = (result?.indicators?.quote?.[0]?.close ?? []).filter((c: unknown) => c !== null);
      const price = result?.meta?.regularMarketPrice;
      if (!closes.length || price == null) continue;

      const rsi = rsi14(closes);
      const signal = rsi == null ? "HOLD" : rsi < 35 ? "BUY" : rsi > 65 ? "SELL" : "HOLD";
      scanned.push({ symbol, rsi, price, signal });

      if (signal !== "HOLD") {
        for (const uid of userIds) {
          signals.push({ user_id: uid, symbol, signal_type: signal, price });
        }
      }
    } catch {
      // Skip unreachable symbols; a partial scan is better than none.
    }
  }

  // Persist signals (skip duplicates for the same day) and raise alerts for BUY/SELL.
  let signalsCreated = 0;
  if (signals.length > 0) {
    const today = new Date().toISOString().split("T")[0];
    const { data: existing } = await admin
      .from("signals")
      .select("user_id, symbol, signal_type, created_at")
      .gte("created_at", today);
    const seen = new Set((existing ?? []).map((s) => `${s.user_id}|${s.symbol}|${s.signal_type}`));
    const fresh = signals.filter((s) => !seen.has(`${s.user_id}|${s.symbol}|${s.signal_type}`));

    if (fresh.length > 0) {
      const { error } = await admin.from("signals").insert(fresh);
      if (!error) signalsCreated = fresh.length;

      const alerts = fresh
        .filter((s) => s.signal_type === "BUY" || s.signal_type === "SELL")
        .map((s) => ({
          user_id: s.user_id,
          message: `${s.signal_type} signal: ${s.symbol} @ ₹${Number(s.price).toFixed(2)} (RSI scan)`,
          type: s.signal_type === "BUY" ? "success" : "warning",
        }));
      if (alerts.length > 0) await admin.from("alerts").insert(alerts);
    }
  }

  return new Response(
    JSON.stringify({ scanned: scanned.length, signals_created: signalsCreated, results: scanned }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
