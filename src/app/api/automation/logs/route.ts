import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/automation/logs - fetch server-side activity logs
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ logs: [] });

    const { data, error } = await supabase
      .from('automation_jobs')
      .select('id, level, message, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return NextResponse.json({ logs: [] });
    return NextResponse.json({ logs: data || [] });
  } catch {
    return NextResponse.json({ logs: [] });
  }
}
