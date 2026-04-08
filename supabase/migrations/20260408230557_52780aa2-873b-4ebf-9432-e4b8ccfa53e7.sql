
-- Fix UPDATE policies: drop and recreate with WITH CHECK clause

-- alerts
DROP POLICY IF EXISTS "Users can update own alerts" ON public.alerts;
CREATE POLICY "Users can update own alerts" ON public.alerts FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- build_tasks
DROP POLICY IF EXISTS "Users can update own build_tasks" ON public.build_tasks;
CREATE POLICY "Users can update own build_tasks" ON public.build_tasks FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- orders
DROP POLICY IF EXISTS "Users can update own orders" ON public.orders;
CREATE POLICY "Users can update own orders" ON public.orders FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- positions
DROP POLICY IF EXISTS "Users can update own positions" ON public.positions;
CREATE POLICY "Users can update own positions" ON public.positions FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- profiles
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- strategies
DROP POLICY IF EXISTS "Users can update own strategies" ON public.strategies;
CREATE POLICY "Users can update own strategies" ON public.strategies FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Add missing DELETE and UPDATE policies on signals
CREATE POLICY "Users can update own signals" ON public.signals FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own signals" ON public.signals FOR DELETE
  USING (auth.uid() = user_id);
