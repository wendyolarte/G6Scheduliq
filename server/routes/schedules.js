const router = require('express').Router();
const crypto = require('crypto');
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const { loadContext, loadEntries, entriesForUser } = require('../services/data');
const S = require('../services/scheduler');

const timeOk = t => /^\d{2}:\d{2}$/.test(t || '');

function validate(b) {
  if (!b.course_id || !b.room_id) return 'Choose a course and a room';
  if (!S.DAYS.includes(b.day)) return 'Choose a valid day (Mon–Sat)';
  if (!timeOk(b.start_time) || !timeOk(b.end_time)) return 'Enter valid start and end times';
  if (b.start_time >= b.end_time) return 'End time must be after the start time';
  return null;
}

// Checks one proposed entry against every active schedule in the system
async function candidateConflicts(b, ignoreId) {
  const ctx = await loadContext();
  const all = await loadEntries("WHERE s.status<>'rejected'");
  const cand = { id: -1, course_id: +b.course_id, room_id: +b.room_id, day: b.day, start_time: b.start_time, end_time: b.end_time };
  const list = all.filter(e => e.id !== ignoreId).concat(cand);
  return S.detect(list, ctx).filter(c => c.entryIds.includes(-1));
}

async function ownsCourse(user, courseId) {
  if (user.role === 'admin') return true;
  const [[c]] = await pool.query('SELECT faculty_id FROM courses WHERE id=?', [courseId]);
  return !!c && c.faculty_id === user.id;
}

/* ---- View ---- */
router.get('/', auth(), async (req, res) => {
  res.json(await entriesForUser(req.user, req.query));
});

/* ---- Conflict detection (+ alternative suggestions) ---- */
router.get('/conflicts', auth('faculty', 'admin'), async (req, res) => {
  const ctx = await loadContext();
  const all = await loadEntries("WHERE s.status<>'rejected'");
  const byId = new Map(all.map(e => [e.id, e]));
  let conflicts = S.detect(all, ctx);
  if (req.user.role === 'faculty') conflicts = conflicts.filter(c => c.entryIds.some(id => byId.get(id)?.faculty_id === req.user.id));
  const out = conflicts.map((c, i) => {
    const entries = c.entryIds.map(id => byId.get(id)).filter(Boolean);
    const target = (req.user.role === 'faculty' ? entries.find(e => e.faculty_id === req.user.id) : entries[entries.length - 1]) || entries[0];
    return { ...c, entries, target_id: target?.id, suggestions: target && i < 40 ? S.suggest(ctx, all, target, 3) : [] };
  });
  res.json(out);
});

router.post('/conflicts/check', auth('faculty', 'admin'), async (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });
  res.json(await candidateConflicts(req.body, req.body.id ? +req.body.id : undefined));
});

/* ---- Create / edit / delete ---- */
router.post('/', auth('faculty', 'admin'), async (req, res) => {
  const b = req.body;
  const err = validate(b);
  if (err) return res.status(400).json({ error: err });
  if (!(await ownsCourse(req.user, b.course_id))) return res.status(403).json({ error: 'You can only schedule your own courses' });
  const conflicts = await candidateConflicts(b);
  if (conflicts.some(c => c.severity === 'high')) return res.status(409).json({ error: 'Schedule conflict detected', conflicts });
  const admin = req.user.role === 'admin';
  const status = admin ? 'approved' : 'draft';
  const [r] = await pool.query(
    'INSERT INTO schedules(course_id,room_id,day,start_time,end_time,status,created_by,reviewed_by) VALUES(?,?,?,?,?,?,?,?)',
    [b.course_id, b.room_id, b.day, b.start_time, b.end_time, status, req.user.id, admin ? req.user.id : null]);
  res.status(201).json({ id: r.insertId, status, warnings: conflicts });
});

