import { NextRequest, NextResponse } from 'next/server';

// In-memory store for captured sessions (keyed by token)
// In production this could be Redis/DB, but for single-server use this works fine
const capturedSessions = new Map<string, {
  cookieJson: string;
  authToken: string;
  ct0: string;
  username: string;
  capturedAt: number;
}>();

// Clean up old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of capturedSessions.entries()) {
    if (now - val.capturedAt > 10 * 60 * 1000) {
      capturedSessions.delete(key);
    }
  }
}, 10 * 60 * 1000);

/**
 * POST /api/auth/capture-cookies
 * Called from the X popup window console script.
 * Receives raw document.cookie string and stores parsed session.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { token?: string; cookies?: string };
    const { token, cookies } = body;

    if (!token || !cookies) {
      return NextResponse.json({ ok: false, error: 'Missing token or cookies' }, { status: 400 });
    }

    // Parse the cookie string (format: "name=value; name2=value2")
    const cookieMap: Record<string, string> = {};
    for (const part of cookies.split(';')) {
      const eqIdx = part.indexOf('=');
      if (eqIdx > 0) {
        const name = part.slice(0, eqIdx).trim();
        const value = part.slice(eqIdx + 1).trim();
        if (name && value) cookieMap[name] = value;
      }
    }

    const authToken = cookieMap['auth_token'] ?? '';
    const ct0 = cookieMap['ct0'] ?? '';

    if (!authToken) {
      return NextResponse.json({ ok: false, error: 'No auth_token found. Make sure you are logged in to X.' }, { status: 400 });
    }

    // Build cookie JSON array compatible with tweet route
    const cookieArray = Object.entries(cookieMap).map(([name, value]) => ({
      name,
      value,
      domain: '.twitter.com',
      path: '/',
      secure: true,
      httpOnly: name === 'auth_token',
      sameSite: 'None',
    }));

    // Try to get username from X API using the auth token
    let username = 'x_user';
    try {
      const verifyRes = await fetch('https://api.twitter.com/1.1/account/verify_credentials.json', {
        headers: {
          'Cookie': `auth_token=${authToken}; ct0=${ct0}`,
          'Authorization': `Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA`,
          'x-csrf-token': ct0,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      if (verifyRes.ok) {
        const userData = await verifyRes.json() as { screen_name?: string };
        if (userData.screen_name) username = userData.screen_name;
      }
    } catch { /* non-critical */ }

    capturedSessions.set(token, {
      cookieJson: JSON.stringify(cookieArray),
      authToken,
      ct0,
      username,
      capturedAt: Date.now(),
    });

    return NextResponse.json({ ok: true, message: 'Session captured successfully!' });
  } catch {
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

/**
 * GET /api/auth/capture-cookies?token=xxx
 * Polled by the frontend to check if session has been captured.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Missing token' }, { status: 400 });
  }

  const session = capturedSessions.get(token);
  if (!session) {
    return NextResponse.json({ ok: false });
  }

  // Return and clean up
  capturedSessions.delete(token);
  return NextResponse.json({
    ok: true,
    cookieJson: session.cookieJson,
    authToken: session.authToken,
    ct0: session.ct0,
    username: session.username,
  });
}
