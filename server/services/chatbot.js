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
  if (/[\u0E00-\u0E7F]/.test(message)) return 'th';
  if (/[\u3040-\u30FF]/.test(message)) return 'ja';
  if (/[\uAC00-\uD7AF]/.test(message)) return 'ko';
  if (/[\u0900-\u097F]/.test(message)) return 'hi';
  const text = message.toLowerCase();
  if (/[\u4E00-\u9FFF]/.test(message)) return 'zh';
  if (/[\uFF01-\uFF65]/.test(message)) return 'ja';
  if (/\b(hola|gracias|por favor|hoy|mañana|salas?|horario|clases?|programación|aprobaciones?|iniciar sesión|registrarse|cuarto|cuartos)\b/.test(text) ||
      /¿|á|é|í|ó|ú|ñ/.test(text)) return 'es';
  if (/\b(magandang|kumusta|kamusta|salamat|ano|nasaan|klase|klases|oras|paaralan|guro|magparehistro|mag-login|bukas|ngayon)\b/.test(text)) return 'fil';
  if (/\b(maayong|kumusta|unsa|asa|kanus-a|karon|ugma|klase|klases|kwarto|kwartos|room|sulod|schedule|plano|nganong|pila|pwede|ako)\b/.test(text) ||
      /\b(salon|akong|imong|unsaon|magparehistro|mag-login)\b/.test(text)) return 'ceb';
  return 'en';
}

