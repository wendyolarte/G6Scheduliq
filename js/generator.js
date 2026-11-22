document.addEventListener('DOMContentLoaded', async () => {
  if (!Layout.ok) return;
  const u = API.user();
  let courses = [], result = null, current = [];   // current = placements being edited (may differ from result after swaps)

  $('#dayChecks').innerHTML = DAYS.map((d, i) => `<label><input type="checkbox" value="${d}" ${i < 5 ? 'checked' : ''}> ${DAY_FULL[d]}</label>`).join('');
  $('#iters').oninput = () => $('#itVal').textContent = $('#iters').value;

  try {
    courses = await API.get('/courses');
    if (u.role === 'faculty') courses = courses.filter(c => c.faculty_id === u.id);
    $('#courseList').innerHTML = courses.length ? courses.map(c => `<label><input type="checkbox" value="${c.id}" checked>
      <span><b>${esc(c.code)}</b> ${esc(c.name)} <span class="muted small">· ${c.expected_students} students · ${c.sessions_per_week}×${c.duration_min}min${c.equipment.length ? ' · ' + c.equipment.map(e => esc(e.name)).join(', ') : ''}</span></span></label>`).join('')
      : '<div class="empty">No courses yet. Create courses first.</div>';
  } catch (e) { $('#courseList').innerHTML = `<div class="alert error">${esc(e.message)}</div>`; }

  $('#selAll').onclick = () => $$('#courseList input').forEach(i => i.checked = true);
  $('#selNone').onclick = () => $$('#courseList input').forEach(i => i.checked = false);

  $('#genBtn').onclick = async () => {
    const ids = $$('#courseList input:checked').map(i => +i.value);
    if (!ids.length) return toast('Select at least one course', 'error');
    const btn = $('#genBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Optimising…';
    try {
      result = await API.post('/schedules/generate', {
        courseIds: ids, days: $$('#dayChecks input:checked').map(i => i.value), dayStart: $('#dayStart').value, dayEnd: $('#dayEnd').value,
        step: +$('#step').value, avoidLunch: $('#lunch').checked, preferMorning: $('#morning').checked, iterations: +$('#iters').value
      });
      current = result.placements.map(p => ({ ...p }));
      show();
      $('#output').scrollIntoView({ behavior: 'smooth' });
    } catch (e) { toast(e.message, 'error'); }
    btn.disabled = false; btn.innerHTML = '⚙️ Generate schedule';
  };

  const optLabel = o => `${o.day} ${o.start_time}–${o.end_time} · ${o.room_name}`;

  function show() {
    const alt = (p) => result.alternatives.find(a => a.course_id === p.course_id && a.session === p.session)?.options || [];
    $('#output').innerHTML = `
      <div class="card"><div class="grid cols-4">
        <div><div class="quality">${result.quality}%</div><div class="muted small">Schedule quality</div></div>
        <div><div class="quality">${current.length}</div><div class="muted small">Sessions placed</div></div>
        <div><div class="quality" style="color:${result.unplaced.length ? 'var(--bad)' : 'var(--ok)'}">${result.unplaced.length}</div><div class="muted small">Could not place</div></div>
        <div><div class="quality">${result.iterations}</div><div class="muted small">Combinations tried</div></div>
      </div></div>
      ${result.unplaced.length ? `<div class="card"><h2>⚠️ Could not be placed</h2>${result.unplaced.map(x => `<div class="alert error"><b>${esc(x.code)}</b> (session ${x.session}): ${esc(x.reason)}</div>`).join('')}
        <p class="muted small">Try more days, longer hours, or add a bigger / better-equipped room.</p></div>` : ''}
      <div class="card"><h2>Preview</h2><div id="preview"></div></div>
      <div class="card"><h2>Sessions &amp; alternative suggestions</h2>
        <div id="swapMsg"></div>
        <div class="table-wrap"><table><thead><tr><th>Course</th><th>Session</th><th>Chosen slot</th><th>Alternatives</th></tr></thead><tbody>
        ${current.map((p, i) => `<tr><td><b>${esc(p.code)}</b><div class="muted small">${esc(p.name)}</div></td><td>#${p.session}</td>
          <td>${DAY_FULL[p.day]} ${fmt12(p.start_time)}–${fmt12(p.end_time)}<div class="muted small">${esc(p.room_name)}</div></td>
          <td><select data-i="${i}"><option value="">Keep this slot</option>${alt(p).map((o, k) => `<option value="${k}">${esc(optLabel(o))}</option>`).join('')}</select></td></tr>`).join('')}
        </tbody></table></div>
        <div class="toolbar" style="margin-top:1rem">
          <button class="btn secondary" id="saveDraft">💾 Save as draft</button>
          <button class="btn ok" id="saveSubmit">${u.role === 'admin' ? '✅ Save &amp; approve' : '📨 Save &amp; submit for approval'}</button>
        </div></div>`;
    paint();
    $$('#output select').forEach(s => s.onchange = () => {
      if (s.value === '') return;
      const p = current[+s.dataset.i], o = alt(p)[+s.value];
      Object.assign(p, { day: o.day, start_time: o.start_time, end_time: o.end_time, room_id: o.room_id, room_name: o.room_name });
      show();
      $('#swapMsg').innerHTML = '<div class="alert info">Slot swapped. Conflicts are re-checked when you save.</div>';
    });
    $('#saveDraft').onclick = () => save(false);
    $('#saveSubmit').onclick = () => save(true);
  }

  const paint = () => renderTimetable($('#preview'), current.map(p => ({ ...p, status: 'draft' })), { days: DAYS });

  async function save(submit) {
    if (!current.length) return toast('Nothing to save', 'error');
    const btns = $$('#saveDraft,#saveSubmit'); btns.forEach(b => b.disabled = true);
    try {
      const r = await API.post('/schedules/apply', {
        submit, placements: current.map(p => ({ course_id: p.course_id, room_id: p.room_id, day: p.day, start_time: p.start_time, end_time: p.end_time }))
      });
      toast(`${r.saved} sessions saved as ${r.status}`, 'success');
      setTimeout(() => location.href = submit ? 'approvals.html' : 'schedule.html', 900);
    } catch (e) {
      btns.forEach(b => b.disabled = false);
      $('#swapMsg').innerHTML = e.data?.conflicts ? `<div class="alert error">${esc(e.message)}</div>${conflictHtml(e.data.conflicts)}` : `<div class="alert error">${esc(e.message)}</div>`;
      $('#swapMsg').scrollIntoView({ behavior: 'smooth' });
    }
  }
});
