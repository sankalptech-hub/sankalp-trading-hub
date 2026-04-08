
-- risk_config table
CREATE TABLE public.risk_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  max_position_pct NUMERIC NOT NULL DEFAULT 20,
  max_concentration_pct NUMERIC NOT NULL DEFAULT 50,
  daily_loss_limit NUMERIC NOT NULL DEFAULT 10000,
  max_positions INTEGER NOT NULL DEFAULT 10,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.risk_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own risk_config" ON public.risk_config FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own risk_config" ON public.risk_config FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own risk_config" ON public.risk_config FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own risk_config" ON public.risk_config FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all risk_config" ON public.risk_config FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- brokers table
CREATE TABLE public.brokers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  broker_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected',
  config_json JSONB DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.brokers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own brokers" ON public.brokers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own brokers" ON public.brokers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own brokers" ON public.brokers FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own brokers" ON public.brokers FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all brokers" ON public.brokers FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- broker_accounts table
CREATE TABLE public.broker_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  broker_id UUID NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL DEFAULT 'DEMO-001',
  account_type TEXT NOT NULL DEFAULT 'demo',
  balance NUMERIC NOT NULL DEFAULT 100000,
  currency TEXT NOT NULL DEFAULT 'INR',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.broker_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own broker_accounts" ON public.broker_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own broker_accounts" ON public.broker_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own broker_accounts" ON public.broker_accounts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own broker_accounts" ON public.broker_accounts FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all broker_accounts" ON public.broker_accounts FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- broker_orders table
CREATE TABLE public.broker_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  broker_id UUID NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  external_order_id TEXT,
  symbol TEXT NOT NULL,
  qty INTEGER NOT NULL,
  side TEXT NOT NULL,
  order_type TEXT NOT NULL DEFAULT 'market',
  status TEXT NOT NULL DEFAULT 'pending',
  price NUMERIC NOT NULL DEFAULT 0,
  filled_price NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.broker_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own broker_orders" ON public.broker_orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own broker_orders" ON public.broker_orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own broker_orders" ON public.broker_orders FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own broker_orders" ON public.broker_orders FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all broker_orders" ON public.broker_orders FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- integrations table
CREATE TABLE public.integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'yahoo',
  config_json JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own integrations" ON public.integrations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own integrations" ON public.integrations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own integrations" ON public.integrations FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own integrations" ON public.integrations FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all integrations" ON public.integrations FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Add broker columns to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS broker_id UUID REFERENCES public.brokers(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS broker_name TEXT DEFAULT 'demo';

-- Update handle_new_user to auto-seed demo broker + account
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _broker_id UUID;
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  INSERT INTO public.brokers (user_id, broker_name, display_name, status, is_default, config_json)
  VALUES (NEW.id, 'demo', 'Demo / Paper Trading', 'connected', true, '{"balance": 100000, "currency": "INR"}'::jsonb)
  RETURNING id INTO _broker_id;
  INSERT INTO public.broker_accounts (user_id, broker_id, account_id, account_type, balance, currency)
  VALUES (NEW.id, _broker_id, 'DEMO-' || substr(NEW.id::text, 1, 6), 'demo', 100000, 'INR');
  INSERT INTO public.risk_config (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;
