
-- EAs
CREATE TABLE public.eas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  strategy TEXT,
  status TEXT NOT NULL DEFAULT 'paused',
  lot_size NUMERIC NOT NULL DEFAULT 0.1,
  pnl NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.eas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own eas" ON public.eas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all eas" ON public.eas FOR SELECT USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Users insert own eas" ON public.eas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own eas" ON public.eas FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own eas" ON public.eas FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_eas_updated BEFORE UPDATE ON public.eas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ea_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ea_id UUID NOT NULL REFERENCES public.eas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  side TEXT NOT NULL,
  lots NUMERIC NOT NULL,
  entry NUMERIC NOT NULL,
  exit NUMERIC,
  pnl NUMERIC NOT NULL DEFAULT 0,
  is_open BOOLEAN NOT NULL DEFAULT true,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
ALTER TABLE public.ea_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own ea_trades" ON public.ea_trades FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all ea_trades" ON public.ea_trades FOR SELECT USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Users insert own ea_trades" ON public.ea_trades FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own ea_trades" ON public.ea_trades FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own ea_trades" ON public.ea_trades FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.equity_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  ea_id UUID REFERENCES public.eas(id) ON DELETE CASCADE,
  equity NUMERIC NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.equity_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own equity_points" ON public.equity_points FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all equity_points" ON public.equity_points FOR SELECT USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Users insert own equity_points" ON public.equity_points FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Associate / MLM
CREATE TABLE public.associate_network (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  downline_user_id UUID NOT NULL,
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 5),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, downline_user_id)
);
ALTER TABLE public.associate_network ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own network" ON public.associate_network FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all network" ON public.associate_network FOR SELECT USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Users insert own network" ON public.associate_network FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.associate_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'pending',
  period TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);
ALTER TABLE public.associate_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own payouts" ON public.associate_payouts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all payouts" ON public.associate_payouts FOR SELECT USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage payouts" ON public.associate_payouts FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Users insert own payouts" ON public.associate_payouts FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.mlm_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level INTEGER NOT NULL UNIQUE CHECK (level BETWEEN 1 AND 5),
  commission_pct NUMERIC NOT NULL,
  min_volume NUMERIC NOT NULL DEFAULT 0,
  label TEXT NOT NULL
);
ALTER TABLE public.mlm_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view mlm_levels" ON public.mlm_levels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage mlm_levels" ON public.mlm_levels FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

INSERT INTO public.mlm_levels (level, commission_pct, min_volume, label) VALUES
  (1, 10.0, 0, 'Direct'),
  (2, 5.0, 0, 'Tier 2'),
  (3, 3.0, 0, 'Tier 3'),
  (4, 2.0, 0, 'Tier 4'),
  (5, 1.0, 0, 'Tier 5');
