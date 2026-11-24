document.addEventListener('DOMContentLoaded', async () => {
  if (!Layout.ok) return;
  const u = API.user(), student = u.role === 'student';
  let courses = [], equipment = [], faculty = [], instructors = [];
  $('#subtitle').textContent = student ? 'Enroll in the courses you take. Your timetable is built from them.' : 'Courses drive automatic scheduling: size, sessions, duration and equipment.';
  if (student) $('#addBtn').classList.add('hidden');
  $('#mineLbl').textContent = student ? 'Only enrolled' : 'Only mine';
  if (u.role === 'admin') $('#mineWrap').classList.add('hidden');

  async function load() {
    try {
      [courses, equipment, instructors] = await Promise.all([
        API.get('/courses'), API.get('/rooms/equipment'), API.get('/courses/instructors')
      ]);
      if (u.role === 'admin') faculty = await API.get('/courses/faculty');
      render();
    } catch (e) { $('#list').innerHTML = `<div class="alert error">${esc(e.message)}</div>`; }
  }

  const mineOf = c => student ? c.is_enrolled : c.faculty_id === u.id;
  const manage = c => u.role === 'admin' || c.faculty_id === u.id;

  function render() {
    const s = $('#search').value.toLowerCase().trim(), only = $('#mine').checked;
    const list = courses.filter(c => (!only || mineOf(c)) && (!s || [c.code, c.name, c.faculty_name].some(x => String(x || '').toLowerCase().includes(s))));
    if (!list.length) { $('#list').innerHTML = '<div class="empty">No courses found.</div>'; return; }
    $('#list').innerHTML = `<table><thead><tr><th>Course</th><th>Instructor</th><th>Units</th><th>Students</th><th>Sessions</th><th>Equipment needed</th><th></th></tr></thead><tbody>
      ${list.map(c => `<tr><td><b>${esc(c.code)}</b><div class="muted small">${esc(c.name)}</div></td><td>${esc(c.faculty_name || '—')}</td><td>${c.units}</td>
        <td>${c.expected_students}<div class="muted small">${c.enrolled_count} enrolled</div></td><td>${c.sessions_per_week}× ${c.duration_min} min</td>
        <td>${c.equipment.map(e => `<span class="chip">${esc(e.name)}</span>`).join('') || '<span class="muted small">none</span>'}</td>
        <td class="actions">${student
          ? (c.is_enrolled ? `<button class="btn secondary sm" data-drop="${c.id}">Drop</button>` : `<button class="btn sm" data-enroll="${c.id}">Enroll</button>`)
          : (manage(c) ? `<button class="btn secondary sm" data-edit="${c.id}">Edit</button> <button class="btn danger sm" data-del="${c.id}">Delete</button>` : '')}</td></tr>`).join('')}</tbody></table>`;
    $$('[data-enroll]').forEach(b => b.onclick = () => act(() => API.post(`/courses/${b.dataset.enroll}/enroll`), 'Enrolled'));
    $$('[data-drop]').forEach(b => b.onclick = () => act(() => API.del(`/courses/${b.dataset.drop}/enroll`), 'Course dropped'));
    $$('[data-edit]').forEach(b => b.onclick = () => form(courses.find(c => c.id === +b.dataset.edit)));
    $$('[data-del]').forEach(b => b.onclick = async () => {
      if (await confirmBox('Delete this course and all its scheduled sessions?', 'Delete')) act(() => API.del('/courses/' + b.dataset.del), 'Course deleted');
    });
  }

  async function act(fn, msg) { try { await fn(); toast(msg, 'success'); load(); } catch (e) { toast(e.message, 'error'); } }

  function form(c) {
    const has = id => c && c.equipment.some(e => e.id === id);
    const normalize = value => String(value || '').trim().toLocaleLowerCase();
    const matchedInstructor = instructors.find(i => normalize(i.course) === normalize(c?.name));
    const instructorName = c?.instructor_name || matchedInstructor?.name || '';
    const m = modal({
      title: c ? 'Edit course' : 'New course', wide: true,
      body: `<div id="err" class="alert error hidden"></div>
        <div class="row"><div class="field"><label>Code</label><input id="fCode" value="${esc(c?.code || '')}" placeholder="CS101"></div>
        <div class="field" style="flex:2"><label>Name</label><input id="fName" value="${esc(c?.name || '')}"></div></div>
        <div class="field"><label>Instructor (directory)</label><select id="fInstructor">
          <option value="">— Use account name or leave unassigned —</option>
          ${instructors.map(i => `<option value="${esc(i.name)}" ${instructorName === i.name ? 'selected' : ''}>${esc(i.name)} · ${esc(i.course)}</option>`).join('')}
        </select><div id="equipmentSuggestion"></div></div>
        ${u.role === 'admin' ? `<div class="field"><label>Faculty/Staff login account (optional)</label><select id="fFac"><option value="">— No course login owner —</option>${faculty.map(f => `<option value="${f.id}" ${c?.faculty_id === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select><span class="muted small">Directory instructors do not have login accounts. Choose an account only if a faculty user needs course-management access.</span></div>` : ''}
        <div class="row"><div class="field"><label>Units</label><input id="fUnits" type="number" min="1" max="12" value="${c?.units || 3}"></div>
        <div class="field"><label>Expected students</label><input id="fStu" type="number" min="1" value="${c?.expected_students || 30}"></div>
        <div class="field"><label>Sessions / week</label><input id="fSes" type="number" min="1" max="6" value="${c?.sessions_per_week || 2}"></div>
        <div class="field"><label>Minutes / session</label><input id="fDur" type="number" min="30" max="300" step="15" value="${c?.duration_min || 90}"></div></div>
        <div class="field"><label>Required equipment</label><div class="checks" id="fEquipment">${equipment.map(e => `<label><input type="checkbox" value="${e.id}" ${has(e.id) ? 'checked' : ''}> ${esc(e.name)}</label>`).join('')}</div></div>`,
      actions: [{ label: 'Cancel' }, {
        label: 'Save', onClick: async (close, btn) => {
          const body = {
            code: $('#fCode', m.el).value, name: $('#fName', m.el).value, units: $('#fUnits', m.el).value,
            expected_students: $('#fStu', m.el).value, sessions_per_week: $('#fSes', m.el).value, duration_min: $('#fDur', m.el).value,
            instructor_name: $('#fInstructor', m.el).value || null,
            equipment: $$('#fEquipment input:checked', m.el).map(i => +i.value), faculty_id: $('#fFac', m.el)?.value || null
          };
          btn.disabled = true;
          try { c ? await API.put('/courses/' + c.id, body) : await API.post('/courses', body); close(); toast('Course saved', 'success'); load(); }
          catch (e) { btn.disabled = false; const x = $('#err', m.el); x.textContent = e.message; x.classList.remove('hidden'); }
        }
      }]
    });
    const renderSuggestion = () => {
      const selected = instructors.find(i => i.name === $('#fInstructor', m.el).value);
      const box = $('#equipmentSuggestion', m.el);
      if (!selected) { box.innerHTML = ''; return; }
      const known = new Set(equipment.map(e => normalize(e.name)));
      const available = selected.equipment.filter(name => known.has(normalize(name)));
      const missing = selected.equipment.filter(name => !known.has(normalize(name)));
      box.innerHTML = `<div class="muted small"><b>Possible equipment for ${esc(selected.course)}:</b> ${selected.equipment.map(esc).join(', ')}.
        These are suggestions, not requirements. <button class="btn secondary sm" id="applySuggestions" type="button" ${available.length ? '' : 'disabled'}>Add ${available.length} available suggestions</button>
        ${missing.length ? `<div>Not in the equipment catalog yet: ${missing.map(esc).join(', ')}. Add these in Admin Panel → Equipment first.</div>` : ''}</div>`;
      $('#applySuggestions', m.el).onclick = () => {
        const suggested = new Set(selected.equipment.map(normalize));
        $$('#fEquipment input', m.el).forEach(input => {
          if (suggested.has(normalize(equipment.find(e => e.id === +input.value)?.name))) input.checked = true;
        });
        toast('Suggestions added. Review the required equipment before saving.', 'success');
      };
    };
    $('#fInstructor', m.el).onchange = renderSuggestion;
    $('#fName', m.el).onchange = () => {
      if ($('#fInstructor', m.el).value) return;
      const suggested = instructors.find(i => normalize(i.course) === normalize($('#fName', m.el).value));
      if (suggested) {
        $('#fInstructor', m.el).value = suggested.name;
        renderSuggestion();
      }
    };
    renderSuggestion();
  }

  $('#addBtn').onclick = () => form();
  $('#search').oninput = debounce(render);
  $('#mine').onchange = render;
  load();
});
