/* Scan a timetable photo (OCR runs in the browser with Tesseract.js), parse it into events, save to MySQL. */
document.addEventListener('DOMContentLoaded', () => {
  if (!Layout.ok) return;
  let rows = [], imgFile = null;

  /* ---------- Parsing ---------- */
  const DAY_RE = /\b(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)\b/gi;
  const DAY_MAP = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };
  const COMPACT = { MWF: ['Mon', 'Wed', 'Fri'], MW: ['Mon', 'Wed'], WF: ['Wed', 'Fri'], MF: ['Mon', 'Fri'], TTH: ['Tue', 'Thu'], TTHS: ['Tue', 'Thu', 'Sat'], TUTH: ['Tue', 'Thu'], MTWTHF: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], MTWTHFS: DAYS };
  const TIME_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i;

  function to24(h, m, ap, fallbackAp) {
    h = +h; m = +(m || 0);
    const a = (ap || fallbackAp || '').toLowerCase().replace(/\./g, '');
    if (a === 'pm' && h < 12) h += 12;
    if (a === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function parseText(text) {
    const out = [];
    text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(line => {
      const tm = line.match(TIME_RE);
      if (!tm) return;
      let [, h1, m1, a1, h2, m2, a2] = tm;
      // no am/pm written: school hours 1–6 mean afternoon
      if (!a1 && !a2) { if (+h1 >= 1 && +h1 <= 6) a1 = 'pm'; if (+h2 >= 1 && +h2 <= 7) a2 = 'pm'; }
      if (a2 && !a1) a1 = (+h1 > +h2 || +h1 === 12) && a2.toLowerCase().startsWith('p') ? 'am' : a2;
      let start = to24(h1, m1, a1, a2), end = to24(h2, m2, a2, a1);
      if (start >= end) return;
      let rest = line.replace(TIME_RE, ' ');
      let days = [];
      const named = rest.match(DAY_RE);
      if (named) { named.forEach(d => { const k = DAY_MAP[d.slice(0, 3).toLowerCase()]; if (k && !days.includes(k)) days.push(k); }); rest = rest.replace(DAY_RE, ' '); }
      else {
        const cm = rest.match(/\b(MTWThFS|MTWThF|TThS|TTh|TuTh|MWF|MW|WF|MF)\b/i);
        if (cm) { days = COMPACT[cm[1].toUpperCase()] || []; rest = rest.replace(cm[0], ' '); }
      }
      if (!days.length) return;
      let room = '';
      const rm = rest.match(/\b(?:room|rm)\.?\s*([A-Za-z0-9-]+)/i);
      if (rm) { room = rm[1]; rest = rest.replace(rm[0], ' '); }
      const title = rest.replace(/[|,;:_]+/g, ' ').replace(/\s{2,}/g, ' ').trim() || 'Class';
      days.forEach(d => out.push({ on: true, title, day: d, start_time: start, end_time: end, location: room }));
    });
    return out;
  }

  /* ---------- UI ---------- */
  function renderRows() {
    if (!rows.length) { $('#rows').innerHTML = '<div class="empty">No events yet. Read a picture, parse text, or add a row.</div>'; return; }
    $('#rows').innerHTML = `<table><thead><tr><th></th><th>Title</th><th>Day</th><th>Start</th><th>End</th><th>Room / place</th><th></th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr><td><input type="checkbox" data-k="on" data-i="${i}" ${r.on ? 'checked' : ''}></td>
        <td><input data-k="title" data-i="${i}" value="${esc(r.title)}"></td>
        <td><select data-k="day" data-i="${i}">${DAYS.map(d => `<option ${d === r.day ? 'selected' : ''}>${d}</option>`).join('')}</select></td>
        <td><input type="time" data-k="start_time" data-i="${i}" value="${r.start_time}"></td>
        <td><input type="time" data-k="end_time" data-i="${i}" value="${r.end_time}"></td>
        <td><input data-k="location" data-i="${i}" value="${esc(r.location)}"></td>
        <td><button class="btn danger sm" data-rm="${i}">✕</button></td></tr>`).join('')}</tbody></table>`;
    $$('#rows [data-k]').forEach(el => el.onchange = () => { rows[+el.dataset.i][el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; });
    $$('#rows [data-rm]').forEach(b => b.onclick = () => { rows.splice(+b.dataset.rm, 1); renderRows(); });
  }

  $('#file').onchange = e => {
    imgFile = e.target.files[0];
    if (!imgFile) return;
    $('#preview').src = URL.createObjectURL(imgFile); $('#preview').classList.remove('hidden');
    $('#readBtn').disabled = false; $('#status').textContent = '';
  };

  $('#readBtn').onclick = async () => {
    if (!imgFile) return;
    if (typeof Tesseract === 'undefined') return toast('The text-recognition library could not load. Check your internet connection, or paste the schedule text instead.', 'error');
    const btn = $('#readBtn'); btn.disabled = true;
    $('#prog').classList.remove('hidden'); $('#status').textContent = 'Reading… first run downloads language data';
    try {
      const res = await Tesseract.recognize(imgFile, 'eng', {
        logger: m => { if (m.status === 'recognizing text') { $('#prog div').style.width = Math.round(m.progress * 100) + '%'; $('#status').textContent = `Reading… ${Math.round(m.progress * 100)}%`; } }
      });
      $('#raw').value = res.data.text;
      rows = parseText(res.data.text);
      renderRows();
      $('#status').textContent = rows.length ? `Found ${rows.length} event(s)` : 'No schedule lines recognised. Edit the text and press Re-parse, or add rows manually.';
      toast(rows.length ? `Found ${rows.length} event(s)` : 'Could not find schedule lines', rows.length ? 'success' : 'error');
    } catch (e) { toast('Could not read the image: ' + e.message, 'error'); }
    btn.disabled = false; $('#prog').classList.add('hidden'); $('#prog div').style.width = '0';
  };

  $('#parseBtn').onclick = () => { rows = parseText($('#raw').value); renderRows(); toast(rows.length ? `Found ${rows.length} event(s)` : 'No schedule lines recognised', rows.length ? 'success' : 'error'); };
  $('#addRow').onclick = () => { rows.push({ on: true, title: '', day: todayKey() || 'Mon', start_time: '08:00', end_time: '09:30', location: '' }); renderRows(); };

  $('#saveBtn').onclick = async () => {
    const chosen = rows.filter(r => r.on);
    if (!chosen.length) return toast('Nothing selected to save', 'error');
    try {
      const r = await API.post('/events', { events: chosen.map(x => ({ title: x.title, day: x.day, start_time: x.start_time, end_time: x.end_time, location: x.location, source: 'scan' })) });
      toast(`${r.saved} event(s) saved to your calendar`, 'success');
      rows = rows.filter(x => !x.on); renderRows(); loadSaved();
    } catch (e) { toast(e.message, 'error'); }
  };

  async function loadSaved() {
    try {
      const list = await API.get('/events');
      $('#saved').innerHTML = list.length ? `<table><thead><tr><th>Title</th><th>Day</th><th>Time</th><th>Place</th><th>Source</th><th></th></tr></thead><tbody>
        ${list.map(e => `<tr><td><b>${esc(e.title)}</b></td><td>${DAY_FULL[e.day]}</td><td>${fmt12(e.start_time)} – ${fmt12(e.end_time)}</td><td>${esc(e.location || '—')}</td>
          <td>${e.source === 'scan' ? '<span class="chip">scanned</span>' : '<span class="chip">manual</span>'}</td><td class="actions"><button class="btn danger sm" data-del="${e.id}">Delete</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">No personal events saved yet.</div>';
      $$('#saved [data-del]').forEach(b => b.onclick = async () => { await API.del('/events/' + b.dataset.del); loadSaved(); });
    } catch (e) { $('#saved').innerHTML = `<div class="alert error">${esc(e.message)}</div>`; }
  }
  renderRows(); loadSaved();
});
