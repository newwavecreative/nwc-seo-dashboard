/**
 * One-time migration: switch gsc_snapshots to per-day storage with upsert support.
 *
 * Old model: each weekly sync inserted a 90-day rollup, all rows stamped with sync date.
 *            Re-syncs duplicated rows; summary queries over short windows returned zeros.
 *
 * New model: one row per (page_url, query, snapshot_date) where snapshot_date is the
 *            actual GSC date. Unique constraint enables ON CONFLICT DO UPDATE so each
 *            sync idempotently overwrites the trailing window (GSC revises recent data).
 *
 * This migration:
 *   1. Truncates gsc_snapshots (old rollup data is unusable with new aggregation)
 *   2. Adds UNIQUE (page_url, query, snapshot_date)
 *
 * Safe to re-run.
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  console.log('🔧 Migrating gsc_snapshots to per-day model...');
  try {
    const before = await pool.query('SELECT COUNT(*) FROM gsc_snapshots');
    console.log(`  Rows before: ${before.rows[0].count}`);

    await pool.query('TRUNCATE gsc_snapshots RESTART IDENTITY');
    console.log('  ✓ Truncated gsc_snapshots');

    // Drop any pre-existing constraint with the same name so this is re-runnable
    await pool.query(`
      ALTER TABLE gsc_snapshots
      DROP CONSTRAINT IF EXISTS gsc_snapshots_page_query_date_key
    `);
    await pool.query(`
      ALTER TABLE gsc_snapshots
      ADD CONSTRAINT gsc_snapshots_page_query_date_key
      UNIQUE (page_url, query, snapshot_date)
    `);
    console.log('  ✓ Added UNIQUE (page_url, query, snapshot_date)');

    console.log('\n✅ Migration complete. Run a manual sync to repopulate.');
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrate();
