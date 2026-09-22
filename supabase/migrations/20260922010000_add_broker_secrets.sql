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

CREATE TRIGGER trg_broker_secrets_updated
  BEFORE UPDATE ON public.broker_secrets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
