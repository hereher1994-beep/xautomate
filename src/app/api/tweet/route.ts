import { NextRequest, NextResponse } from 'next/server';

interface TweetRequestBody {
  cookieString: string;
  ct0: string;
  tweetText: string;
  imageDataUrl?: string;
}

/**
 * Parse a Netscape/header-style cookie string into an array of Puppeteer cookie objects.
 * Handles both "name=value; name2=value2" and JSON array formats.
 */
function parseCookies(cookieString: string): Array<{
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}> {
  // Try JSON array format first (exported by Cookie-Editor)
  if (cookieString.trim().startsWith('[')) {
    try {
      const arr = JSON.parse(cookieString) as Array<{
        name: string;
        value: string;
        domain?: string;
        path?: string;
        httpOnly?: boolean;
        secure?: boolean;
        sameSite?: string;
      }>;
      return arr.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain ?? '.x.com',
        path: c.path ?? '/',
        httpOnly: c.httpOnly ?? false,
        secure: c.secure ?? true,
        sameSite: (c.sameSite as 'Strict' | 'Lax' | 'None') ?? 'None',
      }));
    } catch {
      // fall through to string parsing
    }
  }

  // Standard "name=value; name2=value2" header format
  return cookieString
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) return null;
      const name = part.slice(0, eqIdx).trim();
      const value = part.slice(eqIdx + 1).trim();
      if (!name) return null;
      return {
        name,
        value,
        domain: '.x.com',
        path: '/',
        httpOnly: false,
        secure: true,
        sameSite: 'None' as const,
      };
    })
    .filter(Boolean) as Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
  }>;
}

