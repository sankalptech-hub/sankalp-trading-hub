// Supabase Edge Function: groww-proxy
//
// Server-side proxy for the Groww Trading API (https://groww.in/trade-api/docs).
// The user's Groww API key/TOTP secret NEVER reach the browser: they're posted
// here once (action=connect), stored in public.broker_secrets (service-role
// only, no client RLS access), and every subsequent action re-derives a fresh
// access token server-side by computing a live TOTP code from the stored
// secret (confirmed against Groww's real API-key dashboard: it issues an
// "API Key" + "TOTP Secret" pair for the key_type=totp flow — there is no
// key+secret+checksum "approval" flow exposed there).
//
// IMPORTANT: the exact shape of the POST /v1/token/api/access response wasn't
// fully pinned down from Groww's docs at implementation time (conflicting
// examples — some show a top-level `token`+`expiry`, others `payload.access_token`).
// extractAccessToken() below checks all the plausible shapes and throws with the
// raw body if none match, so a schema mismatch fails loudly on `connect` (which
// is a live test against the real endpoint) instead of silently breaking later.
//
// STATIC IP: SEBI requires order-placement calls to originate from a static
// IP registered against the API key. Supabase edge functions don't have one,
// so every Groww API call here routes through a small relay (see
// GROWW_RELAY_URL/GROWW_RELAY_SECRET below) running on a VPS with a fixed IP
// that's registered on Groww's API-key dashboard.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// SEBI requires order-placement calls to originate from a static IP
// registered against the API key. Supabase edge functions don't have one, so
// when GROWW_RELAY_URL/GROWW_RELAY_SECRET are configured (Supabase secrets),
// every Groww API call is routed through a small relay running on a VPS with
// a static IP (see supabase/functions/groww-proxy — repo docs / chat history
// for the relay's own source). Falls back to calling Groww directly if the
// relay isn't configured yet.
const RELAY_URL = Deno.env.get("GROWW_RELAY_URL"); // e.g. https://groww-relay.sankalp-tech.com
const RELAY_SECRET = Deno.env.get("GROWW_RELAY_SECRET");
const GROWW_BASE = RELAY_URL ? `${RELAY_URL}/v1` : "https://api.groww.in/v1";
const RELAY_HEADERS = RELAY_SECRET ? { "X-Relay-Secret": RELAY_SECRET } : {};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Standard TOTP (RFC 6238): base32-decode the secret, HMAC-SHA1 over the
// 30-second time-step counter, dynamic-truncate to a 6-digit code — the same
// algorithm Google Authenticator etc. use, which is what Groww's TOTP API
// keys are built on.
function base32Decode(input: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = "";
  for (const c of clean) {
    const val = alphabet.indexOf(c);
    if (val === -1) throw new Error("Invalid character in TOTP secret (expected base32)");
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(bytes);
}

async function generateTotp(base32Secret: string): Promise<string> {
  const key = base32Decode(base32Secret);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBytes = new Uint8Array(8);
  let temp = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = temp & 0xff;
    temp = Math.floor(temp / 256);
  }
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, counterBytes));
  const offset = hmac[hmac.length - 1] & 0xf;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binCode % 1_000_000).toString().padStart(6, "0");
}

// Groww's dashboard shows tokens as "Expires 6 AM tomorrow" — a fixed daily
// cutoff rather than a rolling TTL. Used as the fallback cache expiry when
// Groww's response doesn't include a parseable expiry field.
function nextSixAmIstIso(): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  const cutoff = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), 6, 0, 0));
  if (istNow.getUTCHours() >= 6) cutoff.setUTCDate(cutoff.getUTCDate() + 1);
  return new Date(cutoff.getTime() - IST_OFFSET_MS).toISOString();
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

async function fetchFreshAccessToken(apiKey: string, totpSecret: string) {
  const totp = await generateTotp(totpSecret);
  const res = await fetch(`${GROWW_BASE}/token/api/access`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...RELAY_HEADERS },
    body: JSON.stringify({ key_type: "totp", totp }),
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
      ...RELAY_HEADERS,
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

  const { api_key, totp_secret } = secretRow.secret_json as { api_key: string; totp_secret: string };
  const { token, expiresAt } = await fetchFreshAccessToken(api_key, totp_secret);
  const cachedExpiresAt = expiresAt && !Number.isNaN(Date.parse(expiresAt))
    ? new Date(expiresAt).toISOString()
    : nextSixAmIstIso();

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
      const totpSecret = payload?.totp_secret?.trim();
      if (!apiKey || !totpSecret) return json({ error: "API Key and TOTP Secret are required" }, 400);

      // Live test against the real endpoint before persisting anything.
      let token: string, expiresAt: string | null;
      try {
        ({ token, expiresAt } = await fetchFreshAccessToken(apiKey, totpSecret));
      } catch (e) {
        return json({ error: `Could not authenticate with Groww: ${e instanceof Error ? e.message : e}` }, 400);
      }

      const cachedExpiresAt = expiresAt && !Number.isNaN(Date.parse(expiresAt))
        ? new Date(expiresAt).toISOString()
        : nextSixAmIstIso();

      const { error: upsertErr } = await admin.from("broker_secrets").upsert({
        user_id: user.id,
        broker_name: "groww",
        secret_json: { api_key: apiKey, totp_secret: totpSecret },
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
