// Supabase Edge Function: ai-signal
//
// On-demand AI-authored trading signal for one symbol (used by the Trade
// and Scanner pages' "Generate Signal" buttons). Fetches real price/
// technical/fundamental data, feeds it to Claude (the user's own connected
// Anthropic API key + model, via ai_provider_secrets/ai_provider_settings),
// and returns a genuinely reasoned BUY/SELL/HOLD call — not a canned
// threshold formula. Also upserts into ai_signals (category='manual') so
// it shows up alongside the background-scan-generated signals.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

interface Candle { date: string; open: number; high: number; low: number; close: number; volume: number }

async function fetchQuoteAndCandles(symbol: string) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`,
    { headers: { "User-Agent": UA } }
  );
  if (!res.ok) throw new Error(`Upstream price source returned ${res.status}`);
  const j = await res.json();
  const result = j?.chart?.result?.[0];
  if (!result) throw new Error("Symbol not found");
  const meta = result.meta;
  const timestamps: number[] = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const candles: Candle[] = timestamps
    .map((t: number, i: number) => ({
      date: new Date(t * 1000).toISOString().split("T")[0],
      open: q.open?.[i] ?? null, high: q.high?.[i] ?? null, low: q.low?.[i] ?? null,
      close: q.close?.[i] ?? null, volume: q.volume?.[i] ?? null,
    }))
    .filter((c: any) => c.close !== null && c.open !== null && c.high !== null && c.low !== null && c.volume !== null);

  const price = meta.regularMarketPrice ?? candles[candles.length - 1]?.close ?? null;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
  if (price === null) throw new Error("No live price available");

  return {
    price, candles,
    changePercent: prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
    dayHigh: meta.regularMarketDayHigh ?? price,
    dayLow: meta.regularMarketDayLow ?? price,
    volume: meta.regularMarketVolume ?? 0,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? price,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? price,
  };
}

function computeRSI(data: Candle[], period = 14): number | null {
  if (data.length < period + 1) return null;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i].close - data[i - 1].close;
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i].close - data[i - 1].close;
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
}

// Best-effort fundamentals via Yahoo's quoteSummary (needs a cookie+crumb
// session — see get-price's fundamentals mode for the full explanation).
// Failure here shouldn't block signal generation, just means less grounding.
async function fetchFundamentalsBestEffort(symbol: string) {
  try {
    const cookieRes = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA } });
    const cookie = (cookieRes.headers.get("set-cookie") ?? "").split(";")[0];
    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": UA, Cookie: cookie } });
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.includes("<")) return null;
    const res = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail,financialData&crumb=${encodeURIComponent(crumb)}`,
      { headers: { "User-Agent": UA, Cookie: cookie } }
    );
    if (!res.ok) return null;
    const j = await res.json();
    const result = j?.quoteSummary?.result?.[0];
    if (!result) return null;
    const num = (v: any) => (typeof v?.raw === "number" ? v.raw : null);
    return {
      trailingPE: num(result.summaryDetail?.trailingPE),
      revenueGrowth: num(result.financialData?.revenueGrowth),
      returnOnEquity: num(result.financialData?.returnOnEquity),
      debtToEquity: num(result.financialData?.debtToEquity),
      recommendationKey: result.financialData?.recommendationKey ?? null,
    };
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("authorization") ?? "";
    const verifyClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await verifyClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const { symbol } = await req.json();
    if (!symbol) return json({ error: "symbol is required" }, 400);
    const upperSymbol = String(symbol).toUpperCase();

    const { data: secretRow } = await admin.from("ai_provider_secrets").select("api_key").eq("id", true).maybeSingle();
    const { data: settingsRow } = await admin.from("ai_provider_settings").select("selected_model, connected").eq("id", true).maybeSingle();
    if (!secretRow || !settingsRow?.connected) {
      return json({ error: "AI provider not connected — connect your Anthropic API key in Settings first" }, 400);
    }
    const model = settingsRow.selected_model || "claude-haiku-4-5-20251001";

    const quote = await fetchQuoteAndCandles(upperSymbol);
    const rsi = computeRSI(quote.candles, 14);
    const fundamentals = await fetchFundamentalsBestEffort(upperSymbol);

    const cur = upperSymbol.endsWith(".NS") || upperSymbol.endsWith(".BO") ? "₹" : "$";
    const prompt = `You are a disciplined equity research analyst producing a real trading call for a family's personal trading tool (not published financial advice — the user understands this is one input among others). Base your call ONLY on the data below; do not invent facts not given here.

Symbol: ${upperSymbol}
Price: ${cur}${quote.price.toFixed(2)}
Day change: ${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%
Day range: ${cur}${quote.dayLow.toFixed(2)} - ${cur}${quote.dayHigh.toFixed(2)}
52-week range: ${cur}${quote.fiftyTwoWeekLow.toFixed(2)} - ${cur}${quote.fiftyTwoWeekHigh.toFixed(2)}
Volume: ${quote.volume.toLocaleString()}
RSI(14): ${rsi !== null ? rsi.toFixed(1) : "unavailable"}
${fundamentals ? `Trailing PE: ${fundamentals.trailingPE?.toFixed(1) ?? "N/A"}
Revenue growth (YoY): ${fundamentals.revenueGrowth != null ? (fundamentals.revenueGrowth * 100).toFixed(1) + "%" : "N/A"}
Return on equity: ${fundamentals.returnOnEquity != null ? (fundamentals.returnOnEquity * 100).toFixed(1) + "%" : "N/A"}
Debt/Equity: ${fundamentals.debtToEquity?.toFixed(1) ?? "N/A"}` : "Fundamentals: unavailable for this symbol"}

Respond with ONLY a single valid JSON object, no other text, in exactly this shape:
{"signal": "BUY" | "SELL" | "HOLD", "confidence": <integer 0-100>, "rationale": "<2-3 sentences, specific, citing the actual numbers above>", "risks": ["<specific risk 1>", "<specific risk 2>"]}`;

    const aiRes = await fetch(`${ANTHROPIC_BASE}/messages`, {
      method: "POST",
      headers: { "x-api-key": secretRow.api_key, "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
    });
    const aiBody = await aiRes.json().catch(() => ({}));
    if (!aiRes.ok) {
      return json({ error: aiBody?.error?.message || `Anthropic API error (HTTP ${aiRes.status})` }, 502);
    }
    const text: string = aiBody?.content?.[0]?.text ?? "";
    let parsed: { signal: string; confidence: number; rationale: string; risks: string[] };
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      return json({ error: `Could not parse AI response: ${text.slice(0, 200)}` }, 502);
    }
    if (!["BUY", "SELL", "HOLD"].includes(parsed.signal)) {
      return json({ error: `AI returned an invalid signal: ${parsed.signal}` }, 502);
    }

    const now = new Date().toISOString();
    await admin.from("ai_signals").upsert({
      symbol: upperSymbol, category: "manual", signal: parsed.signal,
      confidence: Math.max(0, Math.min(100, Math.round(parsed.confidence))),
      rationale: parsed.rationale, risks: parsed.risks ?? [],
      price: quote.price, model, computed_at: now,
    }, { onConflict: "symbol,category" });

    return json({ data: { symbol: upperSymbol, price: quote.price, model, ...parsed, computed_at: now } });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
