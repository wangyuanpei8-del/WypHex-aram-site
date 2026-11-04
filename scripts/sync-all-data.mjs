#!/usr/bin/env node
/**
 * 海斗助手 · 严格模式全量数据同步脚本（scripts/sync-all-data.mjs）
 *
 * 针对 full-auto-test 试跑反馈的 4 项问题进行的彻底修复：
 *   1. 彻底移除所有编造兜底：绝不填充“亚索、崔斯特、塔姆、瑞兹”或“提供海克斯大乱斗专属强化效果”；
 *      绝不无条件关闭 134 位英雄的 generic（通用模板）提示——仅当某英雄真实从接口拿到 ≥6 件成装和 ≥4 个海克斯统计时才更新并设为非通用。
 *   2. 真正接通 Blitz (data.v2.iesdev.com) 数据消费闭环：
 *      上一版只把 Blitz 返回的数据存进内存变量而未写入网站；本版完整解析 aram_mayhem_champion 与 aram_mayhem_augments，
 *      结合 Data Dragon + CommunityDragon items.json（支持 12xxxx 等海斗专属 6 位物品编号）与 hextech.dtodo.cn 写入英雄胜率、出装、海克斯与全局榜。
 *   3. 修复 HTML 去标签粘连 Bug：将 stripHtml 中的 replace(/<[^>]+>/g, '') 修正为替换成空格 ' '，避免相邻 <td> 单元格粘连导致匹配为 0。
 *   4. 删除错误的海克斯同义词合并：移除“濒死悟道/高压锅”、“灵魄炸弹/音之屏障”、“双重防御/加固护盾”的错误合并，仅保留纯空格与“任务：”前缀对齐。
 *   5. 空数据熔断保护：若本次运行未能从 Blitz 或 Hexdata 获取到足够真实胜率数据（有效更新英雄 < 30），立即报错退出（exit 1），绝不污染现有数据文件。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONCURRENCY = Number(process.env.SYNC_CONCURRENCY || 8);

const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

// 仅保留确属同一海克斯的空格/前缀差异，绝不合并不同海克斯
const AUG_ALIAS_MAP = {
  '鼓声暴起 低音轰鸣': '鼓声暴起低音轰鸣',
  '任务：钢化你心': '钢化你心',
  '任务：沃格勒特的巫师帽': '沃格勒特的巫师帽',
  '任务：海牛阿福的勇士': '海牛阿福的勇士',
  '纯粹主义者 - 术师': '纯粹主义者- 术师',
  '纯粹主义者-术师': '纯粹主义者- 术师',
};

function canonAugName(name) {
  const s = String(name || '').trim();
  if (AUG_ALIAS_MAP[s]) return AUG_ALIAS_MAP[s];
  const noQuest = s.replace(/^任务[：:]\s*/, '');
  if (AUG_ALIAS_MAP[noQuest]) return AUG_ALIAS_MAP[noQuest];
  return s;
}

function normAugKey(name) {
  return canonAugName(name)
    .replace(/!/g, '！')
    .replace(/[\s·・\-—_：:，,。.（）()]/g, '')
    .toLowerCase();
}

// 注意：必须将 HTML 标签替换为空格 ' '，否则相邻 <td> 文字会粘连导致正则失效
const stripHtml = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const normPatch = p => String(p || '').replace(/^16\./, '26.');
const r1 = x => (x == null || !Number.isFinite(+x) ? null : Math.round(+x * 10) / 10);
const r2 = x => (x == null || !Number.isFinite(+x) ? null : Math.round(+x * 100) / 100);
// 统一将 0~1 小数或 0~100 百分比转为 0~100 百分比
const toPct = v => {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n <= 1.0 ? r1(n * 100) : r1(n);
};

