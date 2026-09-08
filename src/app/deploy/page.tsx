'use client';

import React, { useState } from 'react';
import { Server, Copy, Check, Terminal, ChevronDown, ChevronUp, Info } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { toast } from 'sonner';
import { Toaster } from 'sonner';

const DEPLOY_SCRIPT = `#!/bin/bash
# XAutomate — Hetzner VPS Deploy Script
# Cookie-based auth (no username/password required)
# Run as root on a fresh Ubuntu 22.04 server

set -e

echo "=== XAutomate VPS Setup ==="

# 1. Update system
apt-get update -y && apt-get upgrade -y

# 2. Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git

# 3. Install PM2 process manager
npm install -g pm2

# 4. Clone or copy your app
# Option A: Clone from your private repo
# git clone https://github.com/YOUR_USER/xautomate.git /opt/xautomate

# Option B: Upload via SCP (run this from your local machine)
# scp -r ./xautomate root@YOUR_VPS_IP:/opt/xautomate

cd /opt/xautomate

# 5. Install dependencies
npm install --production=false

# 6. Build the Next.js app
npm run build

# 7. Start with PM2
pm2 start npm --name "xautomate" -- start
pm2 startup
pm2 save

echo "" echo"=== Deploy complete ===" echo"App running at http://$(hostname -I | awk '{print $1}'):3000"
echo "" echo"Useful commands:" echo"  pm2 status          — check app status" echo"  pm2 logs xautomate  — view live logs" echo"  pm2 restart xautomate — restart app"
`;

const NGINX_SCRIPT = `# Nginx reverse proxy config (optional — for domain + HTTPS)
# Install: apt-get install -y nginx certbot python3-certbot-nginx
# Save to: /etc/nginx/sites-available/xautomate

server {
    listen 80;
    server_name YOUR_DOMAIN.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}

# After saving, run:
# ln -s /etc/nginx/sites-available/xautomate /etc/nginx/sites-enabled/
# nginx -t && systemctl reload nginx
# certbot --nginx -d YOUR_DOMAIN.com
`;

const UPDATE_SCRIPT = `#!/bin/bash
# XAutomate — Update script (run on VPS to pull latest changes)

cd /opt/xautomate

# Pull latest code (if using git)
# git pull origin main

# Reinstall deps and rebuild
npm install --production=false
npm run build

# Restart app
pm2 restart xautomate

echo "Update complete."
`;

interface ScriptBlockProps {
  title: string;
  description: string;
  script: string;
  filename: string;
}

function ScriptBlock({ title, description, script, filename }: ScriptBlockProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(script);
    setCopied(true);
    toast.success(`Copied ${filename}`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--card)' }}>
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        style={{ backgroundColor: 'var(--input)', borderBottom: expanded ? '1px solid var(--border)' : 'none' }}
        onClick={() => setExpanded(p => !p)}
      >
        <div className="flex items-center gap-2.5">
          <Terminal size={14} className="text-primary" />
          <div>
            <span className="text-sm font-semibold text-foreground">{title}</span>
            <span className="ml-2 font-mono-data text-xs text-muted-foreground">{filename}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary text-xs py-1 px-2.5 gap-1"
            onClick={e => { e.stopPropagation(); handleCopy(); }}
          >
            {copied ? <Check size={12} className="text-primary" /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          {expanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </div>
      </div>
      {expanded && (
        <div className="p-4 overflow-x-auto">
          <p className="text-xs text-muted-foreground mb-3">{description}</p>
          <pre className="font-mono-data text-xs text-foreground whitespace-pre leading-relaxed"
            style={{ color: 'var(--foreground)', opacity: 0.85 }}>
            {script.trim()}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function DeployPage() {
  return (
    <AppLayout>
      <Toaster position="bottom-right" theme="dark" toastOptions={{
        style: { background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' },
      }} />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Server size={20} className="text-primary" />
            Deploy to Hetzner VPS
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cookie-based authentication — no Twitter API keys or username/password required. Your session cookies authenticate all requests.
          </p>
        </div>

        {/* Info banner */}
        <div className="mb-6 flex items-start gap-3 p-4 rounded-lg"
          style={{ backgroundColor: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.2)' }}>
          <Info size={15} className="text-primary mt-0.5 flex-shrink-0" />
          <div className="text-sm text-muted-foreground space-y-1">
            <p><span className="text-foreground font-medium">How it works:</span> XAutomate uses your X session cookies (<span className="font-mono-data text-xs">auth_token</span> + <span className="font-mono-data text-xs">ct0</span>) to authenticate requests directly to X&apos;s internal GraphQL API — the same way your browser does. No developer account or API keys needed.</p>
            <p><span className="text-foreground font-medium">Recommended VPS:</span> Hetzner CX11 (€3.79/mo) — 1 vCPU, 2GB RAM, Ubuntu 22.04. More than enough for this app.</p>
          </div>
        </div>

        {/* Steps */}
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { step: '1', title: 'Provision VPS', desc: 'Create a Hetzner CX11 with Ubuntu 22.04. Note the IP address.' },
            { step: '2', title: 'Run deploy script', desc: 'SSH in as root and run the deploy script below.' },
            { step: '3', title: 'Open in browser', desc: 'Visit http://YOUR_VPS_IP:3000 and paste your cookies.' },
          ].map(s => (
            <div key={s.step} className="rounded-lg p-4"
              style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-mono-data"
                  style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                  {s.step}
                </span>
                <span className="text-sm font-semibold text-foreground">{s.title}</span>
              </div>
              <p className="text-xs text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* Scripts */}
        <div className="space-y-4">
          <ScriptBlock
            title="Deploy Script"
            filename="deploy.sh"
            description="Run this on a fresh Hetzner Ubuntu 22.04 VPS as root. Installs Node.js 20, PM2, builds the app, and starts it."
            script={DEPLOY_SCRIPT}
          />
          <ScriptBlock
            title="Nginx Reverse Proxy (Optional)"
            filename="nginx.conf"
            description="Optional: set up Nginx as a reverse proxy with HTTPS via Let's Encrypt. Replace YOUR_DOMAIN.com with your actual domain."
            script={NGINX_SCRIPT}
          />
          <ScriptBlock
            title="Update Script"
            filename="update.sh"
            description="Run this on the VPS whenever you want to deploy a new version of the app."
            script={UPDATE_SCRIPT}
          />
        </div>

        {/* Security note */}
        <div className="mt-6 p-4 rounded-lg"
          style={{ backgroundColor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <p className="text-xs font-semibold text-accent mb-1">⚠ Security reminder</p>
          <p className="text-xs text-muted-foreground">
            Your session cookies grant full access to your X account. Never share them. On the VPS, the app stores cookies only in your browser&apos;s localStorage — they are never written to disk or sent to any third-party server. Use a firewall (ufw) to restrict port 3000 to your IP only if you don&apos;t use Nginx.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
