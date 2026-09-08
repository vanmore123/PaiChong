(() => {
  'use strict';
  const MAX_BYTES = 4 * 1024 * 1024;
  const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
  const TITLES = { petPhoto: '宠物近期照', vaccineCertificate: '疫苗记录', standingPhoto: '补充站立照' };
  const PICTURES = { orange: './assets/v5/avatars/pet-orange-v1.jpg', silver: './assets/v5/avatars/pet-silver-v1.jpg', corgi: './assets/v5/avatars/pet-corgi-v1.jpg' };
  const esc = (text = '') => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enabled = () => window.PAICHONG_DEMO_MODE === true;
  const kindOf = kind => kind === 'vaccineProof' ? 'vaccineCertificate' : Object.hasOwn(TITLES, kind) ? kind : 'petPhoto';
  const session = () => window.PaichongSession?.read?.() || null;
  const ownerOf = order => String(order?.ownerAccount || order?.userPhone || order?.phone || '');
  const petOf = order => order?.pet || { name: order?.petName, type: order?.petType, breed: order?.breed };
  const cleanName = value => String(value || '材料').replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, 90);
  const authorizedOrders = new WeakMap();
  let active = null;

  function parse(ref) {
    const raw = String(ref || '');
    const sampleMatch = /^sample-material:v1:(petPhoto|vaccineCertificate|standingPhoto):(orange|silver|corgi):([^:]*)$/.exec(raw);
    const localMatch = /^local-material:([a-z0-9-]{16,64}):([^:]*)$/.exec(raw);
    try {
      if (sampleMatch) return { mode: 'sample', kind: sampleMatch[1], picture: sampleMatch[2], name: cleanName(decodeURIComponent(sampleMatch[3])) };
      if (localMatch) return { mode: 'local', id: localMatch[1], name: cleanName(decodeURIComponent(localMatch[2])) };
    } catch { /* Malformed saved references are treated as unavailable legacy material. */ }
    return { mode: raw ? 'legacy' : 'empty', name: cleanName(raw || '未提供') };
  }
  function sample(kind, pet = {}) {
    const picture = /犬|狗/.test(pet.type || '') ? 'corgi' : /英短|英国短毛/.test(pet.breed || '') ? 'silver' : 'orange';
    return `sample-material:v1:${kindOf(kind)}:${picture}:${encodeURIComponent(cleanName(pet.name || '毛孩子'))}`;
  }
  function label(ref) {
    const data = parse(ref);
    return data.mode === 'sample' ? `${data.name} · ${TITLES[data.kind]}（示例）` : data.mode === 'empty' ? '未提供' : data.name;
  }
  async function validateFile(file, kind = 'petPhoto') {
    if (!file || typeof file.arrayBuffer !== 'function') throw new Error('没有读取到文件，请重新选择。');
    if (!file.size || file.size > MAX_BYTES) throw new Error('请选择不超过 4 MB 的文件。');
    if (!Object.hasOwn(TYPES, file.type) || (kindOf(kind) !== 'vaccineCertificate' && file.type === 'application/pdf')) throw new Error(kindOf(kind) === 'vaccineCertificate' ? '支持 JPG、PNG、WebP 图片或 PDF，不支持 SVG。' : '请选择 JPG、PNG 或 WebP 图片，不支持 SVG。');
    let bytes;
    try { bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer()); } catch { throw new Error('文件读取失败，请重新选择或使用示例材料。'); }
    const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
    const valid = file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : file.type === 'image/png' ? bytes[0] === 137 && ascii(1, 4) === 'PNG' && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10
        : file.type === 'image/webp' ? ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' : ascii(0, 5) === '%PDF-';
    if (!valid) throw new Error('文件内容与格式不一致，请换一份可正常打开的图片或 PDF。');
    return { name: cleanName(file.name), type: file.type, size: file.size };
  }
  function database() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('当前浏览器无法保存本地材料，请使用示例材料。')); return; }
      const request = window.indexedDB.open('paichong-materials-v1', 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('files')) request.result.createObjectStore('files', { keyPath: 'id' }); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = request.onblocked = () => reject(new Error('本地材料库不可用，请关闭其他旧页面重试或使用示例。'));
    });
  }
  async function record(action, value) {
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('files', action === 'get' ? 'readonly' : 'readwrite');
        const request = tx.objectStore('files')[action](value);
        let result;
        request.onsuccess = () => { result = request.result; };
        tx.oncomplete = () => resolve(result);
        tx.onerror = tx.onabort = () => reject(new Error('本地保存失败，可能空间不足。请换小一些的文件或使用示例。'));
      });
    } finally { db.close(); }
  }
  async function saveFile(file, options = {}) {
    const auth = session();
    if (!enabled() || auth?.role !== 'user' || !auth.account || (options.account && options.account !== auth.account)) throw new Error('请在当前用户账号下选择材料。');
    const meta = await validateFile(file, options.kind);
    window.PaichongSession?.assertCurrent?.(auth.token);
    const id = window.crypto.randomUUID();
    await record('put', { id, ...meta, kind: kindOf(options.kind), ownerAccount: auth.account, blob: file, createdAt: new Date().toISOString() });
    window.PaichongSession?.assertCurrent?.(auth.token);
    return `local-material:${id}:${encodeURIComponent(meta.name)}`;
  }
  function canView(order) {
    const auth = session();
    const verified = order && authorizedOrders.get(order);
    return enabled() && Boolean(auth?.token && order?.id && (auth.role === 'ops' || auth.role === 'user' && ownerOf(order) === auth.account || ['driver', 'partner'].includes(auth.role) && verified?.token === auth.token && verified.owner === ownerOf(order) && verified.refs === JSON.stringify(references(order))));
  }
  function references(order) {
    const materials = order?.materials || {};
    return [['petPhoto', materials.petPhoto], ['vaccineCertificate', materials.vaccineCertificate || materials.vaccineProof], ['standingPhoto', materials.standingPhoto]].filter(([, ref]) => Boolean(ref));
  }
  function markup(order) {
    const auth = session();
    if (enabled() && auth?.token && order?.id && ['driver', 'partner'].includes(auth.role) && !canView(order)) return `<section class="material-section mp-section" data-material-pending="${esc(order.id)}" aria-label="订单材料"><h3>出行材料</h3><p class="mp-caption" role="status">正在核对材料查看权限…</p></section>`;
    if (!canView(order)) return '';
    return `<section class="material-section mp-section" aria-label="订单材料"><h3>出行材料</h3><div class="mp-list">${references(order).map(([kind, ref]) => `<button class="mp-material" type="button" data-material-key="${kind}"><span class="mp-file-icon" aria-hidden="true"><svg width="22" height="22"><use href="./assets/v5/icons/app-sprite.svg#icon-${kind === 'vaccineCertificate' ? 'file-check' : 'image'}"></use></svg></span><span class="mp-file-copy"><strong>${TITLES[kind]}</strong><small>${esc(label(ref))}</small></span><span class="mp-action">${parse(ref).mode === 'legacy' ? '查看说明' : '预览'}</span></button>`).join('') || '<p class="mp-empty">暂未添加材料</p>'}</div><p class="mp-caption">本地文件仅保存在当前浏览器；更换设备后需重新选择。</p></section>`;
  }
  function close() {
    if (!active) return;
    const old = active; active = null;
    if (old.url) URL.revokeObjectURL(old.url);
    old.cover.remove(); document.body.style.overflow = old.overflow;
    document.removeEventListener('keydown', old.keydown, true);
    if (old.trigger?.isConnected) old.trigger.focus();
  }
  function frame(title, trigger) {
    close();
    const cover = document.createElement('div'); cover.className = 'mp-backdrop';
    cover.innerHTML = `<section class="mp-dialog" role="dialog" aria-modal="true" aria-labelledby="mp-title"><header><div><small>出行材料</small><h2 id="mp-title">${esc(title)}</h2></div><button class="mp-close" type="button" aria-label="关闭材料预览">×</button></header><div class="mp-content" role="status">正在读取材料…</div><footer>体验材料不作为真实健康、免疫或承运凭证。</footer></section>`;
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key !== 'Tab') return;
      const buttons = [...cover.querySelectorAll('button, a[href], iframe')].filter(item => !item.disabled && !item.hidden);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    active = { cover, trigger: trigger || document.activeElement, overflow: document.body.style.overflow, keydown, authToken: session()?.token };
    document.body.append(cover); document.body.style.overflow = 'hidden';
    cover.querySelector('.mp-close').addEventListener('click', close);
    cover.addEventListener('click', event => { if (event.target === cover) close(); });
    document.addEventListener('keydown', keydown, true);
    cover.querySelector('.mp-close').focus();
    return active;
  }
  function sampleContent(data, pet = {}) {
    if (data.kind === 'vaccineCertificate') return `<article class="mp-vaccine"><span class="mp-example-badge">示例记录 · 非正式证照</span><h3>${esc(pet.name || data.name)}的免疫资料</h3><p>供评审疫苗材料的查看与补件流程。</p><dl><div><dt>宠物信息</dt><dd>${esc(pet.type || '宠物')} · ${esc(pet.breed || '资料待核对')}</dd></div><div><dt>记录项目</dt><dd>核心疫苗 / 狂犬疫苗</dd></div><div><dt>接种与有效日期</dt><dd>示例未填写，实际需核验</dd></div><div><dt>机构与凭证编号</dt><dd>示例未填写，实际需核验</dd></div></dl><p class="mp-vaccine-note">未接入医院记录，没有印章、签名或真实凭证编号。运营可在订单中发起补件。</p></article>`;
    return `<figure class="mp-photo"><img src="${PICTURES[data.picture]}" alt="${esc(pet.name || data.name)}的照片示例" /><figcaption>照片示例 · AI 生成宠物素材${data.kind === 'standingPhoto' ? '；实际补件应为清晰的站立全身照' : ''}</figcaption></figure>`;
  }
  async function open(ref, { order, kind = 'petPhoto', pet = {}, trigger } = {}) {
    if (!enabled()) return;
    if (order && (!canView(order) || !references(order).some(([key, value]) => key === kindOf(kind) && value === ref))) return;
    if (!order && session()?.role !== 'user') return;
    const data = parse(ref), panel = frame(TITLES[kindOf(kind)], trigger), content = panel.cover.querySelector('.mp-content');
    const isCurrent = () => active === panel && session()?.token === panel.authToken;
    if (data.mode === 'sample') { content.innerHTML = sampleContent(data, pet); return; }
    if (data.mode !== 'local') {
      content.innerHTML = `<div class="mp-unavailable"><span class="mp-example-badge">${data.mode === 'empty' ? '未添加材料' : '仅保留文件名'}</span><h3>${esc(data.name)}</h3><p>这份旧记录没有保存原始文件，不能预览原件。可返回补充材料，或查看对应的示例内容。</p><button class="mp-sample-button" type="button">查看对应示例</button></div>`;
      content.querySelector('button').addEventListener('click', () => { content.innerHTML = sampleContent(parse(sample(kind, pet)), pet); });
      return;
    }
    try {
      const saved = await record('get', data.id);
      if (!isCurrent()) return;
      const owner = order ? ownerOf(order) : session()?.account;
      if (!saved?.blob || saved.ownerAccount !== owner || saved.kind !== kindOf(kind) || !Object.hasOwn(TYPES, saved.type)) throw new Error('当前浏览器没有这份材料原件，请由用户重新选择或补充材料。');
      // Force the validated MIME type: a local PDF opens only in the browser's
      // native PDF viewer, never as same-origin HTML. iframe sandbox disables
      // that viewer in Chromium, so only allow this internally-created Blob URL.
      panel.url = URL.createObjectURL(new Blob([saved.blob], { type: saved.type }));
      if (saved.type === 'application/pdf') content.innerHTML = `<p class="mp-local-note">本地 PDF · ${esc(saved.name)} · 未上传至服务器</p><iframe class="mp-pdf" title="本地疫苗材料 PDF" referrerpolicy="no-referrer" src="${panel.url}"></iframe><a class="mp-download" href="${panel.url}" download="${esc(saved.name)}">无法显示？保存本地副本查看</a>`;
      else {
        content.innerHTML = `<figure class="mp-photo"><img src="${panel.url}" alt="${esc(saved.name)}" /><figcaption>本地文件 · 未上传至服务器</figcaption></figure>`;
        content.querySelector('img').addEventListener('error', () => { content.innerHTML = '<p class="mp-unavailable">图片无法解码，请重新选择一份可正常打开的图片。</p>'; });
      }
    } catch (error) { if (isCurrent()) content.innerHTML = `<p class="mp-unavailable" role="alert">${esc(error.message)}</p>`; }
  }
  async function authorizeOrder(order) {
    const auth = session();
    if (!enabled() || !auth?.token || !order?.id || !['driver', 'partner'].includes(auth.role)) throw new Error('当前账号不能查看此材料。');
    const payload = await window.PaichongSession.request(`/api/${auth.role}/orders/${encodeURIComponent(order.id)}`, { expectedToken: auth.token });
    window.PaichongSession.assertCurrent(auth.token);
    const source = payload.order || payload;
    if (source.id !== order.id) throw new Error('订单材料未通过权限核对，请刷新后重试。');
    const verified = JSON.parse(JSON.stringify(source));
    authorizedOrders.set(verified, { token: auth.token, owner: ownerOf(verified), refs: JSON.stringify(references(verified)) });
    return verified;
  }
  async function bind(container, order) {
    const auth = session();
    if (enabled() && ['driver', 'partner'].includes(auth?.role) && !canView(order)) {
      const pending = [...container.querySelectorAll('[data-material-pending]')].find(node => node.dataset.materialPending === order.id);
      if (!pending || pending.dataset.materialLoading) return;
      pending.dataset.materialLoading = 'true';
      try {
        const verified = await authorizeOrder(order);
        if (!pending.isConnected || !container.contains(pending)) return;
        pending.innerHTML = markup(verified);
        return bind(pending, verified);
      } catch (error) { if (pending.isConnected) pending.innerHTML = `<h3>出行材料</h3><p class="mp-caption" role="alert">${esc(error.message || '暂时无法读取材料，请刷新重试。')}</p>`; }
      return;
    }
    if (!canView(order)) return;
    container.querySelectorAll('[data-material-key]').forEach(button => button.addEventListener('click', () => {
      const kind = kindOf(button.dataset.materialKey), ref = references(order).find(([key]) => key === kind)?.[1];
      if (ref) open(ref, { order, kind, pet: petOf(order), trigger: button });
    }));
  }
  if (typeof window.addEventListener === 'function') window.addEventListener('paichong:session-changed', close);
  window.PaichongMaterials = Object.freeze({ enabled, sample, label, parse, validateFile, saveFile, canView, authorizeOrder, markup, bind, close, openDraft: (ref, options) => open(ref, options) });
})();