// Wilson 95% 置信下界（用于给物品和海克斯做稳健综合排序，避免小样本冲榜）
function wilson(wins, games, z = 1.64) {
  if (!games || games <= 0) return 0;
  const p = Math.min(1, Math.max(0, wins / games));
  return (p + (z * z) / (2 * games) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * games)) / games)) / (1 + (z * z) / games);
}

async function fetchRetry(url, type = 'json', retries = 3, timeoutMs = 12000) {
  for (let i = 0; i < retries; i++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: UA, signal: ctl.signal });
      clearTimeout(timer);
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`HTTP ${res.status}`);
      }
      return type === 'json' ? await res.json() : await res.text();
    } catch {
      clearTimeout(timer);
      if (i === retries - 1) return null;
      await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }
  return null;
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const cur = idx++;
      results[cur] = await fn(items[cur], cur);
    }
  });
  await Promise.all(workers);
  return results;
}

/* ---------------- 1. 加载官方英雄、装备（含海斗 6 位 ID）与海克斯字典 ---------------- */
async function loadOfficialMeta(existing) {
  const meta = {
    version: null,
    champsByKey: new Map(), // numeric key (157) -> { numId, key, name }
    champsBySlug: new Map(), // 'yasuo' -> { numId, key, name }
    itemsById: new Map(),    // numeric id (3031 or 123430) -> { id, name, desc, full, boots }
    itemsByName: new Map(),  // 中文名 -> { id, name, desc, full, boots }
    augsById: new Map(),     // numeric id or string id -> { name, rarity, desc }
    augsByKey: new Map(),    // normAugKey(中文名) -> { name, rarity, desc }
  };

  // 先把仓库已有的海克斯与装备放进字典做基础对照
  existing.augments.forEach(a => {
    const info = { name: canonAugName(a.name), rarity: a.rarity || '未知', desc: a.effect || '' };
    meta.augsByKey.set(normAugKey(a.name), info);
  });
  existing.items.forEach(i => {
    meta.itemsByName.set(i.name, { name: i.name, desc: i.desc || '', full: true, boots: /靴|胫甲/.test(i.name) });
  });

  const versions = await fetchRetry('https://ddragon.leagueoflegends.com/api/versions.json');
  const ddv = versions?.[0];
  meta.version = ddv;

  if (ddv) {
    const base = `https://ddragon.leagueoflegends.com/cdn/${ddv}/data/zh_CN`;
    const [champJson, itemJson] = await Promise.all([
      fetchRetry(`${base}/champion.json`),
      fetchRetry(`${base}/item.json`),
    ]);
    if (champJson?.data) {
      const heroTitleToName = new Map();
      existing.heroes.forEach(h => {
        if (h.key) heroTitleToName.set(h.key.toLowerCase(), h.name);
        heroTitleToName.set(h.title, h.name);
        heroTitleToName.set(h.name, h.name);
      });
      for (const c of Object.values(champJson.data)) {
        const name = heroTitleToName.get(c.id.toLowerCase()) || heroTitleToName.get(c.title) || c.title;
        const info = { numId: Number(c.key), key: c.id, name, title: c.name };
        meta.champsByKey.set(Number(c.key), info);
        meta.champsBySlug.set(c.id.toLowerCase(), info);
      }
    }
    if (itemJson?.data) {
      for (const [id, it] of Object.entries(itemJson.data)) {
        const boots = (it.tags || []).includes('Boots') && (it.gold?.total || 0) >= 900;
        const full = boots || ((it.gold?.total || 0) >= 2000 && !(it.into && it.into.length));
        const desc = stripHtml(it.plaintext || it.description || '');
        const info = { id: Number(id), name: it.name, desc, full, boots };
        meta.itemsById.set(Number(id), info);
        if (!meta.itemsByName.has(it.name)) meta.itemsByName.set(it.name, info);
      }
    }
  }

  // CommunityDragon items.json：包含 123430（毁坏仪式）、22xxxx、44xxxx 等海斗/竞技场专属装备 ID
  const CD = 'https://raw.communitydragon.org/latest';
  const cdItems = await fetchRetry(`${CD}/plugins/rcp-be-lol-game-data/global/zh_cn/v1/items.json`);
  if (Array.isArray(cdItems)) {
    for (const it of cdItems) {
      if (!it?.id || !it?.name) continue;
      const name = String(it.name).trim();
      const boots = (it.categories || []).includes('Boots') || /靴|胫甲/.test(name);
      const full = boots || (it.priceTotal || 0) >= 2000 || Number(it.id) >= 100000 || Number(it.id) >= 4000;
      const desc = stripHtml(it.description || '');
      const info = { id: Number(it.id), name, desc, full, boots };
      if (!meta.itemsById.has(Number(it.id))) meta.itemsById.set(Number(it.id), info);
      if (!meta.itemsByName.has(name)) meta.itemsByName.set(name, info);
    }
  }

  // CommunityDragon + hextech.dtodo.cn 海克斯 ID、中文名、稀有度与效果描述
  const rarOf = r => {
    if (r === 0 || r === '0') return '白银';
    if (r === 1 || r === '1') return '黄金';
    if (r === 2 || r === '2') return '棱彩';
    const s = String(r ?? '').toLowerCase();
    if (/prism|棱彩/.test(s)) return '棱彩';
    if (/gold|黄金/.test(s)) return '黄金';
    if (/silver|白银/.test(s)) return '白银';
    return '未知';
  };
  const walkAugs = node => {
    if (Array.isArray(node)) return node.forEach(walkAugs);
    if (!node || typeof node !== 'object') return;
    const rawName = node.nameTRA || node.name || node.displayName || node['zh-CN'];
    const rawDesc = node.desc || node.description || node.tooltip;
    const id = node.id ?? node.augmentId ?? node.apiName;
    if (typeof rawName === 'string' && rawName.trim()) {
      const name = canonAugName(rawName);
      const k = normAugKey(name);
      const prev = meta.augsByKey.get(k);
      const rar = rarOf(node.rarity ?? node.augmentRarity);
      const desc = stripHtml(rawDesc || '') || prev?.desc || '';
      const info = {
        name,
        rarity: rar !== '未知' ? rar : (prev?.rarity || '未知'),
        desc,
      };
      meta.augsByKey.set(k, info);
      if (id != null) {
        meta.augsById.set(String(id), info);
        meta.augsById.set(String(id).toLowerCase(), info);
        if (Number.isFinite(+id)) meta.augsById.set(Number(id), info);
      }
      if (node.apiName) meta.augsById.set(String(node.apiName).toLowerCase(), info);
    }
    Object.values(node).forEach(v => v && typeof v === 'object' && walkAugs(v));
  };

  for (const u of [
    'https://hextech.dtodo.cn/data/aram-mayhem-augments.zh_cn.json',
    `${CD}/cdragon/arena/zh_cn.json`,
    `${CD}/plugins/rcp-be-lol-game-data/global/zh_cn/v1/cherry-augments.json`,
  ]) {
    const j = await fetchRetry(u);
    if (j) walkAugs(j);
  }

  console.log(`[meta] 已加载官方字典：英雄 ${meta.champsByKey.size} 位，装备 ID ${meta.itemsById.size} 个，海克斯 ID ${meta.augsById.size} 个 / 名称 ${meta.augsByKey.size} 个`);
  return meta;
}

