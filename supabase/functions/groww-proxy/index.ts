// Supabase Edge Function: groww-proxy
// Server-side proxy for the Groww Trading API (https://api.groww.in).
//
// Why a proxy:
//  - Groww API credentials (access token / api key / TOTP secret) must never live in the browser.
//  - The broker API has no CORS headers, so browser calls would fail anyway.
//
// Security model:
//  - Caller must present a valid Supabase user JWT (Authorization: Bearer <access_token>).
//  - Groww credentials are read per-user from public.integrations (provider='groww'):
//      config_json: { "API Key": "...", "TOTP Secret": "...", access_token?: "...", token_generated_at?: iso }
//  - Actions: portfolio, positions, orders, funds, place_order, cancel_order, market_quote
//
// Env vars (Supabase secrets):
//  - GROWW_API_KEY / GROWW_TOTP_SECRET : optional fallback (single-tenant setups)

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GROWW_BASE = "https://api.groww.in";
const API_VERSION = "1.0";
// Groww access tokens expire daily at 6:00 AM IST; refresh when older than 6h.
const TOKEN_MAX_AGE_MS = 6 * 60 * 60 * 1000;

interface GrowwConfig {
  apiKey: string;
  totpSecret?: string;
  accessToken?: string;
  tokenGeneratedAt?: string;
}

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonOk(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** RFC 6238 TOTP (SHA-1, 30s step, 6 digits) — WebCrypto-compatible. */
async function generateTotp(secretBase32: string): Promise<string> {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let clean = secretBase32.replace(/=+$/g, "").replace(/\s/g, "").toUpperCase();
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(bytes),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const counter = Math.floor(Date.now() / 30000);
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(4, counter); // 32-bit counter is fine until 2106; high word zero
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, buf));
  const offset = mac[mac.length - 1] & 0x0f;
  const code =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

