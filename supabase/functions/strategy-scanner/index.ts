// Supabase Edge Function: strategy-scanner
//
// Background market scanner. Each invocation scans ONE chunk (default 250
// symbols) of NSE's full equity universe (public.nse_universe, refreshed
// daily by refresh-universe) — not the whole exchange at once, which isn't
// feasible within a single request (Yahoo rate limits, function timeouts).
// A cursor (public.strategy_scan_cursor) tracks rotation position so the
// full ~2,664-stock universe cycles through over consecutive ticks
// (roughly every 2-3 hours at 15-minute intervals).
//
// Computes four standard technical-analysis heuristics (Breakout / Scalping
// / Big Money / Smart Money — same definitions as src/lib/marketData.ts,
// ported here since edge functions can't import the Vite frontend's TS
// modules directly). Unlike the old fixed-universe version, this UPSERTS
// matches and DELETES non-matches per symbol in the current chunk only —
// it must never touch rows for symbols outside this tick's chunk, since
// those were written by earlier/later ticks scanning different chunks and
// are still valid until their own turn comes back around.
//
// Invoked two ways: (1) a pg_cron job every 15 minutes during market hours
// (see the full_nse_universe_scanner migration), using the service-role key
// as its bearer token; (2) a manual "Refresh now" button in the UI, using
// the calling user's own session. Both pass verify_jwt's check, so no extra
// auth logic is needed here.
//
// AI layer: every symbol that matches any category this tick also gets a
// genuine AI-authored BUY/SELL/HOLD call (uncapped — every match, not a
// sample), written to public.ai_signals, using whichever provider/model the
// user connected in Settings (Anthropic, or any OpenAI-compatible vendor
// like NVIDIA NIM/OpenRouter/Groq). This is additive and silently no-ops if
// nothing is connected yet; the rule-based scan results above are always
// written regardless.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Candle { date: string; open: number; high: number; low: number; close: number; volume: number }

async function fetchCandles(symbol: string): Promise<Candle[]> {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`,
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; SankalpTradingHub/1.0)" } }
  );
  if (!res.ok) throw new Error(`Yahoo returned ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("No chart data");
  const timestamps: number[] = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  return timestamps
    .map((t: number, i: number) => ({
      date: new Date(t * 1000).toISOString().split("T")[0],
      open: q.open?.[i] ?? null, high: q.high?.[i] ?? null, low: q.low?.[i] ?? null,
      close: q.close?.[i] ?? null, volume: q.volume?.[i] ?? null,
    }))
    .filter((c: any) => c.close !== null && c.open !== null && c.high !== null && c.low !== null && c.volume !== null);
}

function computeATR(data: Candle[], period = 14): (number | null)[] {
  const trueRanges = data.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prevClose = data[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
  });
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = trueRanges.slice(i - period + 1, i + 1);
    return slice.reduce((s, v) => s + v, 0) / period;
  });
}

function detectBreakout(candles: Candle[]) {
  if (candles.length < 21) return null;
  const today = candles[candles.length - 1];
  const prior = candles.slice(-21, -1);
  const resistance20 = Math.max(...prior.map((c) => c.high));
  const avgVolume20 = prior.reduce((s, c) => s + c.volume, 0) / prior.length;
  if (today.close <= resistance20 || avgVolume20 <= 0) return null;
  return {
    resistance20,
    pctAboveResistance: ((today.close - resistance20) / resistance20) * 100,
    volumeRatio: today.volume / avgVolume20,
  };
}

function computeScalpScore(candles: Candle[]) {
  if (candles.length < 15) return null;
  const recent = candles.slice(-20);
  const atrSeries = computeATR(recent, 14);
  const lastAtr = atrSeries.filter((v): v is number => v !== null).pop();
  const lastClose = recent[recent.length - 1].close;
  if (!lastAtr || !lastClose) return null;
  const atrPct = (lastAtr / lastClose) * 100;
  const avgVolume20 = recent.reduce((s, c) => s + c.volume, 0) / recent.length;
  const avgTurnoverCr = (avgVolume20 * lastClose) / 1e7;
  const atrScore = Math.max(0, Math.min(100, (atrPct / 4) * 100));
  const liquidityScore = Math.max(0, Math.min(100, (Math.log10(avgTurnoverCr + 1) / Math.log10(500)) * 100));
  return { atrPct, avgTurnoverCr, score: Math.round((atrScore + liquidityScore) / 2) };
}

