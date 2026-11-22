const router = require('express').Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hh = t => String(t).slice(0, 5);

router.get('/', auth(), async (req, res) => {
  const [rows] = await pool.query(
    "SELECT * FROM personal_events WHERE user_id=? ORDER BY FIELD(day,'Mon','Tue','Wed','Thu','Fri','Sat'), start_time", [req.user.id]);
  res.json(rows.map(r => ({ ...r, start_time: hh(r.start_time), end_time: hh(r.end_time) })));
});

// Accepts { events: [...] } (e.g. from a scanned timetable) or a single event
router.post('/', auth(), async (req, res) => {
  const list = Array.isArray(req.body.events) ? req.body.events : [req.body];
  const clean = [];
  for (const e of list) {
    const title = String(e.title || '').trim();
    if (!title || !DAYS.includes(e.day) || !/^\d{2}:\d{2}$/.test(e.start_time || '') || !/^\d{2}:\d{2}$/.test(e.end_time || '') || e.start_time >= e.end_time)
      return res.status(400).json({ error: `Invalid event: "${title || 'untitled'}". Check the title, day and times.` });
    clean.push([req.user.id, title.slice(0, 150), e.day, e.start_time, e.end_time, e.location ? String(e.location).slice(0, 120) : null, e.source === 'scan' ? 'scan' : 'manual']);
  }
  if (!clean.length) return res.status(400).json({ error: 'No events to save' });
  await pool.query('INSERT INTO personal_events(user_id,title,day,start_time,end_time,location,source) VALUES ?', [clean]);
  res.status(201).json({ saved: clean.length });
});

router.delete('/:id', auth(), async (req, res) => {
  await pool.query('DELETE FROM personal_events WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
