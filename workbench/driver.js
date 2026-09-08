(() => {
  'use strict';
  const copy = (value) => window.PaichongProductCopy?.text(value) ?? value;
  const sessions = window.PaichongSession;
  const AUTH_KEY = sessions?.storageKey || 'paichong-auth-v1', ui = window.PaichongFulfillment;
  const escape = ui.escape, money = ui.money, byId = (id) => document.getElementById(id);
  const icon = (name) => `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="./assets/v5/icons/app-sprite.svg#icon-${name}"></use></svg>`;
  const state = { session: null, page: 'tasks', selected: '', filter: 'active', orders: [], busy: false, request: 0 };
  const main = byId('driver-main');
  const labels = { awaiting_payment: '待尾款确认', ready: '费用已确认', in_transit: '运输中', arrived: '待签收', exception: '异常待处理', delivered: '已签收', returning: '退运中', terminated: '已结束' };
  function toast(message) { byId('driver-toast').textContent = message; byId('driver-toast').classList.add('is-visible'); clearTimeout(toast.timer); toast.timer = setTimeout(() => byId('driver-toast').classList.remove('is-visible'), 2600); }
  function redirectLogin() {
    if (sessions) {
      if (!sessions.clear(state.session?.token || '') && sessions.read()) { try { sessions.assertCurrent(state.session?.token || ''); } catch { return; } }
    } else if (JSON.parse(localStorage.getItem(AUTH_KEY) || 'null')?.token === state.session?.token) localStorage.removeItem(AUTH_KEY);
    location.replace('./login.html?entry=driver');
  }
  async function api(path, options = {}) {
    if (sessions) {
      try { return await sessions.request(path, { ...options, expectedToken: state.session?.token || '' }); }
      catch (error) { if (error.status === 401) location.replace('./login.html?entry=driver'); throw error; }
    }
    const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.session?.token || ''}` }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
    const data = await response.json();
    if (!response.ok) { if (response.status === 401) redirectLogin(); throw new Error(data.error || '暂时无法加载，请重试'); }
    return data;
  }
  function navigation() {
    byId('driver-back').hidden = !state.selected;
    byId('driver-title').textContent = state.selected ? '司机任务详情' : state.page === 'profile' ? '我的' : '派宠一号 · 司机';
    byId('driver-tabs').hidden = Boolean(state.selected);
    byId('driver-tabs').innerHTML = [['tasks', '任务', 'van'], ['profile', '我的', 'dog']].map(([page, name, art]) => `<button type="button" data-page="${page}" aria-label="${name}" class="${state.page === page ? 'is-active' : ''}" ${state.page === page ? 'aria-current="page"' : ''}><span class="mini-tab-icon">${icon(art)}</span><span>${name}</span></button>`).join('');
    byId('driver-tabs').querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => { if (state.busy) return; state.page = button.dataset.page; state.selected = ''; render(); window.scrollTo(0, 0); }));
  }
  function card(order) {
    return `<button class="driver-task-card" data-order="${escape(order.id)}"><div class="driver-task-top"><span>${icon(order.petType === '犬' ? 'dog' : 'cat')}${escape(order.petName)}</span><small>${escape(labels[order.fulfillment?.stage] || (order.nodeReservation?.status === 'confirmed' ? '等待到点' : '待验宠'))}</small></div><h2>${escape(order.fromCity)}<span>→</span>${escape(order.toCity)}</h2><p>${escape(order.assignedNode?.name || '合作交接点')} · ${escape(order.pickup?.date || '')}</p><div class="driver-task-foot"><small>${escape(order.transport?.vehiclePlate || '')}</small><span>查看任务 ${icon('chevron-right')}</span></div></button>`;
  }
  function tasks() {
    const active = state.orders.filter((o) => !['delivered', 'terminated'].includes(o.fulfillment?.stage)), done = state.orders.length - active.length;
    const shown = state.filter === 'done' ? state.orders.filter((o) => ['delivered', 'terminated'].includes(o.fulfillment?.stage)) : active;
    main.innerHTML = `<div class="driver-greeting"><div><p>司机工作台</p><h1>你好，${escape(copy(state.session.name))}</h1></div><span>${icon('van')}</span></div><div class="driver-metrics"><div><strong>${active.filter((o) => !o.fulfillment?.inspection).length}</strong><span>待验宠</span></div><div><strong>${active.filter((o) => o.fulfillment?.stage === 'awaiting_payment').length}</strong><span>待尾款</span></div><div><strong>${active.filter((o) => o.fulfillment?.stage === 'exception').length}</strong><span>待处理异常</span></div></div><p class="driver-demo-note">仅显示分配给你的任务</p><div class="mini-order-filters"><button data-filter="active" class="${state.filter === 'active' ? 'is-active' : ''}" aria-pressed="${state.filter === 'active'}">进行中 ${active.length}</button><button data-filter="done" class="${state.filter === 'done' ? 'is-active' : ''}" aria-pressed="${state.filter === 'done'}">已完成 ${done}</button></div><div class="driver-task-list">${shown.length ? shown.map(card).join('') : `<div class="driver-empty"><img src="./assets/v5/illustrations/empty-orders.png" alt="" /><h2>${state.filter === 'done' ? '还没有已完成任务' : '暂时没有待处理任务'}</h2><p>经营者完成编线、分配司机和派车后，任务会出现在这里。</p></div>`}</div>`;
    main.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => { state.filter = button.dataset.filter; tasks(); }));
    main.querySelectorAll('[data-order]').forEach((button) => button.addEventListener('click', () => { state.selected = button.dataset.order; render(); window.scrollTo(0, 0); }));
  }
  function checkbox(name, label) { return `<label class="fulfillment-check"><input type="checkbox" name="${name}" required />${label}</label>`; }
  function form(action, body, button) { return `<form class="driver-action-form" data-action="${action}">${body}<button class="primary-button" type="submit">${button}</button><p class="form-message" role="alert" hidden></p></form>`; }
  function nextAction(order) {
    const f = order.fulfillment, handoff = order.nodeReservation?.status;
    if (window.PAICHONG_DEMO_MODE === true && order.serviceRequest?.status === 'pending') return '<section class="driver-action-card"><h2>总部正在处理行程变更</h2><p>暂不继续交接、出发或签收。处理后刷新任务查看。</p></section>';
    if (window.PAICHONG_DEMO_MODE === true && f?.stage === 'returning') return `<section class="driver-action-card"><h2>退回 ${escape(f.returnTrip.destination)}，完成交接</h2><p>${escape(f.returnTrip.note)}</p>${form('return-receipt', `<label>实际接收人姓名<input name="receiverName" maxlength="40" required placeholder="请输入接收人姓名" /></label>${checkbox('receiverVerified', '已核对退回接收人身份')}${checkbox('petAccepted', '宠物已安全交回，交接情况已确认')}`, '确认退运交接完成')}</section>`;
    if (f?.stage === 'terminated') return '<section class="driver-action-card"><h2>本次任务已结束</h2><p>交接与处理记录已保存，后续退款由总部处理。</p></section>';
    if (!f) {
      if (!['arrived', 'departed'].includes(handoff)) return '<section class="driver-action-card"><h2>等待合作点到点登记</h2><p>经营者登记宠物到点后，可在这里开始验宠。点击右上角刷新查看进度。</p></section>';
      return `<section class="driver-action-card"><span class="driver-step">下一步 · 现场验宠</span><h2>核对毛孩子与交接资料</h2><p>司机提交后不能自行重复改价；如需调整，请联系总部核对。</p>${form('inspection', `${checkbox('identity', '宠物身份与材料一致')}${checkbox('cage', '笼具状态与固定情况已核对')}${checkbox('handoff', '现场交接情况已核对，可继续履约')}<label>验宠确认总价（元）<input name="lockedPrice" type="number" min="${order.deposit.amount}" max="100000" step="0.01" required value="${escape(order.confirmedPrice ?? order.proposedPrice)}" /></label><label>验宠与费用说明<textarea name="note" rows="3" maxlength="300" required placeholder="记录核对情况；如价格变化，请说明原因"></textarea></label>`, '确认验宠并提交总价')}</section>`;
    }
    if (f.stage === 'awaiting_payment') return '<section class="driver-action-card"><span class="driver-step">等待用户</span><h2>总价已提交，等待确认尾款</h2><p>用户确认费用后，经营者才能办理离点交接。司机不能代替用户付款。</p></section>';
    if (f.stage === 'ready') return `<section class="driver-action-card"><span class="driver-step">下一步 · 出发准备</span><h2>${handoff === 'departed' ? '交接完成，可以准备出发' : '等待合作点离点交接'}</h2>${handoff === 'departed' ? form('depart', checkbox('ready', '已完成宠物、笼具与车辆交接，确认出发'), '确认出发') : '<p>费用已确认，请经营者办理离点。完成后刷新即可登记出发。</p>'}</section>`;
    if (f.stage === 'in_transit') {
      const cities = order.transport?.cities || [order.fromCity, order.toCity];
      const remaining = cities.slice(cities.indexOf(f.currentCity) + 1, cities.indexOf(order.toCity) + 1);
      return `<section class="driver-action-card"><span class="driver-step">下一步 · 更新节点</span><h2>记录这一路的照护</h2><p>上次登记城市：${escape(f.currentCity)}</p>${form('checkpoint', `<label>本次到达城市<select name="city" required>${remaining.map((city) => `<option>${escape(city)}</option>`).join('')}</select></label><label>节点记录说明<textarea name="note" rows="2" maxlength="300" required placeholder="如：已完成停车检查，宠物状态已记录"></textarea></label>`, '确认到达并记录')}</section>`;
    }
    if (f.stage === 'arrived') return `<section class="driver-action-card"><span class="driver-step">下一步 · 核对签收</span><h2>把毛孩子安心交到手中</h2>${form('receipt', `<label>实际签收人姓名<input name="receiverName" maxlength="40" required placeholder="请输入签收人姓名" /></label>${checkbox('receiverVerified', '已核对签收人身份及交接信息')}${checkbox('petAccepted', '宠物交接情况已确认，无待处理异常')}`, '确认签收')}</section>`;
    return '';
  }
  function detail(order) {
    const f = order.fulfillment;
    main.innerHTML = `<section class="driver-detail-hero"><p>${escape(order.id)}</p><div>${icon(order.petType === '犬' ? 'dog' : 'cat')}<h1>${escape(order.petName)}的出行</h1></div><h2>${escape(order.fromCity)} → ${escape(order.toCity)}</h2><span class="fulfillment-chip">${escape(labels[f?.stage] || '待验宠')}</span></section>${nextAction(order)}${ui.markup(order, 'driver')}
      <section class="driver-contact-card"><h2>本次接送信息</h2><dl><div><dt>宠物资料</dt><dd>${escape(order.petType)} · ${escape(order.breed)} · ${escape(order.weight)}kg</dd></div><div><dt>接宠合作点</dt><dd>${escape(order.assignedNode?.name || '')}</dd></div><div><dt>司机 / 车辆</dt><dd>${escape(order.transport?.driverName)} · ${escape(order.transport?.vehiclePlate)}</dd></div><div><dt>寄件人</dt><dd>${escape(copy(order.contactName))} · ${escape(order.contactPhone)}</dd></div><div><dt>收件人</dt><dd>${escape(copy(order.recipientName))} · ${escape(order.recipientPhone)}<br>${escape(copy(order.recipientAddress))}</dd></div><div><dt>照护说明</dt><dd>${escape(copy(order.careNote || '暂无特殊照护说明'))}</dd></div></dl></section>
      ${f && !['exception', 'delivered', 'returning', 'terminated'].includes(f.stage) && order.serviceRequest?.status !== 'pending' ? `<details class="driver-exception-form"><summary>${icon('alert-circle')}遇到问题？上报履约异常</summary><p>上报后暂停后续动作，由经营者处理。请及时联系总部核对处理安排。</p>${form('exception', '<label>异常情况<textarea name="note" rows="3" maxlength="300" required placeholder="说明发生情况及当前需要处理的问题"></textarea></label>', '提交异常并暂停履约')}</details>` : ''}`;
    if (window.PaichongMaterials && window.PAICHONG_DEMO_MODE === true) { main.insertAdjacentHTML('beforeend', window.PaichongMaterials.markup(order)); window.PaichongMaterials.bind(main, order); }
    main.querySelectorAll('[data-action]').forEach((formNode) => {
      const requestId = crypto.randomUUID();
      formNode.addEventListener('submit', async (event) => {
        event.preventDefault(); if (state.busy) return;
        const action = formNode.dataset.action, fields = new FormData(formNode), error = formNode.querySelector('[role="alert"]');
        const body = Object.fromEntries(fields); ['receiverVerified', 'petAccepted'].forEach((key) => body[key] = fields.has(key));
        if (action === 'inspection') body.checks = Object.fromEntries(['identity', 'cage', 'handoff'].map((key) => [key, fields.has(key)]));
        if (action === 'exception') body.clientRequestId = requestId;
        state.busy = true; state.request += 1; error.hidden = true; formNode.querySelector('button').disabled = true;
        try { const result = await api(`/api/driver/orders/${encodeURIComponent(order.id)}/${action}`, { method: 'POST', body }); state.orders = state.orders.map((o) => o.id === order.id ? result.order : o); toast('记录已保存'); render(); window.scrollTo(0, 0); }
        catch (e) { error.textContent = copy(e.message); error.hidden = false; }
        finally { state.busy = false; formNode.querySelector('button').disabled = false; }
      });
    });
  }
  function profile() {
    main.innerHTML = `<div class="mini-profile-card"><span>${icon('van')}</span><div><h1>${escape(copy(state.session.name))}</h1><p>${escape(state.session.account)}</p><small>司机权限 · 仅可操作自己的已派任务</small></div></div><div class="mini-menu-card"><div class="mini-version">总部所在地<span>安徽 · 合肥</span></div></div><section class="driver-contact-card"><h2>任务操作说明</h2><p>到点验宠 → 用户确认费用 → 合作点离点 → 司机出发 → 节点登记 → 确认签收。</p><p>异常由经营者处理，不会自动变为签收。切换账号前请退出；跨账号操作后点击刷新查看最新状态。</p></section><button id="driver-logout" class="outline-button mini-full-button">退出当前账号</button><p class="driver-demo-note">派宠一号 · 一路被好好照顾</p>`;
    byId('driver-logout').addEventListener('click', async () => { if (state.busy) return; state.busy = true; try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch { /* Always clear the device's session, including when offline. */ } finally { state.busy = false; redirectLogin(); } });
  }
  function render() { navigation(); if (state.page === 'profile') return profile(); const order = state.orders.find((o) => o.id === state.selected); if (order) detail(order); else { state.selected = ''; navigation(); tasks(); } }
  async function load() {
    if (state.busy) return; const request = ++state.request;
    byId('driver-refresh').disabled = true;
    try { const data = await api('/api/driver/orders'); if (request !== state.request) return; state.orders = data.items; render(); }
    catch (e) { main.innerHTML = `<div class="driver-empty" role="alert"><h2>暂时无法加载任务</h2><p>${escape(e.message)}</p><button id="driver-retry" class="outline-button">重新加载</button></div>`; byId('driver-retry').addEventListener('click', load); }
    finally { byId('driver-refresh').disabled = false; }
  }
  byId('driver-refresh').addEventListener('click', load);
  byId('driver-back').addEventListener('click', () => { if (state.busy) return; state.selected = ''; render(); window.scrollTo(0, 0); });
  async function init() {
    try { state.session = sessions ? sessions.read() : JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); } catch { /* Invalid persisted session is rejected below. */ }
    if (!state.session?.token) return redirectLogin();
    if (sessions && !sessions.allowedRole(state.session.role)) { location.replace('./login.html'); return; }
    try {
      const verified = await api('/api/auth/me');
      if (verified.role !== state.session.role || verified.account !== state.session.account) return redirectLogin();
      if (verified.role !== 'driver') { location.replace(verified.role === 'partner' ? './partner.html' : './client-review.html'); return; }
      state.session = { token: state.session.token, ...verified };
      await load();
    } catch (e) { main.innerHTML = `<div class="driver-empty" role="alert"><h2>暂时无法验证身份</h2><p>${escape(e.message)}</p><a href="./login.html">返回登录</a></div>`; }
  }
  init();
})();
