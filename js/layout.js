/* App shell: sidebar, top bar, role-based navigation and page guard.
   Each app page sets <body data-page="..." data-roles="student,faculty,admin">. */
const Layout = {
  ok: false,
  items: [
    { sec: 'Overview' },
    { key: 'dashboard', label: 'Dashboard', href: 'dashboard.html', icon: '🏠', roles: ['student', 'faculty', 'admin'] },
    { key: 'schedule', label: 'Schedules', href: 'schedule.html', icon: '📅', roles: ['student', 'faculty', 'admin'] },
    { key: 'courses', label: 'Courses', href: 'courses.html', icon: '📚', roles: ['student', 'faculty', 'admin'] },
    { key: 'classrooms', label: 'Classrooms', href: 'classrooms.html', icon: '🏫', roles: ['student', 'faculty', 'admin'] },
    { sec: 'Scheduling tools', roles: ['faculty', 'admin'] },
    { key: 'generator', label: 'Auto Generator', href: 'generator.html', icon: '⚙️', roles: ['faculty', 'admin'] },
    { key: 'conflicts', label: 'Conflicts', href: 'conflicts.html', icon: '⚠️', roles: ['faculty', 'admin'] },
    { key: 'approvals', label: 'Approvals', href: 'approvals.html', icon: '✅', roles: ['faculty', 'admin'] },
    { sec: 'Connect' },
    { key: 'scan', label: 'Scan Schedule', href: 'scan.html', icon: '📷', roles: ['student', 'faculty', 'admin'] },
    { key: 'sync', label: 'Sync & Integrations', href: 'sync.html', icon: '🔗', roles: ['student', 'faculty', 'admin'] },
    { sec: 'Administration', roles: ['admin'] },
    { key: 'admin', label: 'Admin Panel', href: 'admin.html', icon: '🛡️', roles: ['admin'] }
  ],
  modeName: { student: 'Student Mode', faculty: 'Faculty/Staff Mode', admin: 'Admin Mode' },

  init() {
    const body = document.body, page = body.dataset.page;
    const roles = (body.dataset.roles || 'student,faculty,admin').split(',');
    const user = API.user();
    if (!API.token() || !user) { location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop())); return; }
    if (!roles.includes(user.role)) { location.replace('dashboard.html'); return; }
    Layout.ok = true;

    const nav = Layout.items.filter(i => !i.roles || i.roles.includes(user.role)).map(i =>
      i.sec ? `<div class="sec">${i.sec}</div>` :
        `<a href="${i.href}" class="${i.key === page ? 'active' : ''}"><span>${i.icon}</span>${i.label}</a>`).join('');
    const content = $('#content');
    const shell = document.createElement('div');
    shell.className = 'app';
    shell.innerHTML = `
      <aside class="sidebar" id="sidebar">
        <div class="brand"><span class="logo">🎓</span>Class Scheduler</div>
        <nav class="nav">${nav}</nav>
        <div class="side-foot"><div>${esc(user.name)}</div><div class="muted">${esc(user.email)}</div></div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="menu-btn" id="menuBtn" aria-label="Menu">☰</button>
          <span class="mode-pill ${user.role}">${Layout.modeName[user.role]}</span>
          <div class="spacer"></div>
          <span class="avatar" title="${esc(user.name)}">${esc(user.name.trim()[0].toUpperCase())}</span>
          <button class="btn secondary sm" id="logoutBtn">Log out</button>
        </header>
        <div class="page" id="pageHost"></div>
      </div>`;
    body.prepend(shell);
    $('#pageHost').appendChild(content);
    $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
    $('#pageHost').onclick = () => $('#sidebar').classList.remove('open');
    $('#logoutBtn').onclick = () => API.logout();
    API.get('/auth/me').then(u => API.save(API.token(), u)).catch(() => {});   // refresh profile / detect deactivated account
  }
};
document.addEventListener('DOMContentLoaded', () => Layout.init());
