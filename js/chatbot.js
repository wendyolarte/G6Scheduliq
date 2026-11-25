(() => {
  if (typeof API === 'undefined' || document.getElementById('chatWidget')) return;

  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'chat-fab';
  fab.textContent = '💬';
  fab.setAttribute('aria-label', 'Open chat assistant');
  fab.setAttribute('aria-expanded', 'false');

  const panel = document.createElement('section');
  panel.className = 'chat-panel';
  panel.id = 'chatWidget';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'chatTitle');
  panel.setAttribute('aria-hidden', 'true');

  const header = document.createElement('div');
  header.className = 'chat-h';
  const title = document.createElement('span');
  title.id = 'chatTitle';
  title.textContent = 'Scheduliq assistant';

  const headerActions = document.createElement('div');
  headerActions.className = 'chat-h-actions';
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'chat-new';
  clear.textContent = 'New chat';
  clear.setAttribute('aria-label', 'Start a new chat');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'chat-close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close chat');
  headerActions.append(clear, close);
  header.append(title, headerActions);

  const messages = document.createElement('div');
  messages.className = 'chat-msgs';
  messages.setAttribute('aria-live', 'polite');
  messages.setAttribute('aria-relevant', 'additions text');

  const chips = document.createElement('div');
  chips.className = 'chat-chips';
  chips.setAttribute('aria-label', 'Suggested questions');

  const form = document.createElement('form');
  form.className = 'chat-form';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 500;
  input.placeholder = 'Ask about schedules, rooms, or features...';
  input.setAttribute('aria-label', 'Message the assistant');
  input.autocomplete = 'off';
  const send = document.createElement('button');
  send.type = 'submit';
  send.className = 'btn sm';
  send.textContent = 'Send';
  form.append(input, send);

  panel.append(header, messages, chips, form);
  document.body.append(fab, panel);

  let sending = false;

  function browserLanguage() {
    const language = String(navigator.language || 'en').toLowerCase();
    if (language.startsWith('th')) return 'th';
    if (language.startsWith('ko')) return 'ko';
    if (language.startsWith('es')) return 'es';
    if (language.startsWith('ja')) return 'ja';
    if (language.startsWith('fil') || language.startsWith('tl')) return 'fil';
    if (language.startsWith('ceb')) return 'ceb';
    if (language.startsWith('hi')) return 'hi';
    if (language.startsWith('zh')) return 'zh';
    return 'en';
  }

  const languageUi = {
    th: {
      greeting: 'สวัสดี! ฉันสามารถช่วยเรื่องตารางเรียน ห้อง บัญชีผู้ใช้ และฟีเจอร์ของแอปได้ คุณต้องการทราบอะไร?',
      placeholder: 'ถามเกี่ยวกับตารางเรียน ห้อง หรือฟีเจอร์...',
      prompts: ['ตารางเรียนของฉันวันนี้เป็นอย่างไร?', 'ตอนนี้ห้องไหนว่างบ้าง?', 'ฉันจะสแกนตารางเรียนได้อย่างไร?']
    },
    ja: {
      greeting: 'こんにちは！時間割、教室、アカウント設定、アプリの機能についてお手伝いできます。何について知りたいですか？',
      placeholder: '時間割、教室、または機能について質問してください...',
      prompts: ['今日の自分の時間割は？', '今空いている教室は？', '時間割をスキャンするには？']
    },
    fil: {
      greeting: 'Kamusta! Maaari kitang tulungan sa mga iskedyul, silid, account, at mga feature ng app. Ano ang gusto mong malaman?',
      placeholder: 'Magtanong tungkol sa iskedyul, silid, o feature...',
      prompts: ['Ano ang aking iskedyul ngayon?', 'Aling silid ang libre ngayon?', 'Paano ko i-scan ang aking timetable?']
    },
    hi: {
      greeting: 'नमस्ते! मैं शेड्यूल, कमरे, खाता सेटअप और ऐप सुविधाओं में आपकी मदद कर सकता हूँ। आप क्या जानना चाहते हैं?',
      placeholder: 'शेड्यूल, कमरे या सुविधाओं के बारे में पूछें...',
      prompts: ['आज मेरा शेड्यूल क्या है?', 'अभी कौन-से कमरे खाली हैं?', 'मैं अपना टाइमटेबल कैसे स्कैन करूँ?']
    },
    zh: {
      greeting: '你好！我可以帮助你查询课程表、教室、账户设置和应用功能。你想了解什么？',
      placeholder: '询问课程表、教室或功能...',
      prompts: ['我今天的课程表是什么？', '现在哪些教室空闲？', '如何扫描我的课程表？']
    },
    ko: {
      greeting: '안녕하세요! 일정, 강의실, 계정 설정 및 앱 기능을 도와드릴 수 있습니다. 무엇을 알고 싶으신가요?',
      placeholder: '일정, 강의실 또는 기능에 대해 질문하세요...',
      prompts: ['오늘 내 일정은 무엇인가요?', '지금 빈 강의실은 어디인가요?', '시간표는 어떻게 스캔하나요?']
    },
    es: {
      greeting: '¡Hola! Puedo ayudarte con horarios, aulas, configuración de cuentas y funciones de la aplicación. ¿Qué deseas saber?',
      placeholder: 'Pregunta sobre horarios, aulas o funciones...',
      prompts: ['¿Cuál es mi horario hoy?', '¿Qué aulas están libres ahora?', '¿Cómo escaneo mi horario?']
    },
    ceb: {
      greeting: 'Maayong adlaw! Motabang ako sa imong schedule, kwarto, account, ug mga feature sa app. Unsa ang imong gusto nga mahibal-an?',
      placeholder: 'Mangutana bahin sa schedule, kwarto, o features...',
      prompts: ['Unsa ang akong schedule karon?', 'Unsa nga kwarto ang libre karon?', 'Unsaon nako pag-scan sa akong timetable?']
    },
    en: {
      greeting: 'Hi! I can help with schedules, rooms, account setup, and app features. What would you like to know?',
      placeholder: 'Ask about schedules, rooms, or features...',
      prompts: null
    }
  };

  function setUiLanguage(language) {
    const ui = languageUi[language] || languageUi.en;
    input.placeholder = ui.placeholder;
  }

  function appendFormattedText(target, text) {
    const lines = String(text).split('\n');
    lines.forEach((line, index) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      parts.forEach(part => {
        if (part.startsWith('**') && part.endsWith('**')) {
          const strong = document.createElement('strong');
          strong.textContent = part.slice(2, -2);
          target.appendChild(strong);
        } else {
          target.appendChild(document.createTextNode(part));
        }
      });
      if (index < lines.length - 1) target.appendChild(document.createElement('br'));
    });
  }

  function addMessage(text, sender) {
    const message = document.createElement('div');
    message.className = `msg ${sender}`;
    appendFormattedText(message, text);
    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;
    return message;
  }

  function showSuggestions(items) {
    chips.replaceChildren();
    [...new Set(items.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim()))].slice(0, 4).forEach(item => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.textContent = item;
      chip.addEventListener('click', () => submitMessage(item));
      chips.appendChild(chip);
    });
  }

  function setOpen(open) {
    panel.classList.toggle('open', open);
    panel.setAttribute('aria-hidden', String(!open));
    fab.setAttribute('aria-expanded', String(open));
    if (open) input.focus();
    else fab.focus();
  }

  function showGreeting() {
    messages.replaceChildren();
    const language = browserLanguage();
    setUiLanguage(language);
    const ui = languageUi[language] || languageUi.en;
    addMessage(ui.greeting, 'bot');
    const user = API.user();
    const prompts = ui.prompts || (user?.role === 'student'
      ? ['What is my schedule today?', 'Which rooms are free now?', 'How do I scan my timetable?']
      : user?.role === 'faculty'
        ? ['Show my classes', 'Any schedule conflicts?', 'How do I generate a schedule?']
        : user?.role === 'admin'
          ? ['Any pending approvals?', 'Any schedule conflicts?', 'How do I add a user?']
          : ['What can you do?', 'How do I sign up?', 'What features are there?']);
    showSuggestions(prompts);
  }

  async function requestReply(message) {
    sending = true;
    send.disabled = true;
    clear.disabled = true;
    showSuggestions([]);

    const pending = document.createElement('div');
    pending.className = 'msg bot typing';
    pending.setAttribute('role', 'status');
    pending.setAttribute('aria-label', 'Assistant is thinking');
    for (let i = 0; i < 3; i++) pending.appendChild(document.createElement('i'));
    messages.appendChild(pending);
    messages.scrollTop = messages.scrollHeight;

    try {
      const result = await API.post('/chat', { message });
      if (!result || typeof result.reply !== 'string') throw new Error('The assistant returned an invalid response.');
      pending.remove();
      addMessage(result.reply, 'bot');
      if (typeof result.language === 'string') setUiLanguage(result.language);
      showSuggestions(Array.isArray(result.suggestions) ? result.suggestions : []);
    } catch (error) {
      pending.remove();
      const failure = addMessage(`I couldn't reach the assistant. ${error.message || 'Please try again.'}`, 'bot');
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'chat-retry';
      retry.textContent = 'Try again';
      retry.addEventListener('click', () => {
        failure.remove();
        requestReply(message);
      });
      failure.appendChild(document.createElement('br'));
      failure.appendChild(retry);
    } finally {
      sending = false;
      send.disabled = false;
      clear.disabled = false;
      if (panel.classList.contains('open')) input.focus();
    }
  }

  function submitMessage(text) {
    const message = text.trim();
    if (!message || sending) return;

    addMessage(message, 'me');
    input.value = '';
    requestReply(message);
  }

  fab.addEventListener('click', () => setOpen(!panel.classList.contains('open')));
  close.addEventListener('click', () => setOpen(false));
  clear.addEventListener('click', showGreeting);
  form.addEventListener('submit', event => {
    event.preventDefault();
    submitMessage(input.value);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel.classList.contains('open')) setOpen(false);
  });

  showGreeting();
})();
