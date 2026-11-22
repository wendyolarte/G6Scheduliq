document.addEventListener('DOMContentLoaded', async () => {
  if (!Layout.ok) return;
  const u = API.user(), canEdit = u.role !== 'student';
  let entries = [], view = 'week', courses = [], rooms = [];

  $('#subtitle').textContent = u.role === 'student' ? 'Your approved classes for the week.' :
    u.role === 'faculty' ? 'Your sessions. Drafts can be edited and submitted for approval.' : 'All sessions on campus.';
  if (!canEdit) $('#addBtn').classList.add('hidden');
  if (u.role === 'admin') $('#campusWrap').classList.add('hidden');
  $('#fDay').innerHTML += DAYS.map(d => `<option value="${d}">${DAY_FULL[d]}</option>`).join('');
  $('#printBtn').onclick = () => window.print();

  async function load() {
    $('#weekView').innerHTML = loadingHtml;
    try {
      const q = $('#campus').checked ? '?scope=campus' : '';
      entries = await API.get('/schedules' + q);
      render();
    } catch (e) { $('#weekView').innerHTML = `<div class="alert error">${esc(e.message)}</div>`; }
  }

  function filtered() {
    const st = $('#fStatus').value, d = $('#fDay').value, s = $('#fSearch').value.toLowerCase().trim();
    return entries.filter(e => (!st || e.status === st) && (!d || e.day === d) &&
      (!s || [e.code, e.course_name, e.room_name, e.faculty_name].some(x => String(x || '').toLowerCase().includes(s))));
  }

  const own = e => u.role === 'admin' || (u.role === 'faculty' && e.faculty_id === u.id);
  const editable = e => canEdit && own(e) && (u.role === 'admin' || ['draft', 'rejected'].includes(e.status));

  function render() {
    const list = filtered();
    $('#weekView').classList.toggle('hidden', view !== 'week');
    $('#listView').classList.toggle('hidden', view !== 'list');
    if (view === 'week') {
      renderTimetable($('#weekView'), list, { onClick: e => info(e) });
      return;
    }
    if (!list.length) { $('#listView').innerHTML = '<div class="empty">No sessions match.</div>'; return; }
    $('#listView').innerHTML = `<table><thead><tr><th>Course</th><th>Day</th><th>Time</th><th>Room</th><th>Instructor</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map(e => `<tr><td><b>${esc(e.code)}</b><div class="muted small">${esc(e.course_name)}</div></td><td>${DAY_FULL[e.day]}</td>
        <td>${fmt12(e.start_time)} – ${fmt12(e.end_time)}</td><td>${esc(e.room_name)}</td><td>${esc(e.faculty_name || '—')}</td>
        <td>${badge(e.status)}${e.review_note ? `<div class="muted small">${esc(e.review_note)}</div>` : ''}</td>
        <td class="actions">${editable(e) ? `<button class="btn secondary sm" data-edit="${e.id}">Edit</button> <button class="btn danger sm" data-del="${e.id}">Delete</button>` : ''}</td></tr>`).join('')}</tbody></table>`;
    $$('[data-edit]').forEach(b => b.onclick = () => form(entries.find(e => e.id === +b.dataset.edit)));
    $$('[data-del]').forEach(b => b.onclick = () => remove(+b.dataset.del));
  }

  function info(e) {
    modal({
      title: `${e.code} – ${e.course_name}`,
      body: `<p><b>${DAY_FULL[e.day]}</b> ${fmt12(e.start_time)} – ${fmt12(e.end_time)}</p><p>Room: <b>${esc(e.room_name)}</b></p>
        <p>Instructor: ${esc(e.faculty_name || '—')}</p><p>Status: ${badge(e.status)}</p>
        ${e.zoom_link ? `<p><a href="${esc(e.zoom_link)}" target="_blank" rel="noopener">🎥 Join on Zoom</a></p>` : ''}
        ${e.classroom_link ? `<p><a href="${esc(e.classroom_link)}" target="_blank" rel="noopener">🏷️ Open Google Classroom</a></p>` : ''}`,
      actions: [
        ...(editable(e) ? [{ label: 'Edit', onClick: c => { c(); form(e); } }] : []),
        { label: 'Close' }
      ]
    });
  }

  async function ensureLookups() {
    if (courses.length) return;
    [courses, rooms] = await Promise.all([API.get('/courses'), API.get('/rooms')]);
    if (u.role === 'faculty') courses = courses.filter(c => c.faculty_id === u.id);
  }

  async function form(e) {
    await ensureLookups();
    if (!courses.length) return toast('Create a course first (Courses page).', 'error');
    const m = modal({
      title: e ? 'Edit session' : 'Add session',
      body: `<div id="cf"></div>
        <div class="field"><label>Course</label><select id="mCourse" ${e ? 'disabled' : ''}>${courses.map(c => `<option value="${c.id}" ${e && e.course_id === c.id ? 'selected' : ''}>${esc(c.code)} – ${esc(c.name)} (${c.expected_students} students)</option>`).join('')}</select></div>
        <div class="field"><label>Room</label><select id="mRoom">${rooms.map(r => `<option value="${r.id}" ${e && e.room_id === r.id ? 'selected' : ''}>${esc(r.name)} – ${r.capacity} seats${r.is_available ? '' : ' (unavailable)'}</option>`).join('')}</select></div>
        <div class="row"><div class="field"><label>Day</label><select id="mDay">${DAYS.map(d => `<option value="${d}" ${e && e.day === d ? 'selected' : ''}>${DAY_FULL[d]}</option>`).join('')}</select></div>
        <div class="field"><label>Start</label><input type="time" id="mStart" value="${e ? e.start_time : '08:00'}"></div>
        <div class="field"><label>End</label><input type="time" id="mEnd" value="${e ? e.end_time : '09:30'}"></div></div>
        <p class="muted small">Room capacity, equipment, instructor and student overlaps are checked automatically.</p>`,
      actions: [
        { label: 'Cancel' },
        { label: 'Check conflicts', onClick: (c, b) => check(false) },
        { label: 'Save', cls: '', onClick: (c, b) => check(true, c, b) }
      ]
    });
    const data = () => ({ course_id: +$('#mCourse', m.el).value, room_id: +$('#mRoom', m.el).value, day: $('#mDay', m.el).value, start_time: $('#mStart', m.el).value, end_time: $('#mEnd', m.el).value });
    // auto-fill end time from the course's duration when the start changes
    $('#mStart', m.el).onchange = () => { const c = courses.find(x => x.id === +$('#mCourse', m.el).value); if (c && !e) $('#mEnd', m.el).value = toHHMM(toMin($('#mStart', m.el).value) + c.duration_min); };
    const cf = $('#cf', m.el);
    async function check(save, close, btn) {
      const body = data();
      try {
        if (!save) {
          const list = await API.post('/schedules/conflicts/check', { ...body, id: e?.id });
          cf.innerHTML = list.length ? conflictHtml(list) : '<div class="alert ok">✅ No conflicts. This slot works.</div>';
          return;
        }
        btn.disabled = true;
        const r = e ? await API.put('/schedules/' + e.id, body) : await API.post('/schedules', body);
        close(); toast(e ? 'Session updated' : 'Session added' + (u.role === 'faculty' ? ' as a draft' : ''), 'success');
        if (r.warnings?.length) toast(r.warnings[0].message);
        load();
      } catch (ex) {
        if (btn) btn.disabled = false;
        cf.innerHTML = ex.data?.conflicts ? conflictHtml(ex.data.conflicts) : `<div class="alert error">${esc(ex.message)}</div>`;
      }
    }
  }

  async function remove(id) {
    if (!(await confirmBox('Delete this session?', 'Delete'))) return;
    try { await API.del('/schedules/' + id); toast('Session deleted', 'success'); load(); } catch (e) { toast(e.message, 'error'); }
  }

  $('#addBtn').onclick = () => form();
  $$('#viewSeg button').forEach(b => b.onclick = () => { view = b.dataset.v; $$('#viewSeg button').forEach(x => x.classList.toggle('active', x === b)); render(); });
  ['#fStatus', '#fDay'].forEach(s => $(s).onchange = render);
  $('#fSearch').oninput = debounce(render);
  $('#campus').onchange = load;
  load();
});
