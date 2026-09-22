-- Server-only storage for broker API credentials (e.g. Groww API key/secret).
--
-- Unlike public.brokers.config_json (client-readable/writable by the owning
-- user — fine for non-secret display config, wrong for actual API secrets),
-- this table has RLS enabled with NO policies for the `authenticated` role at
-- all, so ordinary users get zero access via the client SDK regardless of
-- which row is "theirs". Only the service-role key (used exclusively inside
-- edge functions) can read or write it.
CREATE TABLE public.broker_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  broker_name TEXT NOT NULL,
  secret_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  cached_access_token TEXT,
  cached_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, broker_name)
);
ALTER TABLE public.broker_secrets ENABLE ROW LEVEL SECURITY;

-- Defined here with CREATE OR REPLACE (not assumed to already exist) since the
-- live database turned out not to match this repo's earlier migration history
-- 1:1 — an earlier migration file defines this same function, but it wasn't
-- actually present when this migration was applied.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_broker_secrets_updated
  BEFORE UPDATE ON public.broker_secrets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
