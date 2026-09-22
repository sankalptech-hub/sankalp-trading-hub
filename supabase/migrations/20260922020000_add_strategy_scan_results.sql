-- Stores the latest background strategy-scan output (Breakout / Scalping /
-- Big Money / Smart Money) so the Scanner page can just read pre-computed
-- results instead of running the scan itself every time someone opens it.
--
-- Each scan run replaces all rows for a given category (delete-then-insert),
-- so this table always holds only the CURRENT matching set per category, not
-- history. Written only by the strategy-scanner edge function (service
-- role); ordinary users get read-only access.
CREATE TABLE public.strategy_scan_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('breakout', 'scalp', 'big_money', 'smart_money')),
  price NUMERIC NOT NULL,
  change_percent NUMERIC NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (symbol, category)
);
ALTER TABLE public.strategy_scan_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view scan results"
  ON public.strategy_scan_results FOR SELECT
  TO authenticated USING (true);

-- No INSERT/UPDATE/DELETE policy for authenticated/anon — only the
-- service-role key (used exclusively by the strategy-scanner edge function)
-- can write, since RLS with no matching policy denies by default.

-- Runs the scan every 15 minutes, Mon-Fri, across a UTC window
-- (3:00-10:59) that comfortably covers NSE market hours (9:15-15:30 IST
-- = 3:45-10:00 UTC) with buffer on both sides.
--
-- Requires a Vault secret named 'service_role_key' holding this project's
-- actual service-role key (never stored in this migration file itself) —
-- see chat history / repo notes for the one-time setup step.
SELECT cron.schedule(
  'strategy-scanner-background',
  '*/15 3-10 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://slpkfdnvtersibyyirtd.supabase.co/functions/v1/strategy-scanner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
