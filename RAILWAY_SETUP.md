# Railway Deployment Setup Guide

Follow these steps to deploy the SEO Dashboard to Railway.

## Prerequisites

- GitHub repo created: `newwavecreative/nwc-seo-dashboard`
- Railway account (railway.app)
- Database credentials from earlier setup

## Step 1: Create Railway Project

1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub"
4. Connect your GitHub account
5. Select `newwavecreative/nwc-seo-dashboard` repo

## Step 2: Add PostgreSQL Database

1. In your Railway project, click "Add Service"
2. Select "PostgreSQL"
3. Railway will automatically create the database
4. Note the connection details

## Step 3: Configure Environment Variables

In your Railway project settings, add these variables:

```
PGHOST=your_railway_postgres_host
PGPORT=5432
PGUSER=postgres
PGPASSWORD=your_password
PGDATABASE=railway

JWT_SECRET=generate_a_random_string_here
NODE_ENV=production

REACT_APP_API_URL=https://your-railway-url.up.railway.app
```

To find your Railway URL:
1. Go to your Railway project
2. Click the service
3. Copy the public URL from the "Deployments" tab

## Step 4: Initialize Database

Before first deployment, run the database initialization:

```bash
# SSH into your Railway container
railway shell

# Run initialization
node backend/init-db.js

# You should see confirmation
```

## Step 5: Deploy

1. Push your code to GitHub:
```bash
git add .
git commit -m "Initial SEO Dashboard setup"
git push origin main
```

2. Railway will auto-deploy from `main` branch
3. Check deployment status in Railway dashboard
4. Once deployed, visit your public URL

## Step 6: First Login

Use these credentials:
- **Email**: test@newwavecreative.io
- **Password**: testpassword123

⚠️ **Change this password immediately after login!**

## Step 7: Set Up GSC Data Sync

1. Make sure `token.json` is available in your Railway environment
   - Add it as a mounted file or pass via environment variable
   - Update `TOKEN_PATH` in .env if needed

2. The cron job will run automatically:
   - **Every Sunday at 2:00 AM UTC**
   - Pulls last 90 days of GSC data
   - Stores in PostgreSQL

## Step 8: Verify Deployment

1. Visit your Railway URL
2. Login with test credentials
3. Check the dashboard loads
4. Verify database is connected (should show summary stats)

## Troubleshooting

### Build Failures
- Check Railway logs: click service → Deployments → View logs
- Common issues:
  - Missing environment variables
  - Database not running yet (wait 1-2 min after adding service)
  - Node version mismatch

### Database Connection Issues
- Verify PGHOST, PGPORT, etc. match Railway's actual values
- Make sure PostgreSQL service is running
- Check Railway logs for connection errors

### GSC Sync Not Working
- Verify token.json exists and is readable
- Check that Google APIs are enabled in your GCP project
- Look at Railway logs for OAuth errors

### Frontend Not Loading
- Check that REACT_APP_API_URL is set correctly
- Verify backend is running on /api endpoints
- Check browser console for CORS errors

## Updating After Deployment

To update the dashboard:

1. Make changes locally
2. Push to GitHub:
```bash
git add .
git commit -m "Your message"
git push origin main
```

3. Railway automatically redeploys on `main` push

## Monitoring

Check the SEO Dashboard regularly:
- Visit the Railway metrics tab to see:
  - Request rates
  - Error rates
  - Database connections
  - CPU/Memory usage

## Need Help?

Check:
- Railway docs: https://docs.railway.app
- GitHub Issues in nwc-seo-dashboard
- OpenClaw workspace notes
