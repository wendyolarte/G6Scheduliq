const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// Creates any missing tables from database/schema.sql (safe to run on every start).
async function ensureSchema() {
  const raw = fs.readFileSync(path.join(__dirname, '../../database/schema.sql'), 'utf8');
  const statements = raw
    .split('\n')
    .filter(l => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !/^(CREATE DATABASE|USE)\b/i.test(s));
  for (const sql of statements) await pool.query(sql);
}

// Creates the admin account from the environment variables if it does not exist yet.
async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@school.edu').toLowerCase();
  const [rows] = await pool.query('SELECT id FROM users WHERE email=?', [email]);
  if (rows.length) return;
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@12345', 10);
  await pool.query(
    "INSERT INTO users(name,email,password_hash,role,department) VALUES(?,?,?,'admin','Administration')",
    [process.env.ADMIN_NAME || 'System Admin', email, hash]
  );
  console.log(`Admin account created: ${email}`);
}

module.exports = { ensureSchema, ensureAdmin };