/**
 * Scheduling engine: conflict detection, room availability, constraint-based
 * schedule generation with optimisation, and alternative suggestions.
 * Pure functions - no database access - so it is easy to test.
 */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const toMin = t => { const [h, m] = String(t).split(':'); return (+h) * 60 + (+m || 0); };
const toHHMM = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const hh = t => String(t).slice(0, 5);
const inter = (a, b) => { let n = 0; const [s, l] = a.size < b.size ? [a, b] : [b, a]; for (const x of s) if (l.has(x)) n++; return n; };
const toInt = e => ({ ...e, s: toMin(e.start_time ?? toHHMM(e.s)), f: toMin(e.end_time ?? toHHMM(e.f)) });
const instructorKey = c => {
  const name = String(c?.instructor_name || '').trim().toLocaleLowerCase();
  return name ? `name:${name}` : c?.faculty_id ? `user:${c.faculty_id}` : null;
};
const sameInstructor = (a, b) => {
  const aKey = instructorKey(a);
  return !!aKey && aKey === instructorKey(b);
};

/* ---------------- Conflict detection ---------------- */
function detect(entries, ctx) {
  const out = [];
  const push = (type, severity, message, ids) => out.push({ type, severity, message, entryIds: ids });
  const n = entries.map(e => ({ ...e, s: toMin(e.start_time), f: toMin(e.end_time) }));
  const label = x => ctx.courses.get(x.course_id)?.code || `#${x.course_id}`;

  n.forEach((a, i) => {
    const c = ctx.courses.get(a.course_id), r = ctx.rooms.get(a.room_id);
    if (c && r) {
      if (!r.is_available) push('ROOM_UNAVAILABLE', 'high', `${r.name} is marked unavailable (${c.code}, ${a.day} ${hh(a.start_time)})`, [a.id]);
      if (r.capacity < c.expected_students) push('CAPACITY', 'high', `${c.code} expects ${c.expected_students} students but ${r.name} seats only ${r.capacity}`, [a.id]);
      const miss = [...c.equip].filter(x => !r.equip.has(x)).map(x => ctx.equipNames.get(x) || x);
      if (miss.length) push('EQUIPMENT', 'high', `${r.name} lacks ${miss.join(', ')} needed by ${c.code}`, [a.id]);
    }
    for (let j = i + 1; j < n.length; j++) {
      const b = n[j];
      if (a.day !== b.day || !(a.s < b.f && b.s < a.f)) continue;
      const cb = ctx.courses.get(b.course_id);
      const when = `${a.day} ${hh(a.start_time)}–${hh(a.end_time)}`;
      if (a.room_id === b.room_id)
        push('ROOM_DOUBLE_BOOKED', 'high', `${ctx.rooms.get(a.room_id)?.name || 'Room'} is double-booked: ${label(a)} and ${label(b)} overlap (${when})`, [a.id, b.id]);
      if (a.course_id === b.course_id && a.room_id !== b.room_id)
        push('COURSE_OVERLAP', 'high', `${label(a)} has two overlapping sessions (${when})`, [a.id, b.id]);
      if (c && cb && sameInstructor(c, cb) && a.course_id !== b.course_id)
        push('FACULTY_CONFLICT', 'high', `${c.faculty_name || 'The instructor'} is assigned to both ${label(a)} and ${label(b)} at the same time (${when})`, [a.id, b.id]);
      if (c && cb && a.course_id !== b.course_id) {
        const k = inter(c.students, cb.students);
        if (k) push('STUDENT_CONFLICT', 'medium', `${k} student(s) are enrolled in both ${label(a)} and ${label(b)}, which overlap (${when})`, [a.id, b.id]);
      }
    }
  });
  return out;
}

/* ---------------- Room availability ---------------- */
function availability(ctx, entries, q) {
  const s = toMin(q.start), f = toMin(q.end);
  const eq = (q.equip || []).map(Number);
  return [...ctx.rooms.values()].map(r => {
    const clash = entries.find(e => e.status !== 'rejected' && e.room_id === r.id && e.day === q.day && toMin(e.start_time) < f && s < toMin(e.end_time));
    let status = 'free', reason = 'Available';
    if (!r.is_available) { status = 'unavailable'; reason = 'Marked unavailable by the admin'; }
    else if (clash) { status = 'busy'; reason = `In use by ${clash.code} (${hh(clash.start_time)}–${hh(clash.end_time)})`; }
    else if (q.capacity && r.capacity < q.capacity) { status = 'too_small'; reason = `Seats ${r.capacity}, you need ${q.capacity}`; }
    else if (eq.some(x => !r.equip.has(x))) { status = 'missing_equipment'; reason = 'Missing: ' + eq.filter(x => !r.equip.has(x)).map(x => ctx.equipNames.get(x)).join(', '); }
    return {
      room_id: r.id, name: r.name, building: r.building, capacity: r.capacity,
      equipment: [...r.equip].map(x => ctx.equipNames.get(x)), status, reason
    };
  }).sort((a, b) => (a.status === 'free' ? 0 : 1) - (b.status === 'free' ? 0 : 1) || a.capacity - b.capacity);
}

