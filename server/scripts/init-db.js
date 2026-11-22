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
  const sql = fs.readFileSync(path.join(__dirname, '../../database/schema.sql'), 'utf8').replace(/smart_scheduler/g, db);
  await conn.query(sql);
  console.log(`Database "${db}" is ready.`);
  await conn.end();
})().catch(e => { console.error('Database setup failed:', e.message); process.exit(1); });
