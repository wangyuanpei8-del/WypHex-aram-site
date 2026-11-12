/* 海斗助手：左边英雄列表，右边该英雄的海克斯胜率排名和推荐出装。数据来自 window.HEX_DATA（data/data.js）。 */
(function () {
  'use strict';

  const D = window.HEX_DATA;
  const $ = s => document.querySelector(s);
  if (!D || !Array.isArray(D.heroes)) { $('#detail').innerHTML = '<div class="empty">数据文件 data/data.js 未加载。</div>'; return; }
  const HEROES = D.heroes;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = n => (n == null ? '—' : Number(n).toFixed(1) + '%');
  const wan = n => (n == null ? '' : n >= 10000 ? (n / 10000).toFixed(1) + '万' : String(n));
  const norm = s => String(s || '').toLowerCase().replace(/[\s·・.]/g, '');
  const LOW = 1000; // 搭配场次少于这个数的标橙色，提醒样本少

  const fromCatalog = new URLSearchParams(location.hash.slice(1)).get('from') === 'catalog';
  const catalogRole = new URLSearchParams(location.hash.slice(1)).get('role') || 'fighter';
  const catalogReturn = 'heroes.html?return=1#role=' + encodeURIComponent(catalogRole);
  const state = { q: '', hero: HEROES[0].name, rar: '全部' };

  /* ---------- 图标：本地图片 → 腾讯 CDN → 文字 ---------- */
  function ava(h, cls) {
    const fb = esc(h.name.slice(0, 1));
    if (!h.key) return `<span class="ava ${cls || ''}">${fb}</span>`;
    return `<span class="ava ${cls || ''}" data-fb="${fb}"><img src="${esc((window.HEX_ICONS && window.HEX_ICONS[h.key]) || `assets/icons/champ/${h.key}.png`)}" data-alt="https://game.gtimg.cn/images/lol/act/img/champion/${esc(h.key)}.png" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`;
  }
  // 图标按名称查找，忽略空格和标点
  const ik = n => String(n).replace(/[\s·・!！?？:：,，.。'"“”（）()]/g, '').toLowerCase();
  const icMap = m => new Map(Object.entries(m || {}).map(([k, v]) => [ik(k), v]));
  const AUG_IC = icMap(window.HEX_AUG_ICONS), ITEM_IC = icMap(window.HEX_ITEM_ICONS);
  const AUG_DESC = icMap(window.HEX_AUG_DESCRIPTIONS);
  const AUG_META = icMap(window.HEX_AUG_DESCRIPTION_META);
  const augDescription = n => AUG_DESC.get(ik(n)) || 'Hexdata 的效果描述暂未收录，可查看原页面。';
  const augIc = (n, r) => {
    const u = AUG_IC.get(ik(n));
    return u ? `<span class="ic-wrap aug-icon r-${esc(r)}"><img class="ic" src="${esc(u)}" alt="" loading="lazy"></span>` : `<span class="rar aug-icon ${esc(r || '未知')}"></span>`;
  };
  const itemIc = n => { const u = ITEM_IC.get(ik(n)); return u ? `<img class="ic" src="${esc(u)}" alt="" loading="lazy">` : ''; };
  document.addEventListener('error', e => {
    const img = e.target;
    if (img.tagName !== 'IMG') return;
    if (img.dataset.alt) { const a = img.dataset.alt; delete img.dataset.alt; img.src = a; return; }
    const box = img.parentElement;
    if (box && box.classList.contains('ava')) box.textContent = box.dataset.fb || '';
    else img.remove();
  }, true);

  /* ---------- 海克斯说明：统一浮层，只响应图标和名称 ---------- */
  const tooltip = document.createElement('aside');
  tooltip.className = 'aug-tooltip';
  tooltip.id = 'aug-tooltip';
  tooltip.hidden = true;
  tooltip.setAttribute('aria-label', '海克斯效果描述');
  document.body.append(tooltip);
  let activeInfo = null, pinnedInfo = null;
  function hideAugTooltip() {
    if (activeInfo) { activeInfo.removeAttribute('aria-describedby'); activeInfo.setAttribute('aria-expanded', 'false'); }
    tooltip.hidden = true;
    activeInfo = pinnedInfo = null;
  }
  function positionTooltip() {
    if (!activeInfo || tooltip.hidden) return;
    const box = activeInfo.getBoundingClientRect();
    const rect = tooltip.getBoundingClientRect(), gap = 10, margin = 12;
    const left = Math.max(margin, Math.min(box.left - 8, innerWidth - rect.width - margin));
    const below = box.bottom + gap;
    const top = below + rect.height <= innerHeight - margin ? below : Math.max(margin, box.top - rect.height - gap);
    tooltip.style.left = left + 'px'; tooltip.style.top = top + 'px';
  }
  function showAugTooltip(info) {
    if (activeInfo && activeInfo !== info) hideAugTooltip();
    activeInfo = info;
    const name = info.dataset.aug;
    const meta = AUG_META.get(ik(name));
    const verification = !meta || meta.status === 'unknown' ? '版本待核对' : meta.status === 'missing' ? '描述待补齐' : meta.status === 'outdated' ? `旧版描述 · ${meta.patch || '未知版本'}，请以游戏内为准` : `已核对 · ${D.meta.patch} · ${meta.date || '日期未知'}`;
    tooltip.innerHTML = `<div class="aug-tooltip-head"><strong>${esc(name)}</strong><span>${esc(info.dataset.rarity)}</span></div><p>${esc(augDescription(name))}</p><div class="aug-verification">${esc(verification)}</div>`;
    tooltip.hidden = false;
    info.setAttribute('aria-describedby', tooltip.id); info.setAttribute('aria-expanded', 'true');
    positionTooltip();
  }
  function triggerInfo(target) {
    const trigger = target.closest('.aug-info, .aug-icon');
    return trigger?.closest('.aug-row')?.querySelector('.aug-info');
  }
  document.addEventListener('pointerover', e => {
    if (e.pointerType === 'touch') return;
    const info = triggerInfo(e.target);
    if (info && activeInfo !== info) showAugTooltip(info);
  });
  document.addEventListener('pointerout', e => {
    if (e.pointerType === 'touch') return;
    const trigger = e.target.closest('.aug-info, .aug-icon');
    if (!trigger) return;
    if (e.relatedTarget && trigger.contains(e.relatedTarget)) return;
    hideAugTooltip();
  });
  document.addEventListener('focusin', e => {
    if (e.target.matches('.aug-info')) showAugTooltip(e.target);
    else if (!tooltip.contains(e.target)) hideAugTooltip();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideAugTooltip(); });
  document.addEventListener('scroll', hideAugTooltip, true);
  window.addEventListener('resize', hideAugTooltip);

  /* ---------- 左边：英雄列表（按胜率） ---------- */
  function renderList() {
    const q = norm(state.q);
    const list = HEROES.filter(h => !q || norm(h.name + h.title + (h.aliases || '') + (h.key || '')).includes(q));
    $('#list').innerHTML = list.length ? list.map(h => `
      <button class="row" data-hero="${esc(h.name)}" aria-selected="${h.name === state.hero}">
        ${ava(h)}<span class="nm"><b>${esc(h.name)}</b><small>${esc(h.title)}</small></span>
        <span class="num wr">${pct(h.wr)}</span>
      </button>`).join('') : '<div class="empty">没有匹配的英雄</div>';
  }

  /* ---------- 右边：海克斯胜率排名 + 推荐出装 ---------- */
  function renderDetail() {
    hideAugTooltip();
    const h = HEROES.find(x => x.name === state.hero) || HEROES[0];
    const rars = ['全部', '棱彩', '黄金', '白银'];
    const augs = h.augs.filter(a => state.rar === '全部' || a.r === state.rar).slice(0, 20);
    $('#detail').innerHTML = `
      ${fromCatalog ? `<a class="detail-from-catalog" href="${esc(catalogReturn)}">← 返回英雄分类</a>` : ''}
      <button class="btn back" data-back>← 返回</button>
      <div class="hero-head">
        ${ava(h, 'lg')}
        <div><h1>${esc(h.name)}<small>${esc(h.title)}</small></h1>
          <p class="sub">胜率 <b class="num">${pct(h.wr)}</b> · ${wan(h.games)}场${h.url ? ` · <a href="${esc(h.url)}" target="_blank" rel="noopener">Hexdata 原页面 ↗</a>` : ''}</p></div>
      </div>
      <div class="data-freshness"><span>英雄榜单：${esc(D.meta.date || '未知')}</span><span>该英雄详情：${esc(h.detailDate || '日期未知')}${h.detailDate !== D.meta.date ? ' · 待更新' : ''}</span><span>海克斯搭配数据：${esc(h.freshness?.oldest || '未知')} ～ ${esc(h.freshness?.newest || '未知')}${h.freshness?.old ? ` · ${h.freshness.old} 项为较早数据` : ''}${h.freshness?.unknown ? ` · ${h.freshness.unknown} 项日期未知` : ''}</span></div>
      ${!h.augs.length ? '<div class="card"><p class="empty">这位英雄的数据还在自动补充中（Hexdata 有访问频率限制，每小时补一批），稍后再看。</p></div>' : `
      <div class="card">
        <h3>海克斯胜率排名 <em>这位英雄带该海克斯时的胜率 · 悬停图标或名称查看效果</em></h3>
        <div class="tabs">${rars.map(r => `<button data-rar="${r}" aria-selected="${state.rar === r}">${r === '全部' ? '' : `<span class="rar ${r}"></span>`}${r}</button>`).join('')}</div>
        <p class="coverage-note">${h.coverage === 'visible-table' ? `来源可见表共 ${h.sourceCount} 个搭配，按胜率排序，当前显示 ${augs.length} 个（最多 20 个）。` : `当前只同步了精选摘要及部分搭配，显示 ${augs.length} 个；尚未同步完整可见表。`}</p>
        <ol class="rank">${augs.map((a, i) => `<li class="aug-row">
          <span class="n num">${i + 1}</span>${augIc(a.n, a.r)}<span class="t"><button class="aug-info" type="button" data-aug="${esc(a.n)}" data-rarity="${esc(a.r)}" aria-label="${esc(a.n)}：查看效果描述">${esc(a.n)}</button></span>
          <span class="w num">${pct(a.w)}</span><span class="g num${a.g < LOW ? ' low' : ''}">${wan(a.g)}场</span></li>`).join('') || '<li class="empty">这个稀有度暂无数据</li>'}</ol>
      </div>
      <div class="card">
        <h3>推荐出装 <em>Hexdata 综合推荐 · 数据日期 ${esc(h.detailDate || '未知')}</em></h3>
        <ol class="rank items">${h.items.map((it, i) => `<li>
          <span class="n num">${i + 1}</span>${itemIc(it.n)}<span class="t">${esc(it.n)}</span>
          <span class="w num">${pct(it.w)}</span><span class="g num${it.g < LOW ? ' low' : ''}">${wan(it.g)}场</span></li>`).join('')}</ol>
      </div>`}`;
  }

  /* ---------- 浅色 / 深色：默认跟随系统，点按钮切换并记在本机 ---------- */
  const isLight = () => (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')) === 'light';
  try { const t = localStorage.getItem('hexaram.theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* 忽略 */ }
  function toggleTheme() {
    const t = isLight() ? 'dark' : 'light';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('hexaram.theme', t); } catch (e) { /* 忽略 */ }
    renderMeta();
  }

  function renderMeta() {
    $('#meta').innerHTML = `<span>版本 <b>${esc(D.meta.patch)}</b></span><span>英雄榜单日期 <b>${esc(D.meta.date)}</b></span><button class="theme" data-theme-toggle>${isLight() ? '☾ 深色' : '☀ 浅色'}</button>`;
    $('#foot').innerHTML = `<span>数据来源：<a href="https://hexdata.com.cn" target="_blank" rel="noopener">Hexdata（hexdata.com.cn）</a>，统计的是公开对局样本，自动更新。场次标橙色的样本少于 ${LOW} 场，仅供参考。</span><span>非官方工具，与 Riot Games 无关联</span>`;
  }

  function select(name) {
    state.hero = name;
    history.replaceState(null, '', '#hero=' + encodeURIComponent(name) + (fromCatalog ? '&from=catalog&role=' + encodeURIComponent(catalogRole) : ''));
    renderDetail(); renderList();
    if (matchMedia('(max-width: 860px)').matches) { document.body.classList.add('sheet'); $('#detail').scrollTop = 0; }
  }

  document.addEventListener('click', e => {
    const info = e.target.closest('.aug-info');
    if (info) {
      if (pinnedInfo === info) hideAugTooltip();
      else { showAugTooltip(info); if (!matchMedia('(hover: hover)').matches) pinnedInfo = info; }
      return;
    }
    if (!e.target.closest('.aug-tooltip')) hideAugTooltip();
    const t = e.target.closest('[data-hero],[data-rar],[data-back],[data-theme-toggle]');
    if (!t) return;
    if (t.hasAttribute('data-theme-toggle')) { toggleTheme(); return; }
    if (t.dataset.hero) select(t.dataset.hero);
    else if (t.dataset.rar) { state.rar = t.dataset.rar; renderDetail(); }
    else document.body.classList.remove('sheet');
  });
  $('#search').addEventListener('input', e => { state.q = e.target.value; renderList(); });

  const initialHero = new URLSearchParams(location.hash.slice(1)).get('hero');
  const validHero = HEROES.some(h => h.name === initialHero);
  if (validHero) state.hero = initialHero;
  renderMeta(); renderList(); renderDetail();
  if (fromCatalog) document.body.classList.add('from-catalog');
  if (validHero && matchMedia('(max-width: 860px)').matches) document.body.classList.add('sheet');
  if (validHero) requestAnimationFrame(() => {
    if (matchMedia('(max-width: 860px)').matches) $('#detail').scrollTop = 0;
    else $('#detail').scrollIntoView({block:'start'});
  });
})();
