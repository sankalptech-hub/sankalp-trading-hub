-- Function to update user role (handles enum type properly)
CREATE OR REPLACE FUNCTION public.update_user_role(_user_id UUID, _new_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_roles
  SET role = _new_role::app_role
  WHERE user_id = _user_id;
END;
$$;

-- Allow admins to delete roles (for role swap operations)
CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));