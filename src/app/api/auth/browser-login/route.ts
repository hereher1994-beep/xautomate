import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/auth/browser-login
 * Logs into X.com using username + password via X's internal web API
 * (the same flow the browser uses). Extracts auth_token and ct0 cookies.
 * No Puppeteer needed — uses X's guest token + login flow API.
 */

const X_BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

async function getGuestToken(): Promise<string | null> {
  try {
    const res = await fetch('https://api.twitter.com/1.1/guest/activate.json', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${X_BEARER}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Origin': 'https://x.com',
        'Referer': 'https://x.com/',
      },
    });
    if (!res.ok) return null;
    const data = await res.json() as { guest_token?: string };
    return data.guest_token ?? null;
  } catch {
    return null;
  }
}

async function xLoginFlow(username: string, password: string): Promise<{
  ok: boolean;
  cookieJson: string;
  authToken: string;
  ct0: string;
  displayName: string;
  error?: string;
}> {
  const guestToken = await getGuestToken();
  if (!guestToken) {
    return { ok: false, cookieJson: '', authToken: '', ct0: '', displayName: '', error: 'Could not get guest token from X. Try again.' };
  }

  const baseHeaders = {
    'Authorization': `Bearer ${X_BEARER}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Origin': 'https://x.com',
    'Referer': 'https://x.com/',
    'x-guest-token': guestToken,
    'x-twitter-active-user': 'yes',
    'x-twitter-client-language': 'en',
  };

  // Step 1: Initiate login flow
  let flowToken: string;
  try {
    const initRes = await fetch('https://api.twitter.com/1.1/onboarding/task.json', {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({
        input_flow_data: {
          flow_context: {
            debug_overrides: {},
            start_location: { location: 'splash_screen' },
          },
        },
        subtask_versions: {
          action_list: 2,
          alert_dialog: 1,
          app_download_cta: 1,
          check_logged_in_account: 1,
          choice_selection: 3,
          contacts_live_sync_permission_prompt: 0,
          cta: 7,
          email_verification: 2,
          end_flow: 1,
          enter_date: 1,
          enter_email: 2,
          enter_password: 5,
          enter_phone: 2,
          enter_recaptcha: 1,
          enter_text: 5,
          enter_username: 2,
          generic_urt: 3,
          in_app_notification: 1,
          interest_picker: 3,
          js_instrumentation: 1,
          menu_dialog: 1,
          notifications_permission_prompt: 2,
          open_account: 2,
          open_home_timeline: 1,
          open_link: 1,
          phone_verification: 4,
          privacy_options: 1,
          security_key: 3,
          select_avatar: 4,
          select_banner: 2,
          settings_list: 7,
          show_code: 1,
          sign_up: 2,
          sign_up_review: 4,
          tweet_selection_urt: 1,
          update_users: 1,
          upload_media: 1,
          user_recommendations_list: 4,
          user_recommendations_urt: 1,
          wait_spinner: 3,
          web_modal: 1,
        },
      }),
    });

    if (!initRes.ok) {
      return { ok: false, cookieJson: '', authToken: '', ct0: '', displayName: '', error: `X login init failed (${initRes.status})` };
    }
    const initData = await initRes.json() as { flow_token?: string };
    flowToken = initData.flow_token ?? '';
    if (!flowToken) {
      return { ok: false, cookieJson: '', authToken: '', ct0: '', displayName: '', error: 'No flow token from X' };
    }
  } catch {
    return { ok: false, cookieJson: '', authToken: '', ct0: '', displayName: '', error: 'Network error during login init' };
  }

  // Step 2: Submit username
  try {
    const usernameRes = await fetch('https://api.twitter.com/1.1/onboarding/task.json', {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({
        flow_token: flowToken,
        subtask_inputs: [{
          subtask_id: 'LoginEnterUserIdentifierSSO',
          settings_list: {
            setting_responses: [{
              key: 'user_identifier',
              response_data: { text_data: { result: username } },
            }],
            link: 'next_link',
          },
        }],
      }),
    });

    if (!usernameRes.ok) {
      return { ok: false, cookieJson: '', authToken: '', ct0: '', displayName: '', error: 'Username step failed' };
    }
    const usernameData = await usernameRes.json() as { flow_token?: string };
    flowToken = usernameData.flow_token ?? flowToken;
  } catch {
    return { ok: false, cookieJson: '', authToken: '', ct0: '', displayName: '', error: 'Network error during username step' };
  }

  // Step 3: Submit password
  let authCookies: string[] = [];
  try {
    const passwordRes = await fetch('https://api.twitter.com/1.1/onboarding/task.json', {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({
        flow_token: flowToken,
        subtask_inputs: [{
          subtask_id: 'LoginEnterPassword',
          enter_password: {
            password,
            link: 'next_link',
          },
        }],
      }),
    });

    if (!passwordRes.ok) {
      const errBody = await passwordRes.json().catch(() => ({})) as { errors?: Array<{ message?: string }> };
      const errMsg = errBody.errors?.[0]?.message ?? `Password step failed (${passwordRes.status})`;
      return { ok: false, cookieJson: '', authToken: '', ct0: '', displayName: '', error: errMsg };
    }

    // Extract cookies from response headers
    const setCookieHeader = passwordRes.headers.get('set-cookie') ?? '';
    authCookies = setCookieHeader.split(/,(?=[^;]+=[^;]+;)/).map(c => c.trim());

    const pwData = await passwordRes.json() as { flow_token?: string; subtasks?: Array<{ subtask_id: string }> };
    flowToken = pwData.flow_token ?? flowToken;

    // Check if we need to handle account duplication check
    const subtasks = pwData.subtasks ?? [];
    const needsDupCheck = subtasks.some((s: { subtask_id: string }) => s.subtask_id === 'AccountDuplicationCheck');

    if (needsDupCheck) {
      const dupRes = await fetch('https://api.twitter.com/1.1/onboarding/task.json', {
        method: 'POST',
        headers: baseHeaders,
        body: JSON.stringify({
          flow_token: flowToken,
          subtask_inputs: [{
            subtask_id: 'AccountDuplicationCheck',
            check_logged_in_account: { link: 'AccountDuplicationCheck_false' },
          }],
        }),
      });
      if (dupRes.ok) {
        const dupCookies = dupRes.headers.get('set-cookie') ?? '';
        if (dupCookies) {
          authCookies = [...authCookies, ...dupCookies.split(/,(?=[^;]+=[^;]+;)/).map(c => c.trim())];
        }
      }
    }
  } catch {
    return { ok: false, cookieJson: '', authToken: '', ct0: '', displayName: '', error: 'Network error during password step' };
  }

  // Parse cookies
  const cookieMap: Record<string, string> = {};
  for (const cookieStr of authCookies) {
    const parts = cookieStr.split(';')[0].trim();
    const eqIdx = parts.indexOf('=');
    if (eqIdx > 0) {
      const name = parts.slice(0, eqIdx).trim();
      const value = parts.slice(eqIdx + 1).trim();
      if (name && value) cookieMap[name] = value;
    }
  }

  const authToken = cookieMap['auth_token'] ?? '';
  const ct0 = cookieMap['ct0'] ?? '';

  if (!authToken) {
    return { ok: false, cookieJson: '', authToken: '', ct0: '', displayName: '', error: 'Login failed — wrong username or password.' };
  }

  // Build cookie JSON array (compatible with existing tweet route)
  const cookieArray = Object.entries(cookieMap).map(([name, value]) => ({
    name,
    value,
    domain: '.twitter.com',
    path: '/',
    secure: true,
    httpOnly: name === 'auth_token',
    sameSite: 'None',
  }));

  return {
    ok: true,
    cookieJson: JSON.stringify(cookieArray),
    authToken,
    ct0,
    displayName: username,
    error: undefined,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { username, password, proxy } = await req.json() as {
      username?: string;
      password?: string;
      proxy?: string;
    };

    if (!username?.trim() || !password?.trim()) {
      return NextResponse.json({ ok: false, error: 'Username and password are required.' }, { status: 400 });
    }

    const result = await xLoginFlow(username.trim(), password);

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      cookieJson: result.cookieJson,
      authToken: result.authToken,
      ct0: result.ct0,
      displayName: result.displayName,
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Server error during login.' }, { status: 500 });
  }
}
