import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const adminEmail = "admin@sankalptrading.com";
    const adminPassword = "Admin@123456";

    // Check if admin user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const adminExists = existingUsers?.users?.some(u => u.email === adminEmail);

    if (adminExists) {
      return new Response(
        JSON.stringify({ message: "Admin user already exists", created: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create admin user
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { display_name: "Admin" },
    });

    if (createError) throw createError;

    // The trigger will create profile + 'user' role automatically.
    // Now upgrade to admin role.
    const userId = newUser.user.id;

    const { error: roleError } = await supabase
      .from("user_roles")
      .update({ role: "admin" })
      .eq("user_id", userId);

    if (roleError) {
      // If trigger hasn't fired yet, insert directly
      await supabase
        .from("user_roles")
        .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
    }

    return new Response(
      JSON.stringify({
        message: "Admin user created successfully",
        created: true,
        email: adminEmail,
        note: "Default password: Admin@123456 — change after first login",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
