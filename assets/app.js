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
  const augDescription = n => AUG_DESC.get(ik(n)) || '暂无效果描述，等待数据补充。';
  const augIc = (n, r) => {
    const u = AUG_IC.get(ik(n));
    return u ? `<span class="ic-wrap r-${esc(r)}"><img class="ic" src="${esc(u)}" alt="" loading="lazy"></span>` : `<span class="rar ${esc(r || '未知')}"></span>`;
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
    const h = HEROES.find(x => x.name === state.hero) || HEROES[0];
    const rars = ['全部', '棱彩', '黄金', '白银'];
    const augs = h.augs.filter(a => state.rar === '全部' || a.r === state.rar);
    $('#detail').innerHTML = `
      <button class="btn back" data-back>← 返回</button>
      <div class="hero-head">
        ${ava(h, 'lg')}
        <div><h1>${esc(h.name)}<small>${esc(h.title)}</small></h1>
          <p class="sub">胜率 <b class="num">${pct(h.wr)}</b> · ${wan(h.games)}场${h.url ? ` · <a href="${esc(h.url)}" target="_blank" rel="noopener">Hexdata 原页面 ↗</a>` : ''}</p></div>
      </div>
      ${!h.augs.length ? '<div class="card"><p class="empty">这位英雄的数据还在自动补充中（Hexdata 有访问频率限制，每小时补一批），稍后再看。</p></div>' : `
      <div class="card">
        <h3>海克斯胜率排名 <em>这位英雄带该海克斯时的胜率 · 悬停或点击查看效果</em></h3>
        <div class="tabs">${rars.map(r => `<button data-rar="${r}" aria-selected="${state.rar === r}">${r === '全部' ? '' : `<span class="rar ${r}"></span>`}${r}</button>`).join('')}</div>
        <ol class="rank">${augs.map((a, i) => `<li class="aug-row">
          <span class="n num">${i + 1}</span>${augIc(a.n, a.r)}<span class="t aug-description"><button class="aug-info" type="button" aria-describedby="aug-tip-${i}" aria-expanded="false" aria-label="${esc(a.n)}：查看效果描述">${esc(a.n)}</button><span class="aug-tooltip" id="aug-tip-${i}" role="tooltip">${esc(augDescription(a.n))}</span></span>
          <span class="w num">${pct(a.w)}</span><span class="g num${a.g < LOW ? ' low' : ''}">${wan(a.g)}场</span></li>`).join('') || '<li class="empty">这个稀有度暂无数据</li>'}</ol>
      </div>
      <div class="card">
        <h3>推荐出装 <em>Hexdata 综合推荐 · 胜率 · 场次</em></h3>
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
    $('#meta').innerHTML = `<span>版本 <b>${esc(D.meta.patch)}</b></span><span>数据日 <b>${esc(D.meta.date)}</b></span><button class="theme" data-theme-toggle>${isLight() ? '☾ 深色' : '☀ 浅色'}</button>`;
    $('#foot').innerHTML = `<span>数据来源：<a href="https://hexdata.com.cn" target="_blank" rel="noopener">Hexdata（hexdata.com.cn）</a>，统计的是公开对局样本，自动更新。场次标橙色的样本少于 ${LOW} 场，仅供参考。</span><span>非官方工具，与 Riot Games 无关联</span>`;
  }

  function select(name) {
    state.hero = name;
    history.replaceState(null, '', '#hero=' + encodeURIComponent(name));
    renderDetail(); renderList();
    if (matchMedia('(max-width: 860px)').matches) { document.body.classList.add('sheet'); $('#detail').scrollTop = 0; }
  }

  document.addEventListener('click', e => {
    const info = e.target.closest('.aug-info');
    document.querySelectorAll('.aug-info[aria-expanded="true"]').forEach(b => { if (b !== info) b.setAttribute('aria-expanded', 'false'); });
    if (info) { info.setAttribute('aria-expanded', String(info.getAttribute('aria-expanded') !== 'true')); return; }
    const t = e.target.closest('[data-hero],[data-rar],[data-back],[data-theme-toggle]');
    if (!t) return;
    if (t.hasAttribute('data-theme-toggle')) { toggleTheme(); return; }
    if (t.dataset.hero) select(t.dataset.hero);
    else if (t.dataset.rar) { state.rar = t.dataset.rar; renderDetail(); }
    else document.body.classList.remove('sheet');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.aug-info').forEach(b => b.setAttribute('aria-expanded', 'false'));
      if (document.activeElement?.matches('.aug-info')) document.activeElement.blur();
    }
  });
  $('#search').addEventListener('input', e => { state.q = e.target.value; renderList(); });

  const m = /hero=([^&]+)/.exec(location.hash);
  if (m && HEROES.some(h => h.name === decodeURIComponent(m[1]))) state.hero = decodeURIComponent(m[1]);
  renderMeta(); renderList(); renderDetail();
})();
