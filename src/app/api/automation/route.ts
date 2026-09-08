import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/automation - get current config & status
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('bot_configs')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ config: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/automation - save config and optionally start/stop
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, proxy, cookies, context_template, usernames } = body;

    // Check if config exists
    const { data: existing } = await supabase
      .from('bot_configs')
      .select('id, cycle_count, tweets_posted')
      .eq('user_id', user.id)
      .maybeSingle();

    const configData: Record<string, unknown> = {
      user_id: user.id,
      proxy: proxy ?? '',
      cookies: cookies ?? '',
      context_template: context_template ?? '',
      usernames: usernames ?? [],
      // Fixed cycle pattern — no interval_minutes or usernames_per_tweet needed
      interval_minutes: 1,
      usernames_per_tweet: 4,
    };

    if (action === 'start') {
      configData.is_active = true;
      configData.next_cycle_at = null; // trigger immediate first cycle
      configData.cycle_phase = 'A';
      configData.phase_post_count = 0;
      configData.tweets_posted = 0;
    } else if (action === 'stop') {
      configData.is_active = false;
      configData.next_cycle_at = null;
    }

    let savedConfig;
    if (existing) {
      const { data, error } = await supabase
        .from('bot_configs')
        .update(configData)
        .eq('user_id', user.id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      savedConfig = data;
    } else {
      const { data, error } = await supabase
        .from('bot_configs')
        .insert({ ...configData, cycle_count: 0, tweets_posted: 0, cycle_phase: 'A', phase_post_count: 0 })
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      savedConfig = data;
    }

    // If starting, immediately trigger the edge function for the first cycle
    if (action === 'start') {
      triggerEdgeFunction().catch(() => {});
    }

    return NextResponse.json({ success: true, config: savedConfig });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function triggerEdgeFunction() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;

  await fetch(`${supabaseUrl}/functions/v1/run-automation`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
}
