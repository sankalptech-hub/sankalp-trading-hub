// Supabase Edge Function: ai-provider
//
// Manages the app's connection to the Anthropic API for AI-authored trading
// signals. The API key is entered by the user via the Settings UI (never
// hardcoded here), live-tested against Anthropic before being stored, and
// kept in public.ai_provider_secrets — a service-role-only table with no
// client RLS access, same pattern as broker_secrets for Groww.
//
// Actions: connect, disconnect, list_models, set_model.

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

async function listAnthropicModels(apiKey: string) {
  const res = await fetch(`${ANTHROPIC_BASE}/models`, {
    headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Anthropic API error (HTTP ${res.status})`);
  return (body?.data ?? []).map((m: any) => ({ id: m.id, display_name: m.display_name ?? m.id }));
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

    if (action === "connect") {
      const apiKey = payload?.api_key?.trim();
      const model = payload?.model?.trim() || "claude-haiku-4-5-20251001";
      if (!apiKey) return json({ error: "API key is required" }, 400);

      // Live-test the key before persisting anything.
      let models: { id: string; display_name: string }[];
      try {
        models = await listAnthropicModels(apiKey);
      } catch (e) {
        return json({ error: `Could not authenticate with Anthropic: ${e instanceof Error ? e.message : e}` }, 400);
      }

      const { error: secretErr } = await admin.from("ai_provider_secrets")
        .upsert({ id: true, api_key: apiKey, updated_at: new Date().toISOString() }, { onConflict: "id" });
      if (secretErr) return json({ error: secretErr.message }, 500);

      const { error: settingsErr } = await admin.from("ai_provider_settings").upsert({
        id: true, connected: true, selected_model: model,
        connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (settingsErr) return json({ error: settingsErr.message }, 500);

      return json({ data: { connected: true, models } });
    }

    if (action === "disconnect") {
      await admin.from("ai_provider_secrets").delete().eq("id", true);
      await admin.from("ai_provider_settings").update({ connected: false, selected_model: null, connected_at: null }).eq("id", true);
      return json({ data: { connected: false } });
    }

    if (action === "list_models") {
      const { data: secretRow } = await admin.from("ai_provider_secrets").select("api_key").eq("id", true).maybeSingle();
      if (!secretRow) return json({ error: "AI provider not connected" }, 400);
      try {
        const models = await listAnthropicModels(secretRow.api_key);
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
