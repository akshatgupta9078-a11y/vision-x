// public/js/api.js
// Small shared helper used by every page. Keeps the JWT in localStorage
// (this is a real server-rendered app running on your own machine, not a
// sandboxed artifact, so browser storage works normally here).

const VX = {
  TOKEN_KEY: 'visionx_token',
  USER_KEY: 'visionx_user',

  getToken() { return localStorage.getItem(this.TOKEN_KEY); },
  getUser() {
    const raw = localStorage.getItem(this.USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  setSession(token, user) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },
  clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  },

  // Redirects to login if there's no token. Call at the top of every
  // protected page.
  requireAuth() {
    if (!this.getToken()) {
      window.location.href = '/login.html';
      return null;
    }
    return this.getUser();
  },

  async request(path, { method = 'GET', body, isFormData = false } = {}) {
    const headers = {};
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isFormData) headers['Content-Type'] = 'application/json';

    const res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });

    if (res.status === 401) {
      this.clearSession();
      window.location.href = '/login.html';
      throw new Error('Session expired. Please log in again.');
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  },

  renderTopbar(activePage) {
    const user = this.getUser();
    if (!user) return;
    const el = document.getElementById('topbar');
    if (!el) return;
    const usersLink = user.role === 'admin'
      ? `<a href="/users.html" ${activePage === 'users' ? 'style="color:#3B82F6"' : ''}>Users</a>`
      : '';
    el.innerHTML = `
      <div class="brand">VISION-X</div>
      <nav>
        <a href="/dashboard.html" ${activePage === 'dashboard' ? 'style="color:#3B82F6"' : ''}>Dashboard</a>
        <a href="/institutes.html" ${activePage === 'institutes' ? 'style="color:#3B82F6"' : ''}>Institutes</a>
        <a href="/inspections.html" ${activePage === 'inspections' ? 'style="color:#3B82F6"' : ''}>Inspections</a>
        <a href="/map.html" ${activePage === 'map' ? 'style="color:#3B82F6"' : ''}>Map</a>
        <a href="/map3d.html" ${activePage === 'map3d' ? 'style="color:#3B82F6"' : ''}>3D Map</a>
        <a href="/report-submit.html" ${activePage === 'report' ? 'style="color:#3B82F6"' : ''}>Submit report</a>
        ${usersLink}
      </nav>
      <div class="who">
        <span>${user.name} · ${user.role}</span>
        <button class="logout" id="logoutBtn">Log out</button>
      </div>
    `;
    document.getElementById('logoutBtn').addEventListener('click', () => {
      VX.clearSession();
      window.location.href = '/login.html';
    });
  },
};
