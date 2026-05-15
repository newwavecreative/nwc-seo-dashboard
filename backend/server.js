const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
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
    const result = await pool.query(`
      SELECT 
        COUNT(DISTINCT query) as total_queries,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        ROUND(AVG(position)::numeric, 1) as avg_position,
        MAX(snapshot_date) as latest_date
      FROM gsc_snapshots
      WHERE snapshot_date >= CURRENT_DATE - INTERVAL '7 days'
    `);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/seo/top-keywords', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        query,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        ROUND((SUM(clicks)::float / NULLIF(SUM(impressions), 0) * 100)::numeric, 2) as ctr,
        ROUND(AVG(position)::numeric, 1) as avg_position
      FROM gsc_snapshots
      WHERE snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
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
      SELECT 
        page_url,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        ROUND((SUM(clicks)::float / NULLIF(SUM(impressions), 0) * 100)::numeric, 2) as ctr,
        ROUND(AVG(position)::numeric, 1) as avg_position
      FROM gsc_snapshots
      WHERE snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY page_url
      ORDER BY total_impressions DESC
      LIMIT 15
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Manual GSC sync trigger (authenticated)
app.post('/api/sync/gsc', authenticateToken, async (req, res) => {
  try {
    console.log('📊 Manual GSC sync triggered by', req.user.email);
    const result = await syncGSCData();
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
    `);
    console.log('✓ Database tables initialized');
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
});

module.exports = { app, pool };
