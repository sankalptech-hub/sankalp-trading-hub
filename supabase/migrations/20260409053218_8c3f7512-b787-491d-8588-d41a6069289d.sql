
-- Trigger function to protect user_roles from non-service-role mutations
CREATE OR REPLACE FUNCTION public.protect_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow mutations only from service_role (used by edge functions / triggers)
  -- current_setting('request.jwt.claims', true) is NULL for service_role context
  -- and auth.uid() is NULL for service_role / trigger context
  IF auth.uid() IS NOT NULL THEN
    -- A regular authenticated user is trying to mutate user_roles directly
    -- Only allow if they are already an admin (prevents self-escalation)
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Only administrators can modify user roles';
    END IF;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Apply trigger to user_roles
CREATE TRIGGER protect_user_roles_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_roles();

-- Also add WITH CHECK to the admin UPDATE policy on user_roles (currently missing)
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
