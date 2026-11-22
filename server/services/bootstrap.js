const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// Creates the admin account from .env if it does not exist yet.
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

module.exports = { ensureAdmin };
