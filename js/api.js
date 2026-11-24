/* API client: talks to the Express/MySQL backend and keeps the login session */
const PRODUCTION_API_BASE = "g6scheduliq-production.up.railway.app";
const API = {
  base: PRODUCTION_API_BASE || ((['5500', '5501', '8080'].includes(location.port) || location.protocol === 'file:') ? 'http://localhost:3000/api' : '/api'),
  token: () => localStorage.getItem('ss_token'),
  user: () => { try { return JSON.parse(localStorage.getItem('ss_user')); } catch { return null; } },
  save(token, user) { localStorage.setItem('ss_token', token); localStorage.setItem('ss_user', JSON.stringify(user)); },
  clear() { localStorage.removeItem('ss_token'); localStorage.removeItem('ss_user'); },
  loginUrl: () => (location.pathname.includes('/pages/') ? 'login.html' : 'pages/login.html'),

  async req(method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (API.token()) headers.Authorization = 'Bearer ' + API.token();
    let res;
    try {
      res = await fetch(API.base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw Object.assign(new Error('Cannot reach the server. Is it running? (npm start)'), { status: 0 });
    }
    const data = await res.json().catch(() => null);
    if (res.status === 401 && API.token()) {           // expired session
      API.clear();
      location.replace(API.loginUrl());
    }
    if (!res.ok) {
      let error = 'Request failed';
      if (data && data.error) error = data.error;
      else if (data === null) error = 'The API returned a non-JSON response. Check PRODUCTION_API_BASE and confirm the Express backend is running.';
      else if (res.status === 404) error = 'API endpoint not found. Deploy the Express backend and set PRODUCTION_API_BASE.';
      throw Object.assign(new Error(error), { status: res.status, data });
    }
    return data;
  },
  get: u => API.req('GET', u),
  post: (u, b) => API.req('POST', u, b || {}),
  put: (u, b) => API.req('PUT', u, b || {}),
  del: u => API.req('DELETE', u),
  logout() { API.clear(); location.href = API.loginUrl(); }
};