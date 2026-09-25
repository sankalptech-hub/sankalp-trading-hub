// Supabase Edge Function: admin-ops
// Admin-only privileged operations. The client RPCs were revoked in migration
// 20260524015829 (update_user_role EXECUTE revoked from authenticated), so the
// Admin Panel now reaches these helpers through this function instead.
//
// Actions:
//   set_user_role      { user_id: string; role: 'admin' | 'user' | 'associate' }
//   update_build_task  { id: string; status: string }
//
// Auth: caller's Supabase JWT must carry an 'admin' row in public.user_roles.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_ROLES = new Set(["admin", "user", "associate"]);
const VALID_STATUSES = new Set(["pending", "in_progress", "done", "blocked"]);

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonError(405, "Use POST");

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

  // Caller must be an admin (checked with the service-role client so RLS can't hide it).
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: roleRows } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .limit(1);
  if (!roleRows || roleRows.length === 0) return jsonError(403, "Admin access required");

  let body: { action?: string; user_id?: string; role?: string; id?: string; status?: string };
  try { body = await req.json(); } catch { return jsonError(400, "Invalid JSON body"); }

  switch (body.action) {
    case "set_user_role": {
      if (!body.user_id || !body.role || !VALID_ROLES.has(body.role)) {
        return jsonError(400, "user_id and a valid role (admin|user|associate) are required");
      }
      if (body.user_id === user.id) return jsonError(400, "You cannot change your own role");

      const target = body.role;
      // Swap the role row: upsert new role, remove any conflicting old role.
      const { data: existing } = await admin
        .from("user_roles")
        .select("id, role")
        .eq("user_id", body.user_id);
      const hasTarget = (existing ?? []).some((r) => r.role === target);
      if (!hasTarget) {
        const { error } = await admin.from("user_roles").upsert(
          { user_id: body.user_id, role: target },
          { onConflict: "user_id,role" }
        );
        if (error) return jsonError(500, error.message);
      }
      const removeRoles = (existing ?? []).map((r) => r.role).filter((r) => r !== target);
      for (const r of removeRoles) {
        await admin.from("user_roles").delete().eq("user_id", body.user_id).eq("role", r);
      }
      return new Response(JSON.stringify({ ok: true, role: target }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    case "update_build_task": {
      if (!body.id || !body.status || !VALID_STATUSES.has(body.status)) {
        return jsonError(400, "id and a valid status (pending|in_progress|done|blocked) are required");
      }
      const { error } = await admin
        .from("build_tasks")
        .update({ status: body.status, updated_at: new Date().toISOString() })
        .eq("id", body.id);
      if (error) return jsonError(500, error.message);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    default:
      return jsonError(400, `Unknown action: ${body.action ?? ""}`);
  }
});
