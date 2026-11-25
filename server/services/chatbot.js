/**
 * Rule-based assistant that answers from the live database:
 * your schedule, free rooms, room capacity/equipment, conflicts, approvals, course info,
 * and how-to help for every feature.
 */
const pool = require('../config/db');
const { loadContext, loadEntries, entriesForUser } = require('./data');
const S = require('./scheduler');

const R = (text, suggestions = []) => ({ reply: text, suggestions });
const pad = n => String(n).padStart(2, '0');
const JS_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
const DAY_WORDS = {
  monday: 'Mon', mon: 'Mon', tuesday: 'Tue', tues: 'Tue', tue: 'Tue', wednesday: 'Wed', wed: 'Wed',
  thursday: 'Thu', thurs: 'Thu', thur: 'Thu', thu: 'Thu', friday: 'Fri', fri: 'Fri', saturday: 'Sat', sat: 'Sat'
};

function parseDay(t) {
  if (/\btoday\b/.test(t)) return { day: JS_DAYS[new Date().getDay()], label: 'today' };
  if (/\btomorrow\b/.test(t)) return { day: JS_DAYS[(new Date().getDay() + 1) % 7], label: 'tomorrow' };
  for (const k of Object.keys(DAY_WORDS)) if (new RegExp(`\\b${k}\\b`).test(t)) return { day: DAY_WORDS[k], label: FULL[DAY_WORDS[k]] };
  return null;
}

function parseTime(t) {
  let m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (m) { let h = (+m[1]) % 12; if (m[3] === 'pm') h += 12; return `${pad(h)}:${m[2] || '00'}`; }
  m = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m) return `${pad(+m[1])}:${m[2]}`;
  m = t.match(/\bat (\d{1,2})\b/);
  if (m) { let h = +m[1]; if (h < 7) h += 12; return `${pad(h)}:00`; }
  return null;
}

const addMin = (t, mins) => S.toHHMM(Math.min(23 * 60 + 59, S.toMin(t) + mins));
const line = e => `• ${e.day} ${e.start_time}–${e.end_time}  ${e.code} (${e.room_name})`;
const needSignIn = () => R('Please sign in first so I can look up your personal schedule. You can log in from the Login page.', ['How do I sign up?']);

function detectLanguage(message) {
  if (/[\uAC00-\uD7AF]/.test(message)) return 'ko';
  const text = message.toLowerCase();
  if (/\b(hola|gracias|por favor|hoy|mañana|salas?|horario|clases?|programación|aprobaciones?|iniciar sesión|registrarse|cuarto|cuartos)\b/.test(text) ||
      /¿|á|é|í|ó|ú|ñ/.test(text)) return 'es';
  if (/\b(maayong|kumusta|unsa|asa|kanus-a|karon|ugma|klase|klases|kwarto|kwartos|room|sulod|schedule|plano|nganong|pila|pwede|ako)\b/.test(text) ||
      /\b(salon|akong|imong|unsaon|magparehistro|mag-login)\b/.test(text)) return 'ceb';
  return 'en';
}

