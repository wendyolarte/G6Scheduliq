const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { INSTRUCTORS } = require('./instructor-directory');
const { SAMPLE_ROOMS } = require('./campus-directory');

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

  const [scheduleColumns] = await pool.query(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='schedules'`
  );
  const scheduleColumnNames = new Set(scheduleColumns.map(column => column.COLUMN_NAME));
  if (scheduleColumns.length && !scheduleColumnNames.has('course_id')) {
    await pool.query('RENAME TABLE schedules TO schedules_legacy');
  }

  for (const sql of statements) await pool.query(sql);

  const [userColumns] = await pool.query(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users'`
  );
  const existingUserColumns = new Set(userColumns.map(column => column.COLUMN_NAME));
  if (!existingUserColumns.has('name') && existingUserColumns.has('full_name')) {
    await pool.query('ALTER TABLE users CHANGE COLUMN full_name name VARCHAR(150) NOT NULL');
  }
  if (!existingUserColumns.has('school_id')) {
    await pool.query('ALTER TABLE users ADD COLUMN school_id VARCHAR(50) NULL AFTER department');
  }
  if (!existingUserColumns.has('is_active')) {
    await pool.query('ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER school_id');
  }

  const [roomColumns] = await pool.query(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rooms'
        AND COLUMN_NAME IN ('floor','room_type','is_sample')`
  );
  const existingRoomColumns = new Set(roomColumns.map(column => column.COLUMN_NAME));
  if (!existingRoomColumns.has('floor')) await pool.query('ALTER TABLE rooms ADD COLUMN floor VARCHAR(40) NULL AFTER building');
  if (!existingRoomColumns.has('room_type')) await pool.query("ALTER TABLE rooms ADD COLUMN room_type VARCHAR(40) NOT NULL DEFAULT 'Classroom' AFTER floor");
  if (!existingRoomColumns.has('is_sample')) await pool.query('ALTER TABLE rooms ADD COLUMN is_sample TINYINT(1) NOT NULL DEFAULT 0 AFTER is_available');

  const [[column]] = await pool.query(
    `SELECT COUNT(*) AS found
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='courses' AND COLUMN_NAME='instructor_name'`
  );
  if (!column.found) await pool.query('ALTER TABLE courses ADD COLUMN instructor_name VARCHAR(150) NULL AFTER faculty_id');

  const [[campusSeed]] = await pool.query('SELECT name FROM app_migrations WHERE name=?', ['campus-sample-rooms-v1']);
  if (!campusSeed) {
    for (const room of SAMPLE_ROOMS) {
      await pool.query(
        'INSERT IGNORE INTO rooms(name,building,floor,room_type,capacity,is_available,is_sample) VALUES(?,?,?,?,?,0,1)',
        [room.name, room.building, room.floor, room.room_type, room.capacity]
      );
    }
    await pool.query('INSERT INTO app_migrations(name) VALUES(?)', ['campus-sample-rooms-v1']);
  }

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