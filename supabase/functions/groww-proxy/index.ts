// Supabase Edge Function: groww-proxy
//
// Server-side proxy for the Groww Trading API (https://groww.in/trade-api/docs).
// The user's Groww API key/secret NEVER reach the browser: they're posted here
// once (action=connect), stored in public.broker_secrets (service-role only,
// no client RLS access), and every subsequent action re-derives a fresh access
// token server-side from the stored secret.
//
// IMPORTANT: the exact shape of the POST /v1/token/api/access response wasn't
// fully pinned down from Groww's docs at implementation time (conflicting
// examples — some show a top-level `token`+`expiry`, others `payload.access_token`).
// extractAccessToken() below checks all the plausible shapes and throws with the
// raw body if none match, so a schema mismatch fails loudly on `connect` (which
// is a live test against the real endpoint) instead of silently breaking later.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GROWW_BASE = "https://api.groww.in/v1";
const TOKEN_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // conservative fallback if Groww gives no expiry we can parse

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function extractAccessToken(body: any): { token: string; expiresAt: string | null } {
  const token =
    body?.token ??
    body?.payload?.token ??
    body?.payload?.access_token ??
    body?.access_token ??
    null;
  if (!token) {
    throw new Error(`Unexpected Groww token response shape: ${JSON.stringify(body).slice(0, 500)}`);
  }
  const expiry = body?.expiry ?? body?.payload?.expiry ?? body?.expires_at ?? null;
  return { token, expiresAt: expiry };
}

async function fetchFreshAccessToken(apiKey: string, apiSecret: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const checksum = await sha256Hex(apiSecret + timestamp);
  const res = await fetch(`${GROWW_BASE}/token/api/access`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ key_type: "approval", checksum, timestamp }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.status === "FAILURE") {
    throw new Error(body?.error?.message || body?.message || `Groww auth failed (HTTP ${res.status})`);
  }
  return extractAccessToken(body);
}

async function growwFetch(accessToken: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${GROWW_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "X-API-VERSION": "1.0",
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.status === "FAILURE") {
    const message = body?.error?.message || body?.message || `Groww API error (HTTP ${res.status})`;
    const err = new Error(message) as Error & { httpStatus?: number };
    err.httpStatus = res.status;
    throw err;
  }
  return body?.payload ?? body;
}