function normalizeMultilingualMessage(message) {
  let text = message.toLowerCase();
  const replacements = [
    // Korean
    [/안녕하세요|안녕|하이/g, 'hello'], [/도와줘|도와주세요/g, 'help'],
    [/내 일정|내 수업|내 강의|오늘 수업|시간표/g, 'my schedule'],
    [/내일/g, 'tomorrow'], [/오늘/g, 'today'], [/다음/g, 'next'],
    [/빈 강의실|사용 가능한 강의실|강의실 찾기/g, 'free rooms'],
    [/충돌|겹침|이중 예약/g, 'conflicts'], [/승인|대기 중|검토/g, 'approvals'],
    [/가입|회원 가입|계정 만들기/g, 'sign up'], [/로그인|비밀번호/g, 'log in'],
    [/일정 생성|스케줄 만들기|자동 생성/g, 'generate schedule'],
    [/강의실|교실|실/g, 'rooms'], [/용량|인원/g, 'capacity'],
    [/프로젝터/g, 'projector'], [/스캔|사진|ocr/g, 'scan timetable'],
    [/동기화|캘린더/g, 'sync calendar'], [/기능/g, 'features'],
    // Spanish
    [/hola|buenos días|buenas tardes|buenas noches/g, 'hello'], [/ayuda/g, 'help'],
    [/¿?qué puedes hacer|que puedes hacer/g, 'what can you do'],
    [/mi horario|mis clases|mi agenda/g, 'my schedule'], [/hoy/g, 'today'], [/mañana/g, 'tomorrow'],
    [/siguientes?|próxim(?:a|o)/g, 'next'],
    [/salas?|aulas?|cuartos?|cuarto/g, 'rooms'], [/libres?|disponibles?|vacías?/g, 'free'],
    [/conflictos?|choques?|traslapes?/g, 'conflicts'], [/aprobaciones?|pendientes?|revisión/g, 'approvals'],
    [/registrarme|crear (una )?cuenta|inscribirme/g, 'sign up'], [/iniciar sesión|entrar|contraseña/g, 'log in'],
    [/generar horario|crear horario|generador automático/g, 'generate schedule'],
    [/capacidad|asientos/g, 'capacity'], [/proyector/g, 'projector'],
    [/escane(ar|a) horario|foto|imagen/g, 'scan timetable'], [/sincronizar|google calendar|calendario/g, 'sync calendar'],
    [/funciones?|características/g, 'features'],
    // Bisaya/Cebuano
    [/maayong adlaw|maayong buntag|maayong gabii|kumusta/g, 'hello'], [/tabang|buligi ko/g, 'help'],
    [/unsa ang akong iskedyul|akong schedule|akong klase|akong mga klase/g, 'my schedule'],
    [/karon/g, 'today'], [/ugma/g, 'tomorrow'], [/sunod/g, 'next'],
    [/libre nga kwarto|libre nga lawak|available nga kwarto|wala’y klase/g, 'free rooms'],
    [/salas?|kwarto|klasehanan/g, 'rooms'], [/libr[eé]|walay gamit/g, 'free'],
    [/conflict|bangga|conflicto/g, 'conflicts'], [/approval|pendente|pagsusi/g, 'approvals'],
    [/magparehistro|mugna ug account|mag-sign up/g, 'sign up'],
    [/mag-login|pagsulod|password/g, 'log in'],
    [/mugna ug schedule|generate schedule|automatic schedule/g, 'generate schedule'],
    [/kapasidad|lingkoranan/g, 'capacity'], [/proyektor/g, 'projector'],
    [/scan ang timetable|i-scan|hulagway/g, 'scan timetable'],
    [/sync|google calendar|kalendaryo/g, 'sync calendar'], [/features|unsa ang mahimo/g, 'features']
  ];
  replacements.forEach(([pattern, replacement]) => { text = text.replace(pattern, replacement); });
  text = text.replace(/\\b(\d{1,2})\\s*(?:ora|oras|시)\\b/g, '$1');
  text = text.replace(/a las?/g, 'at');
  text = text.replace(/de la mañana/g, 'am').replace(/de la tarde|de la noche/g, 'pm');
  text = text.replace(/lun(?:es)?/g, 'monday').replace(/mar(?:tes)?/g, 'tuesday')
    .replace(/mié(?:rcoles)?/g, 'wednesday').replace(/mie(?:rcoles)?/g, 'wednesday')
    .replace(/jue(?:ves)?/g, 'thursday').replace(/vie(?:rnes)?/g, 'friday')
    .replace(/sáb(?:ado)?/g, 'saturday').replace(/sab(?:ado)?/g, 'saturday');
  return text.replace(/\s+/g, ' ').trim();
}

