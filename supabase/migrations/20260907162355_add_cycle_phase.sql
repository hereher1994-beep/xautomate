-- Migration: Add cycle phase tracking columns to bot_configs
-- New cycle pattern: Phase A (10 posts) → Phase B (3 photo-only) → rest 3min → Phase C (20 posts) → rest 10min → repeat

-- Add cycle_phase column to track which phase the bot is in
ALTER TABLE public.bot_configs
  ADD COLUMN IF NOT EXISTS cycle_phase TEXT DEFAULT 'A';

-- Add phase_post_count to track how many posts have been done in the current phase
ALTER TABLE public.bot_configs
  ADD COLUMN IF NOT EXISTS phase_post_count INTEGER DEFAULT 0;

-- Add tweets_posted to track total tweets sent
ALTER TABLE public.bot_configs
  ADD COLUMN IF NOT EXISTS tweets_posted INTEGER DEFAULT 0;

-- Update existing rows to have sensible defaults
UPDATE public.bot_configs
SET
  cycle_phase = 'A',
  phase_post_count = 0,
  tweets_posted = COALESCE(tweets_posted, 0)
WHERE cycle_phase IS NULL;
