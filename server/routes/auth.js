const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const pool = require('../config/db');
const { auth } = require('../middleware/auth');

const sign = u => jwt.sign(
  { id: u.id, role: u.role, name: u.name },
  process.env.JWT_SECRET,
  { expiresIn: '8h' }
);

const pub = u => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  department: u.department,
  school_id: u.school_id
});

const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// Email transporter
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// --------------------------------------------------
// REGISTER
// --------------------------------------------------
router.post('/register', async (req, res) => {
  const {
    name,
    email,
    password,
    role,
    department,
    school_id
  } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({
      error: 'Name, email and password are required'
    });
  }

  if (!emailOk(email)) {
    return res.status(400).json({
      error: 'Enter a valid email address'
    });
  }

  if (!['student', 'faculty'].includes(role)) {
    return res.status(400).json({
      error: 'Choose Student or Faculty/Staff'
    });
  }

  if (String(password).length < 8) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters'
    });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const [dup] = await pool.query(
    'SELECT id FROM users WHERE email=?',
    [normalizedEmail]
  );

  if (dup.length) {
    return res.status(409).json({
      error: 'That email is already registered'
    });
  }

  const hash = await bcrypt.hash(password, 10);

  const [r] = await pool.query(
    `INSERT INTO users
      (name,email,password_hash,role,department,school_id)
     VALUES(?,?,?,?,?,?)`,
    [
      name.trim(),
      normalizedEmail,
      hash,
      role,
      department || null,
      school_id || null
    ]
  );

  const user = {
    id: r.insertId,
    name: name.trim(),
    email: normalizedEmail,
    role,
    department,
    school_id
  };

  res.status(201).json({
    token: sign(user),
    user: pub(user)
  });
});

// --------------------------------------------------
// FORGOT PASSWORD
// --------------------------------------------------
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email || !emailOk(String(email))) {
    return res.status(400).json({
      error: 'Please enter a valid email address.'
    });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  // Generic response to prevent email/account enumeration
  const genericMessage =
    'If that email is registered, a password reset link has been sent.';

  const [users] = await pool.query(
    `SELECT id, name, email
       FROM users
      WHERE email=? AND is_active=1
      LIMIT 1`,
    [normalizedEmail]
  );

  // Do not reveal whether the email exists
  if (!users.length) {
    return res.json({ message: genericMessage });
  }

  const user = users[0];

  // Generate secure random token
  const token = crypto.randomBytes(32).toString('hex');

  // Store only the SHA-256 hash of the token
  const tokenHash = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  // Token expires after 30 minutes
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  // Invalidate previous unused reset tokens
  await pool.query(
    `UPDATE password_resets
        SET used_at=NOW()
      WHERE user_id=? AND used_at IS NULL`,
    [user.id]
  );

  // Store new token
  await pool.query(
    `INSERT INTO password_resets
      (user_id, token_hash, expires_at)
     VALUES (?, ?, ?)`,
    [user.id, tokenHash, expiresAt]
  );

  // Frontend URL
  const frontendUrl =
    process.env.FRONTEND_URL || 'http://localhost:3000';

  const resetLink =
    `${frontendUrl}/pages/reset-password.html?token=${token}`;

  try {
    await mailer.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: user.email,
      subject: 'Scheduliq Password Reset',

      text: `
Hello ${user.name},

You requested to reset your Scheduliq password.

Use the following link to reset your password:

${resetLink}

This link expires in 30 minutes.

If you did not request this password reset, you may ignore this email.
      `,

      html: `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
  <h2>Scheduliq Password Reset</h2>

  <p>Hello ${user.name},</p>

  <p>You requested to reset your Scheduliq account password.</p>

  <p>
    Click the button below to create a new password:
  </p>

  <p style="margin:30px 0">
    <a href="${resetLink}"
       style="
         background:#2563eb;
         color:#ffffff;
         padding:14px 22px;
         text-decoration:none;
         border-radius:6px;
         display:inline-block;
       ">
      Reset My Password
    </a>
  </p>

  <p>
    If the button does not work, copy and paste this link into your browser:
  </p>

  <p>${resetLink}</p>

  <p>
    <strong>This link expires in 30 minutes.</strong>
  </p>

  <p>
    If you did not request this reset, you can safely ignore this email.
  </p>
</div>
      `
    });
  } catch (error) {
    console.error('Password reset email error:', error.message);

    // Do not reveal whether the account exists
    return res.json({ message: genericMessage });
  }

  res.json({ message: genericMessage });
});