const STATIC_TRANSLATIONS = {
  ko: {
    'Hi! I can help with schedules, rooms, account setup, and app features. What would you like to know?': '안녕하세요! 일정, 강의실, 계정 설정 및 앱 기능을 도와드릴 수 있습니다. 무엇을 알고 싶으신가요?',
    'Hi! I can look up schedules, find free rooms, check room capacity and equipment, report conflicts, show approval status and guide you through every feature. What would you like to do?': '안녕하세요! 일정 조회, 빈 강의실 찾기, 강의실 수용 인원 및 장비 확인, 충돌 보고, 승인 상태 확인, 그리고 모든 기능 안내를 도와드릴 수 있습니다. 무엇을 도와드릴까요?',
    'Please sign in first so I can look up your personal schedule. You can log in from the Login page.': '개인 일정 조회를 위해 먼저 로그인해 주세요. 로그인 페이지에서 로그인할 수 있습니다.',
    "I'm not sure I understood that. I can help with your schedule, free rooms, room capacity/equipment, conflicts, approvals, course info, syncing and scanning.": '잘 이해하지 못했습니다. 일정, 빈 강의실, 강의실 수용 인원/장비, 충돌, 승인, 과목 정보, 동기화 및 스캔을 도와드릴 수 있습니다.',
    'Good news – no schedule conflicts found.': '좋은 소식입니다. 일정 충돌이 발견되지 않았습니다.',
    'No rooms match those requirements.': '해당 조건에 맞는 강의실이 없습니다.',
    'The Smart Class Scheduler offers scheduling information management, automatic schedule generation, constraint optimisation, classroom availability, capacity and equipment checks, conflict detection, alternative suggestions, schedule viewing/management and an approval workflow, plus Google Calendar/Zoom/Classroom sync and timetable scanning.': 'Smart Class Scheduler는 일정 관리, 자동 일정 생성, 제약 조건 최적화, 강의실 가용성, 수용 인원 및 장비 확인, 충돌 감지, 대안 제안, 일정 조회/관리와 승인 절차를 제공합니다. 또한 Google Calendar, Zoom, Google Classroom 동기화와 시간표 스캔도 지원합니다.'
  },
  es: {
    'Hi! I can help with schedules, rooms, account setup, and app features. What would you like to know?': '¡Hola! Puedo ayudarte con horarios, aulas, configuración de cuentas y funciones de la aplicación. ¿Qué deseas saber?',
    'Hi! I can look up schedules, find free rooms, check room capacity and equipment, report conflicts, show approval status and guide you through every feature. What would you like to do?': '¡Hola! Puedo consultar horarios, encontrar aulas libres, verificar capacidad y equipos, informar conflictos, mostrar estados de aprobación y guiarte por todas las funciones. ¿Qué deseas hacer?',
    'Please sign in first so I can look up your personal schedule. You can log in from the Login page.': 'Inicia sesión primero para consultar tu horario personal. Puedes hacerlo desde la página de inicio de sesión.',
    "I'm not sure I understood that. I can help with your schedule, free rooms, room capacity/equipment, conflicts, approvals, course info, syncing and scanning.": 'No estoy seguro de haber entendido. Puedo ayudarte con tu horario, aulas disponibles, capacidad o equipo de aulas, conflictos, aprobaciones, información de cursos, sincronización y escaneo.',
    'Good news – no schedule conflicts found.': 'Buenas noticias: no se encontraron conflictos de horario.',
    'No rooms match those requirements.': 'No hay aulas que cumplan esos requisitos.',
    'The Smart Class Scheduler offers scheduling information management, automatic schedule generation, constraint optimisation, classroom availability, capacity and equipment checks, conflict detection, alternative suggestions, schedule viewing/management and an approval workflow, plus Google Calendar/Zoom/Classroom sync and timetable scanning.': 'Smart Class Scheduler ofrece gestión de horarios, generación automática, optimización de restricciones, disponibilidad de aulas, comprobación de capacidad y equipos, detección de conflictos, sugerencias alternativas, consulta y administración de horarios, aprobación y sincronización con Google Calendar, Zoom y Google Classroom, además de escaneo de horarios.'
  },
  ceb: {
    'Hi! I can help with schedules, rooms, account setup, and app features. What would you like to know?': 'Maayong adlaw! Motabang ako sa imong schedule, kwarto, account, ug mga feature sa app. Unsa ang imong gusto nga mahibal-an?',
    'Hi! I can look up schedules, find free rooms, check room capacity and equipment, report conflicts, show approval status and guide you through every feature. What would you like to do?': 'Maayong adlaw! Makita ko ang schedule, makapangita og libre nga kwarto, makasusi sa kapasidad ug ekipo, makasulti sa conflict, makakita sa approval status, ug magiyahan ka sa mga feature. Unsa ang imong gusto buhaton?',
    'Please sign in first so I can look up your personal schedule. You can log in from the Login page.': 'Palihog pag-login una aron makit-an nako ang imong personal nga schedule. Pwede ka mag-login sa Login page.',
    "I'm not sure I understood that. I can help with your schedule, free rooms, room capacity/equipment, conflicts, approvals, course info, syncing and scanning.": 'Dili ko sigurado kung nasabtan nako. Motabang ako sa imong schedule, libre nga kwarto, kapasidad/ekipo sa kwarto, conflict, approval, course info, sync, ug scan.',
    'Good news – no schedule conflicts found.': 'Maayo nga balita — walay nakit-ang conflict sa schedule.',
    'No rooms match those requirements.': 'Walay kwarto nga mohaom sa imong gipangayo.',
    'The Smart Class Scheduler offers scheduling information management, automatic schedule generation, constraint optimisation, classroom availability, capacity and equipment checks, conflict detection, alternative suggestions, schedule viewing/management and an approval workflow, plus Google Calendar/Zoom/Classroom sync and timetable scanning.': 'Ang Smart Class Scheduler adunay schedule management, automatic schedule generation, constraint optimization, classroom availability, capacity ug equipment checks, conflict detection, alternative suggestions, schedule viewing/management, ug approval workflow. Naa usab Google Calendar, Zoom, Google Classroom sync, ug timetable scanning.'
  }
};

