-- Bot Automation Schema
-- Tables: bot_configs (stores all bot settings), automation_jobs (tracks job state)

-- 1. bot_configs table
CREATE TABLE IF NOT EXISTS public.bot_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  proxy TEXT DEFAULT '',
  cookies TEXT DEFAULT '',
  context_template TEXT DEFAULT '',
  usernames TEXT[] DEFAULT ARRAY[]::TEXT[],
  interval_minutes INTEGER DEFAULT 15,
  usernames_per_tweet INTEGER DEFAULT 4,
  is_active BOOLEAN DEFAULT false,
  cycle_count INTEGER DEFAULT 0,
  last_cycle_at TIMESTAMPTZ,
  next_cycle_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. automation_jobs table (activity log stored server-side)
CREATE TABLE IF NOT EXISTS public.automation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES public.bot_configs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_bot_configs_user_id ON public.bot_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_bot_configs_is_active ON public.bot_configs(is_active);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_config_id ON public.automation_jobs(config_id);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_user_id ON public.automation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_created_at ON public.automation_jobs(created_at DESC);

-- 4. Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 5. Enable RLS
ALTER TABLE public.bot_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_jobs ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for bot_configs
DROP POLICY IF EXISTS "users_manage_own_bot_configs" ON public.bot_configs;
CREATE POLICY "users_manage_own_bot_configs"
ON public.bot_configs
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Allow service role full access (for edge functions)
DROP POLICY IF EXISTS "service_role_bot_configs" ON public.bot_configs;
CREATE POLICY "service_role_bot_configs"
ON public.bot_configs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 7. RLS Policies for automation_jobs
DROP POLICY IF EXISTS "users_manage_own_automation_jobs" ON public.automation_jobs;
CREATE POLICY "users_manage_own_automation_jobs"
ON public.automation_jobs
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "service_role_automation_jobs" ON public.automation_jobs;
CREATE POLICY "service_role_automation_jobs"
ON public.automation_jobs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 8. Trigger for updated_at
DROP TRIGGER IF EXISTS set_bot_configs_updated_at ON public.bot_configs;
CREATE TRIGGER set_bot_configs_updated_at
  BEFORE UPDATE ON public.bot_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
