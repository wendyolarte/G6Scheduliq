const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

const sign = u => jwt.sign({ id: u.id, role: u.role, name: u.name }, process.env.JWT_SECRET, { expiresIn: '8h' });
const pub = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, department: u.department, school_id: u.school_id });
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// Sign up (students and faculty/staff only - admins can never self-register)
router.post('/register', async (req, res) => {
  const { name, email, password, role, department, school_id } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  if (!emailOk(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (!['student', 'faculty'].includes(role)) return res.status(400).json({ error: 'Choose Student or Faculty/Staff' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const [dup] = await pool.query('SELECT id FROM users WHERE email=?', [email.toLowerCase()]);
  if (dup.length) return res.status(409).json({ error: 'That email is already registered' });
  const hash = await bcrypt.hash(password, 10);
  const [r] = await pool.query(
    'INSERT INTO users(name,email,password_hash,role,department,school_id) VALUES(?,?,?,?,?,?)',
    [name.trim(), email.toLowerCase(), hash, role, department || null, school_id || null]
  );
  const user = { id: r.insertId, name: name.trim(), email: email.toLowerCase(), role, department, school_id };
  res.status(201).json({ token: sign(user), user: pub(user) });
});

// Log in. "mode" is the tab chosen on the login page; it must match the account type.
router.post('/login', async (req, res) => {
  const { email, password, mode } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Enter your email and password' });
  const [rows] = await pool.query('SELECT * FROM users WHERE email=?', [String(email).toLowerCase()]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) return res.status(401).json({ error: 'Incorrect email or password' });
  if (!u.is_active) return res.status(403).json({ error: 'This account has been deactivated. Contact the admin.' });
  if (mode && mode !== u.role) {
    const names = { student: 'Student', faculty: 'Faculty/Staff', admin: 'Admin' };
    return res.status(403).json({ error: `This is a ${names[u.role]} account. Switch to ${names[u.role]} mode to sign in.` });
  }
  res.json({ token: sign(u), user: pub(u) });
});

router.get('/me', auth(), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE id=? AND is_active=1', [req.user.id]);
  if (!rows[0]) return res.status(401).json({ error: 'Account not found' });
  res.json(pub(rows[0]));
});

router.put('/profile', auth(), async (req, res) => {
  const { name, department, password } = req.body;
  if (name) await pool.query('UPDATE users SET name=? WHERE id=?', [name.trim(), req.user.id]);
  if (department !== undefined) await pool.query('UPDATE users SET department=? WHERE id=?', [department || null, req.user.id]);
  if (password) {
    if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    await pool.query('UPDATE users SET password_hash=? WHERE id=?', [await bcrypt.hash(password, 10), req.user.id]);
  }
  const [rows] = await pool.query('SELECT * FROM users WHERE id=?', [req.user.id]);
  res.json(pub(rows[0]));
});

module.exports = router;
