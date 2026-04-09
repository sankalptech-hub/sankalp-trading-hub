
-- Add global market columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'IN',
  ADD COLUMN IF NOT EXISTS preferred_currency text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS preferred_exchange text NOT NULL DEFAULT 'NSE';

-- Add global market columns to brokers
ALTER TABLE public.brokers
  ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'INDIA',
  ADD COLUMN IF NOT EXISTS supported_markets text[] NOT NULL DEFAULT '{NSE,BSE}',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR';

-- Add multi-currency columns to positions
ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS exchange text,
  ADD COLUMN IF NOT EXISTS base_currency_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exchange_rate_to_inr numeric NOT NULL DEFAULT 1;

-- Update handle_new_user to set region defaults and broker region
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _broker_id UUID;
  _wl1_id UUID;
  _wl2_id UUID;
  _wl3_id UUID;
BEGIN
  -- Profile with default region
  INSERT INTO public.profiles (user_id, display_name, region, preferred_currency, preferred_exchange)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email), 'IN', 'INR', 'NSE');

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');

  -- Demo broker with region/markets
  INSERT INTO public.brokers (user_id, broker_name, display_name, status, is_default, config_json, region, supported_markets, currency)
  VALUES (NEW.id, 'demo', 'Demo / Paper Trading', 'connected', true, '{"balance": 100000, "currency": "INR"}'::jsonb, 'INDIA', '{NSE,BSE,NYSE,NASDAQ}', 'INR')
  RETURNING id INTO _broker_id;

  INSERT INTO public.broker_accounts (user_id, broker_id, account_id, account_type, balance, currency)
  VALUES (NEW.id, _broker_id, 'DEMO-' || substr(NEW.id::text, 1, 6), 'demo', 100000, 'INR');

  INSERT INTO public.risk_config (user_id) VALUES (NEW.id);

  -- Default watchlists
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
$$;
