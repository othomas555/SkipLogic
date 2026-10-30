-- Run in Supabase SQL editor before enabling Stripe Connect endpoints.
ALTER TABLE public.subscribers
 ADD COLUMN IF NOT EXISTS stripe_connect_account_id text UNIQUE,
 ADD COLUMN IF NOT EXISTS public_booking_platform_fee_bps integer NOT NULL DEFAULT 0;
ALTER TABLE public.subscribers
 ADD CONSTRAINT public_booking_platform_fee_bps_range CHECK (public_booking_platform_fee_bps BETWEEN 0 AND 10000);
-- Keep fee setting server-managed; do not add to subscriber-facing settings.
