// Loads demo data: equipment, rooms, faculty, students, courses and enrolments.
// Safe to run more than once. Demo password for every demo user: Password123!
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { ensureAdmin } = require('../services/bootstrap');

const EQUIPMENT = ['Projector', 'Whiteboard', 'Computers', 'Air Conditioning', 'Sound System', 'Lab Equipment', 'Smart TV', 'Video Conferencing'];
const ROOMS = [
  ['R101', 'Main Building', 40, ['Projector', 'Whiteboard', 'Air Conditioning']],
  ['R102', 'Main Building', 40, ['Projector', 'Whiteboard']],
  ['R201', 'Main Building', 60, ['Projector', 'Whiteboard', 'Sound System', 'Air Conditioning']],
  ['R202', 'Main Building', 35, ['Whiteboard', 'Smart TV']],
  ['LAB1', 'Tech Building', 30, ['Computers', 'Projector', 'Air Conditioning']],
  ['LAB2', 'Tech Building', 30, ['Computers', 'Projector']],
  ['SCI1', 'Science Building', 28, ['Lab Equipment', 'Whiteboard']],
  ['AUD1', 'Main Building', 150, ['Projector', 'Sound System', 'Video Conferencing', 'Air Conditioning']],
  ['R301', 'Annex', 50, ['Projector', 'Whiteboard']],
  ['R302', 'Annex', 25, ['Whiteboard']]
];
const FACULTY = [
  ['Dr. Maria Santos', 'maria.santos@school.edu', 'Computer Science'],
  ['Prof. John Reyes', 'john.reyes@school.edu', 'Mathematics'],
  ['Dr. Ana Cruz', 'ana.cruz@school.edu', 'Sciences'],
  ['Engr. Luis Tan', 'luis.tan@school.edu', 'Information Technology']
];
const STUDENTS = ['Alex Rivera', 'Bianca Lim', 'Carlo Mendoza', 'Dana Flores', 'Ethan Go', 'Faith Bautista',
  'Gabriel Ong', 'Hannah Uy', 'Ian Castillo', 'Julia Navarro', 'Kevin Dizon', 'Lara Aquino'];
const COURSES = [
  ['CS101', 'Introduction to Programming', 0, 3, 35, 2, 90, ['Computers']],
  ['CS201', 'Data Structures', 0, 3, 30, 2, 90, ['Computers', 'Projector']],
  ['MATH101', 'College Algebra', 1, 3, 40, 2, 90, ['Whiteboard']],
  ['MATH201', 'Calculus I', 1, 3, 38, 2, 90, ['Whiteboard', 'Projector']],
  ['SCI110', 'General Chemistry', 2, 4, 26, 1, 180, ['Lab Equipment']],
  ['IT210', 'Networking Fundamentals', 3, 3, 28, 2, 90, ['Computers', 'Projector']],
  ['ENG101', 'Communication Skills', 2, 3, 45, 2, 90, ['Projector']],
  ['SEM100', 'Guest Lecture Series', 3, 1, 120, 1, 120, ['Sound System', 'Video Conferencing']]
];

(async () => {
  await ensureAdmin();
  const hash = await bcrypt.hash('Password123!', 10);
  const eqId = {};
  for (const n of EQUIPMENT) {
    await pool.query('INSERT IGNORE INTO equipment(name) VALUES(?)', [n]);
    eqId[n] = (await pool.query('SELECT id FROM equipment WHERE name=?', [n]))[0][0].id;
  }
  for (const [name, building, cap, eq] of ROOMS) {
    await pool.query('INSERT IGNORE INTO rooms(name,building,capacity) VALUES(?,?,?)', [name, building, cap]);
    const [[r]] = await pool.query('SELECT id FROM rooms WHERE name=?', [name]);
    for (const e of eq) await pool.query('INSERT IGNORE INTO room_equipment(room_id,equipment_id) VALUES(?,?)', [r.id, eqId[e]]);
  }
  const fac = [];
  for (const [name, email, dept] of FACULTY) {
    await pool.query("INSERT IGNORE INTO users(name,email,password_hash,role,department) VALUES(?,?,?,'faculty',?)", [name, email, hash, dept]);
    fac.push((await pool.query('SELECT id FROM users WHERE email=?', [email]))[0][0].id);
  }
  const stu = [];
  for (let i = 0; i < STUDENTS.length; i++) {
    const email = `student${i + 1}@school.edu`;
    await pool.query("INSERT IGNORE INTO users(name,email,password_hash,role,department,school_id) VALUES(?,?,?,'student','Computer Science',?)", [STUDENTS[i], email, hash, `2026-${String(1001 + i)}`]);
    stu.push((await pool.query('SELECT id FROM users WHERE email=?', [email]))[0][0].id);
  }
  const cid = [];
  for (const [code, name, f, units, exp, spw, dur, eq] of COURSES) {
    await pool.query('INSERT IGNORE INTO courses(code,name,faculty_id,units,expected_students,sessions_per_week,duration_min) VALUES(?,?,?,?,?,?,?)',
      [code, name, fac[f], units, exp, spw, dur]);
    const [[c]] = await pool.query('SELECT id FROM courses WHERE code=?', [code]);
    cid.push(c.id);
    for (const e of eq) await pool.query('INSERT IGNORE INTO course_equipment(course_id,equipment_id) VALUES(?,?)', [c.id, eqId[e]]);
  }
  // every student takes 4 courses (rotating so some students share classes)
  for (let i = 0; i < stu.length; i++) {
    for (let k = 0; k < 4; k++) {
      await pool.query('INSERT IGNORE INTO enrollments(student_id,course_id) VALUES(?,?)', [stu[i], cid[(i + k * 2) % cid.length]]);
    }
  }
  console.log('Demo data loaded.');
  console.log('  Admin:    ' + (process.env.ADMIN_EMAIL || 'admin@school.edu') + ' / ' + (process.env.ADMIN_PASSWORD || 'Admin@12345'));
  console.log('  Faculty:  maria.santos@school.edu / Password123!');
  console.log('  Student:  student1@school.edu / Password123!');
  await pool.end();
})().catch(e => { console.error('Seed failed:', e.message); process.exit(1); });
