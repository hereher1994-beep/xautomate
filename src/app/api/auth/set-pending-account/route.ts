import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/auth/set-pending-account
 * Called client-side before redirecting to Twitter OAuth.
 * Stores accountId + proxy in HttpOnly cookies so the NextAuth callback can read them.
 */
export async function POST(req: NextRequest) {
  try {
    const { accountId, proxy } = await req.json() as { accountId?: string; proxy?: string };

    const res = NextResponse.json({ ok: true });

    if (accountId) {
      res.cookies.set('xautomate_pending_account_id', accountId, {
        httpOnly: false, // needs to be readable by NextAuth callback
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 10, // 10 minutes — just long enough for OAuth flow
      });
    }

    res.cookies.set('xautomate_pending_proxy', proxy ?? '', {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 10,
    });

    return res;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
