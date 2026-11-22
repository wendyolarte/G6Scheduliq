document.addEventListener('DOMContentLoaded', () => {
  if (API.token() && API.user()) { location.replace('dashboard.html'); return; }
  let role = 'student';
  const err = $('#err');
  $$('#roleSeg button').forEach(b => b.onclick = () => {
    role = b.dataset.role;
    $$('#roleSeg button').forEach(x => x.classList.toggle('active', x === b));
    $('#idLabel').textContent = role === 'student' ? 'Student ID' : 'Employee ID';
  });
  const fail = m => { err.textContent = m; err.classList.remove('hidden'); };

  $('#regForm').onsubmit = async e => {
    e.preventDefault(); err.classList.add('hidden');
    const body = {
      role, name: $('#name').value.trim(), email: $('#email').value.trim(),
      department: $('#department').value.trim(), school_id: $('#school_id').value.trim(), password: $('#password').value
    };
    if (!body.name || !body.email || !body.password) return fail('Please fill in your name, email and password.');
    if (body.password.length < 8) return fail('Password must be at least 8 characters.');
    if (body.password !== $('#confirm').value) return fail('Passwords do not match.');
    const btn = $('#submitBtn'); btn.disabled = true; btn.textContent = 'Creating account…';
    try {
      const r = await API.post('/auth/register', body);
      API.save(r.token, r.user);
      location.href = 'dashboard.html';
    } catch (ex) {
      fail(ex.message); btn.disabled = false; btn.textContent = 'Create account';
    }
  };
});