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
    addMessage('Hi! I can help with schedules, rooms, account setup, and app features. What would you like to know?', 'bot');
    const user = API.user();
    const prompts = user?.role === 'student'
      ? ['What is my schedule today?', 'Which rooms are free now?', 'How do I scan my timetable?']
      : user?.role === 'faculty'
        ? ['Show my classes', 'Any schedule conflicts?', 'How do I generate a schedule?']
        : user?.role === 'admin'
          ? ['Any pending approvals?', 'Any schedule conflicts?', 'How do I add a user?']
          : ['What can you do?', 'How do I sign up?', 'What features are there?'];
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
