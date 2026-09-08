(() => {
  'use strict';
  const copy = (value) => window.PaichongProductCopy?.text(value) ?? value;
  const escape = (v = '') => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const money = (v) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 }).format(v);
  const date = (v) => v ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(v)) : '—';
  const states = {
    awaiting_payment: ['请确认验宠费用', '司机已出具确认总价，扣除保证金后确认剩余费用。', 'orange'],
    ready: ['费用已确认', '费用已付清，完成合作点离点交接后由司机确认出发。', 'green'],
    in_transit: ['毛孩子在路上', '以下为司机登记的运输记录，不是实时定位。', 'green'],
    arrived: ['已到目的城市，待签收', '司机将核对签收人并登记宠物交接情况。', 'green'],
    exception: ['履约异常，处理中', '经营者处理后才能继续出发、付款或签收。', 'red'],
    delivered: ['已签收', '签收与费用记录已保留，本次行程结束。', 'green'],
    returning: ['退运安排中', '总部已确认退运，等待司机完成退回交接。', 'orange'],
    terminated: ['行程已结束', '取消或退运交接已记录，退款进度请查看订单。', 'orange']
  };
  function markup(order, role = 'user') {
    const f = order.fulfillment;
    if (!f) return '';
    const invoice = f.invoice, issue = f.exception, ended = f.stage === 'terminated';
    return `<section class="fulfillment-panel" aria-label="履约与尾款"><div class="fulfillment-heading"><h3>${ended ? '原验宠费用记录' : '验宠与费用确认'}</h3><span class="fulfillment-chip">${ended ? '已结束 · 无需支付' : invoice.status === 'paid' ? '已确认' : '待用户确认'}</span></div>
      <dl class="fulfillment-prices"><div><dt>司机确认总价</dt><dd>${money(invoice.total)}</dd></div><div><dt>已付保证金抵扣</dt><dd>− ${money(invoice.deposit)}</dd></div><div class="fulfillment-total"><dt>${ended ? (invoice.status === 'paid' ? '原已付尾款' : '原尾款（已关闭）') : invoice.status === 'paid' ? '已付尾款' : '待付尾款'}</dt><dd>${money(invoice.amount)}</dd></div></dl>
      <p class="fulfillment-note">验宠说明：${escape(copy(f.inspection.note))}</p>
      ${role === 'user' && invoice.status !== 'paid' && f.stage === 'awaiting_payment' ? `<form data-fulfillment-form="balance"><label class="fulfillment-check"><input name="consent" type="checkbox" required />我已核对确认总价 ${money(invoice.total)}，同意保证金抵扣，知悉体验版支付不扣款。</label><button class="primary-button" type="submit">${invoice.amount === 0 ? '确认费用，无需补款' : `确认支付 ${money(invoice.amount)}`}</button><p class="form-message" role="alert" hidden></p></form>` : ''}
      ${issue ? `<div class="fulfillment-issue"><strong>${issue.status === 'open' ? '待处理异常' : '异常已处理'}</strong><p>${escape(copy(issue.note))}</p>${issue.resolution ? `<p>处理结果：${escape(issue.resolution)}</p>` : ''}${role === 'ops' && issue.status === 'open' ? `<form data-fulfillment-form="resolve"><label>处理说明<textarea name="resolution" rows="3" maxlength="300" required placeholder="说明处理结果及为何可以继续履约"></textarea></label><label class="fulfillment-check"><input type="checkbox" name="consent" required />已核实处理结果，可以恢复原流程（不代表签收）。</label><button class="primary-button" type="submit">确认处理并恢复流程</button><p class="form-message" role="alert" hidden></p></form>` : ''}</div>` : ''}
      ${f.receipt ? `<div class="fulfillment-receipt"><strong>已签收</strong><p>签收人：${escape(copy(f.receipt.receiverName))} · ${date(f.receipt.signedAt)}</p><small>此为交接记录，不作为电子签名或收货凭证。</small></div>` : ''}
      <details class="fulfillment-events" ${['in_transit', 'arrived', 'delivered', 'exception'].includes(f.stage) ? 'open' : ''}><summary>查看履约记录 · ${f.events.length} 条</summary><ol>${f.events.slice().reverse().map((item) => `<li><strong>${escape(copy(item.label))}</strong><small>${date(item.recordedAt)} 登记 · ${escape(copy(item.operator))}</small>${item.city ? `<small>到达城市：${escape(item.city)} · ${date(item.occurredAt)}</small>` : ''}${item.note ? `<p>${escape(copy(item.note))}</p>` : ''}</li>`).join('')}</ol></details>
      <p class="fulfillment-footnote">${window.PAICHONG_DEMO_MODE === true ? '节点与签收时间按演示行程顺序展示，登记时间为本次操作时间；不提供实时定位。' : '到达时间按行程计划展示，登记时间为操作时间；不提供实时定位。'}</p></section>`;
  }
  function bind(root, order, { api, reload, toast }) {
    root.querySelectorAll('[data-fulfillment-form]').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault(); if (form.dataset.busy) return;
      const button = form.querySelector('button'), error = form.querySelector('[role="alert"]'), kind = form.dataset.fulfillmentForm;
      const fields = new FormData(form); if (!fields.get('consent')) return;
      form.dataset.busy = 'true'; button.disabled = true; error.hidden = true;
      const path = kind === 'balance' ? `/api/user/orders/${encodeURIComponent(order.id)}/balance/pay` : `/api/ops/orders/${encodeURIComponent(order.id)}/exception/resolve`;
      const body = kind === 'balance' ? { invoiceId: order.fulfillment.invoice.id, acceptedTotal: order.fulfillment.invoice.total } : { exceptionId: order.fulfillment.exception.id, note: fields.get('resolution') };
      try { await api(path, { method: 'POST', body }); toast(kind === 'balance' ? '费用已确认，请等待司机出发' : '异常已处理，恢复原履约流程'); if (kind === 'resolve') window.dispatchEvent(new CustomEvent('paichong:data-changed')); await reload(); }
      catch (e) { error.textContent = copy(e.message); error.hidden = false; }
      finally { delete form.dataset.busy; button.disabled = false; }
    }));
  }
  window.PaichongFulfillment = { markup, bind, meta: (order) => states[order.fulfillment?.stage], escape, money };
})();
