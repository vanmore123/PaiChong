(() => {
  'use strict';
  const escape = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Demo-only UI; a future device adapter must enforce order access server-side.
  const available = (order) => ['in_transit', 'arrived'].includes(order?.fulfillment?.stage);
  const views = {
    wide: { name: '宠物舱全景', image: './assets/v5/monitor/cabin-wide-v2.jpg' },
    near: { name: '笼位近景', image: './assets/v5/monitor/cabin-near-v2.jpg' }
  };
  const petName = (order) => order?.pet?.name || order?.petName || '毛孩子';
  function equipment(order, view='wide') {
    const seed=String(order.routeId || order.transport?.routeId || order.id || '1001');
    const suffix=String([...seed].reduce((sum,c)=>(sum*31+c.charCodeAt(0))%9000,0)+1000);
    const hub=order.fromCity==='合肥'||order.transport?.cities?.includes('合肥')?'HF':'PC';
    return {terminal:`PC-${hub}-${suffix}`,channel:view==='near'?'02':'01',vehicle:order.transport?.vehiclePlate || '车辆待关联',location:view==='near'?'笼位近景':'宠物舱前侧'};
  }
  function markup(order) {
    if (!available(order)) return '';
    return `<section class="cabin-entry"><div><span class="cabin-eyebrow">陪伴每一程</span><h3>想看看毛孩子？</h3><p>查看车内环境，让等待多一份安心</p></div><button type="button" class="primary-button" data-open-cabin><svg class="ui-icon" aria-hidden="true"><use href="./assets/v5/icons/app-sprite.svg#icon-camera"></use></svg>查看车内监控</button></section>`;
  }
  function bind(container, order) {
    container.querySelector('[data-open-cabin]')?.addEventListener('click', (event) => open(order, event.currentTarget));
  }
  function open(order, trigger) {
    if (!available(order) || document.querySelector('.cabin-dialog')) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'cabin-dialog';
    dialog.setAttribute('aria-labelledby', 'cabin-title');
    dialog.setAttribute('aria-describedby', 'cabin-disclaimer');
    const device=equipment(order);
    dialog.innerHTML = `<header class="cabin-header"><div><span class="cabin-eyebrow">安心陪伴</span><h2 id="cabin-title">车内监控</h2></div><button type="button" data-close aria-label="关闭车内监控">✕</button></header>
      <p class="cabin-order"><strong>${escape(petName(order))}的行程</strong><span>订单 ${escape(order.id)}</span></p>
      <div class="cabin-equipment"><span class="cabin-equipment-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="./assets/v5/icons/app-sprite.svg#icon-camera"></use></svg></span><div><strong>${escape(device.vehicle)}<span>车载双通道</span></strong><small><span data-device-id>${escape(device.terminal)} / CH 01</span> · <span data-device-location>${device.location}</span></small></div><span class="cabin-definition">1080P</span></div>
      <div class="cabin-player"><div class="cabin-feed"><img class="cabin-image" src="${views.wide.image}" alt="宠物舱全景示例" /><div class="cabin-feed-label"><span data-view-label>01 / 宠物舱全景</span><span>演示画面</span></div><div class="cabin-image-error" role="status" hidden>画面暂未加载，请切换视角重试</div><span class="cabin-pause-overlay" hidden>已暂停</span><span class="cabin-watermark">PAICHONG · CABIN</span></div>
      <div class="cabin-playback"><span data-play-state>播放中</span><div class="cabin-progress" aria-hidden="true"><i></i></div><span>无声音</span></div></div>
      <div class="cabin-views" aria-label="摄像头视角"><button type="button" data-view="wide" aria-pressed="true"><small>CAM 01</small>宠物舱全景</button><button type="button" data-view="near" aria-pressed="false"><small>CAM 02</small>笼位近景</button></div>
      <div class="cabin-controls"><button type="button" data-pause aria-pressed="false">暂停画面</button><button type="button" data-expand aria-pressed="false">放大画面</button></div>
      <p class="cabin-note" id="cabin-disclaimer">设备资料与画面为示例，非本单实时监控。</p>`;
    document.body.append(dialog);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.addEventListener('close', () => { document.body.style.overflow = oldOverflow; dialog.remove(); if (trigger?.isConnected) trigger.focus(); }, { once: true });
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    const picture = dialog.querySelector('.cabin-image');
    const imageError = dialog.querySelector('.cabin-image-error');
    picture.onerror = () => { imageError.hidden = false; };
    picture.onload = () => { imageError.hidden = true; };
    dialog.querySelectorAll('[data-view]').forEach((button) => { button.onclick = () => {
      const view = views[button.dataset.view];
      dialog.querySelectorAll('[data-view]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      imageError.hidden = true;
      picture.src = view.image;
      picture.alt = `${view.name}示例`;
      dialog.querySelector('[data-view-label]').textContent = `${button.dataset.view === 'near' ? '02' : '01'} / ${view.name}`;
      const selected=equipment(order,button.dataset.view);
      dialog.querySelector('[data-device-id]').textContent=`${selected.terminal} / CH ${selected.channel}`;
      dialog.querySelector('[data-device-location]').textContent=selected.location;
    }; });
    dialog.querySelector('[data-pause]').onclick = (event) => {
      const paused = dialog.querySelector('.cabin-player').classList.toggle('is-paused');
      event.currentTarget.textContent = paused ? '继续播放' : '暂停画面';
      event.currentTarget.setAttribute('aria-pressed', String(paused));
      dialog.querySelector('.cabin-pause-overlay').hidden = !paused;
      dialog.querySelector('[data-play-state]').textContent = paused ? '已暂停' : '播放中';
    };
    dialog.querySelector('[data-expand]').onclick = (event) => {
      const expanded = dialog.classList.toggle('is-expanded');
      event.currentTarget.setAttribute('aria-pressed', String(expanded));
      event.currentTarget.textContent = expanded ? '还原画面' : '放大画面';
    };
    dialog.showModal();
  }
  window.PaichongCabinMonitor = { available, markup, bind, petName, views, equipment };
})();