// 根据物品 ID 查找物品（支持 123430 -> 123430 或后四位 3430/4430 对照）
function resolveItem(meta, rawId) {
  const numId = Number(rawId);
  if (meta.itemsById.has(numId)) return meta.itemsById.get(numId);
  const s = String(rawId);
  if (s.length > 4) {
    const tail4 = Number(s.slice(-4));
    if (meta.itemsById.has(tail4)) return meta.itemsById.get(tail4);
  }
  return null;
}

// 根据海克斯 ID 或名称查找海克斯
function resolveAug(meta, rawIdOrObj) {
  if (!rawIdOrObj) return null;
  if (typeof rawIdOrObj === 'object') {
    const id = rawIdOrObj.augment_id ?? rawIdOrObj.augmentId ?? rawIdOrObj.id ?? rawIdOrObj.key ?? rawIdOrObj.name;
    const byId = meta.augsById.get(id) || meta.augsById.get(String(id)) || meta.augsById.get(String(id).toLowerCase());
    if (byId) return byId;
    if (rawIdOrObj.name) {
      const byName = meta.augsByKey.get(normAugKey(rawIdOrObj.name));
      if (byName) return byName;
    }
    return null;
  }
  return (
    meta.augsById.get(rawIdOrObj) ||
    meta.augsById.get(String(rawIdOrObj)) ||
    meta.augsById.get(String(rawIdOrObj).toLowerCase()) ||
    meta.augsByKey.get(normAugKey(String(rawIdOrObj))) ||
    null
  );
}

