/* Shared UI helpers: DOM, toasts, modals, timetable renderer */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toMin = t => { const [h, m] = String(t).split(':'); return (+h) * 60 + (+m || 0); };
const toHHMM = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const todayKey = () => { const d = new Date().getDay(); return d === 0 ? null : DAYS[d - 1]; };
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function fmt12(t) {
  const [h, m] = String(t).split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
const badge = s => `<span class="badge ${esc(s)}">${esc(String(s).replace('_', ' '))}</span>`;
const courseColor = id => `hsl(${(Number(id) * 67) % 360} 62% 42%)`;
const loadingHtml = '<div class="empty"><span class="spinner"></span></div>';

function toast(msg, type = 'info') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.textContent = msg; box.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

/* modal({title, body (html), actions:[{label, cls, onClick(close)}], wide}) -> {el, close} */
function modal({ title, body, actions = [], wide = false }) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-h"><h3>${esc(title)}</h3><button class="modal-x" aria-label="Close">&times;</button></div>
    <div class="modal-b">${body}</div><div class="modal-f"></div></div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  $('.modal-x', ov).onclick = close;
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  const foot = $('.modal-f', ov);
  if (!actions.length) foot.remove();
  actions.forEach(a => {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.cls || 'secondary'); b.textContent = a.label;
    b.onclick = () => (a.onClick ? a.onClick(close, b) : close());
    foot.appendChild(b);
  });
  const first = $('input,select,textarea', ov); if (first) first.focus();
  return { el: ov, close };
}

function confirmBox(message, okLabel = 'Confirm', cls = 'danger') {
  return new Promise(resolve => {
    const m = modal({
      title: 'Please confirm', body: `<p>${esc(message)}</p>`,
      actions: [
        { label: 'Cancel', onClick: c => { c(); resolve(false); } },
        { label: okLabel, cls, onClick: c => { c(); resolve(true); } }
      ]
    });
    $('.modal-x', m.el).addEventListener('click', () => resolve(false));
  });
}

const conflictHtml = list => !list || !list.length ? '' :
  `<ul class="cflist">${list.map(c => `<li class="${esc(c.severity)}"><b>${c.severity === 'high' ? '⛔' : '⚠️'}</b> ${esc(c.message)}</li>`).join('')}</ul>`;

function download(filename, text, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* Weekly timetable. entries: {day,start_time,end_time,code|title,room_name|location,course_id,status,personal}
   opts: {days, startHour, endHour, onClick(entry)} */
function renderTimetable(el, entries, opts = {}) {
  const days = opts.days || DAYS, sh = opts.startHour ?? 7, eh = opts.endHour ?? 20, H = 48;
  if (!entries.length && !opts.showEmpty) { el.innerHTML = '<div class="empty">No sessions to show yet.</div>'; return; }
  const hours = Array.from({ length: eh - sh }, (_, i) => `<div>${fmt12(`${sh + i}:00`).replace(':00', '')}</div>`).join('');
  const cols = days.map(d => {
    const list = entries.filter(e => e.day === d).map(e => ({ e, s: toMin(e.start_time), f: toMin(e.end_time) })).sort((a, b) => a.s - b.s);
    const ends = [], placed = [];
    list.forEach(x => {
      let i = ends.findIndex(v => v <= x.s);
      if (i < 0) { i = ends.length; ends.push(0); }
      ends[i] = x.f; placed.push({ ...x, lane: i });
    });
    const n = Math.max(1, ends.length);
    const evs = placed.map(x => {
      const e = x.e, top = (x.s - sh * 60) / 60 * H, h = Math.max(22, (x.f - x.s) / 60 * H - 2);
      const color = e.personal ? 'hsl(200 65% 38%)' : courseColor(e.course_id);
      const idx = entries.indexOf(e);
      return `<div class="tt-ev ${esc(e.status || '')} ${e.personal ? 'personal' : ''}" data-i="${idx}" ${opts.onClick ? 'data-click="1"' : ''}
        style="top:${top}px;height:${h}px;left:calc(${x.lane} * 100% / ${n} + 2px);width:calc(100% / ${n} - 4px);background:${color}"
        title="${esc(e.code || e.title)} ${esc(e.start_time)}–${esc(e.end_time)}">
        <b>${esc(e.code || e.title)}</b>${esc(e.room_name || e.location || '')}<br>${fmt12(e.start_time)}</div>`;
    }).join('');
    return `<div class="tt-col" style="height:${(eh - sh) * H}px">${evs}</div>`;
  }).join('');
  el.innerHTML = `<div class="tt"><div class="tt-inner" style="--cols:${days.length}">
    <div class="tt-head"><div></div>${days.map(d => `<div>${d}</div>`).join('')}</div>
    <div class="tt-body"><div class="tt-hours">${hours}</div>${cols}</div></div></div>`;
  if (opts.onClick) $$('.tt-ev', el).forEach(n => n.onclick = () => opts.onClick(entries[+n.dataset.i]));
}