/** Fetch (and cache per-user) a Groww access token, using TOTP or stored token. */
async function getAccessToken(
  admin: ReturnType<typeof createClient>,
  userId: string,
  cfg: GrowwConfig
): Promise<string> {
  const fresh = cfg.accessToken && cfg.tokenGeneratedAt &&
    Date.now() - new Date(cfg.tokenGeneratedAt).getTime() < TOKEN_MAX_AGE_MS;
  if (fresh) return cfg.accessToken!;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authorization": `Bearer ${cfg.apiKey}`,
  };
  let body: Record<string, string>;
  if (cfg.totpSecret) {
    body = { key_type: "totp", totp: await generateTotp(cfg.totpSecret) };
  } else {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const checksumBytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(cfg.apiKey + timestamp)
    );
    const checksum = Array.from(new Uint8Array(checksumBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    body = { key_type: "approval", checksum, timestamp };
  }

  const res = await fetch(`${GROWW_BASE}/v1/token/api/access`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.status !== "SUCCESS" || !json?.payload?.token) {
    const msg = json?.error?.message ?? `Groww token request failed (${res.status})`;
    throw new Error(msg);
  }

  // Persist the fresh token so subsequent calls skip the TOTP round-trip.
  await admin
    .from("integrations")
    .update({
      config_json: {
        ...cfg,
        apiKey: undefined,
        totpSecret: undefined,
        accessToken: json.payload.token,
        tokenGeneratedAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "groww");

  return json.payload.token;
}

function growwHeaders(token: string): Record<string, string> {
  return {
    "Accept": "application/json",
    "Authorization": `Bearer ${token}`,
    "X-API-VERSION": API_VERSION,
  };
}

async function growwGet(token: string, path: string): Promise<unknown> {
  const res = await fetch(`${GROWW_BASE}${path}`, { headers: growwHeaders(token) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.status !== "SUCCESS") {
    throw new Error(json?.error?.message ?? `Groww API error on ${path} (${res.status})`);
  }
  return json.payload;
}

async function growwPost(token: string, path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${GROWW_BASE}${path}`, {
    method: "POST",
    headers: { ...growwHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.status !== "SUCCESS") {
    throw new Error(json?.error?.message ?? `Groww API error on ${path} (${res.status})`);
  }
  return json.payload;
}

/** Map a Yahoo-style symbol (RELIANCE.NS / AAPL) to a Groww exchange + trading symbol. */
function toGrowwSymbol(symbol: string): { exchange: string; tradingSymbol: string; segment: string } {
  const upper = symbol.toUpperCase();
  if (upper.endsWith(".NS") || upper.endsWith(".BO")) {
    return { exchange: upper.endsWith(".NS") ? "NSE" : "BSE", tradingSymbol: upper.replace(/\.(NS|BO)$/, ""), segment: "CASH" };
  }
  // Bare symbol: assume NSE cash equity (Groww covers NSE/BSE only).
  return { exchange: "NSE", tradingSymbol: upper, segment: "CASH" };
}

interface OrderPayload {
  tradingSymbol?: string;
  exchange?: string;
  side?: string;
  orderType?: string;
  quantity?: number;
  price?: number;
  triggerPrice?: number;
  product?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonError(405, "Use POST");

  // ── Authenticate the caller via their Supabase JWT ─────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const verify = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: userErr } = await verify.auth.getUser();
  if (userErr || !user) return jsonError(401, "Unauthorized");

  let body: { action?: string; payload?: Record<string, unknown> };
  try { body = await req.json(); } catch { return jsonError(400, "Invalid JSON body"); }
  const action = body.action ?? "";
  const payload = body.payload ?? {};

  // Service-role client for reading credentials + writing user rows.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Load this user's Groww credentials (user row first, then env fallback) ──
  const { data: integ } = await admin
    .from("integrations")
    .select("config_json")
    .eq("user_id", user.id)
    .eq("provider", "groww")
    .maybeSingle();
  const cfgJson = (integ?.config_json ?? {}) as Record<string, string>;
  const apiKey = cfgJson["API Key"] ?? Deno.env.get("GROWW_API_KEY") ?? "";
  const totpSecret = cfgJson["TOTP Secret"] ?? Deno.env.get("GROWW_TOTP_SECRET") ?? "";
  if (!apiKey) return jsonError(400, "Groww is not connected. Add your API key on the Brokers page.");
  const cfg: GrowwConfig = {
    apiKey,
    totpSecret,
    accessToken: cfgJson.access_token,
    tokenGeneratedAt: cfgJson.token_generated_at,
  };

  try {
    const token = await getAccessToken(admin, user.id, cfg);

    switch (action) {
      case "portfolio": {
        const p = (await growwGet(token, "/v1/holdings/user")) as { holdings?: Record<string, unknown>[] };
        const holdings = p.holdings ?? [];
        // Enrich each holding with its LTP so the UI can show value + P&L.
        if (holdings.length > 0) {
          const symbols = holdings.map((h) => `NSE_${h.trading_symbol}`).join(",");
          const ltp = (await growwGet(
            token,
            `/v1/live-data/ltp?segment=CASH&exchange_symbols=${encodeURIComponent(symbols)}`
          )) as Record<string, number>;
          for (const h of holdings) {
            const ltpVal = ltp[`NSE_${h.trading_symbol}`] ?? 0;
            h.ltp = ltpVal;
            h.currentValue = ltpVal * Number(h.quantity ?? 0);
            h.pnl = h.currentValue - Number(h.average_price ?? 0) * Number(h.quantity ?? 0);
            const avg = Number(h.average_price ?? 0);
            h.pnlPercent = avg > 0 ? ((ltpVal - avg) / avg) * 100 : 0;
          }
        }
        return jsonOk({ data: holdings });
      }

      case "positions": {
        const p = (await growwGet(token, "/v1/positions/user?segment=CASH")) as { positions?: Record<string, unknown>[] };
        const positions = (p.positions ?? []).map((pos) => {
          const qty = Number(pos.quantity ?? 0);
          const net = Number(pos.net_price ?? 0);
          return {
            tradingSymbol: pos.trading_symbol,
            exchange: pos.exchange,
            quantity: qty,
            averagePrice: net,
            side: qty >= 0 ? "BUY" : "SELL",
          };
        });
        return jsonOk({ data: positions });
      }

      case "orders": {
        const p = (await growwGet(token, "/v1/order/list?segment=CASH&page=0&page_size=100")) as { order_list?: Record<string, unknown>[] };
        const orders = (p.order_list ?? []).map((o) => ({
          orderId: o.groww_order_id,
          tradingSymbol: o.trading_symbol,
          exchange: o.exchange,
          side: o.transaction_type,
          orderType: o.order_type,
          price: Number(o.price ?? 0),
          quantity: Number(o.quantity ?? 0),
          filledQuantity: Number(o.filled_quantity ?? 0),
          status: o.order_status,
          createdAt: o.created_at,
        }));
        return jsonOk({ data: orders });
      }

      case "funds": {
        const p = (await growwGet(token, "/v1/margins/detail/user")) as Record<string, unknown>;
        const equity = (p.equity_margin_details ?? {}) as Record<string, unknown>;
        const available = Number(equity.cnc_balance_available ?? p.clear_cash ?? 0) +
          Number(equity.mis_balance_available ?? 0);
        return jsonOk({
          data: {
            availableBalance: available,
            usedMargin: Number(p.net_margin_used ?? 0),
            totalBalance: available + Number(p.net_margin_used ?? 0),
            currency: "INR",
          },
        });
      }

      case "place_order": {
        const o = payload as OrderPayload;
        if (!o.tradingSymbol || !o.quantity || !o.side) return jsonError(400, "tradingSymbol, quantity and side are required");
        const g = toGrowwSymbol(o.tradingSymbol);
        const orderType = (o.orderType ?? "MARKET").toUpperCase();
        const body = {
          trading_symbol: g.tradingSymbol,
          quantity: Number(o.quantity),
          price: Number(o.price ?? 0),
          trigger_price: Number(o.triggerPrice ?? 0),
          validity: "DAY",
          exchange: o.exchange ?? g.exchange,
          segment: g.segment,
          product: o.product ?? "CNC",
          order_type: orderType,
          transaction_type: o.side.toUpperCase(),
          order_reference_id: `TS${Date.now().toString().slice(-13)}`.slice(0, 20),
        };
        const p = (await growwPost(token, "/v1/order/create", body)) as Record<string, unknown>;
        return jsonOk({ data: { orderId: p.groww_order_id, status: p.order_status } });
      }

      case "cancel_order": {
        const orderId = (payload as { order_id?: string }).order_id;
        if (!orderId) return jsonError(400, "order_id is required");
        const p = (await growwPost(token, "/v1/order/cancel", { segment: "CASH", groww_order_id: orderId })) as Record<string, unknown>;
        return jsonOk({ data: { success: p.order_status === "CANCELLED", status: p.order_status } });
      }

      case "market_quote": {
        const symbols = (payload as { symbols?: string[] }).symbols ?? [];
        if (symbols.length === 0 || symbols.length > 50) return jsonError(400, "symbols must contain 1-50 entries");
        const exSyms = symbols.map((s) => {
          const g = toGrowwSymbol(s);
          return `${g.exchange}_${g.tradingSymbol}`;
        });
        const ltp = (await growwGet(
          token,
          `/v1/live-data/ltp?segment=CASH&exchange_symbols=${encodeURIComponent(exSyms.join(","))}`
        )) as Record<string, number>;
        const out: Record<string, { ltp: number }> = {};
        symbols.forEach((s, i) => { out[s] = { ltp: Number(ltp[exSyms[i]] ?? 0) }; });
        return jsonOk({ data: out });
      }

      default:
        return jsonError(400, `Unknown action: ${action}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Groww proxy failure";
    // Auth-ish failures mean the stored token/key is bad — drop it so next call re-authenticates.
    if (/authori|token|GA005|401/i.test(message)) {
      await admin.from("integrations").update({
        config_json: { ...cfgJson, access_token: null, token_generated_at: null },
      }).eq("user_id", user.id).eq("provider", "groww");
    }
    return jsonError(502, message);
  }
});
