const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const { loadContext, loadEntries } = require('../services/data');
const S = require('../services/scheduler');

// Everything here is admin-only (Admin Mode)
router.use(auth('admin'));

router.get('/stats', async (req, res) => {
  const [[u]] = await pool.query("SELECT COUNT(*) total, SUM(role='student') students, SUM(role='faculty') faculty, SUM(role='admin') admins FROM users");
  const [[r]] = await pool.query('SELECT COUNT(*) total, SUM(is_available) available FROM rooms');
  const [[c]] = await pool.query('SELECT COUNT(*) total FROM courses');
  const [st] = await pool.query('SELECT status, COUNT(*) n FROM schedules GROUP BY status');
  const status = { draft: 0, pending: 0, approved: 0, rejected: 0 };
  st.forEach(x => { status[x.status] = x.n; });
  const ctx = await loadContext();
  const all = await loadEntries("WHERE s.status<>'rejected'");
  const conflicts = S.detect(all, ctx).filter(x => x.severity === 'high').length;
  const [recent] = await pool.query('SELECT id,name,email,role,created_at FROM users ORDER BY id DESC LIMIT 5');
  res.json({
    users: { total: +u.total, students: +u.students || 0, faculty: +u.faculty || 0, admins: +u.admins || 0 },
    rooms: { total: +r.total, available: +r.available || 0 }, courses: +c.total, schedules: status, conflicts, recent
  });
});

router.get('/users', async (req, res) => {
  const q = `%${req.query.q || ''}%`;
  const [rows] = await pool.query(
    'SELECT id,name,email,role,department,school_id,is_active,created_at FROM users WHERE name LIKE ? OR email LIKE ? ORDER BY role, name', [q, q]);
  res.json(rows.map(r => ({ ...r, is_active: !!r.is_active })));
});

router.post('/users', async (req, res) => {
  const { name, email, password, role, department } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  if (!['student', 'faculty', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  try {
    const [r] = await pool.query('INSERT INTO users(name,email,password_hash,role,department) VALUES(?,?,?,?,?)',
      [name.trim(), email.toLowerCase(), await bcrypt.hash(password, 10), role, department || null]);
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That email is already registered' });
    throw e;
  }
});

router.put('/users/:id', async (req, res) => {
  const id = +req.params.id;
  const { role, is_active, name, department, password } = req.body;
  if (id === req.user.id && ((role && role !== 'admin') || is_active === false))
    return res.status(400).json({ error: 'You cannot demote or deactivate your own admin account' });
  if (role && !['student', 'faculty', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (role) await pool.query('UPDATE users SET role=? WHERE id=?', [role, id]);
  if (is_active !== undefined) await pool.query('UPDATE users SET is_active=? WHERE id=?', [is_active ? 1 : 0, id]);
  if (name) await pool.query('UPDATE users SET name=? WHERE id=?', [name.trim(), id]);
  if (department !== undefined) await pool.query('UPDATE users SET department=? WHERE id=?', [department || null, id]);
  if (password) {
    if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    await pool.query('UPDATE users SET password_hash=? WHERE id=?', [await bcrypt.hash(password, 10), id]);
  }
  res.json({ ok: true });
});

router.delete('/users/:id', async (req, res) => {
  if (+req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
  await pool.query('DELETE FROM users WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;

router.put('/users/:id', async (req, res) => {
  const id = req.params.id;
  const { password } = req.body;

  if (password) {
    if (String(password).length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters'
      });
    }

    const passwordHash = await bcrypt.hash(
      String(password),
      10
    );

    await pool.query(
      'UPDATE users SET password_hash=? WHERE id=?',
      [passwordHash, id]
    );
  }

  res.json({
    message: 'User updated successfully'
  });
});