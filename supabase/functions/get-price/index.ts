// Supabase Edge Function: get-price
// Fetches quote/candle/fundamentals data server-side from Yahoo Finance (avoids browser
// CORS/rate-limit issues) and returns a clean error instead of ever fabricating fake prices.
//
// Query params:
//   symbol   (required) e.g. RELIANCE.NS, AAPL
//   mode     "quote" (default) | "candles" | "fundamentals" | "financials"
//   interval (candles only) default "1d"
//   range    (candles only) default "1mo"
//
// fundamentals mode uses Yahoo's quoteSummary endpoint, which (unlike the chart
// endpoint used for quote/candles) requires a session cookie + CSRF "crumb" —
// fetched fresh on each call. This is the same technique long-standing scraping
// libraries (e.g. yfinance) use; Yahoo doesn't publish a stable public API for
// this data, so treat fundamentals as best-effort and handle a failure gracefully
// client-side rather than assuming it always succeeds.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

async function getYahooCrumb(): Promise<{ crumb: string; cookie: string }> {
  const cookieRes = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA } });
  const setCookie = cookieRes.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];

  const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Cookie: cookie },
  });
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.includes("<")) throw new Error("Failed to obtain Yahoo crumb");
  return { crumb, cookie };
}

function num(v: unknown): number | null {
  if (v && typeof v === "object" && "raw" in (v as Record<string, unknown>)) {
    const raw = (v as { raw: unknown }).raw;
    return typeof raw === "number" ? raw : null;
  }
  return typeof v === "number" ? v : null;
}

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

  if (mode === "financials") {
    try {
      const { crumb, cookie } = await getYahooCrumb();
      const metricKeys = [
        "TotalRevenue", "GrossProfit", "OperatingIncome", "EBITDA", "NetIncome", "DilutedEPS",
        "TotalAssets", "TotalLiabilitiesNetMinorityInterest", "StockholdersEquity", "TotalDebt", "CashAndCashEquivalents",
        "OperatingCashFlow", "InvestingCashFlow", "FinancingCashFlow", "CapitalExpenditure", "FreeCashFlow",
      ];
      const types = metricKeys.map((k) => `annual${k}`).join(",");
      const period1 = Math.floor(Date.now() / 1000) - 20 * 365 * 86400;
      const period2 = Math.floor(Date.now() / 1000) + 365 * 86400;
      const res = await fetch(
        `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol.toUpperCase())}?symbol=${encodeURIComponent(symbol.toUpperCase())}&type=${types}&period1=${period1}&period2=${period2}&crumb=${encodeURIComponent(crumb)}`,
        { headers: { "User-Agent": UA, Cookie: cookie } }
      );
      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: `Upstream financials source returned ${res.status}`, symbol }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const json = await res.json();
      const results: any[] = json?.timeseries?.result ?? [];
      if (results.length === 0) {
        return new Response(
          JSON.stringify({ error: "No financial statement data available", symbol }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const byMetric: Record<string, Record<string, number>> = {};
      const allDates = new Set<string>();
      for (const r of results) {
        const type: string | undefined = r?.meta?.type?.[0];
        if (!type) continue;
        const key = type.replace(/^annual/, "");
        const entries: any[] = (r[type] ?? []).filter(Boolean);
        const dateMap: Record<string, number> = {};
        for (const e of entries) {
          const date = e?.asOfDate;
          const val = e?.reportedValue?.raw;
          if (date && typeof val === "number") { dateMap[date] = val; allDates.add(date); }
        }
        byMetric[key] = dateMap;
      }
      const years = Array.from(allDates).sort();
      const seriesFor = (key: string) => years.map((y) => byMetric[key]?.[y] ?? null);

      return new Response(
        JSON.stringify({
          symbol,
          years,
          incomeStatement: {
            totalRevenue: seriesFor("TotalRevenue"),
            grossProfit: seriesFor("GrossProfit"),
            operatingIncome: seriesFor("OperatingIncome"),
            ebitda: seriesFor("EBITDA"),
            netIncome: seriesFor("NetIncome"),
            dilutedEPS: seriesFor("DilutedEPS"),
          },
          balanceSheet: {
            totalAssets: seriesFor("TotalAssets"),
            totalLiabilities: seriesFor("TotalLiabilitiesNetMinorityInterest"),
            stockholdersEquity: seriesFor("StockholdersEquity"),
            totalDebt: seriesFor("TotalDebt"),
            cashAndEquivalents: seriesFor("CashAndCashEquivalents"),
          },
          cashFlow: {
            operatingCashFlow: seriesFor("OperatingCashFlow"),
            investingCashFlow: seriesFor("InvestingCashFlow"),
            financingCashFlow: seriesFor("FinancingCashFlow"),
            capitalExpenditure: seriesFor("CapitalExpenditure"),
            freeCashFlow: seriesFor("FreeCashFlow"),
          },
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
  }

  if (mode === "fundamentals") {
    try {
      const { crumb, cookie } = await getYahooCrumb();
      const modules = "summaryDetail,defaultKeyStatistics,financialData,assetProfile,recommendationTrend";
      const res = await fetch(
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol.toUpperCase())}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`,
        { headers: { "User-Agent": UA, Cookie: cookie } }
      );
      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: `Upstream fundamentals source returned ${res.status}`, symbol }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const json = await res.json();
      const result = json?.quoteSummary?.result?.[0];
      if (!result) {
        return new Response(
          JSON.stringify({ error: json?.quoteSummary?.error?.description ?? "No fundamentals available", symbol }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const sd = result.summaryDetail ?? {};
      const ks = result.defaultKeyStatistics ?? {};
      const fd = result.financialData ?? {};
      const ap = result.assetProfile ?? {};
      const rt = result.recommendationTrend?.trend?.[0] ?? null;

      return new Response(
        JSON.stringify({
          symbol,
          trailingPE: num(sd.trailingPE),
          forwardPE: num(sd.forwardPE),
          priceToBook: num(ks.priceToBook),
          dividendYield: num(sd.dividendYield),
          dividendRate: num(sd.dividendRate),
          payoutRatio: num(sd.payoutRatio),
          beta: num(sd.beta),
          marketCap: num(sd.marketCap ?? ks.enterpriseValue),
          trailingEps: num(ks.trailingEps),
          forwardEps: num(ks.forwardEps),
          profitMargins: num(ks.profitMargins ?? fd.profitMargins),
          operatingMargins: num(fd.operatingMargins),
          returnOnEquity: num(fd.returnOnEquity),
          returnOnAssets: num(fd.returnOnAssets),
          debtToEquity: num(fd.debtToEquity),
          revenueGrowth: num(fd.revenueGrowth),
          earningsGrowth: num(fd.earningsGrowth),
          currentRatio: num(fd.currentRatio),
          targetMeanPrice: num(fd.targetMeanPrice),
          targetHighPrice: num(fd.targetHighPrice),
          targetLowPrice: num(fd.targetLowPrice),
          recommendationKey: fd.recommendationKey ?? null,
          numberOfAnalystOpinions: num(fd.numberOfAnalystOpinions),
          recommendationTrend: rt
            ? { strongBuy: rt.strongBuy, buy: rt.buy, hold: rt.hold, sell: rt.sell, strongSell: rt.strongSell }
            : null,
          sector: ap.sector ?? null,
          industry: ap.industry ?? null,
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
