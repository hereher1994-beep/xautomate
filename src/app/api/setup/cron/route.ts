import { NextResponse } from 'next/server';

// POST /api/setup/cron — installs pg_cron job directly via Supabase SQL API
// This uses the /rest/v1/rpc approach with service role to run raw SQL
export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey || serviceKey === 'your-supabase-service-role-key-here') {
    return NextResponse?.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY not configured' },
      { status: 400 }
    );
  }

  const edgeFunctionUrl = `${supabaseUrl}/functions/v1/run-automation`;

  // We'll use the pg_net + pg_cron approach via Supabase's SQL endpoint
  // Supabase exposes /rest/v1/rpc for stored procedures
  // We create a temporary function to set up the cron job

  const setupSQL = `
DO $$
BEGIN
  -- Try to unschedule existing job (ignore error if not exists)
  BEGIN
    PERFORM cron.unschedule('xautomate-run-bot');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Schedule the bot to fire every minute via pg_net HTTP call
  PERFORM cron.schedule(
    'xautomate-run-bot',
    '* * * * *',
    format(
      $sql$
        SELECT net.http_post(
          url := %L,
          headers := jsonb_build_object(
            ''Content-Type'', ''application/json'',
            ''Authorization'', ''Bearer %s''
          ),
          body := ''{}''::jsonb
        );
      $sql$,
      '${edgeFunctionUrl}',
      '${serviceKey}'
    )
  );
END;
$$;
  `;

  // Try via Supabase SQL API (available in some plans)
  const projectRef = supabaseUrl?.replace('https://', '')?.split('.')?.[0];

  try {
    // Method 1: Supabase Management API
    const res1 = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ query: setupSQL }),
    });

    if (res1?.ok) {
      return NextResponse?.json({ success: true, method: 'management_api', message: 'pg_cron job installed — bot runs every minute 24/7' });
    }

    // Method 2: Direct PostgreSQL via Supabase REST (pg_net must be enabled)
    // Try calling a known RPC that wraps cron.schedule
    const res2 = await fetch(`${supabaseUrl}/rest/v1/rpc/schedule_bot_cron`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      },
      body: JSON.stringify({
        job_name: 'xautomate-run-bot',
        edge_url: edgeFunctionUrl,
        auth_key: serviceKey,
      }),
    });

    if (res2?.ok) {
      return NextResponse?.json({ success: true, method: 'rpc', message: 'pg_cron job installed via RPC' });
    }

    // Both methods failed — return instructions for manual setup
    return NextResponse?.json({
      success: false,
      manual_required: true,
      message: 'Automatic pg_cron setup requires the Supabase service role key in your environment. Please add SUPABASE_SERVICE_ROLE_KEY to your .env file.',
      sql: setupSQL?.trim(),
    });
  } catch (err) {
    return NextResponse?.json({ success: false, error: String(err) });
  }
}
