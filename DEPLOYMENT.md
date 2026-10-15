# SiteWrite Deployment Guide

## Quick Deploy to Railway

**Prerequisites:**
- GitHub account (you have `rickrollerd`)
- Railway account (free, takes 2 min with GitHub OAuth)
- sitewrite.com.au domain (or buy from Namecheap)

### Step 1: Deploy to Railway (5 minutes)

1. Go to **https://railway.app**
2. Sign up with GitHub OAuth (use rickrollerd account)
3. Click **"New Project"** → **"Deploy from GitHub repo"**
4. Authorize GitHub access
5. Select repo: **rickrollerd/siteready**
6. Railway auto-detects Node.js, builds, deploys
7. You get a live URL like: `https://siteready.railway.app`

### Step 2: Database and environment variables

1. In the Railway project, click **New** → **Database** → **Add PostgreSQL**. Railway adds `DATABASE_URL` to the app. The tables are created when the app starts.
2. In the app's **Variables**, add:
   - `APP_URL`: the public address, for example `https://sitewrite.com.au` (used in sign-in links, QR codes and Face ID)
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `MAIL_FROM`: the mail account that sends sign-in links and review reminders (Gmail: `smtp.gmail.com`, port `465`, an app password)
   - `NODE_ENV=production`
   - `INDUSTRY_KEY`: a long random value (at least 32 characters) for the keyed business code in the industry data. Without it, production keeps no industry records and the log says so.
   - `CONTROL_LEARNING_KEY`: another long random value (at least 32 characters), set before `CONTROL_LEARNING=on`. Without it, control learning stays off in production and the log says so.
   - Design files (the engineer's or temporary works designs users attach to a SWMS, owner decision D215): add a Railway **Bucket** to the project, then set these as references to the bucket's Credentials: `DESIGN_FILES_BUCKET` (BUCKET), `DESIGN_FILES_BUCKET_KEY_ID` (ACCESS_KEY_ID), `DESIGN_FILES_BUCKET_SECRET` (SECRET_ACCESS_KEY), `DESIGN_FILES_BUCKET_REGION` (REGION) and `DESIGN_FILES_BUCKET_ENDPOINT` (ENDPOINT), and `DESIGN_FILES_BUCKET_PATH_STYLE=on` if the Credentials tab says the bucket uses path-style addresses. Without them, production takes no design files (the design's reference still prints) and the log says so. Locally and in tests the files go in the database.
3. Railway sets `PORT`. The other optional settings are in `.env.example`.

### Step 2a: Keeping SWMS checked with the builder check (optional)

Off unless `KEEP_CHECKED_SWMS=on`. When on, each SWMS uploaded or pasted into the builder check is kept (the original, its text, the result), the check page tells the user and offers "Do not keep this document", and the owner sees them on `/admin.html`. The originals go in a Railway storage bucket in production:

1. In the Railway project, click **Create** → **Bucket**, choose its region and name it (for example `sitewrite-checks`).
2. In the app's **Variables**, add these as references to the bucket's Credentials (the bucket's own name for each is in brackets):
   - `CHECKED_SWMS_BUCKET` (`BUCKET`)
   - `CHECKED_SWMS_BUCKET_KEY_ID` (`ACCESS_KEY_ID`)
   - `CHECKED_SWMS_BUCKET_SECRET` (`SECRET_ACCESS_KEY`)
   - `CHECKED_SWMS_BUCKET_REGION` (`REGION`)
   - `CHECKED_SWMS_BUCKET_ENDPOINT` (`ENDPOINT`)
   - `CHECKED_SWMS_BUCKET_PATH_STYLE=on` only if the Credentials tab says the bucket uses path-style URLs.
3. Set `KEEP_CHECKED_SWMS=on`. It uses `CHECKED_SWMS_KEY` (a long random value, at least 32 characters) for the keyed business fingerprint in the learning copy, or `CONTROL_LEARNING_KEY` when that is set and `CHECKED_SWMS_KEY` is not.

Optional: `KEEP_CHECKED_SWMS_YEARS` (default 3) and, for local copies without a bucket, `KEEP_CHECKED_SWMS_DB_MAX_MB` (default 5). Without the bucket, production keeps the text and result but not the original, and the log says so at start.

Without `DATABASE_URL` the app still drafts and previews, but signing in, downloads and saving are switched off.

Face ID works in Safari and Chrome on the web address. In the iOS app wrapper it also needs the domain added as an associated domain (webcredentials), which is set up when the app is signed for the App Store.

### Step 2b: Subscriptions (Stripe)

1. Create a Stripe account and complete the business details (ABN, bank account).
2. **Product catalogue** → add a product "SiteWrite", with a recurring price of A$49 a month, GST inclusive (set the price to include tax). Copy the price id (`price_...`).
3. **Developers** → **API keys**: copy the secret key (`sk_live_...`).
4. **Developers** → **Webhooks** → add an endpoint `https://YOUR-DOMAIN/api/billing/webhook` with the events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`. Copy the signing secret (`whsec_...`).
5. **Settings** → **Billing** → **Customer portal**: switch it on, allowing customers to update cards, see invoices and cancel.
6. In Railway, set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` and `STRIPE_WEBHOOK_SECRET`.

Use test keys (`sk_test_...`) first, and subscribe with Stripe's test card 4242 4242 4242 4242 to check it end to end.

Set `ADMIN_EMAILS` to your email to see sign-ups, trials, paying companies, actions and recent errors at `/admin.html`. `/api/health` reports whether the database is reachable, for an uptime monitor.

### Step 3: Custom Domain (sitewrite.com.au)

1. Buy domain from Namecheap or similar
2. In Railway dashboard, go to **Settings** → **Domains**
3. Click **"Add Custom Domain"**
4. Enter: `sitewrite.com.au`
5. Railway gives you a CNAME: `xxx.railway.app`
6. In Namecheap DNS settings, add CNAME record:
   - Name: `@`
   - Type: `CNAME`
   - Value: (the Railway CNAME)
   - TTL: 3600
7. Wait 5-10 minutes for DNS to propagate
8. Visit https://sitewrite.com.au — live

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
- Test with: `nslookup sitewrite.com.au`

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
