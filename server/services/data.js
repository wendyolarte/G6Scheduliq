const pool = require('../config/db');

const hhmm = t => String(t).slice(0, 5);

// Loads courses, rooms, equipment and enrollments into Maps/Sets used by the scheduler engine
async function loadContext() {
  const [courses] = await pool.query(
    "SELECT c.*, COALESCE(NULLIF(c.instructor_name,''), u.name) AS faculty_name FROM courses c LEFT JOIN users u ON u.id=c.faculty_id"
  );
  const [ce] = await pool.query('SELECT course_id, equipment_id FROM course_equipment');
  const [rooms] = await pool.query('SELECT * FROM rooms');
  const [re] = await pool.query('SELECT room_id, equipment_id FROM room_equipment');
  const [en] = await pool.query('SELECT student_id, course_id FROM enrollments');
  const [equipment] = await pool.query('SELECT * FROM equipment ORDER BY name');

  const cmap = new Map(courses.map(c => [c.id, { ...c, equip: new Set(), students: new Set() }]));
  const rmap = new Map(rooms.map(r => [r.id, { ...r, is_available: !!r.is_available, equip: new Set() }]));
  ce.forEach(x => cmap.get(x.course_id)?.equip.add(x.equipment_id));
  re.forEach(x => rmap.get(x.room_id)?.equip.add(x.equipment_id));
  en.forEach(x => cmap.get(x.course_id)?.students.add(x.student_id));

  return {
    courses: cmap,
    rooms: rmap,
    equipment,
    equipNames: new Map(equipment.map(e => [e.id, e.name]))
  };
}

// where = SQL starting with WHERE using aliases s (schedules), c (courses), r (rooms)
async function loadEntries(where = '', params = []) {
  const [rows] = await pool.query(
    `SELECT s.*, c.code, c.name AS course_name, c.faculty_id, c.instructor_name, c.zoom_link, c.classroom_link,
            r.name AS room_name, COALESCE(NULLIF(c.instructor_name,''), u.name) AS faculty_name
       FROM schedules s
       JOIN courses c ON c.id = s.course_id
       JOIN rooms r ON r.id = s.room_id
       LEFT JOIN users u ON u.id = c.faculty_id
       ${where}
      ORDER BY FIELD(s.day,'Mon','Tue','Wed','Thu','Fri','Sat'), s.start_time`,
    params
  );
  return rows.map(r => ({ ...r, start_time: hhmm(r.start_time), end_time: hhmm(r.end_time) }));
}

// What each role is allowed to see:
//  student -> approved sessions of enrolled courses
//  faculty -> sessions of their own courses (any status)
//  admin   -> everything
//  scope=campus -> approved sessions for everybody (admin sees all statuses)
async function entriesForUser(user, q = {}) {
  const where = [], params = [];
  if (q.scope === 'campus') {
    if (user.role !== 'admin') where.push("s.status='approved'");
  } else if (user.role === 'student') {
    where.push("s.status='approved'");
    where.push('s.course_id IN (SELECT course_id FROM enrollments WHERE student_id=?)');
    params.push(user.id);
  } else if (user.role === 'faculty') {
    where.push('c.faculty_id=?');
    params.push(user.id);
  }
  if (q.status) { where.push('s.status=?'); params.push(q.status); }
  if (q.day) { where.push('s.day=?'); params.push(q.day); }
  if (q.room_id) { where.push('s.room_id=?'); params.push(+q.room_id); }
  if (q.course_id) { where.push('s.course_id=?'); params.push(+q.course_id); }
  return loadEntries(where.length ? 'WHERE ' + where.join(' AND ') : '', params);
}

module.exports = { loadContext, loadEntries, entriesForUser, hhmm };