// --------------------------------------------------
// RESET PASSWORD
// --------------------------------------------------
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({
      error: 'Token and new password are required.'
    });
  }

  if (String(password).length < 8) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters.'
    });
  }

  // Hash received token
  const tokenHash = crypto
    .createHash('sha256')
    .update(String(token))
    .digest('hex');

  // Find valid, unused, unexpired token
  const [rows] = await pool.query(
    `SELECT id, user_id
       FROM password_resets
      WHERE token_hash=?
        AND used_at IS NULL
        AND expires_at > NOW()
      LIMIT 1`,
    [tokenHash]
  );

  if (!rows.length) {
    return res.status(400).json({
      error: 'This password reset link is invalid or expired.'
    });
  }

  const reset = rows[0];

  // Hash new password
  const passwordHash = await bcrypt.hash(password, 10);

  // Update password
  await pool.query(
    `UPDATE users
        SET password_hash=?
      WHERE id=?`,
    [passwordHash, reset.user_id]
  );

  // Mark token as used
  await pool.query(
    `UPDATE password_resets
        SET used_at=NOW()
      WHERE id=?`,
    [reset.id]
  );

  // Invalidate all other reset links for this user
  await pool.query(
    `UPDATE password_resets
        SET used_at=NOW()
      WHERE user_id=? AND used_at IS NULL`,
    [reset.user_id]
  );

  res.json({
    message: 'Your password has been reset successfully.'
  });
});

// --------------------------------------------------
// LOGIN
// --------------------------------------------------
router.post('/login', async (req, res) => {
  const { email, password, mode } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: 'Enter your email and password'
    });
  }

  const [rows] = await pool.query(
    'SELECT * FROM users WHERE email=?',
    [String(email).toLowerCase()]
  );

  const u = rows[0];

  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    return res.status(401).json({
      error: 'Incorrect email or password'
    });
  }

  if (!u.is_active) {
    return res.status(403).json({
      error: 'This account has been deactivated. Contact the admin.'
    });
  }

  if (mode && mode !== u.role) {
    const names = {
      student: 'Student',
      faculty: 'Faculty/Staff',
      admin: 'Admin'
    };

    return res.status(403).json({
      error: `This is a ${names[u.role]} account. Switch to ${names[u.role]} mode to sign in.`
    });
  }

  res.json({
    token: sign(u),
    user: pub(u)
  });
});

// --------------------------------------------------
// CURRENT USER
// --------------------------------------------------
router.get('/me', auth(), async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE id=? AND is_active=1',
    [req.user.id]
  );

  if (!rows[0]) {
    return res.status(401).json({
      error: 'Account not found'
    });
  }

  res.json(pub(rows[0]));
});

// --------------------------------------------------
// UPDATE PROFILE
// --------------------------------------------------
router.put('/profile', auth(), async (req, res) => {
  const { name, department, password } = req.body;

  if (name) {
    await pool.query(
      'UPDATE users SET name=? WHERE id=?',
      [name.trim(), req.user.id]
    );
  }

  if (department !== undefined) {
    await pool.query(
      'UPDATE users SET department=? WHERE id=?',
      [department || null, req.user.id]
    );
  }

  if (password) {
    if (String(password).length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters'
      });
    }

    await pool.query(
      'UPDATE users SET password_hash=? WHERE id=?',
      [await bcrypt.hash(password, 10), req.user.id]
    );
  }

  const [rows] = await pool.query(
    'SELECT * FROM users WHERE id=?',
    [req.user.id]
  );

  res.json(pub(rows[0]));
});

module.exports = router;