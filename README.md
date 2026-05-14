# NWC SEO Dashboard

A real-time SEO ranking and performance dashboard for New Wave Creative, pulling data from Google Search Console weekly.

## Features

- 📊 Real-time SEO metrics (impressions, clicks, CTR, ranking positions)
- 📈 Top keywords and pages tracking
- 📉 Historical trend analysis
- 🔄 Automated weekly GSC data sync
- 🔐 JWT-based authentication
- 📱 Responsive design

## Tech Stack

- **Frontend**: React 18, Tailwind CSS, Recharts
- **Backend**: Node.js, Express, PostgreSQL
- **Deployment**: Railway
- **Data Source**: Google Search Console API

## Setup

### Prerequisites

- Node.js 16+
- PostgreSQL (via Railway)
- Google OAuth credentials (client_secret.json)
- OAuth token.json from Google

### Installation

1. Clone the repository:
```bash
git clone https://github.com/newwavecreative/nwc-seo-dashboard.git
cd nwc-seo-dashboard
```

2. Install backend dependencies:
```bash
cd backend
npm install
```

3. Set up environment variables:
```bash
cp backend/.env.example backend/.env
# Edit .env with your database credentials
```

4. Install frontend dependencies:
```bash
cd ../frontend
npm install
```

### Running Locally

```bash
# From project root
npm run dev
```

This will start both backend (port 3001) and frontend (port 3000).

### Deployment to Railway

1. Connect your GitHub repo to Railway
2. Create a new service (PostgreSQL)
3. Set environment variables:
   - `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
   - `JWT_SECRET` (generate a random string)
   - `NODE_ENV=production`
   - `TOKEN_PATH` (path to token.json in the container)

4. Deploy!

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with email/password

### SEO Data
- `GET /api/seo/summary` - Overall metrics (last 7 days)
- `GET /api/seo/top-keywords` - Top 20 keywords (last 30 days)
- `GET /api/seo/top-pages` - Top 15 pages (last 30 days)
- `GET /api/seo/rankings` - Raw ranking data

All endpoints require JWT authentication.

## GSC Data Sync

The dashboard automatically pulls GSC data every:
- **Weekly** via cron job (runs on Sundays at 2 AM UTC)
- **On-demand** via API endpoint

Data is stored in PostgreSQL with historical snapshots for trend analysis.

## Database Schema

### gsc_snapshots
- `id` - Primary key
- `page_url` - Target page URL
- `query` - Search query
- `impressions` - Search impressions
- `clicks` - Actual clicks
- `ctr` - Click-through rate (%)
- `position` - Average ranking position
- `snapshot_date` - Date of snapshot
- `created_at` - Timestamp

### users
- `id` - Primary key
- `email` - Login email (unique)
- `password_hash` - Hashed password
- `name` - User display name
- `created_at` - Account creation date

### ranking_targets
- `id` - Primary key
- `keyword` - Target keyword
- `target_page` - Target page URL
- `target_position` - Goal ranking position
- `current_position` - Current ranking
- `current_impressions` - Current impressions

## Troubleshooting

### "Email not found" during login
- Make sure a user account exists in the database
- Use a database tool to add test users if needed

### GSC data not syncing
- Check that token.json exists and is valid
- Verify Google APIs are enabled in your GCP project
- Check logs in Railway dashboard

### Database connection errors
- Verify PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE are correct
- Ensure PostgreSQL service is running in Railway
- Check that your IP is whitelisted (if applicable)

## Contributing

Questions? Reach out to Allen at New Wave Creative.

## License

Proprietary - New Wave Creative
