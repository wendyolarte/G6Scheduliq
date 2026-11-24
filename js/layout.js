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
    const savedTheme = localStorage.getItem('scheduliq-theme');
    document.documentElement.dataset.theme = savedTheme === 'dark' ? 'dark' : 'light';
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
        <button class="sidebar-close-btn" id="closeMenuBtn" type="button" aria-label="Close navigation" aria-controls="sidebar" aria-expanded="false">× Close menu</button>
        <nav class="nav">${nav}</nav>
        <div class="side-foot"><div>${esc(user.name)}</div><div class="muted">${esc(user.email)}</div></div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="menu-btn" id="menuBtn" type="button" aria-label="Hide navigation" aria-controls="sidebar" aria-expanded="true">☰</button>
          <span class="mode-pill ${user.role}">${Layout.modeName[user.role]}</span>
          <div class="spacer"></div>
          <span class="avatar" title="${esc(user.name)}">${esc(user.name.trim()[0].toUpperCase())}</span>
          <button class="btn secondary sm theme-btn" id="themeBtn" type="button" aria-label="Switch to dark mode" aria-pressed="false">🌙</button>
          <button class="btn secondary sm" id="logoutBtn">Log out</button>
        </header>
        <div class="page" id="pageHost"></div>
      </div>`;
    body.prepend(shell);
    $('#pageHost').appendChild(content);
    const sidebar = $('#sidebar'), menuBtn = $('#menuBtn'), closeMenuBtn = $('#closeMenuBtn');
    const themeBtn = $('#themeBtn');
    let theme = document.documentElement.dataset.theme;
    const mobileNav = window.matchMedia('(max-width: 820px)');
    let isMobile = mobileNav.matches, navOpen = !isMobile;
    const setNavOpen = open => {
      navOpen = open;
      shell.classList.toggle('nav-collapsed', !isMobile && !navOpen);
      sidebar.classList.toggle('open', isMobile && navOpen);
      menuBtn.setAttribute('aria-expanded', String(navOpen));
      menuBtn.setAttribute('aria-label', navOpen ? 'Hide navigation' : 'Show navigation');
      closeMenuBtn.setAttribute('aria-expanded', String(navOpen));
    };
    setNavOpen(navOpen);
    menuBtn.onclick = () => setNavOpen(!navOpen);
    closeMenuBtn.onclick = () => setNavOpen(false);
    $('#pageHost').onclick = () => { if (isMobile) setNavOpen(false); };
    const updateThemeButton = () => {
      const next = theme === 'dark' ? 'light' : 'dark';
      themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
      themeBtn.setAttribute('aria-label', `Switch to ${next} mode`);
      themeBtn.setAttribute('aria-pressed', String(theme === 'dark'));
      themeBtn.title = `Switch to ${next} mode`;
    };
    themeBtn.onclick = () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = theme;
      localStorage.setItem('scheduliq-theme', theme);
      updateThemeButton();
    };
    updateThemeButton();
    window.addEventListener('resize', () => {
      if (mobileNav.matches === isMobile) return;
      isMobile = mobileNav.matches;
      setNavOpen(!isMobile);
    });
    $('#logoutBtn').onclick = () => API.logout();
    API.get('/auth/me').then(u => API.save(API.token(), u)).catch(() => {});   // refresh profile / detect deactivated account
  }
};
document.addEventListener('DOMContentLoaded', () => Layout.init());
