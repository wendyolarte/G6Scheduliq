const router = require('express').Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');

const isLink = v => !v || /^https?:\/\/\S+$/i.test(v);

async function withEquipment(courses) {
  const [ce] = await pool.query('SELECT ce.course_id, e.id, e.name FROM course_equipment ce JOIN equipment e ON e.id=ce.equipment_id');
  return courses.map(c => ({ ...c, is_enrolled: !!c.is_enrolled, equipment: ce.filter(x => x.course_id === c.id).map(x => ({ id: x.id, name: x.name })) }));
}

async function canEdit(user, courseId) {
  const [[c]] = await pool.query('SELECT faculty_id FROM courses WHERE id=?', [courseId]);
  if (!c) return { ok: false, status: 404, error: 'Course not found' };
  if (user.role === 'admin' || c.faculty_id === user.id) return { ok: true };
  return { ok: false, status: 403, error: 'You can only change your own courses' };
}

async function setEquipment(courseId, ids) {
  await pool.query('DELETE FROM course_equipment WHERE course_id=?', [courseId]);
  for (const id of ids || []) await pool.query('INSERT IGNORE INTO course_equipment(course_id,equipment_id) VALUES(?,?)', [courseId, +id]);
}

function clean(b) {
  const out = {
    code: String(b.code || '').trim().toUpperCase(),
    name: String(b.name || '').trim(),
    units: +b.units || 3,
    expected_students: +b.expected_students || 0,
    sessions_per_week: +b.sessions_per_week || 1,
    duration_min: +b.duration_min || 90
  };
  if (!out.code || !out.name) return { error: 'Course code and name are required' };
  if (out.expected_students < 1) return { error: 'Expected students must be at least 1' };
  if (out.sessions_per_week < 1 || out.sessions_per_week > 6) return { error: 'Sessions per week must be 1 to 6' };
  if (out.duration_min < 30 || out.duration_min > 300) return { error: 'Duration must be 30 to 300 minutes' };
  return { value: out };
}

router.get('/', auth(), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT c.*, u.name AS faculty_name,
            (SELECT COUNT(*) FROM enrollments e WHERE e.course_id=c.id) AS enrolled_count,
            (SELECT COUNT(*) FROM enrollments e WHERE e.course_id=c.id AND e.student_id=?) AS is_enrolled
       FROM courses c LEFT JOIN users u ON u.id=c.faculty_id ORDER BY c.code`, [req.user.id]);
  res.json(await withEquipment(rows));
});

router.get('/faculty', auth('faculty', 'admin'), async (req, res) => {
  const [rows] = await pool.query("SELECT id,name,department FROM users WHERE role='faculty' AND is_active=1 ORDER BY name");
  res.json(rows);
});

router.post('/', auth('faculty', 'admin'), async (req, res) => {
  const { value, error } = clean(req.body);
  if (error) return res.status(400).json({ error });
  const facultyId = req.user.role === 'faculty' ? req.user.id : (req.body.faculty_id ? +req.body.faculty_id : null);
  try {
    const [r] = await pool.query(
      'INSERT INTO courses(code,name,faculty_id,units,expected_students,sessions_per_week,duration_min) VALUES(?,?,?,?,?,?,?)',
      [value.code, value.name, facultyId, value.units, value.expected_students, value.sessions_per_week, value.duration_min]);
    await setEquipment(r.insertId, req.body.equipment);
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That course code already exists' });
    throw e;
  }
});

router.put('/:id', auth('faculty', 'admin'), async (req, res) => {
  const p = await canEdit(req.user, req.params.id);
  if (!p.ok) return res.status(p.status).json({ error: p.error });
  const { value, error } = clean(req.body);
  if (error) return res.status(400).json({ error });
  const facultyClause = req.user.role === 'admin' ? ', faculty_id=?' : '';
  const params = [value.code, value.name, value.units, value.expected_students, value.sessions_per_week, value.duration_min];
  if (req.user.role === 'admin') params.push(req.body.faculty_id ? +req.body.faculty_id : null);
  params.push(req.params.id);
  try {
    await pool.query(`UPDATE courses SET code=?,name=?,units=?,expected_students=?,sessions_per_week=?,duration_min=?${facultyClause} WHERE id=?`, params);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That course code already exists' });
    throw e;
  }
  await setEquipment(req.params.id, req.body.equipment);
  res.json({ ok: true });
});

router.put('/:id/links', auth('faculty', 'admin'), async (req, res) => {
  const p = await canEdit(req.user, req.params.id);
  if (!p.ok) return res.status(p.status).json({ error: p.error });
  const { zoom_link, classroom_link } = req.body;
  if (!isLink(zoom_link) || !isLink(classroom_link)) return res.status(400).json({ error: 'Links must start with http:// or https://' });
  await pool.query('UPDATE courses SET zoom_link=?, classroom_link=? WHERE id=?', [zoom_link || null, classroom_link || null, req.params.id]);
  res.json({ ok: true });
});

router.delete('/:id', auth('faculty', 'admin'), async (req, res) => {
  const p = await canEdit(req.user, req.params.id);
  if (!p.ok) return res.status(p.status).json({ error: p.error });
  await pool.query('DELETE FROM courses WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

router.post('/:id/enroll', auth('student'), async (req, res) => {
  const [[c]] = await pool.query('SELECT id FROM courses WHERE id=?', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Course not found' });
  await pool.query('INSERT IGNORE INTO enrollments(student_id,course_id) VALUES(?,?)', [req.user.id, req.params.id]);
  res.json({ ok: true });
});

router.delete('/:id/enroll', auth('student'), async (req, res) => {
  await pool.query('DELETE FROM enrollments WHERE student_id=? AND course_id=?', [req.user.id, req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