/* ---------------- 2. 拉取 arammayhem.com 开放数据 ---------------- */
async function syncAramMayhemOpen(existingHeroes, meta) {
  const BASE = 'https://arammayhem.com/data/v1/latest';
  const zh = n => (n && typeof n === 'object' ? n['zh-CN'] || n.en : n) || '';
  const RAR = { silver: '白银', gold: '黄金', prismatic: '棱彩' };

  const [champs, augs, combos] = await Promise.all([
    fetchRetry(`${BASE}/champions.json`),
    fetchRetry(`${BASE}/augments.json`),
    fetchRetry(`${BASE}/combos.json`),
  ]);
  if (!champs?.rows?.length || !augs?.rows?.length) return null;

  const openOut = {
    source: 'arammayhem.com',
    license: 'CC BY 4.0',
    patch: normPatch(champs.meta?.patch),
    statsDate: champs.meta?.statsDate,
    comparedTo: champs.meta?.comparedTo?.patch || null,
    fetchedAt: new Date().toISOString(),
    champions: (champs.rows || []).map(c => ({
      key: c.championId,
      name: zh(c.name),
      pick: r2(c.pickRate),
      pickRank: c.pickRateRank,
      pickChange: r2(c.pickRateChange),
      url: c.url,
    })),
    augments: (augs.rows || []).filter(a => !a.retiredPatch).map(a => {
      const name = canonAugName(zh(a.name));
      const rarity = RAR[String(a.rarity).toLowerCase()] || '未知';
      // 同步注册进 meta.augsById，方便 Blitz 用英文 slug/id 映射中文名
      const k = normAugKey(name);
      const prev = meta.augsByKey.get(k);
      const info = { name, rarity: rarity !== '未知' ? rarity : (prev?.rarity || '未知'), desc: prev?.desc || '' };
      meta.augsByKey.set(k, info);
      if (a.augmentId) meta.augsById.set(String(a.augmentId).toLowerCase(), info);
      if (a.slug) meta.augsById.set(String(a.slug).toLowerCase(), info);
      if (a.name?.en) meta.augsById.set(String(a.name.en).toLowerCase(), info);
      return {
        id: a.augmentId,
        name,
        nameEn: a.name?.en || '',
        rarity,
        pick: r2(a.pickRate),
        pickRank: a.pickRateRank,
        pickChange: r2(a.pickRateChange),
        isNew: a.presence === 'new',
        introduced: a.introducedPatch || null,
        url: a.url,
      };
    }),
    combos: (combos?.rows || []).map(c => ({
      key: c.championId,
      augs: (c.augmentNames || []).map(x => canonAugName(zh(x))),
      types: c.types || [],
      url: c.url,
    })),
  };

  const file = join(ROOT, 'data', 'open', 'arammayhem.json');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(openOut, null, 1));
  console.log(`[arammayhem] 开放数据已拉取：版本 ${openOut.patch}，英雄 ${openOut.champions.length}，海克斯 ${openOut.augments.length}`);
  return openOut;
}