router.put('/:id', auth('faculty', 'admin'), async (req, res) => {
  const id = +req.params.id;
  const [[row]] = await pool.query('SELECT * FROM schedules WHERE id=?', [id]);
  if (!row) return res.status(404).json({ error: 'Session not found' });
  const admin = req.user.role === 'admin';
  if (!admin) {
    if (!(await ownsCourse(req.user, row.course_id))) return res.status(403).json({ error: 'You can only edit your own sessions' });
    if (!['draft', 'rejected'].includes(row.status)) return res.status(403).json({ error: 'Only draft or rejected sessions can be edited' });
  }
  const b = {
    course_id: row.course_id, room_id: req.body.room_id ?? row.room_id, day: req.body.day ?? row.day,
    start_time: (req.body.start_time ?? String(row.start_time)).slice(0, 5), end_time: (req.body.end_time ?? String(row.end_time)).slice(0, 5)
  };
  const err = validate(b);
  if (err) return res.status(400).json({ error: err });
  const conflicts = await candidateConflicts(b, id);
  if (conflicts.some(c => c.severity === 'high')) return res.status(409).json({ error: 'Schedule conflict detected', conflicts });
  const status = admin ? row.status : 'draft';
  await pool.query('UPDATE schedules SET room_id=?,day=?,start_time=?,end_time=?,status=?,review_note=NULL WHERE id=?',
    [b.room_id, b.day, b.start_time, b.end_time, status, id]);
  res.json({ ok: true, status, warnings: conflicts });
});