export async function POST(req: NextRequest) {
  let payload: TweetRequestBody;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { cookieString, tweetText, imageDataUrl } = payload;

  if (!cookieString || !tweetText) {
    return NextResponse.json(
      { error: 'Missing required fields: cookieString, tweetText' },
      { status: 400 }
    );
  }

  let browser: import('puppeteer').Browser | null = null;

  try {
    // Dynamically import puppeteer so it only loads server-side
    const puppeteer = await import('puppeteer');

    const launchOptions: import('puppeteer').PuppeteerLaunchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        '--window-size=1280,800',
      ],
      defaultViewport: { width: 1280, height: 800 },
      timeout: 60000,
    };

    browser = await puppeteer.default.launch(launchOptions);
    const page = await browser.newPage();

    // Set a realistic user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    // Inject cookies before navigating
    const cookies = parseCookies(cookieString);
    if (cookies.length === 0) {
      await browser.close();
      return NextResponse.json(
        { error: 'Could not parse any cookies from the provided cookie string.' },
        { status: 400 }
      );
    }

    await page.setCookie(...cookies);

    // Navigate to X compose page
    console.log('[puppeteer-tweet] Navigating to x.com/compose/post');
    await page.goto('https://x.com/compose/post', {
      waitUntil: 'networkidle2',
      timeout: 45000,
    });

    // Check if we landed on login page (cookies expired/invalid)
    const currentUrl = page.url();
    if (
      currentUrl.includes('/login') ||
      currentUrl.includes('/i/flow/login') ||
      currentUrl.includes('signin')
    ) {
      await browser.close();
      return NextResponse.json(
        {
          error:
            'Session cookies are expired or invalid. Please export fresh cookies from x.com and paste them in the Session Cookies field.',
          detail: `Redirected to: ${currentUrl}`,
        },
        { status: 401 }
      );
    }

    // Wait for the tweet compose box to appear
    // X uses a contenteditable div for the tweet input
    const tweetBoxSelector =
      '[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea"], .public-DraftEditor-content, [role="textbox"][data-testid]';

    try {
      await page.waitForSelector(tweetBoxSelector, { timeout: 20000 });
    } catch {
      // Try navigating directly to home and clicking compose
      console.log('[puppeteer-tweet] Compose box not found, trying home page');
      await page.goto('https://x.com/home', { waitUntil: 'networkidle2', timeout: 30000 });

      // Check again for login redirect
      const homeUrl = page.url();
      if (homeUrl.includes('/login') || homeUrl.includes('/i/flow/login')) {
        await browser.close();
        return NextResponse.json(
          {
            error:
              'Session cookies are expired or invalid. Please export fresh cookies from x.com and paste them in the Session Cookies field.',
          },
          { status: 401 }
        );
      }

      // Click the compose button
      const composeBtn = await page.$('[data-testid="SideNav_NewTweet_Button"], [aria-label="Post"], [data-testid="tweetButtonInline"]');
      if (composeBtn) {
        await composeBtn.click();
        await page.waitForSelector(tweetBoxSelector, { timeout: 15000 });
      } else {
        throw new Error('Could not find compose button on home page');
      }
    }

    // Click the tweet text area and type the tweet
    const tweetBox = await page.$(tweetBoxSelector);
    if (!tweetBox) {
      throw new Error('Tweet compose box not found after navigation');
    }

    await tweetBox.click();
    await page.keyboard.type(tweetText, { delay: 30 });

    // Handle image attachment if provided
    if (imageDataUrl) {
      try {
        // Convert data URL to a temp buffer and use Puppeteer's file upload
        const base64Match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (base64Match) {
          const base64Data = base64Match[2];
          const buffer = Buffer.from(base64Data, 'base64');

          // Write to a temp path in /tmp
          const fs = await import('fs');
          const path = await import('path');
          const tmpPath = path.join('/tmp', `tweet-img-${Date.now()}.jpg`);
          fs.writeFileSync(tmpPath, buffer);

          // Find the file input for media upload
          const fileInput = await page.$('input[data-testid="fileInput"], input[accept*="image"]');
          if (fileInput) {
            await fileInput.uploadFile(tmpPath);
            // Wait for image to upload
            await page.waitForSelector('[data-testid="attachments"]', { timeout: 15000 }).catch(() => {});
          }

          // Clean up temp file
          try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        }
      } catch (imgErr) {
        console.warn('[puppeteer-tweet] Image upload failed, continuing without image:', imgErr);
      }
    }

    // Wait a moment for any media to process
    await new Promise((r) => setTimeout(r, 1500));

    // Find and click the tweet submit button
    const submitSelectors = [
      '[data-testid="tweetButton"]',
      '[data-testid="tweetButtonInline"]',
      'button[data-testid="tweetButton"]',
    ];

    let submitted = false;
    for (const sel of submitSelectors) {
      const btn = await page.$(sel);
      if (btn) {
        // Check it's not disabled
        const isDisabled = await page.$eval(sel, (el) => (el as HTMLButtonElement).disabled).catch(() => false);
        if (!isDisabled) {
          await btn.click();
          submitted = true;
          break;
        }
      }
    }

    if (!submitted) {
      throw new Error('Could not find or click the tweet submit button');
    }

    // Wait for the compose dialog to close (tweet posted successfully)
    // or for a success indicator
    await Promise.race([
      page.waitForSelector('[data-testid="tweetButton"]', { hidden: true, timeout: 15000 }),
      page.waitForNavigation({ timeout: 15000, waitUntil: 'networkidle2' }),
      new Promise((r) => setTimeout(r, 8000)), // fallback: 8s wait
    ]).catch(() => {});

    // Verify we didn't get an error toast
    const errorToast = await page.$('[data-testid="toast"][role="alert"]').catch(() => null);
    if (errorToast) {
      const toastText = await page.evaluate((el) => el?.textContent ?? '', errorToast).catch(() => '');
      if (toastText && toastText.toLowerCase().includes('error')) {
        throw new Error(`X showed an error after posting: ${toastText}`);
      }
    }

    await browser.close();
    browser = null;

    console.log('[puppeteer-tweet] Tweet posted successfully via Puppeteer');
    return NextResponse.json({
      success: true,
      method: 'puppeteer',
      message: 'Tweet posted successfully via headless browser',
    });
  } catch (err) {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }

    const message = err instanceof Error ? err.message : String(err);
    console.error('[puppeteer-tweet] Error:', message);

    // Classify the error for the client
    if (message.includes('expired') || message.includes('invalid') || message.includes('login')) {
      return NextResponse.json(
        {
          error: 'Session cookies are expired or invalid. Please export fresh cookies from x.com and paste them in the Session Cookies field.',
          detail: message,
        },
        { status: 401 }
      );
    }

    if (message.includes('timeout') || message.includes('Timeout')) {
      return NextResponse.json(
        {
          error: 'Browser timed out while trying to post the tweet. X may be slow or the page structure changed.',
          detail: message,
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error: `Puppeteer tweet failed: ${message}`,
        detail: message,
      },
      { status: 500 }
    );
  }
}
