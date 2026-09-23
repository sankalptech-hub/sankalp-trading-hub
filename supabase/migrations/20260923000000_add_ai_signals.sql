-- AI-authored signals: real technical/fundamental data is fed to Claude
-- (Anthropic API, connected by the user via a Settings UI — not hardcoded
-- here), which produces an actual reasoned BUY/SELL/HOLD call with written
-- rationale and risks, replacing mechanical "if RSI<35 then BUY" logic.
--
-- Global (not per-user), same reasoning as strategy_scan_results: AI signals
-- from the background market scan are a shared resource every family member
-- reads, not a personal broker connection.

-- Status/config only — no secret here. Readable by any authenticated user so
-- the Settings UI can show connection state and the selected model.
CREATE TABLE public.ai_provider_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  connected BOOLEAN NOT NULL DEFAULT false,
  selected_model TEXT,
  connected_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_provider_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view AI provider status"
  ON public.ai_provider_settings FOR SELECT TO authenticated USING (true);
INSERT INTO public.ai_provider_settings (id, connected) VALUES (true, false);

-- The actual API key. Same pattern as broker_secrets: RLS enabled with NO
-- policies for authenticated/anon at all, so it's reachable only via the
-- service-role key inside edge functions, never the client SDK.
CREATE TABLE public.ai_provider_secrets (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  api_key TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_provider_secrets ENABLE ROW LEVEL SECURITY;

-- One AI-authored signal per (symbol, category) — mirrors
-- strategy_scan_results: replaced per chunk as the background scan cycles,
-- so stale entries for symbols that stopped matching get cleaned up rather
-- than accumulating forever.
CREATE TABLE public.ai_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('breakout', 'scalp', 'big_money', 'smart_money', 'manual')),
  signal TEXT NOT NULL CHECK (signal IN ('BUY', 'SELL', 'HOLD')),
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  rationale TEXT NOT NULL,
  risks TEXT[] NOT NULL DEFAULT '{}',
  price NUMERIC NOT NULL,
  model TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (symbol, category)
);
ALTER TABLE public.ai_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view AI signals"
  ON public.ai_signals FOR SELECT TO authenticated USING (true);