const SUGGESTION_TRANSLATIONS = {
  ko: {
    'What is my schedule today?': '오늘 내 일정은 무엇인가요?', 'Which rooms are free now?': '지금 빈 강의실은 어디인가요?',
    'How do I scan my timetable?': '시간표는 어떻게 스캔하나요?', 'How do I sync to Google Calendar?': 'Google 캘린더와 동기화하려면?',
    'Show my classes': '내 수업 보기', 'Any schedule conflicts?': '일정 충돌이 있나요?',
    'How do I generate a schedule?': '일정은 어떻게 생성하나요?', 'Which rooms have a projector?': '프로젝터가 있는 강의실은 어디인가요?',
    'Any pending approvals?': '대기 중인 승인이 있나요?', 'How do I add a user?': '사용자는 어떻게 추가하나요?',
    'What can you do?': '무엇을 도와줄 수 있나요?', 'How do I sign up?': '회원 가입은 어떻게 하나요?', 'What features are there?': '어떤 기능이 있나요?',
    'How do I log in?': '로그인은 어떻게 하나요?'
  },
  es: {
    'What is my schedule today?': '¿Cuál es mi horario hoy?', 'Which rooms are free now?': '¿Qué aulas están libres ahora?',
    'How do I scan my timetable?': '¿Cómo escaneo mi horario?', 'How do I sync to Google Calendar?': '¿Cómo sincronizo con Google Calendar?',
    'Show my classes': 'Mostrar mis clases', 'Any schedule conflicts?': '¿Hay conflictos de horario?',
    'How do I generate a schedule?': '¿Cómo genero un horario?', 'Which rooms have a projector?': '¿Qué aulas tienen proyector?',
    'Any pending approvals?': '¿Hay aprobaciones pendientes?', 'How do I add a user?': '¿Cómo agrego un usuario?',
    'What can you do?': '¿Qué puedes hacer?', 'How do I sign up?': '¿Cómo me registro?', 'What features are there?': '¿Qué funciones tiene?',
    'How do I log in?': '¿Cómo inicio sesión?'
  },
  ceb: {
    'What is my schedule today?': 'Unsa ang akong schedule karon?', 'Which rooms are free now?': 'Unsa nga kwarto ang libre karon?',
    'How do I scan my timetable?': 'Unsaon nako pag-scan sa akong timetable?', 'How do I sync to Google Calendar?': 'Unsaon pag-sync sa Google Calendar?',
    'Show my classes': 'Ipakita ang akong klase', 'Any schedule conflicts?': 'Aduna bay conflict sa schedule?',
    'How do I generate a schedule?': 'Unsaon pagmugna og schedule?', 'Which rooms have a projector?': 'Unsa nga kwarto ang adunay projector?',
    'Any pending approvals?': 'Aduna bay pending approval?', 'How do I add a user?': 'Unsaon pagdugang ug user?',
    'What can you do?': 'Unsa ang imong mahimo?', 'How do I sign up?': 'Unsaon pag-sign up?', 'What features are there?': 'Unsang mga feature ang naa?',
    'How do I log in?': 'Unsaon pag-log in?'
  }
};

