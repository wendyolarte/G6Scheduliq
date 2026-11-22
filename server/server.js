require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { ensureAdmin } = require('./services/bootstrap');

if (!process.env.JWT_SECRET) {
  console.error('Missing JWT_SECRET. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const app = express();
const root = path.join(__dirname, '..');

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/events', require('./routes/events'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Frontend: only these folders are public (server code and .env are never served)
app.use('/css', express.static(path.join(root, 'css')));
app.use('/js', express.static(path.join(root, 'js')));
app.use('/pages', express.static(path.join(root, 'pages')));
app.get('/', (req, res) => res.sendFile(path.join(root, 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

const port = process.env.PORT || 3000;
ensureAdmin()
  .then(() => app.listen(port, () => console.log(`Smart Class Scheduler running at http://localhost:${port}`)))
  .catch(e => {
    console.error('Could not connect to MySQL:', e.message);
    console.error('Check your .env settings and run "npm run setup" to create the database.');
    process.exit(1);
  });
