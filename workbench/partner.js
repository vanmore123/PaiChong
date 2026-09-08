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
  const handoffEnabled = window.PAICHONG_DEMO_MODE === true;
  const state = { auth: null, role: '', tab: 'submit', date: tomorrow(), am: '', pm: '', note: '', minDate: tomorrow(), maxDate: '', node: null, days: [], current: [], items: [], filter: 'pending', selected: '', reviewNote: '', loading: false, busy: false, error: '', actionError: '', pending: null, pendingReview: null, version: 0 };
  Object.assign(state, { orders: [], orderId: '', orderFilter: 'pending', handoffDrafts: {}, handoffError: '' });
  let toastTimer;
  let draftKey = '';
  let reviewKey = '';
  let handoffKey = '';
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
  const handoffLabels = { reserved: '待用户确认', confirmed: '待到点', arrived: '在点照护', departed: '已交司机', released: '预约已释放' };
  const handoffStep = order => order.nodeReservation?.status === 'arrived' ? 'node-check-out' : 'node-check-in';
  const timeInput = value => value && Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 16) : '';
  function handoffDraft(order) {
    const action = handoffStep(order), key = order.id + ':' + action, reservation = order.nodeReservation || {};
    if (!state.handoffDrafts[key]) {
      const start = action === 'node-check-out' ? Math.max(Date.parse(order.transport?.departureAt) || 0, Date.parse(reservation.checkedInAt) || 0) : Date.parse(reservation.date + 'T' + (reservation.timeSlot || '09:00-12:00').split('-')[0] + ':00+08:00');
      state.handoffDrafts[key] = { note: '', petVerified: false, driverVerified: false, occurredAt: start ? timeInput(new Date(start).toISOString()) : '', pending: null };
    }
    return state.handoffDrafts[key];
  }
  function saveHandoffDrafts() { if (handoffKey) writeLocal(handoffKey, state.handoffDrafts); }
  function handoffBadge(order) { const status = order.nodeReservation?.status; return '<span class="partner-badge ' + (['arrived', 'departed'].includes(status) ? 'approved' : '') + '">' + escape(handoffLabels[status] || '待安排') + '</span>'; }
  function petAvatar(order) { return window.PaichongProfiles?.petAvatar(order, 'medium') || '<img class="partner-pet-fallback" src="' + icon('cat') + '" alt="" />'; }
  function handoffDetail(order) {
    const reservation = order.nodeReservation || {}, transport = order.transport || {}, handoff = order.handoff || {};
    const action = handoffStep(order), draft = handoffDraft(order), canAct = action === 'node-check-in' ? handoff.canCheckIn : handoff.canCheckOut;
    const editable = canAct || !!draft.pending, locked = state.busy || state.loading || !!draft.pending;
    const times = reservation.timeSlot || '09:00-12:00';
    const minTime = action === 'node-check-in' ? reservation.date + 'T' + times.split('-')[0] : timeInput(new Date(Math.max(Date.parse(transport.departureAt) || 0, Date.parse(reservation.checkedInAt) || 0)).toISOString());
    const maxTime = action === 'node-check-in' ? reservation.date + 'T' + times.split('-')[1] : timeInput(transport.arrivalAt);
    const row = (label, value) => '<div><dt>' + escape(label) + '</dt><dd>' + escape(value || '待安排') + '</dd></div>';
    return '<button type="button" class="partner-link" data-handoff-action="list">‹ 返回交接订单</button><section class="partner-card"><div class="partner-pet-row">' + petAvatar(order) + '<div><h2>' + escape(order.petName || '毛孩子') + '</h2><p class="partner-muted">' + escape([order.breed || order.petType, order.weight ? order.weight + ' kg' : ''].filter(Boolean).join(' · ')) + '</p></div>' + handoffBadge(order) + '</div><p class="partner-order-route">' + escape(order.fromCity) + '<span aria-label="至">→</span>' + escape(order.toCity) + '</p><p class="partner-order-id">' + escape(order.id) + '</p><dl class="partner-details">' + row('交接预约', reservation.date + ' ' + (reservation.timeSlot || '')) + row('合作点', order.assignedNode?.name || state.node?.name) + row('送宠联系人', order.contactName) + row('联系电话', order.contactPhone) + row('接手司机', transport.driverName) + row('车辆', transport.vehiclePlate) + (transport.departureAt ? row('计划发车', dateOf(transport.departureAt)) : '') + '</dl></section><div class="partner-banner" role="status">' + escape(handoff.nextStep || '请刷新核对当前交接状态。') + '</div>' + (reservation.status === 'arrived' ? '<section class="partner-card"><h2>离点前核对</h2><div class="partner-gates"><span class="' + (transport.driverId ? 'is-done' : '') + '">车辆安排' + (transport.driverId ? ' · 已分配' : ' · 待总部') + '</span><span class="' + (handoff.inspected ? 'is-done' : '') + '">现场验宠' + (handoff.inspected ? ' · 已完成' : ' · 待司机') + '</span><span class="' + (handoff.balancePaid ? 'is-done' : '') + '">尾款确认' + (handoff.balancePaid ? ' · 已完成' : ' · 待用户') + '</span></div></section>' : '') + (editable ? '<form id="handoff-form" class="partner-card"><h2>' + (action === 'node-check-in' ? '到点登记' : '离点交给司机') + '</h2>' + (draft.pending ? '<div class="partner-banner partner-warning">上次交接结果待确认，原记录已保留。可重试原记录，不会重复占用或释放笼位。</div>' : '') + '<label class="partner-field">交接时间 · 北京时间<input id="handoff-time" type="datetime-local" min="' + escape(minTime) + '" max="' + escape(maxTime) + '" value="' + escape(draft.occurredAt) + '" required ' + (locked ? 'disabled' : '') + ' /></label><p class="partner-muted">登记采用预约与线路计划时间，提交记录时间另行保留。</p><label class="partner-check"><input id="handoff-pet-check" type="checkbox" ' + (draft.petVerified ? 'checked ' : '') + (locked ? 'disabled' : '') + ' /><span>已核对宠物身份、笼具与预约资料</span></label>' + (action === 'node-check-out' ? '<label class="partner-check"><input id="handoff-driver-check" type="checkbox" ' + (draft.driverVerified ? 'checked ' : '') + (locked ? 'disabled' : '') + ' /><span>已核对接手司机 ' + escape(transport.driverName) + ' 与车辆 ' + escape(transport.vehiclePlate) + '</span></label>' : '') + '<label class="partner-field">交接备注<textarea id="handoff-note" maxlength="200" required placeholder="记录宠物状态、随行物品或交接注意事项" ' + (locked ? 'disabled' : '') + '>' + escape(draft.note) + '</textarea></label>' + errorBox(state.handoffError) + '<button type="submit" class="partner-primary" ' + (state.busy || state.loading ? 'disabled' : '') + '><img src="' + icon('node') + '" alt="" />' + (state.busy ? '正在登记…' : draft.pending ? '重试原交接记录' : action === 'node-check-in' ? '确认到点，接入照护' : '确认离点，交给司机') + '</button></form>' : errorBox(state.handoffError)) + (reservation.checkedInAt || reservation.checkedOutAt ? '<section class="partner-card"><h2>交接记录</h2><ol class="partner-handoff-history">' + [['node_checkin', '到点登记', reservation.checkedInAt, reservation.checkInRecordedAt], ['node_checkout', '离点交接', reservation.checkedOutAt, reservation.checkOutRecordedAt]].filter(([, , at]) => at).map(([type, label, at, recordedAt]) => { const record = (order.handoffHistory || []).find(item => item.action === type); return '<li><strong>' + label + '</strong><span>' + escape(dateOf(at)) + '</span>' + (record?.note ? '<p>' + escape(copy(record.note)) + '</p>' : '') + (recordedAt ? '<small>记录提交于 ' + escape(dateOf(recordedAt)) + '</small>' : '') + '</li>'; }).join('') + '</ol></section>' : '');
  }
  function handoffView() {
    const selected = state.orders.find(order => order.id === state.orderId);
    if (selected) return handoffDetail(selected);
    const visible = state.orders.filter(order => state.orderFilter === 'all' || state.orderFilter === 'pending' && ['reserved', 'confirmed'].includes(order.nodeReservation?.status) || order.nodeReservation?.status === state.orderFilter);
    const rank = { arrived: 0, confirmed: 1, reserved: 2, departed: 3, released: 4 };
    visible.sort((a, b) => (rank[a.nodeReservation?.status] ?? 5) - (rank[b.nodeReservation?.status] ?? 5) || String(a.nodeReservation?.date || '').localeCompare(String(b.nodeReservation?.date || '')));
    return errorBox(state.handoffError) + '<div class="partner-tabs" role="tablist" aria-label="交接订单状态">' + [['pending', '待到点'], ['arrived', '在点'], ['departed', '已交接'], ['all', '全部']].map(([id, label]) => '<button type="button" role="tab" aria-selected="' + (state.orderFilter === id) + '" class="' + (state.orderFilter === id ? 'is-active' : '') + '" data-order-filter="' + id + '">' + label + '</button>').join('') + '</div>' + (visible.length ? visible.map(order => '<button type="button" class="partner-card partner-handoff-order" data-order-id="' + escape(order.id) + '"><div class="partner-pet-row">' + petAvatar(order) + '<div><h3>' + escape(order.petName || '毛孩子') + '</h3><p class="partner-muted">' + escape(order.breed || order.petType || '') + '</p></div>' + handoffBadge(order) + '</div><p class="partner-order-route">' + escape(order.fromCity) + '<span aria-label="至">→</span>' + escape(order.toCity) + '</p><p class="partner-values">' + escape(order.nodeReservation?.date) + ' ' + escape(order.nodeReservation?.timeSlot) + '</p><div class="partner-more">查看预约与交接资料 ›</div></button>').join('') : !state.loading ? empty('暂时没有这类交接订单', '总部安排到本合作点的订单会显示在这里。可切换其他状态或刷新查看。') : '');
  }
  function partnerView() {
    let body = state.node ? (state.tab === 'orders' && handoffEnabled ? handoffView() : state.tab === 'submit' ? submitView() : state.tab === 'calendar' ? dateField() + '<p class="partner-note">已生效的 7 天容量。占用随预约与交接变化，余量不代表一定可约。</p>' + state.days.map(day => '<section class="partner-card"><h2>' + escape(day.date) + '</h2>' + day.slots.map(slotView).join('') + '</section>').join('') : historyView()) : (!state.loading ? empty('合作点尚未载入', '请刷新重试；这里只显示当前机构账号绑定的合作点。') : '');
    return '<section class="partner-hero"><div><span class="partner-eyebrow">合作机构 · ' + (handoffEnabled ? '交接与照护' : '容量管理') + '</span><h1>照顾好每一个<br />小客人</h1><p>' + escape(state.node ? state.node.name : '我的合作点') + '</p></div><img src="./assets/v5/brand/paichong-logo.png" alt="派宠猫狗专车" /></section><p class="partner-note">' + (handoffEnabled ? '仅展示本合作点的交接订单、必要联系资料与容量申报。' : '仅展示当前机构的容量与申报记录，不含客户个人资料。') + '</p>' + errorBox(state.error) + body;
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
    main.innerHTML = (state.role === 'ops' ? opsView() : partnerView()) + (state.loading ? '<p class="partner-loading" role="status">正在更新合作点资料…</p>' : '');
    if (handoffEnabled && state.role === 'partner' && state.tab === 'orders' && state.orderId && window.PaichongMaterials) {
      const order = state.orders.find(item => item.id === state.orderId);
      if (order) {
        const materials = document.createElement('section');
        materials.className = 'partner-materials'; materials.innerHTML = window.PaichongMaterials.markup(order);
        main.querySelector('.partner-card')?.insertAdjacentElement('afterend', materials);
        window.PaichongMaterials.bind(materials, order);
      }
    }
    document.getElementById('partner-refresh').disabled = state.busy || state.loading;
    const navItems = state.role === 'partner' ? [...(handoffEnabled ? [['orders', '交接订单', 'node']] : []), ['submit', '申报容量', 'file-check'], ['calendar', '7 天容量', 'calendar'], ['history', '审核记录', 'order']] : [['workbench', '工作台', 'workbench'], ['requests', '容量审批', 'file-check']];
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
        const [result, history, orders] = await Promise.all([api('/api/partner/node?date=' + encodeURIComponent(state.date) + '&days=7'), api('/api/partner/capacity-requests'), handoffEnabled ? api('/api/partner/orders') : Promise.resolve({ items: [] })]);
        if (version !== state.version) return;
        const grouped = {};
        const slots = result.calendar && result.calendar.items || [];
        slots.forEach(slot => { (grouped[slot.date] ||= { date: slot.date, slots: [] }).slots.push(slot); });
        state.node = result.node; state.days = Object.values(grouped); state.current = slots.filter(slot => slot.date === state.date); state.minDate = result.minDate || tomorrow(); state.maxDate = result.maxDate || ''; state.items = history.items || [];
        state.orders = orders.items || [];
        if (state.orderId && !state.orders.some(order => order.id === state.orderId)) { state.orderId = ''; state.handoffError = '该订单不再分配到本合作点，已返回交接列表。'; }
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
  async function submitHandoff() {
    if (!handoffEnabled || state.role !== 'partner' || state.busy || state.loading || stale) return;
    const order = state.orders.find(item => item.id === state.orderId);
    if (!order) return;
    const draft = handoffDraft(order), action = handoffStep(order);
    if (!draft.pending && !(action === 'node-check-in' ? order.handoff?.canCheckIn : order.handoff?.canCheckOut)) { state.handoffError = '订单状态已变化，请刷新后核对交接条件。'; render(); return; }
    if (!draft.pending && (!draft.petVerified || action === 'node-check-out' && !draft.driverVerified)) { state.handoffError = action === 'node-check-in' ? '请先勾选宠物、笼具与预约资料核验。' : '请完成宠物与接手司机车辆两项核验。'; render(); return; }
    if (!draft.pending && (!draft.note.trim() || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(draft.occurredAt))) { state.handoffError = '请填写交接时间和交接备注。'; render(); return; }
    const payload = draft.pending || { action, body: { checks: { petVerified: draft.petVerified, driverVerified: draft.driverVerified }, driverId: order.transport?.driverId || '', occurredAt: draft.occurredAt + ':00+08:00', note: draft.note.trim() } };
    if (!window.confirm(order.petName + '：确认' + (payload.action === 'node-check-in' ? '登记到点？\n进入合作点后会占用照护笼位。' : '交给司机并登记离点？\n离点将释放本合作点笼位，司机需另行确认出发。'))) return;
    state.busy = true; state.handoffError = '';
    try {
      assertCurrent(); draft.pending = payload; saveHandoffDrafts(); render();
      await api('/api/partner/orders/' + encodeURIComponent(order.id) + '/' + payload.action, { method: 'POST', body: payload.body });
      delete state.handoffDrafts[order.id + ':' + action]; saveHandoffDrafts();
      toast(payload.action === 'node-check-in' ? '已登记到点，进入合作点照护' : '已登记离点，等待司机确认出发');
    } catch (error) {
      if (!handleError(error)) {
        if ((error.statusCode || error.status) >= 400 && (error.statusCode || error.status) < 500) { draft.pending = null; try { saveHandoffDrafts(); } catch {} }
        state.handoffError = error.message || '交接结果尚未确认，请重试原记录。';
      }
    } finally { state.busy = false; render(); }
    if (!stale) await load();
  }
  main.addEventListener('input', event => {
    if (state.busy || stale) return;
    const fields = { 'capacity-am': 'am', 'capacity-pm': 'pm', 'capacity-note': 'note' };
    if (fields[event.target.id] && !state.pending) { state[fields[event.target.id]] = event.target.value; state.actionError = ''; try { saveDraft(); } catch { toast('浏览器无法保存草稿，请勿关闭当前页面。'); } }
    if (event.target.id === 'review-note' && !state.pendingReview) { state.reviewNote = event.target.value; state.actionError = ''; }
    if (['handoff-note', 'handoff-time', 'handoff-pet-check', 'handoff-driver-check'].includes(event.target.id) && handoffEnabled) {
      const order = state.orders.find(item => item.id === state.orderId);
      if (!order) return;
      const draft = handoffDraft(order); if (draft.pending) return;
      const fields = { 'handoff-note': 'note', 'handoff-time': 'occurredAt', 'handoff-pet-check': 'petVerified', 'handoff-driver-check': 'driverVerified' };
      draft[fields[event.target.id]] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      state.handoffError = ''; try { saveHandoffDrafts(); } catch { toast('浏览器无法保存交接草稿，请勿关闭当前页面。'); }
    }
  });
  main.addEventListener('change', event => { if (event.target.id === 'capacity-date' && !state.busy && !state.pending) { state.date = event.target.value || state.minDate; state.am = ''; state.pm = ''; state.actionError = ''; try { saveDraft(); } catch {} load(); } });
  main.addEventListener('submit', event => { if (event.target.id === 'capacity-form') { event.preventDefault(); submit(); } if (event.target.id === 'handoff-form') { event.preventDefault(); submitHandoff(); } });
  main.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || button.disabled || state.busy || stale) return;
    if (button.dataset.filter && !state.pendingReview) { state.filter = button.dataset.filter; state.selected = ''; state.actionError = ''; render(); }
    if (button.dataset.select && !state.pendingReview) { state.selected = button.dataset.select; state.reviewNote = ''; state.actionError = ''; render(); window.scrollTo(0, 0); }
    if (button.dataset.action === 'list' && !state.pendingReview) { state.selected = ''; state.actionError = ''; render(); }
    if (['approve', 'return', 'retry-review'].includes(button.dataset.action)) review(button.dataset.action);
    if (button.dataset.orderFilter && handoffEnabled) { state.orderFilter = button.dataset.orderFilter; state.orderId = ''; state.handoffError = ''; render(); }
    if (button.dataset.orderId && handoffEnabled) { state.orderId = button.dataset.orderId; state.handoffError = ''; render(); window.scrollTo(0, 0); }
    if (button.dataset.handoffAction === 'list') { state.orderId = ''; state.handoffError = ''; render(); window.scrollTo(0, 0); }
  });
  nav.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button || state.busy || stale) return;
    const target = button.dataset.nav;
    if (target === 'logout') {
      if (!window.confirm('切换工作账号？未确认的申报与交接草稿会按当前账号保留。')) return;
      try { assertCurrent(); await session.logout(state.auth.token); login(); } catch (error) { if (!handleError(error)) { if (!session.read()) login(); else toast(error.message || '退出失败，请重试。'); } }
    } else if (target === 'workbench') window.location.assign('./client-review.html');
    else if (['submit', 'calendar', 'history', ...(handoffEnabled ? ['orders'] : [])].includes(target)) { state.tab = target; state.actionError = ''; render(); window.scrollTo(0, 0); if (!state.loading) load(); }
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
        if (handoffEnabled) { handoffKey = 'pc-h5-handoff-draft-v1:' + key; const savedHandoffs = readLocal(handoffKey); state.handoffDrafts = savedHandoffs && typeof savedHandoffs === 'object' && !Array.isArray(savedHandoffs) ? savedHandoffs : {}; state.tab = 'orders'; }
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
