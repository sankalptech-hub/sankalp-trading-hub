/**
 * adminOps — typed client for the admin-ops edge function.
 * Direct client RPCs for role mutation were revoked (migration 20260524015829);
 * privileged admin operations now flow through this server-side proxy which
 * verifies the caller's admin role with the service-role key.
 */

import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'user' | 'associate';
export type BuildTaskStatus = 'pending' | 'in_progress' | 'done' | 'blocked';

interface OpsResult<T = undefined> {
  data?: T;
  error?: string;
}

async function callAdminOps<T>(body: Record<string, unknown>): Promise<OpsResult<T>> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Not authenticated' };

    const { data, error } = await supabase.functions.invoke('admin-ops', {
      body,
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    return { data: data as T };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export const adminOps = {
  /** Promote/demote a user between roles (admin panel User Management). */
  setUserRole: (userId: string, role: AppRole) =>
    callAdminOps<{ ok: boolean; role: AppRole }>({ action: 'set_user_role', user_id: userId, role }),

  /** Update a build tracker task's status (works for any user's tasks). */
  updateBuildTask: (taskId: string, status: BuildTaskStatus) =>
    callAdminOps<{ ok: boolean }>({ action: 'update_build_task', id: taskId, status }),
};
