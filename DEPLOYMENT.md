# SiteReady Deployment Guide

## Quick Deploy to Railway

**Prerequisites:**
- GitHub account (you have `rickrollerd`)
- Railway account (free, takes 2 min with GitHub OAuth)
- Anthropic API key (you have this)
- siteready.co.nz domain (or buy from Namecheap)

### Step 1: Deploy to Railway (5 minutes)

1. Go to **https://railway.app**
2. Sign up with GitHub OAuth (use rickrollerd account)
3. Click **"New Project"** → **"Deploy from GitHub repo"**
4. Authorize GitHub access
5. Select repo: **rickrollerd/siteready**
6. Railway auto-detects Node.js, builds, deploys
7. You get a live URL like: `https://siteready.railway.app`

### Step 2: Add Environment Variables

In Railway dashboard, go to **Variables**:

```
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
PORT=3000  (Railway sets this automatically, optional)
```

That's it. App is now live.

### Step 3: Custom Domain (siteready.co.nz)

1. Buy domain from Namecheap or similar
2. In Railway dashboard, go to **Settings** → **Domains**
3. Click **"Add Custom Domain"**
4. Enter: `siteready.co.nz`
5. Railway gives you a CNAME: `xxx.railway.app`
6. In Namecheap DNS settings, add CNAME record:
   - Name: `@`
   - Type: `CNAME`
   - Value: (the Railway CNAME)
   - TTL: 3600
7. Wait 5-10 minutes for DNS to propagate
8. Visit https://siteready.co.nz — live

### Step 4: Stripe Setup (Optional, for Payments)

Once app is live and you're ready to accept payments:

1. Go to **https://stripe.com**, sign up
2. Get API keys from Stripe dashboard
3. In Railway, add env variables:
   - `STRIPE_SECRET_KEY=sk_live_...`
   - `STRIPE_PUBLISHABLE_KEY=pk_live_...`
4. Henry will implement the billing endpoint

### Monitoring

- Railway dashboard shows logs, CPU, memory, uptime
- Access logs: **Settings** → **View Logs**
- Restart app: **Redeploy** button (no downtime)

### Common Issues

**"Cannot find module 'express'"**
- Railway didn't run `npm install`. Check build logs.
- Fix: Click **Redeploy**, it should run npm install automatically.

**"ANTHROPIC_API_KEY is undefined"**
- You forgot to add the env variable in Railway.
- Go to **Variables**, add `ANTHROPIC_API_KEY=sk-ant-...`
- Redeploy.

**Domain not working**
- DNS might not have propagated yet (wait 10 min)
- Check CNAME record in Namecheap is correct
- Test with: `nslookup siteready.co.nz`

### Local Development

To run locally:

```bash
cd /home/maxim/.openclaw/workspace/SiteReady/app
cp .env.example .env
# Edit .env and add your actual Anthropic API key
npm install
npm start
# Opens on http://localhost:3000
```

### Support

If something breaks on Railway:
1. Check build logs in Railway dashboard
2. Check runtime logs (Settings → View Logs)
3. Redeploy from dashboard
4. If still stuck, check server.js for syntax errors: `node --check server.js`
