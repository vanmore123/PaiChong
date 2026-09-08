(() => {
  'use strict';
  // Portal namespacing is also required when both static demos share one origin.
  const kind = window.PAICHONG_PORTAL_KIND || '';
  const storageKey = kind === 'client' ? 'paichong-auth-client-v1' : kind === 'workbench' ? 'paichong-auth-workbench-v1' : 'paichong-auth-v1';
  const roleLabels = { user: '宠物主人', ops: '经营者', driver: '司机', partner: '合作机构' };
  const allowedRoles = kind === 'client' ? ['user'] : kind === 'workbench' ? ['ops', 'driver', 'partner'] : Object.keys(roleLabels);
  function read() { try { return JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { return null; } }
  let watchedToken = read()?.token || '';
  function destination(role) { return role === 'driver' ? './driver.html' : role === 'partner' ? './partner.html' : './client-review.html'; }
  function allowedRole(role) { return allowedRoles.includes(role); }
  function changedError() { const error = new Error('此入口的账号已在其他标签页切换，请重新加载后继续。'); error.code = 'SESSION_CHANGED'; return error; }
  function notifyChanged() {
    window.dispatchEvent(new CustomEvent('paichong:session-changed'));
    if (!document.body || document.getElementById('paichong-session-alert')) return;
    const cover = document.createElement('section');
    cover.id = 'paichong-session-alert';
    cover.setAttribute('role', 'alertdialog');
    cover.setAttribute('aria-modal', 'true');
    cover.setAttribute('aria-label', '账号已切换');
    cover.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#173e39dc;display:grid;place-items:center;padding:24px;';
    const card = document.createElement('div');
    card.style.cssText = 'width:min(100%,340px);box-sizing:border-box;padding:24px;background:white;border-radius:20px;color:#173e39;font:16px/1.7 system-ui;';
    const copy = document.createElement('p');
    copy.textContent = '账号已在其他标签页切换。为避免用错身份，当前页面已暂停操作，请重新加载。';
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = '重新加载';
    button.style.cssText = 'min-height:46px;width:100%;border:0;border-radius:12px;background:#ff985c;color:#173e39;font:inherit;';
    button.addEventListener('click', () => window.location.reload());
    card.append(copy, button); cover.append(card); document.body.append(cover); button.focus();
  }
  function assertCurrent(expectedToken = watchedToken) {
    if ((read()?.token || '') !== (expectedToken || '')) { notifyChanged(); throw changedError(); }
  }
  function save(auth, expectedToken) {
    if (expectedToken !== undefined) assertCurrent(expectedToken);
    if (!auth?.token || !auth.account || !allowedRole(auth.role)) throw new Error('当前入口不接受此身份，请使用对应入口。');
    localStorage.setItem(storageKey, JSON.stringify(auth)); watchedToken = auth.token;
  }
  function clear(expectedToken = watchedToken) {
    if ((read()?.token || '') !== (expectedToken || '')) return false;
    localStorage.removeItem(storageKey); watchedToken = ''; return true;
  }
  async function request(path, options = {}) {
    const expectedToken = options.expectedToken === undefined ? watchedToken : options.expectedToken;
    assertCurrent(expectedToken);
    const session = read();
    const requiredRole = path.startsWith('/api/user/') ? 'user' : path.startsWith('/api/ops/') || path === '/api/demo/reset' ? 'ops' : path.startsWith('/api/driver/') ? 'driver' : path.startsWith('/api/partner/') ? 'partner' : '';
    if (requiredRole && (!allowedRole(session?.role) || session?.role !== requiredRole)) {
      const error = new Error('当前账号无权使用此操作。'); error.status = error.statusCode = 403; throw error;
    }
    const { expectedToken: ignored, ...requestOptions } = options;
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (expectedToken) headers.Authorization = `Bearer ${expectedToken}`;
    const formData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    if (options.body !== undefined && !formData) headers['Content-Type'] = 'application/json';
    const response = await fetch(path, { ...requestOptions, headers, body: options.body === undefined || formData || typeof options.body === 'string' ? options.body : JSON.stringify(options.body) });
    let data = {}; try { data = await response.json(); } catch { /* HTTP status remains authoritative. */ }
    assertCurrent(expectedToken);
    if (!response.ok) {
      const error = new Error(data.error || data.message || `请求失败（${response.status}）`);
      error.status = error.statusCode = response.status; error.code = data.code || '';
      if (response.status === 401) clear(expectedToken);
      throw error;
    }
    return data;
  }
  async function logout(expectedToken = watchedToken) {
    assertCurrent(expectedToken);
    try { await request('/api/auth/logout', { method: 'POST', body: {}, expectedToken }); }
    finally { clear(expectedToken); }
  }
  window.addEventListener('storage', (event) => {
    if ((event.key === storageKey || event.key === null) && (read()?.token || '') !== watchedToken) notifyChanged();
  });
  window.PaichongSession = { kind, storageKey, allowedRoles, allowedRole, roleLabels, read, save, clear, assertCurrent, request, logout, destination };
})();