function detectBigMoney(candles: Candle[]) {
  if (candles.length < 11) return null;
  const today = candles[candles.length - 1];
  const prior = candles.slice(-11, -1);
  const avgTurnoverCr = prior.reduce((s, c) => s + c.close * c.volume, 0) / prior.length / 1e7;
  if (avgTurnoverCr <= 0) return null;
  const turnoverTodayCr = (today.close * today.volume) / 1e7;
  const turnoverRatio = turnoverTodayCr / avgTurnoverCr;
  if (turnoverRatio < 1.5) return null;
  return { turnoverTodayCr, avgTurnoverCr, turnoverRatio };
}

function detectSmartMoney(candles: Candle[]) {
  if (candles.length < 11) return null;
  const today = candles[candles.length - 1];
  const prior = candles.slice(-11, -1);
  const avgVolume10 = prior.reduce((s, c) => s + c.volume, 0) / prior.length;
  const prevClose = prior[prior.length - 1]?.close;
  if (avgVolume10 <= 0 || !prevClose) return null;
  const volumeRatio = today.volume / avgVolume10;
  const changePercent = ((today.close - prevClose) / prevClose) * 100;
  if (volumeRatio < 1.4 || Math.abs(changePercent) < 1) return null;
  return { volumeRatio, changePercent, direction: changePercent > 0 ? "Accumulation" : "Distribution" };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

// Human-readable description of exactly which numbers tripped a category's
// heuristic, so the AI prompt is grounded in the same data the rule-based
// scan used to flag this symbol — not just generic price/volume.
function describeCategoryMatch(category: string, metrics: Record<string, unknown>): string {
  switch (category) {
    case "breakout":
      return `Flagged for BREAKOUT: closed ${(metrics.pctAboveResistance as number).toFixed(2)}% above its 20-day resistance of ${(metrics.resistance20 as number).toFixed(2)}, on ${(metrics.volumeRatio as number).toFixed(2)}x its 20-day average volume.`;
    case "scalp":
      return `Flagged for SCALPING: ATR is ${(metrics.atrPct as number).toFixed(2)}% of price, average daily turnover ~₹${(metrics.avgTurnoverCr as number).toFixed(1)} crore, composite volatility/liquidity score ${metrics.score}/100.`;
    case "big_money":
      return `Flagged for BIG MONEY: today's turnover is ₹${(metrics.turnoverTodayCr as number).toFixed(1)} crore vs a 10-day average of ₹${(metrics.avgTurnoverCr as number).toFixed(1)} crore — a ${(metrics.turnoverRatio as number).toFixed(2)}x spike.`;
    case "smart_money":
      return `Flagged for SMART MONEY ${(metrics.direction as string).toUpperCase()}: volume is ${(metrics.volumeRatio as number).toFixed(2)}x the 10-day average alongside a ${(metrics.changePercent as number).toFixed(2)}% price move.`;
    default:
      return "";
  }
}

interface AiMatch {
  symbol: string; category: string; price: number; change_percent: number; metrics: Record<string, unknown>;
}

// Genuine AI-authored call for every match the deterministic scan found this
// tick (uncapped, per the user's explicit instruction — every match gets a
// real AI-reasoned signal, not a sampled subset). No-ops cleanly if the
// user hasn't connected an AI provider in Settings yet; the rule-based scan
// results above are written regardless of AI availability.
async function generateAiSignals(admin: ReturnType<typeof createClient>, matches: AiMatch[]) {
  if (matches.length === 0) return { attempted: 0, written: 0 };

  const { data: secretRow } = await admin.from("ai_provider_secrets").select("api_key").eq("id", true).maybeSingle();
  const { data: settingsRow } = await admin.from("ai_provider_settings").select("selected_model, connected, provider, base_url").eq("id", true).maybeSingle();
  if (!secretRow || !settingsRow?.connected) return { attempted: 0, written: 0 };

  const apiKey = secretRow.api_key as string;
  const model = (settingsRow.selected_model as string) || "claude-haiku-4-5-20251001";
  const provider = (settingsRow.provider as string) || "anthropic";
  const baseUrl = (settingsRow.base_url as string) || "";
  const isAnthropic = provider === "anthropic";
  const aiUrl = isAnthropic ? `${ANTHROPIC_BASE}/messages` : `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const aiHeaders: Record<string, string> = isAnthropic
    ? { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json" }
    : { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
  const now = new Date().toISOString();

  let written = 0;
  await mapLimit(matches, 5, async (m) => {
    try {
      const cur = "₹";
      const prompt = `You are a disciplined equity research analyst producing a real trading call for a family's personal trading tool (not published financial advice). Base your call ONLY on the data below; do not invent facts not given here.

Symbol: ${m.symbol}
Price: ${cur}${m.price.toFixed(2)}
Day change: ${m.change_percent >= 0 ? "+" : ""}${m.change_percent.toFixed(2)}%
${describeCategoryMatch(m.category, m.metrics)}

Respond with ONLY a single valid JSON object, no other text, in exactly this shape:
{"signal": "BUY" | "SELL" | "HOLD", "confidence": <integer 0-100>, "rationale": "<2-3 sentences, specific, citing the actual numbers above>", "risks": ["<specific risk 1>", "<specific risk 2>"]}`;

      const aiRes = await fetch(aiUrl, {
        method: "POST",
        headers: aiHeaders,
        body: JSON.stringify({ model, max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
      });
      if (!aiRes.ok) return;
      const aiBody = await aiRes.json().catch(() => ({}));
      const text: string = isAnthropic ? (aiBody?.content?.[0]?.text ?? "") : (aiBody?.choices?.[0]?.message?.content ?? "");
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
      if (!["BUY", "SELL", "HOLD"].includes(parsed.signal)) return;

      const { error } = await admin.from("ai_signals").upsert({
        symbol: m.symbol, category: m.category, signal: parsed.signal,
        confidence: Math.max(0, Math.min(100, Math.round(parsed.confidence))),
        rationale: parsed.rationale, risks: parsed.risks ?? [],
        price: m.price, model, provider, computed_at: now,
      }, { onConflict: "symbol,category" });
      if (!error) written++;
    } catch {
      // One symbol's AI call failing must never take down the rest of the
      // chunk's scan — the deterministic result already stands on its own.
    }
  });

  return { attempted: matches.length, written };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const { count: totalCount, error: countErr } = await admin
      .from("nse_universe").select("*", { count: "exact", head: true });
    if (countErr) throw new Error(`count nse_universe: ${countErr.message}`);
    if (!totalCount || totalCount === 0) throw new Error("nse_universe is empty — run refresh-universe first");

    const { data: cursorRow, error: cursorErr } = await admin
      .from("strategy_scan_cursor").select("*").eq("id", true).single();
    if (cursorErr) throw new Error(`read cursor: ${cursorErr.message}`);

    const chunkSize = cursorRow.chunk_size;
    const offset = cursorRow.next_offset % totalCount;

    // Fetch the chunk, wrapping around to the start of the list if this
    // chunk would run past the end.
    const { data: firstPart, error: firstErr } = await admin
      .from("nse_universe").select("symbol").order("symbol").range(offset, offset + chunkSize - 1);
    if (firstErr) throw new Error(`read chunk: ${firstErr.message}`);

    let chunkSymbols = (firstPart ?? []).map((r) => r.symbol as string);
    if (chunkSymbols.length < chunkSize && offset + chunkSize > totalCount) {
      const remaining = chunkSize - chunkSymbols.length;
      const { data: wrapPart, error: wrapErr } = await admin
        .from("nse_universe").select("symbol").order("symbol").range(0, remaining - 1);
      if (wrapErr) throw new Error(`read wrap chunk: ${wrapErr.message}`);
      chunkSymbols = chunkSymbols.concat((wrapPart ?? []).map((r) => r.symbol as string));
    }

    type Row = {
      symbol: string; price: number; change_percent: number;
      breakout: ReturnType<typeof detectBreakout>;
      scalp: ReturnType<typeof computeScalpScore>;
      bigMoney: ReturnType<typeof detectBigMoney>;
      smartMoney: ReturnType<typeof detectSmartMoney>;
    };

    const rows = await mapLimit(chunkSymbols, 6, async (symbol): Promise<Row | null> => {
      try {
        const candles = await fetchCandles(symbol);
        if (candles.length < 11) return null;
        const today = candles[candles.length - 1];
        const prevClose = candles[candles.length - 2]?.close ?? today.close;
        return {
          symbol,
          price: today.close,
          change_percent: prevClose ? ((today.close - prevClose) / prevClose) * 100 : 0,
          breakout: detectBreakout(candles),
          scalp: computeScalpScore(candles),
          bigMoney: detectBigMoney(candles),
          smartMoney: detectSmartMoney(candles),
        };
      } catch {
        return null;
      }
    });

    const valid = rows.filter((r): r is Row => r !== null);
    const now = new Date().toISOString();

    const categories: { category: string; pick: (r: Row) => Record<string, unknown> | null }[] = [
      { category: "breakout", pick: (r) => r.breakout },
      { category: "scalp", pick: (r) => r.scalp },
      { category: "big_money", pick: (r) => r.bigMoney },
      { category: "smart_money", pick: (r) => r.smartMoney },
    ];

    let totalWritten = 0;
    const aiMatches: AiMatch[] = [];
    for (const { category, pick } of categories) {
      const matches = valid.map((r) => ({ r, metrics: pick(r) })).filter((x) => x.metrics !== null);
      const nonMatchSymbols = valid.filter((r) => pick(r) === null).map((r) => r.symbol);

      if (matches.length > 0) {
        const { error: upsertErr } = await admin.from("strategy_scan_results").upsert(
          matches.map(({ r, metrics }) => ({
            symbol: r.symbol, category, price: r.price, change_percent: r.change_percent,
            metrics, computed_at: now,
          })),
          { onConflict: "symbol,category" }
        );
        if (upsertErr) throw new Error(`upsert ${category}: ${upsertErr.message}`);
        totalWritten += matches.length;
        for (const { r, metrics } of matches) {
          aiMatches.push({ symbol: r.symbol, category, price: r.price, change_percent: r.change_percent, metrics: metrics as Record<string, unknown> });
        }
      }

      // Symbols in this chunk that no longer match get their stale row
      // removed (only these — never touch symbols outside this chunk).
      if (nonMatchSymbols.length > 0) {
        const { error: delErr } = await admin.from("strategy_scan_results")
          .delete().eq("category", category).in("symbol", nonMatchSymbols);
        if (delErr) throw new Error(`delete stale ${category}: ${delErr.message}`);
        // Same discipline for the AI-authored signal table: a symbol that
        // dropped out of this category's match set no longer has a genuine
        // basis for its old AI call, so retire it too.
        await admin.from("ai_signals").delete().eq("category", category).in("symbol", nonMatchSymbols);
      }
    }

    // Every match this tick gets a real AI-authored signal — uncapped, no
    // sampling. Silently skipped if AI isn't connected yet (see
    // generateAiSignals); never blocks the deterministic scan above.
    const aiResult = await generateAiSignals(admin, aiMatches);

    const nextOffset = (offset + chunkSymbols.length) % totalCount;
    const { error: advanceErr } = await admin.from("strategy_scan_cursor")
      .update({ next_offset: nextOffset, updated_at: now }).eq("id", true);
    if (advanceErr) throw new Error(`advance cursor: ${advanceErr.message}`);

    return new Response(
      JSON.stringify({
        universeSize: totalCount, chunkOffset: offset, chunkScanned: chunkSymbols.length,
        loaded: valid.length, written: totalWritten, nextOffset, at: now,
        aiSignalsAttempted: aiResult.attempted, aiSignalsWritten: aiResult.written,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
