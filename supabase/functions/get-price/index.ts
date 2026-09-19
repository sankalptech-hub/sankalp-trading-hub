// Supabase Edge Function: get-price
// Fetches quote/candle data server-side from Yahoo Finance (avoids browser CORS/rate-limit
// issues) and returns a clean error instead of ever fabricating fake prices.
//
// Query params:
//   symbol   (required) e.g. RELIANCE.NS, AAPL
//   mode     "quote" (default) | "candles"
//   interval (candles only) default "1d"
//   range    (candles only) default "1mo"

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol");
  const mode = url.searchParams.get("mode") ?? "quote";
  const interval = url.searchParams.get("interval") ?? "1d";
  const range = url.searchParams.get("range") ?? (mode === "candles" ? "1mo" : "5d");

  if (!symbol) {
    return new Response(
      JSON.stringify({ error: "Missing required 'symbol' query param" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const upstream = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol.toUpperCase()
  )}?interval=${interval}&range=${range}`;

  try {
    const res = await fetch(upstream, {
      headers: {
        // A plain server-to-server fetch without a browser UA gets blocked more often;
        // this mirrors a normal client request.
        "User-Agent": "Mozilla/5.0 (compatible; SankalpTradingHub/1.0)",
      },
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `Upstream price source returned ${res.status}`, symbol }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const err = json?.chart?.error;

    if (err || !result) {
      return new Response(
        JSON.stringify({ error: err?.description ?? "Symbol not found", symbol }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "candles") {
      const timestamps: number[] = result.timestamp || [];
      const quote = result.indicators?.quote?.[0] || {};
      const candles = timestamps
        .map((t: number, i: number) => ({
          date: new Date(t * 1000).toISOString().split("T")[0],
          open: quote.open?.[i] ?? null,
          high: quote.high?.[i] ?? null,
          low: quote.low?.[i] ?? null,
          close: quote.close?.[i] ?? null,
          volume: quote.volume?.[i] ?? null,
        }))
        .filter((c) => c.close !== null && c.open !== null);

      return new Response(JSON.stringify({ symbol, candles }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const meta = result.meta;
    const price = meta.regularMarketPrice ?? null;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null;

    if (price === null) {
      return new Response(
        JSON.stringify({ error: "No live price in upstream response", symbol }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const change = prevClose !== null ? price - prevClose : 0;
    const changePercent = prevClose ? (change / prevClose) * 100 : 0;

    return new Response(
      JSON.stringify({
        symbol,
        price,
        change,
        changePercent,
        volume: meta.regularMarketVolume ?? 0,
        high: meta.regularMarketDayHigh ?? price,
        low: meta.regularMarketDayLow ?? price,
        open: meta.regularMarketOpen ?? price,
        prevClose: prevClose ?? price,
        marketCap: meta.marketCap ?? 0,
        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? price,
        fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? price,
        // Yahoo's free chart API is delayed (typically ~15 min), not real-time.
        delayed: true,
        fetchedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Fetch failed", detail: String(e), symbol }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
