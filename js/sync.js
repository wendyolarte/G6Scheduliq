/* Sync: Google Calendar (links + .ics), Zoom links, Google Classroom links. No API keys required. */
document.addEventListener('DOMContentLoaded', async () => {
  if (!Layout.ok) return;
  const u = API.user(), canEditLinks = u.role !== 'student';
  let entries = [], events = [], courses = [];

  // default semester start = next Monday
  const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  $('#startDate').value = d.toISOString().slice(0, 10);
  $('#zoomNote').textContent = canEditLinks ? 'Paste the Zoom link for each of your courses. Students will see a join link on their timetable and in calendar events.' : 'Join links set by your instructors appear here and are added to your calendar events.';
  $('#gcNote').textContent = canEditLinks ? 'Save each course\'s Classroom link so students can open it from their timetable.' : 'Open the Classroom for each of your courses.';

  const items = () => {
    const list = [];
    if ($('#incClasses').checked) entries.filter(e => e.status !== 'rejected').forEach(e => list.push({
      title: `${e.code} – ${e.course_name}`, day: e.day, start_time: e.start_time, end_time: e.end_time, location: e.room_name,
      description: e.faculty_name ? 'Instructor: ' + e.faculty_name : '', zoom_link: e.zoom_link, classroom_link: e.classroom_link
    }));
    if ($('#incPersonal').checked) events.forEach(e => list.push({ title: e.title, day: e.day, start_time: e.start_time, end_time: e.end_time, location: e.location || '', description: 'Added from Smart Class Scheduler' }));
    return list;
  };
  const weeks = () => Math.max(1, Math.min(30, +$('#weeks').value || 1));

  function renderItems() {
    const list = items();
    if (!list.length) { $('#items').innerHTML = '<div class="empty">Nothing to sync yet. Your approved classes and scanned events will appear here.</div>'; return; }
    $('#items').innerHTML = `<table><thead><tr><th>Event</th><th>Day</th><th>Time</th><th>Where</th><th></th></tr></thead><tbody>
      ${list.map((it, i) => `<tr><td><b>${esc(it.title)}</b></td><td>${DAY_FULL[it.day]}</td><td>${fmt12(it.start_time)} – ${fmt12(it.end_time)}</td><td>${esc(it.location || '—')}</td>
        <td class="actions"><a class="btn secondary sm" target="_blank" rel="noopener" href="${esc(Cal.googleLink(it, $('#startDate').value, weeks()))}">＋ Google Calendar</a></td></tr>`).join('')}</tbody></table>`;
  }

  async function load() {
    try {
      [entries, events, courses] = await Promise.all([API.get('/schedules'), API.get('/events'), API.get('/courses')]);
      renderItems(); renderLinks();
    } catch (e) { $('#items').innerHTML = `<div class="alert error">${esc(e.message)}</div>`; }
  }

  function linkCourses() {
    if (u.role === 'student') return courses.filter(c => c.is_enrolled);
    return u.role === 'faculty' ? courses.filter(c => c.faculty_id === u.id) : courses;
  }

  function renderLinks() {
    const list = linkCourses();
    const empty = '<div class="empty">No courses yet.</div>';
    const field = (c, key, ph) => canEditLinks && (u.role === 'admin' || c.faculty_id === u.id)
      ? `<div class="toolbar"><input data-c="${c.id}" data-key="${key}" value="${esc(c[key] || '')}" placeholder="${ph}"><button class="btn sm" data-save="${c.id}">Save</button></div>`
      : (c[key] ? `<a href="${esc(c[key])}" target="_blank" rel="noopener" class="btn secondary sm">Open</a>` : '<span class="muted small">No link yet</span>');
    $('#zoomList').innerHTML = list.length ? list.map(c => `<div style="padding:.6rem 0;border-bottom:1px solid var(--border)"><b>${esc(c.code)}</b> <span class="muted small">${esc(c.name)}</span>${field(c, 'zoom_link', 'https://zoom.us/j/…')}</div>`).join('') : empty;
    $('#gcList').innerHTML = list.length ? list.map(c => `<div style="padding:.6rem 0;border-bottom:1px solid var(--border)"><b>${esc(c.code)}</b> <span class="muted small">${esc(c.name)}</span>${field(c, 'classroom_link', 'https://classroom.google.com/c/…')}</div>`).join('') : empty;
    // one Save button per course saves both links
    $$('[data-save]').forEach(b => b.onclick = async () => {
      const id = b.dataset.save, c = courses.find(x => x.id === +id);
      const val = key => ($(`[data-c="${id}"][data-key="${key}"]`)?.value ?? c[key] ?? '').trim();
      try { await API.put(`/courses/${id}/links`, { zoom_link: val('zoom_link'), classroom_link: val('classroom_link') }); toast('Link saved', 'success'); load(); }
      catch (e) { toast(e.message, 'error'); }
    });
  }

  $('#icsBtn').onclick = () => {
    const list = items();
    if (!list.length) return toast('Nothing to export yet', 'error');
    download('class-schedule.ics', Cal.ics(list, $('#startDate').value, weeks()), 'text/calendar');
    toast(`Exported ${list.length} events`, 'success');
  };
  ['#startDate', '#weeks', '#incClasses', '#incPersonal'].forEach(s => $(s).onchange = renderItems);

  const announcement = () => {
    const rows = items().map(i => `• ${i.title}: ${DAY_FULL[i.day]} ${fmt12(i.start_time)}–${fmt12(i.end_time)}${i.location ? ' @ ' + i.location : ''}${i.zoom_link ? ' (Zoom: ' + i.zoom_link + ')' : ''}`);
    return `Class schedule\n${rows.join('\n')}`;
  };
  $('#copyBtn').onclick = async () => {
    try { await navigator.clipboard.writeText(announcement()); toast('Copied. Paste it into a Classroom announcement.', 'success'); }
    catch { modal({ title: 'Copy this text', body: `<textarea rows="10" readonly>${esc(announcement())}</textarea>`, actions: [{ label: 'Close' }] }); }
  };
  $('#shareBtn').onclick = () => {
    const url = location.origin.startsWith('http') ? location.origin : 'https://classroom.google.com';
    window.open(`https://classroom.google.com/share?url=${encodeURIComponent(url)}&title=${encodeURIComponent('Class schedule')}`, '_blank', 'noopener');
  };
  load();
});
