// Supabase Edge Function: ai-provider
//
// Manages the app's connection to an AI provider for AI-authored trading
// signals. Not locked to Anthropic — supports Anthropic (Claude) natively,
// plus any OpenAI-compatible endpoint (OpenAI, NVIDIA NIM, OpenRouter, Groq,
// Google Gemini's OpenAI-compat surface, or a fully custom base URL), which
// covers most of the free-tier model gateways too.
//
// Flow: "test" validates a key + base URL live against the provider and
// returns its model list WITHOUT persisting anything, so the user can pick
// a model first. "connect" re-validates and then actually saves the key
// (public.ai_provider_secrets — service-role-only, no client RLS access,
// same pattern as broker_secrets) and settings (provider/base_url/model).
//
// Actions: test, connect, disconnect, list_models, set_model.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_VERSION = "2023-06-01";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

interface ModelInfo { id: string; display_name: string }

// Every provider except Anthropic is treated as an OpenAI-compatible
// /models + /chat/completions surface — that's true for OpenAI itself,
// NVIDIA NIM, OpenRouter, Groq, Together, and Google's Gemini OpenAI-compat
// endpoint, which covers the bulk of what's out there.
async function listModels(provider: string, baseUrl: string, apiKey: string): Promise<ModelInfo[]> {
  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error?.message || `Anthropic API error (HTTP ${res.status})`);
    return (body?.data ?? []).map((m: any) => ({ id: m.id, display_name: m.display_name ?? m.id }));
  }

  if (!baseUrl) throw new Error("Base URL is required for this provider");
  const url = `${baseUrl.replace(/\/+$/, "")}/models`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || body?.error || `Provider API error (HTTP ${res.status})`);
  const list = body?.data ?? body?.models ?? [];
  if (!Array.isArray(list) || list.length === 0) throw new Error("Key accepted but no models were returned");
  return list.map((m: any) => ({ id: m.id ?? m.name, display_name: m.id ?? m.name }));
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
    const { action, payload } = await req.json();

    if (action === "test") {
      const provider = (payload?.provider || "anthropic").trim();
      const baseUrl = (payload?.base_url || "").trim().replace(/\/+$/, "");
      const apiKey = payload?.api_key?.trim();
      if (!apiKey) return json({ error: "API key is required" }, 400);
      if (provider !== "anthropic" && !baseUrl) return json({ error: "Base URL is required for this provider" }, 400);

      try {
        const models = await listModels(provider, baseUrl, apiKey);
        return json({ data: { valid: true, models } });
      } catch (e) {
        return json({ error: `Could not authenticate: ${e instanceof Error ? e.message : e}` }, 400);
      }
    }

    if (action === "connect") {
      const provider = (payload?.provider || "anthropic").trim();
      const baseUrl = (payload?.base_url || "").trim().replace(/\/+$/, "");
      const apiKey = payload?.api_key?.trim();
      const model = payload?.model?.trim();
      if (!apiKey) return json({ error: "API key is required" }, 400);
      if (!model) return json({ error: "Select a model first" }, 400);
      if (provider !== "anthropic" && !baseUrl) return json({ error: "Base URL is required for this provider" }, 400);

      // Re-validate at save time too — the test step and the save click
      // can be minutes apart, and a key can be revoked in between.
      try {
        await listModels(provider, baseUrl, apiKey);
      } catch (e) {
        return json({ error: `Could not authenticate: ${e instanceof Error ? e.message : e}` }, 400);
      }

      const { error: secretErr } = await admin.from("ai_provider_secrets")
        .upsert({ id: true, api_key: apiKey, updated_at: new Date().toISOString() }, { onConflict: "id" });
      if (secretErr) return json({ error: secretErr.message }, 500);

      const { error: settingsErr } = await admin.from("ai_provider_settings").upsert({
        id: true, connected: true, provider, base_url: provider === "anthropic" ? null : baseUrl, selected_model: model,
        connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (settingsErr) return json({ error: settingsErr.message }, 500);

      return json({ data: { connected: true, provider, model } });
    }

    if (action === "disconnect") {
      await admin.from("ai_provider_secrets").delete().eq("id", true);
      await admin.from("ai_provider_settings").update({
        connected: false, selected_model: null, connected_at: null, base_url: null, provider: "anthropic",
      }).eq("id", true);
      return json({ data: { connected: false } });
    }

    if (action === "list_models") {
      const { data: secretRow } = await admin.from("ai_provider_secrets").select("api_key").eq("id", true).maybeSingle();
      const { data: settingsRow } = await admin.from("ai_provider_settings").select("provider, base_url, connected").eq("id", true).maybeSingle();
      if (!secretRow || !settingsRow?.connected) return json({ error: "AI provider not connected" }, 400);
      try {
        const models = await listModels(settingsRow.provider || "anthropic", settingsRow.base_url || "", secretRow.api_key);
        return json({ data: { models } });
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 502);
      }
    }

    if (action === "set_model") {
      const model = payload?.model?.trim();
      if (!model) return json({ error: "model is required" }, 400);
      const { error } = await admin.from("ai_provider_settings").update({ selected_model: model, updated_at: new Date().toISOString() }).eq("id", true);
      if (error) return json({ error: error.message }, 500);
      return json({ data: { selected_model: model } });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