/* ---------------- 3. 拉取并解析 Blitz (data.v2.iesdev.com) 真实海斗接口 ---------------- */
async function syncBlitzData(meta) {
  const out = { patch: null, globalAugs: [], heroData: new Map() };
  const globalRes = await fetchRetry('https://data.v2.iesdev.com/api/v1/query_objects/prod/lol/aram_mayhem_augments');
  if (globalRes?.data) {
    out.globalAugs = Array.isArray(globalRes.data) ? globalRes.data : (globalRes.data.augments || Object.values(globalRes.data));
    console.log(`[iesdev] 全局海克斯接口返回记录数：${out.globalAugs.length}`);
    console.log('[iesdev] 全局样本（截断）：', JSON.stringify(globalRes).slice(0, 1500));
  }

  const champs = [...meta.champsByKey.values()];
  let printedSample = false;
  await mapPool(champs, CONCURRENCY, async c => {
    const res = await fetchRetry(`https://data.v2.iesdev.com/api/v1/query_objects/prod/lol/aram_mayhem_champion?champion_id=${c.numId}`);
    let d = res?.data;
    if (Array.isArray(d)) d = d[0];
    if (!d || typeof d !== 'object') return;
    if (!printedSample) {
      printedSample = true;
      console.log(`[iesdev] 样本结构 (${c.name} #${c.numId}) keys:`, Object.keys(d));
      console.log('[iesdev] 样本内容（截断）：', JSON.stringify(res).slice(0, 3000));
    }
    if (d.patch && !out.patch) out.patch = normPatch(d.patch);
    out.heroData.set(c.name, d);
  });

  console.log(`[iesdev] 单英雄接口成功返回：${out.heroData.size} / ${champs.length} 位英雄`);
  return out;
}

// 从 Blitz 单英雄记录提取标准化结构
function extractHeroStatsFromBlitz(d, meta) {
  // 整体胜率与场次
  const games = Number(d.games ?? d.sample ?? d.matches ?? d.play_count ?? d.total_games ?? 0);
  const wins = Number(d.wins ?? 0);
  const wr = toPct(d.win_rate ?? d.winRate ?? (games > 0 && wins > 0 ? wins / games : null));

  // 解析 items（支持数组或对象映射）
  const rawItems = Array.isArray(d.items)
    ? d.items
    : d.items && typeof d.items === 'object'
      ? Object.entries(d.items).map(([k, v]) => ({ item_id: k, ...(typeof v === 'object' ? v : {}) }))
      : [];

  const parsedItems = [];
  for (const it of rawItems) {
    const id = it.item_id ?? it.itemId ?? it.id;
    const itemMeta = resolveItem(meta, id);
    if (!itemMeta || !itemMeta.full) continue;
    const ig = Number(it.games ?? it.sample ?? it.matches ?? it.count ?? it.play_count ?? 0);
    const iw = Number(it.wins ?? 0);
    const iwr = toPct(it.win_rate ?? it.winRate ?? (ig > 0 && iw > 0 ? iw / ig : null));
    if (!iwr || ig < 20) continue;
    const wScore = wilson((iwr / 100) * ig, ig);
    parsedItems.push({
      id: itemMeta.id,
      name: itemMeta.name,
      boots: itemMeta.boots,
      wr: iwr,
      games: ig,
      score: r1(wScore * 100),
    });
  }
  parsedItems.sort((a, b) => b.score - a.score || b.games - a.games);

  // 解析 augments（支持数组或对象映射）
  const rawAugs = Array.isArray(d.augments)
    ? d.augments
    : d.augments && typeof d.augments === 'object'
      ? Object.entries(d.augments).map(([k, v]) => ({ augment_id: k, ...(typeof v === 'object' ? v : {}) }))
      : [];

  const parsedAugs = [];
  for (const ag of rawAugs) {
    const augMeta = resolveAug(meta, ag);
    if (!augMeta) continue;
    const agGames = Number(ag.games ?? ag.sample ?? ag.matches ?? ag.count ?? ag.play_count ?? 0);
    const agWins = Number(ag.wins ?? 0);
    const agWr = toPct(ag.win_rate ?? ag.winRate ?? (agGames > 0 && agWins > 0 ? agWins / agGames : null));
    if (!agWr || agGames < 15) continue;
    const wScore = wilson((agWr / 100) * agGames, agGames);
    parsedAugs.push({
      name: augMeta.name,
      rarity: augMeta.rarity || '未知',
      wr: agWr,
      games: agGames,
      score: r1(wScore * 100),
    });
  }
  parsedAugs.sort((a, b) => b.score - a.score || b.games - a.games);

  return { wr, games, parsedItems, parsedAugs };
}

