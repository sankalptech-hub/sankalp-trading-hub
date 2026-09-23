// Supabase Edge Function: ai-chat
//
// Chat backend for the AI Assistant page. Uses whichever AI provider/model
// the user connected in Settings (ai_provider_secrets/ai_provider_settings —
// same connection AI Signal and the background scanner use), not a separate
// hardcoded gateway. Non-streaming by design: Anthropic's SSE format and
// OpenAI-compatible delta streaming differ enough that unifying them isn't
// worth it for a family portfolio assistant — a single JSON response after
// a few seconds is plenty responsive here.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    const { messages, context } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) return json({ error: "messages is required" }, 400);

    const { data: secretRow } = await admin.from("ai_provider_secrets").select("api_key").eq("id", true).maybeSingle();
    const { data: settingsRow } = await admin.from("ai_provider_settings").select("selected_model, connected, provider, base_url").eq("id", true).maybeSingle();
    if (!secretRow || !settingsRow?.connected) {
      return json({ error: "AI provider not connected — connect one in Settings first" }, 400);
    }
    const model = settingsRow.selected_model || "claude-haiku-4-5-20251001";
    const provider = settingsRow.provider || "anthropic";
    const baseUrl = settingsRow.base_url || "";

    const systemPrompt = `You are the in-app AI assistant for a family's personal trading dashboard. Help the user understand their own portfolio, orders, signals and strategies using ONLY the context data given below — never invent numbers or prices you weren't given. Be concise and specific. You are one input among others, not financial advice.

Positions: ${context?.positions ?? "[]"}
Recent orders: ${context?.orders ?? "[]"}
Recent signals: ${context?.signals ?? "[]"}
Strategies: ${context?.strategies ?? "[]"}`;

    const convo = messages.map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content ?? "") }));

    const isAnthropic = provider === "anthropic";
    const aiUrl = isAnthropic ? `${ANTHROPIC_BASE}/messages` : `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const aiHeaders: Record<string, string> = isAnthropic
      ? { "x-api-key": secretRow.api_key, "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json" }
      : { Authorization: `Bearer ${secretRow.api_key}`, "content-type": "application/json" };
    const body = isAnthropic
      ? { model, max_tokens: 800, system: systemPrompt, messages: convo }
      : { model, max_tokens: 800, messages: [{ role: "system", content: systemPrompt }, ...convo] };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    let aiRes: Response;
    try {
      aiRes = await fetch(aiUrl, { method: "POST", headers: aiHeaders, body: JSON.stringify(body), signal: controller.signal });
    } catch (e) {
      return json({ error: e instanceof Error && e.name === "AbortError" ? "AI provider timed out" : `Request failed: ${e instanceof Error ? e.message : e}` }, 502);
    } finally {
      clearTimeout(timeout);
    }
    const aiBody = await aiRes.json().catch(() => ({}));
    if (!aiRes.ok) {
      return json({ error: aiBody?.error?.message || aiBody?.error || `AI provider error (HTTP ${aiRes.status})` }, 502);
    }
    const text: string = isAnthropic ? (aiBody?.content?.[0]?.text ?? "") : (aiBody?.choices?.[0]?.message?.content ?? "");
    if (!text) return json({ error: "AI provider returned an empty response" }, 502);

    return json({ data: { content: text, model, provider } });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
