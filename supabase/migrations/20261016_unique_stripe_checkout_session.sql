-- Run in Supabase SQL editor before enabling Stripe Connect webhooks.
-- Enforce one job per Stripe Checkout session across all subscribers.
-- Legacy jobs without a stripe_session token are unaffected.
-- Review duplicate existing tokens before running this migration.
CREATE UNIQUE INDEX IF NOT EXISTS jobs_unique_stripe_checkout_session
ON public.jobs ((substring(notes from '\[stripe_session:([^]]+)\]')))
WHERE notes ~ '\[stripe_session:[^]]+\]';