function translateReply(text, language) {
  if (language === 'en') return text;
  const exact = STATIC_TRANSLATIONS[language]?.[text];
  if (exact) return exact;

  let out = text;
  const replacements = language === 'ko' ? [
    ['I can look up schedules, find free rooms, check room capacity and equipment, report conflicts, show approval status and guide you through every feature.', '일정 조회, 빈 강의실 찾기, 강의실 수용 인원 및 장비 확인, 충돌 보고, 승인 상태 확인 및 모든 기능 안내를 도와드릴 수 있습니다.'],
    ['What would you like to do?', '무엇을 도와드릴까요?'],
    ['Your classes today:', '오늘 수업:'], ['Your classes tomorrow:', '내일 수업:'],
    ['Your classes', '내 수업'], ['You have no classes today.', '오늘 수업이 없습니다.'],
    ['You have no classes tomorrow.', '내일 수업이 없습니다.'], ['Free rooms on ', '빈 강의실 — '],
    ['No rooms match for ', '조건에 맞는 강의실이 없습니다: '], ['room(s) match:', '개 강의실이 일치합니다:'],
    ['Capacity:', '수용 인원:'], ['Equipment:', '장비:'], ['Status:', '상태:'],
    ['Available for scheduling', '예약 가능'], ['Currently unavailable', '현재 사용 불가'],
    ['Good news – no schedule conflicts found.', '좋은 소식입니다. 일정 충돌이 발견되지 않았습니다.'],
    ['I found ', '발견된 '], ['conflict(s):', '개 충돌:'], ['No approved schedule yet.', '승인된 일정이 없습니다.'],
    ['Schedule:', '일정:'], ['No approved classes yet.', '승인된 수업이 없습니다.'],
    ['Monday', '월요일'], ['Tuesday', '화요일'], ['Wednesday', '수요일'], ['Thursday', '목요일'],
    ['Friday', '금요일'], ['Saturday', '토요일'], ['Sunday', '일요일']
  ] : language === 'es' ? [
    ['I can look up schedules, find free rooms, check room capacity and equipment, report conflicts, show approval status and guide you through every feature.', 'Puedo consultar horarios, encontrar aulas libres, verificar capacidad y equipos, informar conflictos, mostrar estados de aprobación y guiarte por todas las funciones.'],
    ['What would you like to do?', '¿Qué deseas hacer?'],
    ['Your classes today:', 'Tus clases de hoy:'], ['Your classes tomorrow:', 'Tus clases de mañana:'],
    ['Your classes', 'Tus clases'], ['You have no classes today.', 'No tienes clases hoy.'],
    ['You have no classes tomorrow.', 'No tienes clases mañana.'], ['Free rooms on ', 'Aulas libres el '],
    ['No rooms match for ', 'No hay aulas que coincidan para '], ['room(s) match:', 'aula(s) coincidente(s):'],
    ['Capacity:', 'Capacidad:'], ['Equipment:', 'Equipo:'], ['Status:', 'Estado:'],
    ['Available for scheduling', 'Disponible para programar'], ['Currently unavailable', 'Actualmente no disponible'],
    ['I found ', 'Encontré '], ['conflict(s):', 'conflicto(s):'], ['No approved schedule yet.', 'Todavía no hay un horario aprobado.'],
    ['Schedule:', 'Horario:'], ['No approved classes yet.', 'Todavía no hay clases aprobadas.'],
    ['Monday', 'lunes'], ['Tuesday', 'martes'], ['Wednesday', 'miércoles'], ['Thursday', 'jueves'],
    ['Friday', 'viernes'], ['Saturday', 'sábado'], ['Sunday', 'domingo']
  ] : [
    ['I can look up schedules, find free rooms, check room capacity and equipment, report conflicts, show approval status and guide you through every feature.', 'Makita ko ang schedule, makapangita og libre nga kwarto, makasusi sa kapasidad ug ekipo, makasulti sa conflict, makakita sa approval status, ug magiyahan ka sa mga feature.'],
    ['What would you like to do?', 'Unsa ang imong gusto buhaton?'],
    ['Your classes today:', 'Imong klase karon:'], ['Your classes tomorrow:', 'Imong klase ugma:'],
    ['Your classes', 'Imong klase'], ['You have no classes today.', 'Walay klase karon.'],
    ['You have no classes tomorrow.', 'Walay klase ugma.'], ['Free rooms on ', 'Libre nga kwarto sa '],
    ['No rooms match for ', 'Walay kwarto nga mohaom sa '], ['room(s) match:', 'kwarto nga mohaom:'],
    ['Capacity:', 'Kapasidad:'], ['Equipment:', 'Ekipo:'], ['Status:', 'Status:'],
    ['Available for scheduling', 'Pwede i-schedule'], ['Currently unavailable', 'Dili available karon'],
    ['I found ', 'Nakakita ko og '], ['conflict(s):', 'conflict(s):'], ['No approved schedule yet.', 'Walay approved nga schedule pa.'],
    ['Schedule:', 'Schedule:'], ['No approved classes yet.', 'Walay approved nga klase pa.'],
    ['Monday', 'Lunes'], ['Tuesday', 'Martes'], ['Wednesday', 'Miércoles'], ['Thursday', 'Huwebes'],
    ['Friday', 'Biyernes'], ['Saturday', 'Sabado'], ['Sunday', 'Domingo']
  ];
  replacements.forEach(([from, to]) => { out = out.split(from).join(to); });
  return out;
}

