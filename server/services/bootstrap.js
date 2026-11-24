const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { INSTRUCTORS } = require('./instructor-directory');

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

  const [[column]] = await pool.query(
    `SELECT COUNT(*) AS found
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='courses' AND COLUMN_NAME='instructor_name'`
  );
  if (!column.found) await pool.query('ALTER TABLE courses ADD COLUMN instructor_name VARCHAR(150) NULL AFTER faculty_id');

  for (const instructor of INSTRUCTORS) {
    await pool.query(
      "UPDATE courses SET instructor_name=? WHERE LOWER(name)=LOWER(?) AND (instructor_name IS NULL OR instructor_name='')",
      [instructor.name, instructor.course]
    );
  }
}

// Creates the admin account from the environment variables if it does not exist yet.
async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@gmail.com').toLowerCase();
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