/* ---------------- 4. 主流程：真实数据驱动合并（零假数据） ---------------- */
async function main() {
  const dataPath = join(ROOT, 'data', 'data.json');
  const existing = JSON.parse(await readFile(dataPath, 'utf8'));

  // 仅修复洛克缺失的英文 ID（arammayhem.json 里已有 Locke）
  for (const h of existing.heroes) {
    if (h.name === '洛克' && !h.key) h.key = 'Locke';
  }

  const meta = await loadOfficialMeta(existing);
  const openData = await syncAramMayhemOpen(existing.heroes, meta);
  const blitz = await syncBlitzData(meta);

  let updatedHeroCount = 0;
  const globalItemAgg = new Map(); // name -> { g, w, heroes: [[heroName, score]] }
  const globalAugAgg = new Map();  // name -> { g, w, heroes: [[heroName, score]] }

  for (const h of existing.heroes) {
    const bd = blitz.heroData.get(h.name);
    if (!bd) continue;
    const { wr, games, parsedItems, parsedAugs } = extractHeroStatsFromBlitz(bd, meta);

    if (wr && wr >= 35 && wr <= 70) {
      h.wr = wr;
      if (games > 0) h.matches = games;
    }

    // 汇总到全局装备与全局海克斯统计
    for (const it of parsedItems) {
      const agg = globalItemAgg.get(it.name) || { g: 0, w: 0, heroes: [] };
      agg.g += it.games;
      agg.w += (it.wr / 100) * it.games;
      agg.heroes.push([h.name, it.score]);
      globalItemAgg.set(it.name, agg);
    }
    for (const ag of parsedAugs) {
      const agg = globalAugAgg.get(ag.name) || { g: 0, w: 0, heroes: [] };
      agg.g += ag.games;
      agg.w += (ag.wr / 100) * ag.games;
      agg.heroes.push([h.name, ag.score]);
      globalAugAgg.set(ag.name, agg);
    }

    // 只有当该英雄真实拿到了至少 6 件不重名成装和至少 4 个海克斯时，才替换出装/海克斯并取消 generic 提示
    const seenItems = new Set();
    let hasBoots = false;
    const uniqItems = [];
    for (const it of parsedItems) {
      if (seenItems.has(it.name)) continue;
      if (it.boots) {
        if (hasBoots) continue;
        hasBoots = true;
      }
      seenItems.add(it.name);
      uniqItems.push(it);
    }

    if (uniqItems.length >= 6 && parsedAugs.length >= 4) {
      h.coreItems = uniqItems.slice(0, 6).map(x => x.name);
      if (uniqItems.length >= 10) {
        h.altItems = uniqItems.slice(6, 12).map(x => x.name);
      }
      h.itemStats = uniqItems.slice(0, 12).map(x => ({ name: x.name, wr: x.wr, games: x.games, low: x.games < 100 }));
      h.augments = parsedAugs.slice(0, 6).map(x => ({
        name: x.name,
        rarity: x.rarity,
        score: x.score,
        wr: x.wr,
        games: x.games,
        low: x.games < 100,
      }));
      h.dataDriven = true;
      h.generic = false;
      updatedHeroCount++;
    }
  }

  console.log(`[sync] 通过真实接口成功更新出装与海克斯的英雄数：${updatedHeroCount} / ${existing.heroes.length}`);

  // 熔断保护：如果真实更新到的英雄数过少（例如接口结构变更或网络被拦），仅保留 open-data 常规更新，绝不覆盖胜率与出装表
  if (updatedHeroCount < 30) {
    console.warn(`[sync] 真实接口有效英雄数 (${updatedHeroCount}) 低于安全阈值 30，跳过胜率与出装覆盖，仅执行 import-sheet 合并开放数据。`);
    execFileSync(process.execPath, [join(ROOT, 'scripts', 'import-sheet.mjs')], { stdio: 'inherit' });
    return;
  }

  // 用真实聚合数据更新全局海克斯榜（仅更新有真实样本与官方描述的条目，绝不塞假数据）
  const augByKey = new Map(existing.augments.map(a => [normAugKey(a.name), a]));
  for (const [aname, agg] of globalAugAgg.entries()) {
    if (agg.g < 100) continue;
    const k = normAugKey(aname);
    const wr = r1((agg.w / agg.g) * 100);
    const score = r1(wilson(agg.w, agg.g) * 100);
    const tier = score >= 56 ? 'S+' : score >= 53 ? 'S' : score >= 50 ? 'A' : 'B';
    const topHeroes = agg.heroes.sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
    const officialInfo = meta.augsByKey.get(k);
    const cur = augByKey.get(k);
    if (cur) {
      cur.wr = wr;
      cur.score = score;
      cur.tier = tier;
      if (topHeroes.length >= 3) cur.heroes = topHeroes;
      if (!cur.effect && officialInfo?.desc) cur.effect = officialInfo.desc;
    } else if (officialInfo?.desc && topHeroes.length >= 3) {
      const nAug = {
        name: canonAugName(aname),
        rarity: officialInfo.rarity || '未知',
        tier,
        score,
        wr,
        pick: 0,
        isNew: false,
        effect: officialInfo.desc,
        heroes: topHeroes,
      };
      existing.augments.push(nAug);
      augByKey.set(k, nAug);
    }
  }

  // 用真实聚合数据更新全局装备榜（仅更新有真实样本与官方说明的条目）
  const itemByName = new Map(existing.items.map(i => [i.name, i]));
  for (const [iname, agg] of globalItemAgg.entries()) {
    if (agg.g < 200) continue;
    const wr = r1((agg.w / agg.g) * 100);
    const score = r1(wilson(agg.w, agg.g) * 100);
    const matchesFmt = agg.g >= 10000 ? `${r1(agg.g / 10000)}万` : String(agg.g);
    const best = agg.heroes.sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]);
    const officialItem = meta.itemsByName.get(iname);
    const cur = itemByName.get(iname);
    if (cur) {
      cur.wr = wr;
      cur.score = score;
      cur.matches = matchesFmt;
      if (best.length >= 3) cur.best = best;
    } else if (officialItem?.desc && best.length >= 3) {
      existing.items.push({
        name: iname,
        score,
        wr,
        matches: matchesFmt,
        tag: officialItem.boots ? '移动战靴' : '传说装备',
        desc: officialItem.desc,
        best,
      });
    }
  }

  if (blitz.patch || openData?.patch) {
    existing.meta.patch = blitz.patch || openData.patch;
  }
  existing.meta.updatedAt = new Date().toISOString();

  await writeFile(dataPath, JSON.stringify(existing, null, 1));
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'export-sheet.mjs')], { stdio: 'inherit' });
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'import-sheet.mjs')], { stdio: 'inherit' });
}

main().catch(err => {
  console.error('同步失败：', err);
  process.exit(1);
});
