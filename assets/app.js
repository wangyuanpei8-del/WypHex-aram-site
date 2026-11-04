/* 海斗助手：榜单 + 搜索 + 详情同屏。数据来自 window.HEX_DATA（data/data.js）。 */
(function () {
  'use strict';

  const D = window.HEX_DATA;
  if (!D || !Array.isArray(D.heroes)) {
    document.getElementById('detail').innerHTML = '<div class="empty">数据文件 data/data.js 未加载。</div>';
    return;
  }
  const HEROES = D.heroes;
  const TOTAL = HEROES.length;
  const AUG_DB = new Map(D.augments.map(a => [a.name, a]));
  const ROLES = ['战士', '法师', '射手', '刺客', '坦克', '辅助'];
  const FAV_KEY = 'hexaram.fav.v1';
  const GRID_X = '28px 1fr 64px 64px';

  // 英雄出装 / 海克斯推荐里出现、但全局榜没有统计的条目
  const ITEM_USE = new Map();
  const ITEM_CNT = new Map();
  HEROES.forEach(h => {
    h.coreItems.forEach(i => { (ITEM_USE.get(i) || ITEM_USE.set(i, []).get(i)).push(h.name); const c = ITEM_CNT.get(i) || { core: 0, alt: 0 }; c.core++; ITEM_CNT.set(i, c); });
    h.altItems.forEach(i => { const u = ITEM_USE.get(i) || ITEM_USE.set(i, []).get(i); if (!u.includes(h.name)) u.push(h.name); const c = ITEM_CNT.get(i) || { core: 0, alt: 0 }; c.alt++; ITEM_CNT.set(i, c); });
  });
  const ITEM_NAMES = new Set(D.items.map(i => i.name));
  const EXT_ITEMS = [...ITEM_USE.entries()].filter(([n]) => !ITEM_NAMES.has(n))
    .map(([name, heroes]) => ({ name, heroes, ...ITEM_CNT.get(name) }))
    .sort((a, b) => b.heroes.length - a.heroes.length || b.core - a.core);
  const AUG_NAMES = new Set(D.augments.map(a => a.name));
  const EXT_AUG_MAP = new Map();
  HEROES.forEach(h => h.augments.forEach(a => {
    if (AUG_NAMES.has(a.name)) return;
    const e = EXT_AUG_MAP.get(a.name) || { name: a.name, rarity: a.rarity, heroes: [], sum: 0 };
    e.heroes.push(h.name); e.sum += a.wr; EXT_AUG_MAP.set(a.name, e);
  }));
  const EXT_AUGS = [...EXT_AUG_MAP.values()].map(e => ({ ...e, avg: e.sum / e.heroes.length, isNew: false }));
  const wrCell = wr => `<span class="${wr >= 53 ? 'hi' : ''}">${pct(wr)}</span>`;

  const $ = sel => document.querySelector(sel);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtWan = n => (n >= 10000 ? (n / 10000).toFixed(n >= 1e6 ? 0 : 1) + '万' : String(n));
  const pct = n => Number(n).toFixed(1) + '%';

  const state = {
    board: 'heroes',
    role: 'ALL',
    sort: 'wr',
    q: '',
    hero: HEROES[0].name,
    openRow: null,
    augRar: 'ALL',
    augSort: 'wr',
    quick: '棱彩',
    itemSort: 'wr',
    fav: loadFav(),
    ddv: null, // Data Dragon 版本号
  };

  function loadFav() {
    try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch (e) { return new Set(); }
  }
  function saveFav() {
    try { localStorage.setItem(FAV_KEY, JSON.stringify([...state.fav])); } catch (e) { /* 忽略 */ }
  }

  /* ---------- 搜索 ---------- */
  function norm(s) { return String(s || '').toLowerCase().replace(/[\s·・.]/g, ''); }
  HEROES.forEach(h => { h._hay = norm([h.name, h.title, h.aliases, h.roles.join('')].join(' ')); });

  function matchScore(h, q) {
    if (!q) return 0;
    const n = norm(h.name), t = norm(h.title);
    if (n === q || t === q) return 100;
    if (n.startsWith(q) || t.startsWith(q)) return 80;
    const al = norm(h.aliases);
    if (h.aliases.toLowerCase().split(/\s+/).some(a => norm(a) === q)) return 70;
    if (al.includes(q)) return 50;
    if (h._hay.includes(q)) return 30;
    return -1;
  }

  function heroList() {
    const q = norm(state.q);
    let list = HEROES.filter(h => {
      if (state.role === 'FAV' && !state.fav.has(h.name)) return false;
      if (ROLES.includes(state.role) && !h.roles.includes(state.role)) return false;
      return !q || matchScore(h, q) >= 0;
    });
    if (q) {
      list.sort((a, b) => matchScore(b, q) - matchScore(a, q) || a.rank - b.rank);
    } else if (state.sort === 'matches') {
      list.sort((a, b) => b.matches - a.matches);
    } else if (state.sort === 'low') {
      list.sort((a, b) => a.wr - b.wr);
    } else {
      list.sort((a, b) => a.rank - b.rank);
    }
    return list;
  }

  /* ---------- 头像：内嵌或本地图片 → 腾讯 CDN（国内快）→ Data Dragon → 文字 ---------- */
  const ICON_SRC = [
    k => (window.HEX_ICONS && window.HEX_ICONS[k]) || `assets/icons/champ/${k}.png`,
    k => `https://game.gtimg.cn/images/lol/act/img/champion/${k}.png`,
    k => state.ddv ? `https://ddragon.leagueoflegends.com/cdn/${state.ddv}/img/champion/${k}.png` : null,
  ];
  function ava(h, cls) {
    const fallback = esc(h.name.slice(0, 1));
    if (!h.key) return `<span class="ava ${cls || ''}">${fallback}</span>`;
    return `<span class="ava ${cls || ''}" data-fb="${fallback}" data-key="${esc(h.key)}"><img src="${esc(ICON_SRC[0](h.key))}" data-try="0" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`;
  }
  document.addEventListener('error', e => {
    const img = e.target;
    const box = img.parentElement;
    if (img.tagName !== 'IMG' || !box || !box.classList.contains('ava')) return;
    for (let i = +img.dataset.try + 1; i < ICON_SRC.length; i++) {
      const next = ICON_SRC[i](box.dataset.key);
      if (next) { img.dataset.try = i; img.src = next; return; }
    }
    box.textContent = box.dataset.fb || '';
  }, true);

  // Data Dragon 版本号（头像备用源）+ 装备与海克斯图标对照表（按中文名匹配，缓存 3 天）
  const IC_KEY = 'hexaram.icmap.v1';
  const nk = s => String(s || '').replace(/[\s·・：:！!，,。.]/g, '').toLowerCase();
  state.itemIc = {}; state.augIc = {};
  async function loadIconMaps() {
    try {
      const c = JSON.parse(localStorage.getItem(IC_KEY) || 'null');
      if (c && Date.now() - c.t < 3 * 864e5) { state.ddv = c.v; state.itemIc = c.items; state.augIc = c.augs; return true; }
    } catch (e) { /* 忽略 */ }
    const get = async (url, ms) => {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
      try { const r = await fetch(url, { signal: ctl.signal }); return r.ok ? await r.json() : null; } catch (e) { return null; } finally { clearTimeout(t); }
    };
    const DD = 'https://ddragon.leagueoflegends.com';
    const vers = await get(DD + '/api/versions.json', 6000);
    if (vers) state.ddv = vers[0];
    const [items, arena] = await Promise.all([
      state.ddv ? get(`${DD}/cdn/${state.ddv}/data/zh_CN/item.json`, 10000) : null,
      get('https://raw.communitydragon.org/latest/cdragon/arena/zh_cn.json', 10000),
    ]);
    if (items && items.data) {
      Object.entries(items.data).forEach(([id, it]) => {
        const k = nk(it.name);
        // 同名装备（如奥恩升级版）保留编号最小的那个
        if (!state.itemIc[k] || +id < +state.itemIc[k].split('/').pop().split('.')[0]) state.itemIc[k] = `${DD}/cdn/${state.ddv}/img/item/${id}.png`;
      });
    }
    if (arena && arena.augments) {
      arena.augments.forEach(a => {
        const path = a.iconSmall || a.iconLarge;
        if (path) state.augIc[nk(a.name)] = 'https://raw.communitydragon.org/latest/game/' + path.toLowerCase().replace(/^\//, '');
      });
    }
    const got = Object.keys(state.itemIc).length + Object.keys(state.augIc).length;
    if (got) { try { localStorage.setItem(IC_KEY, JSON.stringify({ t: Date.now(), v: state.ddv, items: state.itemIc, augs: state.augIc })); } catch (e) { /* 忽略 */ } }
    return got > 0;
  }
  // 小图标：加载失败时自动隐藏（海克斯保留稀有度菱形）
  function itemIc(name) {
    const u = (window.HEX_ITEM_ICONS && window.HEX_ITEM_ICONS[name]) || state.itemIc[nk(name)];
    return u ? `<img class="ic" src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '';
  }
  function augIc(name, rarity) {
    const u = (window.HEX_AUG_ICONS && window.HEX_AUG_ICONS[name]) || state.augIc[nk(name)];
    const dot = `<span class="rar ${esc(rarity)}" title="${esc(rarity)}"></span>`;
    return u ? `<span class="ic-wrap r-${esc(rarity)}"><img class="ic" src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-dot="1"></span>` : dot;
  }
  document.addEventListener('error', e => {
    const img = e.target;
    if (img.tagName !== 'IMG' || !img.classList.contains('ic')) return;
    const wrap = img.closest('.ic-wrap');
    if (wrap) { const r = [...wrap.classList].find(c => c.startsWith('r-')); wrap.outerHTML = `<span class="rar ${r ? r.slice(2) : ''}"></span>`; }
    else img.remove();
  }, true);

  /* ---------- 顶栏元信息 ---------- */
  function renderMeta() {
    const m = D.meta || {};
    const upd = m.updatedAt ? new Date(m.updatedAt) : null;
    const days = upd ? Math.floor((Date.now() - upd.getTime()) / 864e5) : null;
    const stale = days != null && days > 3;
    const when = upd ? `${upd.getMonth() + 1}月${upd.getDate()}日` : '未知';
    $('#meta').innerHTML =
      `<span><i class="dot ${stale ? 'stale' : ''}"></i>版本 <b>${esc(m.patch || '')}</b></span>` +
      `<span>更新于 <b>${when}</b></span>` +
      `<span class="hide-md">样本 <b class="num">${m.sampleMatches ? fmtWan(m.sampleMatches) : '—'}</b> 局</span>`;
    $('#foot').innerHTML =
      `<span>${esc(m.mode || '海克斯大乱斗')} · Patch ${esc(m.patch || '')} · 数据来源：${esc(m.source || '')}</span>` +
      `<span>非官方工具，与 Riot Games 无关联</span>`;
  }

  /* ---------- 左侧榜单 ---------- */
  function renderFilters() {
    const f = $('#filters');
    if (state.board === 'heroes') {
      const chips = [['ALL', '全部'], ...ROLES.map(r => [r, r]), ['FAV', '★ 常用']];
      f.innerHTML = chips.map(([k, l]) => `<button class="chip" data-role="${k}" aria-pressed="${state.role === k}">${l}</button>`).join('') +
        `<select class="sort" id="sort" aria-label="排序">
           <option value="wr"${state.sort === 'wr' ? ' selected' : ''}>胜率高→低</option>
           <option value="low"${state.sort === 'low' ? ' selected' : ''}>胜率低→高</option>
           <option value="matches"${state.sort === 'matches' ? ' selected' : ''}>场次多→少</option>
         </select>`;
    } else if (state.board === 'augments') {
      const chips = [['ALL', '全部'], ['棱彩', '棱彩'], ['黄金', '黄金'], ['白银', '白银'], ...(D.augments.some(a => a.rarity === '未知') ? [['未知', '稀有度未知']] : []), ['NEW', '本版本新增']];
      f.innerHTML = chips.map(([k, l]) => `<button class="chip" data-rar="${k}" aria-pressed="${state.augRar === k}">${l}</button>`).join('') +
        sortSel('augSort', [['wr', '胜率高→低'], ['pick', '选取率高→低'], ['score', '综合分高→低']]);
    } else if (state.board === 'items') {
      f.innerHTML = `<span class="subtle">点击任一行查看推荐英雄</span>` +
        sortSel('itemSort', [['wr', '胜率高→低'], ['score', '综合分高→低'], ['heroes', '推荐英雄数多→少']]);
    } else {
      f.innerHTML = '';
    }
  }

  function sortSel(k, opts) {
    return `<select class="sort" data-sortkey="${k}" aria-label="排序">${opts.map(([v, l]) => `<option value="${v}"${state[k] === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  }

  function renderList() {
    const el = $('#list'), head = $('#listHead');
    head.hidden = false;
    if (state.board === 'heroes') {
      const list = heroList();
      head.innerHTML = `<span>排名</span><span>英雄 · ${list.length}</span><span>胜率</span><span>场次</span>`;
      if (!list.length) { el.innerHTML = `<div class="empty">没有找到“${esc(state.q)}”，试试名字、称号或外号。</div>`; return; }
      const max = 60, min = 42;
      el.innerHTML = list.map(h => {
        const w = Math.max(4, Math.min(100, (h.wr - min) / (max - min) * 100));
        return `<button class="row" role="option" data-hero="${esc(h.name)}" aria-selected="${h.name === state.hero}">
          <span class="rank">${h.rank}</span>
          <span class="who">${ava(h)}<span class="names">
            <span class="n1">${esc(h.name)} <span class="tier ${esc(h.tier)}">${esc(h.tier)}</span>${state.fav.has(h.name) ? '<span class="star">★</span>' : ''}</span>
            <span class="n2">${esc(h.title)} · ${esc(h.roles.join('/'))}</span></span></span>
          <span class="wr ${h.wr >= 53 ? 'hi' : ''}">${pct(h.wr)}<i><b style="width:${w}%"></b></i></span>
          <span class="mt">${fmtWan(h.matches)}</span>
        </button>`;
      }).join('');
    } else if (state.board === 'augments') {
      const q = norm(state.q);
      const rarOk = a => state.augRar === 'ALL' || (state.augRar === 'NEW' ? a.isNew : a.rarity === state.augRar);
      const key = { wr: a => a.wr, pick: a => a.pick, score: a => a.score }[state.augSort];
      const main = D.augments.filter(rarOk).filter(a => !q || norm(a.name + a.effect + a.heroes.join('')).includes(q))
        .sort((a, b) => key(b) - key(a));
      const ext = EXT_AUGS.filter(rarOk).filter(a => !q || norm(a.name + a.heroes.join('')).includes(q))
        .sort((a, b) => b.heroes.length - a.heroes.length || b.avg - a.avg);
      head.innerHTML = `<span>排名</span><span>海克斯 · ${main.length + ext.length}</span><span>选取率</span><span>胜率</span>`;
      head.style.gridTemplateColumns = GRID_X;
      if (!main.length && !ext.length) { el.innerHTML = '<div class="empty">没有匹配的海克斯。</div>'; return; }
      el.innerHTML = main.map((a, i) => xrow('aug:' + a.name, `<span class="rank">${i + 1}</span>`,
          `${augIc(a.name, a.rarity)}<span>${esc(a.name)}</span>${a.isNew ? '<em class="new">新</em>' : ''}<span class="tier T1 lite">${esc(a.tier)}</span>`,
          pct(a.pick), wrCell(a.wr),
          `<p>${esc(a.effect)}</p><p class="subtle">综合分 ${a.score} · 选取率 ${pct(a.pick)}</p>${heroLinks(a.heroes)}`)).join('') +
        (ext.length ? `<div class="divider">以下 ${ext.length} 个只出现在英雄专属推荐里，暂无全局胜率。右侧为该海克斯在推荐英雄身上的平均搭配胜率，按推荐英雄数排序。</div>` +
          ext.map(a => xrow('aug:' + a.name, '<span class="rank">–</span>',
            `${augIc(a.name, a.rarity)}<span>${esc(a.name)}</span>`,
            `${a.heroes.length} 英雄`, `<span class="dim">${pct(a.avg)}</span>`,
            `<p class="subtle">被 ${a.heroes.length} 位英雄列入 TOP6，平均搭配胜率 ${pct(a.avg)}</p>${heroLinks(a.heroes)}`)).join('') : '');
      return;
    } else if (state.board === 'items') {
      const q = norm(state.q);
      const key = { wr: i => i.wr, score: i => i.score, heroes: i => (ITEM_USE.get(i.name) || []).length }[state.itemSort];
      const main = D.items.filter(i => !q || norm(i.name + i.tag + i.desc + i.best.join('')).includes(q)).sort((a, b) => key(b) - key(a));
      const ext = EXT_ITEMS.filter(i => !q || norm(i.name + i.heroes.join('')).includes(q));
      head.innerHTML = `<span>排名</span><span>装备 · ${main.length + ext.length}</span><span>推荐英雄</span><span>胜率</span>`;
      head.style.gridTemplateColumns = GRID_X;
      if (!main.length && !ext.length) { el.innerHTML = '<div class="empty">没有匹配的装备。</div>'; return; }
      el.innerHTML = main.map((it, i) => {
        const users = ITEM_USE.get(it.name) || [];
        return xrow('item:' + it.name, `<span class="rank">${i + 1}</span>`, `${itemIc(it.name)}<span>${esc(it.name)}</span>`,
          `${users.length}`, wrCell(it.wr),
          `<p>${esc(it.desc)}</p><p class="subtle">${esc(it.tag)} · 样本 ${esc(it.matches)} · 综合分 ${it.score}</p>${heroLinks(it.best)}` +
          (users.length ? `<p class="subtle" style="margin-top:8px">出现在 ${users.length} 位英雄的推荐出装中</p>${heroLinks(users)}` : ''));
      }).join('') +
        (ext.length ? `<div class="divider">以下 ${ext.length} 件出现在英雄推荐出装里，暂无全局胜率，按推荐英雄数排序。</div>` +
          ext.map(it => xrow('item:' + it.name, '<span class="rank">–</span>', `${itemIc(it.name)}<span>${esc(it.name)}</span>`,
            `${it.heroes.length}`, '<span class="dim">—</span>',
            `<p class="subtle">出现在 ${it.heroes.length} 位英雄的推荐出装中（核心 ${it.core} 次，备选 ${it.alt} 次）</p>${heroLinks(it.heroes)}`)).join('') : '');
      return;
    } else {
      head.hidden = true;
      el.innerHTML = D.bands.map(b => `<div class="band"><h4>${esc(b.name)}<small>${esc(b.badge)}</small></h4>
        <p>${esc(b.effect)}</p><p class="tip">${esc(b.strategy)}</p></div>`).join('');
      return;
    }
    head.style.gridTemplateColumns = '';
  }

  function xrow(id, lead, title, mid, right, body) {
    const open = state.openRow === id;
    return `<div class="xrow ${open ? 'open' : ''}"><button data-toggle="${esc(id)}" aria-expanded="${open}">
      ${lead}<span class="t">${title}</span><span class="g">${mid}</span><span class="g num">${right}</span></button>
      ${open ? `<div class="body">${body}</div>` : ''}</div>`;
  }
  function heroLinks(names) {
    return `<div class="links">${names.map(n => `<button class="link" data-hero="${esc(n)}">${esc(n)}</button>`).join('')}</div>`;
  }

  /* ---------- 右侧详情 ---------- */
  function heroByName(n) { return HEROES.find(h => h.name === n || h.title === n); }

  function renderDetail() {
    const h = heroByName(state.hero) || HEROES[0];
    const fav = state.fav.has(h.name);
    const avg = 50;
    const diff = h.wr - avg;
    const augMax = Math.max(...h.augments.map(a => a.score), 1);
    const combo = (D.combos || []).find(c => c.hero === h.name);

    $('#detail').innerHTML = `
      <button class="btn back" data-action="back">← 返回榜单</button>
      <div class="hero-head">
        ${ava(h, 'lg')}
        <div class="ttl">
          <div class="sup"><span class="tier ${esc(h.tier)}">${esc(h.tierLabel || h.tier)}</span><span>${esc(h.roles.join(' / '))}</span></div>
          <h1>${esc(h.name)}<small>${esc(h.title)}</small></h1>
          <div class="style">${esc(h.style)}</div>
        </div>
        <div class="actions">
          <button class="btn ${fav ? 'on' : ''}" data-action="fav" aria-pressed="${fav}">${fav ? '★ 已设常用' : '☆ 设为常用'}</button>
          <button class="btn" data-action="link">复制链接</button>
          <button class="btn primary" data-action="copy">复制攻略</button>
        </div>
      </div>

      <div class="stats">
        <div class="stat"><div class="k">胜率</div><div class="v">${pct(h.wr)} <small class="${diff >= 0 ? 'up' : 'down'}" style="font-size:12px">${diff >= 0 ? '+' : ''}${diff.toFixed(1)}</small></div></div>
        <div class="stat"><div class="k">排名</div><div class="v">#${h.rank}<small style="font-size:12px;color:var(--muted)"> / ${TOTAL}</small></div></div>
        <div class="stat"><div class="k">样本场次</div><div class="v">${fmtWan(h.matches)}</div></div>
        <div class="stat"><div class="k">加点</div><div class="v sm">${esc(h.skill)}</div></div>
      </div>
      ${h.generic ? '<p class="note">这位英雄的出装和海克斯目前是同定位通用推荐，接入实时对局数据后会自动替换为专属数据。</p>' : ''}

      <div class="grid2">
        <div class="card full">
          <h3>选海克斯速查 <em>点本轮稀有度，刷出的三个里谁排得最靠前就选谁</em></h3>
          <div class="rtabs" role="tablist">
            ${RARITIES.map(r => `<button role="tab" data-quick="${r}" aria-selected="${state.quick === r}"><span class="rar ${r}"></span>${r}</button>`).join('')}
          </div>
          <ol class="quick">${quickList(h, state.quick).map((x, i) => `<li class="${x.tag ? 'own' : ''}" title="${esc(x.effect || '')}">
            <span class="qn num">${i + 1}</span>${augIc(x.name, state.quick)}<span class="qt">${esc(x.name)}</span>${x.tag ? `<span class="qtag">${x.tag}</span>` : ''}<span class="qw num">${pct(x.wr)}</span></li>`).join('')}</ol>
        </div>

        <div class="card">
          <h3>海克斯优先级 <em>搭配胜率</em></h3>
          ${h.augments.map(a => `<div class="aug">${augIc(a.name, a.rarity)}
            <span class="nm" title="${esc((AUG_DB.get(a.name) || {}).effect || a.name)}">${esc(a.name)}</span>
            <span class="bar"><b style="width:${(a.score / augMax * 100).toFixed(0)}%"></b></span>
            <span class="p">${pct(a.wr)}${a.games ? `<small class="g${a.low ? ' low' : ''}">${a.low ? '样本少 · ' : ''}${fmtWan(a.games)}场</small>` : ''}</span></div>`).join('')}
        </div>

        <div class="card">
          <h3>推荐出装 <em>${h.dataDriven ? '按该英雄出这件装的胜率排序，不是合成顺序' : '参考出装，暂无对局统计'}</em></h3>
          <ol class="build">${h.coreItems.map(i => { const st = (h.itemStats || []).find(x => x.name === i);
            return `<li>${itemIc(i)}<span class="bn"><span>${esc(i)}</span>${st ? `<small class="g${st.low ? ' low' : ''}">${pct(st.wr)} · ${fmtWan(st.games)}场</small>` : ''}</span></li>`; }).join('')}</ol>
          ${h.dataDriven ? '<p class="subtle g-note">橙色数字：样本不到 100 场，仅供参考</p>' : ''}
          <div class="alt">备选 ${h.altItems.map(i => `<span class="i">${itemIc(i)}${esc(i)}</span>`).join('')}</div>
          <dl class="kv" style="margin-top:14px"><dt>锻体</dt><dd>${esc(h.anvil)}</dd></dl>
        </div>

        <div class="card">
          <h3>王牌组合</h3>
          <p class="combo-t">${esc(h.comboTitle)}</p>
          <p class="txt">${esc(h.comboDesc)}</p>
          ${combo ? `<p class="subtle" style="margin-top:8px">${esc(combo.tag)} · 核心装 ${esc(combo.items.join(' → '))}</p>` : ''}
        </div>

        <div class="card">
          <h3>上手要点</h3>
          <p class="txt">${esc(h.tips)}</p>
        </div>

      </div>`;
  }

  /* ---------- 选海克斯速查：同一轮三个海克斯稀有度相同，按稀有度给出该英雄的完整排序 ---------- */
  const RARITIES = ['棱彩', '黄金', '白银'].concat(D.augments.some(a => a.rarity === '未知') ? ['未知'] : []);
  function quickList(h, rar) {
    const own = h.augments.filter(a => a.rarity === rar)
      .map(a => ({ name: a.name, wr: a.wr, tag: '本命', k: 2, effect: (AUG_DB.get(a.name) || {}).effect }));
    const ownNames = new Set(own.map(a => a.name));
    const rest = D.augments.filter(a => a.rarity === rar && !ownNames.has(a.name))
      .map(a => ({ name: a.name, wr: a.wr, tag: a.heroes.includes(h.name) ? '适配' : '', k: a.heroes.includes(h.name) ? 1 : 0, effect: a.effect }));
    return [...own, ...rest].sort((x, y) => y.k - x.k || y.wr - x.wr);
  }

  /* ---------- 交互 ---------- */
  function selectHero(name, opts) {
    const h = heroByName(name);
    if (!h) return;
    state.hero = h.name;
    if (!opts || !opts.noHash) setHash();
    renderDetail();
    if (state.board === 'heroes') {
      document.querySelectorAll('#list .row').forEach(r => r.setAttribute('aria-selected', r.dataset.hero === h.name));
    }
    if (window.matchMedia('(max-width: 860px)').matches && !(opts && opts.noSheet)) document.body.classList.add('sheet');
    if (!window.matchMedia('(max-width: 860px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setBoard(b) {
    state.board = b; state.openRow = null;
    document.querySelectorAll('#boardTabs button').forEach(x => x.setAttribute('aria-selected', x.dataset.board === b));
    const ph = { heroes: '搜英雄：亚索 / 风男 / yasuo', augments: '搜海克斯：名称、效果或英雄', items: '搜装备：名称或英雄', bands: '搜英雄：名字、称号或外号' };
    $('#search').placeholder = ph[b];
    renderFilters(); renderList();
  }

  function setHash() {
    const p = new URLSearchParams();
    p.set('hero', state.hero);
    history.replaceState(null, '', '#' + p.toString());
  }
  function readHash() {
    try {
      const p = new URLSearchParams(location.hash.replace(/^#/, ''));
      const h = p.get('hero');
      if (h && heroByName(h)) state.hero = heroByName(h).name;
    } catch (e) { /* 忽略 */ }
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2200);
  }
  async function copy(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(okMsg); } catch (err) { toast('复制失败，请手动复制'); }
      ta.remove();
    }
  }
  function guideText(h) {
    return [
      `【海克斯大乱斗 ${D.meta.patch}】${h.name}（${h.title}）胜率 ${pct(h.wr)} · 第 ${h.rank}/${TOTAL}`,
      `流派：${h.style}（${h.skill}）`,
      `海克斯：${h.augments.slice(0, 4).map(a => a.name).join(' > ')}`,
      `出装：${h.coreItems.join(' → ')}`,
      `锻体：${h.anvil}`,
      `要点：${h.tips}`,
    ].join('\n');
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-hero],[data-role],[data-rar],[data-board],[data-toggle],[data-action],[data-quick]');
    if (!t) return;
    if (t.dataset.quick) { state.quick = t.dataset.quick; renderDetail(); return; }
    if (t.dataset.board) return setBoard(t.dataset.board);
    if (t.dataset.role) { state.role = t.dataset.role; renderFilters(); renderList(); return; }
    if (t.dataset.rar) { state.augRar = t.dataset.rar; renderFilters(); renderList(); return; }
    if (t.dataset.toggle) { state.openRow = state.openRow === t.dataset.toggle ? null : t.dataset.toggle; renderList(); return; }
    if (t.dataset.hero) return selectHero(t.dataset.hero);
    const h = heroByName(state.hero);
    switch (t.dataset.action) {
      case 'back': document.body.classList.remove('sheet'); break;
      case 'home': e.preventDefault(); $('#search').value = ''; state.q = ''; setBoard('heroes'); $('#list').scrollTop = 0; break;
      case 'fav':
        state.fav.has(h.name) ? state.fav.delete(h.name) : state.fav.add(h.name);
        saveFav(); renderDetail(); if (state.board === 'heroes') renderList(); break;
      case 'copy': copy(guideText(h), `已复制 ${h.name} 的攻略`); break;
      case 'link': setHash(); copy(location.href, '已复制英雄直达链接'); break;
    }
  });

  document.addEventListener('change', e => {
    if (e.target.id === 'sort') { state.sort = e.target.value; renderList(); }
    if (e.target.dataset && e.target.dataset.sortkey) { state[e.target.dataset.sortkey] = e.target.value; state.openRow = null; renderList(); }
  });
  document.addEventListener('input', e => {
  });

  const search = $('#search');
  search.addEventListener('input', () => {
    state.q = search.value.trim();
    renderList();
    // 输入时自动显示最匹配的英雄，玩家不需要再点一下
    if (state.board === 'heroes' && state.q) {
      const first = heroList()[0];
      if (first && first.name !== state.hero) selectHero(first.name, { noSheet: true });
    }
  });
  search.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (state.board !== 'heroes') setBoard('heroes');
      const first = heroList()[0];
      if (first) { selectHero(first.name); search.blur(); }
    } else if (e.key === 'Escape') {
      search.value = ''; state.q = ''; renderList();
    }
  });
  document.addEventListener('keydown', e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (e.key === '/' && !typing) { e.preventDefault(); search.focus(); search.select(); }
    if (e.key === 'Escape' && document.body.classList.contains('sheet')) document.body.classList.remove('sheet');
    if (!typing && state.board === 'heroes' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const list = heroList();
      const i = list.findIndex(h => h.name === state.hero);
      const n = list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (n) {
        e.preventDefault(); selectHero(n.name, { noSheet: true });
        const row = document.querySelector(`#list .row[data-hero="${CSS.escape(n.name)}"]`);
        if (row) row.scrollIntoView({ block: 'nearest' });
      }
    }
  });
  window.addEventListener('hashchange', () => { readHash(); renderDetail(); renderList(); });

  /* ---------- 启动 ---------- */
  readHash();
  renderMeta();
  renderFilters();
  renderList();
  renderDetail();
  const sel = document.querySelector(`#list .row[aria-selected="true"]`);
  if (sel) sel.scrollIntoView({ block: 'nearest' });
  loadIconMaps().then(ok => { if (ok) { renderList(); renderDetail(); } });
})();
