import { NextResponse } from 'next/server';

// GET /api/automation/tick - called by the client-side heartbeat to trigger server-side cycles
// This is the bridge: client pings this every minute, server calls the edge function
// The edge function only fires bots whose next_cycle_at is due
export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse?.json({ error: 'Missing Supabase service key' }, { status: 500 });
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/run-automation`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const data = await res?.json();
    return NextResponse?.json({ triggered: true, result: data });
  } catch (err) {
    return NextResponse?.json({ error: String(err) }, { status: 500 });
  }
}
