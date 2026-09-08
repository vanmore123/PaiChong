(() => {
  'use strict';

  const CITIES = ['广州', '武汉', '郑州', '北京'];
  const RESERVATION_LABELS = { reserved: '待用户确认', confirmed: '已确认 · 待到点', arrived: '已到合作点', departed: '已离点交接', released: '已释放' };
  const state = { ready: false, activeTab: 'review', nodeScreen: 'overview', nodeTab: 'calendar', handoffOrderId: '', routeScreen: 'list', pendingOpen: '', nodes: [], orders: [], routes: [], resources: { drivers: [], vehicles: [] }, calendar: [], date: '', nodeId: '', routeId: '', creatingRoute: false, loading: false, busy: false, requestId: 0, dataReady: false };
  const byId = (id) => document.getElementById(id);
  const elements = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const escape = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const icon = (name) => `<svg class="ui-icon" aria-hidden="true"><use href="./assets/v5/icons/app-sprite.svg#icon-${name}"></use></svg>`;
  const api = (...args) => window.PaichongReview.api(...args);
  const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
  const addDays = (date, days) => new Date(Date.parse(`${date}T12:00:00+08:00`) + days * 86400000).toISOString().slice(0, 10);
  const dateLabel = (date) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' }).format(new Date(`${date}T12:00:00+08:00`));
  const dateTimeLabel = (value) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '未设置';
  const empty = (message, name = 'clipboard-check') => `<div class="workbench-empty">${icon(name)}${escape(message)}</div>`;
  const selectedNode = () => state.nodes.find((node) => node.id === state.nodeId);
  const selectedRoute = () => state.routes.find((route) => route.id === state.routeId);
  const items = (result) => Array.isArray(result) ? result : (Array.isArray(result?.items) ? result.items : []);
  const isDispatched = (route) => ['已派车', '运输中', '已完成'].includes(route?.status);
  const isEditable = (route) => Boolean(route && route.canEdit !== false && !isDispatched(route));
  const statusTag = (text, waiting = false) => `<span class="workbench-status${waiting ? ' is-waiting' : ''}">${escape(text)}</span>`;
  const metric = (label, value, unit = '') => `<div class="workbench-metric"><span>${escape(label)}</span><strong>${escape(value)}</strong><small>${escape(unit)}</small></div>`;

  function showError(message = '') {
    ['nodes-workbench-error', 'routes-workbench-error'].forEach((id) => { byId(id).textContent = message; byId(id).hidden = !message; });
    if (message && state.activeTab !== 'review') {
      const node = byId(`${state.activeTab}-workbench-error`), bounds = node.getBoundingClientRect();
      if (bounds.top < 0 || bounds.bottom > window.innerHeight) node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function setBusy(busy) {
    ['nodes', 'routes'].forEach((name) => {
      const panel = byId(`operations-${name}-panel`);
      panel.setAttribute('aria-busy', String(busy));
      elements('button, input, select', panel).forEach((node) => {
        if (busy) { if (node.dataset.busyDisabled === undefined) node.dataset.busyDisabled = String(node.disabled); node.disabled = true; }
        else if (node.dataset.busyDisabled !== undefined) { node.disabled = node.dataset.busyDisabled === 'true'; delete node.dataset.busyDisabled; }
      });
    });
  }

  function render() {
    renderNodeSelector();
    renderNodeSummary();
    renderCalendar();
    renderNodeSettings();
    renderHandoffs();
    renderRouteSummary();
    renderRouteList();
    renderRouteDetail();
    renderMobileScreens();
    setBusy(state.loading || state.busy);
  }

  function notifyScreen() {
    const title = state.activeTab === 'nodes' ? state.nodeScreen === 'settings' ? '合作点设置' : state.nodeScreen === 'handoff' ? '交接详情' : '合作点容量' : state.activeTab === 'routes' ? state.creatingRoute ? '新建线路' : state.routeScreen === 'detail' ? '线路详情' : '线路与派车' : '订单审核';
    const canBack = state.activeTab === 'nodes' ? state.nodeScreen !== 'overview' : state.activeTab === 'routes' ? state.routeScreen !== 'list' : false;
    window.dispatchEvent(new CustomEvent('paichong:ops-screen', { detail: { title, canBack, area: state.activeTab } }));
  }

  function renderMobileScreens() {
    const nodeDetail = state.nodeScreen !== 'overview';
    const nodesPanel = byId('operations-nodes-panel');
    ['.workbench-heading', '.workbench-demo-note', '.node-summary', '.workbench-controls', '.node-quick-actions', '.node-section-tabs'].forEach((selector) => { const node = nodesPanel.querySelector(`:scope > ${selector}`); if (node) node.hidden = nodeDetail; });
    byId('capacity-calendar').closest('.workbench-card').hidden = nodeDetail || state.nodeTab !== 'calendar';
    nodesPanel.querySelector('.node-handoffs').hidden = nodeDetail || state.nodeTab !== 'handoffs';
    byId('node-settings').closest('.workbench-card').hidden = state.nodeScreen !== 'settings';
    byId('node-handoff-detail').hidden = state.nodeScreen !== 'handoff';
    byId('nodes-screen-back').hidden = !nodeDetail;
    const routesPanel = byId('operations-routes-panel'), routeDetail = state.routeScreen !== 'list';
    ['.workbench-heading', '.workbench-demo-note', '.route-summary'].forEach((selector) => { const node = routesPanel.querySelector(`:scope > ${selector}`); if (node) node.hidden = routeDetail; });
    routesPanel.querySelector('.route-pool').hidden = routeDetail;
    byId('route-workbench-detail').hidden = !routeDetail;
    byId('routes-screen-back').hidden = !routeDetail;
  }

  function screenTop() {
    if (document.body.classList.contains('miniapp')) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    const panel = byId(`operations-${state.activeTab}-panel`);
    if (panel && !panel.hidden) panel.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  function back() {
    if (state.busy) return false;
    if (state.activeTab === 'nodes' && state.nodeScreen !== 'overview') { state.nodeScreen = 'overview'; state.handoffOrderId = ''; }
    else if (state.activeTab === 'routes' && state.routeScreen !== 'list') { state.routeScreen = 'list'; state.creatingRoute = false; }
    else return false;
    showError(); renderMobileScreens(); notifyScreen(); screenTop(); return true;
  }

  function setupMobileScreens() {
    const nodesPanel = byId('operations-nodes-panel'), routesPanel = byId('operations-routes-panel');
    nodesPanel.classList.add('mini-operations-page'); routesPanel.classList.add('mini-operations-page');
    nodesPanel.querySelector('.workbench-heading h2').textContent = '合作点容量';
    nodesPanel.querySelector('.workbench-heading p:last-child').textContent = '查看预约、笼位与交接进度';
    routesPanel.querySelector('.workbench-heading h2').textContent = '线路与派车';
    routesPanel.querySelector('.workbench-heading p:last-child').textContent = '编好每一单，安排安心出发';
    const controls = nodesPanel.querySelector('.workbench-controls');
    nodesPanel.insertBefore(controls, byId('node-summary'));
    const nodeActions = document.createElement('div');
    nodeActions.className = 'node-quick-actions';
    nodeActions.innerHTML = `<button class="outline-button" id="open-node-settings" type="button">${icon('calendar-check')}<span>营业与容量设置</span>${icon('arrow-right')}</button>`;
    nodeActions.insertAdjacentHTML('beforeend', `<button class="outline-button" id="open-partner-approval" type="button">${icon('clipboard-check')}<span>机构余量审批</span>${icon('arrow-right')}</button>`);
    nodesPanel.insertBefore(nodeActions, nodesPanel.querySelector('.capacity-layout'));
    byId('open-partner-approval').addEventListener('click', () => {
      if (state.busy || state.loading) return;
      const session = window.PaichongReview.session();
      try { window.PaichongSession?.assertCurrent(session?.token || ''); } catch { return; }
      if (session?.role === 'ops') window.location.assign('./partner.html');
    });
    const sectionTabs = document.createElement('div'); sectionTabs.className = 'node-section-tabs'; sectionTabs.setAttribute('role', 'group'); sectionTabs.setAttribute('aria-label', '合作点内容');
    sectionTabs.innerHTML = '<button type="button" data-node-section="calendar" class="is-active" aria-pressed="true">容量日历</button><button type="button" data-node-section="handoffs" aria-pressed="false">交接订单 <span id="node-section-count">0</span></button>';
    nodesPanel.insertBefore(sectionTabs, nodesPanel.querySelector('.capacity-layout'));
    elements('[data-node-section]', sectionTabs).forEach((button) => button.addEventListener('click', () => {
      if (state.busy) return; state.nodeTab = button.dataset.nodeSection;
      elements('[data-node-section]', sectionTabs).forEach((item) => { const active = item === button; item.classList.toggle('is-active', active); item.setAttribute('aria-pressed', String(active)); }); renderMobileScreens();
    }));
    const handoffDetail = document.createElement('section');
    handoffDetail.id = 'node-handoff-detail'; handoffDetail.className = 'workbench-card mobile-handoff-detail'; handoffDetail.hidden = true; nodesPanel.appendChild(handoffDetail);
    [['nodes', nodesPanel], ['routes', routesPanel]].forEach(([name, panel]) => {
      const button = document.createElement('button'); button.id = `${name}-screen-back`; button.className = 'mini-screen-back quiet-button'; button.type = 'button'; button.hidden = true;
      button.innerHTML = `${icon('chevron-left')}<span>${name === 'nodes' ? '返回合作点' : '返回线路列表'}</span>`;
      panel.insertBefore(button, panel.firstChild); button.addEventListener('click', back);
    });
    byId('open-node-settings').addEventListener('click', () => {
      if (state.busy || state.loading || !selectedNode()) return;
      state.nodeScreen = 'settings'; renderMobileScreens(); notifyScreen(); screenTop();
    });
    elements('[data-workbench-refresh]').forEach((button) => { button.innerHTML = `${icon('refresh')}<span>刷新</span>`; });
    byId('operations-tabs').hidden = true;
  }

  async function loadData() {
    if (!state.ready) return;
    const requestId = ++state.requestId;
    state.loading = true;
    setBusy(true);
    showError();
    try {
      const [nodes, orders, routes, resources, calendar] = await Promise.all([
        api('/api/ops/city-nodes'), api('/api/ops/orders'), api('/api/ops/routes'), api('/api/ops/transport-resources'),
        api(`/api/ops/node-calendar?date=${encodeURIComponent(state.date)}&days=7`)
      ]);
      if (requestId !== state.requestId) return;
      state.nodes = items(nodes); state.orders = items(orders); state.routes = items(routes);
      state.resources = { drivers: resources.drivers || [], vehicles: resources.vehicles || [] };
      state.calendar = items(calendar);
      if (!state.nodes.some((node) => node.id === state.nodeId)) state.nodeId = state.nodes[0]?.id || '';
      if (!state.routes.some((route) => route.id === state.routeId)) state.routeId = state.routes[0]?.id || '';
      state.dataReady = true;
    } catch (error) {
      if (requestId === state.requestId) showError(`${state.dataReady ? '刷新失败，当前保留上次结果。' : '暂时无法载入工作台。'}${error.message} 请点击“刷新工作台”重试。`);
    } finally {
      if (requestId === state.requestId) { state.loading = false; render(); }
    }
  }

  async function mutate(path, body, message, after) {
    if (state.busy || state.loading) return;
    state.busy = true; setBusy(true); showError();
    try {
      const result = await api(path, { method: path.includes('/city-nodes/') ? 'PATCH' : 'POST', body });
      if (after) { after(result); notifyScreen(); }
      window.PaichongReview.toast(message);
      await loadData();
      window.dispatchEvent(new Event('paichong:ops-changed'));
    } catch (error) { showError(error.message); }
    finally { state.busy = false; setBusy(false); }
  }

  function confirm(title, description, action, danger = false, confirmLabel = '确认操作') {
    if (state.loading || state.busy) return;
    window.PaichongReview.openDialog(title, description, action, { danger, confirmLabel, iconName: danger ? 'alert' : 'check-circle' });
  }

  function switchTab(name, { focus = false, reset = false } = {}) {
    if (!['review', 'nodes', 'routes'].includes(name)) return;
    if (!state.ready) { state.pendingOpen = name; return; }
    state.activeTab = name;
    if (reset) { state.nodeScreen = 'overview'; state.handoffOrderId = ''; state.routeScreen = 'list'; state.creatingRoute = false; }
    ['review', 'nodes', 'routes'].forEach((item) => { byId(`operations-${item}-panel`).hidden = item !== name; });
    elements('[data-operations-tab]').forEach((button) => {
      const active = button.dataset.operationsTab === name;
      button.classList.toggle('is-active', active); button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus();
      byId(`operations-${button.dataset.operationsTab}-panel`).hidden = !active;
    });
    renderMobileScreens(); notifyScreen();
    if (name !== 'review' && !state.dataReady && !state.loading) loadData();
  }

  function renderNodeSelector() {
    byId('capacity-node').innerHTML = state.nodes.length ? state.nodes.map((node) => `<option value="${escape(node.id)}"${node.id === state.nodeId ? ' selected' : ''}>${escape(node.city)} · ${escape(node.name)}</option>`).join('') : '<option value="">暂无合作点</option>';
    byId('capacity-date').value = state.date;
  }

  function renderNodeSummary() {
    const onDate = state.calendar.filter((cell) => cell.date === state.date && cell.nodeId === state.nodeId);
    const sum = (key) => onDate.reduce((total, cell) => total + Number(cell[key] || 0), 0);
    const arrivedOrderIds = new Set(onDate.flatMap((cell) => cell.orderIds || []).filter((id) => state.orders.some((order) => order.id === id && order.nodeReservation?.status === 'arrived')));
    byId('node-summary').innerHTML = metric('当日待到点', sum('reserved') + sum('confirmed'), '单') + metric('当日在点', arrivedOrderIds.size, '单') + metric('当日可约', onDate.reduce((total, cell) => total + (cell.available ? Number(cell.remaining || 0) : 0), 0), '笼位 · 上下午');
  }

  function renderCalendar() {
    if (!state.dataReady) { byId('capacity-calendar').innerHTML = empty('等待加载合作点容量…', 'calendar-check'); return; }
    const cells = state.calendar.filter((cell) => cell.nodeId === state.nodeId);
    if (!cells.length) { byId('capacity-calendar').innerHTML = empty('当前合作点没有可显示的容量数据。', 'calendar-check'); return; }
    const cellMarkup = (cell, period) => {
      if (!cell) return `<div class="capacity-period is-closed"><span>${period === 'AM' ? '上午' : '下午'}</span><strong>未开放</strong></div>`;
      const closed = cell.status === '暂停' || (!cell.available && Number(cell.remaining) > 0);
      const title = closed ? '未开放' : Number(cell.remaining) > 0 ? `余 ${cell.remaining}` : '已约满';
      return `<div class="capacity-period${closed ? ' is-closed' : Number(cell.remaining) <= 0 ? ' is-full' : ''}"><span class="capacity-period-name">${period === 'AM' ? '上午 AM' : '下午 PM'}<small>${escape(cell.timeSlot)}</small></span><strong>${escape(title)}<small>/ ${escape(cell.capacity)} 笼位</small></strong><p>预留 ${escape(cell.reserved || 0)} · 确认 ${escape(cell.confirmed || 0)} · 到点 ${escape(cell.arrived || 0)}</p>${cell.blockedReason ? `<small class="capacity-reason">${escape(cell.blockedReason)}</small>` : ''}</div>`;
    };
    byId('capacity-calendar').innerHTML = `<div class="capacity-days">${Array.from({ length: 7 }, (_, offset) => {
      const date = addDays(state.date, offset);
      const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'short', timeZone: 'Asia/Shanghai' }).format(new Date(`${date}T12:00:00+08:00`));
      return `<section class="capacity-day"><div class="capacity-day-title"><strong>${escape(dateLabel(date))}</strong><span>${escape(weekday)}${date === today() ? ' · 今天' : ''}</span></div><div class="capacity-day-periods">${cellMarkup(cells.find((cell) => cell.date === date && cell.period === 'AM'), 'AM')}${cellMarkup(cells.find((cell) => cell.date === date && cell.period === 'PM'), 'PM')}</div></section>`;
    }).join('')}</div>`;
  }

  function renderNodeSettings() {
    const node = selectedNode();
    if (!node) { byId('node-settings').innerHTML = empty('先选择一个合作点。', 'map-pin'); return; }
    const [openAt = '09:00', closeAt = '20:00'] = (node.open || '').split('-');
    byId('node-settings').innerHTML = `<p class="node-setting-subtitle">${escape(node.city)} · ${escape(node.name)}</p>
      <form class="node-settings-form" id="node-settings-form">
        <label class="field-label" for="node-settings-scope">设置范围<select id="node-settings-scope"><option value="default">常规营业设置</option><option value="date">仅调整某一天</option></select></label>
        <label class="field-label" for="node-override-date" id="node-override-date-label" hidden>调整日期<input type="date" id="node-override-date" min="${today()}" value="${escape(state.date)}" disabled /></label>
        <label class="field-label" for="node-capacity">每时段笼位容量<input type="number" id="node-capacity" min="1" max="100" step="1" value="${escape(node.capacity)}" required /></label>
        <div class="time-fields"><label class="field-label" for="node-open-at">开始营业<input type="time" id="node-open-at" value="${escape(openAt)}" required /></label><label class="field-label" for="node-close-at">结束营业<input type="time" id="node-close-at" value="${escape(closeAt)}" required /></label></div>
        <label class="field-label" for="node-operating-status">接单状态<select id="node-operating-status"><option value="正常"${node.status === '正常' ? ' selected' : ''}>正常接单</option><option value="暂停"${node.status === '暂停' ? ' selected' : ''}>暂停新预约</option></select></label>
        <p class="workbench-helper">调整不能挤占已有预约。暂停或缩短营业时间仅适用于无预约冲突的日期；在点宠物离开前持续占用后续时段。</p>
        <button class="primary-button" type="submit">${icon('check-circle')}<span>保存合作点设置</span></button>
      </form>
      <div class="override-list"><h4>单日特殊设置</h4>${(node.dateOverrides || []).length ? node.dateOverrides.map((override) => `<div class="override-row"><span>${escape(override.date)}<small>${escape(override.capacity ?? node.capacity)} 个笼位 · ${escape(override.open || node.open)} · ${escape(override.status || node.status)}</small></span><button class="quiet-button" type="button" data-remove-override="${escape(override.date)}">恢复常规</button></div>`).join('') : '<p class="workbench-helper">尚未设置单日调整。</p>'}</div>`;
    byId('node-settings-scope').addEventListener('change', (event) => { const isDate = event.target.value === 'date'; byId('node-override-date-label').hidden = !isDate; byId('node-override-date').disabled = !isDate; loadSettingsValues(); });
    byId('node-override-date').addEventListener('change', loadSettingsValues);
    byId('node-settings-form').addEventListener('submit', (event) => {
      event.preventDefault();
      if (!event.currentTarget.reportValidity() || state.busy || state.loading) return;
      const capacity = Number(byId('node-capacity').value), openAt = byId('node-open-at').value, closeAt = byId('node-close-at').value;
      const isDate = byId('node-settings-scope').value === 'date', date = byId('node-override-date').value;
      if (!Number.isInteger(capacity) || capacity < 1 || openAt >= closeAt || (isDate && (!date || date < today()))) { showError('请填写有效的正整数容量和营业时间，结束时间应晚于开始时间；单日调整不能选过去日期。'); return; }
      const settings = { capacity, open: `${openAt}-${closeAt}`, status: byId('node-operating-status').value };
      confirm('保存合作点设置？', `${node.name} · ${isDate ? date : '常规设置'}：${capacity} 个笼位，${settings.open}，${settings.status}。已有订单不会被自动取消。`, () => mutate(`/api/ops/city-nodes/${encodeURIComponent(node.id)}`, isDate ? { override: { date, ...settings } } : settings, '合作点设置已更新'), settings.status === '暂停', '确认保存设置');
    });
    elements('[data-remove-override]', byId('node-settings')).forEach((button) => button.addEventListener('click', () => {
      const date = button.dataset.removeOverride;
      confirm('恢复这一天的常规设置？', `${node.name} · ${date} 将重新使用常规容量和营业时间。`, () => mutate(`/api/ops/city-nodes/${encodeURIComponent(node.id)}`, { removeOverrideDate: date }, '已恢复常规设置'), false, '确认恢复');
    }));
  }

  function loadSettingsValues() {
    const node = selectedNode();
    const override = byId('node-settings-scope').value === 'date' ? node.dateOverrides?.find((item) => item.date === byId('node-override-date').value) : null;
    const value = { ...node, ...(override || {}) };
    byId('node-capacity').value = value.capacity;
    [byId('node-open-at').value, byId('node-close-at').value] = (value.open || '09:00-20:00').split('-');
    byId('node-operating-status').value = value.status;
  }

  function renderHandoffs() {
    const orders = state.orders.filter((order) => order.nodeReservation?.nodeId === state.nodeId && !['released'].includes(order.nodeReservation.status));
    byId('node-order-count').textContent = `${orders.length} 单`;
    byId('node-section-count').textContent = orders.length;
    byId('node-handoff-list').innerHTML = orders.length ? orders.map((order) => `<button class="mobile-handoff-card" data-open-handoff="${escape(order.id)}" type="button"><span class="handoff-card-top"><strong>${escape(order.petName)} · ${escape(order.petType)}</strong>${statusTag(RESERVATION_LABELS[order.nodeReservation.status] || order.nodeReservation.status, order.nodeReservation.status === 'reserved')}</span><span class="handoff-card-route">${icon('route')}${escape(order.fromCity)} → ${escape(order.toCity)}</span><small>${escape(order.nodeReservation.date)} · ${escape(order.nodeReservation.timeSlot)}</small><span class="handoff-card-bottom"><small>${escape(order.id)}</small>${icon('arrow-right')}</span></button>`).join('') : empty('当前合作点暂无交接订单。先在订单审核中分配合作点。', 'map-pin');
    elements('[data-open-handoff]', byId('node-handoff-list')).forEach((button) => button.addEventListener('click', () => {
      if (state.busy || state.loading) return;
      state.handoffOrderId = button.dataset.openHandoff; state.nodeScreen = 'handoff'; renderHandoffDetail(); renderMobileScreens(); notifyScreen(); screenTop();
    }));
    renderHandoffDetail();
  }

  function renderHandoffDetail() {
    const order = state.orders.find((item) => item.id === state.handoffOrderId), target = byId('node-handoff-detail');
    if (!order?.nodeReservation) { target.innerHTML = empty('选择一笔订单查看交接详情。', 'map-pin'); return; }
    const reservation = order.nodeReservation, route = state.routes.find((item) => item.id === order.routeId);
    const canCheckIn = reservation.status === 'confirmed' && order.reviewStatus === 'confirmed' && order.deposit?.status === 'paid';
    const paidReady = order.fulfillment?.invoice?.status === 'paid' && order.fulfillment?.stage === 'ready';
    const canCheckOut = reservation.status === 'arrived' && ['已派车', '运输中'].includes(route?.status) && paidReady;
    const reason = reservation.status === 'reserved' ? '用户确认方案后，可登记宠物到点。' : reservation.status === 'arrived' && !isDispatched(route) ? '完成线路编单和模拟派车后，由司机验宠。' : reservation.status === 'arrived' && !paidReady ? '等待司机验宠、用户确认尾款；异常须处理后才能离点。' : reservation.status === 'departed' ? '合作点交接已完成，后续出发与签收由司机分别登记。' : '';
    target.innerHTML = `<div class="handoff-detail-hero"><span class="handoff-pet-icon">${icon('paw')}</span><h3>${escape(order.petName)}的交接记录</h3><p>${escape(order.fromCity)} → ${escape(order.toCity)}</p>${statusTag(RESERVATION_LABELS[reservation.status] || reservation.status, reservation.status === 'reserved')}</div><dl class="handoff-facts"><div><dt>订单编号</dt><dd>${escape(order.id)}</dd></div><div><dt>合作交接点</dt><dd>${escape(selectedNode()?.name || order.assignedNode?.name || '')}</dd></div><div><dt>预约时间</dt><dd>${escape(reservation.date)}<br>${escape(reservation.timeSlot)}</dd></div><div><dt>寄件联系人</dt><dd>${escape(order.contactName || '未提供')}<br>${escape(order.contactPhone || order.userPhone || '')}</dd></div><div><dt>照护说明</dt><dd>${escape(order.careNote || '暂无特殊照护说明')}</dd></div><div><dt>运输线路</dt><dd>${escape(route?.name || '尚未编入线路')}${route ? `<br><small>${escape(route.status)} · ${escape(route.driverName || '未分配司机')}</small>` : ''}</dd></div></dl><div class="handoff-progress"><h4>交接留痕</h4><div class="handoff-progress-item${reservation.checkedInAt ? ' is-done' : ''}">${icon('map-pin')}<span><strong>合作点到点</strong><small>${reservation.checkedInAt ? escape(dateTimeLabel(reservation.checkedInAt)) + ' · 模拟登记' : '等待到点登记'}</small></span></div><div class="handoff-progress-item${reservation.checkedOutAt ? ' is-done' : ''}">${icon('truck')}<span><strong>离点交付司机</strong><small>${reservation.checkedOutAt ? escape(dateTimeLabel(reservation.checkedOutAt)) + ' · 模拟交接' : '等待离点交接'}</small></span></div></div><p class="workbench-helper">所有到点、离点均为模拟记录，不代表已实际接到或运送宠物。</p><div class="handoff-detail-actions">${reservation.status === 'arrived' ? `<button class="primary-button" type="button" data-check-out="${escape(order.id)}"${canCheckOut ? '' : ' disabled'}>${icon('truck')}<span>模拟离点交接</span></button>` : reservation.status !== 'departed' ? `<button class="primary-button" type="button" data-check-in="${escape(order.id)}"${canCheckIn ? '' : ' disabled'}>${icon('map-pin')}<span>模拟到点登记</span></button>` : ''}${reason ? `<p>${escape(reason)}</p>` : ''}</div>`;
    [['checkIn', 'node-check-in', '到点登记', '按预约起始时间记录虚拟到点，保留该时段的笼位。'], ['checkOut', 'node-check-out', '离点交接', '费用已模拟确认。按计划发车时间记录虚拟交接，释放节点笼位，等待司机确认出发。']].forEach(([dataKey, endpoint, label, description]) => {
      const selector = dataKey === 'checkIn' ? '[data-check-in]' : '[data-check-out]';
      elements(selector, target).forEach((button) => button.addEventListener('click', () => {
        const orderId = button.dataset[dataKey];
        confirm(`确认模拟${label}？`, `${orderId}。${description} 此操作不代表发生了真实交接。`, () => mutate(`/api/ops/orders/${encodeURIComponent(orderId)}/${endpoint}`, { note: `经营者工作台模拟${label}` }, `已完成模拟${label}`), false, `确认模拟${label}`);
      }));
    });
  }

  function renderRouteSummary() {
    byId('route-summary').innerHTML = metric('线路计划', state.routes.length, '条') + metric('已编入', state.routes.reduce((sum, route) => sum + (route.orderIds || []).length, 0), '单') + metric('已派车', state.routes.filter(isDispatched).length, '条');
  }

  function renderRouteList() {
    byId('route-list').innerHTML = state.routes.length ? state.routes.map((route) => `<button class="route-choice" type="button" data-select-route="${escape(route.id)}"><span class="route-choice-top"><span class="route-card-symbol">${icon('truck')}</span>${statusTag(route.status, route.status === '凑单中')}</span><strong>${escape(route.name)}</strong><p class="route-card-cities">${escape((route.cities || []).join(' → '))}</p><p>${escape(dateTimeLabel(route.departureAt))} 出发 · 北京时间</p><span class="route-choice-bottom"><small>已编 ${escape((route.orderIds || []).length)} 单 · ${escape(route.capacity)} 个笼位</small><span>查看线路 ${icon('arrow-right')}</span></span></button>`).join('') : empty('暂无线路，点击“新建线路”制定计划。', 'route');
    elements('[data-select-route]', byId('route-list')).forEach((button) => button.addEventListener('click', () => {
      if (state.busy || state.loading) return;
      state.routeId = button.dataset.selectRoute; state.creatingRoute = false; state.routeScreen = 'detail'; showError(); renderRouteDetail(); renderMobileScreens(); notifyScreen(); screenTop();
    }));
  }

  function renderRouteCreate() {
    const departureDate = addDays(today(), 1), arrivalDate = addDays(today(), 2);
    const citySelect = (id, label, value, optional = false) => `<label class="field-label" for="${id}">${label}<select id="${id}"${optional ? '' : ' required'}>${optional ? '<option value="">不途经</option>' : ''}${CITIES.map((city) => `<option value="${city}"${city === value ? ' selected' : ''}>${city}</option>`).join('')}</select></label>`;
    byId('route-workbench-detail').innerHTML = `<div class="workbench-card-heading"><div><p class="eyebrow">新建虚拟线路</p><h3>安排一趟专车</h3></div><span class="simulation-badge">模拟计划</span></div><p class="route-plan-intro">途经城市从前往后排列；订单起终点必须顺向经过。发车需晚于接宠时段结束，且不能超过最大等待时间。</p>
      <form class="route-create-form" id="route-create-form"><label class="field-label" for="route-name">线路名称<input id="route-name" maxlength="60" value="广州—武汉—郑州—北京" required /></label>
      <div class="route-city-fields">${citySelect('route-city-start', '起点', '广州')}${citySelect('route-city-via-one', '途经 1', '武汉', true)}${citySelect('route-city-via-two', '途经 2', '郑州', true)}${citySelect('route-city-end', '终点', '北京')}</div>
      <div class="form-grid"><label class="field-label" for="route-departure">计划发车（北京时间）<input type="datetime-local" id="route-departure" value="${departureDate}T15:30" required /></label><label class="field-label" for="route-arrival">预计到达（北京时间）<input type="datetime-local" id="route-arrival" value="${arrivalDate}T18:00" required /></label><label class="field-label" for="route-capacity">整车笼位容量<input type="number" id="route-capacity" min="1" max="100" step="1" value="8" required /></label><label class="field-label" for="route-min-orders">最低发车订单数<input type="number" id="route-min-orders" min="1" max="100" step="1" value="1" required /></label><label class="field-label" for="route-max-wait">预约后最大等待（小时）<input type="number" id="route-max-wait" min="1" max="168" step="1" value="36" required /></label></div>
      <div class="form-actions"><button class="quiet-button" id="cancel-route-create" type="button">返回线路</button><button class="primary-button" type="submit">${icon('route')}<span>创建虚拟线路</span></button></div></form>`;
    byId('cancel-route-create').addEventListener('click', back);
    byId('route-create-form').addEventListener('submit', (event) => {
      event.preventDefault();
      if (!event.currentTarget.reportValidity() || state.busy || state.loading) return;
      const cities = ['route-city-start', 'route-city-via-one', 'route-city-via-two', 'route-city-end'].map((id) => byId(id).value).filter(Boolean);
      const departureAt = `${byId('route-departure').value}:00+08:00`, arrivalAt = `${byId('route-arrival').value}:00+08:00`;
      const name = byId('route-name').value.trim(), capacity = Number(byId('route-capacity').value), minOrders = Number(byId('route-min-orders').value), maxWaitingHours = Number(byId('route-max-wait').value);
      if (!name || new Set(cities).size !== cities.length || cities.length < 2) { showError('请填写线路名称，并确保起点、途经城市与终点不重复。'); return; }
      if (Date.parse(departureAt) <= Date.now() || Date.parse(arrivalAt) <= Date.parse(departureAt)) { showError('请选择未来的发车时间，预计到达应晚于发车。时间按北京时间计算。'); return; }
      if (![capacity, minOrders, maxWaitingHours].every((number) => Number.isInteger(number) && number > 0)) { showError('容量、最低发车单数与等待小时数须为正整数。'); return; }
      confirm('创建这条虚拟线路？', `${cities.join(' → ')}，${dateTimeLabel(departureAt)}（北京时间）发车。${capacity} 个笼位，至少 ${minOrders} 单发车。`, () => mutate('/api/ops/routes', { name, cities, departureAt, arrivalAt, capacity, minOrders, maxWaitingHours }, '虚拟线路已创建，可以开始编单', (result) => { state.routeId = result.route?.id || result.item?.id || result.id || ''; state.creatingRoute = false; state.routeScreen = 'detail'; }), false, '确认创建线路');
    });
  }

  function routeCandidateReason(order, route) {
    if (order.reviewStatus !== 'confirmed' || order.deposit?.status !== 'paid') return '尚未确认方案或支付保证金';
    if (order.routeId) return '已编入线路';
    if (!order.assignedNode || !order.nodeReservation || !['confirmed', 'arrived'].includes(order.nodeReservation.status)) return '尚未预留有效合作点';
    if (!['待拼单', '已到交接点'].includes(order.status)) return '订单当前状态不能编线';
    const cities = route.cities || [], from = cities.indexOf(order.fromCity), to = cities.indexOf(order.toCity);
    if (from < 0 || to <= from) return '与线路方向不匹配';
    const reservation = order.nodeReservation;
    const startTime = reservation.timeSlot?.split('-')[0] || (reservation.period === 'PM' ? '13:00' : '09:00');
    const endTime = reservation.timeSlot?.split('-')[1] || (reservation.period === 'PM' ? '16:00' : '12:00');
    const departure = Date.parse(route.departureAt), beginsAt = Date.parse(`${reservation.date}T${startTime}:00+08:00`), readyAt = Date.parse(`${reservation.date}T${endTime}:00+08:00`);
    const wait = (departure - beginsAt) / 3600000;
    if (!Number.isFinite(wait) || departure < readyAt || wait > Number(route.maxWaitingHours)) return '预约时段与发车时间不匹配';
    const segments = route.segments || [];
    if (segments.slice(from, to).some((segment) => Number(segment.remaining) < 1)) return '所经区段笼位已满';
    return '';
  }

  function renderRouteDetail() {
    if (state.creatingRoute) { renderRouteCreate(); return; }
    const route = selectedRoute();
    if (!route) { byId('route-workbench-detail').innerHTML = empty('选择一条线路查看编单与派车安排。', 'truck'); return; }
    const editable = isEditable(route), routeOrders = (route.orderIds || []).map((id) => state.orders.find((order) => order.id === id)).filter(Boolean);
    const candidates = state.orders.filter((order) => !routeCandidateReason(order, route));
    const dispatchReason = route.dispatchBlockedReason || (!editable ? '当前线路已派车，不能重复派车或修改编单。' : !route.driverId || !route.vehicleId ? '先分配司机与车辆，再执行模拟派车。' : routeOrders.length < Number(route.minOrders) ? `还需 ${Number(route.minOrders) - routeOrders.length} 单达到最低发车数量。` : '发车条件已满足，请核对订单、司机与车辆。');
    const canDispatch = typeof route.canDispatch === 'boolean' ? route.canDispatch : editable && Boolean(route.driverId && route.vehicleId && routeOrders.length >= Number(route.minOrders));
    byId('route-workbench-detail').innerHTML = `<div class="workbench-card-heading"><div><p class="eyebrow">${escape(route.id)}</p><h3>${escape(route.name)}</h3></div>${statusTag(route.status, route.status === '凑单中')}</div><p class="route-plan-intro">${escape((route.cities || []).join(' → '))}</p>
      <dl class="route-facts"><div><dt>计划发车 · 北京时间</dt><dd>${escape(dateTimeLabel(route.departureAt))}</dd></div><div><dt>预计到达 · 北京时间</dt><dd>${escape(dateTimeLabel(route.arrivalAt))}</dd></div><div><dt>最低发车 / 当前编单</dt><dd>${escape(route.minOrders)} 单 / ${escape(routeOrders.length)} 单</dd></div><div><dt>预约后最大等待</dt><dd>${escape(route.maxWaitingHours)} 小时</dd></div></dl>
      <h4>区段笼位占用</h4><div class="route-segments">${(route.segments || []).map((segment) => `<div class="route-segment"><strong>${escape(segment.fromCity)} → ${escape(segment.toCity)}</strong><small>已用 ${escape(segment.used)} / ${escape(segment.capacity)} · 余 ${escape(segment.remaining)}</small><progress value="${escape(segment.used)}" max="${escape(segment.capacity)}" aria-label="${escape(segment.fromCity)}至${escape(segment.toCity)}已用${escape(segment.used)}个笼位"></progress></div>`).join('') || '<p class="workbench-helper">暂无区段容量数据。</p>'}</div>
      ${route.blockedReason ? `<p class="workbench-demo-note">${icon('alert')}<span>${escape(route.blockedReason)}</span></p>` : ''}
      <div class="route-section"><h4>已编入订单 · ${routeOrders.length} 单</h4>${routeOrders.length ? routeOrders.map((order) => `<div class="route-compiled-order"><span><strong>${escape(order.petName)} · ${escape(order.fromCity)} → ${escape(order.toCity)}</strong><small>${escape(order.id)} · ${escape(order.status)}<br>${escape(order.nodeReservation?.date || '')} ${escape(order.nodeReservation?.timeSlot || '')}</small></span><button class="quiet-button" type="button" data-remove-route-order="${escape(order.id)}"${editable ? '' : ' disabled'}>移出线路</button></div>`).join('') : '<p class="workbench-helper">尚未编入订单。仅可选择已确认、已支付且方向和时间匹配的订单。</p>'}
      <form class="route-add-form" id="route-add-order-form"><label class="field-label" for="route-candidate-order">可编入的订单<select id="route-candidate-order"${editable && candidates.length ? '' : ' disabled'}>${candidates.length ? candidates.map((order) => `<option value="${escape(order.id)}">${escape(order.petName)} · ${escape(order.fromCity)} → ${escape(order.toCity)} · ${escape(order.id)}</option>`).join('') : '<option value="">暂无符合条件的订单</option>'}</select></label><button class="outline-button" type="submit"${editable && candidates.length ? '' : ' disabled'}>${icon('route')}<span>加入线路</span></button></form>
      <p class="workbench-helper">候选订单同时校验方向、确认状态、节点预约、等待时间和区段余量；订单不能重复编线。</p></div>
      <div class="route-section"><h4>司机与车辆</h4><form class="route-assign-form" id="route-assign-form"><label class="field-label" for="route-driver">模拟司机<select id="route-driver" required${editable ? '' : ' disabled'}>${resourceOptions(state.resources.drivers, route.driverId, 'driver', route.driverName)}</select></label><label class="field-label" for="route-vehicle">模拟车辆<select id="route-vehicle" required${editable ? '' : ' disabled'}>${resourceOptions(state.resources.vehicles, route.vehicleId, 'vehicle', route.vehiclePlate)}</select></label><div class="route-resource-actions"><button class="outline-button" type="submit"${editable ? '' : ' disabled'}>${icon('truck')}<span>${route.driverId ? '更新司机与车辆' : '分配司机与车辆'}</span></button>${editable && (route.driverId || route.vehicleId) ? '<button class="quiet-button" id="route-unassign" type="button">取消资源分配</button>' : ''}</div></form><p class="workbench-helper">司机车辆均为虚拟档案；同一资源不能在重叠的运输时间内分配给多条线路。车辆容量须覆盖线路容量。</p></div>
      <div class="route-section"><div class="dispatch-callout"><p><strong>${isDispatched(route) ? '已执行模拟派车' : '派车前最后核对'}</strong><br>${escape(dispatchReason)}</p><button class="pay-button" id="route-dispatch" type="button"${canDispatch ? '' : ' disabled'}>${icon('truck')}<span>模拟派车</span></button></div></div>`;
    byId('route-add-order-form').addEventListener('submit', (event) => {
      event.preventDefault(); const orderId = byId('route-candidate-order').value;
      if (!editable || !orderId) return;
      confirm('将这笔订单编入线路？', `${orderId} 将加入 ${route.name}，并占用对应运输区段的笼位。`, () => mutate(`/api/ops/routes/${encodeURIComponent(route.id)}/orders`, { orderId }, '订单已编入线路'), false, '确认编入线路');
    });
    elements('[data-remove-route-order]', byId('route-workbench-detail')).forEach((button) => button.addEventListener('click', () => {
      const orderId = button.dataset.removeRouteOrder;
      confirm('将订单移出线路？', `${orderId} 的区段笼位将释放，合作点预约保持不变，之后可重新编线。`, () => mutate(`/api/ops/routes/${encodeURIComponent(route.id)}/remove-order`, { orderId }, '订单已移出线路'), true, '确认移出线路');
    }));
    byId('route-assign-form').addEventListener('submit', (event) => {
      event.preventDefault();
      if (!event.currentTarget.reportValidity() || !editable) return;
      const driverId = byId('route-driver').value, vehicleId = byId('route-vehicle').value;
      const driver = state.resources.drivers.find((item) => item.id === driverId), vehicle = state.resources.vehicles.find((item) => item.id === vehicleId);
      if (!driver || !vehicle) { showError('请选择有效的司机与车辆。'); return; }
      if (Number(vehicle.capacity) < Number(route.capacity)) { showError(`所选车辆只有 ${vehicle.capacity} 个笼位，小于线路要求的 ${route.capacity} 个。请更换车辆。`); return; }
      confirm('确认司机与车辆分配？', `${route.name} 将分配给 ${driver.name}，车辆 ${vehicle.plate}。仅保存模拟计划，不会通知司机。`, () => mutate(`/api/ops/routes/${encodeURIComponent(route.id)}/assign`, { driverId, vehicleId }, '司机与车辆已分配'), false, '确认分配');
    });
    byId('route-unassign')?.addEventListener('click', () => {
      confirm('取消这条线路的资源分配？', `${route.name} 将释放当前司机与车辆的时间占用，编入的订单和合作点预约保持不变。重新分配资源后才能派车。`, () => mutate(`/api/ops/routes/${encodeURIComponent(route.id)}/assign`, { driverId: '', vehicleId: '' }, '已取消资源分配，可以重新选择司机车辆'), true, '确认取消分配');
    });
    byId('route-dispatch').addEventListener('click', () => {
      if (!canDispatch) return;
      confirm('确认执行模拟派车？', `${route.name} · ${routeOrders.length} 单。派车后不能再修改编单或司机车辆；已到点订单可继续完成离点交接。不会执行真实运输。`, () => mutate(`/api/ops/routes/${encodeURIComponent(route.id)}/dispatch`, {}, '模拟派车成功，请在合作点完成到点与离点交接'), false, '确认模拟派车');
    });
  }

  function resourceOptions(resources, selectedId, type, selectedName) {
    const initial = '<option value="">请选择</option>';
    const missingSelected = selectedId && !resources.some((resource) => resource.id === selectedId) ? `<option value="${escape(selectedId)}" selected>${escape(selectedName || selectedId)}（当前分配）</option>` : '';
    return initial + missingSelected + resources.map((resource) => {
      const selected = resource.id === selectedId;
      const unavailable = resource.status !== '可用' && !selected;
      const label = type === 'driver' ? `${resource.name} · ${resource.phone || '模拟司机'}` : `${resource.plate} · ${resource.capacity} 个笼位`;
      return `<option value="${escape(resource.id)}"${selected ? ' selected' : ''}${unavailable ? ' disabled' : ''}>${escape(label)}${unavailable ? `（${escape(resource.status)}）` : selected ? '（当前分配）' : ''}</option>`;
    }).join('');
  }

  function initialize(role) {
    if (role !== 'ops' || state.ready) return;
    state.ready = true; state.date = today(); byId('capacity-date').value = state.date;
    setupMobileScreens();
    elements('[data-operations-tab]').forEach((button) => {
      button.addEventListener('click', () => switchTab(button.dataset.operationsTab));
      button.addEventListener('keydown', (keyboardEvent) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(keyboardEvent.key)) return;
        keyboardEvent.preventDefault();
        const tabs = ['review', 'nodes', 'routes'], index = tabs.indexOf(state.activeTab);
        const next = keyboardEvent.key === 'Home' ? 0 : keyboardEvent.key === 'End' ? 2 : (index + (keyboardEvent.key === 'ArrowRight' ? 1 : 2)) % 3;
        switchTab(tabs[next], { focus: true });
      });
    });
    elements('[data-workbench-refresh]').forEach((button) => button.addEventListener('click', () => { if (!state.busy && !state.loading) loadData(); }));
    byId('capacity-node').addEventListener('change', (event) => { if (state.busy || state.loading) return; state.nodeId = event.target.value; renderNodeSummary(); renderCalendar(); renderNodeSettings(); renderHandoffs(); });
    byId('capacity-date').addEventListener('change', (event) => { if (!event.target.value || state.busy || state.loading) return; state.date = event.target.value; loadData(); });
    byId('toggle-route-create').addEventListener('click', () => { if (state.busy || state.loading) return; state.creatingRoute = true; state.routeScreen = 'create'; showError(); renderRouteDetail(); renderMobileScreens(); notifyScreen(); screenTop(); });
    if (state.pendingOpen) { switchTab(state.pendingOpen, { reset: true }); state.pendingOpen = ''; }
    else renderMobileScreens();
    if (!state.loading) loadData();
  }

  window.addEventListener('paichong:ready', (event) => initialize(event.detail?.role));
  window.addEventListener('paichong:data-changed', () => { if (state.ready && !state.busy) loadData(); });
  window.PaichongOperations = { open: (name) => switchTab(name, { reset: true }), back };
  if (window.PaichongReview?.ready) initialize(window.PaichongReview.session().role);
})();