// Loads the user's stored credentials and returns a usable access token,
// reusing a cached one when it isn't expired, regenerating otherwise (Groww
// caps token generation at 150 requests/24h, so avoid regenerating per call).
async function getAccessTokenForUser(admin: ReturnType<typeof createClient>, userId: string) {
  const { data: secretRow, error } = await admin
    .from("broker_secrets")
    .select("*")
    .eq("user_id", userId)
    .eq("broker_name", "groww")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!secretRow) throw new Error("Groww is not connected for this account");

  const now = Date.now();
  if (secretRow.cached_access_token && secretRow.cached_token_expires_at) {
    const expiresAt = new Date(secretRow.cached_token_expires_at).getTime();
    if (expiresAt - now > 60_000) return secretRow.cached_access_token as string;
  }

  const { api_key, api_secret } = secretRow.secret_json as { api_key: string; api_secret: string };
  const { token, expiresAt } = await fetchFreshAccessToken(api_key, api_secret);
  const cachedExpiresAt = expiresAt && !Number.isNaN(Date.parse(expiresAt))
    ? new Date(expiresAt).toISOString()
    : new Date(now + TOKEN_CACHE_TTL_MS).toISOString();

  await admin
    .from("broker_secrets")
    .update({ cached_access_token: token, cached_token_expires_at: cachedExpiresAt })
    .eq("id", secretRow.id);

  return token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("authorization") ?? "";
    const verifyClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await verifyClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { action, payload } = await req.json();

    if (action === "connect") {
      const apiKey = payload?.api_key?.trim();
      const apiSecret = payload?.api_secret?.trim();
      if (!apiKey || !apiSecret) return json({ error: "API Key and API Secret are required" }, 400);

      // Live test against the real endpoint before persisting anything.
      let token: string, expiresAt: string | null;
      try {
        ({ token, expiresAt } = await fetchFreshAccessToken(apiKey, apiSecret));
      } catch (e) {
        return json({ error: `Could not authenticate with Groww: ${e instanceof Error ? e.message : e}` }, 400);
      }

      const cachedExpiresAt = expiresAt && !Number.isNaN(Date.parse(expiresAt))
        ? new Date(expiresAt).toISOString()
        : new Date(Date.now() + TOKEN_CACHE_TTL_MS).toISOString();

      const { error: upsertErr } = await admin.from("broker_secrets").upsert({
        user_id: user.id,
        broker_name: "groww",
        secret_json: { api_key: apiKey, api_secret: apiSecret },
        cached_access_token: token,
        cached_token_expires_at: cachedExpiresAt,
      }, { onConflict: "user_id,broker_name" });
      if (upsertErr) return json({ error: upsertErr.message }, 500);

      const { data: existingBroker } = await admin.from("brokers").select("id")
        .eq("user_id", user.id).eq("broker_name", "groww").maybeSingle();
      if (existingBroker) {
        await admin.from("brokers").update({
          status: "connected", config_json: {}, region: "INDIA",
          supported_markets: ["NSE", "BSE"], currency: "INR",
        }).eq("id", existingBroker.id);
      } else {
        const { data: newBroker } = await admin.from("brokers").insert({
          user_id: user.id, broker_name: "groww", display_name: "Groww", status: "connected",
          config_json: {}, region: "INDIA", supported_markets: ["NSE", "BSE"], currency: "INR",
        }).select().single();
        if (newBroker) {
          await admin.from("broker_accounts").insert({
            user_id: user.id, broker_id: newBroker.id, account_id: "GROWW",
            account_type: "live", balance: 0, currency: "INR",
          });
        }
      }
      return json({ data: { connected: true } });
    }

    if (action === "disconnect") {
      await admin.from("broker_secrets").delete().eq("user_id", user.id).eq("broker_name", "groww");
      await admin.from("brokers").update({ status: "disconnected" }).eq("user_id", user.id).eq("broker_name", "groww");
      return json({ data: { connected: false } });
    }

    // Every action below needs a live access token.
    const accessToken = await getAccessTokenForUser(admin, user.id);

    if (action === "holdings") {
      const data = await growwFetch(accessToken, "/holdings/user");
      return json({ data: data.holdings ?? [] });
    }

    if (action === "positions") {
      const segment = payload?.segment ?? "CASH";
      const data = await growwFetch(accessToken, `/positions/user?segment=${encodeURIComponent(segment)}`);
      return json({ data: data.positions ?? [] });
    }

    if (action === "funds") {
      const data = await growwFetch(accessToken, "/margins/detail/user");
      return json({
        data: {
          availableBalance: data.clear_cash ?? 0,
          usedMargin: data.net_margin_used ?? 0,
          totalBalance: (data.clear_cash ?? 0) + (data.net_margin_used ?? 0),
          currency: "INR",
        },
      });
    }

    if (action === "orders") {
      const segment = payload?.segment ?? "CASH";
      const data = await growwFetch(accessToken, `/order/list?segment=${encodeURIComponent(segment)}&page=0&page_size=50`);
      return json({ data: data.order_list ?? [] });
    }

    if (action === "market_quote") {
      const symbols: string[] = payload?.symbols ?? [];
      if (symbols.length === 0) return json({ data: {} });
      // Groww trading symbols are bare (RELIANCE), not Yahoo-style (RELIANCE.NS).
      const exchangeSymbols = symbols
        .map((s) => s.toUpperCase().replace(/\.(NS|BO)$/, ""))
        .map((s) => `NSE_${s}`)
        .join(",");
      const data = await growwFetch(accessToken, `/live-data/ltp?segment=CASH&exchange_symbols=${encodeURIComponent(exchangeSymbols)}`);
      return json({ data });
    }

    if (action === "place_order") {
      const p = payload ?? {};
      if (!p.tradingSymbol || !p.exchange || !p.side || !p.quantity) {
        return json({ error: "tradingSymbol, exchange, side and quantity are required" }, 400);
      }
      const orderBody = {
        trading_symbol: p.tradingSymbol,
        quantity: p.quantity,
        price: p.price ?? 0,
        trigger_price: p.triggerPrice ?? 0,
        validity: "DAY",
        exchange: p.exchange,
        segment: "CASH",
        product: p.product ?? "CNC",
        order_type: p.orderType ?? "MARKET",
        transaction_type: p.side,
        order_reference_id: `TS${Date.now().toString(36).toUpperCase()}`,
      };
      const data = await growwFetch(accessToken, "/order/create", { method: "POST", body: JSON.stringify(orderBody) });
      return json({ data });
    }

    if (action === "cancel_order") {
      const { order_id, segment } = payload ?? {};
      if (!order_id) return json({ error: "order_id is required" }, 400);
      const data = await growwFetch(accessToken, "/order/cancel", {
        method: "POST",
        body: JSON.stringify({ groww_order_id: order_id, segment: segment ?? "CASH" }),
      });
      return json({ data });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 502);
  }
});
