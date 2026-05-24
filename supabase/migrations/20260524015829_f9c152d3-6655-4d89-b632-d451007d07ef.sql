-- 1) Harden has_role: prevent authenticated users from probing other users' roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When invoked in an authenticated user context, restrict lookups to the caller's own uid.
  -- Trigger / service_role contexts (auth.uid() IS NULL) keep full access for RLS evaluation.
  IF auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
END;
$$;

-- 2) Lock down EXECUTE on SECURITY DEFINER helpers so anon cannot probe them.
--    Authenticated users still need has_role for RLS evaluation.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

-- 3) Role mutation helper: admins-only via app code is enforced by RLS, but
--    revoke direct RPC access from clients entirely.
REVOKE EXECUTE ON FUNCTION public.update_user_role(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.update_user_role(uuid, text) TO service_role;

-- 4) Trigger functions should never be callable as RPC.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_user_roles()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;