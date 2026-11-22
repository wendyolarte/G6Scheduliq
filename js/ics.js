/* Calendar helpers: .ics files and Google Calendar links (no API keys needed) */
const Cal = {
  tz: () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Manila',
  pad: n => String(n).padStart(2, '0'),
  stamp(d, t) { const [h, m] = t.split(':'); return `${d.getFullYear()}${Cal.pad(d.getMonth() + 1)}${Cal.pad(d.getDate())}T${Cal.pad(h)}${Cal.pad(m)}00`; },
  // first date on/after startDate that falls on the given weekday (Mon..Sat)
  firstDate(startDate, day) {
    const target = DAYS.indexOf(day) + 1, d = new Date(startDate + 'T00:00:00');
    while (d.getDay() !== target) d.setDate(d.getDate() + 1);
    return d;
  },
  text: s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'),
  details(item) {
    return [item.description, item.zoom_link ? 'Zoom: ' + item.zoom_link : '', item.classroom_link ? 'Google Classroom: ' + item.classroom_link : ''].filter(Boolean).join('\n');
  },
  googleLink(item, startDate, weeks) {
    const d = Cal.firstDate(startDate, item.day);
    const p = new URLSearchParams({
      action: 'TEMPLATE', text: item.title, ctz: Cal.tz(),
      dates: `${Cal.stamp(d, item.start_time)}/${Cal.stamp(d, item.end_time)}`,
      details: Cal.details(item), location: item.location || ''
    });
    if (weeks > 1) p.set('recur', `RRULE:FREQ=WEEKLY;COUNT=${weeks}`);
    return 'https://calendar.google.com/calendar/render?' + p.toString();
  },
  ics(items, startDate, weeks) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Smart Class Scheduler//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    items.forEach((it, i) => {
      const d = Cal.firstDate(startDate, it.day);
      lines.push('BEGIN:VEVENT', `UID:${Date.now()}-${i}@smart-class-scheduler`, `DTSTAMP:${Cal.stamp(new Date(), '00:00')}Z`,
        `DTSTART;TZID=${Cal.tz()}:${Cal.stamp(d, it.start_time)}`, `DTEND;TZID=${Cal.tz()}:${Cal.stamp(d, it.end_time)}`,
        `SUMMARY:${Cal.text(it.title)}`, `LOCATION:${Cal.text(it.location || '')}`, `DESCRIPTION:${Cal.text(Cal.details(it))}`);
      if (weeks > 1) lines.push(`RRULE:FREQ=WEEKLY;COUNT=${weeks}`);
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }
};