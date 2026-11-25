// Creates the database and tables from database/schema.sql
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

(async () => {
  const db = process.env.DB_NAME || 'smart_scheduler';
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: +(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });
  const sql = fs.readFileSync(path.join(__dirname, '../../database/schema.sql'), 'utf8')
    .replace(/CREATE DATABASE IF NOT EXISTS [^\s]+/i, `CREATE DATABASE IF NOT EXISTS \`${db.replace(/`/g, '``')}\``)
    .replace(/USE [^\s;]+/i, `USE \`${db.replace(/`/g, '``')}\``);
  await conn.query(sql);
  await conn.changeUser({ database: db });

  const [scheduleColumns] = await conn.query(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=? AND TABLE_NAME='schedules'`,
    [db]
  );
  const scheduleColumnNames = new Set(scheduleColumns.map(column => column.COLUMN_NAME));
  if (scheduleColumns.length && !scheduleColumnNames.has('course_id')) {
    await conn.query('RENAME TABLE schedules TO schedules_legacy');
    await conn.query(sql);
  }

  const [userColumns] = await conn.query(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=? AND TABLE_NAME='users'`,
    [db]
  );
  const columns = new Set(userColumns.map(column => column.COLUMN_NAME));
  if (!columns.has('name') && columns.has('full_name')) {
    await conn.query('ALTER TABLE users CHANGE COLUMN full_name name VARCHAR(150) NOT NULL');
  }
  if (!columns.has('school_id')) {
    await conn.query('ALTER TABLE users ADD COLUMN school_id VARCHAR(50) NULL AFTER department');
  }
  if (!columns.has('is_active')) {
    await conn.query('ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER school_id');
  }
  console.log(`Database "${db}" is ready.`);
  await conn.end();
})().catch(e => { console.error('Database setup failed:', e.message); process.exit(1); });
