document.addEventListener('DOMContentLoaded', () => {
  if (API.token() && API.user()) { location.replace('dashboard.html'); return; }
  let mode = 'student';
  const err = $('#err');
  $$('#modeSeg button').forEach(b => b.onclick = () => {
    mode = b.dataset.mode;
    $$('#modeSeg button').forEach(x => x.classList.toggle('active', x === b));
    $('#signupLine').classList.toggle('hidden', mode === 'admin');   // admins cannot self-register
    err.classList.add('hidden');
  });

  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    err.classList.add('hidden');
    const email = $('#email').value.trim(), password = $('#password').value;
    if (!email || !password) { err.textContent = 'Enter your email and password.'; err.classList.remove('hidden'); return; }
    const btn = $('#submitBtn'); btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const r = await API.post('/auth/login', { email, password, mode });
      API.save(r.token, r.user);
      const next = new URLSearchParams(location.search).get('next');
      location.href = next && /^[a-z]+\.html$/.test(next) ? next : 'dashboard.html';
    } catch (ex) {
      err.textContent = ex.message; err.classList.remove('hidden');
      btn.disabled = false; btn.textContent = 'Log in';
    }
  };
});