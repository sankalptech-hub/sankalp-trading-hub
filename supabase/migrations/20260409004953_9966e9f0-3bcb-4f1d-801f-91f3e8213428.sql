
-- Create watchlists table
CREATE TABLE public.watchlists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  color TEXT NOT NULL DEFAULT '#00d4aa',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own watchlists" ON public.watchlists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own watchlists" ON public.watchlists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own watchlists" ON public.watchlists FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own watchlists" ON public.watchlists FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all watchlists" ON public.watchlists FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_watchlists_updated_at BEFORE UPDATE ON public.watchlists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create watchlist_symbols table
CREATE TABLE public.watchlist_symbols (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  watchlist_id UUID NOT NULL REFERENCES public.watchlists(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  display_name TEXT,
  notes TEXT,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(watchlist_id, symbol)
);

ALTER TABLE public.watchlist_symbols ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own watchlist_symbols" ON public.watchlist_symbols FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own watchlist_symbols" ON public.watchlist_symbols FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own watchlist_symbols" ON public.watchlist_symbols FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own watchlist_symbols" ON public.watchlist_symbols FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all watchlist_symbols" ON public.watchlist_symbols FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Update handle_new_user trigger to create default watchlists
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _broker_id UUID;
  _wl1_id UUID;
  _wl2_id UUID;
  _wl3_id UUID;
BEGIN
  -- Existing: profile, role, broker, account, risk
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  INSERT INTO public.brokers (user_id, broker_name, display_name, status, is_default, config_json)
  VALUES (NEW.id, 'demo', 'Demo / Paper Trading', 'connected', true, '{"balance": 100000, "currency": "INR"}'::jsonb)
  RETURNING id INTO _broker_id;
  INSERT INTO public.broker_accounts (user_id, broker_id, account_id, account_type, balance, currency)
  VALUES (NEW.id, _broker_id, 'DEMO-' || substr(NEW.id::text, 1, 6), 'demo', 100000, 'INR');
  INSERT INTO public.risk_config (user_id) VALUES (NEW.id);

  -- New: default watchlists
  INSERT INTO public.watchlists (user_id, name, is_default, color)
  VALUES (NEW.id, 'My Watchlist', true, '#00d4aa') RETURNING id INTO _wl1_id;

  INSERT INTO public.watchlists (user_id, name, is_default, color)
  VALUES (NEW.id, 'NSE Top', false, '#3b82f6') RETURNING id INTO _wl2_id;

  INSERT INTO public.watchlist_symbols (watchlist_id, user_id, symbol, display_name) VALUES
    (_wl2_id, NEW.id, 'RELIANCE.NS', 'Reliance Industries'),
    (_wl2_id, NEW.id, 'TCS.NS', 'Tata Consultancy'),
    (_wl2_id, NEW.id, 'INFY.NS', 'Infosys'),
    (_wl2_id, NEW.id, 'WIPRO.NS', 'Wipro'),
    (_wl2_id, NEW.id, 'HDFCBANK.NS', 'HDFC Bank');

  INSERT INTO public.watchlists (user_id, name, is_default, color)
  VALUES (NEW.id, 'US Tech', false, '#8b5cf6') RETURNING id INTO _wl3_id;

  INSERT INTO public.watchlist_symbols (watchlist_id, user_id, symbol, display_name) VALUES
    (_wl3_id, NEW.id, 'AAPL', 'Apple'),
    (_wl3_id, NEW.id, 'MSFT', 'Microsoft'),
    (_wl3_id, NEW.id, 'TSLA', 'Tesla'),
    (_wl3_id, NEW.id, 'GOOGL', 'Alphabet'),
    (_wl3_id, NEW.id, 'AMZN', 'Amazon');

  RETURN NEW;
END;
$function$;
