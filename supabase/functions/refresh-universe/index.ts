// Supabase Edge Function: refresh-universe
//
// Refreshes public.nse_universe from Groww's public instrument master CSV
// (https://groww.in/trade-api/docs/curl/instruments — no auth required),
// keeping only NSE main-board cash equities (segment=CASH,
// instrument_type=EQ, series=EQ). Run once daily by pg_cron, well before
// market open, since listings change only occasionally — the 15-minute
// strategy-scanner reads from this cached table instead of re-downloading
// and re-parsing the ~20MB CSV on every tick.
//
// BSE's equivalent "equity" listings were deliberately excluded: inspecting
// the feed showed BSE's EQ-classified rows are heavily mixed with bonds/
// debentures (e.g. tickers like "08SFL31") that aren't cleanly separable
// from real equities using the fields available here.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CSV_URL = "https://growwapi-assets.groww.in/instruments/instrument.csv";

// Splits one CSV line on commas that aren't inside double quotes.
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const res = await fetch(CSV_URL);
    if (!res.ok) throw new Error(`Instrument CSV fetch failed: HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.split("\n");
    if (lines.length === 0) throw new Error("Empty instrument CSV");

    const header = splitCsvLine(lines[0]);
    const idx = {
      exchange: header.indexOf("exchange"),
      trading_symbol: header.indexOf("trading_symbol"),
      instrument_type: header.indexOf("instrument_type"),
      segment: header.indexOf("segment"),
      series: header.indexOf("series"),
    };
    if (Object.values(idx).some((i) => i === -1)) throw new Error("Unexpected CSV header shape");

    const symbols = new Set<string>();
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const f = splitCsvLine(line);
      if (
        f[idx.exchange] === "NSE" &&
        f[idx.segment] === "CASH" &&
        f[idx.instrument_type] === "EQ" &&
        f[idx.series] === "EQ" &&
        f[idx.trading_symbol]
      ) {
        symbols.add(`${f[idx.trading_symbol]}.NS`);
      }
    }

    if (symbols.size < 1000) {
      // Sanity check — a parsing bug or a changed CSV shape could otherwise
      // silently wipe the universe down to near-nothing.
      throw new Error(`Only found ${symbols.size} NSE EQ symbols — expected ~2500+, aborting to avoid corrupting the universe`);
    }

    const symbolList = Array.from(symbols).sort();

    const { error: delErr } = await admin.from("nse_universe").delete().neq("symbol", "");
    if (delErr) throw new Error(`delete nse_universe: ${delErr.message}`);

    // Insert in batches to stay well under any single-request payload limit.
    const BATCH = 1000;
    for (let i = 0; i < symbolList.length; i += BATCH) {
      const batch = symbolList.slice(i, i + BATCH).map((symbol) => ({ symbol }));
      const { error: insErr } = await admin.from("nse_universe").insert(batch);
      if (insErr) throw new Error(`insert nse_universe batch ${i}: ${insErr.message}`);
    }

    // Reset the scan cursor and let chunk_size stay whatever it's set to —
    // don't clobber a manually-tuned chunk size, just re-anchor position 0
    // and refresh the total-size-aware wraparound the scanner computes itself.
    const { error: cursorErr } = await admin.from("strategy_scan_cursor").update({ next_offset: 0, updated_at: new Date().toISOString() }).eq("id", true);
    if (cursorErr) throw new Error(`reset cursor: ${cursorErr.message}`);

    return new Response(
      JSON.stringify({ symbolsWritten: symbolList.length, at: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
