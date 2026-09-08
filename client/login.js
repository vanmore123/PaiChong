(() => {
  'use strict';
  const copy = (value) => window.PaichongProductCopy?.text(value) ?? value;

  const sessions = window.PaichongSession;
  const STORAGE_KEY = sessions?.storageKey || 'paichong-auth-v1';
  const DEMO_ACCOUNTS = {
    user: {
      account: '13800138000',
      password: 'user123',
      accountLabel: '手机号',
      placeholder: '请输入手机号',
      inputMode: 'tel',
      description: '查看宠物行程，提交材料并确认运输方案。',
      sampleLabel: '使用用户体验账号',
      submitLabel: '登录用户端'
    },
    driver: {
      account: 'driver001', password: 'driver123', accountLabel: '司机账号', placeholder: '请输入司机账号', inputMode: 'text',
      description: '查看分配任务，完成验宠、运输记录与签收。', sampleLabel: '使用司机体验账号', submitLabel: '登录司机端'
    },
    partner: {
      account: 'partner001', password: 'partner123', accountLabel: '机构账号', placeholder: '请输入合作机构账号', inputMode: 'text',
      description: '提交合作点余量，查看总部审核与生效结果。', sampleLabel: '使用机构体验账号', submitLabel: '登录合作机构'
    },
    ops: {
      account: 'ops001',
      password: 'ops123',
      accountLabel: '运营账号',
      placeholder: '请输入运营账号',
      inputMode: 'text',
      description: '审核订单、管理合作点容量，编排线路并安排派车交接。',
      sampleLabel: '使用经营者体验账号',
      submitLabel: '登录经营者后台'
    }
  };

  const byId = (id) => document.getElementById(id);
  const allowedRoles = sessions?.allowedRoles || ['user', 'ops', 'driver', 'partner'];
  const allEntryTabs = Array.from(document.querySelectorAll('.entry-tab'));
  allEntryTabs.forEach((tab) => { tab.hidden = !allowedRoles.includes(tab.dataset.entry); });
  const entryTabs = allEntryTabs.filter((tab) => !tab.hidden);
  document.querySelector('.entry-switch').dataset.entryCount = String(entryTabs.length);
  let selectedEntry = allowedRoles[0], busy = false;
  const readSession = () => { try { return sessions ? sessions.read() : JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; } };
  const destination = (role) => sessions ? sessions.destination(role) : role === 'driver' ? './driver.html' : role === 'partner' ? './partner.html' : './client-review.html';

  function showError(message = '') {
    const error = byId('login-error');
    error.textContent = message;
    error.hidden = !message;
    [byId('account'), byId('password')].forEach((input) => {
      if (!message) input.removeAttribute('aria-invalid');
    });
  }

  function selectEntry(entry) {
    const demo = DEMO_ACCOUNTS[entry];
    if (!demo || !allowedRoles.includes(entry) || busy) return;
    selectedEntry = entry;
    entryTabs.forEach((tab) => {
      const active = tab.dataset.entry === entry;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    byId('entry-description').textContent = demo.description;
    byId('account-label').textContent = demo.accountLabel;
    byId('account').placeholder = demo.placeholder;
    byId('account').inputMode = demo.inputMode;
    byId('fill-sample').querySelector('.sample-label').textContent = demo.sampleLabel;
    byId('sample-account').textContent = `${demo.account} / ${demo.password}`;
    byId('submit-label').textContent = demo.submitLabel;
    byId('fill-second-user').hidden = entry !== 'user';
    showError();
  }

  function fillSample() {
    const demo = DEMO_ACCOUNTS[selectedEntry];
    byId('account').value = demo.account;
    byId('password').value = demo.password;
    byId('account').removeAttribute('aria-invalid');
    byId('password').removeAttribute('aria-invalid');
    showError();
    byId('password').focus();
  }

  function togglePassword() {
    const input = byId('password');
    const button = byId('password-toggle');
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    button.setAttribute('aria-pressed', String(!visible));
    button.setAttribute('aria-label', visible ? '显示密码' : '隐藏密码');
    input.focus();
  }

  function setBusy(busy) {
    setBusyState(busy);
    const button = byId('submit-login');
    button.disabled = busy;
    button.classList.toggle('is-busy', busy);
    button.setAttribute('aria-busy', String(busy));
    byId('submit-label').textContent = busy ? '正在验证账号…' : DEMO_ACCOUNTS[selectedEntry].submitLabel;
    button.querySelector('.button-arrow use').setAttribute('href', `./assets/v5/icons/app-sprite.svg#icon-${busy ? 'loader' : 'arrow-right'}`);
  }

  function setBusyState(value) {
    busy = value;
    entryTabs.forEach((tab) => { tab.disabled = value; });
    ['fill-sample', 'fill-second-user', 'logout-session'].forEach((id) => { if (byId(id)) byId(id).disabled = value; });
  }

  async function showExistingSession() {
    const current = readSession(), box = byId('current-session');
    if (!box) return;
    box.hidden = !current?.token;
    if (!current?.token) return;
    byId('current-session-copy').textContent = '正在核对当前身份…';
    byId('continue-session').hidden = true;
    try {
      const verified = sessions
        ? await sessions.request('/api/auth/me', { expectedToken: current.token })
        : await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${current.token}` } }).then(async (response) => { if (!response.ok) throw new Error('登录已失效'); return response.json(); });
      if (readSession()?.token !== current.token) return;
      if (verified.role !== current.role || verified.account !== current.account) throw new Error('已有身份与验证结果不一致，请退出后重试。');
      const accepted = allowedRoles.includes(verified.role);
      byId('current-session-copy').textContent = `当前已登录：${sessions?.roleLabels[verified.role] || verified.role} · ${verified.account}${accepted ? '' : '；此身份不属于当前入口'}`;
      byId('continue-session').href = destination(verified.role);
      byId('continue-session').hidden = !accepted;
    } catch (error) { byId('current-session-copy').textContent = error.message || '已有身份暂时无法核对，可重新登录。'; }
  }

  function authPayload(payload, fallbackAccount) {
    const source = payload.auth || payload.data || payload;
    const profile = source.user || source.operator || source.profile || {};
    const role = source.role || profile.role || '';
    return {
      token: source.token || source.accessToken || '',
      role,
      account: source.account || profile.account || fallbackAccount,
      name: copy(source.name || profile.name) || (role === 'ops' ? '总部运营' : '宠物主人')
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    showError();
    const accountInput = byId('account');
    const passwordInput = byId('password');
    const account = accountInput.value.trim();
    const password = passwordInput.value;

    if (!account) {
      accountInput.setAttribute('aria-invalid', 'true');
      showError(`请输入${DEMO_ACCOUNTS[selectedEntry].accountLabel}`);
      accountInput.focus();
      return;
    }
    if (!password) {
      passwordInput.setAttribute('aria-invalid', 'true');
      showError('请输入登录密码');
      passwordInput.focus();
      return;
    }

    const previous = readSession();
    setBusy(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, password })
      });
      let payload = {};
      try { payload = await response.json(); } catch { /* An empty response is handled below. */ }
      if (!response.ok) throw new Error(payload.error || payload.message || '账号或密码不正确');

      const auth = authPayload(payload, account);
      if (!auth.token || !['user', 'ops', 'driver', 'partner'].includes(auth.role)) throw new Error('登录结果缺少有效身份，请重试');
      if (!allowedRoles.includes(auth.role)) {
        try { await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${auth.token}` } }); } catch { /* Never persist a token for the wrong portal. */ }
        throw new Error(sessions?.kind === 'client' ? '这是客户端，请使用宠物主人账号；员工请打开工作端。' : '这是工作端，请使用经营者、司机或机构账号。');
      }
      if (sessions) sessions.save(auth, previous?.token || '');
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
      window.location.assign(destination(auth.role));
    } catch (error) {
      showError(error.message || '暂时无法登录，请稍后重试');
      passwordInput.setAttribute('aria-invalid', 'true');
      passwordInput.focus();
      setBusy(false);
    }
  }

  entryTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectEntry(tab.dataset.entry));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = event.key === 'ArrowRight' ? (index + 1) % entryTabs.length : (index - 1 + entryTabs.length) % entryTabs.length;
      entryTabs[nextIndex].focus();
      selectEntry(entryTabs[nextIndex].dataset.entry);
    });
  });
  byId('fill-sample').addEventListener('click', fillSample);
  byId('fill-second-user').addEventListener('click', () => {
    byId('account').value = '13800138001';
    byId('password').value = 'user123';
    showError();
    byId('password').focus();
  });
  byId('password-toggle').addEventListener('click', togglePassword);
  byId('logout-session')?.addEventListener('click', async () => {
    if (busy) return;
    const current = readSession(); setBusy(true);
    try { if (sessions) await sessions.logout(current?.token || ''); else localStorage.removeItem(STORAGE_KEY); }
    catch (error) { showError(error.message); }
    finally { setBusy(false); showExistingSession(); }
  });
  byId('login-form').addEventListener('submit', handleSubmit);
  [byId('account'), byId('password')].forEach((input) => input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    showError();
  }));
  const requestedEntry = new URLSearchParams(window.location.search || '').get('entry');
  selectEntry(allowedRoles.includes(requestedEntry) ? requestedEntry : allowedRoles[0]);
  if (window.PAICHONG_DEMO_MODE) {
    byId('login-environment').textContent = '同一浏览器双端联动，不跨设备同步';
    document.querySelector('.identity-tip p').textContent = '可使用下方体验账号进入对应角色。';
  }
  showExistingSession();
})();
