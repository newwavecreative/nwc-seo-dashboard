/**
 * GSC Data Sync - Pulls weekly GSC data and stores in database
 * Called by cron job and manual API endpoint
 */

const { Pool } = require('pg');
const { Credentials } = require('google-auth-library');
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

async function syncGSCData() {
  console.log('🔄 Starting GSC data sync...');
  
  try {
    // Load OAuth token from token.json (in root directory)
    let tokenData;
    try {
      const fs = require('fs');
      const tokenPath = process.env.TOKEN_PATH || '/Users/charles/.openclaw/workspace/token.json';
      tokenData = JSON.parse(fs.readFileSync(tokenPath));
    } catch (err) {
      console.error('❌ Could not load token.json. Make sure OAuth is set up.');
      return;
    }

    // Create credentials from token
    const auth = new Credentials(tokenData);

    // Initialize Webmasters API
    const webmasters = google.webmasters({
      version: 'v3',
      auth: auth,
    });

    // Query GSC data for last 90 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    const response = await webmasters.searchanalytics.query({
      siteUrl: `https://${DOMAIN}/`,
      requestBody: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        dimensions: ['page', 'query'],
        rowLimit: 10000,
      },
    });

    if (!response.data.rows) {
      console.log('✓ No GSC data found');
      return;
    }

    // Store data in database
    const snapshotDate = new Date().toISOString().split('T')[0];
    let insertedCount = 0;

    for (const row of response.data.rows) {
      const pageUrl = row.keys[0];
      const query = row.keys[1];
      const impressions = row.impressions || 0;
      const clicks = row.clicks || 0;
      const ctr = row.ctr ? parseFloat((row.ctr * 100).toFixed(2)) : 0;
      const position = row.position ? parseFloat(row.position.toFixed(2)) : 0;

      try {
        await pool.query(`
          INSERT INTO gsc_snapshots 
          (page_url, query, impressions, clicks, ctr, position, snapshot_date)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [pageUrl, query, impressions, clicks, ctr, position, snapshotDate]);
        insertedCount++;
      } catch (err) {
        // Duplicate insert is fine, just skip
        if (err.code !== '23505') {
          console.error('Insert error:', err.message);
        }
      }
    }

    console.log(`✓ GSC sync complete. Inserted ${insertedCount} records`);
    return insertedCount;
  } catch (err) {
    console.error('❌ GSC sync error:', err.message);
  }
}

module.exports = { syncGSCData };
