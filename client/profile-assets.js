(() => {
  'use strict';
  const escape = (v = '') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const base = './assets/v5/avatars/';
  const sampleUsers = {
    '13800138000': { name: '小满', city: '合肥', image: base + 'user-lin-v1.jpg', intro: '认真照顾，每一次出发' },
    '13800138001': { name: '阿辰', city: '合肥', image: base + 'user-chen-v1.jpg', intro: '带毛孩子，去看更大的世界' }
  };
  function user(session = {}) {
    if (window.PAICHONG_DEMO_MODE === true && session.role === 'user' && sampleUsers[session.account]) return {...sampleUsers[session.account]};
    return {name: session.role === 'ops' ? '派宠经营者' : session.name || '宠物主人',city:'合肥',image:'',intro:session.role === 'ops' ? '合肥总部 · 运营工作台' : '每一程，都被好好照顾'};
  }
  function pet(order = {}) {
    const data = order.pet || {name:order.petName,type:order.petType,breed:order.breed,weight:order.weight};
    const name = data.name || '毛孩子', type = data.type || '';
    const breed=String(data.breed || '');
    const silver = /英短|英国短毛/.test(breed) || (!breed && ['奶糖','可乐','布丁','糯米','丸子','幸运','小满'].includes(name));
    const image = /犬|狗/.test(type) ? (!breed || /柯基/.test(breed) ? base+'pet-corgi-v1.jpg' : '') : /猫/.test(type) ? (!breed || /英短|英国短毛|中华田园|橘/.test(breed) ? base+(silver?'pet-silver-v1.jpg':'pet-orange-v1.jpg') : '') : '';
    return {name,type,breed:data.breed || '',weight:data.weight ?? '',image};
  }
  function avatar(data, size = 'small') {
    const token = ['small','medium','large'].includes(size) ? size : 'small';
    return `<span class="pc-avatar pc-avatar--${token}" role="img" aria-label="${escape(data.name)}头像"><span aria-hidden="true">${escape(String(data.name || '宠').slice(0,1))}</span>${data.image ? `<img src="${escape(data.image)}" alt="" width="128" height="128" loading="lazy" data-profile-avatar />` : ''}</span>`;
  }
  const petAvatar = (order, size='small') => avatar(pet(order),size);
  function petCard(order) {
    const data=pet(order), parts=[data.breed || data.type, data.weight!==''?`${data.weight} kg`:''].filter(Boolean);
    return `<section class="pc-pet-card" aria-label="宠物资料">${avatar(data,'medium')}<div><span class="pc-profile-eyebrow">毛孩子档案</span><h3>${escape(data.name)}</h3><p>${escape(parts.join(' · ') || '资料待补充')}</p></div><span class="pc-pet-tag">${escape(data.type || '宠物')}</span></section>`;
  }
  function featuredPets(orders, limit = 3) {
    const source = Array.isArray(orders) ? orders : [];
    const count = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 3;
    if (!count) return [];
    const inTransit = order => order?.fulfillment?.stage === 'in_transit';
    const prioritized = source.filter(inTransit).concat(source.filter(order => !inTransit(order)));
    const names = new Set(), candidates = [];
    prioritized.forEach(order => {
      if (!order || typeof order !== 'object') return;
      const name = String(order.pet?.name || order.petName || '').trim();
      if (!name || names.has(name)) return;
      names.add(name);
      candidates.push(order);
    });
    const featured = [], groups = new Set(), selected = new Set();
    candidates.forEach(order => {
      const data = pet(order), group = JSON.stringify([String(data.type).trim(), String(data.breed).trim()]);
      if (featured.length >= count || groups.has(group)) return;
      groups.add(group);
      selected.add(order);
      featured.push(order);
    });
    candidates.forEach(order => {
      if (featured.length < count && !selected.has(order)) featured.push(order);
    });
    return featured;
  }
  if (typeof document !== 'undefined') document.addEventListener('error',event=>{if(event.target?.matches?.('img[data-profile-avatar]'))event.target.hidden=true;},true);
  window.PaichongProfiles = Object.freeze({user,pet,avatar,petAvatar,petCard,featuredPets});
})();