router.delete('/:id', auth('faculty', 'admin'), async (req, res) => {
  const [[row]] = await pool.query('SELECT * FROM schedules WHERE id=?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Session not found' });
  if (req.user.role !== 'admin') {
    if (!(await ownsCourse(req.user, row.course_id))) return res.status(403).json({ error: 'You can only delete your own sessions' });
    if (!['draft', 'rejected'].includes(row.status)) return res.status(403).json({ error: 'Only draft or rejected sessions can be deleted' });
  }
  await pool.query('DELETE FROM schedules WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

/* ---- Automatic generation with constraint optimisation ---- */
router.post('/generate', auth('faculty', 'admin'), async (req, res) => {
  const b = req.body || {};
  const ctx = await loadContext();
  let ids = Array.isArray(b.courseIds) ? b.courseIds.map(Number) : [];
  if (req.user.role === 'faculty') {
    const own = [...ctx.courses.values()].filter(c => c.faculty_id === req.user.id).map(c => c.id);
    ids = ids.length ? ids.filter(x => own.includes(x)) : own;
  }
  if (!ids.length) return res.status(400).json({ error: 'Select at least one course to schedule' });
  const days = (Array.isArray(b.days) ? b.days : []).filter(d => S.DAYS.includes(d));
  const opts = {
    courseIds: ids,
    days: days.length ? days : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    dayStart: timeOk(b.dayStart) ? b.dayStart : '07:30',
    dayEnd: timeOk(b.dayEnd) ? b.dayEnd : '19:00',
    step: [15, 30, 60].includes(+b.step) ? +b.step : 30,
    avoidLunch: b.avoidLunch !== false,
    preferMorning: !!b.preferMorning,
    iterations: Math.max(1, Math.min(60, +b.iterations || 15))
  };
  if (opts.dayStart >= opts.dayEnd) return res.status(400).json({ error: 'Day end must be after day start' });
  // Existing sessions are fixed constraints; drafts of the selected courses get replaced
  const fixed = await loadEntries(
    "WHERE s.status IN ('approved','pending','draft') AND (s.course_id NOT IN (?) OR s.status IN ('approved','pending'))", [ids]);
  res.json(S.generate(ctx, fixed, opts));
});

router.post('/apply', auth('faculty', 'admin'), async (req, res) => {
  const list = Array.isArray(req.body.placements) ? req.body.placements : [];
  if (!list.length) return res.status(400).json({ error: 'Nothing to save' });
  for (const p of list) {
    const err = validate(p);
    if (err) return res.status(400).json({ error: err });
    if (!(await ownsCourse(req.user, p.course_id))) return res.status(403).json({ error: 'You can only schedule your own courses' });
  }
  const ctx = await loadContext();
  const courseSet = new Set(list.map(p => +p.course_id));
  const existing = (await loadEntries("WHERE s.status<>'rejected'")).filter(e => !(courseSet.has(e.course_id) && e.status === 'draft'));
  const cands = list.map((p, i) => ({ id: -(i + 1), course_id: +p.course_id, room_id: +p.room_id, day: p.day, start_time: p.start_time, end_time: p.end_time }));
  const conflicts = S.detect(existing.concat(cands), ctx).filter(c => c.entryIds.some(id => id < 0));
  if (conflicts.some(c => c.severity === 'high')) return res.status(409).json({ error: 'The chosen slots conflict with each other or with existing classes', conflicts });

  const admin = req.user.role === 'admin';
  const status = req.body.submit ? (admin ? 'approved' : 'pending') : 'draft';
  const batch = crypto.randomBytes(6).toString('hex');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM schedules WHERE course_id IN (?) AND status IN ('draft','rejected')", [[...courseSet]]);
    for (const p of cands) {
      await conn.query(
        'INSERT INTO schedules(course_id,room_id,day,start_time,end_time,status,batch_id,created_by,reviewed_by) VALUES(?,?,?,?,?,?,?,?,?)',
        [p.course_id, p.room_id, p.day, p.start_time, p.end_time, status, batch, req.user.id, status === 'approved' ? req.user.id : null]);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  res.status(201).json({ saved: cands.length, status, batch_id: batch });
});

/* ---- Review & approval workflow ---- */
router.post('/submit', auth('faculty', 'admin'), async (req, res) => {
  const ids = (req.body.ids || []).map(Number).filter(Boolean);
  if (!ids.length) return res.status(400).json({ error: 'Select sessions to submit' });
  const mine = await loadEntries("WHERE s.id IN (?) AND s.status IN ('draft','rejected')", [ids]);
  const allowed = req.user.role === 'admin' ? mine : mine.filter(e => e.faculty_id === req.user.id);
  if (!allowed.length) return res.status(400).json({ error: 'No draft or rejected sessions to submit' });
  const ctx = await loadContext();
  const all = await loadEntries("WHERE s.status<>'rejected'");
  const sel = new Set(allowed.map(e => e.id));
  const bad = S.detect(all, ctx).filter(c => c.severity === 'high' && c.entryIds.some(id => sel.has(id)));
  if (bad.length) return res.status(409).json({ error: 'Resolve these conflicts before submitting', conflicts: bad });
  await pool.query("UPDATE schedules SET status='pending', review_note=NULL WHERE id IN (?)", [[...sel]]);
  res.json({ submitted: sel.size });
});

router.post('/review', auth('admin'), async (req, res) => {
  const ids = (req.body.ids || []).map(Number).filter(Boolean);
  const { action, note } = req.body;
  if (!ids.length || !['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Choose sessions and an action' });
  const chosen = await loadEntries("WHERE s.id IN (?) AND s.status='pending'", [ids]);
  if (!chosen.length) return res.status(400).json({ error: 'No pending sessions selected' });
  const sel = chosen.map(e => e.id);
  if (action === 'approve') {
    const ctx = await loadContext();
    const approved = await loadEntries("WHERE s.status='approved'");
    const bad = S.detect(approved.concat(chosen), ctx).filter(c => c.severity === 'high' && c.entryIds.some(id => sel.includes(id)));
    if (bad.length) return res.status(409).json({ error: 'Cannot approve: conflicts found', conflicts: bad });
  }
  await pool.query('UPDATE schedules SET status=?, reviewed_by=?, review_note=? WHERE id IN (?)',
    [action === 'approve' ? 'approved' : 'rejected', req.user.id, note ? String(note).slice(0, 255) : null, sel]);
  res.json({ updated: sel.length });
});

module.exports = router;
