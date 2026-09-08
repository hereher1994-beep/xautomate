'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Copy, Check, Terminal, Server, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

const SERVER_IP = '167.233.122.88';
const SITE_URL = `http://${SERVER_IP}:3000`;

interface ScriptBlock {
  id: string;
  title: string;
  description: string;
  filename: string;
  content: string;
  warning?: string;
}

const SCRIPTS: ScriptBlock[] = [
  {
    id: 'setup',
    title: '① Server Setup',
    description: 'Run ONCE on a fresh Ubuntu 22.04/24.04 VPS. Installs Node.js 20, PM2, Chromium, all Puppeteer deps, 4GB swap, firewall. Takes ~3 min.',
    filename: '1-setup-server.sh',
    content: `#!/bin/bash
# ============================================================
#  XAutomate — Hetzner VPS Setup
#  Server: 167.233.122.88  |  Ubuntu 22.04 / 24.04 LTS
#  Run as root: bash 1-setup-server.sh
# ============================================================
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" echo"  XAutomate VPS Setup — 167.233.122.88" echo"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

apt-get update -y && apt-get upgrade -y
apt-get install -y curl git unzip build-essential ca-certificates gnupg wget htop nano

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
echo "✅ Node $(node -v) | npm $(npm -v)"

# PM2
npm install -g pm2
pm2 startup systemd -u root --hp /root
systemctl enable pm2-root 2>/dev/null || true
echo "✅ PM2 installed"

# Chromium + all Puppeteer deps
apt-get install -y \\
  chromium-browser \\
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \\
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \\
  libgbm1 libasound2 libpangocairo-1.0-0 libpango-1.0-0 \\
  libcairo2 libatspi2.0-0 libgtk-3-0 libx11-xcb1 libxcb-dri3-0 \\
  fonts-liberation fonts-noto-color-emoji xvfb x11-utils
echo "✅ Chromium + browser deps installed"

# Directories
mkdir -p /opt/xautomate/images /var/log/xautomate/screenshots
chmod 755 /opt/xautomate /var/log/xautomate
echo "✅ Directories created"

# 4GB swap (needed for 30 parallel browsers)
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "✅ 4GB swap created"
fi

# Firewall
ufw allow OpenSSH
ufw allow 3000/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
echo "✅ Firewall configured"

# File descriptor limits (for 30 browsers)
cat >> /etc/security/limits.conf << 'EOF'
root soft nofile 65536
root hard nofile 65536
* soft nofile 65536
* hard nofile 65536
EOF
echo "fs.file-max = 200000" >> /etc/sysctl.conf
sysctl -p
echo "✅ File limits increased" echo"" echo"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" echo"  ✅ Server setup complete! Next: bash 2-deploy-app.sh" echo"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"`,
  },
  {
    id: 'deploy',
    title: '② Deploy Next.js App',
    description: 'Clones your repo, installs deps, builds Next.js, writes .env.local with your real Supabase keys (auto-read from .env in the repo), starts with PM2.',
    filename: '2-deploy-app.sh',
    content: `#!/bin/bash
# ============================================================
#  XAutomate — Deploy Next.js App
#  Server: 167.233.122.88
#  Run as root: bash 2-deploy-app.sh
# ============================================================
set -e

APP_DIR="/opt/xautomate"
REPO_URL="https://github.com/hereher1994-beep/xautomate.git"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" echo"  XAutomate — Deploying Next.js App to 167.233.122.88" echo"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

mkdir -p $APP_DIR
cd $APP_DIR

# Clone or pull
if [ -d ".git" ]; then
  echo "📦 Pulling latest code..."
  git pull origin main
else
  echo "📦 Cloning repository..."
  git clone $REPO_URL .
fi

# Install deps
echo "📦 Installing npm packages..."
npm install

# Build
echo "🔨 Building Next.js..."
npm run build
echo "✅ Build complete"

# Write .env.local — reads keys from the .env file that came with the repo
echo "📝 Writing .env.local..."
SUPABASE_URL=$(grep "^NEXT_PUBLIC_SUPABASE_URL=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '\\r' || echo "")
SUPABASE_ANON=$(grep "^NEXT_PUBLIC_SUPABASE_ANON_KEY=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '\\r' || echo "")
GEMINI_KEY=$(grep "^GEMINI_API_KEY=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '\\r' || echo "")

cat > .env.local << ENVEOF
NEXT_PUBLIC_SUPABASE_URL=\${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=\${SUPABASE_ANON}
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=\${GEMINI_KEY}
NEXT_PUBLIC_SITE_URL=http://167.233.122.88:3000
ENVEOF

echo "✅ .env.local written" echo"" echo"⚠️  SUPABASE_SERVICE_ROLE_KEY is blank — add it if needed:" echo"   nano /opt/xautomate/.env.local"

# Start with PM2
pm2 delete xautomate 2>/dev/null || true
pm2 start npm --name "xautomate" -- start -- -p 3000
pm2 save

echo "" echo"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" echo"  ✅ App running at http://167.233.122.88:3000"
echo "  📋 Logs: pm2 logs xautomate" echo"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"`,
  },
  {
    id: 'bot',
    title: '③ Install Bot Engine',
    description: 'Installs Puppeteer and writes the full multi-account bot.js engine. Supports up to 30 accounts running simultaneously in isolated browser contexts.',
    filename: '3-install-bot.sh',
    content: `#!/bin/bash
# ============================================================
#  XAutomate — Install Puppeteer Multi-Account Bot Engine
#  Server: 167.233.122.88  |  Up to 30 simultaneous accounts
#  Run as root: bash 3-install-bot.sh
# ============================================================
set -e

APP_DIR="/opt/xautomate"
cd $APP_DIR

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" echo"  Installing Puppeteer Multi-Account Bot Engine" echo"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true npm install puppeteer puppeteer-core
echo "✅ Puppeteer installed"

cat > /opt/xautomate/bot.js << 'BOTEOF'
#!/usr/bin/env node
/**
 * XAutomate — Multi-Account Puppeteer Bot Engine
 * Server: 167.233.122.88
 *
 * - Up to 30 accounts run simultaneously in parallel
 * - Each account has its own isolated browser context
 * - Each account has its own proxy, cookies, images, usernames
 * - Cycle: Phase A (10 posts) → Phase B (3 photos) → 3min rest
 *        → Phase C (20 posts) → 10min rest → repeat
 * - Runs 24/7 until all usernames exhausted or manually stopped
 * - Auto-restarts on crash via PM2
 * - Saves screenshots on error for debugging
 *
 * Usage:
 *   node bot.js                       # run all accounts
 *   node bot.js --test                # test first account only
 *   node bot.js --account account1   # run only one account
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');
const LOG_DIR = '/var/log/xautomate';
const SCREENSHOTS_DIR = path.join(LOG_DIR, 'screenshots');

const PHASE_A_POSTS = 10;
const PHASE_B_POSTS = 3;
const PHASE_C_POSTS = 20;
const REST_B_MS     = 3  * 60 * 1000;
const REST_C_MS     = 10 * 60 * 1000;
const MIN_DELAY_MS  = 60 * 1000;
const MAX_DELAY_MS  = 3  * 60 * 1000;

function randomDelay() {
  return Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
}
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function ts() { return new Date().toISOString().replace('T',' ').slice(0,19); }

function makeLogger(accountName) {
  const safe = accountName.replace(/[^a-z0-9]/gi, '_');
  const logFile = path.join(LOG_DIR, safe + '.log');
  return function log(level, msg) {
    const line = \`[\${ts()}][\${level.toUpperCase().padEnd(7)}][\${accountName}] \${msg}\`;
    console.log(line);
    try { fs.appendFileSync(logFile, line + '\\n'); } catch {}
  };
}

async function launchBrowser(account) {
  const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH ||
    '/usr/bin/chromium-browser';
  const args = [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
    '--disable-gpu', '--window-size=1280,900',
    '--disable-blink-features=AutomationControlled',
    '--lang=en-US,en', '--disable-extensions', '--mute-audio',
  ];
  if (account.proxy) args.push(\`--proxy-server=\${account.proxy}\`);
  return puppeteer.launch({
    headless: 'new',
    executablePath: chromiumPath,
    args,
    defaultViewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
  });
}

async function setupPage(page) {
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
  });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US','en'] });
    window.chrome = { runtime: {} };
  });
}

async function humanType(page, selector, text) {
  await page.click(selector);
  await sleep(300 + Math.random() * 400);
  for (const char of text) {
    await page.keyboard.type(char, { delay: 60 + Math.random() * 100 });
  }
}

async function injectCookies(page, account, log) {
  log('info', 'Injecting session cookies into browser...');
  let cookies;
  try {
    cookies = typeof account.cookies === 'string'
      ? JSON.parse(account.cookies)
      : account.cookies;
  } catch (e) {
    throw new Error('Invalid cookies JSON in accounts.json: ' + e.message);
  }
  if (!Array.isArray(cookies) || !cookies.length) {
    throw new Error('cookies array is empty for account: ' + account.name);
  }
  const hasAuthToken = cookies.some(c => c.name === 'auth_token');
  const hasCt0 = cookies.some(c => c.name === 'ct0');
  if (!hasAuthToken || !hasCt0) {
    throw new Error('cookies must contain both auth_token and ct0 for account: ' + account.name);
  }
  // Normalise domain
  const normalised = cookies.map(c => ({
    ...c,
    domain: c.domain || '.twitter.com',
    path: c.path || '/',
    httpOnly: c.httpOnly !== undefined ? c.httpOnly : false,
    secure: c.secure !== undefined ? c.secure : true,
    sameSite: c.sameSite || 'None',
  }));
  await page.setCookie(...normalised);
  log('info', \`✅ \${normalised.length} cookies injected (auth_token + ct0 present)\`);
}

async function loginToX(page, account, log) {
  log('info', 'Navigating to X.com home (cookie auth)...');
  await injectCookies(page, account, log);
  await page.goto('https://x.com/home', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(2000 + Math.random() * 1500);

  // Verify we are logged in — if redirected to login page, cookies are invalid
  const url = page.url();
  if (url.includes('/login') || url.includes('/i/flow/login')) {
    throw new Error('Cookie auth failed — redirected to login. Refresh your auth_token and ct0 cookies.');
  }

  log('info', 'Waiting for home feed...');
  await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 60000 });
  log('info', '✅ Logged in via cookies successfully!');
  await sleep(2000 + Math.random() * 1000);
}

async function postTweet(page, tweetText, imagePath, log) {
  await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 20000 });
  await page.click('[data-testid="tweetTextarea_0"]');
  await sleep(800 + Math.random() * 500);

  if (tweetText && tweetText.trim() !== ' ') {
    log('info', \`Typing: "\${tweetText.slice(0,80)}..."\`);
    for (const char of tweetText) {
      await page.keyboard.type(char, { delay: 40 + Math.random() * 70 });
    }
    await sleep(500 + Math.random() * 300);
  }

  if (imagePath && fs.existsSync(imagePath)) {
    log('info', \`Attaching image: \${path.basename(imagePath)}\`);
    const fileInput = await page.$('input[data-testid="fileInput"]').catch(() => null);
    if (fileInput) {
      await fileInput.uploadFile(imagePath);
      await sleep(4000 + Math.random() * 2000);
      log('info', 'Image attached ✓');
    }
  }

  await sleep(800 + Math.random() * 400);
  const tweetBtn = await page.waitForSelector('[data-testid="tweetButtonInline"]', { timeout: 15000 });
  await tweetBtn.click();
  await sleep(3000 + Math.random() * 1000);
  log('info', '✅ Tweet posted!');
  return true;
}

function buildTweetText(account) {
  const templates = account.contextTemplates || [account.context || 'Hello from XAutomate!'];
  const template = templates[Math.floor(Math.random() * templates.length)];
  const usernames = account.usernames || [];
  const count = randomBetween(3, Math.min(6, Math.max(3, usernames.length)));
  const picked = [...usernames].sort(() => Math.random() - 0.5).slice(0, count);
  const mentions = picked.map(u => \` @\${u.replace(/^@/, '')}\`).join('');
  return \`\${template}\${mentions}\`;
}

function pickImage(account) {
  const imgDir = account.imagesDir ||
    path.join(__dirname, 'images', account.name.replace(/[^a-z0-9]/gi, '_'));
  if (!fs.existsSync(imgDir)) return null;
  const files = fs.readdirSync(imgDir).filter(f => /\\.(jpg|jpeg|png|gif|webp)$/i.test(f));
  if (!files.length) return null;
  return path.join(imgDir, files[Math.floor(Math.random() * files.length)]);
}

async function saveErrorScreenshot(page, accountName) {
  try {
    if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    const file = path.join(SCREENSHOTS_DIR,
      \`error-\${accountName.replace(/[^a-z0-9]/gi,'_')}-\${Date.now()}.png\`);
    await page.screenshot({ path: file, fullPage: true });
    return file;
  } catch { return null; }
}

async function runAccount(account) {
  const log = makeLogger(account.name);
  log('info', \`🚀 Starting automation for "\${account.name}"\`);
  log('info', \`   Proxy: \${account.proxy || 'none'}\`);
  log('info', \`   Usernames: \${(account.usernames || []).length}\`);

  let browser = null, page = null;
  let totalTweets = 0, fullCycles = 0, retries = 0;
  const MAX_RETRIES = 5;

  while (retries < MAX_RETRIES) {
    try {
      browser = await launchBrowser(account);
      page = await browser.newPage();
      await setupPage(page);
      await loginToX(page, account, log);
      retries = 0;

      const totalUsernames = (account.usernames || []).length;
      let usernamesUsed = 0;

      while (usernamesUsed < totalUsernames) {
        // Phase A: 10 posts
        log('info', '📦 Phase A — 10 posts');
        for (let i = 0; i < PHASE_A_POSTS && usernamesUsed < totalUsernames; i++) {
          const tweetText = buildTweetText(account);
          const imagePath = pickImage(account);
          usernamesUsed = Math.min(usernamesUsed + randomBetween(3,6), totalUsernames);
          await postTweet(page, tweetText, imagePath, log);
          totalTweets++;
          log('info', \`[A \${i+1}/\${PHASE_A_POSTS}] Tweet #\${totalTweets} sent\`);
          if (i < PHASE_A_POSTS - 1 && usernamesUsed < totalUsernames) {
            const d = randomDelay();
            log('info', \`⏱ Next in \${Math.ceil(d/60000)}m...\`);
            await sleep(d);
          }
        }
        if (usernamesUsed >= totalUsernames) break;

        // Phase B: 3 photo-only posts
        log('info', '📸 Phase B — 3 photo-only posts');
        for (let i = 0; i < PHASE_B_POSTS; i++) {
          const imagePath = pickImage(account);
          if (imagePath) {
            await postTweet(page, ' ', imagePath, log);
            totalTweets++;
            log('info', \`[B \${i+1}/\${PHASE_B_POSTS}] Photo tweet #\${totalTweets} sent\`);
          }
          if (i < PHASE_B_POSTS - 1) await sleep(randomDelay());
        }
        if (usernamesUsed >= totalUsernames) break;

        log('warn', '😴 Resting 3 minutes before Phase C...');
        await sleep(REST_B_MS);

        // Phase C: 20 posts
        log('info', '📦 Phase C — 20 posts');
        for (let i = 0; i < PHASE_C_POSTS && usernamesUsed < totalUsernames; i++) {
          const tweetText = buildTweetText(account);
          const imagePath = pickImage(account);
          usernamesUsed = Math.min(usernamesUsed + randomBetween(3,6), totalUsernames);
          await postTweet(page, tweetText, imagePath, log);
          totalTweets++;
          log('info', \`[C \${i+1}/\${PHASE_C_POSTS}] Tweet #\${totalTweets} sent\`);
          if (i < PHASE_C_POSTS - 1 && usernamesUsed < totalUsernames) {
            const d = randomDelay();
            log('info', \`⏱ Next in \${Math.ceil(d/60000)}m...\`);
            await sleep(d);
          }
        }
        if (usernamesUsed >= totalUsernames) break;

        fullCycles++;
        log('info', \`✅ Full cycle #\${fullCycles} complete! \${totalTweets} tweets total\`);
        log('warn', '😴 Resting 10 minutes before next cycle...');
        await sleep(REST_C_MS);
      }

      log('info', \`🎯 DONE! \${totalTweets} tweets sent across \${fullCycles} full cycles.\`);
      break;

    } catch (err) {
      retries++;
      log('error', \`Error (attempt \${retries}/\${MAX_RETRIES}): \${err.message}\`);
      if (page) {
        const screenshotFile = await saveErrorScreenshot(page, account.name);
        if (screenshotFile) log('error', \`Screenshot: \${screenshotFile}\`);
      }
      if (browser) await browser.close().catch(() => {});
      browser = null; page = null;
      if (retries < MAX_RETRIES) {
        const waitMs = retries * 30000;
        log('warn', \`Retrying in \${waitMs/1000}s...\`);
        await sleep(waitMs);
      }
    }
  }

  if (browser) await browser.close().catch(() => {});
  log('info', 'Browser closed. Account finished.');
}

async function main() {
  const args = process.argv.slice(2);
  const testMode = args.includes('--test');
  const singleAccount = args.find((a, i) => args[i-1] === '--account');

  if (!fs.existsSync(ACCOUNTS_FILE)) {
    console.error(\`❌ accounts.json not found at \${ACCOUNTS_FILE}\`);
    process.exit(1);
  }

  let accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
  if (singleAccount) accounts = accounts.filter(a => a.name === singleAccount);
  if (testMode) { console.log('🧪 TEST MODE — first account only'); accounts = [accounts[0]]; }
  if (!accounts.length) { console.error('❌ No accounts found'); process.exit(1); }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(\`  XAutomate — Starting \${accounts.length} account(s) simultaneously\`);
  console.log(\`  Server: 167.233.122.88  |  Logs: /var/log/xautomate/\`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  accounts.forEach((acc, i) => {
    console.log(\`  [\${i+1}] \${acc.name} — proxy: \${acc.proxy || 'none'} — usernames: \${(acc.usernames||[]).length}\`);
  });
  console.log('');

  await Promise.allSettled(accounts.map(acc => runAccount(acc)));

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✅ All accounts finished.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
BOTEOF

chmod +x /opt/xautomate/bot.js
echo "✅ bot.js written to /opt/xautomate/bot.js" echo"" echo"Next: bash 4-setup-accounts.sh"`,
  },
  {
    id: 'accounts',
    title: '④ Setup Accounts',
    description: 'Creates accounts.json template and image folders for up to 30 accounts. Edit the file to paste your X session cookies (auth_token + ct0) exported from Cookie-Editor.',
    filename: '4-setup-accounts.sh',
    content: `#!/bin/bash
# ============================================================
#  XAutomate — Setup accounts.json
#  Server: 167.233.122.88
#  Run as root: bash 4-setup-accounts.sh
# ============================================================

APP_DIR="/opt/xautomate"
cd $APP_DIR

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" echo"  XAutomate — Configuring Accounts (up to 30)" echo"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create image folders for all 30 accounts
for i in $(seq 1 30); do
  mkdir -p /opt/xautomate/images/account$i
done
echo "✅ Image folders: /opt/xautomate/images/account1 ... account30"

# Create accounts.json template
cat > /opt/xautomate/accounts.json << 'EOF'
[
  {
    "name": "account1",
    "cookies": "[{\"name\":\"auth_token\",\"value\":\"PASTE_YOUR_AUTH_TOKEN_HERE\",\"domain\":\".twitter.com\",\"path\":\"/\",\"secure\":true,\"httpOnly\":true,\"sameSite\":\"None\"},{\"name\":\"ct0\",\"value\":\"PASTE_YOUR_CT0_HERE\",\"domain\":\".twitter.com\",\"path\":\"/\",\"secure\":true,\"httpOnly\":false,\"sameSite\":\"Lax\"}]",
    "proxy": "",
    "imagesDir": "/opt/xautomate/images/account1",
    "usernames": [
      "elonmusk", "sama", "karpathy", "naval", "paulg",
      "levelsio", "balajis", "pmarca", "garrytan", "dhh",
      "jason", "shl", "tferriss", "benedictevans", "naval"
    ],
    "contextTemplates": [
      "Just shipped something incredible. The future is being built right now.",
      "The best time to start was yesterday. The second best time is now.",
      "Building in public is the new marketing. Ship fast, learn faster.",
      "Most people overestimate what they can do in a day and underestimate what they can do in a year.",
      "The internet is the greatest leverage machine ever created."
    ]
  },
  {
    "name": "account2",
    "cookies": "[{\"name\":\"auth_token\",\"value\":\"PASTE_YOUR_AUTH_TOKEN_HERE\",\"domain\":\".twitter.com\",\"path\":\"/\",\"secure\":true,\"httpOnly\":true,\"sameSite\":\"None\"},{\"name\":\"ct0\",\"value\":\"PASTE_YOUR_CT0_HERE\",\"domain\":\".twitter.com\",\"path\":\"/\",\"secure\":true,\"httpOnly\":false,\"sameSite\":\"Lax\"}]",
    "proxy": "",
    "imagesDir": "/opt/xautomate/images/account2",
    "usernames": [
      "elonmusk", "sama", "karpathy", "naval", "paulg",
      "levelsio", "balajis", "pmarca", "garrytan", "dhh"
    ],
    "contextTemplates": [
      "Consistency beats talent every single time.",
      "The best investment you can make is in yourself.",
      "Stop waiting for permission. Start building.",
      "Every expert was once a beginner. Keep going.",
      "Your network is your net worth. Invest in relationships."
    ]
  }
]
EOF

echo "✅ accounts.json created at /opt/xautomate/accounts.json" echo"" echo"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" echo"  ⚠️  NOW EDIT accounts.json with your real cookies:" echo"  nano /opt/xautomate/accounts.json" echo"" echo"  For each account replace PASTE_YOUR_AUTH_TOKEN_HERE" echo"  and PASTE_YOUR_CT0_HERE with values from Cookie-Editor." echo"  To add more accounts: copy the block and change" echo"  name/cookies/proxy/imagesDir for each one." echo"  Up to 30 accounts — all run independently." echo"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"`,
  },
  {
    id: 'pm2',
    title: '⑤ Start Bot 24/7',
    description: 'Starts the bot with PM2 so it runs 24/7, survives reboots, and auto-restarts on any crash. All accounts run simultaneously.',
    filename: '5-start-bot-pm2.sh',
    content: `#!/bin/bash
# ============================================================
#  XAutomate — Start Bot 24/7 with PM2
#  Server: 167.233.122.88
#  Run as root: bash 5-start-bot-pm2.sh
# ============================================================

APP_DIR="/opt/xautomate"
cd $APP_DIR

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" echo"  Starting XAutomate Bot 24/7 — 167.233.122.88" echo"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check accounts.json exists
if [ ! -f /opt/xautomate/accounts.json ]; then
  echo "❌ accounts.json not found! Run bash 4-setup-accounts.sh first"
  exit 1
fi

# Check credentials are filled in
if grep -q "PASTE_YOUR_AUTH_TOKEN_HERE" /opt/xautomate/accounts.json; then echo"⚠️  accounts.json still has placeholder cookies!" echo"   Edit it first: nano /opt/xautomate/accounts.json" echo"   Paste your real auth_token and ct0 values from Cookie-Editor"
  exit 1
fi

# Stop existing bot if running
pm2 delete xautomate-bot 2>/dev/null || true

# Start bot with PM2
pm2 start /opt/xautomate/bot.js \\
  --name "xautomate-bot" \\
  --log /var/log/xautomate/pm2-bot.log \\
  --error /var/log/xautomate/pm2-bot-error.log \\
  --time \\
  --restart-delay=15000 \\
  --max-restarts=20

pm2 save

echo "" echo"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" echo"  ✅ Bot is running 24/7 on 167.233.122.88!" echo"" echo"  📋 Live logs:    pm2 logs xautomate-bot" echo"  📋 Per account:  tail -f /var/log/xautomate/account1.log" echo"  🔄 Restart:      pm2 restart xautomate-bot" echo"  🛑 Stop:         pm2 stop xautomate-bot" echo"  📊 Status:       pm2 status" echo"  🌐 Web UI:       http://167.233.122.88:3000"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"`,
  },
  {
    id: 'images',
    title: '⑥ Upload Images (SCP)',
    description: 'Run on YOUR LOCAL MACHINE to upload images to the VPS. Create folders named images_account1, images_account2 etc. locally first.',
    filename: '6-upload-images.sh',
    content: `#!/bin/bash
# ============================================================
#  XAutomate — Upload Images to VPS
#  ⚠️  Run this on YOUR LOCAL MACHINE, not the server
#  Server: 167.233.122.88
# ============================================================

SERVER_IP="167.233.122.88"
SSH_USER="root" echo"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" echo"  Uploading images to 167.233.122.88" echo"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create local folders named images_account1, images_account2 etc.
# then run this script to upload them all

for i in $(seq 1 30); do
  LOCAL_DIR="./images_account$i"
  REMOTE_DIR="/opt/xautomate/images/account$i"
  if [ -d "$LOCAL_DIR" ]; then
    echo "📤 Uploading account$i images..." scp -r"$LOCAL_DIR/"* "$SSH_USER@$SERVER_IP:$REMOTE_DIR/" 2>/dev/null && \ echo"✅ account$i images uploaded"|| \ echo"⚠️  account$i: no files or upload failed"
  fi
done

echo "" echo"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" echo"  ✅ Done! Verify on server:" echo"     ssh root@167.233.122.88 'ls /opt/xautomate/images/'" echo"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"`,
  },
  {
    id: 'monitor',
    title: '⑦ Monitor & Manage',
    description: 'All commands to monitor, restart, and manage the bot. Copy-paste individual commands in Termius as needed.',
    filename: '7-monitor-commands.sh',
    content: `# ============================================================
#  XAutomate — Monitor & Manage Commands
#  Server: 167.233.122.88
#  Copy-paste individual commands in Termius as needed
# ============================================================

# PM2 status (shows all running processes)
pm2 status

# Live bot logs
pm2 logs xautomate-bot

# Live logs for all accounts
tail -f /var/log/xautomate/*.log

# Live log for specific account
tail -f /var/log/xautomate/account1.log
tail -f /var/log/xautomate/account2.log

# View error screenshots
ls /var/log/xautomate/screenshots/

# Restart bot
pm2 restart xautomate-bot

# Stop bot
pm2 stop xautomate-bot

# Start bot
pm2 start xautomate-bot

# Restart Next.js web UI
pm2 restart xautomate

# Edit accounts (add/remove/change credentials)
nano /opt/xautomate/accounts.json

# Edit environment variables
nano /opt/xautomate/.env.local

# Run test tweet for first account
cd /opt/xautomate && node bot.js --test

# Run only one specific account
cd /opt/xautomate && node bot.js --account account1

# Check server resources
htop
free -h
df -h

# Check how many Chrome processes are running
ps aux | grep -c chromium

# Kill all Chrome processes (emergency)
pkill -f chromium

# Update app from GitHub
cd /opt/xautomate && git pull && npm install && npm run build && pm2 restart xautomate

# Web UI
echo "Web UI: http://167.233.122.88:3000"`,
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 select-none"
      style={{
        backgroundColor: copied ? 'rgba(0,212,170,0.2)' : 'rgba(0,212,170,0.08)',
        color: copied ? '#00d4aa' : '#00d4aa',
        border: `1px solid ${copied ? 'rgba(0,212,170,0.5)' : 'rgba(0,212,170,0.2)'}`,
        minWidth: 80,
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export default function DeployPage() {
  const [activeScript, setActiveScript] = useState('setup');
  const [expandedOrder, setExpandedOrder] = useState(true);
  const active = SCRIPTS.find(s => s.id === activeScript) ?? SCRIPTS[0];

  return (
    <AppLayout>
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-12">

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mb-1">
          <Server size={20} className="text-primary flex-shrink-0" />
          <h1 className="text-xl font-bold text-foreground">Hetzner VPS Deployment</h1>
          <span
            className="text-xs font-mono px-2.5 py-1 rounded-full font-semibold"
            style={{ backgroundColor: 'rgba(0,212,170,0.1)', color: '#00d4aa', border: '1px solid rgba(0,212,170,0.25)' }}
          >
            {SERVER_IP}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Complete bash scripts — copy-paste directly into Termius. Up to 30 accounts run simultaneously, 24/7, non-stop.
        </p>

        {/* Order guide collapsible */}
        <div className="mb-5 rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(59,130,246,0.25)', backgroundColor: 'rgba(59,130,246,0.05)' }}>
          <button
            type="button"
            onClick={() => setExpandedOrder(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-sm font-semibold text-blue-300">📋 Order to paste in Termius (click to expand)</span>
            {expandedOrder ? <ChevronUp size={14} className="text-blue-400" /> : <ChevronDown size={14} className="text-blue-400" />}
          </button>
          {expandedOrder && (
            <div className="px-4 pb-4">
              <ol className="space-y-2">
                {[
                  { n: '1', cmd: 'bash 1-setup-server.sh', note: 'Run ONCE on fresh VPS — installs everything' },
                  { n: '2', cmd: 'bash 2-deploy-app.sh', note: 'Paste as-is — repo URL pre-filled, auto-fills Supabase keys from .env' },
                  { n: '3', cmd: 'bash 3-install-bot.sh', note: 'Writes the full Puppeteer bot engine' },
                  { n: '4', cmd: 'bash 4-setup-accounts.sh', note: 'Creates accounts.json template' },
                  { n: '5', cmd: 'nano /opt/xautomate/accounts.json', note: 'Paste your auth_token + ct0 cookies from Cookie-Editor' },
                  { n: '6', cmd: 'bash 5-start-bot-pm2.sh', note: 'All accounts start running 24/7' },
                  { n: '7', cmd: 'pm2 logs xautomate-bot', note: 'Watch all accounts work in parallel' },
                ].map(step => (
                  <li key={step.n} className="flex items-start gap-3">
                    <span
                      className="flex-shrink-0 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center mt-0.5"
                      style={{ backgroundColor: 'rgba(59,130,246,0.2)', color: '#93c5fd' }}
                    >
                      {step.n}
                    </span>
                    <div className="flex-1 min-w-0">
                      <code className="text-xs font-mono text-green-300 bg-black/30 px-2 py-0.5 rounded">{step.cmd}</code>
                      <span className="text-xs text-blue-200 ml-2">{step.note}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* Warning */}
        <div className="mb-5 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 flex gap-2">
          <AlertTriangle size={14} className="text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-300">
            <strong>Script ② (Deploy App)</strong> uses repo <code className="bg-black/30 px-1 rounded">github.com/hereher1994-beep/xautomate</code> — pre-filled, no editing needed.
            It also auto-reads your Supabase URL and Anon Key from the <code className="bg-black/30 px-1 rounded">.env</code> file in your repo.
            Only <strong>SUPABASE_SERVICE_ROLE_KEY</strong> needs to be added manually if you use it.
            <br /><strong>Script ④ (Setup Accounts)</strong> uses <strong>session cookies only</strong> — no username/password. Export <code className="bg-black/30 px-1 rounded">auth_token</code> + <code className="bg-black/30 px-1 rounded">ct0</code> from Cookie-Editor and paste into <code className="bg-black/30 px-1 rounded">accounts.json</code>.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Script selector */}
          <div className="lg:col-span-1 flex flex-col gap-1">
            {SCRIPTS.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveScript(s.id)}
                className={`text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeScript === s.id
                    ? 'text-primary' :'text-muted-foreground hover:text-foreground hover:bg-white/5'
                }`}
                style={activeScript === s.id ? {
                  backgroundColor: 'rgba(0,212,170,0.08)',
                  border: '1px solid rgba(0,212,170,0.25)',
                } : {}}
              >
                {s.title}
              </button>
            ))}
          </div>

          {/* Script viewer */}
          <div className="lg:col-span-3">
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
              {/* Script header */}
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <Terminal size={14} className="text-primary flex-shrink-0" />
                  <span className="text-sm font-semibold text-foreground truncate">{active.title}</span>
                  <span className="text-xs font-mono text-muted-foreground hidden sm:block">{active.filename}</span>
                </div>
                <CopyButton text={active.content} />
              </div>

              {/* Description */}
              <div className="px-4 py-2 border-b text-xs text-muted-foreground" style={{ borderColor: 'var(--border)' }}>
                {active.description}
              </div>

              {/* Warning if any */}
              {active.warning && (
                <div className="px-4 py-2 border-b flex gap-2 items-start" style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(234,179,8,0.05)' }}>
                  <AlertTriangle size={12} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-yellow-300">{active.warning}</span>
                </div>
              )}

              {/* Script content */}
              <div className="overflow-auto" style={{ maxHeight: 580 }}>
                <pre className="p-4 text-xs font-mono leading-relaxed text-green-300 whitespace-pre select-all">
                  {active.content}
                </pre>
              </div>
            </div>

            {/* Big copy button below */}
            <div className="mt-3 flex justify-end">
              <CopyButton text={active.content} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <span className="text-xs text-muted-foreground font-mono">
            XAutomate · Hetzner {SERVER_IP} · Ubuntu 22.04/24.04 · Up to 30 accounts · 24/7
          </span>
        </div>
      </div>
    </AppLayout>
  );
}
