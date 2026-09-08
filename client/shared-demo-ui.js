(() => {
  'use strict';
  if (window.PAICHONG_DEMO_MODE !== true) return;
  document.querySelectorAll('[data-static-only]').forEach(node => { node.hidden = false; });
  let dirty = false;
  document.addEventListener('input', () => { dirty = true; }, true);
  function changed(event) {
    if (event.detail?.external === false) return;
    if (document.querySelector('.shared-demo-update')) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'shared-demo-update';
    button.textContent = '有新的订单或余量进度 · 点击更新';
    button.setAttribute('aria-live', 'polite');
    button.style.cssText = 'position:fixed;z-index:1001;left:50%;transform:translateX(-50%);bottom:calc(82px + env(safe-area-inset-bottom));width:min(350px,calc(100% - 32px));min-height:44px;border:1px solid #bfdccd;border-radius:12px;background:#235e4f;color:white;padding:10px 14px;font:13px system-ui;box-shadow:0 4px 18px #24534330';
    button.addEventListener('click', () => {
      if (dirty && !window.confirm('更新页面会放弃当前未提交的表单内容。是否继续？')) return;
      window.location.reload();
    });
    document.body.append(button);
  }
  window.addEventListener('paichong:demo-updated', changed);
})();
