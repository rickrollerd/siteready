# SiteReady Deployment Guide

## Quick Deploy to Railway

**Prerequisites:**
- GitHub account (you have `rickrollerd`)
- Railway account (free, takes 2 min with GitHub OAuth)
- siteready.co.nz domain (or buy from Namecheap)

### Step 1: Deploy to Railway (5 minutes)

1. Go to **https://railway.app**
2. Sign up with GitHub OAuth (use rickrollerd account)
3. Click **"New Project"** → **"Deploy from GitHub repo"**
4. Authorize GitHub access
5. Select repo: **rickrollerd/siteready**
6. Railway auto-detects Node.js, builds, deploys
7. You get a live URL like: `https://siteready.railway.app`

### Step 2: Environment variables

No API key is needed. Railway sets `PORT`. The optional settings are in `.env.example`.

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

### Monitoring

- Railway dashboard shows logs, CPU, memory, uptime
- Access logs: **Settings** → **View Logs**
- Restart app: **Redeploy** button (no downtime)

### Common Issues

**"Cannot find module 'express'"**
- Railway didn't run `npm install`. Check build logs.
- Fix: Click **Redeploy**, it should run npm install automatically.

**Domain not working**
- DNS might not have propagated yet (wait 10 min)
- Check CNAME record in Namecheap is correct
- Test with: `nslookup siteready.co.nz`

### Local Development

To run locally:

```bash
cp .env.example .env
npm install
npm test
npm start
# Opens on http://localhost:3849
```

### Support

If something breaks on Railway:
1. Check build logs in Railway dashboard
2. Check runtime logs (Settings → View Logs)
3. Redeploy from dashboard
4. If still stuck, run `npm test` locally
