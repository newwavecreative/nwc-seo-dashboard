/**
 * GSC Data Sync - Pulls weekly GSC data and stores in database
 * Called by cron job and manual API endpoint
 */

const { Pool } = require('pg');
const { google } = require('googleapis');
require('dotenv').config();

const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const DOMAIN = 'newwavecreative.io';

async function refreshAccessToken(refreshToken, clientId, clientSecret) {
  console.log('🔄 Refreshing Google access token...');
  
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'http://localhost:3000/auth/google/callback'
  );

  return new Promise((resolve, reject) => {
    oauth2Client.refreshAccessToken((err, tokens) => {
      if (err) {
        reject(new Error(`Token refresh failed: ${err.message}`));
      } else {
        console.log('✓ Token refreshed successfully');
        resolve(tokens.access_token);
      }
    });
  });
}

async function syncGSCData() {
  console.log('🔄 Starting GSC data sync...');
  
  try {
    // Load OAuth credentials from env vars or token.json
    let token, refreshToken, clientId, clientSecret;
    
    if (process.env.GOOGLE_AUTH_TOKEN && process.env.GOOGLE_REFRESH_TOKEN) {
      console.log('🔑 Loading credentials from environment variables');
      token = process.env.GOOGLE_AUTH_TOKEN;
      refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
      clientId = process.env.GOOGLE_CLIENT_ID;
      clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    } else {
      console.log('📄 Loading credentials from token.json');
      try {
        const fs = require('fs');
        const tokenPath = process.env.TOKEN_PATH || '/Users/charles/.openclaw/workspace/token.json';
        const tokenData = JSON.parse(fs.readFileSync(tokenPath));
        token = tokenData.token;
        refreshToken = tokenData.refresh_token;
        clientId = tokenData.client_id;
        clientSecret = tokenData.client_secret;
      } catch (err) {
        throw new Error(`Could not load OAuth credentials: ${err.message}`);
      }
    }

    if (!token || !refreshToken || !clientId || !clientSecret) {
      throw new Error('Missing OAuth credentials. Set GOOGLE_* env vars or provide token.json');
    }

    // Try to use the access token
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ access_token: token, refresh_token: refreshToken });

    // Initialize Webmasters API
    const webmasters = google.webmasters({
      version: 'v3',
      auth: oauth2Client,
    });

    // Query GSC data for last 90 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    console.log(`📊 Querying GSC data from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

    const response = await webmasters.searchanalytics.query({
      siteUrl: `https://${DOMAIN}/`,
      requestBody: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        // 'date' dimension gives us per-day rows instead of a 90-day rollup,
        // which is what makes time-windowed queries work correctly.
        dimensions: ['date', 'page', 'query'],
        rowLimit: 25000,
      },
    });

    if (!response.data.rows || response.data.rows.length === 0) {
      console.log('ℹ️  No GSC data found for this period');
      return 0;
    }

    console.log(`📥 Received ${response.data.rows.length} rows from GSC`);

    // Upsert each (date, page, query) row. GSC revises recent days, so we want
    // re-syncs to overwrite rather than duplicate. Requires the UNIQUE constraint
    // added by migrate-gsc-schema.js.
    let upsertedCount = 0;
    let errorCount = 0;

    for (const row of response.data.rows) {
      const rowDate = row.keys[0]; // YYYY-MM-DD from GSC
      const pageUrl = row.keys[1];
      const query = row.keys[2];
      const impressions = row.impressions || 0;
      const clicks = row.clicks || 0;
      const ctr = row.ctr ? parseFloat((row.ctr * 100).toFixed(2)) : 0;
      const position = row.position ? parseFloat(row.position.toFixed(2)) : 0;

      try {
        await pool.query(`
          INSERT INTO gsc_snapshots
            (page_url, query, impressions, clicks, ctr, position, snapshot_date)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (page_url, query, snapshot_date) DO UPDATE SET
            impressions = EXCLUDED.impressions,
            clicks = EXCLUDED.clicks,
            ctr = EXCLUDED.ctr,
            position = EXCLUDED.position
        `, [pageUrl, query, impressions, clicks, ctr, position, rowDate]);
        upsertedCount++;
      } catch (err) {
        errorCount++;
        if (errorCount <= 5) console.error('Upsert error:', err.message);
      }
    }

    console.log(`✓ GSC sync complete. Upserted ${upsertedCount} records (${errorCount} errors)`);
    return upsertedCount;
  } catch (err) {
    console.error('❌ GSC sync error:', err.message);
    throw err;
  }
}

module.exports = { syncGSCData };
