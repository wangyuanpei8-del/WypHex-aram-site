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
  const GRID_3 = '28px 1fr 64px';

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
  // 出场率/选取率较上个版本的变化（百分点）
  const chg = d => (d == null || d === 0 ? '' : `<span class="${d > 0 ? 'up' : 'down'}" style="font-size:11px"> ${d > 0 ? '↑' : '↓'}${Math.abs(d).toFixed(2)}</span>`);

  const tb = t => `<span class="tier T${t}">T${t}</span>`; // Blitz 评级标签，T1 最强
  // 胜率来自 Hexdata（每日更新）；没有时用表格里的整理数据。标上胜率的版本，落后于当前版本时标“旧”
  const WR = D.meta.wr || { patch: D.meta.patch };
  const CUR = (D.meta.open && D.meta.open.patch) || D.meta.patch;
  const wrTag = p => { const old = !!(p && CUR && p !== CUR); return `<small class="wrv${old ? ' old' : ''}">${String(p || '').replace(/[^\w.]/g, '')}${old ? ' 旧' : ''}</small>`; };
  const OLD_PATCH = !!(WR.patch && CUR && WR.patch !== CUR);
  const WR_TAG = wrTag(WR.patch);
  const AUG_WR_TAG = wrTag(WR.augPatch || WR.patch);
  const ITEM_WR_TAG = wrTag(WR.itemPatch || WR.patch);
  const COMBO_TYPE = { god: '神级', strong: '强势', fun: '娱乐', meme: '整活', niche: '冷门', classic: '经典' };
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtWan = n => (n >= 10000 ? (n / 10000).toFixed(n >= 1e6 ? 0 : 1) + '万' : String(n));
  const pct = n => (n == null || n === '' ? '—' : Number(n).toFixed(1) + '%');

  const state = {
    board: 'heroes',
    role: 'ALL',
    sort: OLD_PATCH ? 'pick' : 'wr', // 胜率是整理数据，版本过时后默认改按每日更新的出场率排
    q: '',
    hero: HEROES[0].name,
    openRow: null,
    augRar: 'ALL',
    augSort: 'pick',
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
    } else if (state.sort === 'pick') {
      list.sort((a, b) => (b.pick ?? -1) - (a.pick ?? -1));
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
    const stale = days != null && days > 21;
    const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec((m.open && m.open.statsDate) || m.updatedAt || ''); // 直接取日期，避免时区把 11月1日 显示成 10月31日
    const when = ymd ? `${+ymd[2]}月${+ymd[3]}日` : '未知';
    $('#meta').innerHTML =
      `<span><i class="dot ${stale && !m.open ? 'stale' : ''}"></i>版本 <b>${esc((m.open && m.open.patch) || m.patch || '')}</b></span>` +
      `<span>更新于 <b>${when}</b></span>` +
      (m.open ? `<span class="hide-md">${m.wr ? '胜率、' : ''}出场率${m.blitz ? '、出装评级' : ''}每日自动更新</span>` : `<span class="hide-md">编辑整理 · 非实时</span>`);
    $('#foot').innerHTML =
      `<span>${esc(m.mode || '海克斯大乱斗')} · Patch ${esc(CUR || '')}</span>` +
      (m.wr ? `<span>胜率与综合分：<a href="https://hexdata.com.cn" target="_blank" rel="noopener">数据来源：Hexdata（hexdata.com.cn）</a>（英雄 ${esc(m.wr.patch)} 版本，数据日 ${esc(m.wr.date || '')}；装备 ${esc(m.wr.itemPatch)} 版本）</span>` : '') +
      `<span>流派、加点、要点、王牌组合等文字：手工整理（${esc(m.patch)} 版本，仅供参考）</span>` +
      (m.open ? `<span>出场率、选取率与精选组合：<a href="https://arammayhem.com/data/" target="_blank" rel="noopener">数据：arammayhem.com</a>（CC BY 4.0，${esc(m.open.patch)} 版本，统计日 ${esc(m.open.statsDate)}）</span>` : '') +
      (m.blitz ? `<span>出装与海克斯评级：<a href="https://blitz.gg/lol" target="_blank" rel="noopener">Blitz</a>（${esc(m.blitz.patch)} 版本，${esc(m.blitz.date)} 获取，仅评级、无胜率）</span>` : '') +
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
           ${HEROES.some(h => h.pick != null) ? `<option value="pick"${state.sort === 'pick' ? ' selected' : ''}>出场率高→低</option>` : ''}
         </select>`;
    } else if (state.board === 'augments') {
      const chips = [['ALL', '全部'], ['棱彩', '棱彩'], ['黄金', '黄金'], ['白银', '白银'], ...(D.augments.some(a => a.rarity === '未知') ? [['未知', '稀有度未知']] : []), ['NEW', '本版本新增']];
      f.innerHTML = chips.map(([k, l]) => `<button class="chip" data-rar="${k}" aria-pressed="${state.augRar === k}">${l}</button>`).join('') +
        sortSel('augSort', [['wr', '胜率高→低'], ['pick', '选取率高→低'], ['score', '综合分高→低']]);
    } else if (state.board === 'items') {
      f.innerHTML = `<span class="subtle">点击任一行查看推荐英雄</span>` +
        sortSel('itemSort', [['wr', '胜率高→低'], ['score', '综合分高→低']]);
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
      const byPick = state.sort === 'pick';
      head.innerHTML = `<span>排名</span><span>英雄 · ${list.length}</span><span>胜率${WR_TAG}</span><span>${byPick ? '出场率' : '场次'}</span>`;
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
          <span class="mt">${byPick ? pct(h.pick) : fmtWan(h.matches)}</span>
        </button>`;
      }).join('');
    } else if (state.board === 'augments') {
      const q = norm(state.q);
      const rarOk = a => state.augRar === 'ALL' || (state.augRar === 'NEW' ? a.isNew : a.rarity === state.augRar);
      const key0 = { wr: a => a.wr, pick: a => a.pick, score: a => a.score }[state.augSort];
      const key = a => key0(a) ?? -1; // 没有数据的排在最后
      const main = D.augments.filter(rarOk).filter(a => !q || norm(a.name + a.effect + a.heroes.join('')).includes(q))
        .sort((a, b) => key(b) - key(a));
      const ext = EXT_AUGS.filter(rarOk).filter(a => !q || norm(a.name + a.heroes.join('')).includes(q))
        .sort((a, b) => b.heroes.length - a.heroes.length || b.avg - a.avg);
      head.innerHTML = `<span>排名</span><span>海克斯 · ${main.length + ext.length}</span><span>选取率</span><span>胜率${AUG_WR_TAG}</span>`;
      head.style.gridTemplateColumns = GRID_X;
      if (!main.length && !ext.length) { el.innerHTML = '<div class="empty">没有匹配的海克斯。</div>'; return; }
      el.innerHTML = main.map((a, i) => xrow('aug:' + a.name, `<span class="rank">${i + 1}</span>`,
          `${augIc(a.name, a.rarity)}<span>${esc(a.name)}</span>${a.isNew ? '<em class="new">新</em>' : ''}${a.btier ? `<span class="tier T${a.btier} lite" title="Blitz 全局评级">T${a.btier}</span>` : a.tier ? `<span class="tier T1 lite">${esc(a.tier)}</span>` : ''}`,
          pct(a.pick), wrCell(a.wr),
          `${a.effect ? `<p>${esc(a.effect)}</p>` : ''}<p class="subtle">${a.score != null ? `综合分 ${a.score} · ` : ''}选取率 ${pct(a.pick)}${chg(a.pickChange)}${a.wr == null ? ' · 暂无胜率' : ''}${a.btier ? ` · Blitz 评级 T${a.btier}` : ''}${a.openUrl ? ` · <a href="${esc(a.openUrl)}" target="_blank" rel="noopener">arammayhem ↗</a>` : ''}</p>` +
          ((a.best || []).length ? `<p class="subtle" style="margin-top:8px">最适合的英雄（Hexdata 推荐里有它 · 搭配胜率）</p>${heroLinksWr(a.best)}` : heroLinks(a.heroes)))).join('') +
        (ext.length ? `<div class="divider">以下 ${ext.length} 个只出现在英雄专属推荐里，暂无全局胜率。右侧为该海克斯在推荐英雄身上的平均搭配胜率，按推荐英雄数排序。</div>` +
          ext.map(a => xrow('aug:' + a.name, '<span class="rank">–</span>',
            `${augIc(a.name, a.rarity)}<span>${esc(a.name)}</span>`,
            `${a.heroes.length} 英雄`, `<span class="dim">${pct(a.avg)}</span>`,
            `<p class="subtle">被 ${a.heroes.length} 位英雄列入 TOP6，平均搭配胜率 ${pct(a.avg)}</p>${heroLinks(a.heroes)}`)).join('') : '');
      return;
    } else if (state.board === 'items') {
      const q = norm(state.q);
      const key = { wr: i => i.wr, score: i => i.score }[state.itemSort] || (i => i.wr);
      const main = D.items.filter(i => !q || norm(i.name + i.tag + i.desc + i.best.join('')).includes(q)).sort((a, b) => key(b) - key(a));
      const ext = EXT_ITEMS.filter(i => !q || norm(i.name + i.heroes.join('')).includes(q));
      head.innerHTML = `<span>排名</span><span>装备 · ${main.length + ext.length}</span><span>胜率${ITEM_WR_TAG}</span>`;
      head.style.gridTemplateColumns = GRID_3;
      if (!main.length && !ext.length) { el.innerHTML = '<div class="empty">没有匹配的装备。</div>'; return; }
      el.innerHTML = main.map((it, i) => {
        const users = ITEM_USE.get(it.name) || [];
        return xrow('item:' + it.name, `<span class="rank">${i + 1}</span>`, `${itemIc(it.name)}<span>${esc(it.name)}</span>`,
          null, wrCell(it.wr),
          `${it.desc ? `<p>${esc(it.desc)}</p>` : ''}<p class="subtle">${[it.tag && esc(it.tag), it.matches && `样本 ${esc(it.matches)}`, it.score != null && `综合分 ${it.score}`, it.wr == null && '暂无胜率'].filter(Boolean).join(' · ')}</p>${(it.bestHx || []).length ? `<p class="subtle" style="margin-top:8px">最适合的英雄（Hexdata 推荐里有它 · 搭配胜率）</p>${heroLinksWr(it.bestHx)}` : heroLinks(it.best)}` +
          (users.length && !(it.bestHx || []).length ? `<p class="subtle" style="margin-top:8px">这些英雄的推荐出装里有它</p>${heroLinks(users)}` : ''));
      }).join('') +
        (ext.length ? `<div class="divider">以下 ${ext.length} 件出现在英雄推荐出装里，暂无全局胜率。点开可以看哪些英雄推荐它。</div>` +
          ext.map(it => xrow('item:' + it.name, '<span class="rank">–</span>', `${itemIc(it.name)}<span>${esc(it.name)}</span>`,
            null, '<span class="dim">—</span>',
            `<p class="subtle">这些英雄的推荐出装里有它</p>${heroLinks(it.heroes)}`)).join('') : '');
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
    return `<div class="xrow ${open ? 'open' : ''}${mid == null ? ' x3' : ''}"><button data-toggle="${esc(id)}" aria-expanded="${open}">
      ${lead}<span class="t">${title}</span>${mid == null ? '' : `<span class="g">${mid}</span>`}<span class="g num">${right}</span></button>
      ${open ? `<div class="body">${body}</div>` : ''}</div>`;
  }
  // 带搭配胜率的英雄按钮（海克斯榜、装备榜用）
  function heroLinksWr(list) {
    return `<div class="links">${list.map(x => `<button class="link" data-hero="${esc(x.hero)}">${esc(x.hero)} <b class="lw ${x.wr >= 55 ? 'hi' : ''}">${pct(x.wr)}</b></button>`).join('')}</div>`;
  }
  const games = n => (n == null ? '' : `<small class="gm${n < 1000 ? ' low' : ''}" title="${n < 1000 ? '样本少于 1000 场，仅供参考' : '样本场次'}">${fmtWan(n)}场</small>`);
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
          ${h.openUrl ? `<a class="btn" href="${esc(h.openUrl)}" target="_blank" rel="noopener" title="arammayhem.com 上的最新数据">最新数据 ↗</a>` : ''}
          <button class="btn" data-action="link">复制链接</button>
          <button class="btn primary" data-action="copy">复制攻略</button>
        </div>
      </div>

      <div class="stats">
        <div class="stat"><div class="k">胜率 ${WR_TAG}</div><div class="v">${pct(h.wr)} <small class="${diff >= 0 ? 'up' : 'down'}" style="font-size:12px">${diff >= 0 ? '+' : ''}${diff.toFixed(1)}</small></div></div>
        <div class="stat"><div class="k">排名</div><div class="v">#${h.rank}<small style="font-size:12px;color:var(--muted)"> / ${TOTAL}</small></div></div>
        ${h.pick != null
          ? `<div class="stat"><div class="k">出场率 <small style="color:var(--muted)">每日更新</small></div><div class="v">${pct(h.pick)}${chg(h.pickChange)}</div></div>`
          : `<div class="stat"><div class="k">样本场次</div><div class="v">${fmtWan(h.matches)}</div></div>`}
        ${h.hexdata && h.pick != null
          ? `<div class="stat"><div class="k">样本场次</div><div class="v">${fmtWan(h.matches)}</div></div>`
          : `<div class="stat"><div class="k">加点</div><div class="v sm">${esc(h.skill)}</div></div>`}
      </div>
      ${h.hexdata ? `<p class="note">胜率、海克斯和出装来自 <a href="${esc(h.hexUrl)}" target="_blank" rel="noopener">Hexdata</a>（${esc(WR.patch)} 版本，数据日 ${esc(WR.date || '')}，每日更新；统计的是公开对局样本）。选海克斯速查里 Hexdata 没列出的海克斯按 Blitz 评级补充；流派、要点等文字仅供参考。</p>`
        : h.blitz ? `<p class="note">出装和海克斯按 Blitz 评级排序（${esc(D.meta.blitz.patch)} 版本，每日更新，T1 最强）；流派、要点等文字仅供参考。</p>`
        : OLD_PATCH ? `<p class="note">胜率是 ${esc(WR.patch)} 版本的数据，当前已是 ${esc(CUR)} 版本，仅供参考；出场率为最新数据。</p>` : ''}
      ${h.generic && !h.blitz ? '<p class="note">这位英雄的出装和海克斯目前是同定位通用推荐，仅供参考，后续会逐步补上专属内容。</p>' : ''}

      <div class="grid2">
        <div class="card full">
          <h3>选海克斯速查 <em>点本轮稀有度，刷出的三个里谁排得最靠前就选谁。“本命”是 ${h.hexdata ? 'Hexdata 给这位英雄的推荐（显示搭配胜率）' : '该英雄的推荐'}${h.augTiers ? '，T1~T3 是 Blitz 评级' : ''}，其余按全服胜率</em></h3>
          <div class="rtabs" role="tablist">
            ${RARITIES.map(r => `<button role="tab" data-quick="${r}" aria-selected="${state.quick === r}"><span class="rar ${r}"></span>${r}</button>`).join('')}
          </div>
          <ol class="quick">${quickList(h, state.quick).map((x, i) => `<li class="${x.tag ? 'own' : ''}" title="${esc(x.effect || '')}">
            <span class="qn num">${i + 1}</span>${augIc(x.name, state.quick)}<span class="qt">${esc(x.name)}</span>${x.tag ? `<span class="qtag">${x.tag}</span>` : ''}<span class="qw num">${x.tier ? tb(x.tier) : `<span class="${x.k === 2 && x.wr >= 55 ? 'hi' : ''}">${pct(x.wr)}</span>`}</span></li>`).join('')}</ol>
        </div>

        <div class="card">
          <h3>海克斯优先级 <em>${h.hexdata ? '按 Hexdata 综合分排 · 搭配胜率 · 场次' : h.blitz ? 'Blitz 评级' : '搭配胜率'}</em></h3>
          ${h.augments.map(a => `<div class="aug">${augIc(a.name, a.rarity)}
            <span class="nm" title="${esc((AUG_DB.get(a.name) || {}).effect || a.name)}">${esc(a.name)}</span>
            <span class="bar"><b style="width:${(a.score / augMax * 100).toFixed(0)}%"></b></span>
            <span class="p">${a.tier ? tb(a.tier) : `<span class="${a.wr >= 55 ? 'hi' : ''}">${pct(a.wr)}</span>${games(a.games)}`}</span></div>`).join('')}
        </div>

        <div class="card">
          <h3>推荐出装 <em>${h.hexdata ? '按 Hexdata 综合分排，不是合成顺序 · 胜率 · 场次' : h.blitz ? 'Blitz 评级排序，不是合成顺序' : '编辑推荐'}</em></h3>
          <ol class="build">${h.coreItems.map(i => `<li>${itemIc(i)}<span class="bn"><span>${esc(i)}</span>${h.itemStats && h.itemStats[i] ? `<span class="iw"><span class="${h.itemStats[i].wr >= 55 ? 'hi' : ''}">${pct(h.itemStats[i].wr)}</span>${games(h.itemStats[i].games)}</span>` : h.itemTiers && h.itemTiers[i] ? tb(h.itemTiers[i]) : ''}</span></li>`).join('')}</ol>
          ${h.altItems.length ? `<div class="alt">${h.hexdata ? '其他常见' : '备选'} ${h.altItems.map(i => `<span class="i">${itemIc(i)}${esc(i)}</span>`).join('')}</div>` : ''}
          <dl class="kv" style="margin-top:14px">${h.hexdata ? `<dt>加点</dt><dd>${esc(h.skill)}</dd>` : ''}<dt>锻体</dt><dd>${esc(h.anvil)}</dd></dl>
        </div>

        <div class="card">
          <h3>王牌组合</h3>
          <p class="combo-t">${esc(h.comboTitle)}</p>
          <p class="txt">${esc(h.comboDesc)}</p>
          ${combo ? `<p class="subtle" style="margin-top:8px">${esc(combo.tag)} · 核心装 ${esc(combo.items.join(' → '))}</p>` : ''}
          ${(h.openCombos || []).length ? `<div class="ocombo"><div class="subtle">arammayhem 精选组合</div>${h.openCombos.map(c => `<a class="oc" href="${esc(c.url)}" target="_blank" rel="noopener">${c.augs.map(n => `${augIc(n, (AUG_DB.get(n) || {}).rarity || '未知')}<span>${esc(n)}</span>`).join('<i>+</i>')}${c.types.length ? `<em>${esc(c.types.map(t => COMBO_TYPE[t] || t).join(' / '))}</em>` : ''}</a>`).join('')}</div>` : ''}
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
    const rarOf = n => (AUG_DB.get(n) || {}).rarity || '未知';
    const seen = new Set();
    // 1. 该英雄的推荐（Hexdata 带搭配胜率；没有时用 Blitz 评级或表格）
    const own = h.hexdata
      ? h.augments.filter(a => rarOf(a.name) === rar).map(a => ({ name: a.name, wr: a.wr, tag: '本命', k: 3, s: a.score ?? a.wr, effect: (AUG_DB.get(a.name) || {}).effect }))
      : !h.augTiers ? h.augments.filter(a => a.rarity === rar).map(a => ({ name: a.name, wr: a.wr, tag: '本命', k: 3, s: a.wr, effect: (AUG_DB.get(a.name) || {}).effect })) : [];
    own.forEach(a => seen.add(a.name));
    // 2. Blitz 评级 T1~T3
    const bl = (h.augTiers || []).filter(([n]) => !seen.has(n) && rarOf(n) === rar)
      .map(([n, t]) => ({ name: n, tier: t, tag: !h.hexdata && t === 1 ? '本命' : '', k: 2, s: -t, effect: (AUG_DB.get(n) || {}).effect }));
    bl.forEach(a => seen.add(a.name));
    // 3. 其余按全服胜率
    const rest = D.augments.filter(a => a.rarity === rar && !seen.has(a.name))
      .map(a => ({ name: a.name, wr: a.wr, tag: !h.augTiers && !h.hexdata && a.heroes.includes(h.name) ? '适配' : '', k: 0, s: a.wr ?? -1, effect: a.effect }));
    return [...own, ...bl, ...rest].sort((x, y) => y.k - x.k || y.s - x.s);
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
      `【海克斯大乱斗 ${CUR}】${h.name}（${h.title}）胜率 ${pct(h.wr)} · 第 ${h.rank}/${TOTAL}`,
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