/* ---------------- Candidate search & scoring ---------------- */
// Courses that cannot overlap each other: same instructor or shared students
function ensureRelated(ctx) {
  if (ctx.related) return;
  ctx.related = new Map();
  for (const a of ctx.courses.values()) {
    const set = new Set();
    for (const b of ctx.courses.values()) {
      if (a.id === b.id) continue;
      if (sameInstructor(a, b) || inter(a.students, b.students) > 0) set.add(b.id);
    }
    ctx.related.set(a.id, set);
  }
}

function scoreCand(ctx, course, room, day, s, e, o, mine, facCount, anchor) {
  let sc = 0;
  sc -= ((room.capacity - course.expected_students) / room.capacity) * 20;      // snug room = less waste
  sc -= [...room.equip].filter(x => !course.equip.has(x)).length * 1.5;         // keep special rooms free
  if (s < 8 * 60 || e > 17 * 60) sc -= 6;                                       // comfortable hours
  if (o.avoidLunch && s < 13 * 60 && e > 12 * 60) sc -= 15;                     // protect lunch
  if (o.preferMorning) sc += s < 12 * 60 ? 8 : -4;
  if (s % 60 === 0) sc += 2;                                                    // tidy start times
  if (mine.some(m => m.day === day)) sc -= 50;                                  // spread sessions over days
  else if (mine.some(m => Math.abs(DAYS.indexOf(m.day) - DAYS.indexOf(day)) >= 2)) sc += 8;
  if (facCount >= 3) sc -= (facCount - 2) * 8;                                  // avoid overloading an instructor
  if (anchor) {                                                                 // stay close to the original slot
    if (anchor.day === day) sc += 10;
    if (anchor.s === s) sc += 5;
    if (anchor.room_id === room.id) sc += 3;
  }
  return sc;
}

function findCandidates(ctx, course, dur, placed, o, mine, anchor) {
  const ds = toMin(o.dayStart), de = toMin(o.dayEnd);
  const rel = ctx.related.get(course.id) || new Set();
  const rooms = [...ctx.rooms.values()].filter(r =>
    r.is_available && r.capacity >= course.expected_students && [...course.equip].every(x => r.equip.has(x)));
  const out = [];
  for (const day of o.days) {
    const dp = placed.filter(p => p.day === day);
    const facCount = instructorKey(course) ? dp.filter(p => sameInstructor(ctx.courses.get(p.course_id), course)).length : 0;
    for (let s = ds; s + dur <= de; s += o.step) {
      const e = s + dur;
      if (dp.some(p => p.s < e && s < p.f && (p.course_id === course.id || rel.has(p.course_id)))) continue;
      for (const r of rooms) {
        if (dp.some(p => p.room_id === r.id && p.s < e && s < p.f)) continue;
        out.push({ day, s, e, room: r, score: scoreCand(ctx, course, r, day, s, e, o, mine, facCount, anchor) });
      }
    }
  }
  return { cands: out.sort((a, b) => b.score - a.score), roomsOk: rooms.length };
}

const fmt = (c, extra = {}) => ({
  room_id: c.room.id, room_name: c.room.name, day: c.day,
  start_time: toHHMM(c.s), end_time: toHHMM(c.e), score: Math.round(c.score * 10) / 10, ...extra
});

