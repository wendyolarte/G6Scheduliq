document.addEventListener('DOMContentLoaded', () => {
  if (!Layout.ok) return;
  const me = API.user();
  const ROLE = { student: 'Student', faculty: 'Faculty/Staff', admin: 'Admin' };

  $$('#tabs .tab').forEach(b => b.onclick = () => {
    $$('#tabs .tab').forEach(x => x.classList.toggle('active', x === b));
    ['overview', 'users', 'directory', 'equipment'].forEach(s => $('#' + s).classList.toggle('hidden', s !== b.dataset.t));
    if (b.dataset.t === 'users') loadUsers();
    if (b.dataset.t === 'directory') loadDirectory();
    if (b.dataset.t === 'equipment') loadEquipment();
  });

  /* ---- Overview ---- */
  async function overview() {
    try {
      const s = await API.get('/admin/stats');
      const st = (n, l, c = '') => `<div class="stat ${c}"><div class="num">${n}</div><div class="lab">${l}</div></div>`;
      $('#overview').innerHTML = `
        <div class="grid cols-4" style="margin-bottom:1.25rem">
          ${st(s.users.total, 'Total users')}${st(s.users.students, 'Students')}${st(s.users.faculty, 'Faculty/Staff')}${st(s.users.admins, 'Admins')}
          ${st(s.rooms.total, 'Rooms (' + s.rooms.available + ' available)')}${st(s.courses, 'Courses')}
          ${st(s.schedules.pending, 'Pending approvals', s.schedules.pending ? 'warn' : '')}${st(s.conflicts, 'Active conflicts', s.conflicts ? 'bad' : 'ok')}
        </div>
        <div class="grid cols-2">
          <div class="card"><h2>Schedule status</h2>${['approved', 'pending', 'draft', 'rejected'].map(k => `<div class="list-item"><span>${badge(k)}</span><b>${s.schedules[k]}</b></div>`).join('')}
            <div class="toolbar" style="margin-top:1rem"><a class="btn sm" href="approvals.html">Review approvals</a><a class="btn secondary sm" href="conflicts.html">View conflicts</a></div></div>
          <div class="card"><h2>Newest users</h2>${s.recent.map(r => `<div class="list-item"><div><b>${esc(r.name)}</b><div class="muted small">${esc(r.email)}</div></div><span class="chip">${ROLE[r.role]}</span></div>`).join('')}</div>
        </div>`;
    } catch (e) { $('#overview').innerHTML = `<div class="alert error">${esc(e.message)}</div>`; }
  }

  /* ---- Users ---- */
  let users = [];
  async function loadUsers() {
    try {
      users = await API.get('/admin/users?q=' + encodeURIComponent($('#uSearch').value));
      $('#uList').innerHTML = `<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
        ${users.map(x => `<tr><td><b>${esc(x.name)}</b><div class="muted small">${esc(x.department || '')}</div></td><td>${esc(x.email)}</td>
          <td><select data-role="${x.id}" ${x.id === me.id ? 'disabled' : ''}>${Object.entries(ROLE).map(([k, v]) => `<option value="${k}" ${x.role === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
          <td>${x.is_active ? badge('active') : badge('inactive')}</td>
          <td class="actions"><button class="btn secondary sm" data-pw="${x.id}">Reset password</button>
            ${x.id === me.id ? '' : `<button class="btn secondary sm" data-toggle="${x.id}">${x.is_active ? 'Deactivate' : 'Activate'}</button> <button class="btn danger sm" data-del="${x.id}">Delete</button>`}</td></tr>`).join('')}</tbody></table>`;
      $$('[data-role]').forEach(s => s.onchange = () => run(() => API.put('/admin/users/' + s.dataset.role, { role: s.value }), 'Role updated'));
      $$('[data-toggle]').forEach(b => b.onclick = () => { const x = users.find(u => u.id === +b.dataset.toggle); run(() => API.put('/admin/users/' + x.id, { is_active: !x.is_active }), x.is_active ? 'Account deactivated' : 'Account activated'); });
      $$('[data-del]').forEach(b => b.onclick = async () => { if (await confirmBox('Delete this user permanently?', 'Delete')) run(() => API.del('/admin/users/' + b.dataset.del), 'User deleted'); });
      $$('[data-pw]').forEach(b => b.onclick = () => resetPw(+b.dataset.pw));
    } catch (e) { $('#uList').innerHTML = `<div class="alert error">${esc(e.message)}</div>`; }
  }
  async function run(fn, msg) { try { await fn(); toast(msg, 'success'); loadUsers(); overview(); } catch (e) { toast(e.message, 'error'); loadUsers(); } }

  function resetPw(id) {
    const m = modal({ title: 'Reset password', body: '<div class="field"><label>New password (min. 8 characters)</label><input id="np" type="text"></div>',
      actions: [{ label: 'Cancel' }, { label: 'Reset', onClick: c => { const p = $('#np', m.el).value; c(); run(() => API.put('/admin/users/' + id, { password: p }), 'Password reset'); } }] });
  }

  $('#addUser').onclick = () => {
    const m = modal({
      title: 'Add user',
      body: `<div id="err" class="alert error hidden"></div>
        <div class="field"><label>Full name</label><input id="aName"></div><div class="field"><label>Email</label><input id="aEmail" type="email"></div>
        <div class="row"><div class="field"><label>Role</label><select id="aRole"><option value="student">Student</option><option value="faculty">Faculty/Staff</option><option value="admin">Admin</option></select></div>
        <div class="field"><label>Department</label><input id="aDept"></div></div>
        <div class="field"><label>Temporary password</label><input id="aPw" type="text" placeholder="At least 8 characters"></div>`,
      actions: [{ label: 'Cancel' }, {
        label: 'Create', onClick: async (close, btn) => {
          btn.disabled = true;
          try { await API.post('/admin/users', { name: $('#aName', m.el).value, email: $('#aEmail', m.el).value, role: $('#aRole', m.el).value, department: $('#aDept', m.el).value, password: $('#aPw', m.el).value }); close(); toast('User created', 'success'); loadUsers(); overview(); }
          catch (e) { btn.disabled = false; const x = $('#err', m.el); x.textContent = e.message; x.classList.remove('hidden'); }
        }
      }]
    });
  };
  $('#uSearch').oninput = debounce(loadUsers);

  /* ---- Equipment ---- */
  async function loadEquipment() {
    try {
      const list = await API.get('/rooms/equipment');
      $('#eqList').innerHTML = list.length ? list.map(e => `<div class="list-item"><span>🔧 ${esc(e.name)}</span><button class="btn danger sm" data-eq="${e.id}">Remove</button></div>`).join('') : '<div class="empty">No equipment yet.</div>';
      $$('[data-eq]').forEach(b => b.onclick = async () => { if (await confirmBox('Remove this equipment from all rooms and courses?', 'Remove')) { try { await API.del('/rooms/equipment/' + b.dataset.eq); loadEquipment(); } catch (e) { toast(e.message, 'error'); } } });
    } catch (e) { $('#eqList').innerHTML = `<div class="alert error">${esc(e.message)}</div>`; }
  }
  $('#eqAdd').onclick = async () => {
    const name = $('#eqName').value.trim(); if (!name) return;
    try { await API.post('/rooms/equipment', { name }); $('#eqName').value = ''; toast('Equipment added', 'success'); loadEquipment(); } catch (e) { toast(e.message, 'error'); }
  };

  let directory = [], equipmentCatalog = [];
  async function loadDirectory() {
    try {
      [directory, equipmentCatalog] = await Promise.all([API.get('/courses/instructors'), API.get('/rooms/equipment')]);
      $('#directoryList').innerHTML = `<table><thead><tr><th>Instructor</th><th>Course</th><th>Possible equipment</th></tr></thead><tbody>
        ${directory.map(x => `<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.course)}</td>
          <td>${x.equipment.map(name => `<span class="chip">${esc(name)}</span>`).join('')}</td></tr>`).join('')}</tbody></table>`;
      const suggested = [...new Set(directory.flatMap(x => x.equipment))];
      const existing = new Set(equipmentCatalog.map(x => x.name.toLocaleLowerCase()));
      const missing = suggested.filter(name => !existing.has(name.toLocaleLowerCase()));
      const addButton = $('#addSuggestedEquipment');
      addButton.disabled = !missing.length;
      addButton.textContent = missing.length ? `Add ${missing.length} suggested equipment items to catalog` : 'All suggested equipment is in the catalog';
      addButton.onclick = async () => {
        try {
          for (const name of missing) await API.post('/rooms/equipment', { name });
          toast(`${missing.length} equipment items added`, 'success');
          loadDirectory();
          loadEquipment();
        } catch (e) { toast(e.message, 'error'); }
      };
    } catch (e) { $('#directoryList').innerHTML = `<div class="alert error">${esc(e.message)}</div>`; }
  }

  overview();
});
