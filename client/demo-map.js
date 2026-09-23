(() => {
  'use strict';
  if (window.PAICHONG_DEMO_MODE !== true) return;
  const cities = ['合肥', '武汉', '广州', '郑州', '北京'];
  const areas = { 合肥: ['蜀山片区', '包河片区', '政务片区'], 武汉: ['武昌片区', '江汉片区', '洪山片区'], 广州: ['天河片区', '海珠片区', '越秀片区'], 郑州: ['金水片区', '二七片区', '中原片区'], 北京: ['朝阳片区', '海淀片区', '丰台片区'] };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mapIcon = '<svg class="ui-icon" aria-hidden="true"><use href="./assets/v5/icons/app-sprite.svg#icon-map-pin"></use></svg>';
  function choose({ value = '合肥', allowed = cities, optional = false, onSelect, opener }) {
    if (document.getElementById('demo-map-dialog')) return;
    let city = allowed.includes(value) ? value : allowed[0], point = 0;
    const dialog = document.createElement('dialog'); dialog.id = 'demo-map-dialog'; dialog.className = 'demo-map-dialog'; dialog.setAttribute('aria-labelledby', 'demo-map-title');
    dialog.innerHTML = `<header class="demo-map-header"><div><h2 id="demo-map-title">地图选择城市</h2><p>为毛孩子，选好出发和到达的地方</p></div><button type="button" data-map-close aria-label="关闭模拟地图">×</button></header><div class="demo-map-content"><label class="demo-map-search">${mapIcon}<input type="search" placeholder="搜索城市 / 区域，如合肥" aria-label="搜索城市或区域"/></label><div class="demo-map-cities" aria-label="可选城市"></div><div class="demo-map-canvas" aria-label="城市示意地图，不是真实地理位置"><svg viewBox="0 0 400 265" preserveAspectRatio="none" aria-hidden="true"><rect width="400" height="265" fill="#eef4e9"/><path d="M-10 12L120 85 91 271M250-10L215 96 324 158 420 200" stroke="#dbead8" stroke-width="65" fill="none"/><path d="M-40 227Q123 121 243 200T456 189" stroke="#d3e8ec" stroke-width="31" fill="none"/><path d="M-30 58L410 125M84-15L137 295M295-10L247 275M-10 242L423 42" stroke="#fff" stroke-width="12" fill="none"/><path d="M-30 58L410 125M84-15L137 295M295-10L247 275M-10 242L423 42" stroke="#e8e6d9" stroke-width="2" fill="none"/><rect x="155" y="137" width="50" height="24" rx="6" fill="#e3ecd9"/><rect x="15" y="107" width="57" height="28" rx="6" fill="#e3ecd9"/></svg><span class="demo-map-watermark">模拟地图 · 非真实坐标</span><div class="demo-map-pins"></div><button type="button" class="demo-map-locate" data-map-locate>${mapIcon}模拟定位</button></div><p class="demo-map-feedback" data-map-feedback role="status">点击城市或标记点，确认后带回表单。</p><div class="demo-map-places"></div><div class="demo-map-choice"></div><button type="button" class="primary-button care-full" data-map-confirm>确认城市</button>${optional ? '<button type="button" class="text-button demo-map-clear" data-map-clear>不设置此途经城市</button>' : ''}<p class="demo-map-disclaimer">仅模拟选点交互，未调用定位或地图服务。示意点不用于导航；合作网点以页面实际匹配的信息为准。</p></div>`;
    document.body.append(dialog);
    const render = () => {
      const search = dialog.querySelector('input').value.trim();
      const filtered = allowed.filter(name => [name, ...(areas[name] || [])].some(text => text.includes(search)));
      dialog.querySelector('.demo-map-cities').innerHTML = filtered.length ? filtered.map(name => `<button type="button" data-map-city="${esc(name)}" aria-pressed="${city === name}">${esc(name)}</button>`).join('') : '<span>暂无匹配城市，可试试合肥、武汉。</span>';
      dialog.querySelector('.demo-map-pins').innerHTML = (areas[city] || []).map((name, index) => `<button type="button" class="demo-map-pin pin-${index}" data-map-point="${index}" aria-label="选择${esc(city + name)}示意点" aria-pressed="${point === index}">${mapIcon}<span>${esc(name)}</span></button>`).join('');
      dialog.querySelector('.demo-map-places').innerHTML = (areas[city] || []).map((name, index) => `<button type="button" data-map-point="${index}" aria-pressed="${point === index}">${mapIcon}<span><strong>${esc(city + ' · ' + name)}</strong><small>城市选点示意 · 不是合作网点地址</small></span><b>${point === index ? '✓' : ''}</b></button>`).join('');
      dialog.querySelector('.demo-map-choice').innerHTML = `<span>当前选择</span><strong>${esc(city)}</strong><small>${esc((areas[city] || [])[point] || '')}示意点</small>`;
      dialog.querySelector('[data-map-confirm]').textContent = `确认选择 ${city}`;
    };
    const close = () => { dialog.close(); };
    dialog.addEventListener('close', () => { dialog.remove(); if (opener?.isConnected) opener.focus(); }, { once: true });
    dialog.querySelector('[data-map-close]').addEventListener('click', close);
    dialog.querySelector('input').addEventListener('input', render);
    dialog.addEventListener('click', event => {
      const cityButton = event.target.closest('[data-map-city]'), pointButton = event.target.closest('[data-map-point]');
      if (cityButton) { city = cityButton.dataset.mapCity; point = 0; render(); }
      if (pointButton) { point = Number(pointButton.dataset.mapPoint); render(); }
    });
    dialog.querySelector('[data-map-locate]').addEventListener('click', () => {
      if (!allowed.includes('合肥')) { dialog.querySelector('[data-map-feedback]').textContent = '当前线路不包含合肥，请手动选择可到达城市。'; return; }
      city = '合肥'; point = 0; dialog.querySelector('input').value = ''; render();
      dialog.querySelector('[data-map-feedback]').textContent = '已模拟定位到合肥 · 没有读取设备位置。';
    });
    dialog.querySelector('[data-map-confirm]').addEventListener('click', () => { if (onSelect(city)) close(); });
    dialog.querySelector('[data-map-clear]')?.addEventListener('click', () => { if (onSelect('')) close(); });
    render(); dialog.showModal();
  }
  const ids = new Set(['from-city', 'to-city', 'mini-from-city', 'mini-to-city', 'route-city-start', 'route-city-via-one', 'route-city-via-two', 'route-city-end']);
  const enhanced = new WeakMap();
  function enhance() {
    document.querySelectorAll('select, input[data-demo-city]').forEach(source => {
      if (source.tagName === 'SELECT' && !ids.has(source.id) && source.name !== 'city') return;
      if (source.closest('.demo-map-dialog')) return;
      let button = enhanced.get(source);
      if (!button) {
        button = document.createElement('button'); button.type = 'button'; button.className = 'demo-map-trigger';
        source.classList.add('demo-map-source'); source.hidden = true; source.insertAdjacentElement('afterend', button); enhanced.set(source, button);
        button.addEventListener('click', () => {
          if (source.disabled) return;
          const allowed = source.tagName === 'SELECT' ? [...source.options].map(option => option.value).filter(value => cities.includes(value)) : cities;
          if (!allowed.length) return;
          choose({ value: source.value, allowed, optional: source.tagName === 'SELECT' && [...source.options].some(option => option.value === ''), opener: button, onSelect: city => {
            if (!source.isConnected || source.disabled) return false;
            source.value = city; source.dispatchEvent(new Event('input', { bubbles: true })); source.dispatchEvent(new Event('change', { bubbles: true })); enhance(); return true;
          } });
        });
      }
      const label = `${source.value || '不途经'} · 地图选择`;
      if (button.dataset.label !== label) { button.innerHTML = `${mapIcon}<span>${esc(source.value || '不途经')}</span><small>地图选择</small>`; button.dataset.label = label; button.setAttribute('aria-label', label); }
      if (button.disabled !== source.disabled) button.disabled = source.disabled;
    });
  }
  let queued = false;
  const refresh = () => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; enhance(); }); };
  const start = () => { enhance(); new MutationObserver(refresh).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] }); document.addEventListener('click', refresh); document.addEventListener('input', refresh); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  window.PaichongDemoMap = Object.freeze({ choose });
})();
