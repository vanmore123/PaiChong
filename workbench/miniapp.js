(() => {
  'use strict';
  const app = window.PaichongReview;
  const state = { role: '', page: 'home', step: 1, orders: [], filter: 'all', request: 0, opsDetail: false, opsCanBack: false, homeRoute: { fromCity: '广州', toCity: '武汉' } };
  const byId = (id) => document.getElementById(id);
  const escape = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const icon = (name) => `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="./assets/v5/icons/app-sprite.svg#icon-${name}"></use></svg>`;
  const closed = (order) => ['cancelled', 'rejected'].includes(order.reviewStatus);
  const completed = (order) => order.fulfillment?.stage === 'delivered';
  const unpaid = (order) => order.reviewStatus === 'not_submitted' || order.fulfillment?.stage === 'awaiting_payment';
  const money = (value) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 }).format(Number(value || 0));
  const labels = ['确认出行路线', '接送资料与材料', '选择接宠时段', '支付预订保证金', '订单详情'];

  function setup() {
    if (byId('mini-nav')) return;
    document.body.classList.add('miniapp');
    const shell = document.querySelector('.review-shell');
    shell.insertAdjacentHTML('afterbegin', `<header class="mini-nav" id="mini-nav"><button class="mini-back" id="mini-back" type="button" aria-label="返回">${icon('chevron-left')}</button><strong id="mini-title">派宠一号</strong><div class="mini-capsule"><button id="mini-menu" type="button" aria-label="账户与说明">•••</button><span></span><button id="mini-home-button" type="button" aria-label="返回首页">${icon('paw')}</button></div></header>`);
    byId('review-main').insertAdjacentHTML('afterbegin', '<section id="mini-page" class="mini-page"></section><div id="mini-progress" class="mini-progress" hidden></div>');
    shell.insertAdjacentHTML('beforeend', '<nav id="mini-tabs" class="mini-tabs" aria-label="小程序主导航"></nav>');
    byId('mini-back').addEventListener('click', goBack);
    byId('mini-menu').addEventListener('click', () => navigate('profile'));
    byId('mini-home-button').addEventListener('click', () => navigate('home'));
  }

  function tabs() {
    const choices = state.role === 'ops'
      ? [['home', '工作台', 'workbench'], ['ops-orders', '订单', 'order'], ['nodes', '节点', 'node'], ['routes', '线路', 'route'], ['profile', '我的', 'dog']]
      : [['home', '首页', 'home'], ['orders', '订单', 'order'], ['profile', '我的', 'dog']];
    byId('mini-tabs').innerHTML = choices.map(([page, text, art]) => `<button type="button" data-mini-tab="${page}" class="${state.page === page ? 'is-active' : ''}" ${state.page === page ? 'aria-current="page"' : ''}><span class="mini-tab-icon">${icon(art)}</span><span>${text}</span></button>`).join('');
    byId('mini-tabs').hidden = ['create', 'detail', 'guide'].includes(state.page) || state.opsDetail || state.opsCanBack;
    byId('mini-tabs').querySelectorAll('[data-mini-tab]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.miniTab)));
  }

  function title(text, canBack = false) {
    byId('mini-title').textContent = text;
    byId('mini-back').style.visibility = canBack ? 'visible' : 'hidden';
  }

  function activateOriginal(role) {
    byId(`${role}-view`).hidden = false;
    byId(`${role}-view`).classList.add('is-active');
    byId('mini-page').hidden = true;
  }

  async function navigate(page, id) {
    if (state.mutating) { app.toast('正在提交，请稍候再切换页面。'); return; }
    try { window.PaichongSession?.assertCurrent(app.session()?.token || ''); } catch { return; }
    if (page === 'partner') { if (state.role === 'ops') window.location.assign('./partner.html'); return; }
    const request = ++state.request;
    state.page = page; state.opsDetail = false; state.opsCanBack = false;
    document.body.dataset.miniPage = page;
    document.body.classList.remove('mini-ops-detail');
    ['user-view', 'ops-view'].forEach((view) => { byId(view).hidden = true; byId(view).classList.remove('is-active'); });
    byId('mini-page').hidden = false;
    byId('mini-progress').hidden = true;
    tabs();
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (page === 'create') {
      activateOriginal('user'); state.step = 1; app.startNewOrder(state.homeRoute); renderProgress(); return;
    }
    if (page === 'detail') {
      title('订单详情', true); byId('mini-page').innerHTML = '<div class="mini-empty">正在加载行程…</div>';
      try { await app.openUserOrder(id, () => request === state.request && state.page === 'detail'); if (request !== state.request) return; activateOriginal('user'); title('订单详情', true); }
      catch (error) { if (request === state.request) errorPage(error.message, () => navigate('orders')); }
      return;
    }
    if (['ops-orders', 'nodes', 'routes'].includes(page)) {
      activateOriginal('ops');
      title({ 'ops-orders': '订单管理', nodes: '合作点管理', routes: '线路与派车' }[page]);
      window.PaichongOperations?.open(page === 'ops-orders' ? 'review' : page);
      if (page === 'ops-orders') await app.loadOpsOrders();
      return;
    }
    if (page === 'profile') { renderProfile(); return; }
    if (page === 'guide') { renderGuide(); return; }
    if (page === 'orders') { title('我的订单'); await loadOrderList(request); return; }
    title(state.role === 'ops' ? '派宠一号 · 经营者' : '派宠一号');
    await renderHome(request);
  }

  function renderProgress() {
    if (state.page !== 'create') return;
    title(labels[state.step - 1], true);
    byId('mini-progress').hidden = state.step > 4;
    byId('mini-progress').innerHTML = `<div>${[1, 2, 3, 4].map((step) => `<span class="${step <= state.step ? 'is-done' : ''}"></span>`).join('')}</div><small>第 ${Math.min(state.step, 4)} / 4 步 · ${['出行信息', '适运核验', '接宠预约', '支付确认'][Math.min(state.step, 4) - 1]}</small>`;
    tabs();
  }

  function goBack() {
    if (state.mutating) { app.toast('正在提交，请稍候再返回。'); return; }
    if (['nodes', 'routes'].includes(state.page) && state.opsCanBack) { window.PaichongOperations?.back(); window.scrollTo({ top: 0, behavior: 'instant' }); return; }
    if (state.page === 'ops-orders' && state.opsDetail) {
      state.opsDetail = false; document.body.classList.remove('mini-ops-detail'); title('订单管理'); tabs(); window.scrollTo({ top: 0, behavior: 'instant' }); return;
    }
    if (state.page === 'create' && state.step > 1 && state.step < 4) { app.step(state.step - 1); window.scrollTo({ top: 0, behavior: 'instant' }); return; }
    if (['detail', 'create'].includes(state.page) && state.step >= 4) { navigate('orders'); return; }
    navigate(state.page === 'detail' ? 'orders' : 'home');
  }

  function hero(ops = false) {
    if (ops) return `<div class="mini-ops-welcome"><div><span class="mini-eyebrow">合肥总部 · 经营者端</span><h1>你好，派宠经营者</h1><p>先审核订单，再安排接送。</p></div>${icon('workbench')}</div>`;
    return '<div class="mini-hero"><div><span class="mini-eyebrow">猫狗专车 · 安心到家</span><h1>毛孩子出远门<br>每一程都安心</h1><p>独立笼位 · 专车接送</p></div><img src="./assets/v5/brand/paichong-logo.png" width="1536" height="1024" alt="猫狗乘坐派宠专车" fetchpriority="high" /></div>';
  }

  function emptyOrders(heading, detail) {
    return `<div class="mini-empty"><img class="mini-state-art" src="./assets/v5/illustrations/empty-orders.png" width="1536" height="1024" alt="" loading="lazy" /><strong>${escape(heading)}</strong><small>${escape(detail)}</small></div>`;
  }

  function bookingCard() {
    const cityOptions = (selected) => Array.from(byId('from-city').options).map((option) => `<option value="${escape(option.value)}" ${option.value === selected ? 'selected' : ''}>${escape(option.textContent)}</option>`).join('');
    return `<form class="mini-booking-card" id="mini-home-booking" aria-label="预约宠物出行"><h2>预约宠物出行</h2><p>先看预估费用，再安心安排</p><div class="mini-home-route"><label for="mini-from-city">出发城市<select id="mini-from-city">${cityOptions(state.homeRoute.fromCity)}</select></label><button type="button" class="mini-home-swap" id="mini-home-swap" aria-label="交换出发与到达城市">${icon('swap')}</button><label for="mini-to-city">到达城市<select id="mini-to-city">${cityOptions(state.homeRoute.toCity)}</select></label></div><div class="form-message" id="mini-home-error" role="alert" hidden></div><button class="primary-button mini-quote-button" type="submit">${icon('price-tag')}<span>查看预估费用</span>${icon('arrow-right')}</button><p class="mini-booking-note">下一步填写宠物信息，费用确认后再付保证金</p></form>`;
  }

  function bindHomeBooking() {
    const form = byId('mini-home-booking');
    if (!form) return;
    const remember = () => { state.homeRoute = { fromCity: byId('mini-from-city').value, toCity: byId('mini-to-city').value }; byId('mini-home-error').hidden = true; };
    ['mini-from-city', 'mini-to-city'].forEach((id) => byId(id).addEventListener('change', remember));
    byId('mini-home-swap').addEventListener('click', () => {
      const from = byId('mini-from-city'), to = byId('mini-to-city');
      [from.value, to.value] = [to.value, from.value]; remember();
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault(); remember();
      if (state.homeRoute.fromCity === state.homeRoute.toCity) {
        byId('mini-home-error').textContent = '出发与到达城市不能相同，请选择跨省路线。';
        byId('mini-home-error').hidden = false; byId('mini-to-city').focus(); return;
      }
      navigate('create');
    });
  }

  async function renderHome(request) {
    const ops = state.role === 'ops';
    byId('mini-page').innerHTML = `${hero(ops)}<div class="mini-home-content">${ops ? `<div class="mini-section-title"><h2>今日工作</h2><span>待办概览</span></div><div class="mini-metrics" id="mini-home-metrics"><span>正在同步…</span></div><div class="mini-shortcuts"><button data-go="ops-orders">${icon('file-check')}<strong>订单审核</strong><small>材料、补件与确认</small></button><button data-go="nodes">${icon('node')}<strong>合作点容量</strong><small>笼位预约与交接</small></button><button data-go="routes">${icon('van')}<strong>线路与派车</strong><small>编线与资源安排</small></button><button data-go="guide">${icon('info')}<strong>操作须知</strong><small>流程与注意事项</small></button></div>` : `${bookingCard()}<div class="mini-section-title"><h2>我的行程</h2><button data-go="orders">全部订单 ${icon('chevron-right')}</button></div><div id="mini-recent-orders"><div class="mini-empty" role="status">正在同步行程…</div></div><button class="mini-guide-card" data-go="guide">${icon('file-check')}<span><strong>第一次托运？看看出行须知</strong><small>适运材料、保证金与交接说明</small></span>${icon('chevron-right')}</button>`}<p class="mini-demo-note">派宠一号 · 一路被好好照顾</p></div>`;
    if (ops) byId('mini-page').querySelector('.mini-shortcuts').insertAdjacentHTML('beforeend', `<button data-go="partner">${icon('clipboard-check')}<strong>机构余量审批</strong><small>查看申报与生效结果</small></button>`);
    bindLinks(); bindHomeBooking();
    try {
      if (ops) {
        const result = await app.api('/api/ops/dashboard');
        if (request !== state.request) return;
        byId('mini-home-metrics').innerHTML = result.metrics.map((item) => `<div><strong>${escape(item.value)}</strong><span>${escape(item.label)}</span></div>`).join('');
      } else {
        const result = await app.api('/api/user/orders');
        if (request !== state.request) return;
        state.orders = result.items || [];
        byId('mini-recent-orders').innerHTML = state.orders.length ? state.orders.slice(0, 1).map(orderCard).join('') : emptyOrders('还没有出行计划', '第一次出发，从预约开始。');
        bindOrderCards();
      }
    } catch (error) {
      if (request !== state.request) return;
      const target = byId(ops ? 'mini-home-metrics' : 'mini-recent-orders');
      target.innerHTML = `<div class="mini-empty">${escape(error.message)}<button id="mini-retry-home" class="text-button">重新加载</button></div>`;
      byId('mini-retry-home').addEventListener('click', () => navigate('home'));
    }
  }

  function orderCard(order) {
    const done = closed(order);
    return `<button type="button" class="mini-order-card" data-mini-order="${escape(order.id)}"><div class="mini-order-top"><span class="mini-order-pet">${icon(order.petType === '犬' ? 'dog' : 'cat')}<span>${escape(order.petName)}的出行</span></span><strong class="${done ? 'is-closed' : ''}">${escape(order.status)}</strong></div><h3>${escape(order.fromCity)}<span>${icon('arrow-right')}</span>${escape(order.toCity)}</h3><p>${icon('calendar')}${escape(order.pickup?.date || '未预约')} ${escape(order.pickup?.timeSlot || '')}</p><div class="mini-order-foot"><small>${order.assignedNode ? escape(order.assignedNode.name) : '节点待安排'}</small><span>${done ? '查看结果' : order.reviewStatus === 'not_submitted' ? '继续支付' : '查看行程'} ${icon('chevron-right')}</span></div></button>`;
  }

  async function loadOrderList(request) {
    byId('mini-page').innerHTML = '<div class="mini-empty">正在加载订单…</div>';
    try {
      const result = await app.api('/api/user/orders');
      if (request !== state.request) return;
      state.orders = result.items || [];
      renderOrderList();
    } catch (error) { if (request === state.request) errorPage(error.message, () => navigate('orders')); }
  }

  function renderOrderList() {
    const orders = state.orders.filter((order) => state.filter === 'all' || (state.filter === 'closed' ? closed(order) : state.filter === 'done' ? completed(order) : state.filter === 'unpaid' ? unpaid(order) : !closed(order) && !completed(order) && order.reviewStatus !== 'not_submitted'));
    byId('mini-page').innerHTML = `<div class="mini-order-filters" role="group" aria-label="筛选我的订单">${[['all', '全部'], ['active', '进行中'], ['unpaid', '待付款'], ['done', '已完成'], ['closed', '已关闭']].map(([key, label]) => `<button type="button" data-mini-filter="${key}" class="${state.filter === key ? 'is-active' : ''}" aria-pressed="${state.filter === key}">${label}</button>`).join('')}</div><div class="mini-orders-content">${orders.length ? orders.map(orderCard).join('') : emptyOrders('这里还没有订单', '换个分类看看，或开启新的出行。')}<button class="primary-button mini-full-button" data-go="create">${icon('paw')}预约新的出行</button></div>`;
    document.querySelectorAll('[data-mini-filter]').forEach((button) => button.addEventListener('click', () => { state.filter = button.dataset.miniFilter; renderOrderList(); }));
    bindOrderCards(); bindLinks();
  }

  function bindOrderCards() { document.querySelectorAll('[data-mini-order]').forEach((button) => button.addEventListener('click', () => navigate('detail', button.dataset.miniOrder))); }
  function bindLinks() { byId('mini-page').querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.go))); }

  function renderProfile() {
    title('我的');
    const session = app.session(), account = session?.account || '';
    const masked = /^1\d{10}$/.test(account) ? `${account.slice(0, 3)} **** ${account.slice(-4)}` : account;
    byId('mini-page').innerHTML = `<div class="mini-profile"><div class="mini-profile-card"><span>${icon(state.role === 'ops' ? 'workbench' : 'dog')}</span><div><h1>${state.role === 'ops' ? '派宠经营者' : '宠物主人'}</h1><p>${escape(masked)}</p><small>${state.role === 'ops' ? '运营权限' : '用户权限'}</small></div></div><div class="mini-menu-card"><button data-go="${state.role === 'ops' ? 'ops-orders' : 'orders'}">${icon('clipboard-check')}<span>${state.role === 'ops' ? '订单管理' : '我的订单'}</span>${icon('arrow-right')}</button><button data-go="guide">${icon('info')}<span>使用说明</span>${icon('arrow-right')}</button><div class="mini-version">总部所在地<span>安徽 · 合肥</span></div><div class="mini-version">当前版本<span>体验版</span></div></div><div class="mini-security-note">${icon('shield-check')}身份由账号密码决定，退出后才能切换账号。</div><button id="mini-logout" class="outline-button mini-full-button">退出当前账号</button><p class="mini-demo-note">体验说明：数据仅保存在本端浏览器，不跨端同步。</p></div>`;
    if (state.role === 'ops') byId('mini-page').querySelector('.mini-menu-card').insertAdjacentHTML('afterbegin', `<button data-go="partner">${icon('node')}<span>合作机构余量审批</span>${icon('arrow-right')}</button>`);
    bindLinks(); byId('mini-logout').addEventListener('click', app.logout);
  }

  function renderGuide() {
    title(state.role === 'ops' ? '经营者操作须知' : '宠物出行须知', true);
    const sections = state.role === 'ops' ? [
      ['01 · 先核验，再安排', '审核材料与建议价时按接宠日期时段预留合作点笼位，用户确认后再编线。'],
      ['02 · 笼位独立计量', '一单一个笼位。已到点尚未离开的宠物持续占位，不因日期变化自动清空；当前满位时需先完成离点交接。'],
      ['03 · 派车前检查', '检查顺向区段、接宠时间、最少发车单数和司机车辆时间冲突；未派车可移单或取消资源分配。'],
      ['04 · 履约与异常', '到点和派车后由司机验宠，用户确认总价并付清尾款后才能离点。司机更新运输与签收；异常在订单详情中由经营者处理后恢复原流程，不自动签收。']
    ] : [
      ['01 · 提前准备材料', '准备清晰的宠物近期全身照和有效免疫记录，如实填写健康声明及晕车、用药等照护说明。体验版仅保留文件名称，请勿上传真实证件。'],
      ['02 · 费用需要确认', '系统先提供估价，预订保证金为基础价的20%。运营建议价用于方案确认；司机验宠后再出具总价，由你确认抵扣保证金后的尾款，体验版不扣款。'],
      ['03 · 节点由运营安排', '无需自行选择合作点，运营根据预约时间和同城笼位安排合作点；订单详情可查看方案及交接进度。'],
      ['04 · 改期与取消', '审核通过前可以改期；未编线、未到点的订单可取消。体验版按全额退还保证金展示，不代表正式收费政策。']
    ];
    byId('mini-page').innerHTML = `<div class="mini-guide"><p class="mini-guide-intro">先把每一步看清楚，再放心出发。</p>${sections.map(([heading, text]) => `<section><h2>${heading}</h2><p>${text}</p></section>`).join('')}<p class="mini-demo-note">体验说明：不产生实际扣款、运输或通知；各端数据独立保存。</p></div>`;
  }

  function errorPage(message, retry) {
    byId('mini-page').innerHTML = `<div class="mini-empty">${escape(message)}<button id="mini-retry" class="outline-button">重新加载</button></div>`;
    byId('mini-retry').addEventListener('click', retry);
  }

  function initialize(role) { if (state.role) return; setup(); state.role = role; navigate('home'); }
  window.addEventListener('paichong:ready', (event) => initialize(event.detail.role));
  window.addEventListener('paichong:user-step', (event) => {
    state.step = event.detail.step;
    if (state.page === 'create') { renderProgress(); window.scrollTo({ top: 0, behavior: 'instant' }); }
  });
  window.addEventListener('paichong:ops-order', () => {
    if (state.page !== 'ops-orders') return;
    state.opsDetail = true; document.body.classList.add('mini-ops-detail'); title('订单审核详情', true); tabs(); window.scrollTo({ top: 0, behavior: 'instant' });
  });
  window.addEventListener('paichong:ops-screen', (event) => {
    if (!['nodes', 'routes'].includes(state.page)) return;
    state.opsCanBack = Boolean(event.detail.canBack); title(event.detail.title, state.opsCanBack); tabs(); window.scrollTo({ top: 0, behavior: 'instant' });
  });
  window.addEventListener('paichong:ops-changed', () => { if (state.page === 'home' && state.role === 'ops') navigate('home'); });
  window.addEventListener('paichong:mutation-busy', (event) => { state.mutating = event.detail.busy; });
  if (app.ready) initialize(app.session().role);
})();
