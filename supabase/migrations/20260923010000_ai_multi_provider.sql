-- Multi-vendor AI signals: the user isn't locked into Anthropic/Claude —
-- they can test-connect and pick from Claude, NVIDIA NIM, OpenRouter, Groq,
-- OpenAI, Google Gemini, or any other OpenAI-compatible endpoint (covers
-- most free-tier model gateways). One active connection at a time, same
-- singleton-row design as before; "provider" + "base_url" say which vendor
-- and endpoint the stored key/model belong to.

ALTER TABLE public.ai_provider_settings ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'anthropic';
ALTER TABLE public.ai_provider_settings ADD COLUMN IF NOT EXISTS base_url TEXT;

-- Which vendor produced each AI-authored call, so the Scanner UI can show
-- "via NVIDIA" etc. alongside the model name.
ALTER TABLE public.ai_signals ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'anthropic';
