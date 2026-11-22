document.addEventListener('DOMContentLoaded', async () => {
  if (!Layout.ok) return;
  const u = API.user();
  $('#welcome').textContent = `Welcome back, ${u.name.split(' ')[0]}!`;
  $('#modeNote').textContent = {
    student: 'Student Mode – your approved timetable, courses and calendar tools.',
    faculty: 'Faculty/Staff Mode – manage courses, generate schedules and submit them for approval.',
    admin: 'Admin Mode – review schedules, manage rooms and users.'
  }[u.role];

  const quick = { student: [['courses.html', 'Enrol in courses'], ['scan.html', '📷 Scan timetable'], ['sync.html', '🔗 Sync calendar']],
    faculty: [['generator.html', '⚙️ Auto-generate'], ['schedule.html', 'My sessions'], ['approvals.html', 'Submit for approval']],
    admin: [['approvals.html', '✅ Review approvals'], ['admin.html', '🛡️ Admin panel'], ['conflicts.html', '⚠️ Conflicts']] }[u.role];
  $('#quick').innerHTML = quick.map(([h, l], i) => `<a class="btn ${i ? 'secondary' : ''} sm" href="${h}">${l}</a>`).join('');

  const stat = (n, l, cls = '') => `<div class="stat ${cls}"><div class="num">${n}</div><div class="lab">${l}</div></div>`;
  try {
    const calls = [API.get('/schedules'), API.get('/events'), API.get('/courses')];
    if (u.role !== 'student') calls.push(API.get('/schedules/conflicts'));
    if (u.role === 'admin') calls.push(API.get('/admin/stats'));
    const [entries, events, courses, conflicts, adminStats] = await Promise.all(calls);

    const today = todayKey();
    const todays = entries.filter(e => e.day === today && e.status !== 'rejected');
    const personalToday = events.filter(e => e.day === today);

    if (u.role === 'student') {
      $('#stats').innerHTML = stat(courses.filter(c => c.is_enrolled).length, 'Enrolled courses') + stat(entries.length, 'Classes per week') +
        stat(todays.length, 'Classes today') + stat(events.length, 'Personal events');
    } else if (u.role === 'faculty') {
      const mine = courses.filter(c => c.faculty_id === u.id);
      $('#stats').innerHTML = stat(mine.length, 'My courses') + stat(entries.length, 'Sessions') +
        stat(entries.filter(e => e.status === 'pending').length, 'Awaiting approval', 'warn') +
        stat(conflicts.filter(c => c.severity === 'high').length, 'Conflicts', conflicts.length ? 'bad' : 'ok');
    } else {
      $('#stats').innerHTML = stat(adminStats.users.total, 'Users') + stat(adminStats.rooms.total, 'Rooms') +
        stat(adminStats.schedules.pending, 'Pending approvals', adminStats.schedules.pending ? 'warn' : '') +
        stat(adminStats.conflicts, 'Conflicts', adminStats.conflicts ? 'bad' : 'ok');
    }

    const row = e => `<div class="list-item"><div><b>${esc(e.code)}</b> · ${esc(e.course_name)}<div class="muted small">${esc(e.room_name)}${e.faculty_name ? ' · ' + esc(e.faculty_name) : ''}</div></div><div class="right"><b>${fmt12(e.start_time)}</b><div class="muted small">to ${fmt12(e.end_time)}</div></div></div>`;
    const prow = e => `<div class="list-item"><div><b>${esc(e.title)}</b> <span class="chip">personal</span><div class="muted small">${esc(e.location || '')}</div></div><div class="right"><b>${fmt12(e.start_time)}</b></div></div>`;
    const all = [...todays.map(e => ({ t: e.start_time, h: row(e) })), ...personalToday.map(e => ({ t: e.start_time, h: prow(e) }))].sort((a, b) => a.t.localeCompare(b.t));
    $('#today').innerHTML = today ? (all.length ? all.map(x => x.h).join('') : '<div class="empty">No classes today 🎉</div>') : '<div class="empty">It\'s Sunday – no classes.</div>';

    // next upcoming class
    const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes(), cur = now.getDay() === 0 ? -1 : now.getDay() - 1;
    const ranked = entries.filter(e => e.status !== 'rejected').map(e => {
      let d = DAYS.indexOf(e.day) - cur; if (d < 0 || (d === 0 && toMin(e.start_time) <= nowMin)) d += 7;
      return { e, r: d * 1440 + toMin(e.start_time) };
    }).sort((a, b) => a.r - b.r)[0];
    $('#next').innerHTML = ranked ? `${row(ranked.e)}<p class="muted small" style="margin-top:.5rem">${DAY_FULL[ranked.e.day]}</p>` : '<div class="empty">Nothing scheduled yet.</div>';

    const view = [...entries, ...events.map(e => ({ ...e, personal: true }))];
    renderTimetable($('#week'), view, { days: DAYS, onClick: x => !x.personal && (location.href = 'schedule.html') });
  } catch (e) {
    $('#today').innerHTML = `<div class="alert error">${esc(e.message)}</div>`;
    $('#next').innerHTML = $('#week').innerHTML = '';
  }
});
