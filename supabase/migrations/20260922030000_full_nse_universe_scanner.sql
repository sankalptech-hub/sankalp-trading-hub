-- Expands the Strategy Scanner from a fixed ~49-stock list to NSE's full
-- main-board equity universe (~2,664 stocks, series='EQ' from Groww's public
-- instrument master), scanned in rotating chunks since scanning all of them
-- in one 15-minute tick isn't feasible (Yahoo rate limits, function
-- timeouts). Each tick scans one chunk and advances a cursor; the full
-- universe cycles roughly every 2-3 hours depending on chunk size.

-- Cached NSE equity symbol list (Yahoo-style, e.g. "RELIANCE.NS"), refreshed
-- daily by a separate job rather than re-downloading Groww's ~20MB
-- instrument CSV on every 15-minute scan tick.
CREATE TABLE public.nse_universe (
  symbol TEXT PRIMARY KEY,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.nse_universe ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view the scan universe"
  ON public.nse_universe FOR SELECT TO authenticated USING (true);

-- Tracks rotation position across scan ticks. Single row.
-- chunk_size=400: measured ~12s per 250 symbols in production, so 400 stays
-- safely under any timeout while cycling the full ~2,664-stock universe in
-- ~7 chunks (~105 minutes at 15-minute intervals — about 1.75 hours, so
-- roughly 3-4 full cycles across a 7-hour trading day).
CREATE TABLE public.strategy_scan_cursor (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  next_offset INTEGER NOT NULL DEFAULT 0,
  chunk_size INTEGER NOT NULL DEFAULT 400,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.strategy_scan_cursor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view the scan cursor"
  ON public.strategy_scan_cursor FOR SELECT TO authenticated USING (true);
INSERT INTO public.strategy_scan_cursor (id, next_offset, chunk_size) VALUES (true, 0, 400);

-- Re-point the existing background scan job at the new 8:30am-3:30pm IST
-- window (was 8:30am-4:29pm). IST = UTC+5:30, so 8:30am-3:30pm IST is
-- 3:00-10:00 UTC. Two jobs: one for the */15 slots up through 9:45 UTC
-- (3:15pm IST), and one exact run at 10:00 UTC (3:30pm IST) so the window
-- ends precisely at market close rather than overshooting to the next
-- quarter-hour boundary.
SELECT cron.unschedule('strategy-scanner-background');

SELECT cron.schedule(
  'strategy-scanner-background',
  '*/15 3-9 * * 1-5',
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

SELECT cron.schedule(
  'strategy-scanner-market-close',
  '0 10 * * 1-5',
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

-- Refreshes the NSE equity universe once daily before market open
-- (00:30 UTC = 6:00am IST), since listings change only occasionally.
SELECT cron.schedule(
  'refresh-nse-universe-daily',
  '30 0 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://slpkfdnvtersibyyirtd.supabase.co/functions/v1/refresh-universe',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
