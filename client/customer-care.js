(() => {
  'use strict';
  if (window.PAICHONG_DEMO_MODE !== true) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const stages = { new: '待联系', following: '跟进中', quoted: '待确认', converted: '已转订单', lost: '暂不托运' };
  const services = { 'door-to-door': '上门接宠 + 上门送达', 'node-to-node': '自行送至合作点 + 派送至合作点', 'door-to-node': '上门接宠 + 派送至合作点', 'node-to-door': '自行送至合作点 + 上门送达' };
  const uuid = () => window.crypto.randomUUID ? window.crypto.randomUUID() : Array.from(window.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  const date = value => value ? new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '未安排';
  const icon = name => `<svg class="ui-icon" aria-hidden="true"><use href="./assets/v5/icons/app-sprite.svg#icon-${name}"></use></svg>`;
  let supportDraft = null;
  function app() { return window.PaichongReview; }
  function error(target, text = '') { target.textContent = text; target.hidden = !text; }
  function lockForm(form) {
    const controls = [...form.querySelectorAll('input, select, textarea, button')].map(control => [control, control.disabled]);
    controls.forEach(([control]) => { control.disabled = true; });
    return () => controls.forEach(([control, disabled]) => { control.disabled = disabled; });
  }
  async function support() {
    if (app()?.session()?.role !== 'user') return;
    if (document.getElementById('care-dialog')) return;
    const context = { ...app().supportContext(), ...supportDraft };
    const settings = window.PAICHONG_CUSTOMER_CARE || {};
    const wechat = typeof settings.wechatId === 'string' && /^[a-zA-Z][\w-]{5,19}$/.test(settings.wechatId) ? settings.wechatId : '';
    const qr = /^\.\/assets\/[\w/-]+\.(?:png|jpe?g|webp)$/.test(settings.qrImage || '') ? settings.qrImage : '';
    const dialog = document.createElement('dialog'); dialog.id = 'care-dialog'; dialog.className = 'care-dialog';
    dialog.setAttribute('aria-labelledby', 'care-title');
    dialog.innerHTML = `<header class="care-header"><img src="./assets/brand/paichong-logo.png" alt=""/><div><h2 id="care-title">${esc(settings.name || '派宠出行客服')}</h2><p>宠物专车 · 有问题，慢慢说</p></div><button type="button" data-care-close aria-label="关闭客服窗口">×</button></header><div class="care-scroll"><section class="care-wechat"><div><span class="care-kicker">微信一对一咨询</span><h3>${wechat ? esc(wechat) : '客服微信待配置'}</h3><p>${wechat ? '复制微信号，在微信添加好友后发起对话。' : '正式微信号或二维码补齐后，即可联系固定客服。'}</p></div>${qr ? `<img class="care-qr" src="${esc(qr)}" alt="客服添加好友二维码"/>` : ''}<button class="outline-button" type="button" data-copy-wechat ${wechat ? '' : 'disabled'}>${icon('clipboard-check')}复制客服微信号</button><small>这里不会自动打开个人微信会话，也不会替你发送消息。</small><p class="form-message" data-care-copy-result hidden role="status"></p></section><section class="care-conversation"><h3>本次出行咨询</h3><p class="care-muted">先留下出行需求，便于经营者整理回访。测试记录只保存在当前浏览器，不会发送给微信客服。</p><div data-care-messages aria-live="polite"><p class="care-muted">正在读取咨询记录…</p></div></section><form id="care-form"><div class="care-form-grid"><label>联系人<input name="name" required maxlength="30" value="${esc(context.name)}" /></label><label>联系电话<input name="phone" type="tel" inputmode="tel" required maxlength="11" value="${esc(context.phone)}" /></label><label>出发城市<input name="fromCity" data-demo-city required maxlength="30" value="${esc(context.fromCity || '合肥')}" /></label><label>到达城市<input name="toCity" data-demo-city required maxlength="30" value="${esc(context.toCity || '武汉')}" /></label><label>宠物昵称<input name="petName" maxlength="30" value="${esc(context.petName)}" /></label><label>宠物类型<input name="petType" maxlength="20" value="${esc(context.petType || '猫')}" /></label><label class="care-wide">意向出发日<input name="travelDate" type="date" value="${esc(context.travelDate)}" /></label></div><label>接送方式<select name="serviceType">${Object.entries(services).map(([key, label]) => `<option value="${key}" ${context.serviceType === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>想咨询什么？<textarea name="message" rows="3" required maxlength="500" placeholder="例如：周末从合肥出发，想了解接宠时间和笼具要求。">${esc(context.message)}</textarea></label><label class="care-consent"><input name="consent" type="checkbox" required ${context.consent ? 'checked' : ''}/><span>仅填写虚拟资料，同意将本次测试咨询用于回访流程演示。</span></label><p class="form-message" data-care-error role="alert" hidden></p><button class="primary-button care-full" type="submit">保存咨询，安排回访 ${icon('arrow-right')}</button><p class="care-receipt" data-care-receipt role="status" hidden></p></form></div>`;
    document.body.append(dialog);
    const form = dialog.querySelector('form'), messages = dialog.querySelector('[data-care-messages]');
    let busy = false, requestId = uuid();
    const values = () => ({ ...Object.fromEntries(new FormData(form)), consent: form.elements.consent.checked });
    const close = () => { if (busy) return; supportDraft = values(); dialog.close(); };
    dialog.querySelector('[data-care-close]').addEventListener('click', close);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.querySelector('[data-copy-wechat]').addEventListener('click', async () => {
      const target = dialog.querySelector('[data-care-copy-result]');
      try { await navigator.clipboard.writeText(wechat); error(target, '已复制，请切换到微信添加好友。'); }
      catch { error(target, `未能自动复制，请长按上方微信号手动复制：${wechat}`); }
    });
    async function history() {
      try {
        const result = await app().api('/api/user/leads');
        if (!dialog.isConnected) return;
        messages.innerHTML = result.items.length ? result.items.slice(0, 4).map(lead => `<article class="care-thread"><div class="care-thread-top"><span>${esc(lead.fromCity)} → ${esc(lead.toCity)}</span><small>${stages[lead.status]}</small></div>${lead.messages.slice(-3).map(message => `<div class="care-bubble"><p>${esc(message.text)}</p><small>${date(message.at)}</small></div>`).join('')}</article>`).join('') : '<p class="care-empty">还没有咨询记录，先说说毛孩子的出行计划吧。</p>';
      } catch (failure) { if (dialog.isConnected) messages.innerHTML = `<p class="form-message">${esc(failure.message)}</p>`; }
    }
    form.addEventListener('input', () => { requestId = uuid(); });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (busy || !form.reportValidity()) return;
      const body = { ...values(), requestId }, unlock = lockForm(form);
      busy = true;
      error(dialog.querySelector('[data-care-error]'));
      try {
        await app().api('/api/user/leads', { method: 'POST', body });
        form.elements.message.value = ''; supportDraft = { ...body, message: '' }; requestId = uuid();
        error(dialog.querySelector('[data-care-receipt]'), '咨询已保存在本浏览器，可到同一浏览器的经营者端查看回访。尚未发送微信消息。');
        await history();
      } catch (failure) { error(dialog.querySelector('[data-care-error]'), failure.message); }
      finally { busy = false; unlock(); }
    });
    dialog.showModal(); await history();
  }

  async function renderLeads({ root, api, isCurrent, toast }) {
    let leads = [], orders = [], query = '', filter = 'all', busy = false, selectedId = '', requestId = uuid();
    const active = () => isCurrent() && root.isConnected;
    const closed = lead => ['converted', 'lost'].includes(lead.status);
    const due = lead => !closed(lead) && (!lead.nextFollowUpAt || Date.parse(lead.nextFollowUpAt) <= Date.now());
    const today = lead => !closed(lead) && lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).toDateString() === new Date().toDateString();
    function list() {
      if (!active()) return;
      selectedId = '';
      root.innerHTML = `<div class="crm-page"><header class="crm-heading"><div><span class="care-kicker">先聊需求，再安排出行</span><h1>意向客户回访</h1><p>每一次咨询，都有下一步。</p></div><button class="primary-button" type="button" data-crm-add>${icon('plus')}新增客户</button></header><div class="crm-metrics"><button data-filter="due"><strong>${leads.filter(due).length}</strong><span>待联系 / 逾期</span></button><button data-filter="today"><strong>${leads.filter(today).length}</strong><span>今日回访</span></button><button data-filter="converted"><strong>${leads.filter(l => l.status === 'converted').length}</strong><span>已转订单</span></button></div><label class="crm-search">${icon('search')}<input type="search" data-crm-search value="${esc(query)}" placeholder="搜索姓名、电话、宠物或城市" aria-label="搜索意向客户"/></label><div class="crm-filters" role="group" aria-label="意向客户筛选">${[['all', '全部'], ['new', '待联系'], ['following', '跟进中'], ['quoted', '待确认'], ['lost', '暂不托运']].map(([key, name]) => `<button data-filter="${key}" aria-pressed="${filter === key}">${name}</button>`).join('')}<button type="button" data-crm-refresh>刷新</button></div><div data-crm-list></div><p class="care-muted crm-boundary">同一浏览器内双端共享测试咨询；不跨设备同步，不自动拨号或发送微信。</p></div>`;
      function results() {
        const records = leads.filter(lead => (filter === 'all' || filter === 'due' && due(lead) || filter === 'today' && today(lead) || lead.status === filter) && [lead.name, lead.phone, lead.petName, lead.fromCity, lead.toCity].some(value => String(value || '').includes(query))).sort((a, b) => Number(due(b)) - Number(due(a)) || (a.nextFollowUpAt || '').localeCompare(b.nextFollowUpAt || ''));
        root.querySelector('[data-crm-list]').innerHTML = records.length ? records.map(lead => `<button class="crm-lead" type="button" data-lead="${esc(lead.id)}"><div class="crm-lead-top"><span class="crm-avatar">${esc(lead.name.slice(0, 1))}</span><div><strong>${esc(lead.name)}</strong><small>${esc(lead.phone)} · ${esc(lead.source)}</small></div><span class="crm-stage ${lead.status}">${stages[lead.status]}</span></div><h3>${esc(lead.fromCity)} <span>→</span> ${esc(lead.toCity)}</h3><p>${esc(lead.petName || '毛孩子')} · ${esc(lead.petType || '类型待确认')} · ${esc(lead.travelDate || '日期待定')}</p><p class="crm-last-note">${esc(lead.history.at(-1)?.note || lead.messages.at(-1)?.text || '暂无沟通记录')}</p><div class="crm-lead-foot"><span class="${due(lead) ? 'crm-overdue' : ''}">${closed(lead) ? '本次跟进已结束' : lead.nextFollowUpAt ? '下次回访 ' + date(lead.nextFollowUpAt) : '尚未安排首次回访'}</span><span>查看记录 ›</span></div></button>`).join('') : '<div class="care-empty">没有符合条件的意向客户。</div>';
        root.querySelectorAll('[data-lead]').forEach(button => button.addEventListener('click', () => detail(button.dataset.lead)));
      }
      root.querySelector('[data-crm-search]').addEventListener('input', event => { query = event.target.value.trim(); results(); });
      root.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { filter = button.dataset.filter; list(); }));
      root.querySelector('[data-crm-refresh]').addEventListener('click', load);
      root.querySelector('[data-crm-add]').addEventListener('click', create);
      results();
    }
    async function load() {
      if (!active() || busy) return;
      root.innerHTML = '<div class="care-empty" role="status">正在读取意向客户…</div>';
      try {
        const result = await Promise.all([api('/api/ops/leads'), api('/api/ops/orders')]);
        if (!active()) return; leads = result[0].items; orders = result[1].items; list();
      } catch (failure) { if (active()) { root.innerHTML = `<div class="care-empty">${esc(failure.message)}<button class="outline-button" data-crm-retry>重新加载</button></div>`; root.querySelector('button').addEventListener('click', load); } }
    }
    function formSubmit(form, send, success) {
      form.addEventListener('input', () => { requestId = uuid(); });
      form.addEventListener('submit', async event => {
        event.preventDefault(); if (busy || !form.reportValidity()) return;
        busy = true; window.dispatchEvent(new CustomEvent('paichong:mutation-busy', { detail: { busy: true } }));
        const body = Object.fromEntries(new FormData(form)), unlock = lockForm(form);
        try { const result = await send(body); requestId = uuid(); if (active()) { toast(success); const index = leads.findIndex(lead => lead.id === result.lead.id); if (index < 0) leads.unshift(result.lead); else leads[index] = result.lead; detail(result.lead.id); } }
        catch (failure) { if (active()) error(form.querySelector('[data-crm-error]'), failure.message); }
        finally { busy = false; unlock(); window.dispatchEvent(new CustomEvent('paichong:mutation-busy', { detail: { busy: false } })); }
      });
    }
    function create() {
      root.innerHTML = `<div class="crm-page"><button class="text-button" data-crm-back>‹ 返回客户列表</button><h2>新增意向客户</h2><p class="care-muted">记录一次咨询，不生成订单、不收取费用。</p><form class="crm-form"><div class="care-form-grid"><label>联系人<input name="name" required maxlength="30" /></label><label>联系电话<input name="phone" type="tel" inputmode="tel" required maxlength="11" /></label><label>出发城市<input name="fromCity" data-demo-city required value="合肥" /></label><label>到达城市<input name="toCity" data-demo-city required value="武汉" /></label><label>宠物昵称<input name="petName" maxlength="30" /></label><label>宠物类型<input name="petType" maxlength="20" value="猫" /></label><label>意向出发日<input name="travelDate" type="date" /></label><label>咨询来源<select name="source"><option>微信咨询</option><option>电话咨询</option><option>合作点推荐</option></select></label></div><label>接送方式<select name="serviceType">${Object.entries(services).map(([key, name]) => `<option value="${key}">${name}</option>`).join('')}</select></label><label>咨询需求<textarea name="message" rows="4" maxlength="500" required placeholder="记录运输需求、顾虑或约定联系时间"></textarea></label><p data-crm-error class="form-message" role="alert" hidden></p><button class="primary-button care-full" type="submit">保存意向客户</button></form></div>`;
      root.querySelector('[data-crm-back]').addEventListener('click', () => { if (!busy) list(); });
      formSubmit(root.querySelector('form'), body => api('/api/ops/leads', { method: 'POST', body: { ...body, requestId } }), '意向客户已保存');
    }
    function detail(id) {
      if (!active()) return;
      selectedId = id; const lead = leads.find(item => item.id === id);
      const matches = orders.filter(order => !['cancelled', 'rejected'].includes(order.reviewStatus) && (lead.ownerAccount ? (order.ownerAccount || order.userPhone) === lead.ownerAccount : [order.contactPhone, order.userPhone, order.ownerAccount].includes(lead.phone)));
      const next = lead.nextFollowUpAt && Date.parse(lead.nextFollowUpAt) > Date.now() ? lead.nextFollowUpAt : new Date(Date.now() + 86400000).toISOString();
      const localNext = new Date(Date.parse(next) - new Date(next).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      root.innerHTML = `<div class="crm-page"><button class="text-button" data-crm-back>‹ 返回客户列表</button><section class="crm-detail-card"><div class="crm-lead-top"><span class="crm-avatar">${esc(lead.name.slice(0, 1))}</span><div><h2>${esc(lead.name)}</h2><p>${esc(lead.phone)}</p></div><span class="crm-stage ${lead.status}">${stages[lead.status]}</span></div><dl><div><dt>意向路线</dt><dd>${esc(lead.fromCity)} → ${esc(lead.toCity)}</dd></div><div><dt>毛孩子</dt><dd>${esc(lead.petName || '未填写')} · ${esc(lead.petType || '待确认')}</dd></div><div><dt>接送方式</dt><dd>${esc(services[lead.serviceType])}</dd></div><div><dt>出发日期</dt><dd>${esc(lead.travelDate || '待确认')}</dd></div><div><dt>负责客服</dt><dd>总部客服 · ${esc(lead.assignee)}</dd></div><div><dt>下次回访</dt><dd>${closed(lead) ? '已结束跟进' : date(lead.nextFollowUpAt)}</dd></div>${lead.linkedOrderId ? `<div><dt>关联订单</dt><dd>${esc(lead.linkedOrderId)}</dd></div>` : ''}</dl></section><section class="crm-detail-card"><h3>咨询与沟通记录</h3><ol class="crm-timeline">${[...lead.messages.map(message => ({ at: message.at, title: '客户咨询', text: message.text })), ...lead.history.map(item => ({ at: item.at, title: `${item.method}回访 · ${stages[item.status]}`, text: item.note }))].sort((a, b) => b.at.localeCompare(a.at)).map(item => `<li><strong>${esc(item.title)}</strong><small>${date(item.at)}</small><p>${esc(item.text)}</p></li>`).join('')}</ol></section>${closed(lead) ? '<p class="care-empty">本次跟进已归档，历史记录保留。</p>' : `<form class="crm-form"><h3>登记本次回访</h3><div class="care-form-grid"><label>跟进阶段<select name="status">${Object.entries(stages).map(([key, name]) => `<option value="${key}" ${key === (lead.status === 'new' ? 'following' : lead.status) ? 'selected' : ''}>${name}</option>`).join('')}</select></label><label>意向程度<select name="intention">${[['hot', '高意向'], ['warm', '有意向'], ['cold', '待培育']].map(([key, name]) => `<option value="${key}" ${lead.intention === key ? 'selected' : ''}>${name}</option>`).join('')}</select></label><label>回访方式<select name="method"><option>微信</option><option>电话</option><option>其他</option></select></label><label data-crm-next>下次回访<input name="nextFollowUpAt" type="datetime-local" value="${localNext}" required /></label></div><label data-crm-order hidden>关联客户已有订单<select name="orderId"><option value="">请选择已创建的订单</option>${matches.map(order => `<option value="${esc(order.id)}">${esc(order.petName)} · ${esc(order.id)}</option>`).join('')}</select><small>只能关联该客户的现有订单，不会跳过下单、材料或费用确认。</small></label><label>回访结果 / 暂不托运原因<textarea name="note" rows="4" maxlength="500" required placeholder="例如：已沟通合作点交接，客户考虑后明天下午再联系。"></textarea></label><p data-crm-error class="form-message" role="alert" hidden></p><button class="primary-button care-full" type="submit">保存回访记录</button></form>`}</div>`;
      root.querySelector('[data-crm-back]').addEventListener('click', () => { if (!busy) list(); });
      const form = root.querySelector('form');
      if (form) {
        const changeStage = () => { const status = form.elements.status.value, finished = ['converted', 'lost'].includes(status); form.querySelector('[data-crm-next]').hidden = finished; form.elements.nextFollowUpAt.required = !finished; form.querySelector('[data-crm-order]').hidden = status !== 'converted'; form.elements.orderId.required = status === 'converted'; };
        form.elements.status.addEventListener('change', changeStage); changeStage();
        formSubmit(form, body => api(`/api/ops/leads/${encodeURIComponent(selectedId)}/follow-ups`, { method: 'POST', body: { ...body, nextFollowUpAt: body.nextFollowUpAt ? new Date(body.nextFollowUpAt).toISOString() : '', version: lead.version, requestId } }), '回访记录已保存');
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    await load();
  }
  document.addEventListener('click', event => { if (event.target.closest('[data-customer-care]')) support(); });
  window.addEventListener('paichong:session-changed', () => { document.getElementById('care-dialog')?.close(); supportDraft = null; });
  window.PaichongCare = Object.freeze({ open: support, renderLeads });
})();
