(() => {
  'use strict';
  const copy = (value) => window.PaichongProductCopy?.text(value) ?? value;
  const session = window.PaichongSession;
  const main = document.getElementById('partner-main');
  const nav = document.getElementById('partner-nav');
  const statusLabels = { pending: '待总部审核', approved: '已通过 · 已生效', returned: '已退回 · 未生效' };
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const dateOf = value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  const tomorrow = () => new Date(Date.now() + 32 * 3600000).toISOString().slice(0, 10);
  const icon = name => './assets/v5/icons/' + name + '.svg';
  const state = { auth: null, role: '', tab: 'submit', date: tomorrow(), am: '', pm: '', note: '', minDate: tomorrow(), maxDate: '', node: null, days: [], current: [], items: [], filter: 'pending', selected: '', reviewNote: '', loading: false, busy: false, error: '', actionError: '', pending: null, pendingReview: null, version: 0 };
  let toastTimer;
  let draftKey = '';
  let reviewKey = '';
  let stale = false;

  function readLocal(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
  function writeLocal(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function assertCurrent() { session.assertCurrent(state.auth.token); }
  function api(path, options = {}) { return session.request(path, { ...options, expectedToken: state.auth.token }); }
  function toast(message) { const el = document.getElementById('partner-toast'); el.textContent = message; el.classList.add('is-visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3500); }
  function login() { window.location.replace('./login.html?entry=' + (state.role === 'ops' ? 'ops' : 'partner')); }
  function handleError(error) {
    if (error.code === 'SESSION_CHANGED') { stale = true; state.version++; main.innerHTML = '<section class="partner-card partner-empty"><h2>账号已在另一页面切换</h2><p class="partner-muted">为避免误操作，当前页面已停止提交。请重新进入工作端。</p><a class="partner-secondary" href="./login.html?entry=partner">重新进入</a></section>'; nav.hidden = true; return true; }
    if (error.statusCode === 401 || error.status === 401) { login(); return true; }
    return false;
  }
  function saveDraft() { if (draftKey) writeLocal(draftKey, { date: state.date, am: state.am, pm: state.pm, note: state.note, pending: state.pending }); }
  function resetDraft() { localStorage.removeItem(draftKey); state.pending = null; state.am = ''; state.pm = ''; state.note = ''; }
  function decorate(item) {
    const rows = ['AM', 'PM'].map(period => {
      const current = (item.current || {})[period] || {};
      const proposed = Number((item.capacities || {})[period]);
      return { period, label: period === 'AM' ? '上午' : '下午', capacity: current.capacity, occupied: Number(current.occupied || 0), remaining: current.remaining, proposed, expected: Math.max(0, proposed - Number(current.occupied || 0)), conflict: proposed < Number(current.occupied || 0) };
    });
    const expired = item.date < tomorrow();
    return { ...item, rows, expired, canApprove: item.status === 'pending' && !item.isStale && !expired && !rows.some(row => row.conflict) };
  }
  function badge(item) { return '<span class="partner-badge ' + escape(item.status) + '">' + escape(statusLabels[item.status] || item.status) + '</span>'; }
  function errorBox(message) { return message ? '<div class="partner-error" role="alert">' + escape(message) + '</div>' : ''; }
  function empty(title, body) { return '<section class="partner-card partner-empty"><img src="' + icon('node') + '" alt="" /><h2>' + escape(title) + '</h2><p class="partner-muted">' + escape(body) + '</p></section>'; }
  function slotView(slot) {
    return '<div class="partner-slot"><div class="partner-row"><strong>' + (slot.period === 'AM' ? '上午' : '下午') + '</strong><span class="partner-badge ' + (slot.available ? 'approved' : '') + '">' + (slot.available ? '可预约' : '暂不可约') + '</span></div><div class="partner-metrics"><span>总笼位<strong>' + escape(slot.capacity) + '</strong></span><span>已占用<strong>' + escape(slot.occupied) + '</strong></span><span>可用余量<strong>' + escape(slot.remaining) + '</strong></span></div>' + (slot.blockedReason ? '<p class="partner-muted">' + escape(slot.blockedReason) + '</p>' : '') + '</div>';
  }
  function dateField() { return '<label class="partner-field">' + (state.tab === 'calendar' ? '日历起始日期' : '申报日期') + '<input type="date" id="capacity-date" value="' + escape(state.date) + '" min="' + escape(state.minDate) + '" max="' + escape(state.maxDate) + '" ' + (state.busy || state.loading || state.pending ? 'disabled' : '') + ' /></label>'; }
  function submitView() {
    const disabled = state.busy || state.loading || state.pending ? ' disabled' : '';
    return dateField() + '<div class="partner-banner partner-warning">申报的是该日各时段的<strong>总笼位</strong>，不是新增余量。总部通过前，现有容量保持不变。</div><section class="partner-card"><h2>当前已生效容量</h2>' + state.current.map(slotView).join('') + '</section><form id="capacity-form" class="partner-card"><h2>申请调整为</h2>' + (state.pending ? '<div class="partner-banner partner-warning">上次提交结果待确认，原始申报已锁定保存。请重试原申报，系统会识别同一申请。</div>' : '') + '<div class="partner-columns"><label class="partner-field">上午总笼位<input id="capacity-am" type="number" inputmode="numeric" min="0" max="100" step="1" required value="' + escape(state.am) + '"' + disabled + ' /></label><label class="partner-field">下午总笼位<input id="capacity-pm" type="number" inputmode="numeric" min="0" max="100" step="1" required value="' + escape(state.pm) + '"' + disabled + ' /></label></div><label class="partner-field">调整说明 · 选填<textarea id="capacity-note" maxlength="200" placeholder="例如：下午安排清洁消毒，申请减少接待量"' + disabled + '>' + escape(state.note) + '</textarea></label><p class="partner-muted">每时段 0–100 个总笼位；不能低于实际占用。同一天只能有一条待审申请。请勿填写真实个人资料。</p>' + errorBox(state.actionError) + '<button class="partner-primary" type="submit" ' + (state.busy || state.loading ? 'disabled' : '') + '><img src="' + icon('file-check') + '" alt="" />' + (state.busy ? '正在提交…' : state.pending ? '重试原申报' : '提交总部审核') + '</button></form>';
  }
  function historyView() {
    return state.items.length ? state.items.map(item => '<article class="partner-card"><div class="partner-row"><strong>' + escape(item.date) + '</strong>' + badge(item) + '</div><p class="partner-values">申请总笼位：上午 ' + escape(item.capacities.AM) + ' / 下午 ' + escape(item.capacities.PM) + '</p><p class="partner-muted">提交于 ' + escape(dateOf(item.submittedAt)) + '</p>' + (item.note ? '<p class="partner-review-note">申报说明：' + escape(copy(item.note)) + '</p>' : '') + (item.isStale && item.status === 'pending' ? '<div class="partner-banner partner-warning">提交后容量配置已变化，需总部退回后重新申报。</div>' : '') + (item.reviewNote ? '<p class="partner-review-note">总部说明：' + escape(copy(item.reviewNote)) + '</p>' : '') + (item.reviewedAt ? '<p class="partner-muted">审核于 ' + escape(dateOf(item.reviewedAt)) + '</p>' : '') + (item.status === 'returned' ? '<p class="partner-muted">原申请未生效，可修改后重新申报。</p>' : '') + '</article>').join('') : empty('还没有申报记录', '提交后，可在这里查看总部的审核结果。');
  }
  function partnerView() {
    let body = state.node ? (state.tab === 'submit' ? submitView() : state.tab === 'calendar' ? dateField() + '<p class="partner-note">已生效的 7 天容量。占用随预约与交接变化，余量不代表一定可约。</p>' + state.days.map(day => '<section class="partner-card"><h2>' + escape(day.date) + '</h2>' + day.slots.map(slotView).join('') + '</section>').join('') : historyView()) : (!state.loading ? empty('合作点尚未载入', '请刷新重试；这里只显示当前机构账号绑定的合作点。') : '');
    return '<section class="partner-hero"><div><span class="partner-eyebrow">合作机构 · 容量管理</span><h1>照顾好每一个<br />小客人</h1><p>' + escape(state.node ? state.node.name : '我的合作点') + '</p></div><img src="./assets/v5/brand/paichong-logo.png" alt="派宠猫狗专车" /></section><p class="partner-note">仅展示当前机构的容量与申报记录，不含客户个人资料。</p>' + errorBox(state.error) + body;
  }
  function reviewDetail(item) {
    const locked = state.busy || !!state.pendingReview;
    return '<button type="button" class="partner-link" data-action="list" ' + (locked ? 'disabled' : '') + '>‹ 返回申报列表</button><section class="partner-card"><div class="partner-row"><h3>' + escape(item.nodeName) + '</h3>' + badge(item) + '</div><p class="partner-date">' + escape(item.date) + '</p><p class="partner-muted">' + escape(item.submittedBy) + ' · ' + escape(dateOf(item.submittedAt)) + '</p>' + (item.note ? '<p class="partner-review-note">机构说明：' + escape(copy(item.note)) + '</p>' : '') + '</section><div class="partner-banner partner-warning">申请值是时段总容量，不是累加余量。下方为最近刷新结果，通过时会再次核验实际占用。</div>' + item.rows.map(row => '<section class="partner-card"><h2>' + row.label + '</h2><div class="partner-compare"><div><span class="partner-muted">当前总笼位</span><strong>' + escape(row.capacity) + '</strong></div><span>→</span><div><span class="partner-muted">申请总笼位</span><strong>' + escape(row.proposed) + '</strong></div></div><p class="partner-muted">当前占用 ' + escape(row.occupied) + ' · 当前余量 ' + escape(row.remaining) + '</p><p class="partner-values">' + (item.status === 'pending' ? '如通过，预计余量' : '按申请值与当前占用测算余量') + ' <strong>' + escape(row.expected) + '</strong></p>' + (row.conflict ? errorBox('申请低于当前占用，不能通过。请退回机构修改。') : '') + '</section>').join('') + (item.isStale && item.status === 'pending' ? '<div class="partner-banner partner-warning">申报后节点配置已变化。为避免覆盖新设置，请退回机构重新申报。</div>' : '') + (item.expired && item.status === 'pending' ? '<div class="partner-banner partner-warning">此申请已过可审核日期，请退回机构选择未来日期。</div>' : '') + (item.status === 'pending' || state.pendingReview ? '<section class="partner-card"><h2>总部审核</h2>' + (state.pendingReview ? '<div class="partner-banner partner-warning">上次审核结果未确认，已保留原审核动作与说明。请核对或重试，不能改成相反动作。</div>' : '') + '<label class="partner-field">审核说明 · 退回必填<textarea id="review-note" maxlength="200" placeholder="写明核实依据，或需要机构调整的原因" ' + (locked ? 'disabled' : '') + '>' + escape(state.reviewNote) + '</textarea></label>' + errorBox(state.actionError) + (state.pendingReview ? '<button type="button" class="partner-primary" data-action="retry-review" ' + (state.busy || state.loading ? 'disabled' : '') + '>重试原审核</button>' : '<button type="button" class="partner-primary" data-action="approve" ' + (state.busy || state.loading || !item.canApprove ? 'disabled' : '') + '>通过并更新容量</button><button type="button" class="partner-secondary" data-action="return" ' + (state.busy || state.loading ? 'disabled' : '') + '>退回修改，保持原容量</button>') + '</section>' : '<section class="partner-card"><h2>审核结果</h2><p class="partner-values">' + escape(statusLabels[item.status]) + '</p>' + (item.reviewNote ? '<p class="partner-review-note">' + escape(copy(item.reviewNote)) + '</p>' : '') + '<p class="partner-muted">审核于 ' + escape(dateOf(item.reviewedAt)) + '。历史申请保留；当前容量以后续已生效配置为准。</p>' + errorBox(state.actionError) + '</section>');
  }
  function opsView() {
    const selected = state.items.find(item => item.id === state.selected);
    const items = state.items.filter(item => state.filter === 'all' || item.status === state.filter);
    return '<section class="partner-hero"><div><span class="partner-eyebrow">合肥总部 · 合作机构协作</span><h1>每一份容量<br />都核实好</h1><p>机构申报与审核</p></div><img src="./assets/v5/brand/paichong-logo.png" alt="派宠猫狗专车" /></section>' + errorBox(state.error) + (selected ? reviewDetail(selected) : '<div class="partner-banner">机构提交 → 总部审核 → 通过后生效<br />退回只记录原因，不改变已生效容量。</div>' + (state.pendingReview ? errorBox('有一条审核结果尚未确认，请刷新恢复原申请后重试。') : '') + '<div class="partner-tabs" role="tablist" aria-label="申请状态">' + [['pending', '待审核'], ['approved', '已通过'], ['returned', '已退回'], ['all', '全部']].map(([id, label]) => '<button type="button" role="tab" aria-selected="' + (state.filter === id) + '" class="' + (state.filter === id ? 'is-active' : '') + '" data-filter="' + id + '" ' + (state.busy || state.pendingReview ? 'disabled' : '') + '>' + label + '</button>').join('') + '</div>' + (items.length ? items.map(item => '<button type="button" class="partner-card" data-select="' + escape(item.id) + '"><div class="partner-row"><h3>' + escape(item.nodeName) + '</h3>' + badge(item) + '</div><p class="partner-date">' + escape(item.date) + '</p><p class="partner-values">申请总笼位：上午 ' + escape(item.capacities.AM) + ' / 下午 ' + escape(item.capacities.PM) + '</p><p class="partner-muted">提交于 ' + escape(dateOf(item.submittedAt)) + '</p>' + (item.isStale ? '<p class="partner-muted">配置已变化，需退回重报</p>' : '') + '<div class="partner-more">核对申报与当前占用 ›</div></button>').join('') : !state.loading ? empty('当前没有此类申请', '新申报会出现在待审核列表，可刷新核对。') : ''));
  }
  function render() {
    if (stale) return;
    main.setAttribute('aria-busy', String(state.loading || state.busy));
    main.innerHTML = (state.role === 'ops' ? opsView() : partnerView()) + (state.loading ? '<p class="partner-loading" role="status">正在更新容量与申报…</p>' : '');
    document.getElementById('partner-refresh').disabled = state.busy || state.loading;
    const navItems = state.role === 'partner' ? [['submit', '申报容量', 'file-check'], ['calendar', '7 天容量', 'calendar'], ['history', '审核记录', 'order']] : [['workbench', '工作台', 'workbench'], ['requests', '容量审批', 'file-check']];
    nav.innerHTML = navItems.map(([id, label, image]) => '<button type="button" data-nav="' + id + '" class="' + ((state.role === 'partner' ? state.tab === id : id === 'requests') ? 'is-active' : '') + '" ' + (state.busy ? 'disabled' : '') + '><img src="' + icon(image) + '" alt="" />' + label + '</button>').join('') + '<button type="button" data-nav="logout" ' + (state.busy ? 'disabled' : '') + '><img src="' + icon('logout') + '" alt="" />切换账号</button>';
    nav.hidden = false;
  }
  async function load() {
    if (state.busy || stale) return;
    const version = ++state.version;
    state.loading = true; state.error = ''; render();
    try {
      assertCurrent();
      if (state.role === 'partner') {
        const [result, history] = await Promise.all([api('/api/partner/node?date=' + encodeURIComponent(state.date) + '&days=7'), api('/api/partner/capacity-requests')]);
        if (version !== state.version) return;
        const grouped = {};
        const slots = result.calendar && result.calendar.items || [];
        slots.forEach(slot => { (grouped[slot.date] ||= { date: slot.date, slots: [] }).slots.push(slot); });
        state.node = result.node; state.days = Object.values(grouped); state.current = slots.filter(slot => slot.date === state.date); state.minDate = result.minDate || tomorrow(); state.maxDate = result.maxDate || ''; state.items = history.items || [];
        if (!state.pending && state.am === '' && state.pm === '') { state.am = String((state.current.find(slot => slot.period === 'AM') || {}).capacity ?? ''); state.pm = String((state.current.find(slot => slot.period === 'PM') || {}).capacity ?? ''); }
      } else {
        const result = await api('/api/ops/capacity-requests');
        if (version !== state.version) return;
        state.items = (result.items || []).map(decorate);
        if (state.pendingReview) { state.selected = state.pendingReview.id; state.reviewNote = state.pendingReview.note; }
      }
    } catch (error) { if (version === state.version && !handleError(error)) state.error = error.message || '加载失败，请刷新重试。'; }
    finally { if (version === state.version) { state.loading = false; render(); } }
  }
  async function submit() {
    if (state.busy || state.loading || stale) return;
    const capacities = { AM: Number(state.am), PM: Number(state.pm) };
    if (!state.pending && (state.am.trim() === '' || state.pm.trim() === '' || !Object.values(capacities).every(value => Number.isInteger(value) && value >= 0 && value <= 100))) { state.actionError = '上午和下午总笼位均须为 0–100 的整数。'; render(); return; }
    if (!state.pending && (state.date < state.minDate || state.maxDate && state.date > state.maxDate)) { state.actionError = '请选择明天至未来 31 天内的申报日期。'; render(); return; }
    const payload = state.pending || { requestId: 'CAP-H5-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12), date: state.date, capacities, note: state.note.trim().slice(0, 200) };
    if (!window.confirm(payload.date + '：上午总笼位 ' + payload.capacities.AM + '，下午总笼位 ' + payload.capacities.PM + '。\n这是总容量，不是新增余量。确认提交总部审核？')) return;
    state.busy = true; state.actionError = '';
    try {
      assertCurrent(); state.pending = payload; saveDraft(); render();
      await api('/api/partner/capacity-requests', { method: 'POST', body: payload });
      resetDraft(); state.tab = 'history'; toast('已提交，等待总部审核');
    } catch (error) {
      if (!handleError(error)) {
        if ((error.statusCode || error.status) >= 400 && (error.statusCode || error.status) < 500) { state.pending = null; saveDraft(); }
        state.actionError = error.message || '提交结果未确认，请重试原申报。';
      }
    } finally { state.busy = false; render(); }
    if (!stale && !state.actionError) await load();
  }
  async function review(action) {
    if (state.busy || state.loading || stale) return;
    const item = state.items.find(item => item.id === state.selected);
    const payload = state.pendingReview || { id: item && item.id, action, note: state.reviewNote.trim().slice(0, 200) };
    if (!payload.id || !['approve', 'return'].includes(payload.action)) return;
    if (!state.pendingReview && item.status !== 'pending') return;
    if (payload.action === 'return' && !payload.note) { state.actionError = '退回须填写原因，方便机构修改后重新申报。'; render(); return; }
    if (!state.pendingReview && payload.action === 'approve' && !item.canApprove) { state.actionError = '请核对过期、配置变更或占用冲突，并退回机构修改。'; render(); return; }
    if (!window.confirm(payload.action === 'approve' ? '确认通过该申报？\n通过时将再次核验占用，仅更新申请日期的两个时段容量。' : '确认退回该申报？\n原容量保持不变。说明：' + payload.note)) return;
    state.busy = true; state.actionError = '';
    try {
      assertCurrent(); state.pendingReview = payload; writeLocal(reviewKey, payload); render();
      await api('/api/ops/capacity-requests/' + encodeURIComponent(payload.id) + '/review', { method: 'POST', body: { action: payload.action, note: payload.note } });
      localStorage.removeItem(reviewKey); state.pendingReview = null; state.reviewNote = ''; toast(payload.action === 'approve' ? '已通过，容量已生效' : '已退回，原容量不变');
    } catch (error) {
      if (!handleError(error)) {
        if ((error.statusCode || error.status) >= 400 && (error.statusCode || error.status) < 500) { localStorage.removeItem(reviewKey); state.pendingReview = null; }
        state.actionError = error.message || '审核结果未确认，请刷新核对或重试原审核。';
      }
    } finally { state.busy = false; render(); }
    if (!stale) await load();
  }
  main.addEventListener('input', event => {
    if (state.busy || stale) return;
    const fields = { 'capacity-am': 'am', 'capacity-pm': 'pm', 'capacity-note': 'note' };
    if (fields[event.target.id] && !state.pending) { state[fields[event.target.id]] = event.target.value; state.actionError = ''; try { saveDraft(); } catch { toast('浏览器无法保存草稿，请勿关闭当前页面。'); } }
    if (event.target.id === 'review-note' && !state.pendingReview) { state.reviewNote = event.target.value; state.actionError = ''; }
  });
  main.addEventListener('change', event => { if (event.target.id === 'capacity-date' && !state.busy && !state.pending) { state.date = event.target.value || state.minDate; state.am = ''; state.pm = ''; state.actionError = ''; try { saveDraft(); } catch {} load(); } });
  main.addEventListener('submit', event => { if (event.target.id === 'capacity-form') { event.preventDefault(); submit(); } });
  main.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || button.disabled || state.busy || stale) return;
    if (button.dataset.filter && !state.pendingReview) { state.filter = button.dataset.filter; state.selected = ''; state.actionError = ''; render(); }
    if (button.dataset.select && !state.pendingReview) { state.selected = button.dataset.select; state.reviewNote = ''; state.actionError = ''; render(); window.scrollTo(0, 0); }
    if (button.dataset.action === 'list' && !state.pendingReview) { state.selected = ''; state.actionError = ''; render(); }
    if (['approve', 'return', 'retry-review'].includes(button.dataset.action)) review(button.dataset.action);
  });
  nav.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button || state.busy || stale) return;
    const target = button.dataset.nav;
    if (target === 'logout') {
      if (!window.confirm('切换工作账号？未确认的原申报会按当前账号保留。')) return;
      try { assertCurrent(); await session.logout(state.auth.token); login(); } catch (error) { if (!handleError(error)) { if (!session.read()) login(); else toast(error.message || '退出失败，请重试。'); } }
    } else if (target === 'workbench') window.location.assign('./client-review.html');
    else if (['submit', 'calendar', 'history'].includes(target)) { state.tab = target; state.actionError = ''; render(); window.scrollTo(0, 0); }
  });
  document.getElementById('partner-refresh').addEventListener('click', () => state.role ? load() : start());
  document.getElementById('partner-back').addEventListener('click', event => { if (state.busy) event.preventDefault(); });
  window.addEventListener('storage', event => { if (session && event.key === session.storageKey && state.auth) { try { assertCurrent(); } catch (error) { handleError(error); } } });
  window.addEventListener('beforeunload', event => { if (state.busy) { event.preventDefault(); event.returnValue = ''; } });
  async function start() {
    if (!session) { main.innerHTML = errorBox('工作端会话组件未载入，请刷新页面。'); return; }
    state.auth = session.read();
    if (!state.auth || !state.auth.token) { login(); return; }
    try {
      const response = await api('/api/auth/me');
      const profile = response.auth || response.data || response;
      state.role = profile.role || (profile.user || {}).role;
      if (state.role === 'user') { window.location.replace('./client-review.html'); return; }
      if (state.role === 'driver') { window.location.replace('./driver.html'); return; }
      if (!['partner', 'ops'].includes(state.role)) { main.innerHTML = errorBox('当前账号没有合作机构或总部审核权限。请返回登录页选择工作账号。'); return; }
      state.auth = { ...state.auth, ...profile, token: state.auth.token };
      document.getElementById('partner-title').textContent = state.role === 'ops' ? '机构容量审批' : '我的合作点';
      document.title = (state.role === 'ops' ? '机构容量审批' : '合作机构') + '｜派宠一号';
      document.getElementById('partner-back').hidden = state.role !== 'ops';
      const key = session.storageKey + ':' + window.location.origin + ':' + state.auth.account;
      draftKey = 'pc-h5-capacity-draft-v1:' + key; reviewKey = 'pc-h5-capacity-review-v1:' + key;
      if (state.role === 'partner') {
        const saved = readLocal(draftKey);
        if (saved) {
          state.pending = saved.pending || null;
          state.date = state.pending ? state.pending.date : saved.date || tomorrow();
          state.am = String(state.pending ? state.pending.capacities.AM : saved.am || '');
          state.pm = String(state.pending ? state.pending.capacities.PM : saved.pm || '');
          state.note = state.pending ? state.pending.note || '' : saved.note || '';
          if (!state.pending && state.date < tomorrow()) { state.date = tomorrow(); state.am = ''; state.pm = ''; }
        }
      } else { state.pendingReview = readLocal(reviewKey); }
      await load();
    } catch (error) { if (!handleError(error)) { state.error = error.message || '身份验证失败，请刷新重试。'; main.innerHTML = errorBox(state.error) + '<a class="partner-secondary" href="./login.html?entry=partner">返回登录页</a>'; main.setAttribute('aria-busy', 'false'); } }
  }
  start();
})();
