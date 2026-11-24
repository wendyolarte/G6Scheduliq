document.addEventListener('DOMContentLoaded', async () => {
  if (!Layout.ok) return;
  const u = API.user(), admin = u.role === 'admin';
  let rooms = [], equipment = [], buildings = [], roomTypes = [];
  if (!admin) $('#addRoom').classList.add('hidden');

  // sensible defaults: today (or Monday on Sunday), next whole hour, 90 minutes
  const now = new Date(), startH = Math.min(18, Math.max(7, now.getHours() + 1));
  $('#aDay').innerHTML = DAYS.map(d => `<option value="${d}">${DAY_FULL[d]}</option>`).join('');
  $('#aDay').value = todayKey() || 'Mon';
  $('#aStart').value = `${String(startH).padStart(2, '0')}:00`;
  $('#aEnd').value = toHHMM(startH * 60 + 90);

  async function load() {
    try {
      const [roomList, equipmentList, directory] = await Promise.all([
        API.get('/rooms'), API.get('/rooms/equipment'), API.get('/rooms/buildings')
      ]);
      rooms = roomList;
      equipment = equipmentList;
      buildings = directory.buildings;
      roomTypes = directory.roomTypes;
      $('#aEquip').innerHTML = equipment.map(e => `<label><input type="checkbox" value="${e.id}"> ${esc(e.name)}</label>`).join('');
      $('#tRoom').innerHTML = '<option value="">Select a room…</option>' + rooms.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
      renderRooms();
    } catch (e) { $('#roomList').innerHTML = `<div class="alert error">${esc(e.message)}</div>`; }
  }

  function renderRooms() {
    $('#roomList').innerHTML = `<table><thead><tr><th>Room</th><th>Building</th><th>Floor</th><th>Type</th><th>Capacity</th><th>Equipment</th><th>Status</th>${admin ? '<th></th>' : ''}</tr></thead><tbody>
      ${rooms.map(r => `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.building || '—')}</td><td>${esc(r.floor || '—')}</td>
        <td>${esc(r.room_type || 'Classroom')}${r.is_sample ? ' <span class="chip">Sample</span>' : ''}</td><td>${r.capacity}</td>
        <td>${r.equipment.map(e => `<span class="chip">${esc(e.name)}</span>`).join('') || '<span class="muted small">none</span>'}</td>
        <td>${badge(r.is_available ? 'active' : 'inactive').replace('>active<', '>Available<').replace('>inactive<', '>Unavailable<')}</td>
        ${admin ? `<td class="actions"><button class="btn secondary sm" data-edit="${r.id}">Edit</button> <button class="btn danger sm" data-del="${r.id}">Delete</button></td>` : ''}</tr>`).join('')}</tbody></table>`;
    $$('[data-edit]').forEach(b => b.onclick = () => form(rooms.find(r => r.id === +b.dataset.edit)));
    $$('[data-del]').forEach(b => b.onclick = async () => {
      if (!(await confirmBox('Delete this room?', 'Delete'))) return;
      try { await API.del('/rooms/' + b.dataset.del); toast('Room deleted', 'success'); load(); } catch (e) { toast(e.message, 'error'); }
    });
  }

  $('#checkBtn').onclick = async () => {
    const p = new URLSearchParams({ day: $('#aDay').value, start: $('#aStart').value, end: $('#aEnd').value, capacity: $('#aCap').value || 0, equipment: $$('#aEquip input:checked').map(i => i.value).join(',') });
    $('#results').innerHTML = loadingHtml;
    try {
      const list = await API.get('/rooms/availability?' + p);
      const free = list.filter(r => r.status === 'free').length;
      $('#results').innerHTML = `<p><b>${free}</b> of ${list.length} rooms are available on ${DAY_FULL[$('#aDay').value]} ${fmt12($('#aStart').value)} – ${fmt12($('#aEnd').value)}.</p>
        <div class="auto-grid">${list.map(r => `<div class="room-card ${r.status}"><div class="list-item" style="border:0;padding:0"><b>${esc(r.name)}</b>${badge(r.status)}</div>
          <div class="muted small">${esc(r.building || '')}${r.floor ? ` · ${esc(r.floor)}` : ''} · ${r.capacity} seats</div>
          <div style="margin:.4rem 0">${r.equipment.map(e => `<span class="chip">${esc(e)}</span>`).join('')}</div>
          <div class="small">${esc(r.reason)}</div></div>`).join('')}</div>`;
    } catch (e) { $('#results').innerHTML = `<div class="alert error">${esc(e.message)}</div>`; }
  };

  $('#tRoom').onchange = async () => {
    const id = $('#tRoom').value;
    if (!id) { $('#roomTT').innerHTML = '<div class="empty">Choose a room to see when it is used.</div>'; return; }
    try { renderTimetable($('#roomTT'), await API.get(`/schedules?scope=campus&room_id=${id}`), { showEmpty: true }); }
    catch (e) { $('#roomTT').innerHTML = `<div class="alert error">${esc(e.message)}</div>`; }
  };

  function form(r) {
    const has = id => r && r.equipment.some(e => e.id === id);
    const m = modal({
      title: r ? 'Edit room' : 'Add room',
      body: `<div id="err" class="alert error hidden"></div>
        <div class="row">
          <div class="field"><label>Room name</label><input id="rName" value="${esc(r?.name || '')}" placeholder="R101"></div>
          <div class="field"><label>Building</label><input id="rBld" list="campusBuildings" value="${esc(r?.building || '')}"><datalist id="campusBuildings">
            ${buildings.map(building => `<option value="${esc(building.name)}" label="Building ${building.number}"></option>`).join('')}
          </datalist></div>
          <div class="field"><label>Floor</label><input id="rFloor" value="${esc(r?.floor || '')}" placeholder="Ground Floor"></div>
        </div>
        <div class="row">
          <div class="field"><label>Room type</label><select id="rType">${roomTypes.map(type => `<option value="${esc(type)}" ${type === (r?.room_type || 'Classroom') ? 'selected' : ''}>${esc(type)}</option>`).join('')}</select></div>
          <div class="field"><label>Capacity</label><input id="rCap" type="number" min="1" value="${r?.capacity || 30}"></div>
        </div>
        <div class="field"><label class="lbl"><input type="checkbox" id="rAvail" ${!r || r.is_available ? 'checked' : ''}> Available for scheduling</label></div>
        <div class="field"><label class="lbl"><input type="checkbox" id="rSample" ${r?.is_sample ? 'checked' : ''}> This is illustrative sample data and has not been verified</label>
          <p class="muted small">Sample rooms are kept unavailable for scheduling until verified.</p></div>
        <div class="field"><label>Equipment in this room</label><div class="checks">${equipment.map(e => `<label><input type="checkbox" value="${e.id}" ${has(e.id) ? 'checked' : ''}> ${esc(e.name)}</label>`).join('')}</div></div>`,
      actions: [{ label: 'Cancel' }, {
        label: 'Save', onClick: async (close, btn) => {
          const body = {
            name: $('#rName', m.el).value,
            building: $('#rBld', m.el).value,
            floor: $('#rFloor', m.el).value,
            room_type: $('#rType', m.el).value,
            capacity: +$('#rCap', m.el).value,
            is_available: $('#rAvail', m.el).checked,
            is_sample: $('#rSample', m.el).checked,
            equipment: $$('.checks input:checked', m.el).map(i => +i.value)
          };
          btn.disabled = true;
          try { r ? await API.put('/rooms/' + r.id, body) : await API.post('/rooms', body); close(); toast('Room saved', 'success'); load(); }
          catch (e) { btn.disabled = false; const x = $('#err', m.el); x.textContent = e.message; x.classList.remove('hidden'); }
        }
      }]
    });
    const sampleCheckbox = $('#rSample', m.el), availabilityCheckbox = $('#rAvail', m.el);
    const updateSampleState = () => {
      if (sampleCheckbox.checked) availabilityCheckbox.checked = false;
      availabilityCheckbox.disabled = sampleCheckbox.checked;
    };
    sampleCheckbox.onchange = updateSampleState;
    updateSampleState();
  }
  $('#addRoom').onclick = () => form();
  load();
});
