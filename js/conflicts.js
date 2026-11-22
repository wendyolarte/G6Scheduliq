document.addEventListener('DOMContentLoaded', () => {
  if (!Layout.ok) return;
  const u = API.user();
  const TYPES = {
    ROOM_DOUBLE_BOOKED: 'Room double-booked', FACULTY_CONFLICT: 'Instructor overlap', STUDENT_CONFLICT: 'Student overlap',
    COURSE_OVERLAP: 'Course overlap', CAPACITY: 'Room too small', EQUIPMENT: 'Missing equipment', ROOM_UNAVAILABLE: 'Room unavailable'
  };

  async function load() {
    $('#list').innerHTML = loadingHtml;
    try {
      const list = await API.get('/schedules/conflicts');
      const high = list.filter(c => c.severity === 'high').length;
      $('#summary').innerHTML = `<div class="grid cols-3" style="margin-bottom:1.25rem">
        <div class="stat ${list.length ? 'bad' : 'ok'}"><div class="num">${list.length}</div><div class="lab">Total issues</div></div>
        <div class="stat ${high ? 'bad' : 'ok'}"><div class="num">${high}</div><div class="lab">Must fix (high)</div></div>
        <div class="stat ${list.length - high ? 'warn' : 'ok'}"><div class="num">${list.length - high}</div><div class="lab">Warnings (medium)</div></div></div>`;
      if (!list.length) { $('#list').innerHTML = '<div class="card empty">✅ No conflicts found. Your schedule is clean.</div>'; return; }
      $('#list').innerHTML = list.map((c, i) => `<div class="card">
        <div class="list-item" style="border:0;padding:0 0 .5rem"><h3 style="margin:0">${esc(TYPES[c.type] || c.type)}</h3>${badge(c.severity)}</div>
        <p>${esc(c.message)}</p>
        <div class="muted small">Involved: ${c.entries.map(e => `<span class="chip">${esc(e.code)} · ${esc(e.day)} ${esc(e.start_time)} · ${esc(e.room_name)} · ${badge(e.status)}</span>`).join(' ')}</div>
        <h3 style="margin-top:1rem">💡 Suggested alternatives${c.target_id ? '' : ''}</h3>
        ${c.suggestions.length ? `<div class="toolbar">${c.suggestions.map((s, k) => `<button class="btn secondary sm" data-c="${i}" data-s="${k}">${esc(s.day)} ${fmt12(s.start_time)}–${fmt12(s.end_time)} · ${esc(s.room_name)}</button>`).join('')}</div>
          <p class="muted small">Pick one to move ${esc(c.entries.find(e => e.id === c.target_id)?.code || 'the session')} there.</p>` : '<p class="muted small">No free alternative found with the current rooms and hours.</p>'}
      </div>`).join('');
      $$('[data-s]').forEach(b => b.onclick = async () => {
        const c = list[+b.dataset.c], s = c.suggestions[+b.dataset.s];
        if (!(await confirmBox(`Move to ${s.day} ${s.start_time}–${s.end_time} in ${s.room_name}?`, 'Move session', ''))) return;
        try {
          await API.put('/schedules/' + c.target_id, { room_id: s.room_id, day: s.day, start_time: s.start_time, end_time: s.end_time });
          toast(u.role === 'admin' ? 'Session moved' : 'Session moved and set back to draft', 'success'); load();
        } catch (e) { toast(e.message, 'error'); }
      });
    } catch (e) { $('#list').innerHTML = `<div class="alert error">${esc(e.message)}</div>`; }
  }
  $('#refresh').onclick = load;
  load();
});