/* ---------------- Automatic generation + optimisation ---------------- */
function runOnce(ctx, courses, fixed, o, it) {
  const diff = c => c.expected_students * 0.5 + c.equip.size * 30 + (c.sessions_per_week || 1) * 10 + (c.duration_min || 90) / 10;
  // Hardest-to-place courses first (most constrained first); later passes add randomness
  const order = [...courses].sort((a, b) => (diff(b) - diff(a)) + (it ? (Math.random() - 0.5) * 40 : 0));
  const placed = [...fixed], placements = [], unplaced = [], alternatives = [];

  for (const c of order) {
    const dur = c.duration_min || 90;
    const have = fixed.filter(f => f.course_id === c.id).length;
    for (let k = have; k < (c.sessions_per_week || 1); k++) {
      const mine = placed.filter(p => p.course_id === c.id);
      const { cands, roomsOk } = findCandidates(ctx, c, dur, placed, o, mine, null);
      if (!cands.length) {
        unplaced.push({
          course_id: c.id, code: c.code, name: c.name, session: k + 1,
          reason: roomsOk ? 'No free time slot without an instructor, student or room clash'
                          : `No available room seats ${c.expected_students} students with the required equipment`
        });
        continue;
      }
      let pick = cands[0];
      if (it > 0) { const top = cands.slice(0, Math.min(3, cands.length)); pick = top[Math.floor(Math.random() * top.length)]; }
      placed.push({ course_id: c.id, room_id: pick.room.id, day: pick.day, s: pick.s, f: pick.e, id: `g${c.id}_${k}` });
      placements.push(fmt(pick, { course_id: c.id, code: c.code, name: c.name, session: k + 1 }));

      // Alternative suggestions: different time slots first, then other rooms
      const seen = new Set([`${pick.day}${pick.s}${pick.room.id}`]);
      const seenSlot = new Set([`${pick.day}${pick.s}`]);
      const opts = [];
      for (const a of cands) {
        const key = `${a.day}${a.s}${a.room.id}`, slot = `${a.day}${a.s}`;
        if (seen.has(key) || seenSlot.has(slot)) continue;
        seen.add(key); seenSlot.add(slot); opts.push(fmt(a));
        if (opts.length >= 4) break;
      }
      for (const a of cands) {
        if (opts.length >= 4) break;
        const key = `${a.day}${a.s}${a.room.id}`;
        if (seen.has(key)) continue;
        seen.add(key); opts.push(fmt(a));
      }
      alternatives.push({ course_id: c.id, session: k + 1, options: opts });
    }
  }
  const total = placements.reduce((a, p) => a + p.score, 0) - unplaced.length * 100;
  placements.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.start_time.localeCompare(b.start_time));
  return { placements, unplaced, alternatives, total };
}

function generate(ctx, fixedEntries, opts = {}) {
  ensureRelated(ctx);
  const o = {
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], dayStart: '07:30', dayEnd: '19:00', step: 30,
    avoidLunch: true, preferMorning: false, iterations: 15, courseIds: null, ...opts
  };
  const courses = [...ctx.courses.values()].filter(c => !o.courseIds || o.courseIds.includes(c.id));
  const fixed = fixedEntries.map(toInt);
  let best = null;
  for (let it = 0; it < o.iterations; it++) {           // constraint optimisation: keep the best of N randomised passes
    const r = runOnce(ctx, courses, fixed, o, it);
    if (!best || r.total > best.total) best = r;
  }
  const n = best.placements.length, miss = best.unplaced.length;
  const avg = n ? best.placements.reduce((a, p) => a + p.score, 0) / n : -100;
  best.quality = Math.round(Math.max(0, Math.min(100, 100 + avg)) * (n / Math.max(1, n + miss)));
  best.iterations = o.iterations;
  return best;
}

/* ---------------- Alternative suggestions for a conflicting entry ---------------- */
function suggest(ctx, entries, entry, n = 3) {
  const course = ctx.courses.get(entry.course_id);
  if (!course) return [];
  ensureRelated(ctx);
  const placed = entries.filter(e => e.id !== entry.id && e.status !== 'rejected').map(toInt);
  const mine = placed.filter(p => p.course_id === course.id);
  const o = { days: DAYS, dayStart: '07:00', dayEnd: '20:00', step: 30, avoidLunch: true, preferMorning: false };
  const dur = toMin(entry.end_time) - toMin(entry.start_time);
  const anchor = { day: entry.day, s: toMin(entry.start_time), room_id: entry.room_id };
  const { cands } = findCandidates(ctx, course, dur, placed, o, mine, anchor);
  const res = [], seen = new Set();
  for (const c of cands) {
    if (c.day === entry.day && c.s === anchor.s && c.room.id === entry.room_id) continue;
    const key = `${c.day}${c.s}`;
    if (seen.has(key) && res.length < n - 1) continue;   // prefer variety of time slots
    seen.add(key); res.push(fmt(c));
    if (res.length >= n) break;
  }
  return res;
}

module.exports = { DAYS, toMin, toHHMM, detect, availability, generate, suggest };
