const router = require('express').Router();
const pool = require('../config/db');
const { auth } = require('../middleware/auth');
const { loadContext, loadEntries } = require('../services/data');
const S = require('../services/scheduler');
const { BUILDINGS, ROOM_TYPES } = require('../services/campus-directory');

async function withEquipment(rooms) {
  const [re] = await pool.query('SELECT re.room_id, e.id, e.name FROM room_equipment re JOIN equipment e ON e.id=re.equipment_id');
  return rooms.map(r => ({
    ...r,
    is_available: !!r.is_available,
    is_sample: !!r.is_sample,
    equipment: re.filter(x => x.room_id === r.id).map(x => ({ id: x.id, name: x.name }))
  }));
}

async function setEquipment(roomId, ids) {
  await pool.query('DELETE FROM room_equipment WHERE room_id=?', [roomId]);
  for (const id of ids || []) await pool.query('INSERT IGNORE INTO room_equipment(room_id,equipment_id) VALUES(?,?)', [roomId, +id]);
}

router.get('/', auth(), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM rooms ORDER BY building, name');
  res.json(await withEquipment(rows));
});

router.get('/buildings', auth(), (req, res) => {
  res.json({ buildings: BUILDINGS, roomTypes: ROOM_TYPES });
});

router.get('/equipment', auth(), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM equipment ORDER BY name');
  res.json(rows);
});

router.post('/equipment', auth('admin'), async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Equipment name is required' });
  try {
    const [r] = await pool.query('INSERT INTO equipment(name) VALUES(?)', [name]);
    res.status(201).json({ id: r.insertId, name });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That equipment already exists' });
    throw e;
  }
});

router.delete('/equipment/:id', auth('admin'), async (req, res) => {
  await pool.query('DELETE FROM equipment WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// Which rooms are free at a given day/time, big enough, and with the needed equipment?
router.get('/availability', auth(), async (req, res) => {
  const { day, start, end, capacity, equipment } = req.query;
  if (!S.DAYS.includes(day) || !/^\d{2}:\d{2}$/.test(start || '') || !/^\d{2}:\d{2}$/.test(end || '') || start >= end)
    return res.status(400).json({ error: 'Choose a day and a valid start/end time' });
  const ctx = await loadContext();
  const entries = await loadEntries("WHERE s.status<>'rejected' AND s.day=?", [day]);
  const equip = equipment ? String(equipment).split(',').filter(Boolean).map(Number) : [];
  res.json(S.availability(ctx, entries, { day, start, end, capacity: +capacity || 0, equip }));
});

function clean(b) {
  const name = String(b.name || '').trim();
  const building = String(b.building || '').trim() || null;
  const floor = String(b.floor || '').trim() || null;
  const room_type = String(b.room_type || 'Classroom').trim();
  const capacity = +b.capacity;
  if (!name) return { error: 'Room name is required' };
  if (name.length > 50) return { error: 'Room name must be 50 characters or fewer' };
  if (building && building.length > 80) return { error: 'Building name must be 80 characters or fewer' };
  if (floor && floor.length > 40) return { error: 'Floor name must be 40 characters or fewer' };
  if (!ROOM_TYPES.includes(room_type)) return { error: 'Choose a valid room type' };
  if (!capacity || capacity < 1) return { error: 'Capacity must be at least 1' };
  const is_sample = b.is_sample === true || b.is_sample === 1 || b.is_sample === '1';
  return {
    value: {
      name, building, floor, room_type, capacity, is_sample: is_sample ? 1 : 0,
      is_available: is_sample || b.is_available === false || b.is_available === 0 ? 0 : 1
    }
  };
}

router.post('/', auth('admin'), async (req, res) => {
  const { value, error } = clean(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const [r] = await pool.query(
      'INSERT INTO rooms(name,building,floor,room_type,capacity,is_available,is_sample) VALUES(?,?,?,?,?,?,?)',
      [value.name, value.building, value.floor, value.room_type, value.capacity, value.is_available, value.is_sample]
    );
    await setEquipment(r.insertId, req.body.equipment);
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A room with that name already exists' });
    throw e;
  }
});

router.put('/:id', auth('admin'), async (req, res) => {
  const { value, error } = clean(req.body);
  if (error) return res.status(400).json({ error });
  try {
    await pool.query(
      'UPDATE rooms SET name=?,building=?,floor=?,room_type=?,capacity=?,is_available=?,is_sample=? WHERE id=?',
      [value.name, value.building, value.floor, value.room_type, value.capacity, value.is_available, value.is_sample, req.params.id]
    );
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A room with that name already exists' });
    throw e;
  }
  await setEquipment(req.params.id, req.body.equipment);
  res.json({ ok: true });
});

router.delete('/:id', auth('admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM rooms WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ error: 'This room has scheduled classes. Move or delete them first.' });
    throw e;
  }
});

module.exports = router;