function normalizeMultilingualMessage(message) {
  let text = message.toLowerCase();
  const replacements = [
    // Thai
    [/สวัสดี|หวัดดี/g, 'hello'], [/ช่วยด้วย|ช่วยเหลือ/g, 'help'],
    [/ตารางของฉัน|ตารางเรียนของฉัน|ตารางวันนี้|คาบเรียนของฉัน/g, 'my schedule'],
    [/พรุ่งนี้/g, 'tomorrow'], [/วันนี้/g, 'today'], [/ถัดไป|ต่อไป/g, 'next'],
    [/ห้องว่าง|ห้องที่ว่าง|ห้องเรียนว่าง/g, 'free rooms'],
    [/ห้องเรียน|ห้องประชุม|ห้อง/g, 'rooms'], [/ว่าง|พร้อมใช้งาน/g, 'free'],
    [/ความขัดแย้ง|ตารางชน|ชนกัน|ซ้ำซ้อน/g, 'conflicts'],
    [/อนุมัติ|รอดำเนินการ|รอตรวจ/g, 'approvals'],
    [/สมัครสมาชิก|สร้างบัญชี|ลงทะเบียน/g, 'sign up'], [/เข้าสู่ระบบ|รหัสผ่าน/g, 'log in'],
    [/สร้างตาราง|จัดตารางอัตโนมัติ|ตารางอัตโนมัติ/g, 'generate schedule'],
    [/ความจุ|ที่นั่ง/g, 'capacity'], [/โปรเจกเตอร์/g, 'projector'],
    [/สแกนตาราง|สแกน|รูปภาพ/g, 'scan timetable'],
    [/ซิงค์|google calendar|ปฏิทิน/g, 'sync calendar'], [/คุณสมบัติ|ฟีเจอร์/g, 'features'],
    // Japanese
    [/こんにちは|こんちは|ハイ/g, 'hello'], [/助けて|ヘルプ/g, 'help'],
    [/私の時間割|私のスケジュール|授業一覧|今日の授業/g, 'my schedule'],
    [/明日/g, 'tomorrow'], [/今日/g, 'today'], [/次/g, 'next'],
    [/空いている教室|使える教室|空き教室/g, 'free rooms'],
    [/教室|部屋|会議室/g, 'rooms'], [/無料|空き/g, 'free'],
    [/衝突|競合|かぶり/g, 'conflicts'], [/承認|保留|レビュー/g, 'approvals'],
    [/登録|アカウント作成|サインアップ/g, 'sign up'], [/ログイン|パスワード/g, 'log in'],
    [/時間割を作る|スケジュール作成|自動生成/g, 'generate schedule'],
    [/定員|収容人数/g, 'capacity'], [/プロジェクター/g, 'projector'],
    [/スキャン|写真|画像/g, 'scan timetable'], [/同期|カレンダー/g, 'sync calendar'],
    [/機能/g, 'features'],
    // Filipino / Tagalog
    [/magandang araw|magandang umaga|kumusta|kamusta/g, 'hello'], [/tulong|pakiusap/g, 'help'],
    [/ano ang aking iskedyul|aking iskedyul|aking klase|aking mga klase/g, 'my schedule'],
    [/ngayon/g, 'today'], [/bukas/g, 'tomorrow'], [/susunod/g, 'next'],
    [/libre ang silid|bakanteng silid|magagamit na silid/g, 'free rooms'],
    [/silid-aralan|silid|kwarto/g, 'rooms'], [/libre|bakante|magagamit/g, 'free'],
    [/salungatan|conflict|sabay/g, 'conflicts'], [/aprobasyon|aprubado|pending|pagsusuri/g, 'approvals'],
    [/magparehistro|gumawa ng account|mag-sign up/g, 'sign up'], [/mag-login|password/g, 'log in'],
    [/gumawa ng iskedyul|generate schedule|awtomatikong iskedyul/g, 'generate schedule'],
    [/kapasidad|upuan/g, 'capacity'], [/projector|proyektor/g, 'projector'],
    [/i-scan|scan ang iskedyul|larawan/g, 'scan timetable'], [/i-sync|google calendar|kalendaryo/g, 'sync calendar'],
    [/mga feature|katangian/g, 'features'],
    // Hindi
    [/नमस्ते|हैलो|हाय/g, 'hello'], [/मदद|सहायता/g, 'help'],
    [/मेरा कार्यक्रम|मेरा शेड्यूल|मेरी कक्षाएं|आज की कक्षा/g, 'my schedule'],
    [/कल/g, 'tomorrow'], [/आज/g, 'today'], [/अगली|अगला/g, 'next'],
    [/खाली कमरे|खाली कक्षा|उपलब्ध कमरे/g, 'free rooms'],
    [/कक्षा|कमरा|कक्ष/g, 'rooms'], [/खाली|उपलब्ध/g, 'free'],
    [/समय संघर्ष|संघर्ष|ओवरलैप/g, 'conflicts'], [/अनुमोदन|लंबित|समीक्षा/g, 'approvals'],
    [/साइन अप|खाता बनाएं|पंजीकरण/g, 'sign up'], [/लॉग इन|पासवर्ड/g, 'log in'],
    [/शेड्यूल बनाएं|स्वचालित शेड्यूल/g, 'generate schedule'],
    [/क्षमता|सीट/g, 'capacity'], [/प्रोजेक्टर/g, 'projector'],
    [/स्कैन|तस्वीर|छवि/g, 'scan timetable'], [/सिंक|गूगल कैलेंडर|कैलेंडर/g, 'sync calendar'],
    [/सुविधाएं|विशेषताएं/g, 'features'],
    // Simplified Chinese / Mandarin
    [/你好|您好|嗨/g, 'hello'], [/帮助|帮忙/g, 'help'],
    [/我的课表|我的课程|今天的课程/g, 'my schedule'], [/明天/g, 'tomorrow'], [/今天/g, 'today'], [/下一个/g, 'next'],
    [/空教室|可用教室|空房间/g, 'free rooms'], [/教室|房间|课室/g, 'rooms'], [/空闲|可用/g, 'free'],
    [/冲突|时间冲突|重叠/g, 'conflicts'], [/审批|批准|待审核/g, 'approvals'],
    [/注册|创建账户|报名/g, 'sign up'], [/登录|密码/g, 'log in'],
    [/生成课程表|生成日程|自动生成/g, 'generate schedule'], [/容量|座位/g, 'capacity'],
    [/投影仪/g, 'projector'], [/扫描|照片|图片/g, 'scan timetable'],
    [/同步|谷歌日历|日历/g, 'sync calendar'], [/功能|特性/g, 'features'],
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
  th: {
    'Hi! I can help with schedules, rooms, account setup, and app features. What would you like to know?': 'สวัสดี! ฉันสามารถช่วยเรื่องตารางเรียน ห้อง บัญชีผู้ใช้ และฟีเจอร์ของแอปได้ คุณต้องการทราบอะไร?',
    'Hi! I can look up schedules, find free rooms, check room capacity and equipment, report conflicts, show approval status and guide you through every feature. What would you like to do?': 'สวัสดี! ฉันสามารถดูตารางเรียน ค้นหาห้องว่าง ตรวจความจุและอุปกรณ์ของห้อง รายงานความขัดแย้ง แสดงสถานะการอนุมัติ และแนะนำฟีเจอร์ทุกอย่างได้ คุณต้องการทำอะไร?',
    'Please sign in first so I can look up your personal schedule. You can log in from the Login page.': 'กรุณาเข้าสู่ระบบก่อนเพื่อให้ฉันตรวจสอบตารางส่วนตัวของคุณ คุณสามารถเข้าสู่ระบบจากหน้า Login',
    "I'm not sure I understood that. I can help with your schedule, free rooms, room capacity/equipment, conflicts, approvals, course info, syncing and scanning.": 'ฉันไม่แน่ใจว่าจับใจความได้ถูกต้อง ฉันช่วยเรื่องตารางเรียน ห้องว่าง ความจุหรืออุปกรณ์ของห้อง ความขัดแย้ง การอนุมัติ ข้อมูลรายวิชา การซิงค์ และการสแกนได้',
    'Good news – no schedule conflicts found.': 'ข่าวดี — ไม่พบความขัดแย้งในตารางเรียน',
    'No rooms match those requirements.': 'ไม่พบห้องที่ตรงกับเงื่อนไขเหล่านี้',
    'The Smart Class Scheduler offers scheduling information management, automatic schedule generation, constraint optimisation, classroom availability, capacity and equipment checks, conflict detection, alternative suggestions, schedule viewing/management and an approval workflow, plus Google Calendar/Zoom/Classroom sync and timetable scanning.': 'Smart Class Scheduler มีระบบจัดการตารางเรียน การสร้างตารางอัตโนมัติ การปรับแต่งเงื่อนไข การตรวจห้องว่าง ความจุและอุปกรณ์ การตรวจจับความขัดแย้ง ข้อเสนอทางเลือก การดูและจัดการตาราง ขั้นตอนการอนุมัติ รวมถึงการซิงค์ Google Calendar/Zoom/Classroom และการสแกนตารางเรียน'
  },
  ja: {
    'Hi! I can help with schedules, rooms, account setup, and app features. What would you like to know?': 'こんにちは！時間割、教室、アカウント設定、アプリの機能についてお手伝いできます。何について知りたいですか？',
    'Hi! I can look up schedules, find free rooms, check room capacity and equipment, report conflicts, show approval status and guide you through every feature. What would you like to do?': 'こんにちは！時間割の確認、空き教室の検索、教室の定員や設備の確認、競合や承認状況の確認、各機能の案内ができます。何をしますか？',
    'Please sign in first so I can look up your personal schedule. You can log in from the Login page.': '個人の時間割を確認するには、まずログインしてください。ログインページからログインできます。',
    "I'm not sure I understood that. I can help with your schedule, free rooms, room capacity/equipment, conflicts, approvals, course info, syncing and scanning.": 'うまく理解できませんでした。時間割、空き教室、教室の定員・設備、競合、承認、コース情報、同期、スキャンについてお手伝いできます。',
    'Good news – no schedule conflicts found.': 'よいお知らせです。時間割の競合は見つかりませんでした。',
    'No rooms match those requirements.': '条件に一致する教室はありません。',
    'The Smart Class Scheduler offers scheduling information management, automatic schedule generation, constraint optimisation, classroom availability, capacity and equipment checks, conflict detection, alternative suggestions, schedule viewing/management and an approval workflow, plus Google Calendar/Zoom/Classroom sync and timetable scanning.': 'Smart Class Scheduler は、時間割管理、自動生成、制約最適化、教室の空き状況、定員・設備確認、競合検出、代替案、時間割の表示・管理、承認ワークフロー、Google Calendar、Zoom、Google Classroom の連携、時間割スキャンを提供します。'
  },
  fil: {
    'Hi! I can help with schedules, rooms, account setup, and app features. What would you like to know?': 'Kamusta! Maaari kitang tulungan sa mga iskedyul, silid, account, at mga feature ng app. Ano ang gusto mong malaman?',
    'Hi! I can look up schedules, find free rooms, check room capacity and equipment, report conflicts, show approval status and guide you through every feature. What would you like to do?': 'Kamusta! Maaari kong tingnan ang iskedyul, maghanap ng libreng silid, suriin ang kapasidad at kagamitan, mag-ulat ng mga conflict, ipakita ang approval status, at gabayan ka sa mga feature. Ano ang gusto mong gawin?',
    'Please sign in first so I can look up your personal schedule. You can log in from the Login page.': 'Mag-login muna para makita ang iyong personal na iskedyul. Maaari kang mag-login sa Login page.',
    "I'm not sure I understood that. I can help with your schedule, free rooms, room capacity/equipment, conflicts, approvals, course info, syncing and scanning.": 'Hindi ko masyadong naintindihan. Maaari kitang tulungan sa iskedyul, libreng silid, kapasidad/kagamitan, conflict, approval, course information, sync, at scan.',
    'Good news – no schedule conflicts found.': 'Magandang balita—walang nakitang conflict sa iskedyul.',
    'No rooms match those requirements.': 'Walang silid na tumutugma sa mga kinakailangan.',
    'The Smart Class Scheduler offers scheduling information management, automatic schedule generation, constraint optimisation, classroom availability, capacity and equipment checks, conflict detection, alternative suggestions, schedule viewing/management and an approval workflow, plus Google Calendar/Zoom/Classroom sync and timetable scanning.': 'Nagbibigay ang Smart Class Scheduler ng pamamahala at awtomatikong paggawa ng iskedyul, optimization, availability at kapasidad ng silid, pagsusuri ng kagamitan at conflict, alternatibong mungkahi, approval workflow, at Google Calendar, Zoom, Google Classroom sync, at timetable scanning.'
  },
  hi: {
    'Hi! I can help with schedules, rooms, account setup, and app features. What would you like to know?': 'नमस्ते! मैं शेड्यूल, कमरे, खाता सेटअप और ऐप सुविधाओं में आपकी मदद कर सकता हूँ। आप क्या जानना चाहते हैं?',
    'Hi! I can look up schedules, find free rooms, check room capacity and equipment, report conflicts, show approval status and guide you through every feature. What would you like to do?': 'नमस्ते! मैं शेड्यूल देख सकता हूँ, खाली कमरे खोज सकता हूँ, कमरे की क्षमता और उपकरण जाँच सकता हूँ, संघर्ष बता सकता हूँ, अनुमोदन स्थिति दिखा सकता हूँ और सभी सुविधाओं में मार्गदर्शन कर सकता हूँ। आप क्या करना चाहते हैं?',
    'Please sign in first so I can look up your personal schedule. You can log in from the Login page.': 'अपना व्यक्तिगत शेड्यूल देखने के लिए पहले लॉगिन करें। आप Login पेज से लॉगिन कर सकते हैं।',
    "I'm not sure I understood that. I can help with your schedule, free rooms, room capacity/equipment, conflicts, approvals, course info, syncing and scanning.": 'मुझे ठीक से समझ नहीं आया। मैं शेड्यूल, खाली कमरे, कमरे की क्षमता/उपकरण, संघर्ष, अनुमोदन, पाठ्यक्रम जानकारी, सिंक और स्कैन में मदद कर सकता हूँ।',
    'Good news – no schedule conflicts found.': 'अच्छी खबर है—कोई शेड्यूल संघर्ष नहीं मिला।',
    'No rooms match those requirements.': 'इन आवश्यकताओं से कोई भी कमरे मेल नहीं खाते।',
    'The Smart Class Scheduler offers scheduling information management, automatic schedule generation, constraint optimisation, classroom availability, capacity and equipment checks, conflict detection, alternative suggestions, schedule viewing/management and an approval workflow, plus Google Calendar/Zoom/Classroom sync and timetable scanning.': 'Smart Class Scheduler शेड्यूल प्रबंधन, स्वचालित शेड्यूल बनाना, बाधा अनुकूलन, कक्षा उपलब्धता, क्षमता और उपकरण जांच, संघर्ष पहचान, वैकल्पिक सुझाव, शेड्यूल देखने/प्रबंधन, अनुमोदन प्रक्रिया, Google Calendar/Zoom/Classroom सिंक और टाइमटेबल स्कैनिंग प्रदान करता है।'
  },
  zh: {
    'Hi! I can help with schedules, rooms, account setup, and app features. What would you like to know?': '你好！我可以帮助你查询课程表、教室、账户设置和应用功能。你想了解什么？',
    'Hi! I can look up schedules, find free rooms, check room capacity and equipment, report conflicts, show approval status and guide you through every feature. What would you like to do?': '你好！我可以查询课程表、查找空教室、检查教室容量和设备、报告冲突、显示审批状态，并指导你使用各项功能。你想做什么？',
    'Please sign in first so I can look up your personal schedule. You can log in from the Login page.': '请先登录，以便我查询你的个人课程表。你可以在登录页面登录。',
    "I'm not sure I understood that. I can help with your schedule, free rooms, room capacity/equipment, conflicts, approvals, course info, syncing and scanning.": '我不太确定我理解了。我可以帮助你查询课程表、空教室、教室容量/设备、冲突、审批、课程信息、同步和扫描。',
    'Good news – no schedule conflicts found.': '好消息：没有发现课程表冲突。',
    'No rooms match those requirements.': '没有教室符合这些要求。',
    'The Smart Class Scheduler offers scheduling information management, automatic schedule generation, constraint optimisation, classroom availability, capacity and equipment checks, conflict detection, alternative suggestions, schedule viewing/management and an approval workflow, plus Google Calendar/Zoom/Classroom sync and timetable scanning.': 'Smart Class Scheduler 提供课程表管理、自动生成、约束优化、教室可用性、容量和设备检查、冲突检测、替代建议、课程表查看与管理、审批流程，以及 Google Calendar、Zoom、Google Classroom 同步和课程表扫描。'
  },
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
  th: {
    'What is my schedule today?': 'ตารางเรียนของฉันวันนี้เป็นอย่างไร?', 'Which rooms are free now?': 'ตอนนี้ห้องไหนว่างบ้าง?',
    'How do I scan my timetable?': 'ฉันจะสแกนตารางเรียนได้อย่างไร?', 'How do I sync to Google Calendar?': 'ฉันจะซิงค์กับ Google Calendar ได้อย่างไร?',
    'Show my classes': 'แสดงวิชาเรียนของฉัน', 'Any schedule conflicts?': 'มีตารางเรียนชนกันหรือไม่?',
    'How do I generate a schedule?': 'ฉันจะสร้างตารางเรียนได้อย่างไร?', 'Which rooms have a projector?': 'ห้องไหนมีโปรเจกเตอร์?',
    'Any pending approvals?': 'มีรายการรออนุมัติหรือไม่?', 'How do I add a user?': 'ฉันจะเพิ่มผู้ใช้ได้อย่างไร?',
    'What can you do?': 'คุณช่วยอะไรได้บ้าง?', 'How do I sign up?': 'ฉันจะสมัครสมาชิกได้อย่างไร?', 'What features are there?': 'มีฟีเจอร์อะไรบ้าง?',
    'How do I log in?': 'ฉันจะเข้าสู่ระบบได้อย่างไร?'
  },
  ja: {
    'What is my schedule today?': '今日の自分の時間割は？', 'Which rooms are free now?': '今空いている教室は？',
    'How do I scan my timetable?': '時間割をスキャンするには？', 'How do I sync to Google Calendar?': 'Google カレンダーと同期するには？',
    'Show my classes': '授業を表示', 'Any schedule conflicts?': '時間割の競合はありますか？',
    'How do I generate a schedule?': '時間割を作成するには？', 'Which rooms have a projector?': 'プロジェクターがある教室は？',
    'Any pending approvals?': '保留中の承認はありますか？', 'How do I add a user?': 'ユーザーを追加するには？',
    'What can you do?': '何ができますか？', 'How do I sign up?': '登録するには？', 'What features are there?': 'どんな機能がありますか？',
    'How do I log in?': 'ログインするには？'
  },
  fil: {
    'What is my schedule today?': 'Ano ang aking iskedyul ngayon?', 'Which rooms are free now?': 'Aling silid ang libre ngayon?',
    'How do I scan my timetable?': 'Paano ko i-scan ang aking timetable?', 'How do I sync to Google Calendar?': 'Paano mag-sync sa Google Calendar?',
    'Show my classes': 'Ipakita ang aking klase', 'Any schedule conflicts?': 'May conflict ba sa iskedyul?',
    'How do I generate a schedule?': 'Paano gumawa ng iskedyul?', 'Which rooms have a projector?': 'Aling silid ang may projector?',
    'Any pending approvals?': 'May pending na approval?', 'How do I add a user?': 'Paano magdagdag ng user?',
    'What can you do?': 'Ano ang kaya mong gawin?', 'How do I sign up?': 'Paano magparehistro?', 'What features are there?': 'Anong mga feature ang mayroon?',
    'How do I log in?': 'Paano mag-login?'
  },
  hi: {
    'What is my schedule today?': 'आज मेरा शेड्यूल क्या है?', 'Which rooms are free now?': 'अभी कौन-से कमरे खाली हैं?',
    'How do I scan my timetable?': 'मैं अपना टाइमटेबल कैसे स्कैन करूँ?', 'How do I sync to Google Calendar?': 'Google Calendar से सिंक कैसे करें?',
    'Show my classes': 'मेरी कक्षाएं दिखाएँ', 'Any schedule conflicts?': 'क्या कोई शेड्यूल संघर्ष है?',
    'How do I generate a schedule?': 'शेड्यूल कैसे बनाएं?', 'Which rooms have a projector?': 'किन कमरों में प्रोजेक्टर है?',
    'Any pending approvals?': 'कोई लंबित अनुमोदन है?', 'How do I add a user?': 'यूज़र कैसे जोड़ें?',
    'What can you do?': 'आप क्या कर सकते हैं?', 'How do I sign up?': 'साइन अप कैसे करें?', 'What features are there?': 'कौन-कौन सी सुविधाएं हैं?',
    'How do I log in?': 'लॉग इन कैसे करें?'
  },
  zh: {
    'What is my schedule today?': '我今天的课程表是什么？', 'Which rooms are free now?': '现在哪些教室空闲？',
    'How do I scan my timetable?': '如何扫描我的课程表？', 'How do I sync to Google Calendar?': '如何同步到 Google 日历？',
    'Show my classes': '显示我的课程', 'Any schedule conflicts?': '有课程冲突吗？',
    'How do I generate a schedule?': '如何生成课程表？', 'Which rooms have a projector?': '哪些教室有投影仪？',
    'Any pending approvals?': '有待审批的内容吗？', 'How do I add a user?': '如何添加用户？',
    'What can you do?': '你能做什么？', 'How do I sign up?': '如何注册？', 'What features are there?': '有哪些功能？',
    'How do I log in?': '如何登录？'
  },
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
  ] : language === 'ja' ? [
    ['I can look up schedules, find free rooms, check room capacity and equipment, report conflicts, show approval status and guide you through every feature.', '時間割の確認、空き教室の検索、教室の定員や設備の確認、競合や承認状況の確認、各機能の案内ができます。'],
    ['What would you like to do?', '何をしますか？'],
    ['Your classes today:', '今日の授業:'], ['Your classes tomorrow:', '明日の授業:'],
    ['Your classes', 'あなたの授業'], ['You have no classes today.', '今日は授業がありません。'],
    ['You have no classes tomorrow.', '明日は授業がありません。'], ['Free rooms on ', '空き教室（'],
    ['No rooms match for ', '条件に一致する教室がありません: '], ['room(s) match:', '件の教室が一致します:'],
    ['Capacity:', '定員:'], ['Equipment:', '設備:'], ['Status:', '状態:'],
    ['Available for scheduling', '予約可能'], ['Currently unavailable', '現在は利用不可'],
    ['I found ', '見つかりました: '], ['conflict(s):', '件の競合:'], ['No approved schedule yet.', '承認済みの時間割はまだありません。'],
    ['Schedule:', '時間割:'], ['Monday', '月曜日'], ['Tuesday', '火曜日'], ['Wednesday', '水曜日'],
    ['Thursday', '木曜日'], ['Friday', '金曜日'], ['Saturday', '土曜日'], ['Sunday', '日曜日']
  ] : language === 'fil' ? [
    ['I can look up schedules, find free rooms, check room capacity and equipment, report conflicts, show approval status and guide you through every feature.', 'Maaari kong tingnan ang iskedyul, maghanap ng libreng silid, suriin ang kapasidad at kagamitan, mag-ulat ng conflict, ipakita ang approval status, at gabayan ka sa mga feature.'],
    ['What would you like to do?', 'Ano ang gusto mong gawin?'],
    ['Your classes today:', 'Ang iyong klase ngayon:'], ['Your classes tomorrow:', 'Ang iyong klase bukas:'],
    ['Your classes', 'Ang iyong klase'], ['You have no classes today.', 'Wala kang klase ngayon.'],
    ['You have no classes tomorrow.', 'Wala kang klase bukas.'], ['Free rooms on ', 'Libreng silid sa '],
    ['No rooms match for ', 'Walang silid na tumutugma sa '], ['room(s) match:', 'silid na tumutugma:'],
    ['Capacity:', 'Kapasidad:'], ['Equipment:', 'Kagamitan:'], ['Status:', 'Katayuan:'],
    ['Available for scheduling', 'Magagamit para sa schedule'], ['Currently unavailable', 'Hindi magagamit ngayon'],
    ['I found ', 'Nakakita ako ng '], ['conflict(s):', 'conflict(s):'], ['No approved schedule yet.', 'Wala pang approved na iskedyul.'],
    ['Schedule:', 'Iskedyul:'], ['Monday', 'Lunes'], ['Tuesday', 'Martes'], ['Wednesday', 'Miyerkules'],
    ['Thursday', 'Huwebes'], ['Friday', 'Biyernes'], ['Saturday', 'Sabado'], ['Sunday', 'Linggo']
  ] : language === 'hi' ? [
    ['I can look up schedules, find free rooms, check room capacity and equipment, report conflicts, show approval status and guide you through every feature.', 'मैं शेड्यूल देख सकता हूँ, खाली कमरे खोज सकता हूँ, कमरे की क्षमता और उपकरण जाँच सकता हूँ, संघर्ष बता सकता हूँ, अनुमोदन स्थिति दिखा सकता हूँ और सभी सुविधाओं में मार्गदर्शन कर सकता हूँ।'],
    ['What would you like to do?', 'आप क्या करना चाहते हैं?'],
    ['Your classes today:', 'आज की आपकी कक्षाएं:'], ['Your classes tomorrow:', 'कल की आपकी कक्षाएं:'],
    ['Your classes', 'आपकी कक्षाएं'], ['You have no classes today.', 'आज आपकी कोई कक्षा नहीं है।'],
    ['You have no classes tomorrow.', 'कल आपकी कोई कक्षा नहीं है।'], ['Free rooms on ', 'खाली कमरे — '],
    ['No rooms match for ', 'इस समय के लिए कोई कमरे मेल नहीं खाते: '], ['room(s) match:', 'कक्षाएं मेल खाती हैं:'],
    ['Capacity:', 'क्षमता:'], ['Equipment:', 'उपकरण:'], ['Status:', 'स्थिति:'],
    ['Available for scheduling', 'शेड्यूलिंग के लिए उपलब्ध'], ['Currently unavailable', 'फिलहाल उपलब्ध नहीं'],
    ['I found ', 'मुझे मिले '], ['conflict(s):', 'संघर्ष:'], ['No approved schedule yet.', 'अभी कोई स्वीकृत शेड्यूल नहीं है।'],
    ['Schedule:', 'शेड्यूल:'], ['Monday', 'सोमवार'], ['Tuesday', 'मंगलवार'], ['Wednesday', 'बुधवार'],
    ['Thursday', 'गुरुवार'], ['Friday', 'शुक्रवार'], ['Saturday', 'शनिवार'], ['Sunday', 'रविवार']
  ] : language === 'zh' ? [
    ['I can look up schedules, find free rooms, check room capacity and equipment, report conflicts, show approval status and guide you through every feature.', '我可以查询课程表、查找空教室、检查教室容量和设备、报告冲突、显示审批状态，并指导你使用各项功能。'],
    ['What would you like to do?', '你想做什么？'],
    ['Your classes today:', '你今天的课程：'], ['Your classes tomorrow:', '你明天的课程：'],
    ['Your classes', '你的课程'], ['You have no classes today.', '你今天没有课程。'],
    ['You have no classes tomorrow.', '你明天没有课程。'], ['Free rooms on ', '空闲教室（'],
    ['No rooms match for ', '没有教室符合条件：'], ['room(s) match:', '间教室符合：'],
    ['Capacity:', '容量：'], ['Equipment:', '设备：'], ['Status:', '状态：'],
    ['Available for scheduling', '可用于排课'], ['Currently unavailable', '当前不可用'],
    ['I found ', '找到 '], ['conflict(s):', '个冲突：'], ['No approved schedule yet.', '目前还没有已批准的课程表。'],
    ['Schedule:', '课程表：'], ['Monday', '周一'], ['Tuesday', '周二'], ['Wednesday', '周三'],
    ['Thursday', '周四'], ['Friday', '周五'], ['Saturday', '周六'], ['Sunday', '周日']
  ] : language === 'th' ? [
    ['I can look up schedules, find free rooms, check room capacity and equipment, report conflicts, show approval status and guide you through every feature.', 'ฉันสามารถดูตารางเรียน ค้นหาห้องว่าง ตรวจความจุและอุปกรณ์ของห้อง รายงานความขัดแย้ง แสดงสถานะการอนุมัติ และแนะนำฟีเจอร์ทุกอย่างได้'],
    ['What would you like to do?', 'คุณต้องการทำอะไร?'],
    ['Your classes today:', 'วิชาเรียนของคุณวันนี้:'], ['Your classes tomorrow:', 'วิชาเรียนของคุณพรุ่งนี้:'],
    ['Your classes', 'วิชาเรียนของคุณ'], ['You have no classes today.', 'คุณไม่มีวิชาเรียนวันนี้'],
    ['You have no classes tomorrow.', 'คุณไม่มีวิชาเรียนพรุ่งนี้'], ['Free rooms on ', 'ห้องว่างในวันที่ '],
    ['No rooms match for ', 'ไม่พบห้องที่ตรงกับเงื่อนไขสำหรับ '], ['room(s) match:', 'ห้องตรงตามเงื่อนไข:'],
    ['Capacity:', 'ความจุ:'], ['Equipment:', 'อุปกรณ์:'], ['Status:', 'สถานะ:'],
    ['Available for scheduling', 'สามารถจัดตารางได้'], ['Currently unavailable', 'ไม่พร้อมใช้งานในขณะนี้'],
    ['I found ', 'พบ '], ['conflict(s):', 'ความขัดแย้ง:'], ['No approved schedule yet.', 'ยังไม่มีตารางเรียนที่ได้รับอนุมัติ'],
    ['Schedule:', 'ตารางเรียน:'], ['Monday', 'วันจันทร์'], ['Tuesday', 'วันอังคาร'],
    ['Wednesday', 'วันพุธ'], ['Thursday', 'วันพฤหัสบดี'], ['Friday', 'วันศุกร์'],
    ['Saturday', 'วันเสาร์'], ['Sunday', 'วันอาทิตย์']
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
