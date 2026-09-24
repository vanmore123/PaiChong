(() => {
  'use strict';
  if (window.PAICHONG_DEMO_MODE !== true || !window.PaichongProtectionPolicy) return;
  const policy = window.PaichongProtectionPolicy;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = name => `<svg class="ui-icon" aria-hidden="true"><use href="./assets/v5/icons/app-sprite.svg#icon-${name}"></use></svg>`;
  const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '未记录';
  let payment = null;

  function showDialog(title, body, { label = '返回', onConfirm, opener = document.activeElement } = {}) {
    if (document.getElementById('protection-dialog')) return;
    const dialog = document.createElement('dialog'); dialog.id = 'protection-dialog'; dialog.className = 'protection-dialog';
    dialog.setAttribute('aria-labelledby', 'protection-dialog-title');
    dialog.innerHTML = `<header><div><span class="protection-kicker">安心出行 · 先说清楚</span><h2 id="protection-dialog-title">${esc(title)}</h2></div><button type="button" class="protection-close" aria-label="关闭协议窗口">×</button></header><div class="protection-dialog-body">${body}</div><footer><button type="button" class="primary-button protection-full" data-protection-done>${esc(label)}</button></footer>`;
    document.body.append(dialog);
    dialog.querySelector('.protection-close').addEventListener('click', () => dialog.close());
    dialog.querySelector('[data-protection-done]').addEventListener('click', () => { onConfirm?.(); dialog.close(); });
    dialog.addEventListener('close', () => { dialog.remove(); if (opener?.isConnected) opener.focus(); }, { once: true });
    dialog.showModal();
  }

  function documentBody(key, record) {
    const snapshot = record ? record.documentSnapshot : policy, document = snapshot?.documents?.[key];
    if (!document || !Array.isArray(document.sections)) return '<p>该份协议快照不完整，请联系运营核对；不会用新版本替换原记录。</p>';
    return `<p class="protection-version">${esc(snapshot.label)} · ${esc(snapshot.version)}</p><p class="protection-notice">${esc(snapshot.notice)}</p>${record ? `<p class="protection-record-context">订单 ${esc(record.orderSnapshot?.orderId)} · ${esc(record.orderSnapshot?.petName)}<br>${esc(record.orderSnapshot?.fromCity)} → ${esc(record.orderSnapshot?.toCity)}<br>本地确认：${date(record.confirmedAt)}（北京时间）</p>` : ''}${document.sections.map(section => `<section class="protection-clause${section.important ? ' is-important' : ''}"><h3>${esc(section.title)}</h3><p>${esc(section.text)}</p></section>`).join('')}<section class="protection-clause"><h3>文本参考与上线前核对</h3><p>正式启用前，请由熟悉宠物运输业务的法律专业人士审阅，补齐主体信息和实际服务标准。</p>${policy.references.map(reference => `<a href="${reference.url}" target="_blank" rel="noopener noreferrer">${esc(reference.title)} ↗</a>`).join('')}</section>`;
  }
  function openDocument(key, { record, onReviewed } = {}) {
    const title = record?.documentSnapshot?.documents?.[key]?.title || policy.documents[key]?.title;
    if (!title) return;
    showDialog(title, documentBody(key, record), { label: onReviewed ? '我已阅读，返回确认' : '返回', onConfirm: onReviewed });
  }
  function insuranceInfo() {
    return `<div class="protection-heading"><span class="protection-icon">${icon('shield-check')}</span><div><h3>${esc(policy.insurance.title)}</h3><p>${esc(policy.insurance.status)}</p></div><span class="protection-optional">可选</span></div><p class="protection-description">${esc(policy.insurance.description)}</p>`;
  }
  function mountPayment(root, order) {
    if (!root || !order?.id) return;
    const account = window.PaichongReview.session()?.account;
    const key = `${account}:${order.id}:${policy.version}`;
    if (payment?.key === key && payment.root === root && root.childElementCount) return;
    payment = { key, root, orderId: order.id, account, reviewed: {} };
    if (order.protectionConfirmation) { root.innerHTML = markup(order); bind(root, order); return; }
    root.innerHTML = `<section class="protection-card" aria-label="保险咨询意向">${insuranceInfo()}<fieldset class="protection-choices"><legend>是否希望了解保险？不选择也可继续</legend>${Object.entries(policy.insurance.choices).map(([value, label]) => `<label><input type="radio" name="insurance-intent" value="${value}"/><span>${label}<small>${value === 'consult' ? '随订单留存意向，待运营沟通' : value === 'not-now' ? '不影响承运方应承担的责任' : '之后可联系出行客服咨询'}</small></span></label>`).join('')}</fieldset><p class="protection-boundary">${esc(policy.insurance.boundary)}</p><div class="protection-price"><span>本次保险费用</span><strong>未计费</strong></div></section><section class="protection-card" aria-label="服务协议与风险确认"><div class="protection-heading"><span class="protection-icon warm">${icon('file-check')}</span><div><h3>服务协议与风险确认</h3><p>逐份阅读，再由你主动确认</p></div></div><p class="protection-description">不是“一概免责”。承运方的照护、安全操作等责任不会因勾选而被免除。</p>${['service', 'risk'].map(key => `<div class="protection-document"><button type="button" class="protection-read" data-protection-read="${key}">${icon(key === 'service' ? 'file-check' : 'info')}<span>${esc(policy.documents[key].title)}<small>${esc(policy.label)} · 点击阅读全文</small></span><b>›</b></button><label class="protection-check"><input type="checkbox" data-protection-accept="${key}" disabled/><span>${key === 'service' ? '我已阅读并同意本版服务协议（测试确认）' : '我已单独阅读重点风险，理解风险划分不免除承运方依法应承担的责任'}</span></label><small class="protection-read-status" data-protection-status="${key}">请先打开阅读全文，阅读后返回勾选。</small></div>`).join('')}<p class="protection-local-note">${esc(policy.notice)}</p></section>`;
    for (const button of root.querySelectorAll('[data-protection-read]')) {
      button.addEventListener('click', () => {
        const field = button.dataset.protectionRead, active = payment;
        openDocument(field, { onReviewed: () => {
          if (payment !== active || !root.isConnected || window.PaichongReview.session()?.account !== account) return;
          active.reviewed[field] = policy.version;
          root.querySelector(`[data-protection-accept="${field}"]`).disabled = false;
          root.querySelector(`[data-protection-status="${field}"]`).textContent = '已打开阅读，请自行勾选确认。';
        } });
      });
    }
  }
  function payload(order) {
    const current = payment;
    if (!current || current.orderId !== order.id || current.account !== window.PaichongReview.session()?.account) throw new Error('保障与协议信息未准备好，请返回订单重新进入付款页。');
    for (const key of ['service', 'risk']) {
      const checkbox = current.root.querySelector(`[data-protection-accept="${key}"]`);
      if (current.reviewed[key] !== policy.version || !checkbox?.checked) {
        current.root.querySelector(`[data-protection-read="${key}"]`)?.focus();
        throw new Error(`请先阅读全文并主动勾选《${policy.documents[key].title}》。`);
      }
    }
    return { version: policy.version, reviewedService: current.reviewed.service, reviewedRisk: current.reviewed.risk, acceptedService: true, acceptedRisk: true, demoAcknowledged: true, insuranceChoice: current.root.querySelector('[name="insurance-intent"]:checked')?.value || 'undecided' };
  }
  function setBusy(busy) {
    for (const control of payment?.root.querySelectorAll('button,input') || []) {
      if (busy) { control.dataset.protectionDisabled = String(control.disabled); control.disabled = true; }
      else if (control.dataset.protectionDisabled !== undefined) { control.disabled = control.dataset.protectionDisabled === 'true'; delete control.dataset.protectionDisabled; }
    }
  }
  function markup(order, role = 'user') {
    const record = order.protectionConfirmation;
    const choice = policy.insurance.choices[record?.insurance?.choice] || '尚未记录意向';
    const needsConsultation = role === 'ops' && record?.insurance?.choice === 'consult';
    return `<section class="protection-card protection-order" aria-label="保险与协议记录"><div class="protection-heading"><span class="protection-icon">${icon('shield-check')}</span><div><h3>保险与服务协议</h3><p>${record ? '本地确认已留存 · 非电子签约认证' : '当前没有协议确认记录'}</p></div></div><dl><div><dt>保险意向</dt><dd>${esc(choice)}</dd></div><div><dt>承保状态</dt><dd>尚未投保 · 不提供保单</dd></div><div><dt>保险费用</dt><dd>未计费，不计入本单费用</dd></div>${record ? `<div><dt>协议版本</dt><dd>${esc(record.version)}</dd></div><div><dt>确认时间</dt><dd>${date(record.confirmedAt)}<small>北京时间 · 浏览器记录</small></dd></div>` : ''}</dl>${record ? `<div class="protection-record-buttons"><button class="outline-button" type="button" data-protection-history="service">查看服务协议</button><button class="outline-button" type="button" data-protection-history="risk">查看风险告知</button></div>` : '<p class="protection-description">旧订单不会自动补签或默认同意；待付款订单将在付款前单独确认。已支付的历史订单保持原状。</p><button type="button" class="text-button" data-protection-history="service">查看当前协议评审稿（非历史签署）</button>'}<p class="protection-local-note">${needsConsultation ? '客户希望了解保险。请待产品确定后另行沟通；此处不能代客投保或变更确认记录。' : '承保机构和方案待确认。未选保险不影响承运方依法应承担的责任。'}</p>${role === 'user' ? '<button type="button" class="text-button" data-customer-care>有疑问？联系出行客服 ›</button>' : ''}</section>`;
  }
  function bind(root, order) {
    root.querySelectorAll('[data-protection-history]').forEach(button => button.addEventListener('click', () => openDocument(button.dataset.protectionHistory, { record: order.protectionConfirmation })));
  }
  function guide() {
    showDialog('保险与服务协议', `<section class="protection-card">${insuranceInfo()}<p class="protection-boundary">${esc(policy.insurance.boundary)}</p></section><p class="protection-description">下单付款前可阅读并分别确认服务协议和重点风险。确认后可以在该订单详情中查看当时的文本版本；这里仅展示当前评审稿。</p>${['service','risk'].map(key => `<details class="protection-guide-doc"><summary>${esc(policy.documents[key].title)}</summary>${documentBody(key)}</details>`).join('')}`);
  }
  document.addEventListener('click', event => { if (event.target.closest('[data-protection-guide]')) guide(); });
  window.addEventListener('paichong:session-changed', () => { payment = null; document.getElementById('protection-dialog')?.close(); });
  window.PaichongProtection = Object.freeze({ mountPayment, payload, setBusy, markup, bind, guide });
})();
