/**
 * Rule-based assistant that answers from the live database:
 * your schedule, free rooms, room capacity/equipment, conflicts, approvals, course info,
 * and how-to help for every feature.
 */
const pool = require('../config/db');
const { loadContext, loadEntries, entriesForUser } = require('./data');
const S = require('./scheduler');

const R = (text, suggestions = []) => ({ reply: text, suggestions });
const pad = n => String(n).padStart(2, '0');
const JS_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
const DAY_WORDS = {
  monday: 'Mon', mon: 'Mon', tuesday: 'Tue', tues: 'Tue', tue: 'Tue', wednesday: 'Wed', wed: 'Wed',
  thursday: 'Thu', thurs: 'Thu', thur: 'Thu', thu: 'Thu', friday: 'Fri', fri: 'Fri', saturday: 'Sat', sat: 'Sat'
};

function parseDay(t) {
  if (/\btoday\b/.test(t)) return { day: JS_DAYS[new Date().getDay()], label: 'today' };
  if (/\btomorrow\b/.test(t)) return { day: JS_DAYS[(new Date().getDay() + 1) % 7], label: 'tomorrow' };
  for (const k of Object.keys(DAY_WORDS)) if (new RegExp(`\\b${k}\\b`).test(t)) return { day: DAY_WORDS[k], label: FULL[DAY_WORDS[k]] };
  return null;
}

function parseTime(t) {
  let m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (m) { let h = (+m[1]) % 12; if (m[3] === 'pm') h += 12; return `${pad(h)}:${m[2] || '00'}`; }
  m = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m) return `${pad(+m[1])}:${m[2]}`;
  m = t.match(/\bat (\d{1,2})\b/);
  if (m) { let h = +m[1]; if (h < 7) h += 12; return `${pad(h)}:00`; }
  return null;
}

const addMin = (t, mins) => S.toHHMM(Math.min(23 * 60 + 59, S.toMin(t) + mins));
const line = e => `• ${e.day} ${e.start_time}–${e.end_time}  ${e.code} (${e.room_name})`;
const needSignIn = () => R('Please sign in first so I can look up your personal schedule. You can log in from the Login page.', ['How do I sign up?']);

function suggestionsFor(user) {
  if (!user) return ['What can you do?', 'How do I sign up?', 'What features are there?'];
  if (user.role === 'student') return ['What is my schedule today?', 'Which rooms are free now?', 'How do I scan my timetable?', 'How do I sync to Google Calendar?'];
  if (user.role === 'faculty') return ['Show my classes', 'Any schedule conflicts?', 'How do I generate a schedule?', 'Which rooms have a projector?'];
  return ['Any pending approvals?', 'Any schedule conflicts?', 'Which rooms are free now?', 'How do I add a user?'];
}

