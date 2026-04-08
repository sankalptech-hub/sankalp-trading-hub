ALTER TABLE public.brokers
ADD COLUMN IF NOT EXISTS static_ip text,
ADD COLUMN IF NOT EXISTS credentials_reset_at timestamp with time zone;