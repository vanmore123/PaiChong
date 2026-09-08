(() => {
  'use strict';
  const escape = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Demo-only UI. A real device adapter must later enforce order access on the server.
  const available = (order) => ['in_transit', 'arrived'].includes(order?.fulfillment?.stage);
  function markup(order) {
    if (!available(order)) return '';
    return `<section class="cabin-entry"><div><span class="cabin-eyebrow">陪伴每一程 · 模拟演示</span><h3>想看看毛孩子？</h3><p>查看车内环境，让等待多一份安心</p></div><button type="button" class="primary-button" data-open-cabin><svg class="ui-icon" aria-hidden="true"><use href="./assets/v5/icons/app-sprite.svg#icon-camera"></use></svg>查看车内监控</button></section>`;
  }
  function bind(container, order) {
    container.querySelector('[data-open-cabin]')?.addEventListener('click', (event) => open(order, event.currentTarget));
  }
  function open(order, trigger) {
    if (!available(order) || document.querySelector('.cabin-dialog')) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'cabin-dialog';
    dialog.setAttribute('aria-labelledby', 'cabin-title');
    dialog.innerHTML = `<header class="cabin-header"><div><span class="cabin-eyebrow">安心陪伴</span><h2 id="cabin-title">车内监控</h2></div><button type="button" data-close aria-label="关闭车内监控">✕</button></header>
      <p class="cabin-order">订单 ${escape(order.id)} · ${escape(order.pet?.name || '毛孩子')}</p>
      <div class="cabin-warning">模拟画面 · 未连接摄像头，不代表本单宠物实况</div>
      <div class="cabin-feed" role="img" aria-label="宠物舱示意动画，不是真实监控"><div class="cabin-feed-label"><span>DEMO · <b data-view-label>宠物舱全景</b></span><span data-play-state>模拟播放中</span></div>
        <div class="cabin-window"></div><div class="cabin-crates"><div class="cabin-crate"><svg aria-hidden="true"><use href="./assets/v5/icons/app-sprite.svg#icon-cat"></use></svg><span>示意笼位 A</span></div><div class="cabin-crate"><svg aria-hidden="true"><use href="./assets/v5/icons/app-sprite.svg#icon-dog"></use></svg><span>示意笼位 B</span></div></div><span class="cabin-watermark">派宠一号 / 演示动画</span></div>
      <div class="cabin-views" aria-label="模拟摄像头视角"><button type="button" data-view="wide" aria-pressed="true">01 · 宠物舱全景</button><button type="button" data-view="near" aria-pressed="false">02 · 笼位近景</button></div>
      <div class="cabin-controls"><button type="button" data-pause>暂停模拟画面</button><button type="button" data-expand aria-pressed="false">放大画面</button></div>
      <div class="cabin-note"><strong>现在看到的是演示，不是直播</strong><p>两个视角均为预设示意动画，无实时声音、录像或传感器数据。后续确定设备后，再接入真实视频与订单权限。</p></div>`;
    document.body.append(dialog);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.addEventListener('close', () => { document.body.style.overflow = oldOverflow; dialog.remove(); if (trigger?.isConnected) trigger.focus(); }, { once: true });
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    dialog.querySelectorAll('[data-view]').forEach((button) => { button.onclick = () => {
      dialog.querySelectorAll('[data-view]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      dialog.querySelector('.cabin-feed').classList.toggle('is-near', button.dataset.view === 'near');
      dialog.querySelector('[data-view-label]').textContent = button.dataset.view === 'near' ? '笼位近景' : '宠物舱全景';
    }; });
    dialog.querySelector('[data-pause]').onclick = (event) => {
      const paused = dialog.querySelector('.cabin-feed').classList.toggle('is-paused');
      event.currentTarget.textContent = paused ? '继续模拟播放' : '暂停模拟画面';
      dialog.querySelector('[data-play-state]').textContent = paused ? '已暂停' : '模拟播放中';
    };
    dialog.querySelector('[data-expand]').onclick = (event) => {
      const expanded = dialog.classList.toggle('is-expanded');
      event.currentTarget.setAttribute('aria-pressed', String(expanded));
      event.currentTarget.textContent = expanded ? '还原画面' : '放大画面';
    };
    dialog.showModal();
  }
  window.PaichongCabinMonitor = { available, markup, bind };
})();