function suggestionsFor(user) {
  if (!user) return ['What can you do?', 'How do I sign up?', 'What features are there?'];
  if (user.role === 'student') return ['What is my schedule today?', 'Which rooms are free now?', 'How do I scan my timetable?', 'How do I sync to Google Calendar?'];
  if (user.role === 'faculty') return ['Show my classes', 'Any schedule conflicts?', 'How do I generate a schedule?', 'Which rooms have a projector?'];
  return ['Any pending approvals?', 'Any schedule conflicts?', 'Which rooms are free now?', 'How do I add a user?'];
}

async function replyEnglish(user, message) {
  const t = message.toLowerCase().trim();

  if (/^(hi|hello|hey|good (morning|afternoon|evening)|yo|help)\b/.test(t) || /what can you do/.test(t)) {
    const who = user ? `Hi ${user.name.split(' ')[0]}! ` : 'Hi! ';
    return R(`${who}I can look up schedules, find free rooms, check room capacity and equipment, report conflicts, show approval status and guide you through every feature. What would you like to do?`, suggestionsFor(user));
  }

  // ---- How-to answers (work without signing in) ----
  if (/(sign ?up|register|create (an )?account)/.test(t))
    return R('Open the **Sign up** page, choose **Student** or **Faculty/Staff**, fill in your details and submit. Admin accounts are created only by an existing admin.', ['How do I log in?']);
  if (/(log ?in|sign ?in|password|forgot)/.test(t))
    return R('On the **Login** page pick your mode (Student, Faculty/Staff or Admin), then enter your email and password. If you forgot your password, ask the admin to reset it from Admin Mode → Users.');
  if (/(generate|auto(matic)?|optimi[sz]e|create.*schedule|build.*schedule)/.test(t) && !/room/.test(t))
    return R('Faculty/Staff and admins can open **Auto Generator**: pick the courses, days and hours, then press **Generate**. The engine respects room capacity, required equipment, instructor and student overlaps, then tries many combinations and keeps the best one. You can swap in alternative slots, save as a draft, or submit for approval.');
  if (/(sync|google calendar|zoom|classroom|ics|calendar)/.test(t))
    return R('Open **Sync & Integrations**. You can add your classes to **Google Calendar** (one click per class or a full .ics download), attach **Zoom** join links to courses, and share to **Google Classroom** or copy a ready-made announcement.', ['How do I scan my timetable?']);
  if (/(scan|picture|photo|image|ocr|upload.*(schedule|timetable))/.test(t))
    return R('Open **Scan Schedule**, take or upload a photo of your timetable, and press **Read schedule**. The text is recognised on your device, turned into editable rows (title, day, time, room), and you can save everything to your calendar with one click.');
  if (/(approve|approval|pending|review)/.test(t) && !/my/.test(t) && !user)
    return R('Faculty/Staff submit schedules for review and the admin approves or rejects them from the **Approvals** page. Sign in to see your own status.');
  if (/(feature|what.*(site|app|system)|about)/.test(t) && !/room/.test(t))
    return R('The Smart Class Scheduler offers scheduling information management, automatic schedule generation, constraint optimisation, classroom availability, capacity and equipment checks, conflict detection, alternative suggestions, schedule viewing/management and an approval workflow, plus Google Calendar/Zoom/Classroom sync and timetable scanning.');

  // ---- Data answers ----
  const ctx = await loadContext();

  // Course info e.g. "tell me about CS101"
  const cm = t.match(/\b([a-z]{2,5})\s?-?(\d{3})\b/);
  if (cm) {
    const code = (cm[1] + cm[2]).toUpperCase();
    const c = [...ctx.courses.values()].find(x => x.code.replace(/\s|-/g, '').toUpperCase() === code);
    if (c) {
      const ents = await loadEntries("WHERE s.status='approved' AND s.course_id=?", [c.id]);
      const eq = [...c.equip].map(x => ctx.equipNames.get(x)).join(', ') || 'none';
      let out = `**${c.code} – ${c.name}**\nInstructor: ${c.faculty_name || 'TBA'}\nUnits: ${c.units} · Expected students: ${c.expected_students}\n${c.sessions_per_week} session(s)/week, ${c.duration_min} min each · Equipment: ${eq}`;
      out += ents.length ? '\n\nSchedule:\n' + ents.map(line).join('\n') : '\n\nNo approved schedule yet.';
      if (user && c.zoom_link && /zoom|link|online/.test(t)) out += `\n\nZoom: ${c.zoom_link}`;
      if (user && c.classroom_link && /classroom|link/.test(t)) out += `\nGoogle Classroom: ${c.classroom_link}`;
      return R(out, ['Which rooms are free now?']);
    }
  }

  // Personal schedule
  if (/\b(my|next|today|tomorrow)\b.*\b(schedule|class|classes|timetable|session|sessions|lecture)/.test(t) || /^(schedule|timetable|classes|show my classes)/.test(t) || /what.*(class|schedule)/.test(t)) {
    if (!user) return needSignIn();
    const dayInfo = parseDay(t);
    let ents = await entriesForUser(user, {});
    if (/\bnext\b/.test(t)) {
      const now = new Date(), cur = JS_DAYS[now.getDay()], nowMin = now.getHours() * 60 + now.getMinutes();
      const order = S.DAYS;
      const rank = e => { const di = (order.indexOf(e.day) - order.indexOf(cur) + 6) % 6; return di * 1440 + S.toMin(e.start_time); };
      const nxt = ents.filter(e => order.indexOf(e.day) >= 0).map(e => ({ e, r: rank(e) })).filter(x => cur === 'Sun' || x.r >= nowMin || order.indexOf(x.e.day) !== order.indexOf(cur)).sort((a, b) => a.r - b.r)[0];
      return nxt ? R(`Your next class is:\n${line(nxt.e)}`, ['What is my schedule today?']) : R('You have no upcoming classes on your schedule.', ['How do I scan my timetable?']);
    }
    if (dayInfo) {
      if (!S.DAYS.includes(dayInfo.day)) return R(`There are no classes on ${dayInfo.day === 'Sun' ? 'Sunday' : dayInfo.day}. Enjoy the day off!`);
      ents = ents.filter(e => e.day === dayInfo.day);
      return ents.length ? R(`Your classes ${dayInfo.label}:\n${ents.map(line).join('\n')}`) : R(`You have no classes ${dayInfo.label}.`);
    }
    if (!ents.length) return R(user.role === 'student' ? 'No approved classes yet. Enrol in courses from the Courses page, and classes will appear after the admin approves the schedule.' : 'You have no sessions yet. Use Auto Generator or add one in Schedules.', ['How do I generate a schedule?']);
    return R(`You have ${ents.length} session(s) this week:\n${ents.slice(0, 14).map(line).join('\n')}${ents.length > 14 ? '\n…and more on the Schedules page.' : ''}`);
  }

  // Free rooms
  if (/(room|classroom|venue|lab|hall)s?\b.*\b(available|free|vacant|open)|\b(available|free|vacant|open)\b.*\b(room|classroom|venue|lab|hall)/.test(t)) {
    const now = new Date();
    let d = parseDay(t)?.day || JS_DAYS[now.getDay()];
    let note = '';
    if (!S.DAYS.includes(d)) { d = 'Mon'; note = 'There are no classes on Sunday, so I checked Monday instead.\n'; }
    const start = parseTime(t) || `${pad(Math.min(20, now.getHours() + (now.getMinutes() > 0 ? 1 : 0)))}:00`;
    const hrs = t.match(/for (\d+(?:\.\d+)?)\s*(hour|hr|h)/);
    const end = addMin(start, hrs ? Math.round(+hrs[1] * 60) : 90);
    const cap = t.match(/(\d+)\s*(students|people|pax|seats|persons)/);
    const equipIds = ctx.equipment.filter(e => t.includes(e.name.toLowerCase()) || (e.name === 'Computers' && /computer|pc/.test(t))).map(e => e.id);
    const entries = await loadEntries("WHERE s.status<>'rejected' AND s.day=?", [d]);
    const res = S.availability(ctx, entries, { day: d, start, end, capacity: cap ? +cap[1] : 0, equip: equipIds });
    const free = res.filter(r => r.status === 'free');
    if (!free.length) return R(`${note}No rooms match for ${d} ${start}–${end}. The closest issue: ${res[0]?.reason || 'none'}. Try a different time on the Classrooms page.`);
    return R(`${note}Free rooms on ${FULL[d]} ${start}–${end}:\n${free.slice(0, 8).map(r => `• ${r.name} (${r.building || '—'} · ${r.capacity} seats) – ${r.equipment.join(', ') || 'no equipment'}`).join('\n')}${free.length > 8 ? `\n…and ${free.length - 8} more.` : ''}`, ['Which rooms have a projector?']);
  }

  // Room details (capacity / equipment)
  const room = [...ctx.rooms.values()].find(r => new RegExp(`\\b${r.name.toLowerCase().replace(/[^a-z0-9]/g, '')}\\b`).test(t.replace(/[^a-z0-9 ]/g, '')));
  if (room && /(capacity|seat|fit|equipment|have|has|room|about|info)/.test(t)) {
    const eq = [...room.equip].map(x => ctx.equipNames.get(x)).join(', ') || 'none';
    return R(`**${room.name}** (${room.building || 'no building'})\nCapacity: ${room.capacity} seats\nEquipment: ${eq}\nStatus: ${room.is_available ? 'Available for scheduling' : 'Currently unavailable'}`, ['Which rooms are free now?']);
  }

  // Rooms with equipment / capacity
  if (/(rooms?|classrooms?|labs?)\b.*\b(with|having|that have|equipped)|which rooms|biggest|largest|capacity/.test(t)) {
    const eq = ctx.equipment.filter(e => t.includes(e.name.toLowerCase()) || (e.name === 'Computers' && /computer|pc/.test(t)) || (e.name === 'Projector' && /projector/.test(t)));
    let rooms = [...ctx.rooms.values()];
    if (eq.length) rooms = rooms.filter(r => eq.every(e => r.equip.has(e.id)));
    const cap = t.match(/(\d+)\s*(students|people|pax|seats)/);
    if (cap) rooms = rooms.filter(r => r.capacity >= +cap[1]);
    if (/biggest|largest/.test(t)) rooms = rooms.sort((a, b) => b.capacity - a.capacity).slice(0, 3);
    if (!rooms.length) return R('No rooms match those requirements.');
    return R(`${rooms.length} room(s) match:\n${rooms.slice(0, 10).map(r => `• ${r.name} – ${r.capacity} seats (${[...r.equip].map(x => ctx.equipNames.get(x)).join(', ') || 'no equipment'})`).join('\n')}`);
  }

  // Conflicts
  if (/(conflict|clash|overlap|double.?book)/.test(t)) {
    if (!user) return needSignIn();
    let all = await loadEntries("WHERE s.status<>'rejected'");
    if (user.role === 'student') all = all.filter(e => e.status === 'approved' && ctx.courses.get(e.course_id)?.students.has(user.id));
    let list = S.detect(all, ctx);
    if (user.role === 'faculty') list = list.filter(c => c.entryIds.some(id => all.find(e => e.id === id)?.faculty_id === user.id));
    if (!list.length) return R('Good news – no schedule conflicts found.');
    const link = user.role === 'student' ? '' : '\nOpen the Conflicts page for suggested alternatives.';
    return R(`I found ${list.length} conflict(s):\n${list.slice(0, 5).map(c => `• ${c.message}`).join('\n')}${list.length > 5 ? '\n…and more.' : ''}${link}`);
  }

  // Approvals
  if (/(approv|pending|reject|status)/.test(t)) {
    if (!user) return needSignIn();
    if (user.role === 'admin') {
      const [[r]] = await pool.query("SELECT COUNT(*) n FROM schedules WHERE status='pending'");
      return R(r.n ? `${r.n} session(s) are waiting for your review. Open **Approvals** to approve or reject them.` : 'Nothing is waiting for approval right now.');
    }
    if (user.role === 'faculty') {
      const [rows] = await pool.query("SELECT s.status, COUNT(*) n FROM schedules s JOIN courses c ON c.id=s.course_id WHERE c.faculty_id=? GROUP BY s.status", [user.id]);
      return R(rows.length ? 'Your sessions by status:\n' + rows.map(r => `• ${r.status}: ${r.n}`).join('\n') : 'You have no sessions yet.', ['How do I generate a schedule?']);
    }
    return R('Students only see approved classes. When the admin approves a schedule, it appears automatically in your timetable.');
  }

  // Users (admin)
  if (/(add|create|manage).*(user|account|admin)/.test(t))
    return R(user?.role === 'admin' ? 'Open **Admin Panel → Users** and press **Add user** to create students, faculty or other admins. You can also reset passwords and deactivate accounts there.' : 'Only the admin can add users. Students and Faculty/Staff can sign up themselves from the Sign up page.');

  return R("I'm not sure I understood that. I can help with your schedule, free rooms, room capacity/equipment, conflicts, approvals, course info, syncing and scanning.", suggestionsFor(user));
}

async function reply(user, message) {
  const language = detectLanguage(message);
  const normalized = normalizeMultilingualMessage(message);
  const result = await replyEnglish(user, normalized);
  const translatedSuggestions = (result.suggestions || []).map(item =>
    SUGGESTION_TRANSLATIONS[language]?.[item] || item
  );
  return {
    reply: translateReply(result.reply, language),
    suggestions: translatedSuggestions,
    language
  };
}

module.exports = { reply, detectLanguage, normalizeMultilingualMessage };