async function reply(user, message) {
  const t = message.toLowerCase().trim();

  if (/^(hi|hello|hey|good (morning|afternoon|evening)|yo|help)\b/.test(t) || /what can you do/.test(t)) {
    const who = user ? `Hi ${user.name.split(' ')[0]}! ` : 'Hi! ';
    return R(`${who}I can look up schedules, find free rooms, check room capacity and equipment, report conflicts, show approval status and guide you through every feature. What would you like to do?`, suggestionsFor(user));
  }

  // ---- How-to answers (work without signing in) ----
  if (/(sign ?up|register|create (an )?account)/.test(t))
    return R('Open the **Sign up** page, choose **Student** or **Faculty/Staff**, fill in your details and submit. Admin accounts are created only by an existing admin.', ['How do I log in?']);
  if (/(log ?in|sign ?in|password|forgot)/.test(t))
    return R('On the **Login** page pick your mode (Student, Faculty/Staff or Admin), then enter your email and password. If you forgot your password, ask the admin to reset it from Admin Mode → Users.');
  if (/(generate|auto(matic)?|optimi[sz]e|create.*schedule|build.*schedule)/.test(t) && !/room/.test(t))
    return R('Faculty/Staff and admins can open **Auto Generator**: pick the courses, days and hours, then press **Generate**. The engine respects room capacity, required equipment, instructor and student overlaps, then tries many combinations and keeps the best one. You can swap in alternative slots, save as a draft, or submit for approval.');
  if (/(sync|google calendar|zoom|classroom|ics|calendar)/.test(t))
    return R('Open **Sync & Integrations**. You can add your classes to **Google Calendar** (one click per class or a full .ics download), attach **Zoom** join links to courses, and share to **Google Classroom** or copy a ready-made announcement.', ['How do I scan my timetable?']);
  if (/(scan|picture|photo|image|ocr|upload.*(schedule|timetable))/.test(t))
    return R('Open **Scan Schedule**, take or upload a photo of your timetable, and press **Read schedule**. The text is recognised on your device, turned into editable rows (title, day, time, room), and you can save everything to your calendar with one click.');
  if (/(approve|approval|pending|review)/.test(t) && !/my/.test(t) && !user)
    return R('Faculty/Staff submit schedules for review and the admin approves or rejects them from the **Approvals** page. Sign in to see your own status.');
  if (/(feature|what.*(site|app|system)|about)/.test(t) && !/room/.test(t))
    return R('The Smart Class Scheduler offers scheduling information management, automatic schedule generation, constraint optimisation, classroom availability, capacity and equipment checks, conflict detection, alternative suggestions, schedule viewing/management and an approval workflow, plus Google Calendar/Zoom/Classroom sync and timetable scanning.');

  // ---- Data answers ----
  const ctx = await loadContext();

  // Course info e.g. "tell me about CS101"
  const cm = t.match(/\b([a-z]{2,5})\s?-?(\d{3})\b/);
  if (cm) {
    const code = (cm[1] + cm[2]).toUpperCase();
    const c = [...ctx.courses.values()].find(x => x.code.replace(/\s|-/g, '').toUpperCase() === code);
    if (c) {
      const ents = await loadEntries("WHERE s.status='approved' AND s.course_id=?", [c.id]);
      const eq = [...c.equip].map(x => ctx.equipNames.get(x)).join(', ') || 'none';
      let out = `**${c.code} – ${c.name}**\nInstructor: ${c.faculty_name || 'TBA'}\nUnits: ${c.units} · Expected students: ${c.expected_students}\n${c.sessions_per_week} session(s)/week, ${c.duration_min} min each · Equipment: ${eq}`;
      out += ents.length ? '\n\nSchedule:\n' + ents.map(line).join('\n') : '\n\nNo approved schedule yet.';
      if (user && c.zoom_link && /zoom|link|online/.test(t)) out += `\n\nZoom: ${c.zoom_link}`;
      if (user && c.classroom_link && /classroom|link/.test(t)) out += `\nGoogle Classroom: ${c.classroom_link}`;
      return R(out, ['Which rooms are free now?']);
    }
  }

  // Personal schedule
  if (/\b(my|next|today|tomorrow)\b.*\b(schedule|class|classes|timetable|session|sessions|lecture)/.test(t) || /^(schedule|timetable|classes|show my classes)/.test(t) || /what.*(class|schedule)/.test(t)) {
    if (!user) return needSignIn();
    const dayInfo = parseDay(t);
    let ents = await entriesForUser(user, {});
    if (/\bnext\b/.test(t)) {
      const now = new Date(), cur = JS_DAYS[now.getDay()], nowMin = now.getHours() * 60 + now.getMinutes();
      const order = S.DAYS;
      const rank = e => { const di = (order.indexOf(e.day) - order.indexOf(cur) + 6) % 6; return di * 1440 + S.toMin(e.start_time); };
      const nxt = ents.filter(e => order.indexOf(e.day) >= 0).map(e => ({ e, r: rank(e) })).filter(x => cur === 'Sun' || x.r >= nowMin || order.indexOf(x.e.day) !== order.indexOf(cur)).sort((a, b) => a.r - b.r)[0];
      return nxt ? R(`Your next class is:\n${line(nxt.e)}`, ['What is my schedule today?']) : R('You have no upcoming classes on your schedule.', ['How do I scan my timetable?']);
    }
    if (dayInfo) {
      if (!S.DAYS.includes(dayInfo.day)) return R(`There are no classes on ${dayInfo.day === 'Sun' ? 'Sunday' : dayInfo.day}. Enjoy the day off!`);
      ents = ents.filter(e => e.day === dayInfo.day);
      return ents.length ? R(`Your classes ${dayInfo.label}:\n${ents.map(line).join('\n')}`) : R(`You have no classes ${dayInfo.label}.`);
    }
    if (!ents.length) return R(user.role === 'student' ? 'No approved classes yet. Enrol in courses from the Courses page, and classes will appear after the admin approves the schedule.' : 'You have no sessions yet. Use Auto Generator or add one in Schedules.', ['How do I generate a schedule?']);
    return R(`You have ${ents.length} session(s) this week:\n${ents.slice(0, 14).map(line).join('\n')}${ents.length > 14 ? '\n…and more on the Schedules page.' : ''}`);
  }

  // Free rooms
  if (/(room|classroom|venue|lab|hall)s?\b.*\b(available|free|vacant|open)|\b(available|free|vacant|open)\b.*\b(room|classroom|venue|lab|hall)/.test(t)) {
    const now = new Date();
    let d = parseDay(t)?.day || JS_DAYS[now.getDay()];
    let note = '';
    if (!S.DAYS.includes(d)) { d = 'Mon'; note = 'There are no classes on Sunday, so I checked Monday instead.\n'; }
    const start = parseTime(t) || `${pad(Math.min(20, now.getHours() + (now.getMinutes() > 0 ? 1 : 0)))}:00`;
    const hrs = t.match(/for (\d+(?:\.\d+)?)\s*(hour|hr|h)/);
    const end = addMin(start, hrs ? Math.round(+hrs[1] * 60) : 90);
    const cap = t.match(/(\d+)\s*(students|people|pax|seats|persons)/);
    const equipIds = ctx.equipment.filter(e => t.includes(e.name.toLowerCase()) || (e.name === 'Computers' && /computer|pc/.test(t))).map(e => e.id);
    const entries = await loadEntries("WHERE s.status<>'rejected' AND s.day=?", [d]);
    const res = S.availability(ctx, entries, { day: d, start, end, capacity: cap ? +cap[1] : 0, equip: equipIds });
    const free = res.filter(r => r.status === 'free');
    if (!free.length) return R(`${note}No rooms match for ${d} ${start}–${end}. The closest issue: ${res[0]?.reason || 'none'}. Try a different time on the Classrooms page.`);
    return R(`${note}Free rooms on ${FULL[d]} ${start}–${end}:\n${free.slice(0, 8).map(r => `• ${r.name} (${r.building || '—'} · ${r.capacity} seats) – ${r.equipment.join(', ') || 'no equipment'}`).join('\n')}${free.length > 8 ? `\n…and ${free.length - 8} more.` : ''}`, ['Which rooms have a projector?']);
  }

  // Room details (capacity / equipment)
  const room = [...ctx.rooms.values()].find(r => new RegExp(`\\b${r.name.toLowerCase().replace(/[^a-z0-9]/g, '')}\\b`).test(t.replace(/[^a-z0-9 ]/g, '')));
  if (room && /(capacity|seat|fit|equipment|have|has|room|about|info)/.test(t)) {
    const eq = [...room.equip].map(x => ctx.equipNames.get(x)).join(', ') || 'none';
    return R(`**${room.name}** (${room.building || 'no building'})\nCapacity: ${room.capacity} seats\nEquipment: ${eq}\nStatus: ${room.is_available ? 'Available for scheduling' : 'Currently unavailable'}`, ['Which rooms are free now?']);
  }

  // Rooms with equipment / capacity
  if (/(rooms?|classrooms?|labs?)\b.*\b(with|having|that have|equipped)|which rooms|biggest|largest|capacity/.test(t)) {
    const eq = ctx.equipment.filter(e => t.includes(e.name.toLowerCase()) || (e.name === 'Computers' && /computer|pc/.test(t)) || (e.name === 'Projector' && /projector/.test(t)));
    let rooms = [...ctx.rooms.values()];
    if (eq.length) rooms = rooms.filter(r => eq.every(e => r.equip.has(e.id)));
    const cap = t.match(/(\d+)\s*(students|people|pax|seats)/);
    if (cap) rooms = rooms.filter(r => r.capacity >= +cap[1]);
    if (/biggest|largest/.test(t)) rooms = rooms.sort((a, b) => b.capacity - a.capacity).slice(0, 3);
    if (!rooms.length) return R('No rooms match those requirements.');
    return R(`${rooms.length} room(s) match:\n${rooms.slice(0, 10).map(r => `• ${r.name} – ${r.capacity} seats (${[...r.equip].map(x => ctx.equipNames.get(x)).join(', ') || 'no equipment'})`).join('\n')}`);
  }

  // Conflicts
  if (/(conflict|clash|overlap|double.?book)/.test(t)) {
    if (!user) return needSignIn();
    let all = await loadEntries("WHERE s.status<>'rejected'");
    if (user.role === 'student') all = all.filter(e => e.status === 'approved' && ctx.courses.get(e.course_id)?.students.has(user.id));
    let list = S.detect(all, ctx);
    if (user.role === 'faculty') list = list.filter(c => c.entryIds.some(id => all.find(e => e.id === id)?.faculty_id === user.id));
    if (!list.length) return R('Good news – no schedule conflicts found.');
    const link = user.role === 'student' ? '' : '\nOpen the Conflicts page for suggested alternatives.';
    return R(`I found ${list.length} conflict(s):\n${list.slice(0, 5).map(c => `• ${c.message}`).join('\n')}${list.length > 5 ? '\n…and more.' : ''}${link}`);
  }

  // Approvals
  if (/(approv|pending|reject|status)/.test(t)) {
    if (!user) return needSignIn();
    if (user.role === 'admin') {
      const [[r]] = await pool.query("SELECT COUNT(*) n FROM schedules WHERE status='pending'");
      return R(r.n ? `${r.n} session(s) are waiting for your review. Open **Approvals** to approve or reject them.` : 'Nothing is waiting for approval right now.');
    }
    if (user.role === 'faculty') {
      const [rows] = await pool.query("SELECT s.status, COUNT(*) n FROM schedules s JOIN courses c ON c.id=s.course_id WHERE c.faculty_id=? GROUP BY s.status", [user.id]);
      return R(rows.length ? 'Your sessions by status:\n' + rows.map(r => `• ${r.status}: ${r.n}`).join('\n') : 'You have no sessions yet.', ['How do I generate a schedule?']);
    }
    return R('Students only see approved classes. When the admin approves a schedule, it appears automatically in your timetable.');
  }

  // Users (admin)
  if (/(add|create|manage).*(user|account|admin)/.test(t))
    return R(user?.role === 'admin' ? 'Open **Admin Panel → Users** and press **Add user** to create students, faculty or other admins. You can also reset passwords and deactivate accounts there.' : 'Only the admin can add users. Students and Faculty/Staff can sign up themselves from the Sign up page.');

  return R("I'm not sure I understood that. I can help with your schedule, free rooms, room capacity/equipment, conflicts, approvals, course info, syncing and scanning.", suggestionsFor(user));
}

module.exports = { reply };
