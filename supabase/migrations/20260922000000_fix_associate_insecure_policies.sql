-- Fix insecure client-writable policies on the associate/MLM tables.
--
-- "Users insert own payouts" let any authenticated user insert a payout row for
-- themselves with an arbitrary amount/status (e.g. status='paid', amount=999999) —
-- a direct financial-fraud vector. Payouts must only ever be created by admins.
DROP POLICY IF EXISTS "Users insert own payouts" ON public.associate_payouts;

-- "Users insert own network" let a user fabricate arbitrary downline_user_id/level
-- rows for themselves, which combined with the payouts bug above let a user invent
-- a downline to justify inflated commission claims. Network membership must only
-- ever be established by admins.
DROP POLICY IF EXISTS "Users insert own network" ON public.associate_network;

CREATE POLICY "Admins manage network" ON public.associate_network
  FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
