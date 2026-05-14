/**
 * Initialize Database - Create tables and add test user
 * Run once at setup: node init-db.js
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initializeDB() {
  try {
    console.log('🔧 Initializing database...');

    // Create tables
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

    console.log('✓ Tables created');

    // Add test user
    const email = 'test@newwavecreative.io';
    const password = 'testpassword123';
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      await pool.query(
        'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)',
        [email, hashedPassword, 'Test User']
      );
      console.log(`✓ Test user created: ${email} / ${password}`);
    } catch (err) {
      if (err.code === '23505') {
        console.log(`✓ Test user already exists: ${email}`);
      } else {
        throw err;
      }
    }

    console.log('\n✅ Database initialized successfully!');
    console.log('\nYou can now login with:');
    console.log(`  Email: ${email}`);
    console.log(`  Password: ${password}`);
    console.log('\nChange this password after first login!');

    await pool.end();
  } catch (err) {
    console.error('❌ Initialization failed:', err);
    process.exit(1);
  }
}

initializeDB();
