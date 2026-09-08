(() => {
  'use strict';
  const enabled = () => window.PAICHONG_DEMO_MODE === true;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const kinds = { price_review: '费用复核', cancel: '取消出行', reschedule: '预约改期', return: '退运申请' };
  const decisions = { reprice: '重新报价，请用户确认', cancel: '取消并退还已付费用', reschedule: '改期后重新审核', return: '安排原司机退运交接', decline: '不予变更，说明原因' };
  const permissions = { price_review: ['reprice', 'cancel', 'decline'], cancel: ['cancel', 'decline'], reschedule: ['reschedule', 'decline'], return: ['return', 'decline'] };
  function markup(order, role) {
    if (!enabled()) return '';
    const f = order.fulfillment, request = order.serviceRequest;
    const ended = ['cancelled', 'rejected'].includes(order.reviewStatus) || ['delivered', 'terminated', 'returning'].includes(f?.stage);
    const moving = Boolean(f?.departedAt) || ['in_transit', 'arrived'].includes(f?.stage);
    const choices = moving ? ['return'] : [f?.stage === 'awaiting_payment' ? 'price_review' : '', 'cancel', !f && !['arrived', 'departed'].includes(order.nodeReservation?.status) ? 'reschedule' : ''].filter(Boolean);
    const history = (order.serviceRequests || []).slice(-4).reverse();
    if (!request && (role !== 'user' || ended)) return '';
    return `<section class="service-flow" aria-label="行程变更"><div class="service-heading"><h3>行程协助</h3><span>${request?.status === 'pending' ? '待总部处理' : '有事一起商量'}</span></div>${request ? `<div class="service-request-note"><strong>${escape(kinds[request.kind])} · ${request.status === 'pending' ? '处理中' : request.status === 'declined' ? '未通过' : '已处理'}</strong><p>${escape(request.note)}</p>${request.resolution ? `<p>总部回复：${escape(request.resolution)}</p>` : '<small>申请处理前，付款、调度和运输动作会暂停。</small>'}</div>` : ''}
      ${role === 'user' && !ended && request?.status !== 'pending' ? `<details class="service-request-form"><summary>需要改期、取消或核对费用？</summary><form data-service-form="request"><label>申请事项<select name="kind">${choices.map(k => `<option value="${k}">${kinds[k]}</option>`).join('')}</select></label><label>说明<textarea name="note" rows="2" maxlength="300" required placeholder="告诉我们需要调整什么"></textarea></label><button type="submit" class="outline-button">提交总部处理</button><p role="alert" hidden></p></form></details>` : ''}
      ${role === 'ops' && request?.status === 'pending' ? `<form data-service-form="resolve"><label>处理方式<select name="decision">${(permissions[request.kind] || []).map(k => `<option value="${k}">${decisions[k]}</option>`).join('')}</select></label><label data-service-field="price">重新确认总价（元）<input name="price" type="number" min="${Number(order.deposit?.amount || 0)}" max="100000" step="0.01" value="${Number(f?.invoice?.total || order.proposedPrice || 0)}" /></label><label data-service-field="slotId" hidden>新预约时段<select name="slotId"><option value="">正在查询余量…</option></select></label><label class="service-check" data-service-field="petReturned" hidden><input name="petReturned" type="checkbox" />宠物已交回寄件人，现场交接已核对</label><label>回复与处理说明<textarea name="note" rows="2" maxlength="300" required placeholder="记录核实结果，并说明下一步安排"></textarea></label><p class="service-demo-rule">本轮假数据演示：取消或退运交接后按已付金额全额退款；不产生真实扣款，正式收费与退款规则待确认。</p><button type="submit" class="primary-button">确认处理申请</button><p role="alert" hidden></p></form>` : ''}
      ${history.length > 1 ? `<details><summary>查看变更记录 · ${history.length}</summary>${history.map(r => `<p class="service-history"><strong>${escape(kinds[r.kind])}</strong> · ${r.status === 'pending' ? '待处理' : r.status === 'approved' ? '已处理' : '未通过'}<br>${escape(r.note)}${r.resolution ? `<br>回复：${escape(r.resolution)}` : ''}</p>`).join('')}</details>` : ''}</section>`;
  }
  function bind(container, order, { api, reload, toast }) {
    if (!enabled()) return;
    container.querySelectorAll('[data-service-form]').forEach(form => {
      const type = form.dataset.serviceForm, requestId = window.crypto.randomUUID();
      if (type === 'resolve') {
        const select = form.elements.decision;
        const update = () => {
          const requiresReturn = select.value === 'cancel' && ['arrived', 'departed'].includes(order.nodeReservation?.status);
          const visible = { price: select.value === 'reprice', slotId: select.value === 'reschedule', petReturned: requiresReturn };
          for (const [key, show] of Object.entries(visible)) { form.querySelector(`[data-service-field="${key}"]`).hidden = !show; form.elements[key].required = show; }
        };
        select.addEventListener('change', update); update();
        if (order.serviceRequest.kind === 'reschedule') api(`/api/ops/availability?city=${encodeURIComponent(order.fromCity)}`).then(result => {
          if (!form.isConnected) return;
          const slots = result.items.filter(s => s.available && s.id !== order.pickup?.slotId);
          form.elements.slotId.innerHTML = slots.length ? slots.map(s => `<option value="${escape(s.id)}">${escape(s.date)} ${escape(s.timeSlot)} · 剩余 ${s.remaining}</option>`).join('') : '<option value="">暂无可用时段，请退回说明</option>';
        }).catch(error => { if (form.isConnected) { const alert = form.querySelector('[role=alert]'); alert.hidden = false; alert.textContent = error.message; } });
      }
      form.addEventListener('submit', async event => {
        event.preventDefault(); if (form.dataset.busy || !form.reportValidity()) return;
        const fields = new FormData(form), button = form.querySelector('button[type=submit]'), alert = form.querySelector('[role=alert]');
        const values = type === 'request' ? { requestId, kind: fields.get('kind'), note: fields.get('note') } : { requestId: order.serviceRequest.id, decision: fields.get('decision'), note: fields.get('note'), ...(fields.get('decision') === 'reprice' ? { price: fields.get('price') } : {}), ...(fields.get('decision') === 'reschedule' ? { slotId: fields.get('slotId') } : {}), petReturned: fields.has('petReturned') };
        form.dataset.busy = 'true'; button.disabled = true; alert.hidden = true;
        try {
          await api(`/api/${type === 'request' ? 'user' : 'ops'}/orders/${encodeURIComponent(order.id)}/service-request${type === 'request' ? '' : '/resolve'}`, { method: 'POST', body: values });
          toast(type === 'request' ? '申请已提交，总部可查看处理' : '申请已处理，相关角色可查看最新状态');
          await reload();
        } catch (error) { alert.textContent = error.message; alert.hidden = false; }
        finally { delete form.dataset.busy; button.disabled = false; }
      });
    });
    if (order.serviceRequest?.status === 'pending' || ['returning', 'terminated'].includes(order.fulfillment?.stage)) container.querySelectorAll('[data-fulfillment-form], .order-followup-actions, .supplement-form, .review-actions').forEach(form => { form.hidden = true; });
  }
  window.PaichongServiceFlow = Object.freeze({ markup, bind });
})();
