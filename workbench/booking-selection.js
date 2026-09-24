(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  function markup(order) {
    const b = order?.bookingSelection;
    if (!b) return '';
    const plan = order.handoffPlan;
    const point = (node, label) => node ? `<div><dt>${label}</dt><dd>${escape(node.city)} · ${escape(node.name)}<small>${escape(node.address)} · ${escape(node.open)}</small></dd></div>` : '';
    return `<section class="booking-order-summary"><h3>接送与笼具</h3><dl><div><dt>接送方式</dt><dd>${escape(b.serviceLabel)}</dd></div><div><dt>笼具选择</dt><dd>${escape(b.cage?.label || '未选择')}<small>${escape(b.cage?.specificationStatus)} · ${escape(b.cage?.feeStatus)}</small></dd></div>${point(plan?.originNode || b.originNode, plan ? '出发合作点安排' : '出发合作点意向')}${point(b.destinationNode, '到达合作点意向')}</dl>${plan ? `<p>${plan.status === 'confirmed' ? '出发送宠网点与时段已确认。' : plan.legacy ? '出发点为历史分配记录，请核对交接地址；本次未新增确认。' : '出发点已由运营安排，等待用户核对确认。'}${b.destinationNode ? '到达点日期、时段和笼位仍待运营确认。' : ''}</p><details class="booking-original"><summary>查看原选网点意向</summary><p>${escape(b.originNode?.name)} · ${escape(b.originNode?.address)}</p>${plan.changeReason ? `<p>调整原因：${escape(plan.changeReason)}</p>` : ''}</details>` : b.originNode || b.destinationNode ? '<p>所选为交接网点意向，不代表已锁定两端笼位；到达日期、交接时段与余量须由运营另行确认。</p>' : ''}</section>`;
  }
  function confirmationMarkup(order) {
    const plan = order?.handoffPlan;
    if (!plan || order.reviewStatus !== 'approved') return '';
    return `<section class="handoff-confirmation" aria-label="待确认交接方案"><span class="handoff-kicker">${plan.changed ? '网点有调整 · 请核对' : '请确认送宠安排'}</span><h3>${escape(plan.originNode.name)}</h3><p>${escape(plan.originNode.address)}</p><strong>${escape(plan.date)} · ${escape(plan.timeSlot)}</strong>${plan.changed ? `<div class="handoff-change"><p>原选：${escape(order.bookingSelection.originNode.name)}</p><p>调整原因：${escape(plan.changeReason)}</p></div>` : ''}<p class="handoff-footnote">确认方案即确认本次出发送宠网点、地址、时段与建议价。${order.bookingSelection?.destinationNode ? '目的地合作点仍待另行确认。' : ''}如不合适，可先联系客服或申请调整。</p></section>`;
  }
  function mount({ api, onChange, session, editable }) {
    const byId = id => document.getElementById(id), value = id => byId(id)?.value || '';
    const state = { catalog: null, cageId: 'cage-1', originNodeId: '', destinationNodeId: '', loading: false, error: '', sequence: 0, city: {}, doors: {} };
    const fields = ['origin', 'destination'];
    const service = () => state.catalog?.services.find(item => item.id === value('service-type'));
    const usesNode = side => service()?.[side === 'origin' ? 'pickupMode' : 'deliveryMode'] === 'node';
    const selected = side => state.catalog?.[side + 'Nodes'].find(node => node.id === state[side + 'NodeId']);
    const currentKey = () => [value('from-city'), value('to-city'), value('travel-date'), value('service-type'), session()].join('|');
    function art(number) {
      return `<svg viewBox="0 0 280 170" role="img" aria-label="${number ? number + '号笼具' : '自备笼具'}示意，实际尺寸待确认"><ellipse cx="143" cy="150" rx="104" ry="10" fill="#dcece5"/><path d="M48 78Q50 38 87 37H181Q213 38 222 69L234 119Q236 139 218 141H63Q44 139 45 119Z" fill="#f9f4e7" stroke="#517b70" stroke-width="3"/><path d="M45 99H230L234 123Q235 140 217 141H63Q45 139 45 120Z" fill="${number === 0 ? '#dfad80' : '#80bfad'}" stroke="#517b70" stroke-width="3"/><path d="M104 38V29Q104 17 119 17H153Q169 17 169 31V37" fill="none" stroke="#517b70" stroke-width="8"/><path d="M60 81L69 60M79 81L88 60M98 81L107 60" stroke="#9bb7ac" stroke-width="6" stroke-linecap="round"/><path d="M139 56H187Q201 57 205 77L214 119Q216 129 204 129H134Q125 129 127 117L131 66Q132 57 139 56Z" fill="#e5efe7" stroke="#517b70" stroke-width="3"/><path d="M143 64L140 122M157 63V123M171 64L174 123M185 65L194 122M133 84H204M132 105H209" stroke="#75968a" stroke-width="3"/><rect x="119" y="91" width="15" height="19" rx="4" fill="#ffa061"/><circle cx="83" cy="118" r="12" fill="#f9f4e7"/><text x="83" y="123" text-anchor="middle" fill="#386758" font-size="15" font-family="system-ui" font-weight="700">${number || '自'}</text></svg>`;
    }
    function render() {
      const status = byId('booking-options-status');
      status.textContent = state.error || (state.loading ? '正在匹配合作点…' : ''); status.hidden = !status.textContent;
      byId('booking-options-retry').hidden = !state.error;
      const cages = state.catalog?.cages || [];
      byId('cage-choices').innerHTML = cages.map(cage => `<button type="button" data-cage="${escape(cage.id)}" class="cage-choice${cage.id === state.cageId ? ' is-selected' : ''}" aria-pressed="${cage.id === state.cageId}" ${state.loading ? 'disabled' : ''}>${escape(cage.label)}</button>`).join('');
      const cage = cages.find(item => item.id === state.cageId);
      byId('cage-preview').innerHTML = cage ? `<div class="cage-art">${art(cage.number)}<span>笼具示意</span></div><div class="cage-spec"><strong>${escape(cage.label)}</strong><span>${escape(cage.specificationStatus)}</span><small>${escape(cage.feeStatus)}</small></div>` : '<p>正在获取笼型…</p>';
      const manual = state.catalog?.pets.find(item => item.name === value('pet-type'))?.manual;
      byId('pet-type-note').hidden = !manual;
      for (const side of fields) {
        const panel = byId(side + '-station'); panel.hidden = !usesNode(side);
        if (panel.hidden) continue;
        const node = state.loading ? null : selected(side), nodes = state.catalog?.[side + 'Nodes'] || [];
        byId(side + '-station-info').innerHTML = node ? `<div class="station-heading"><span class="station-marker ${side}">${side === 'origin' ? '起' : '终'}</span><div><small>${side === 'origin' ? '自行送宠至' : '到达后前往取宠'}</small><strong>${escape(node.name)}</strong></div><span class="station-status">待确认</span></div><p class="station-address">${escape(node.address)}</p><div class="station-meta"><span>营业 ${escape(node.open || '待确认')}</span>${node.publicPhone ? `<span>电话 ${escape(node.publicPhone)}</span>` : '<span>联系信息待确认</span>'}</div><p class="station-capacity">${side === 'origin' ? node.windows.map(w => `${escape(w.timeSlot)} ${w.available ? '余' + w.remaining + '位' : '不可约'}`).join(' · ') || '时段余量待查询' : '到达日期和时段尚待确认，未预占笼位'}</p>` : `<p>${state.loading ? '正在匹配对应城市合作点…' : '该城市暂无可选合作点，请更换城市或改为上门服务。'}</p>`;
        byId(side + '-station-list').innerHTML = nodes.map(item => `<button type="button" data-station="${side}" data-node="${escape(item.id)}" class="station-option${item.id === state[side + 'NodeId'] ? ' is-selected' : ''}" aria-pressed="${item.id === state[side + 'NodeId']}" ${!item.available || state.loading ? 'disabled' : ''}><strong>${escape(item.name)}</strong><small>${escape(item.available ? item.address : item.unavailableReason)}</small></button>`).join('');
      }
      applyContacts();
    }
    function applyContacts() {
      if (byId('booking-slot-title')) byId('booking-slot-title').textContent = usesNode('origin') ? '预约送到合作点时间' : '预约上门接宠时间';
      if (byId('booking-slot-note')) byId('booking-slot-note').textContent = usesNode('origin') ? `请按所选时段自行送宠到合作点。出发点与时段经运营审核、你确认后生效；${usesNode('destination') ? '到点取宠' : '送宠上门'}时间另行确认。` : '请选择方便上门接宠的时段。具体接送安排由运营审核确认，预计运输时效见预估方案。';
      for (const side of fields) {
        const city = value(side === 'origin' ? 'from-city' : 'to-city'), field = byId(side === 'origin' ? 'pickup-address' : 'recipient-address');
        const changed = state.city[side] && state.city[side] !== city;
        if (changed) { state.doors[side] = ''; field.value = ''; }
        state.city[side] = city;
        if (usesNode(side)) {
          if (!field.readOnly) state.doors[side] = field.value;
          field.value = selected(side)?.address || ''; field.readOnly = true; field.required = false;
        } else {
          if (field.readOnly) field.value = state.doors[side] || '';
          field.readOnly = false; field.required = true;
        }
        byId(side + '-address-label').textContent = usesNode(side) ? (side === 'origin' ? '自行送宠合作点地址' : '到达取宠合作点地址') : (side === 'origin' ? '上门接宠详细地址' : '上门送达详细地址');
        const isNode = usesNode(side), node = !state.loading && !state.error ? selected(side) : null;
        byId(side + '-address-field').hidden = isNode;
        byId(side + '-contact-label').textContent = side === 'origin' ? (isNode ? '送宠人姓名' : '寄件联系人') : (isNode ? '取宠人姓名' : '收件联系人');
        byId(side + '-phone-label').textContent = side === 'origin' ? (isNode ? '送宠人联系电话' : '寄件联系电话') : (isNode ? '取宠人联系电话' : '收件联系电话');
        const card = byId(side + '-handoff-card'); card.hidden = !isNode;
        card.innerHTML = !isNode ? '' : node ? `<div class="station-heading"><span class="station-marker ${side}">${side === 'origin' ? '起' : '终'}</span><div><small>${side === 'origin' ? '自行送至合作点' : '派送至合作点 · 自行取宠'}</small><strong>${escape(node.name)}</strong></div></div><p class="station-address">${escape(node.city)} · ${escape(node.address)}</p><div class="station-meta"><span>营业时间 ${escape(node.open || '待确认')}</span><span>网点电话 ${escape(node.publicPhone || '待配置')}</span></div><p class="station-note">网点信息已按上一页选择自动带入。请填写实际${side === 'origin' ? '送宠人' : '取宠人'}的姓名与电话；交接时间及笼位待运营确认。</p>` : '<p>网点信息正在更新或暂不可用，请返回上一页重新选择。</p>';
      }
    }
    async function sync() {
      const key = currentKey(), sequence = ++state.sequence;
      for (const side of fields) if (state.city[side] && state.city[side] !== value(side === 'origin' ? 'from-city' : 'to-city')) state[side + 'NodeId'] = '';
      state.loading = true; state.error = ''; render();
      try {
        const query = new URLSearchParams({ fromCity: value('from-city'), toCity: value('to-city'), travelDate: value('travel-date') });
        const catalog = await api('/api/user/booking-options?' + query);
        if (sequence !== state.sequence || key !== currentKey()) return;
        if (!Array.isArray(catalog.services) || !Array.isArray(catalog.cages) || !Array.isArray(catalog.pets) || !Array.isArray(catalog.originNodes) || !Array.isArray(catalog.destinationNodes)) throw new Error('服务选项不完整，请刷新重试');
        state.catalog = catalog;
        state.catalogKey = key;
        const pet = value('pet-type');
        byId('pet-type').innerHTML = catalog.pets.map(item => `<option value="${escape(item.name)}">${escape(item.name)}${item.manual ? '（人工确认）' : ''}</option>`).join('');
        byId('pet-type').value = catalog.pets.some(item => item.name === pet) ? pet : '猫';
        for (const side of fields) {
          const existing = selected(side);
          state[side + 'NodeId'] = usesNode(side) ? (existing?.available ? existing.id : catalog[side + 'Nodes'].find(node => node.available)?.id || '') : '';
        }
      } catch (error) {
        if (sequence !== state.sequence || key !== currentKey()) return;
        state.error = '合作点与笼型加载失败：' + error.message;
      } finally {
        if (sequence === state.sequence && key === currentKey()) { state.loading = false; render(); }
      }
    }
    function input() {
      return { bookingVersion: 1, cageId: state.cageId, originNodeId: usesNode('origin') ? state.originNodeId : '', destinationNodeId: usesNode('destination') ? state.destinationNodeId : '', travelDate: value('travel-date') };
    }
    function validate() {
      if (state.loading) throw new Error('合作点信息正在更新，请稍候。');
      if (state.error || !state.catalog) throw new Error('请先重新加载合作点与笼型。');
      if (state.catalogKey !== currentKey()) throw new Error('接送资料已变化，请重新匹配合作点。');
      if (!state.catalog.cages.some(cage => cage.id === state.cageId)) throw new Error('请选择笼型或自备笼。');
      for (const side of fields) if (usesNode(side) && !selected(side)?.available) throw new Error(`请选择可用的${side === 'origin' ? '出发送宠' : '到达取宠'}合作点。`);
      if (state.catalog.pets.find(item => item.name === value('pet-type'))?.manual) throw new Error('此类宠物需要运营单独确认适运条件，暂不自动报价或收取宠物运输检疫费。请联系运营咨询。');
    }
    byId('booking-selection').addEventListener('click', event => {
      const cage = event.target.closest('[data-cage]'), point = event.target.closest('[data-station]');
      if (state.loading || !editable()) return;
      if (cage && state.catalog?.cages.some(item => item.id === cage.dataset.cage)) { state.cageId = cage.dataset.cage; onChange(); render(); }
      if (point && fields.includes(point.dataset.station)) {
        const side = point.dataset.station, node = state.catalog?.[side + 'Nodes'].find(item => item.id === point.dataset.node && item.available);
        if (node) { state[side + 'NodeId'] = node.id; point.closest('details')?.removeAttribute('open'); onChange(); render(); }
      }
    });
    byId('booking-options-retry').addEventListener('click', () => { if (editable()) { onChange(); sync(); } });
    byId('pet-type').addEventListener('change', render);
    function filterSlots(slots) {
      if (!usesNode('origin')) return slots;
      return slots.map(slot => {
        const window = selected('origin')?.windows.find(item => item.timeSlot === slot.timeSlot);
        const remaining = Math.max(0, Math.min(Number(slot.remaining) || 0, Number(window?.remaining) || 0));
        return { ...slot, remaining, available: slot.available !== false && Boolean(window?.available) && remaining > 0 };
      });
    }
    return { sync, input, validate, applyContacts, filterSlots, reset() { state.cageId = 'cage-1'; state.originNodeId = ''; state.destinationNodeId = ''; state.doors = {}; state.city = {}; fields.forEach(side => { byId(side === 'origin' ? 'pickup-address' : 'recipient-address').readOnly = false; }); return sync(); } };
  }
  window.PaichongBookingSelection = { mount, markup, confirmationMarkup };
})();
