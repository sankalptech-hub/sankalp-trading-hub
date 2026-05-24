
-- Extend role enum with trader + associate (keep user, admin)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'trader';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'associate';

-- Referral fields on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by TEXT,
  ADD COLUMN IF NOT EXISTS rank TEXT NOT NULL DEFAULT 'Bronze' CHECK (rank IN ('Bronze','Silver','Gold'));

-- Backfill referral codes for existing profiles
UPDATE public.profiles
SET referral_code = 'TS-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))
WHERE referral_code IS NULL;

-- Update handle_new_user to seed trader role + referral code + referral chain
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
  _ref_code TEXT;
  _referred_by TEXT;
  _signup_role TEXT;
BEGIN
  _ref_code := 'TS-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  _referred_by := NULLIF(NEW.raw_user_meta_data->>'referred_by','');
  _signup_role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role',''),'trader');

  INSERT INTO public.profiles (user_id, display_name, region, preferred_currency, preferred_exchange, referral_code, referred_by, rank)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email), 'IN', 'INR', 'NSE', _ref_code, _referred_by, 'Bronze');

  -- Assign role: trader (default) or associate (if requested in signup metadata)
  IF _signup_role = 'associate' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'associate');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'trader');
  END IF;

  INSERT INTO public.brokers (user_id, broker_name, display_name, status, is_default, config_json, region, supported_markets, currency)
  VALUES (NEW.id, 'demo', 'Demo / Paper Trading', 'connected', true, '{"balance": 100000, "currency": "INR"}'::jsonb, 'INDIA', '{NSE,BSE,NYSE,NASDAQ}', 'INR')
  RETURNING id INTO _broker_id;

  INSERT INTO public.broker_accounts (user_id, broker_id, account_id, account_type, balance, currency)
  VALUES (NEW.id, _broker_id, 'DEMO-' || substr(NEW.id::text, 1, 6), 'demo', 100000, 'INR');

  INSERT INTO public.risk_config (user_id) VALUES (NEW.id);

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
