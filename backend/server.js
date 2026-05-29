const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config();
const { syncGSCData } = require('./gsc-sync');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Database connection
const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Middleware
app.use(cors());
app.use(express.json());

// Auth routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'No token provided' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// SEO API routes
app.get('/api/seo/rankings', authenticateToken, async (req, res) => {
  try {
    const days = req.query.days || 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await pool.query(`
      SELECT 
        page_url,
        query,
        impressions,
        clicks,
        ctr,
        position,
        snapshot_date
      FROM gsc_snapshots
      WHERE snapshot_date >= $1
      ORDER BY snapshot_date DESC, impressions DESC
      LIMIT 500
    `, [startDate.toISOString().split('T')[0]]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/seo/summary', authenticateToken, async (req, res) => {
  try {
    // Window of N days anchored to the latest available GSC date, not CURRENT_DATE.
    // GSC has a 2-3 day reporting lag and our sync runs weekly, so anchoring to
    // CURRENT_DATE produced empty results between syncs. Default N = 7.
    const days = parseInt(req.query.days) || 7;
    const result = await pool.query(`
      WITH latest AS (SELECT MAX(snapshot_date) AS d FROM gsc_snapshots)
      SELECT
        COUNT(DISTINCT query) as total_queries,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        ROUND(AVG(position)::numeric, 1) as avg_position,
        (SELECT d FROM latest) as latest_date
      FROM gsc_snapshots
      WHERE snapshot_date > (SELECT d FROM latest) - ($1 || ' days')::interval
        AND snapshot_date <= (SELECT d FROM latest)
    `, [days]);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/seo/top-keywords', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      WITH latest AS (SELECT MAX(snapshot_date) AS d FROM gsc_snapshots)
      SELECT
        query,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        ROUND((SUM(clicks)::float / NULLIF(SUM(impressions), 0) * 100)::numeric, 2) as ctr,
        ROUND(AVG(position)::numeric, 1) as avg_position
      FROM gsc_snapshots
      WHERE snapshot_date > (SELECT d FROM latest) - INTERVAL '30 days'
        AND snapshot_date <= (SELECT d FROM latest)
      GROUP BY query
      ORDER BY total_impressions DESC
      LIMIT 20
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/seo/top-pages', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      WITH latest AS (SELECT MAX(snapshot_date) AS d FROM gsc_snapshots)
      SELECT
        page_url,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        ROUND((SUM(clicks)::float / NULLIF(SUM(impressions), 0) * 100)::numeric, 2) as ctr,
        ROUND(AVG(position)::numeric, 1) as avg_position
      FROM gsc_snapshots
      WHERE snapshot_date > (SELECT d FROM latest) - INTERVAL '30 days'
        AND snapshot_date <= (SELECT d FROM latest)
      GROUP BY page_url
      ORDER BY total_impressions DESC
      LIMIT 15
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Comparison endpoint - current 30 days vs previous 30 days
app.get('/api/seo/comparison', authenticateToken, async (req, res) => {
  try {
    // Anchor windows to MAX(snapshot_date) — see /api/seo/summary for rationale.
    const currentResult = await pool.query(`
      WITH latest AS (SELECT MAX(snapshot_date) AS d FROM gsc_snapshots)
      SELECT
        COUNT(DISTINCT query) as total_queries,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        ROUND(AVG(position)::numeric, 1) as avg_position
      FROM gsc_snapshots
      WHERE snapshot_date > (SELECT d FROM latest) - INTERVAL '30 days'
        AND snapshot_date <= (SELECT d FROM latest)
    `);

    const previousResult = await pool.query(`
      WITH latest AS (SELECT MAX(snapshot_date) AS d FROM gsc_snapshots)
      SELECT
        COUNT(DISTINCT query) as total_queries,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        ROUND(AVG(position)::numeric, 1) as avg_position
      FROM gsc_snapshots
      WHERE snapshot_date > (SELECT d FROM latest) - INTERVAL '60 days'
        AND snapshot_date <= (SELECT d FROM latest) - INTERVAL '30 days'
    `);

    const current = currentResult.rows[0];
    const previous = previousResult.rows[0];

    // Calculate % changes
    const calcChange = (curr, prev) => {
      const c = parseFloat(curr) || 0;
      const p = parseFloat(prev) || 0;
      if (p === 0) return c > 0 ? 100 : 0;
      return parseFloat(((c - p) / p * 100).toFixed(1));
    };

    const comparison = {
      current: {
        total_queries: parseInt(current.total_queries),
        total_impressions: parseInt(current.total_impressions),
        total_clicks: parseInt(current.total_clicks),
        avg_position: current.avg_position
      },
      previous: {
        total_queries: parseInt(previous.total_queries),
        total_impressions: parseInt(previous.total_impressions),
        total_clicks: parseInt(previous.total_clicks),
        avg_position: previous.avg_position
      },
      change: {
        total_queries_pct: calcChange(current.total_queries, previous.total_queries),
        total_impressions_pct: calcChange(current.total_impressions, previous.total_impressions),
        total_clicks_pct: calcChange(current.total_clicks, previous.total_clicks),
        avg_position_pct: calcChange(current.avg_position, previous.avg_position) * -1 // inverted: lower position is better
      }
    };

    res.json(comparison);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Top keywords comparison
app.get('/api/seo/top-keywords-comparison', authenticateToken, async (req, res) => {
  try {
    const currentResult = await pool.query(`
      WITH latest AS (SELECT MAX(snapshot_date) AS d FROM gsc_snapshots)
      SELECT
        query,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        ROUND((SUM(clicks)::float / NULLIF(SUM(impressions), 0) * 100)::numeric, 2) as ctr,
        ROUND(AVG(position)::numeric, 1) as avg_position
      FROM gsc_snapshots
      WHERE snapshot_date > (SELECT d FROM latest) - INTERVAL '30 days'
        AND snapshot_date <= (SELECT d FROM latest)
      GROUP BY query
      ORDER BY total_impressions DESC
      LIMIT 20
    `);

    const previousResult = await pool.query(`
      WITH latest AS (SELECT MAX(snapshot_date) AS d FROM gsc_snapshots)
      SELECT
        query,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        ROUND((SUM(clicks)::float / NULLIF(SUM(impressions), 0) * 100)::numeric, 2) as ctr,
        ROUND(AVG(position)::numeric, 1) as avg_position
      FROM gsc_snapshots
      WHERE snapshot_date > (SELECT d FROM latest) - INTERVAL '60 days'
        AND snapshot_date <= (SELECT d FROM latest) - INTERVAL '30 days'
      GROUP BY query
      ORDER BY total_impressions DESC
      LIMIT 20
    `);

    // Create a map of previous data for easy lookup
    const prevMap = {};
    previousResult.rows.forEach(row => {
      prevMap[row.query] = row;
    });

    // Calculate % changes
    const calcChange = (curr, prev) => {
      const c = parseFloat(curr) || 0;
      const p = parseFloat(prev) || 0;
      if (p === 0) return c > 0 ? 100 : 0;
      return parseFloat(((c - p) / p * 100).toFixed(1));
    };

    const comparison = currentResult.rows.map(curr => {
      const prev = prevMap[curr.query];
      return {
        ...curr,
        total_impressions: parseInt(curr.total_impressions),
        total_clicks: parseInt(curr.total_clicks),
        impressions_pct: prev ? calcChange(curr.total_impressions, prev.total_impressions) : null,
        clicks_pct: prev ? calcChange(curr.total_clicks, prev.total_clicks) : null,
        position_pct: prev ? calcChange(curr.avg_position, prev.avg_position) * -1 : null
      };
    });

    res.json(comparison);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Top pages comparison
app.get('/api/seo/top-pages-comparison', authenticateToken, async (req, res) => {
  try {
    const currentResult = await pool.query(`
      WITH latest AS (SELECT MAX(snapshot_date) AS d FROM gsc_snapshots)
      SELECT
        page_url,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        ROUND((SUM(clicks)::float / NULLIF(SUM(impressions), 0) * 100)::numeric, 2) as ctr,
        ROUND(AVG(position)::numeric, 1) as avg_position
      FROM gsc_snapshots
      WHERE snapshot_date > (SELECT d FROM latest) - INTERVAL '30 days'
        AND snapshot_date <= (SELECT d FROM latest)
      GROUP BY page_url
      ORDER BY total_impressions DESC
      LIMIT 15
    `);

    const previousResult = await pool.query(`
      WITH latest AS (SELECT MAX(snapshot_date) AS d FROM gsc_snapshots)
      SELECT
        page_url,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        ROUND((SUM(clicks)::float / NULLIF(SUM(impressions), 0) * 100)::numeric, 2) as ctr,
        ROUND(AVG(position)::numeric, 1) as avg_position
      FROM gsc_snapshots
      WHERE snapshot_date > (SELECT d FROM latest) - INTERVAL '60 days'
        AND snapshot_date <= (SELECT d FROM latest) - INTERVAL '30 days'
      GROUP BY page_url
      ORDER BY total_impressions DESC
      LIMIT 15
    `);

    // Create a map of previous data for easy lookup
    const prevMap = {};
    previousResult.rows.forEach(row => {
      prevMap[row.page_url] = row;
    });

    // Calculate % changes
    const calcChange = (curr, prev) => {
      const c = parseFloat(curr) || 0;
      const p = parseFloat(prev) || 0;
      if (p === 0) return c > 0 ? 100 : 0;
      return parseFloat(((c - p) / p * 100).toFixed(1));
    };

    const comparison = currentResult.rows.map(curr => {
      const prev = prevMap[curr.page_url];
      return {
        ...curr,
        total_impressions: parseInt(curr.total_impressions),
        total_clicks: parseInt(curr.total_clicks),
        impressions_pct: prev ? calcChange(curr.total_impressions, prev.total_impressions) : null,
        clicks_pct: prev ? calcChange(curr.total_clicks, prev.total_clicks) : null,
        position_pct: prev ? calcChange(curr.avg_position, prev.avg_position) * -1 : null
      };
    });

    res.json(comparison);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GSC sync health — unauthenticated so external watchdogs can poll it.
// Returns no sensitive data, just sync status + freshness of the data.
app.get('/api/health/gsc', async (req, res) => {
  try {
    const lastAttempt = await pool.query(`
      SELECT status, started_at, finished_at, rows_upserted, error_message, trigger
      FROM gsc_sync_log ORDER BY id DESC LIMIT 1
    `);
    const lastSuccess = await pool.query(`
      SELECT started_at, rows_upserted, trigger FROM gsc_sync_log
      WHERE status = 'success' ORDER BY id DESC LIMIT 1
    `);
    const dataState = await pool.query(`
      SELECT MAX(snapshot_date) AS latest_date, COUNT(*)::int AS total_rows
      FROM gsc_snapshots
    `);

    const last = lastAttempt.rows[0] || null;
    const success = lastSuccess.rows[0] || null;
    const hoursSinceSuccess = success
      ? (Date.now() - new Date(success.started_at).getTime()) / 3600000
      : null;

    // Healthy = had a successful sync in the last 30h (24h cron + 6h grace),
    // AND the most recent attempt wasn't an error newer than the last success.
    const recentSuccess = hoursSinceSuccess !== null && hoursSinceSuccess < 30;
    const noNewerFailure =
      !last || last.status !== 'error' ||
      (success && new Date(success.started_at) > new Date(last.started_at));
    const healthy = recentSuccess && noNewerFailure;

    res.json({
      healthy,
      last_attempt: last,
      last_success_at: success ? success.started_at : null,
      last_success_rows: success ? success.rows_upserted : null,
      hours_since_success: hoursSinceSuccess !== null
        ? Math.round(hoursSinceSuccess * 10) / 10 : null,
      data: dataState.rows[0],
    });
  } catch (err) {
    res.status(500).json({ healthy: false, error: err.message });
  }
});

// Wrapper around syncGSCData() that records each run in gsc_sync_log so
// /api/health/gsc and external watchdogs can detect failures.
async function runSyncWithLog(triggerLabel) {
  const start = await pool.query(
    `INSERT INTO gsc_sync_log (status, trigger) VALUES ('running', $1) RETURNING id`,
    [triggerLabel]
  );
  const logId = start.rows[0].id;
  try {
    const count = await syncGSCData();
    await pool.query(
      `UPDATE gsc_sync_log
       SET status = 'success', rows_upserted = $1, finished_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [count, logId]
    );
    return count;
  } catch (err) {
    await pool.query(
      `UPDATE gsc_sync_log
       SET status = 'error', error_message = $1, finished_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [(err.message || String(err)).slice(0, 1000), logId]
    );
    throw err;
  }
}

// Manual GSC sync trigger (authenticated)
app.post('/api/sync/gsc', authenticateToken, async (req, res) => {
  try {
    console.log('📊 Manual GSC sync triggered by', req.user.email);
    const result = await runSyncWithLog('manual');
    const recordCount = result || 0;
    console.log(`✓ Sync returned: ${recordCount} records`);
    res.json({
      success: true,
      message: `GSC sync completed. Inserted ${recordCount} records.`,
      recordsInserted: recordCount,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('❌ Sync error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Serve React frontend in production (MUST be after API routes)
if (process.env.NODE_ENV === 'production') {
  const frontendBuildPath = path.join(__dirname, '../frontend/build');
  console.log(`📁 Serving frontend from: ${frontendBuildPath}`);
  
  app.use(express.static(frontendBuildPath));
  
  // Catch-all route - serve index.html for any unmatched routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
}

// Initialize database tables
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS gsc_snapshots (
        id SERIAL PRIMARY KEY,
        page_url VARCHAR(500),
        query TEXT,
        impressions INTEGER,
        clicks INTEGER,
        ctr DECIMAL(5,2),
        position DECIMAL(5,2),
        snapshot_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ranking_targets (
        id SERIAL PRIMARY KEY,
        keyword VARCHAR(255) NOT NULL,
        target_page VARCHAR(500),
        target_position INTEGER,
        current_position DECIMAL(5,2),
        current_impressions INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_gsc_date ON gsc_snapshots(snapshot_date);
      CREATE INDEX IF NOT EXISTS idx_gsc_page ON gsc_snapshots(page_url);
      CREATE INDEX IF NOT EXISTS idx_gsc_query ON gsc_snapshots(query);

      CREATE TABLE IF NOT EXISTS gsc_sync_log (
        id SERIAL PRIMARY KEY,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        finished_at TIMESTAMP,
        status TEXT NOT NULL,
        trigger TEXT,
        rows_upserted INTEGER,
        error_message TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_gsc_sync_log_started ON gsc_sync_log(started_at DESC);
    `);
    console.log('✓ Database tables initialized');

    // --- Migration: per-day GSC storage with upsert support ---
    // Older versions of this app stored 90-day rollups stamped with the sync date
    // (one snapshot_date per sync). The new sync writes one row per actual GSC date.
    // Detect legacy shape (few distinct dates but many rows) and truncate once so
    // the new model can populate cleanly. Then ensure the UNIQUE constraint exists.
    const constraintCheck = await pool.query(`
      SELECT 1 FROM pg_constraint WHERE conname = 'gsc_snapshots_page_query_date_key'
    `);
    if (constraintCheck.rows.length === 0) {
      const shape = await pool.query(`
        SELECT COUNT(*)::int AS rows, COUNT(DISTINCT snapshot_date)::int AS dates
        FROM gsc_snapshots
      `);
      const { rows, dates } = shape.rows[0];
      // Legacy rollup pattern: many rows concentrated into <=3 distinct dates.
      // Anything matching this can't coexist with the new per-day model.
      if (rows > 0 && dates > 0 && rows / dates > 500) {
        console.log(`🧹 Detected legacy rollup data (${rows} rows / ${dates} dates). Truncating.`);
        await pool.query('TRUNCATE gsc_snapshots RESTART IDENTITY');
      }
      await pool.query(`
        ALTER TABLE gsc_snapshots
        ADD CONSTRAINT gsc_snapshots_page_query_date_key
        UNIQUE (page_url, query, snapshot_date)
      `);
      console.log('✓ Added UNIQUE (page_url, query, snapshot_date)');
    }
  } catch (err) {
    console.error('Database init error:', err);
  }
}

// Initialize and start server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✓ Server running on port ${PORT}`);
    console.log(`✓ API available at http://localhost:${PORT}/api/`);
    console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Schedule daily GSC sync at 06:00 UTC. Each sync upserts the last 90 days,
  // so daily runs naturally pick up GSC's revisions to recent days.
  if (process.env.NODE_ENV === 'production') {
    cron.schedule('0 6 * * *', async () => {
      console.log('⏰ Scheduled GSC sync starting...');
      try {
        const count = await runSyncWithLog('cron');
        console.log(`✓ Scheduled sync done. Upserted ${count} rows.`);
      } catch (err) {
        console.error('❌ Scheduled sync failed:', err.message);
      }
    });
    console.log('✓ Daily GSC sync scheduled (06:00 UTC)');

    // Kick off an initial sync 30s after boot if the table is empty —
    // makes a fresh deploy populate without waiting for cron or a manual trigger.
    setTimeout(async () => {
      try {
        const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM gsc_snapshots');
        if (rows[0].n === 0) {
          console.log('📊 gsc_snapshots empty on boot — running initial sync');
          const count = await runSyncWithLog('boot');
          console.log(`✓ Initial sync done. Upserted ${count} rows.`);
        }
      } catch (err) {
        console.error('Initial sync check failed:', err.message);
      }
    }, 30_000);
  }
});

module.exports = { app, pool };
