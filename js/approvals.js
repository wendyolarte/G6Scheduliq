document.addEventListener('DOMContentLoaded', () => {
  if (!Layout.ok) return;
  const u = API.user(), admin = u.role === 'admin';
  const tabs = admin ? ['pending', 'approved', 'rejected', 'draft'] : ['draft', 'pending', 'approved', 'rejected'];
  let tab = tabs[0], entries = [], flagged = new Set();

  $('#subtitle').textContent = admin
    ? 'Review submitted schedules. Approving checks for conflicts again, so nothing clashing goes live.'
    : 'Submit your drafts for admin review and track the status of each session.';
  $('#tabs').innerHTML = tabs.map(t => `<button class="tab" data-t="${t}">${t[0].toUpperCase() + t.slice(1)} <span class="chip" id="n_${t}">0</span></button>`).join('');
  $$('#tabs .tab').forEach(b => b.onclick = () => { tab = b.dataset.t; render(); });

  async function load() {
    $('#list').innerHTML = loadingHtml;
    try {
      const calls = [API.get(admin ? '/schedules?scope=campus' : '/schedules'), API.get('/schedules/conflicts')];
      const [e, c] = await Promise.all(calls);
      entries = e;
      flagged = new Set(c.filter(x => x.severity === 'high').flatMap(x => x.entryIds));
      render();
    } catch (ex) { $('#list').innerHTML = `<div class="alert error">${esc(ex.message)}</div>`; }
  }

  function render() {
    tabs.forEach(t => $('#n_' + t).textContent = entries.filter(e => e.status === t).length);
    $$('#tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.t === tab));
    const list = entries.filter(e => e.status === tab);
    const canAct = (admin && tab === 'pending') || (!admin && ['draft', 'rejected'].includes(tab));
    $('#bulk').innerHTML = canAct && list.length ? (admin
      ? `<button class="btn ok sm" id="approveBtn">✅ Approve selected</button><button class="btn danger sm" id="rejectBtn">✖ Reject selected</button><label class="small"><input type="checkbox" id="all"> Select all</label>`
      : `<button class="btn sm" id="submitBtn">📨 Submit selected for approval</button><label class="small"><input type="checkbox" id="all"> Select all</label>`) : '';
    if (!list.length) { $('#list').innerHTML = `<div class="empty">No ${tab} sessions.</div>`; return; }
    $('#list').innerHTML = `<table><thead><tr>${canAct ? '<th></th>' : ''}<th>Course</th><th>Instructor</th><th>Slot</th><th>Room</th><th>Check</th><th>Status</th></tr></thead><tbody>
      ${list.map(e => `<tr>${canAct ? `<td><input type="checkbox" class="sel" value="${e.id}"></td>` : ''}
        <td><b>${esc(e.code)}</b><div class="muted small">${esc(e.course_name)}</div></td><td>${esc(e.faculty_name || '—')}</td>
        <td>${DAY_FULL[e.day]}<div class="muted small">${fmt12(e.start_time)} – ${fmt12(e.end_time)}</div></td><td>${esc(e.room_name)}</td>
        <td>${flagged.has(e.id) ? '<span class="badge high">⚠ conflict</span>' : '<span class="badge approved">✓ clear</span>'}</td>
        <td>${badge(e.status)}${e.review_note ? `<div class="muted small">“${esc(e.review_note)}”</div>` : ''}</td></tr>`).join('')}</tbody></table>`;
    const picked = () => $$('.sel:checked').map(i => +i.value);
    if ($('#all')) $('#all').onchange = e => $$('.sel').forEach(i => i.checked = e.target.checked);

    if (admin && canAct) {
      $('#approveBtn').onclick = () => review('approve', picked());
      $('#rejectBtn').onclick = () => {
        const ids = picked(); if (!ids.length) return toast('Select sessions first', 'error');
        const m = modal({ title: 'Reject sessions', body: '<div class="field"><label>Reason for the faculty (optional)</label><textarea id="note" rows="3" placeholder="e.g. Please move away from lunch hour"></textarea></div>',
          actions: [{ label: 'Cancel' }, { label: 'Reject', cls: 'danger', onClick: c => { const n = $('#note', m.el).value; c(); review('reject', ids, n); } }] });
      };
    }
    if (!admin && canAct) $('#submitBtn').onclick = async () => {
      const ids = picked(); if (!ids.length) return toast('Select sessions first', 'error');
      try { const r = await API.post('/schedules/submit', { ids }); toast(`${r.submitted} session(s) submitted`, 'success'); tab = 'pending'; load(); }
      catch (e) { e.data?.conflicts ? modal({ title: 'Fix these conflicts first', body: conflictHtml(e.data.conflicts), wide: true, actions: [{ label: 'Close' }] }) : toast(e.message, 'error'); }
    };
  }

  async function review(action, ids, note) {
    if (!ids.length) return toast('Select sessions first', 'error');
    try { const r = await API.post('/schedules/review', { ids, action, note }); toast(`${r.updated} session(s) ${action}d`, 'success'); load(); }
    catch (e) { e.data?.conflicts ? modal({ title: 'Cannot approve', body: `<p>${esc(e.message)}</p>` + conflictHtml(e.data.conflicts), wide: true, actions: [{ label: 'Close' }] }) : toast(e.message, 'error'); }
  }
  load();
});
