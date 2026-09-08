(() => {
  'use strict';

  const DEMO_PHONE = '13800138000';
  const sessions = window.PaichongSession;
  const AUTH_STORAGE_KEY = sessions?.storageKey || 'paichong-auth-v1';
  const STORAGE_KEY = sessions?.kind ? `paichong-review-state-${sessions.kind}-v1` : 'paichong-review-state-v1';
  const money = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const HEALTH_LABELS = {
    noDisease: '近期无传染性疾病症状',
    notPregnant: '非孕期、非术后恢复期',
    safeHandling: '可进行安全交接'
  };
  const REVIEW_ACTION_LABELS = {
    supplement: '用户提交补充材料',
    request_info: '运营要求补充材料',
    approve: '运营审核通过',
    reject: '运营拒绝承运',
    confirm: '用户确认方案', cancel: '用户取消订单', reschedule: '用户改期', refund: '模拟退款处理', refund_succeeded: '模拟退款成功', refund_failed: '模拟退款失败',
    node_check_in: '合作点到点登记', node_check_out: '合作点离点交接', node_checkin: '合作点到点登记', node_checkout: '合作点离点交接',
    route_add: '订单编入线路', route_remove: '订单移出线路', order_added_to_route: '订单编入线路', order_removed_from_route: '订单移出线路', route_assign: '分配司机与车辆', route_assigned: '分配司机与车辆', route_dispatch: '运营模拟派车', route_dispatched: '运营模拟派车'
  };

  const state = {
    role: 'user',
    step: 1,
    maxStep: 1,
    quote: null,
    materials: { petPhoto: '', vaccineProof: '', standingPhoto: '' },
    healthDeclaration: [],
    slots: [],
    selectedSlotId: '',
    availabilityMeta: {},
    draftRevision: 0,
    clientRequestId: '',
    creatingOrder: false,
    pendingMutations: 0,
    currentOrder: null,
    userOrders: [],
    opsToken: '',
    opsOrders: [],
    opsNodes: [],
    selectedOpsOrderId: '',
    opsFilter: 'all',
    dialogAction: null
  };
  let authSession = null;

  const byId = (id) => document.getElementById(id);
  const all = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const icon = (name, extraClass = '') => `<svg class="ui-icon${extraClass ? ` ${extraClass}` : ''}" aria-hidden="true"><use href="./assets/v5/icons/app-sprite.svg#icon-${name}"></use></svg>`;
  const escapeHtml = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function readSavedState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  }

  function readAuthSession() {
    if (sessions) return sessions.read();
    try { return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || 'null'); } catch { return null; }
  }

  function hasValidAuthShape(session) {
    return Boolean(session?.token && session?.account && ['user', 'ops', 'driver', 'partner'].includes(session?.role));
  }

  function currentUserAccount() {
    return authSession?.role === 'user' ? authSession.account : DEMO_PHONE;
  }

  function clearAuthAndRedirect(expectedToken = authSession?.token || '') {
    try {
      if (sessions) { if (!sessions.clear(expectedToken)) { sessions.assertCurrent(expectedToken); return; } }
      else if ((readAuthSession()?.token || '') === expectedToken) localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch { return; }
    window.location.replace('./login.html');
  }

  function persistState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        phone: currentUserAccount(),
        orderId: state.currentOrder?.id || ''
      }));
    } catch { /* Local storage is optional in the review environment. */ }
  }

  function formatMoney(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? money.format(amount) : '—';
  }

  function formatDate(value, options = { month: 'numeric', day: 'numeric', weekday: 'short' }) {
    if (!value) return '—';
    const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return new Intl.DateTimeFormat('zh-CN', options).format(parsed);
  }

  function formatDateTime(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value || '—');
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(parsed);
  }

  function toast(message) {
    const node = byId('toast');
    node.textContent = message;
    node.classList.add('is-visible');
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => node.classList.remove('is-visible'), 2600);
  }

  function setMessage(id, message = '') {
    const node = byId(id);
    if (!node) return;
    node.textContent = message;
    node.hidden = !message;
  }

  function setBusy(button, busy, label = '处理中…') {
    if (!button) return;
    if (busy) {
      button.dataset.originalHtml = button.innerHTML;
      button.innerHTML = `${icon('loader', 'busy-icon')}<span>${escapeHtml(label)}</span>`;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    } else {
      button.innerHTML = button.dataset.originalHtml || button.innerHTML;
      button.disabled = false;
      button.removeAttribute('aria-busy');
      delete button.dataset.originalHtml;
    }
  }

  async function api(path, options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    const requiredRole = path.startsWith('/api/user/')
      ? 'user'
      : (path.startsWith('/api/driver/') ? 'driver' : path.startsWith('/api/ops/') || path === '/api/demo/reset' ? 'ops' : '');
    if ((requiredRole || ['/api/auth/me', '/api/auth/logout'].includes(path)) && authSession?.token) {
      headers.Authorization = `Bearer ${authSession.token}`;
    }
    if (options.body !== undefined && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const mutating = !['GET', 'HEAD'].includes(String(options.method || 'GET').toUpperCase());
    const notifyBusy = () => window.dispatchEvent(new CustomEvent('paichong:mutation-busy', { detail: { busy: state.pendingMutations > 0 } }));
    if (mutating) { state.pendingMutations += 1; notifyBusy(); }
    try {
      if (sessions) {
        try { return await sessions.request(path, { ...options, expectedToken: authSession?.token || '' }); }
        catch (error) { if (error.status === 401) window.location.replace('./login.html'); throw error; }
      }
      const response = await fetch(path, {
        ...options, headers,
        body: options.body === undefined || options.body instanceof FormData ? options.body : JSON.stringify(options.body)
      });
      let payload = {};
      try { payload = await response.json(); } catch { payload = {}; }
      if (!response.ok) {
        const error = new Error(payload.error || payload.message || `请求失败（${response.status}）`);
        error.status = response.status;
        if (response.status === 401 && (requiredRole || path === '/api/auth/me')) clearAuthAndRedirect();
        throw error;
      }
      return payload;
    } finally {
      if (mutating) { state.pendingMutations -= 1; notifyBusy(); }
    }
  }

  function defaultTravelDate() {
    return state.availabilityMeta.nextAvailableDate || state.availabilityMeta.minDate || new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
  }

  function invalidateDraft() {
    state.draftRevision += 1;
    state.quote = null;
    state.slots = [];
    state.selectedSlotId = '';
    state.clientRequestId = '';
    state.maxStep = 1;
    byId('create-order').disabled = true;
    showStep(1, { force: true });
    updateSummary();
  }

  function startNewOrder(prefill = {}) {
    state.currentOrder = null;
    state.materials = { petPhoto: '', vaccineProof: '', standingPhoto: '' };
    state.healthDeclaration = [];
    byId('quote-form').reset();
    [['from-city', prefill.fromCity], ['to-city', prefill.toCity]].forEach(([id, city]) => {
      const select = byId(id);
      if (city && Array.from(select.options).some((option) => option.value === city)) select.value = city;
    });
    byId('materials-form').reset();
    byId('deposit-agreement').checked = false;
    byId('contact-phone').value = currentUserAccount();
    byId('travel-date').value = defaultTravelDate();
    setUpload('petPhoto', ''); setUpload('vaccineProof', '');
    ['quote-error', 'materials-error', 'slot-error', 'deposit-error'].forEach((id) => setMessage(id));
    invalidateDraft();
    persistState();
    renderUserOrderSelector();
    loadBookingDates();
  }

  function applyBookingMeta(payload) {
    state.availabilityMeta = payload;
    const date = byId('travel-date');
    if (payload.minDate) date.min = payload.minDate;
    if (payload.maxDate) date.max = payload.maxDate;
    byId('booking-date-hint').textContent = payload.minDate && payload.maxDate
      ? `可预约 ${formatDate(payload.minDate, { month: 'numeric', day: 'numeric' })}–${formatDate(payload.maxDate, { month: 'numeric', day: 'numeric' })}`
      : '按城市显示可约日期，时段余量以提交时为准';
  }

  async function loadBookingDates() {
    const city = formValue('from-city');
    try {
      const payload = await api(`/api/user/availability?city=${encodeURIComponent(city)}`);
      if (city !== formValue('from-city')) return;
      applyBookingMeta(payload);
      const selected = formValue('travel-date');
      if (!selected || (payload.minDate && selected < payload.minDate) || (payload.maxDate && selected > payload.maxDate) || (payload.availableDates?.length && !payload.availableDates.includes(selected))) byId('travel-date').value = defaultTravelDate();
    } catch (error) { byId('booking-date-hint').textContent = `日期加载失败：${error.message}`; }
  }

  function formValue(id) { return byId(id)?.value?.trim() || ''; }

  function quoteInput() {
    return {
      fromCity: formValue('from-city'),
      toCity: formValue('to-city'),
      petType: formValue('pet-type'),
      weight: Number(formValue('pet-weight')),
      serviceType: formValue('service-type')
    };
  }

  function quoteTotal(quote = state.quote) {
    return Number(quote?.basePrice ?? quote?.totalMin ?? quote?.priceEstimate ?? 0);
  }

  function quoteDeposit(quote = state.quote) {
    const explicit = Number(quote?.depositAmount);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    return Math.round(quoteTotal(quote) * Number(quote?.depositRate || 0.2));
  }

  function updateSummary() {
    const order = state.step >= 4 ? state.currentOrder : null;
    const pet = order ? getOrderPet(order) : null;
    const quote = order?.quote || state.quote;
    const from = order?.fromCity || formValue('from-city') || quote?.fromCity || '广州';
    const to = order?.toCity || formValue('to-city') || quote?.toCity || '武汉';
    const name = pet?.name || formValue('pet-name') || '豆包';
    const type = pet?.type || formValue('pet-type') || '猫';
    const breed = pet?.breed || formValue('pet-breed') || '中华田园猫';
    const weight = pet?.weight || formValue('pet-weight') || '5';
    byId('summary-route').textContent = `${from} → ${to}`;
    byId('summary-pet-name').textContent = `${name} · ${type}`;
    byId('summary-pet-detail').textContent = `${breed} · ${weight}kg`;
    byId('summary-price').textContent = quote ? `${formatMoney(quote.totalMin || quoteTotal(quote))}–${formatMoney(quote.totalMax || quoteTotal(quote))}` : '待询价';
    byId('summary-deposit').textContent = quote ? formatMoney(order?.depositAmount || order?.deposit?.amount || quoteDeposit(quote)) : '—';
    byId('summary-duration').textContent = quote?.estimatedDays ? String(quote.estimatedDays).replace(/天\s*天$/, '天') : '—';
    const mobileQuote = byId('mini-quote-summary');
    if (mobileQuote) {
      mobileQuote.hidden = !quote;
      mobileQuote.innerHTML = quote ? `<div><span>本次预估费用</span><strong>${formatMoney(quote.totalMin || quoteTotal(quote))}–${formatMoney(quote.totalMax || quoteTotal(quote))}</strong></div><p>${escapeHtml(from)} → ${escapeHtml(to)} · 保证金 ${formatMoney(quoteDeposit(quote))}</p><small>按当前宠物信息预估，实际方案仍需审核确认。</small>` : '';
    }
    const slot = order?.pickup || state.slots.find((item) => item.id === state.selectedSlotId);
    byId('summary-slot').textContent = slot ? `${formatDate(slot.date, { month: 'numeric', day: 'numeric' })} ${slot.timeSlot || order?.pickupTime || ''}` : '待选择';
  }

  function showStep(step, { force = false } = {}) {
    if (state.pendingMutations) { toast('正在提交，请稍候再切换页面。'); return; }
    const target = Number(step);
    if (target === 4 && (!state.currentOrder || reviewStatus(state.currentOrder) !== 'not_submitted')) return;
    if (state.currentOrder && target < 4) {
      toast('当前为已生成订单。需要重新填写时，请点击“新建一单”。');
      return;
    }
    if (!force && target !== 5 && target > state.maxStep) return;
    state.step = target;
    all('.wizard-pane').forEach((pane) => pane.classList.toggle('is-active', Number(pane.dataset.pane) === target));
    all('.wizard-step').forEach((button) => {
      const buttonStep = Number(button.dataset.step);
      button.classList.toggle('is-current', buttonStep === target);
      button.classList.toggle('is-complete', buttonStep < target && buttonStep <= state.maxStep);
      button.toggleAttribute('aria-current', buttonStep === target);
      button.disabled = buttonStep !== 5 && (state.currentOrder ? (buttonStep < 4 || reviewStatus(state.currentOrder) !== 'not_submitted') : buttonStep > state.maxStep);
    });
    if (window.matchMedia('(max-width: 760px)').matches) {
      document.querySelector(`.wizard-step[data-step="${target}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
    if (target === 3 && state.slots.length === 0) loadAvailability();
    if (target === 5) loadUserOrders();
    window.dispatchEvent(new CustomEvent('paichong:user-step', { detail: { step: target } }));
    updateSummary();
    const mainTop = byId('user-view').getBoundingClientRect().top + window.scrollY;
    if (window.scrollY > mainTop + 120) byId('user-view').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function unlockStep(step) {
    state.maxStep = Math.max(state.maxStep, Number(step));
    showStep(step, { force: true });
  }

  function switchRole(role) {
    if (!authSession || role !== authSession.role) return;
    state.role = role;
    const userView = byId('user-view');
    const opsView = byId('ops-view');
    userView.hidden = role !== 'user';
    opsView.hidden = role !== 'ops';
    userView.classList.toggle('is-active', role === 'user');
    opsView.classList.toggle('is-active', role === 'ops');
    if (role === 'ops') renderOpsSession();
    else if (state.currentOrder) loadUserOrders();
  }

  function setUpload(key, filename) {
    state.materials[key] = filename;
    const box = document.querySelector(`[data-upload="${key}"]`);
    const result = byId(`${key}-result`);
    if (box) box.classList.toggle('has-file', Boolean(filename));
    if (result) result.textContent = filename || '尚未添加';
  }

  async function handleQuoteSubmit(event) {
    event.preventDefault();
    setMessage('quote-error');
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const input = quoteInput();
    if (input.fromCity === input.toCity) {
      setMessage('quote-error', '起运城市与目的城市不能相同，请选择跨省路线。');
      byId('to-city').focus();
      return;
    }
    const button = form.querySelector('[type="submit"]');
    const revision = state.draftRevision;
    setBusy(button, true, '正在计算…');
    try {
      const payload = await api('/api/user/quote', { method: 'POST', body: input });
      if (revision !== state.draftRevision) return;
      state.quote = payload.quote || payload;
      updateSummary();
      toast(`已生成 ${input.fromCity} → ${input.toCity} 的虚拟预估方案`);
      unlockStep(2);
    } catch (error) {
      setMessage('quote-error', error.message);
    } finally { setBusy(button, false); }
  }

  function handleMaterialsSubmit(event) {
    event.preventDefault();
    setMessage('materials-error');
    if (!state.quote) { invalidateDraft(); return; }
    if (!event.currentTarget.reportValidity()) return;
    const declarations = all('input[name="healthDeclaration"]:checked').map((input) => input.value);
    if (!state.materials.petPhoto || !state.materials.vaccineProof) {
      setMessage('materials-error', '请添加宠物近期全身照和疫苗记录；评审时可直接点击“使用示例”。');
      return;
    }
    if (declarations.length < 3) {
      setMessage('materials-error', '请确认全部三项健康与行为声明。');
      return;
    }
    state.healthDeclaration = declarations;
    unlockStep(3);
  }

  async function loadAvailability() {
    const container = byId('availability-list');
    container.innerHTML = '<div class="loading-state"><span class="loader" aria-hidden="true"></span>正在获取可预约时段…</div>';
    setMessage('slot-error');
    const city = state.quote?.fromCity || formValue('from-city');
    const date = formValue('travel-date');
    const revision = state.draftRevision;
    byId('create-order').disabled = true;
    try {
      const payload = await api(`/api/user/availability?city=${encodeURIComponent(city)}&date=${encodeURIComponent(date)}`);
      if (revision !== state.draftRevision || date !== formValue('travel-date')) return;
      applyBookingMeta(payload);
      state.slots = Array.isArray(payload) ? payload : (payload.items || []);
      if (!state.slots.some((slot) => slot.available !== false && Number(slot.remaining) > 0)) {
        state.selectedSlotId = '';
        const nextDate = (payload.availableDates || []).find((item) => item > date) || (payload.nextAvailableDate !== date ? payload.nextAvailableDate : '');
        container.innerHTML = `<div class="empty-state"><span class="empty-icon" aria-hidden="true">${icon('calendar-check')}</span><h3>当天暂无可预约时段</h3><p>${nextDate ? `可改为 ${escapeHtml(formatDate(nextDate))}，将同步更新本次预估方案。` : '暂时没有可用时段，请返回调整出发日或稍后重试。'}</p>${nextDate ? `<button class="primary-button" id="next-available-date" type="button">${icon('calendar-check')}<span>改为下个可约日</span></button>` : ''}</div>`;
        byId('next-available-date')?.addEventListener('click', async (event) => {
          const button = event.currentTarget;
          setBusy(button, true, '更新方案中…');
          byId('travel-date').value = nextDate;
          state.clientRequestId = ''; state.selectedSlotId = ''; state.slots = []; state.quote = null; state.draftRevision += 1;
          try {
            const fresh = await api('/api/user/quote', { method: 'POST', body: quoteInput() });
            state.quote = fresh.quote || fresh;
            updateSummary();
            await loadAvailability();
          } catch (error) { invalidateDraft(); setMessage('quote-error', error.message); }
          finally { setBusy(button, false); }
        });
        updateSummary();
        return;
      }
      if (!state.slots.some((item) => item.id === state.selectedSlotId && item.available !== false && Number(item.remaining) > 0)) state.selectedSlotId = '';
      renderAvailability();
    } catch (error) {
      container.innerHTML = `<div class="empty-state"><span class="empty-icon is-error" aria-hidden="true">${icon('alert')}</span><h3>时段加载失败</h3><p>${escapeHtml(error.message)}</p><button class="outline-button" id="retry-availability" type="button">${icon('refresh')}<span>重新获取</span></button></div>`;
      byId('retry-availability')?.addEventListener('click', loadAvailability);
    }
  }

  function renderAvailability() {
    const container = byId('availability-list');
    byId('create-order').disabled = !state.selectedSlotId || state.creatingOrder;
    container.innerHTML = state.slots.map((slot) => {
      const date = String(slot.date || formValue('travel-date'));
      const day = date.slice(-2).replace(/^0/, '');
      const available = slot.available !== false && Number(slot.remaining) > 0;
      const selected = state.selectedSlotId === slot.id;
      const low = Number(slot.remaining) <= 2;
      return `<button class="slot-card${selected ? ' is-selected' : ''}${low ? ' is-low' : ''}" type="button" data-slot-id="${escapeHtml(slot.id)}" ${available ? '' : 'disabled'} aria-pressed="${selected}">
        <span class="slot-date"><b>${escapeHtml(day)}</b>${escapeHtml(formatDate(date, { month: 'short', weekday: 'short' }))}</span>
        <span class="slot-detail"><strong>${escapeHtml(slot.timeSlot || slot.label || '白天时段')}</strong><small>${available ? '接宠司机与笼位可协调' : '本时段已约满'}</small></span>
        <span class="slot-capacity">${available ? `余 ${Number(slot.remaining)} 个名额` : '已约满'}</span>
      </button>`;
    }).join('');
    all('[data-slot-id]', container).forEach((button) => button.addEventListener('click', () => {
      if (state.selectedSlotId !== button.dataset.slotId) state.clientRequestId = '';
      state.selectedSlotId = button.dataset.slotId;
      renderAvailability();
      updateSummary();
    }));
  }

  function createOrderBody() {
    return {
      phone: currentUserAccount(),
      contactName: formValue('contact-name'), contactPhone: formValue('contact-phone'), pickupAddress: formValue('pickup-address'),
      recipientName: formValue('recipient-name'), recipientPhone: formValue('recipient-phone'), recipientAddress: formValue('recipient-address'),
      clientRequestId: state.clientRequestId,
      serviceType: formValue('service-type'),
      pet: {
        name: formValue('pet-name'),
        type: formValue('pet-type'),
        breed: formValue('pet-breed'),
        weight: Number(formValue('pet-weight'))
      },
      fromCity: state.quote?.fromCity || formValue('from-city'),
      toCity: state.quote?.toCity || formValue('to-city'),
      quote: state.quote,
      materials: {
        vaccineCertificate: state.materials.vaccineProof,
        petPhoto: state.materials.petPhoto
      },
      pickup: { slotId: state.selectedSlotId },
      healthDeclaration: state.healthDeclaration,
      careNote: formValue('care-note')
    };
  }

  async function createOrder() {
    setMessage('slot-error');
    if (state.creatingOrder) return;
    if (!state.quote || !state.selectedSlotId || !state.slots.some((slot) => slot.id === state.selectedSlotId && slot.available !== false && Number(slot.remaining) > 0)) {
      setMessage('slot-error', '请选择一个有余量的接宠时段。');
      return;
    }
    const button = byId('create-order');
    state.creatingOrder = true;
    state.clientRequestId ||= `web-${crypto.randomUUID()}`;
    setBusy(button, true, '正在生成订单…');
    try {
      const payload = await api('/api/user/orders', { method: 'POST', body: createOrderBody() });
      state.currentOrder = payload.order || payload;
      state.userOrders = [state.currentOrder, ...state.userOrders.filter((item) => item.id !== state.currentOrder.id)];
      renderUserOrderSelector();
      persistState();
      fillDepositPanel();
      toast(`订单 ${state.currentOrder.id} 已生成，等待模拟支付`);
      unlockStep(4);
    } catch (error) {
      setMessage('slot-error', error.message);
      if (/时段|容量|预约/.test(error.message)) loadAvailability();
    } finally { state.creatingOrder = false; setBusy(button, false); byId('create-order').disabled = !state.selectedSlotId || Boolean(state.currentOrder); }
  }

  function fillDepositPanel() {
    const order = state.currentOrder || {};
    const quote = order.quote || state.quote || {};
    const estimate = Number(order.priceEstimate ?? quote.basePrice ?? quote.totalMin ?? quoteTotal());
    const deposit = Number(order.depositAmount ?? order.deposit?.amount ?? quote.depositAmount ?? Math.round(estimate * 0.2));
    const rate = Number(quote.depositRate ?? order.depositRate ?? 0.2);
    byId('deposit-amount').textContent = Number.isFinite(deposit) ? deposit.toLocaleString('zh-CN') : '—';
    byId('deposit-rate').textContent = `${Math.round(rate * 100)}%`;
    byId('deposit-estimate').textContent = formatMoney(estimate);
    byId('deposit-line').textContent = formatMoney(deposit);
    byId('deposit-balance').textContent = formatMoney(Math.max(0, estimate - deposit));
  }

  async function payDeposit() {
    setMessage('deposit-error');
    if (!state.currentOrder?.id) {
      setMessage('deposit-error', '当前没有待支付订单，请返回重新生成。');
      return;
    }
    if (!byId('deposit-agreement').checked) {
      setMessage('deposit-error', '请先阅读并同意虚拟演示规则。');
      byId('deposit-agreement').focus();
      return;
    }
    const button = byId('pay-deposit');
    setBusy(button, true, '模拟支付中…');
    try {
      const payload = await api(`/api/user/orders/${encodeURIComponent(state.currentOrder.id)}/deposit/pay`, { method: 'POST', body: {} });
      state.currentOrder = payload.order || payload;
      persistState();
      toast('模拟支付成功，订单已进入运营审核');
      state.maxStep = 5;
      showStep(5, { force: true });
    } catch (error) { setMessage('deposit-error', error.message); }
    finally { setBusy(button, false); }
  }

  function reviewStatus(order) {
    if (order.reviewStatus) return order.reviewStatus;
    const map = {
      '待支付保证金': 'not_submitted', '待审核': 'pending', '待补材料': 'info_required', '待补件': 'info_required',
      '已补件待复审': 'resubmitted', '待用户确认': 'approved', '已驳回': 'rejected', '待拼单': 'confirmed', '已取消': 'cancelled'
    };
    return map[order.status] || 'pending';
  }

  function statusMeta(order) {
    const fulfillmentMeta = window.PaichongFulfillment?.meta(order);
    if (fulfillmentMeta) return fulfillmentMeta;
    const current = reviewStatus(order);
    if (current === 'confirmed') {
      const transportStatuses = {
        '已编入干线': ['已编入线路', '运营正在核对发车条件及司机、车辆安排', 'green'],
        '待接宠': ['已安排接宠', '已完成模拟派车，等待合作点记录到点交接', 'orange'],
        '已到交接点': ['已到合作点', '合作点已记录到点，等待运营安排干线', 'green'],
        '节点待发车': ['合作点等待交接', '宠物已模拟到点并编入线路，等待离点交给干线司机', 'green'],
        '运输中': ['等待司机补齐履约记录', '本单保留历史离点记录，请司机完成验宠、费用确认与出发登记。', 'orange'],
        '已到合作点': ['已到合作点', '合作点已记录到点，等待干线离点交接', 'green'],
        '干线运输中': ['等待司机补齐履约记录', '本单保留历史离点记录，请司机完成验宠与费用确认。', 'orange']
      };
      if (transportStatuses[order.status]) return transportStatuses[order.status];
    }
    const map = {
      not_submitted: ['待支付保证金', '完成模拟支付后将启动运营审核', 'orange'],
      pending: ['运营审核中', '运营正在核验材料、时段与线路能力', 'orange'],
      info_required: ['需要补充材料', '请根据运营说明补件后重新提交', 'orange'],
      resubmitted: ['补件已提交', '运营会重新审核本次补充材料', 'orange'],
      approved: ['方案待你确认', '交接点与预估方案已由运营确认', 'green'],
      rejected: ['暂无法承运', '请查看运营说明及下方模拟退款进度', 'red'],
      cancelled: ['订单已取消', '预约已释放，退款状态将在下方同步显示', 'red'],
      confirmed: ['方案已确认', '订单已进入后续拼线与履约准备', 'green']
    };
    return map[current] || [order.status || '状态更新中', '请稍后刷新查看', 'orange'];
  }

  function statusIconName(current) {
    return ({
      not_submitted: 'credit-card', pending: 'clipboard-check', info_required: 'camera',
      resubmitted: 'upload', approved: 'check-circle', rejected: 'x-circle', cancelled: 'x-circle', confirmed: 'route'
    })[current] || 'info';
  }

  function getOrderPet(order) {
    return order.pet || { name: order.petName || '宠物', type: order.petType || '', breed: order.breed || '', weight: order.weight || '' };
  }

  function userDepositStatus(order) {
    const raw = String(order.deposit?.status || order.depositStatus || '待支付');
    const labels = { paid: '已支付', pending: '待支付', unpaid: '待支付', refunding: '退款处理中', refunded: '已退款', refund_failed: '退款失败，待运营重试' };
    const label = labels[raw] || (raw === '退款中' ? '退款处理中' : raw);
    return `${label}（模拟）`;
  }

  function healthDeclarationItems(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.entries(value).filter(([, checked]) => Boolean(checked)).map(([key]) => key);
    return [];
  }

  function proposedPrice(order) { return Number(order.proposedPrice ?? order.finalPrice ?? order.quote?.basePrice ?? order.priceEstimate ?? 0); }
  function depositAmount(order) { return Number(order.deposit?.amount ?? order.depositAmount ?? order.quote?.depositAmount ?? 0); }
  function depositWasPaid(order) {
    return Boolean(order.deposit?.paidAt || ['paid', 'refunding', 'refunded', 'refund_failed'].includes(order.deposit?.status) || ['已支付', '已支付（模拟）', '退款中', '已退款'].includes(order.depositStatus));
  }
  function pricingMarkup(order) {
    if (order.fulfillment) return `<p class="price-explanation">初始预估 ${formatMoney(order.quote?.basePrice ?? order.priceEstimate)} · 运营建议价 ${formatMoney(proposedPrice(order))}。本次应付以“验宠与费用确认”中的锁定总价为准，保证金只抵扣一次。</p>`;
    const paid = depositWasPaid(order) ? depositAmount(order) : 0;
    const closed = ['cancelled', 'rejected'].includes(reviewStatus(order));
    const refunded = order.refund?.status === 'succeeded' || order.deposit?.status === 'refunded';
    const refundLine = closed && paid > 0
      ? `<div><dt>${refunded ? '已退还保证金（模拟）' : '待退还保证金（模拟）'}</dt><dd>${formatMoney(order.refund?.amount ?? paid)}${!refunded && order.refund?.status === 'failed' ? ' · 待运营重试' : ''}</dd></div>`
      : '';
    const explanation = closed
      ? `本单已关闭，无需再支付，不会产生后续尾款。原始估价和运营建议价仅保留供核对。${paid > 0 ? (refunded ? '累计已付保证金已全部模拟退还。' : '已付保证金的模拟退款进度见下方。') : '本单未支付保证金。'}`
      : '运营建议价用于确认运输方案；预计剩余费用并非最终尾款，最终费用由司机验宠后锁定。';
    return `<dl class="cost-breakdown price-review"><div><dt>原始预估基础价</dt><dd>${formatMoney(order.quote?.basePrice ?? order.priceEstimate)}</dd></div><div><dt>运营建议价</dt><dd>${order.proposedPrice != null || order.finalPrice != null ? formatMoney(proposedPrice(order)) : (closed ? '未出具' : '待审核')}</dd></div><div><dt>${closed ? '累计已付保证金（模拟）' : '已付保证金（模拟）'}</dt><dd>${formatMoney(paid)}</dd></div>${refundLine}<div><dt>预计剩余费用</dt><dd>${closed ? '无需再支付' : formatMoney(Math.max(0, proposedPrice(order) - paid))}</dd></div></dl><p class="price-explanation">${explanation}</p>`;
  }
  function contactsMarkup(order) {
    return `<section class="material-section"><h3>接送与照护信息</h3><div class="contact-summary"><div><small>接宠联系人</small><strong>${escapeHtml(order.contactName || '未提供')} · ${escapeHtml(order.contactPhone || order.userPhone || order.phone || '未提供')}</strong><p>${escapeHtml(order.pickupAddress || '详细地址未提供')}</p></div><div><small>送达联系人</small><strong>${escapeHtml(order.recipientName || '未提供')} · ${escapeHtml(order.recipientPhone || '未提供')}</strong><p>${escapeHtml(order.recipientAddress || '详细地址未提供')}</p></div><div class="full-width"><small>特殊照护说明</small><p>${escapeHtml(order.careNote || '未填写特殊照护说明')}</p></div></div></section>`;
  }
  function journeyMarkup(order) {
    const reservation = order.nodeReservation;
    const transport = order.transport;
    if (!reservation && !transport && !order.routeId) return '';
    const labels = { reserved: '已预留，待用户确认', confirmed: '预约已确认', arrived: '已到点', departed: '已离点，笼位已释放', released: '预约已释放' };
    return `<section class="journey-panel" aria-label="节点与派车进度"><h3>${icon('truck')}节点与派车进度 <small>虚拟联调</small></h3>
      ${reservation ? `<div class="journey-node"><strong>${escapeHtml(order.assignedNode?.name || '合作交接点')}</strong><p>${escapeHtml(reservation.date || '')} ${escapeHtml(reservation.timeSlot || ({ AM: '上午', PM: '下午' }[reservation.period]) || '')} · ${escapeHtml(labels[reservation.status] || reservation.status || '待确认')}</p>${reservation.checkedInAt ? `<small>到点登记：${escapeHtml(formatDateTime(reservation.checkedInAt))}</small>` : ''}${reservation.checkedOutAt ? `<small>离点交接：${escapeHtml(formatDateTime(reservation.checkedOutAt))}</small>` : ''}</div>` : ''}
      ${transport || order.routeId ? `<dl class="journey-details"><div><dt>所属线路</dt><dd>${escapeHtml(transport?.routeName || order.routeId)}</dd></div><div><dt>计划发车</dt><dd>${transport?.departureAt ? escapeHtml(formatDateTime(transport.departureAt)) : '待运营安排'}</dd></div><div><dt>计划到达</dt><dd>${transport?.arrivalAt ? escapeHtml(formatDateTime(transport.arrivalAt)) : '待运营安排'}</dd></div><div><dt>司机 / 车辆</dt><dd>${escapeHtml(transport?.driverName || '待分配')} · ${escapeHtml(transport?.vehiclePlate || '待分配')}</dd></div></dl>` : '<p>下一步：运营将按线路余量安排拼线。</p>'}
      <p class="journey-footnote">离点交接不等于运输完成。司机验宠、费用确认与签收分别留痕，所有节点均为模拟记录。</p></section>`;
  }
  function refundMarkup(order, ops = false) {
    const refund = order.refund;
    if (!refund) return ['cancelled', 'rejected'].includes(reviewStatus(order)) ? `<div class="refund-message">${icon('info')}<div><strong>本单无需退款</strong><br>未收取保证金，不产生模拟资金变动。</div></div>` : '';
    const labels = { pending: ['模拟退款处理中', '由运营处理退款后，用户端会同步结果。'], succeeded: ['模拟退款已完成', '保证金已模拟退回，预约容量已释放。'], failed: ['模拟退款失败', '运营可重试退款，用户无需再次支付。'] };
    const [title, detail] = labels[refund.status] || ['退款状态更新中', '请刷新查看最新结果。'];
    const canProcess = ops && ['pending', 'failed'].includes(refund.status);
    return `<div class="refund-message" data-refund-status="${escapeHtml(refund.status)}">${icon(refund.status === 'succeeded' ? 'check-circle' : 'refresh')}<div><strong>${title} · ${formatMoney(refund.amount)}</strong><br>${detail}${refund.completedAt ? `<br>${escapeHtml(formatDateTime(refund.completedAt))}` : ''}</div></div>${canProcess ? `<div class="refund-actions"><button class="primary-button" id="refund-success" type="button">${icon('check-circle')}<span>${refund.status === 'failed' ? '重试并模拟退款成功' : '模拟退款成功'}</span></button><button class="outline-button" id="refund-failed" type="button">${icon('alert')}<span>模拟退款失败</span></button><div class="form-message" id="refund-error" role="alert" hidden></div></div>` : ''}`;
  }

  function renderUserOrderSelector() {
    const select = byId('user-order-select');
    select.innerHTML = `<option value="">${state.userOrders.length ? '选择一笔已有订单' : '暂无订单，先新建一单'}</option>${state.userOrders.map((order) => `<option value="${escapeHtml(order.id)}">${escapeHtml(order.id)} · ${escapeHtml(getOrderPet(order).name)} · ${escapeHtml(statusMeta(order)[0])}</option>`).join('')}`;
    select.value = state.currentOrder?.id || '';
  }

  function selectUserOrder(id) {
    state.currentOrder = state.userOrders.find((order) => order.id === id) || null;
    state.materials.standingPhoto = '';
    state.quote = null; state.slots = []; state.selectedSlotId = ''; state.clientRequestId = ''; state.maxStep = 1;
    state.draftRevision += 1;
    persistState(); renderUserOrderSelector();
    showStep(5, { force: true });
  }

  function orderTimeline(order) {
    const current = reviewStatus(order);
    if (['cancelled', 'rejected'].includes(current)) return `<li class="is-done"><span aria-hidden="true"></span><div>${current === 'cancelled' ? '订单已取消' : '运营拒绝承运'} · 预约已释放</div></li>`;
    const stages = [
      ['保证金已支付', depositWasPaid(order)],
      ['运营审核通过', ['approved', 'confirmed'].includes(current)],
      [current === 'info_required' || current === 'resubmitted' ? '补充材料' : '方案与节点确认', ['approved', 'confirmed'].includes(current)],
      ['用户确认方案', current === 'confirmed'],
      ['订单编入线路', Boolean(order.routeId)],
      ['合作点到点登记', ['arrived', 'departed'].includes(order.nodeReservation?.status)],
      ['司机验宠确认总价', Boolean(order.fulfillment?.inspection)],
      ['用户确认费用与模拟尾款', order.fulfillment?.invoice?.status === 'paid'],
      ['离点交给干线司机', order.nodeReservation?.status === 'departed'],
      ['司机确认模拟出发', Boolean(order.fulfillment?.departedAt)],
      ['目的城市模拟签收', order.fulfillment?.stage === 'delivered']
    ];
    let firstPendingMarked = false;
    return stages.map(([label, done]) => {
      const active = !done && !firstPendingMarked && current !== 'rejected';
      if (active) firstPendingMarked = true;
      return `<li class="${done ? 'is-done' : ''} ${active ? 'is-current' : ''}"><span aria-hidden="true"></span><div>${escapeHtml(label)}</div></li>`;
    }).join('');
  }

  function renderUserOrder(order) {
    const container = byId('user-order-area');
    if (!order) {
      container.innerHTML = `<div class="empty-state"><img class="status-illustration" src="./assets/v5/illustrations/empty-orders.png" width="1536" height="1024" alt="" /><h3>还没有出行计划</h3><p>完成预约后，这里会显示运营审核结果。</p><button class="primary-button" type="button" data-jump-step="1">${icon('route')}<span>从询价开始</span></button></div>`;
      container.querySelector('[data-jump-step]')?.addEventListener('click', () => showStep(1, { force: true }));
      return;
    }
    const [label, description, tone] = statusMeta(order);
    const pet = getOrderPet(order);
    const node = order.assignedNode;
    const reviewNote = order.reviewNote || order.note || order.reviewReason || '';
    const current = reviewStatus(order);
    const statusIcon = statusIconName(current);
    const stateIllustration = { pending: 'review-pending', resubmitted: 'request-received' }[current];
    const stateArtwork = stateIllustration ? `<img class="status-illustration" src="./assets/v5/illustrations/${stateIllustration}.png" width="1536" height="1024" alt="" />` : '';
    const supplement = current === 'info_required' ? `<form class="supplement-form" id="supplement-form">
      <strong>补充宠物站立全身照</strong><small>运营要求：${escapeHtml(reviewNote || '请补充一张近期、光线清晰的站立全身照。')}</small>
      <input class="sr-file" id="standing-photo" type="file" accept="image/*" />
      <div class="upload-actions"><label class="outline-button" for="standing-photo">${icon('upload')}<span>选择文件</span></label><button class="text-button" id="sample-standing-photo" type="button">${icon('sparkles')}<span>使用示例</span></button></div>
      <span class="file-result" id="standing-file-result">${state.materials.standingPhoto ? escapeHtml(state.materials.standingPhoto) : '尚未添加'}</span>
      <label class="field-label" for="supplement-note">补充说明<textarea id="supplement-note" rows="2" maxlength="120" placeholder="可说明照片拍摄时间或其他情况"></textarea></label>
      <button class="primary-button" type="submit">${icon('upload')}<span>提交补充材料</span></button>
      <div class="form-message" id="supplement-error" role="alert" hidden></div>
    </form>` : '';
    const confirm = current === 'approved' ? `<button class="primary-button" id="confirm-plan" type="button">${icon('check-circle')}<span>确认 ${formatMoney(proposedPrice(order))} 建议方案</span></button>` : '';
    const canReschedule = !order.routeId && ['not_submitted', 'pending', 'info_required', 'resubmitted'].includes(current);
    const canCancel = !order.routeId && !['arrived', 'departed'].includes(order.nodeReservation?.status) && !['cancelled', 'rejected'].includes(current) && !['已完成', '已签收', '已取消', '已驳回'].includes(order.status);
    container.innerHTML = `<article class="order-detail-card">
      <div class="status-hero" data-tone="${escapeHtml(tone)}">${stateArtwork}<div><span class="order-number">订单 ${escapeHtml(order.id)}</span><h3>${escapeHtml(label)}</h3><p>${escapeHtml(description)}</p></div><span class="status-badge" data-tone="${escapeHtml(tone)}">${icon(statusIcon)}<span>${escapeHtml(order.status || label)}</span></span></div>
      <div class="order-route-line"><span><small>起运</small><br><strong>${escapeHtml(order.fromCity)}</strong></span><i aria-hidden="true">${icon('arrow-right')}</i><span><small>送达</small><br><strong>${escapeHtml(order.toCity)}</strong></span></div>
      <dl class="cost-breakdown"><div><dt>宠物</dt><dd>${escapeHtml(pet.name)} · ${escapeHtml(pet.type)} · ${escapeHtml(pet.weight)}kg</dd></div><div><dt>预订保证金</dt><dd>${formatMoney(depositAmount(order))}</dd></div><div><dt>保证金状态</dt><dd>${escapeHtml(userDepositStatus(order))}</dd></div><div><dt>预约时段</dt><dd>${escapeHtml(order.pickup?.date || '')} ${escapeHtml(order.pickup?.timeSlot || order.pickupTime || '')}</dd></div></dl>
      ${window.PaichongFulfillment?.markup(order, 'user') || ''}${journeyMarkup(order)}${pricingMarkup(order)}${contactsMarkup(order)}
      ${node ? `<div class="node-result">${icon('map-pin')}<div><strong>已分配合作交接点</strong><br>${escapeHtml(node.city)} · ${escapeHtml(node.name)} · 营业 ${escapeHtml(node.open || '以预约为准')}</div></div>` : ''}
      ${reviewNote && current !== 'info_required' ? `<div class="review-message">${icon('clipboard-check')}<div><strong>运营说明</strong><br>${escapeHtml(reviewNote)}</div></div>` : ''}
      ${refundMarkup(order)}
      <ol class="timeline-list">${orderTimeline(order)}</ol>
      ${supplement}<div class="order-followup-actions">${confirm}${current === 'not_submitted' ? `<button class="pay-button" id="resume-payment" type="button">${icon('credit-card')}<span>继续支付保证金</span></button>` : ''}${canReschedule ? `<button class="outline-button" id="reschedule-order" type="button">${icon('calendar-check')}<span>申请改期</span></button>` : ''}${canCancel ? `<button class="danger-button" id="cancel-order" type="button">${icon('x-circle')}<span>取消订单</span></button>` : ''}</div>
      <div id="reschedule-panel" class="reschedule-panel" hidden></div>
      <div class="form-message" id="order-action-error" role="alert" hidden></div>
    </article>`;
    bindUserOrderActions(order);
    window.PaichongFulfillment?.bind(container, order, { api, toast, reload: loadUserOrders });
  }

  function bindUserOrderActions(order) {
    byId('resume-payment')?.addEventListener('click', () => {
      state.currentOrder = order;
      byId('deposit-agreement').checked = false;
      setMessage('deposit-error');
      fillDepositPanel();
      showStep(4, { force: true });
    });
    byId('cancel-order')?.addEventListener('click', (event) => {
      const button = event.currentTarget;
      openDialog('确认取消这笔订单？', `${order.id} 的预约将释放。${depositWasPaid(order) ? '已付保证金将进入模拟退款，由运营处理结果。' : '本单尚未支付保证金，无需退款。'}`, async () => {
        const reason = formValue('dialog-reason') || '用户取消出行计划';
        setBusy(button, true, '取消中…');
        try {
          const payload = await api(`/api/user/orders/${encodeURIComponent(order.id)}/cancel`, { method: 'POST', body: { reason } });
          state.currentOrder = payload.order || payload;
          toast('订单已取消，预约已释放');
          await loadUserOrders();
        } catch (error) { setMessage('order-action-error', error.message); }
        finally { setBusy(button, false); }
      }, { danger: true, iconName: 'x-circle', confirmLabel: '确认取消订单', reason: true });
    });
    byId('reschedule-order')?.addEventListener('click', () => openReschedule(order));
    const sample = byId('sample-standing-photo');
    if (sample) sample.addEventListener('click', () => {
      state.materials.standingPhoto = '豆包-补充站立全身照.jpg';
      byId('standing-file-result').textContent = state.materials.standingPhoto;
    });
    byId('standing-photo')?.addEventListener('change', (event) => {
      state.materials.standingPhoto = event.target.files?.[0]?.name || '';
      byId('standing-file-result').textContent = state.materials.standingPhoto || '尚未添加';
    });
    byId('supplement-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      setMessage('supplement-error');
      if (!state.materials.standingPhoto) {
        setMessage('supplement-error', '请添加补充照片；评审时可点击“使用示例”。');
        return;
      }
      const button = event.currentTarget.querySelector('[type="submit"]');
      setBusy(button, true, '提交中…');
      try {
        const payload = await api(`/api/user/orders/${encodeURIComponent(order.id)}/supplement`, {
          method: 'POST',
          body: { materials: { standingPhoto: state.materials.standingPhoto }, note: formValue('supplement-note') || '已按要求补充近期站立全身照。' }
        });
        state.currentOrder = payload.order || payload;
        toast('补充材料已提交，等待运营复审');
        await loadUserOrders();
      } catch (error) { setMessage('supplement-error', error.message); }
      finally { setBusy(button, false); }
    });
    byId('confirm-plan')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      setBusy(button, true, '确认中…');
      try {
        const payload = await api(`/api/user/orders/${encodeURIComponent(order.id)}/confirm`, { method: 'POST', body: { acceptedPrice: proposedPrice(order) } });
        state.currentOrder = payload.order || payload;
        toast('方案已确认，订单进入拼线准备');
        await loadUserOrders();
      } catch (error) { toast(error.message); }
      finally { setBusy(button, false); }
    });
  }

  async function openReschedule(order) {
    const panel = byId('reschedule-panel');
    panel.hidden = false;
    panel.innerHTML = '<div class="loading-state"><span class="loader" aria-hidden="true"></span>正在查询可改期时段…</div>';
    try {
      const payload = await api(`/api/user/availability?city=${encodeURIComponent(order.fromCity)}`);
      if (state.currentOrder?.id !== order.id) return;
      const items = (payload.items || []).filter((slot) => slot.id !== order.pickup?.slotId && slot.available !== false && Number(slot.remaining) > 0);
      panel.innerHTML = `<h3>选择新的接宠时段</h3><p class="panel-intro">仅修改接宠时段，路线与宠物资料保持本单信息。余量以提交时为准。</p>${items.length ? `<label class="field-label" for="reschedule-slot">可用时段<select id="reschedule-slot"><option value="">请选择</option>${items.map((slot) => `<option value="${escapeHtml(slot.id)}">${escapeHtml(formatDate(slot.date))} ${escapeHtml(slot.timeSlot)} · 余 ${Number(slot.remaining)}</option>`).join('')}</select></label><button class="primary-button" id="submit-reschedule" type="button" disabled>${icon('calendar-check')}<span>确认改期</span></button>` : '<p>当前城市暂无其他可预约时段，请稍后再试。</p>'}<div class="form-message" id="reschedule-error" role="alert" hidden></div>`;
      byId('reschedule-slot')?.addEventListener('change', () => { byId('submit-reschedule').disabled = !formValue('reschedule-slot'); });
      byId('submit-reschedule')?.addEventListener('click', (event) => {
        const button = event.currentTarget;
        const slotId = formValue('reschedule-slot');
        const slot = items.find((item) => item.id === slotId);
        if (!slot) return;
        openDialog('确认新的接宠时段？', `${formatDate(slot.date)} ${slot.timeSlot}。原预约释放，新时段预约成功后会同步给运营。`, async () => {
          setBusy(button, true, '改期中…');
          try {
            const result = await api(`/api/user/orders/${encodeURIComponent(order.id)}/reschedule`, { method: 'POST', body: { slotId } });
            state.currentOrder = result.order || result;
            toast('改期成功，运营端已同步');
            await loadUserOrders();
          } catch (error) { setMessage('reschedule-error', error.message); }
          finally { setBusy(button, false); }
        }, { iconName: 'calendar-check', confirmLabel: '确认改期' });
      });
    } catch (error) { panel.innerHTML = `<p class="form-message">${escapeHtml(error.message)}</p>`; }
  }

  async function loadUserOrders() {
    const container = byId('user-order-area');
    const revision = state.draftRevision;
    if (state.step === 5) container.innerHTML = '<div class="loading-state"><span class="loader" aria-hidden="true"></span>正在同步最新状态…</div>';
    try {
      const payload = await api('/api/user/orders');
      state.userOrders = Array.isArray(payload) ? payload : (payload.items || []);
      if (revision !== state.draftRevision) { renderUserOrderSelector(); return; }
      const saved = readSavedState();
      const savedId = state.currentOrder?.id || (saved.phone === currentUserAccount() ? saved.orderId : '');
      state.currentOrder = state.userOrders.find((order) => order.id === savedId) || (state.step === 5 ? state.userOrders[0] : null) || null;
      if (!state.currentOrder && savedId) {
        state.quote = null; state.slots = []; state.selectedSlotId = ''; state.clientRequestId = ''; state.maxStep = 1;
        toast('上次选择的订单已不存在，已清除旧记录');
      }
      persistState();
      renderUserOrderSelector();
      updateSummary();
      if (state.step === 5) renderUserOrder(state.currentOrder);
    } catch (error) {
      if (state.step === 5) container.innerHTML = `<div class="empty-state"><span class="empty-icon is-error" aria-hidden="true">${icon('alert')}</span><h3>状态同步失败</h3><p>${escapeHtml(error.message)}</p><button class="outline-button" id="retry-user-orders" type="button">${icon('refresh')}<span>重新加载</span></button></div>`;
      byId('retry-user-orders')?.addEventListener('click', loadUserOrders);
    }
  }

  function renderOpsSession() {
    if (authSession?.role !== 'ops') return;
    byId('ops-workbench').hidden = false;
    byId('ops-session').hidden = true;
    byId('ops-name').textContent = authSession.name || '运营演示账号';
    loadOpsOrders();
  }

  function opsHeaders() { return authSession?.token ? { Authorization: `Bearer ${authSession.token}` } : {}; }

  async function loadOpsOrders() {
    const list = byId('ops-order-list');
    list.innerHTML = '<div class="loading-state"><span class="loader" aria-hidden="true"></span>正在加载订单…</div>';
    try {
      const [ordersPayload, nodesPayload] = await Promise.all([
        api('/api/ops/orders', { headers: opsHeaders() }),
        api('/api/ops/city-nodes', { headers: opsHeaders() }).catch(() => ({ items: [] }))
      ]);
      state.opsOrders = Array.isArray(ordersPayload) ? ordersPayload : (ordersPayload.items || []);
      state.opsNodes = Array.isArray(nodesPayload) ? nodesPayload : (nodesPayload.items || []);
      if (!state.opsOrders.some((order) => order.id === state.selectedOpsOrderId)) state.selectedOpsOrderId = '';
      renderOpsMetrics();
      renderOpsOrderList();
      renderOpsOrderDetail();
    } catch (error) {
      if (error.status === 401) return;
      list.innerHTML = `<div class="empty-state"><span class="empty-icon is-error" aria-hidden="true">${icon('alert')}</span><h3>订单加载失败</h3><p>${escapeHtml(error.message)}</p><button class="outline-button" id="retry-ops-orders" type="button">${icon('refresh')}<span>重新加载</span></button></div>`;
      byId('retry-ops-orders')?.addEventListener('click', loadOpsOrders);
    }
  }

  function renderOpsMetrics() {
    const count = (statuses) => state.opsOrders.filter((order) => statuses.includes(reviewStatus(order))).length;
    byId('metric-review').textContent = count(['pending', 'resubmitted']);
    byId('metric-supplement').textContent = count(['info_required']);
    byId('metric-approved').textContent = count(['approved', 'confirmed']);
    byId('ops-order-count').textContent = `${state.opsOrders.length} 单`;
  }

  function filterOrder(order) {
    if (state.opsFilter === 'all') return true;
    if (state.opsFilter === '待审核') return ['pending', 'resubmitted'].includes(reviewStatus(order));
    if (state.opsFilter === '待补件') return reviewStatus(order) === 'info_required';
    if (state.opsFilter === '审核通过') return ['approved', 'confirmed'].includes(reviewStatus(order));
    if (state.opsFilter === 'cancelled') return reviewStatus(order) === 'cancelled';
    if (state.opsFilter === 'rejected') return reviewStatus(order) === 'rejected';
    if (state.opsFilter === 'refund') return Boolean(order.refund);
    return order.status === state.opsFilter;
  }

  function renderOpsOrderList() {
    const list = byId('ops-order-list');
    const orders = state.opsOrders.filter(filterOrder);
    if (!orders.length) {
      list.innerHTML = `<div class="empty-state"><span class="empty-icon" aria-hidden="true">${icon('clipboard-check')}</span><h3>当前筛选下没有订单</h3><p>可切换“全部”，或等待用户提交新的演示订单。</p></div>`;
      return;
    }
    list.innerHTML = orders.map((order) => {
      const pet = getOrderPet(order);
      const [label, , tone] = statusMeta(order);
      const statusIcon = statusIconName(reviewStatus(order));
      return `<button class="ops-order-card${state.selectedOpsOrderId === order.id ? ' is-selected' : ''}" type="button" data-order-id="${escapeHtml(order.id)}" aria-pressed="${state.selectedOpsOrderId === order.id}">
        <span class="card-top"><small>${escapeHtml(order.id)}</small><span class="status-badge" data-tone="${escapeHtml(tone)}">${icon(statusIcon)}<span>${escapeHtml(label)}</span></span></span>
        <h3>${escapeHtml(order.fromCity)} → ${escapeHtml(order.toCity)}</h3>
        <p>${escapeHtml(pet.name)} · ${escapeHtml(pet.type)} · ${escapeHtml(pet.weight)}kg</p>
        <span class="card-bottom"><span>${escapeHtml(order.pickup?.date || '待约时间')}</span><span>${formatMoney(order.depositAmount || order.deposit?.amount || order.quote?.depositAmount)}</span></span>
      </button>`;
    }).join('');
    all('[data-order-id]', list).forEach((button) => button.addEventListener('click', () => {
      state.selectedOpsOrderId = button.dataset.orderId;
      renderOpsOrderList();
      renderOpsOrderDetail();
      window.dispatchEvent(new CustomEvent('paichong:ops-order', { detail: { orderId: state.selectedOpsOrderId } }));
      if (window.innerWidth <= 760) byId('review-drawer').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  function nodeOptionsFor(order) {
    const cityNodes = state.opsNodes.map((node) => ({ ...node, ...(node.dateOverrides || []).find((override) => override.date === order.pickup?.date) })).filter((node) => node.city === order.fromCity && node.status === '正常');
    return cityNodes;
  }

  function materialName(materials, ...keys) {
    for (const key of keys) if (materials?.[key]) return materials[key];
    return '未提供';
  }

  function renderOpsOrderDetail() {
    const drawer = byId('review-drawer');
    const order = state.opsOrders.find((item) => item.id === state.selectedOpsOrderId);
    if (!order) { drawer.innerHTML = `<div class="empty-state review-empty"><span class="empty-icon">${icon('clipboard-check')}</span><h3 id="review-drawer-title">选择一笔订单开始审核</h3><p>可查看用户材料、风险声明与预约时段。</p></div>`; return; }
    const pet = getOrderPet(order);
    const materials = order.materials || {};
    const current = reviewStatus(order);
    const [label, , tone] = statusMeta(order);
    const statusIcon = statusIconName(current);
    const nodes = nodeOptionsFor(order);
    const canReview = ['pending', 'resubmitted', 'info_required'].includes(current);
    const history = Array.isArray(order.reviewHistory) ? order.reviewHistory.slice().reverse().slice(0, 6) : [];
    const historyMarkup = history.length ? `<section class="material-section"><h3>审核与确认记录</h3><div class="audit-list">${history.map((item) => `<div class="audit-item"><div><strong>${escapeHtml(REVIEW_ACTION_LABELS[item.action] || item.action || '状态更新')}</strong><small>${escapeHtml(formatDateTime(item.at))} · ${escapeHtml(item.operator || '演示账号')}</small></div>${item.note ? `<p>${escapeHtml(item.note)}</p>` : ''}</div>`).join('')}</div></section>` : '';
    const nodeOptions = nodes.length
      ? nodes.map((node) => `<option value="${escapeHtml(node.id)}">${escapeHtml(node.name)} · 营业 ${escapeHtml(node.open)}</option>`).join('')
      : '<option value="">当前城市无可用合作点</option>';
    drawer.innerHTML = `<div class="review-detail">
      <div class="review-title"><div><p class="eyebrow">订单审核</p><h2>${escapeHtml(order.id)}</h2><p>支付状态：${escapeHtml(userDepositStatus(order))}</p></div><span class="status-badge" data-tone="${escapeHtml(tone)}">${icon(statusIcon)}<span>${escapeHtml(label)}</span></span></div>
      <div class="order-route-line"><span><small>起运</small><br><strong>${escapeHtml(order.fromCity)}</strong></span><i aria-hidden="true">${icon('arrow-right')}</i><span><small>目的</small><br><strong>${escapeHtml(order.toCity)}</strong></span></div>
      <div class="info-grid"><div><span>宠物</span><strong>${escapeHtml(pet.name)} · ${escapeHtml(pet.type)}</strong></div><div><span>品种 / 体重</span><strong>${escapeHtml(pet.breed || '未填')} · ${escapeHtml(pet.weight)}kg</strong></div><div><span>预约时段</span><strong>${escapeHtml(order.pickup?.date || '')} ${escapeHtml(order.pickup?.timeSlot || '')}</strong></div><div><span>预估基础价</span><strong>${formatMoney(order.quote?.basePrice || order.priceEstimate)}</strong></div><div><span>保证金</span><strong>${formatMoney(order.depositAmount || order.deposit?.amount || order.quote?.depositAmount)}</strong></div><div><span>联系电话</span><strong>${escapeHtml(order.contactPhone || order.userPhone || order.phone || '未填写')}</strong></div></div>
      ${window.PaichongFulfillment?.markup(order, 'ops') || ''}${journeyMarkup(order)}${pricingMarkup(order)}${contactsMarkup(order)}
      <section class="material-section"><h3>用户材料</h3><div class="material-list"><div class="material-item"><span>${icon('image')}宠物近期照</span><small>${escapeHtml(materialName(materials, 'petPhoto'))}</small></div><div class="material-item"><span>${icon('file-check')}疫苗记录</span><small>${escapeHtml(materialName(materials, 'vaccineCertificate', 'vaccineProof'))}</small></div>${materials.standingPhoto ? `<div class="material-item"><span>${icon('camera')}补充站立照</span><small>${escapeHtml(materials.standingPhoto)}</small></div>` : ''}</div></section>
      <section class="material-section"><h3>健康声明</h3><div class="risk-list">${Object.entries(HEALTH_LABELS).map(([key, text]) => healthDeclarationItems(order.healthDeclaration).includes(key) ? `<span class="risk-tag">${icon('shield-check')}<span>${escapeHtml(text)}</span></span>` : `<span class="risk-tag is-missing">${icon('alert')}<span>未提供：${escapeHtml(text)}</span></span>`).join('')}</div></section>
      ${order.reviewNote ? `<div class="review-message">${icon('clipboard-check')}<div><strong>最近一次运营说明</strong><br>${escapeHtml(order.reviewNote)}</div></div>` : ''}
      ${order.assignedNode ? `<div class="node-result">${icon('map-pin')}<div><strong>已分配：</strong>${escapeHtml(order.assignedNode.city)} · ${escapeHtml(order.assignedNode.name)}</div></div>` : ''}
      ${refundMarkup(order, true)}${historyMarkup}
      <section class="review-actions"><h3>${canReview ? '本次审核动作' : '当前审核已完成'}</h3>${canReview ? `<div class="review-action-grid">
        <label class="field-label" for="review-note">审核说明<textarea id="review-note" rows="2" maxlength="160" placeholder="补件或拒绝时必填；通过时可填写备注"></textarea></label>
        <button class="quiet-button supplement-action" id="request-supplement" type="button">${icon('camera')}<span>要求补充站立全身照</span></button>
        <label class="field-label" for="assign-node">分配合作交接点<select id="assign-node">${nodeOptions}</select></label>
        <label class="field-label" for="node-booking-date">合作点预约日期<input id="node-booking-date" type="date" value="${escapeHtml(order.pickup?.date || '')}" readonly /><small>本轮节点与接宠预约使用同一日期时段，笼位独立计量。如需改期，请先由用户修改接宠预约。</small></label>
        <label class="field-label" for="node-booking-period">合作点预约时段<select id="node-booking-period" disabled><option value="AM" ${String(order.pickup?.timeSlot || '').startsWith('09') ? 'selected' : ''}>上午 09:00–12:00</option><option value="PM" ${String(order.pickup?.timeSlot || '').startsWith('13') ? 'selected' : ''}>下午 13:00–16:00</option></select><small>审核通过后预占，用户确认后转为已确认。</small></label>
        <p class="node-capacity-hint" id="review-node-capacity" role="status">正在核对节点容量…</p>
        <label class="field-label" for="final-price">运营建议价（元）<input id="final-price" type="number" min="${Math.max(0.01, depositAmount(order))}" step="0.01" value="${escapeHtml(proposedPrice(order))}" /><small>不得低于保证金；司机验宠后再确认最终费用</small></label>
        <button class="primary-button" id="approve-order" type="button" ${nodes.length ? '' : 'disabled'}>${icon('check-circle')}<span>审核通过并分配</span></button><button class="danger-button" id="reject-order" type="button">${icon('x-circle')}<span>拒绝承运</span></button>
        <div class="form-message" id="review-action-error" role="alert" hidden></div>
      </div>` : `<p class="panel-intro">${current === 'not_submitted' ? '等待用户支付保证金后，可开始运营审核。' : '当前阶段无需重复审核，最新变更会同步到用户订单。'}</p>`}</section>
    </div>`;
    bindOpsReviewActions(order);
    window.PaichongFulfillment?.bind(drawer, order, { api, toast, reload: loadOpsOrders });
    if (canReview) {
      ['assign-node', 'node-booking-date', 'node-booking-period'].forEach((id) => byId(id)?.addEventListener('change', () => loadReviewNodeCapacity(order)));
      loadReviewNodeCapacity(order);
    }
  }

  async function loadReviewNodeCapacity(order) {
    const hint = byId('review-node-capacity'), button = byId('approve-order');
    if (!hint || !button) return;
    const nodeId = formValue('assign-node'), date = formValue('node-booking-date'), period = formValue('node-booking-period');
    const key = `${order.id}|${nodeId}|${date}|${period}`;
    state.reviewNodeRequest = key;
    button.disabled = true;
    button.dataset.capacityAvailable = 'false';
    if (!nodeId || !date) { hint.textContent = '请选择合作点及预约日期。'; return; }
    hint.textContent = '正在核对节点营业与预约余量…';
    try {
      const payload = await api(`/api/ops/node-calendar?nodeId=${encodeURIComponent(nodeId)}&date=${encodeURIComponent(date)}&days=1`);
      if (state.selectedOpsOrderId !== order.id || state.reviewNodeRequest !== key || !hint.isConnected) return;
      const slot = (payload.items || []).find((item) => item.nodeId === nodeId && item.date === date && item.period === period);
      const available = Boolean(slot?.available && Number(slot.remaining) > 0);
      hint.textContent = slot ? (available ? `${slot.timeSlot || period} · 剩余 ${slot.remaining} 个笼位 · 容量以审核提交时为准` : `${slot.blockedReason || '该时段已满位或暂停预约'}；请换点，或由用户改期后重新审核。`) : '该日期时段不在可预约范围。';
      button.dataset.capacityAvailable = String(available);
      button.disabled = state.reviewBusy || !available;
    } catch (error) { if (hint.isConnected && state.reviewNodeRequest === key) hint.textContent = `容量加载失败：${error.message}。切换合作点或刷新订单后重试。`; }
  }

  function reviewNoteValue(fallback = '') { return formValue('review-note') || fallback; }

  async function submitReview(order, action, extra, button) {
    setMessage('review-action-error');
    if (state.reviewBusy) return;
    state.reviewBusy = true;
    all('.review-actions button, .refund-actions button').forEach((item) => { item.disabled = true; });
    setBusy(button, true, '提交中…');
    try {
      await api(`/api/ops/orders/${encodeURIComponent(order.id)}/review`, {
        method: 'PATCH', headers: opsHeaders(), body: { action, ...extra }
      });
      const actionLabels = { request_info: '补件要求已发送', approve: '审核已通过并分配节点', reject: '订单已标记为无法承运' };
      toast(actionLabels[action] || '审核状态已更新');
      await loadOpsOrders();
      window.dispatchEvent(new Event('paichong:data-changed'));
    } catch (error) { setMessage('review-action-error', error.message); }
    finally { state.reviewBusy = false; setBusy(button, false); all('.review-actions button, .refund-actions button').forEach((item) => { item.disabled = item.id === 'approve-order' && item.dataset.capacityAvailable !== 'true'; }); }
  }

  function bindOpsReviewActions(order) {
    byId('request-supplement')?.addEventListener('click', (event) => submitReview(order, 'request_info', {
      note: reviewNoteValue('请补充一张宠物近期站立全身照，需完整露出四肢与体型。')
    }, event.currentTarget));
    byId('approve-order')?.addEventListener('click', (event) => {
      const nodeId = formValue('assign-node');
      if (!nodeId) { setMessage('review-action-error', '请先选择可用合作交接点。'); return; }
      const price = Number(formValue('final-price'));
      if (!Number.isFinite(price) || price <= 0 || price < depositAmount(order)) { setMessage('review-action-error', '运营建议价必须是有效正数，且不能低于已收保证金。'); byId('final-price').focus(); return; }
      submitReview(order, 'approve', {
        nodeId,
        nodeDate: formValue('node-booking-date'), nodePeriod: formValue('node-booking-period'),
        proposedPrice: price,
        note: reviewNoteValue('材料完整，预约时段与线路能力匹配。')
      }, event.currentTarget);
    });
    byId('reject-order')?.addEventListener('click', (event) => {
      const button = event.currentTarget;
      const note = reviewNoteValue();
      if (!note) { setMessage('review-action-error', '拒绝承运前请填写具体原因。'); byId('review-note').focus(); return; }
      openDialog('确认拒绝这笔订单？', '用户端会立即看到“暂无法承运”及运营说明。已付保证金将进入模拟退款。', () => submitReview(order, 'reject', { note }, button), { danger: true, iconName: 'x-circle', confirmLabel: '确认拒绝承运' });
    });
    [['refund-success', 'succeeded'], ['refund-failed', 'failed']].forEach(([id, outcome]) => byId(id)?.addEventListener('click', (event) => {
      const button = event.currentTarget;
      openDialog(outcome === 'succeeded' ? '确认模拟退款成功？' : '记录模拟退款失败？', `${order.id} · ${formatMoney(order.refund?.amount)}。本次仅更新模拟退款状态，结果会同步到用户端。`, async () => {
        if (state.reviewBusy) return;
        state.reviewBusy = true;
        all('.refund-actions button').forEach((item) => { item.disabled = true; });
        setBusy(button, true, '处理退款中…');
        try {
          await api(`/api/ops/orders/${encodeURIComponent(order.id)}/refund`, { method: 'POST', body: { outcome } });
          toast(outcome === 'succeeded' ? '模拟退款成功' : '已记录模拟退款失败，可重新处理');
          await loadOpsOrders();
        } catch (error) { setMessage('refund-error', error.message); }
        finally { state.reviewBusy = false; setBusy(button, false); all('.refund-actions button').forEach((item) => { item.disabled = false; }); }
      }, { danger: outcome === 'failed', iconName: outcome === 'succeeded' ? 'check-circle' : 'alert', confirmLabel: outcome === 'succeeded' ? '模拟退款成功' : '模拟退款失败' });
    }));
  }

  function openDialog(title, description, action, options = {}) {
    byId('dialog-title').textContent = title;
    byId('dialog-description').textContent = description;
    byId('dialog-confirm').innerHTML = `${icon(options.iconName || 'alert')}<span>${escapeHtml(options.confirmLabel || '确认操作')}</span>`;
    byId('dialog-confirm').className = options.danger ? 'danger-button' : 'primary-button';
    byId('dialog-reason-field')?.remove();
    if (options.reason) byId('dialog-description').insertAdjacentHTML('afterend', '<label class="field-label" id="dialog-reason-field" for="dialog-reason">取消原因（选填）<textarea id="dialog-reason" maxlength="160" rows="2" placeholder="如出行计划调整"></textarea></label>');
    document.querySelector('.dialog-mark').innerHTML = icon(options.iconName || 'alert');
    state.dialogAction = action;
    byId('confirm-dialog').hidden = false;
    byId('dialog-cancel').focus();
  }

  function closeDialog() {
    byId('confirm-dialog').hidden = true;
    state.dialogAction = null;
  }

  async function resetDemo() {
    const button = byId('reset-demo');
    setBusy(button, true, '重置中…');
    try {
      await api('/api/demo/reset', { method: 'POST', body: {} });
      Object.assign(state, {
        step: 1, maxStep: 1, quote: null,
        materials: { petPhoto: '', vaccineProof: '', standingPhoto: '' }, healthDeclaration: [], slots: [], selectedSlotId: '',
        currentOrder: null, userOrders: [], opsOrders: [], opsNodes: [], selectedOpsOrderId: '', opsFilter: 'all', clientRequestId: '', availabilityMeta: {},
        opsToken: authSession?.role === 'ops' ? authSession.token : ''
      });
      all('form').forEach((form) => form.reset());
      byId('from-city').value = '广州'; byId('to-city').value = '武汉'; byId('pet-name').value = '豆包'; byId('pet-type').value = '猫';
      byId('pet-breed').value = '中华田园猫'; byId('pet-weight').value = '5'; byId('travel-date').value = defaultTravelDate();
      setUpload('petPhoto', ''); setUpload('vaccineProof', '');
      persistState(); updateSummary();
      if (authSession?.role === 'ops') {
        renderOpsSession();
        window.dispatchEvent(new Event('paichong:data-changed'));
        toast('演示数据已重置，订单池已恢复初始状态');
      } else {
        showStep(1, { force: true });
        toast('演示数据已重置，可以从询价重新开始');
      }
    } catch (error) { toast(error.message); }
    finally { setBusy(button, false); }
  }

  async function logoutPortal() {
    if (state.pendingMutations) { toast('正在提交，请稍候再退出。'); return; }
    const button = byId('portal-logout');
    setBusy(button, true, '退出中…');
    try {
      if (sessions) await sessions.logout(authSession?.token || '');
      else await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Accept: 'application/json', Authorization: `Bearer ${authSession?.token || ''}` }
      });
    } catch { /* Local session must still be cleared if the demo service is unavailable. */ }
    finally {
      if (sessions && !sessions.read()) window.location.replace('./login.html');
      else clearAuthAndRedirect();
    }
  }

  function configurePortalChrome() {
    const role = authSession.role;
    const badge = byId('header-role-badge');
    badge.dataset.role = role;
    badge.textContent = role === 'ops' ? '经营者后台' : '用户端';
    byId('header-account').textContent = authSession.account;
    byId('reset-demo').hidden = role !== 'ops';
    byId('review-note-copy').innerHTML = role === 'ops'
      ? '<strong>运营评审提示</strong>　当前为独立运营账号视图，所有审核、节点分配与退款状态均为虚拟数据。'
      : '<strong>用户评审提示</strong>　所有订单、材料与支付均为虚拟数据；提交后由独立运营账号进行审核。';
  }

  function bindEvents() {
    byId('new-order').addEventListener('click', startNewOrder);
    byId('view-my-orders').addEventListener('click', () => showStep(5, { force: true }));
    byId('user-order-select').addEventListener('change', (event) => { if (event.target.value) selectUserOrder(event.target.value); });
    byId('back-to-order').addEventListener('click', () => showStep(5, { force: true }));
    byId('fill-sample-address').addEventListener('click', () => {
      byId('contact-name').value = '林小宠'; byId('contact-phone').value = currentUserAccount();
      byId('pickup-address').value = `${formValue('from-city')}市安心路 18 号宠友小区 1 栋 101（虚拟）`;
      byId('recipient-name').value = '陈小橘'; byId('recipient-phone').value = '13900139000';
      byId('recipient-address').value = `${formValue('to-city')}市暖阳路 26 号花园小区 2 栋 202（虚拟）`;
      state.clientRequestId = '';
      toast('已填入虚拟收寄信息');
    });
    all('.wizard-step').forEach((button) => button.addEventListener('click', () => showStep(button.dataset.step)));
    all('.back-step').forEach((button) => button.addEventListener('click', () => showStep(button.dataset.back, { force: true })));
    all('[data-jump-step]').forEach((button) => button.addEventListener('click', () => showStep(button.dataset.jumpStep, { force: true })));
    byId('quote-form').addEventListener('submit', handleQuoteSubmit);
    byId('materials-form').addEventListener('submit', handleMaterialsSubmit);
    byId('create-order').addEventListener('click', createOrder);
    byId('pay-deposit').addEventListener('click', payDeposit);
    byId('refresh-user-orders').addEventListener('click', loadUserOrders);
    byId('refresh-ops-orders').addEventListener('click', loadOpsOrders);
    byId('portal-logout').addEventListener('click', logoutPortal);
    byId('ops-logout').addEventListener('click', logoutPortal);
    byId('reset-demo').addEventListener('click', () => openDialog('重置全部演示数据？', '当前新增订单与审核状态将恢复为初始虚拟数据。', resetDemo, { danger: true, iconName: 'reset', confirmLabel: '确认重置数据' }));
    byId('dialog-cancel').addEventListener('click', closeDialog);
    byId('dialog-confirm').addEventListener('click', () => { const action = state.dialogAction; closeDialog(); action?.(); });
    byId('confirm-dialog').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeDialog(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !byId('confirm-dialog').hidden) closeDialog(); });
    byId('swap-route').addEventListener('click', () => {
      const from = byId('from-city').value; byId('from-city').value = byId('to-city').value; byId('to-city').value = from; invalidateDraft(); loadBookingDates();
    });
    ['from-city', 'to-city', 'pet-name', 'pet-type', 'pet-breed', 'pet-weight', 'service-type', 'travel-date'].forEach((id) => byId(id).addEventListener('input', () => { invalidateDraft(); if (id === 'from-city') loadBookingDates(); }));
    byId('materials-form').addEventListener('input', () => { state.clientRequestId = ''; if (!state.currentOrder) state.maxStep = Math.min(state.maxStep, 2); });
    all('.sample-file').forEach((button) => button.addEventListener('click', () => setUpload(button.dataset.target, button.dataset.filename)));
    byId('pet-photo').addEventListener('change', (event) => setUpload('petPhoto', event.target.files?.[0]?.name || ''));
    byId('vaccine-proof').addEventListener('change', (event) => setUpload('vaccineProof', event.target.files?.[0]?.name || ''));
    all('.filter-tab').forEach((button) => button.addEventListener('click', () => {
      state.opsFilter = button.dataset.filter;
      all('.filter-tab').forEach((item) => item.classList.toggle('is-active', item === button));
      renderOpsOrderList();
    }));
  }

  async function init() {
    authSession = readAuthSession();
    if (!hasValidAuthShape(authSession)) {
      clearAuthAndRedirect();
      return;
    }
    if (sessions && !sessions.allowedRole(authSession.role)) { window.location.replace('./login.html'); return; }
    try {
      const verified = await api('/api/auth/me');
      if (verified.role !== authSession.role || verified.account !== authSession.account) {
        clearAuthAndRedirect();
        return;
      }
      authSession = { ...authSession, name: verified.name || authSession.name };
      if (sessions) sessions.save(authSession, authSession.token);
      else localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authSession));
    } catch (error) {
      if (error.status === 401 || error.code === 'SESSION_CHANGED') return;
      byId('review-note-copy').textContent = `暂时无法核对身份：${error.message}。请刷新后重试。`;
      return;
    }
    const saved = readSavedState();
    if (authSession.role === 'driver') { window.location.replace('./driver.html'); return; }
    if (authSession.role === 'partner') { window.location.replace('./partner.html'); return; }
    state.role = authSession.role;
    state.opsToken = authSession.role === 'ops' ? authSession.token : '';
    byId('travel-date').value = defaultTravelDate();
    byId('contact-phone').value = currentUserAccount();
    const account = currentUserAccount();
    byId('current-user-phone').textContent = /^1\d{10}$/.test(account)
      ? `${account.slice(0, 3)} ${account.slice(3, 7)} ${account.slice(7)}`
      : account;
    configurePortalChrome();
    bindEvents();
    updateSummary();
    if (authSession.role === 'user') {
      await loadBookingDates();
      if (saved.orderId && saved.phone === account) {
        state.step = 5;
        showStep(5, { force: true });
      } else { showStep(1, { force: true }); await loadUserOrders(); }
    }
    switchRole(authSession.role);
    window.PaichongReview.ready = true;
    window.dispatchEvent(new CustomEvent('paichong:ready', { detail: { role: authSession.role } }));
  }

  window.PaichongReview = {
    api, toast, openDialog, loadOpsOrders, logout: logoutPortal, startNewOrder,
    step: (step) => showStep(step, { force: true }),
    openUserOrder: async (id, shouldApply = () => true) => {
      const payload = await api(`/api/user/orders/${encodeURIComponent(id)}`);
      if (!shouldApply()) return false;
      const order = payload.order || payload;
      state.userOrders = [order, ...state.userOrders.filter((item) => item.id !== order.id)];
      selectUserOrder(order.id);
      return true;
    },
    session: () => authSession
  };
  window.addEventListener('paichong:ops-changed', () => { if (authSession?.role === 'ops') loadOpsOrders(); });
  init();
})();
