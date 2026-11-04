// 下载 Blitz（data.v2.iesdev.com）的海克斯大乱斗评级：每个英雄的海克斯评级、装备评级，以及海克斯全局评级。
// 注意：这个接口只给“评级”（tier 1~5，1 最强），没有胜率和场次，所以网页上显示的是 T1~T5，不显示胜率。
// 这是 Blitz 没有公开授权的内部接口，随时可能改版或失效；失效时本脚本不写文件，网页沿用上一次的结果。
// 结果写入 data/open/blitz.json，再由 import-sheet.mjs 合并进网页数据。
// 用法：node scripts/fetch-blitz.mjs
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://data.v2.iesdev.com/api/v1/query_objects/prod/lol';
const CD = 'https://raw.communitydragon.org/latest';
const DD = 'https://ddragon.leagueoflegends.com';
const UA = { 'User-Agent': 'hexaram-site (github.com/wangyuanpei8-del/WypHex-aram-site)' };
const nk = n => String(n || '').replace(/[\s·・!！?？:：,，.。'"“”\-—_（）()]/g, '').toLowerCase();

async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
      if (r.status === 404) return null;
      if (r.ok) return await r.json();
    } catch {}
    await new Promise(s => setTimeout(s, 1000 * (i + 1)));
  }
  return null;
}
async function pool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const k = i++; await fn(list[k]); } }));
}

/* ---------- 1. 用来核对名称的海斗海克斯清单（arammayhem 开放数据 + 表格） ---------- */
const open = JSON.parse(await readFile(join(ROOT, 'data', 'open', 'arammayhem.json'), 'utf8'));
const data = JSON.parse(await readFile(join(ROOT, 'data', 'data.json'), 'utf8'));
const known = new Map(); // nk(中文名) -> { name, rarity }
open.augments.forEach(a => known.set(nk(a.name), { name: a.name, rarity: a.rarity }));
data.augments.forEach(a => { if (!known.has(nk(a.name))) known.set(nk(a.name), { name: a.name, rarity: a.rarity || '未知' }); });
const knownEn = new Map(open.augments.filter(a => a.nameEn).map(a => [nk(a.nameEn), known.get(nk(a.name))]));

/* ---------- 2. Blitz 数据 ---------- */
const ddv = (await get(`${DD}/api/versions.json`))?.[0];
const champJson = ddv && await get(`${DD}/cdn/${ddv}/data/zh_CN/champion.json`);
if (!champJson?.data) { console.error('拿不到 Data Dragon 英雄列表，不更新'); process.exit(1); }
const champs = Object.values(champJson.data).map(c => ({ id: Number(c.key), key: c.id }));

const globalRes = await get(`${API}/aram_mayhem_augments`);
const globalRows = Array.isArray(globalRes?.data) ? globalRes.data : [];
const per = new Map(); // key -> {augments:{id:{tier}}, items:{id:{tier}}, patch}
await pool(champs, 8, async c => {
  const r = await get(`${API}/aram_mayhem_champion?champion_id=${c.id}`);
  let d = r?.data; if (Array.isArray(d)) d = d[0];
  if (d?.data?.augments || d?.data?.items) per.set(c.key, { ...d.data, patch: d.patch });
});
console.log(`[blitz] 全局海克斯 ${globalRows.length} 条；英雄数据 ${per.size} / ${champs.length}`);
if (per.size < 100) { console.error('Blitz 英雄数据太少（接口可能变了或被拦截），不更新'); process.exit(1); }

const patches = new Map();
per.forEach(v => patches.set(v.patch, (patches.get(v.patch) || 0) + 1));
globalRows.forEach(g => patches.set(g.patch, (patches.get(g.patch) || 0) + 1));
const blitzPatch = [...patches.keys()].filter(Boolean).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
console.log('[blitz] 版本分布', Object.fromEntries(patches), '→ 使用', blitzPatch);

const blitzAugIds = new Set();
per.forEach(v => Object.keys(v.augments || {}).forEach(id => blitzAugIds.add(String(id))));
globalRows.forEach(g => blitzAugIds.add(String(g.augment_id)));
const blitzItemIds = new Set();
per.forEach(v => Object.keys(v.items || {}).forEach(id => blitzItemIds.add(String(id))));
console.log(`[blitz] 出现过的海克斯 id ${blitzAugIds.size} 个，装备 id ${blitzItemIds.size} 个；海克斯 id 示例：${[...blitzAugIds].slice(0, 15).join(',')}`);

/* ---------- 3. 海克斯 id -> 中文名：逐个来源核对，只接受能在海斗海克斯清单里找到的名称 ---------- */
async function listJson(dirUrl, re) {
  try {
    const r = await fetch(dirUrl, { headers: UA, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return [];
    const html = await r.text();
    return [...html.matchAll(/href="([^"]+)"/gi)].map(m => m[1]).filter(f => re.test(f))
      .map(f => (f.startsWith('http') ? f : dirUrl + f.replace(/^\.?\//, '')));
  } catch { return []; }
}
const sources = new Set([
  'https://hextech.dtodo.cn/data/aram-mayhem-augments.zh_cn.json',
  `${CD}/cdragon/arena/zh_cn.json`,
  `${CD}/plugins/rcp-be-lol-game-data/global/zh_cn/v1/cherry-augments.json`,
  ...(await listJson(`${CD}/plugins/rcp-be-lol-game-data/global/zh_cn/v1/`, /(augment|kiwi|mayhem|aram)[^/]*\.json$/i)),
]);
for (const d of await listJson(`${CD}/cdragon/`, /^(?!\.)[a-z0-9_-]*(arena|kiwi|mayhem|aram|augment)[a-z0-9_-]*\/$/i)) sources.add(`${d}zh_cn.json`);

function collectIds(node, out) {
  if (Array.isArray(node)) { node.forEach(n => collectIds(n, out)); return; }
  if (!node || typeof node !== 'object') return;
  const name = node.nameTRA || node.name || node.displayName;
  const id = node.id ?? node.augmentId;
  if (typeof name === 'string' && id != null && /^\d+$/.test(String(id))) out.push({ id: String(id), name, en: node.apiName || '' });
  Object.values(node).forEach(v => { if (v && typeof v === 'object') collectIds(v, out); });
}
const augMap = new Map(); // id -> { name, rarity }
for (const url of sources) {
  const j = await get(url, 1);
  if (!j) { console.log(`  [海克斯字典] 读不到 ${url}`); continue; }
  const rows = []; collectIds(j, rows);
  let hit = 0, valid = 0, conflict = 0, added = 0;
  for (const r of rows) {
    if (!blitzAugIds.has(r.id)) continue;
    hit++;
    const k = known.get(nk(r.name)) || knownEn.get(nk(r.name));
    if (!k) continue;
    valid++;
    const prev = augMap.get(r.id);
    if (prev && prev.name !== k.name) { conflict++; continue; }
    if (!prev) { augMap.set(r.id, k); added++; }
  }
  console.log(`  [海克斯字典] ${url}：带编号 ${rows.length}，对上 Blitz id ${hit}，名称核对通过 ${valid}，新增 ${added}，冲突 ${conflict}`);
}
const augMiss = [...blitzAugIds].filter(id => !augMap.has(id));
console.log(`[海克斯] 已对上中文名 ${augMap.size} / ${blitzAugIds.size}；对不上的 id 示例：${augMiss.slice(0, 30).join(',')}`);

/* ---------- 4. 装备 id -> 中文名（只要成装和二级鞋） ---------- */
const itemMap = new Map();
const itemJson = await get(`${DD}/cdn/${ddv}/data/zh_CN/item.json`);
Object.entries(itemJson?.data || {}).forEach(([id, it]) => {
  const boots = (it.tags || []).includes('Boots') && (it.from || []).length > 0;
  const full = boots || ((it.gold?.total || 0) >= 2000 && !(it.into || []).length && !it.requiredAlly && !(it.tags || []).includes('Consumable'));
  if (full) itemMap.set(id, { name: it.name, boots });
});
const cdItems = await get(`${CD}/plugins/rcp-be-lol-game-data/global/zh_cn/v1/items.json`, 1);
(Array.isArray(cdItems) ? cdItems : []).forEach(it => {
  const id = String(it.id);
  if (itemMap.has(id) || !blitzItemIds.has(id)) return;
  const boots = (it.categories || []).includes('Boots') && (it.from || []).length > 0;
  const full = boots || ((it.priceTotal || 0) >= 2000 && !(it.to || []).length && !it.requiredAlly);
  if (full && it.name) itemMap.set(id, { name: String(it.name).trim(), boots });
});
const itemHit = [...blitzItemIds].filter(id => itemMap.has(id)).length;
console.log(`[装备] Blitz 装备 id 中是成装/鞋的 ${itemHit} / ${blitzItemIds.size}（其余是小件或查不到，跳过）`);

/* ---------- 5. 整理输出 ---------- */
const byTier = (a, b) => a.tier - b.tier;
const champions = {};
let good = 0;
for (const [key, v] of per) {
  if (v.patch !== blitzPatch) continue;
  const augs = Object.entries(v.augments || {}).filter(([id, x]) => augMap.has(id) && Number.isFinite(+x?.tier))
    .map(([id, x]) => ({ name: augMap.get(id).name, rarity: augMap.get(id).rarity, tier: +x.tier })).sort(byTier);
  const items = Object.entries(v.items || {}).filter(([id, x]) => itemMap.has(id) && Number.isFinite(+x?.tier))
    .map(([id, x]) => ({ name: itemMap.get(id).name, boots: itemMap.get(id).boots, tier: +x.tier })).sort(byTier);
  const seen = new Set();
  const uniqItems = items.filter(i => !seen.has(i.name) && seen.add(i.name));
  champions[key] = { augs, items: uniqItems };
  if (augs.length >= 4 && uniqItems.length >= 6) good++;
}
const augments = globalRows.filter(g => g.patch === blitzPatch && augMap.has(String(g.augment_id)) && Number.isFinite(+g.stats?.tier))
  .map(g => ({ name: augMap.get(String(g.augment_id)).name, tier: +g.stats.tier }));

// 自检：评级 1 是不是“最强”？看各评级的平均选取率（1 应该最高）
const pickBy = new Map(open.augments.map(a => [a.name, a.pick]));
const tierPick = {};
augments.forEach(a => { const p = pickBy.get(a.name); if (p != null) (tierPick[a.tier] ||= []).push(p); });
console.log('[自检] 各评级海克斯的平均选取率：', Object.fromEntries(Object.entries(tierPick).map(([t, l]) => [`T${t}`, `${(l.reduce((s, x) => s + x, 0) / l.length).toFixed(1)}%（${l.length}个）`])));
const tierCount = {};
Object.values(champions).forEach(c => c.augs.forEach(a => { tierCount[a.tier] = (tierCount[a.tier] || 0) + 1; }));
console.log('[自检] 英雄海克斯评级分布：', tierCount);
const sample = champions.Yasuo || Object.values(champions)[0];
if (sample) console.log('[样本] 亚索 海克斯前 8：', sample.augs.slice(0, 8).map(a => `${a.name}(T${a.tier})`).join('、'), '｜装备前 8：', sample.items.slice(0, 8).map(i => `${i.name}(T${i.tier})`).join('、'));
console.log(`[blitz] 海克斯和装备都够用的英雄 ${good} 位`);

if (good < 100 || augMap.size < 50) { console.error('能用的数据太少（可能是编号对不上），不写文件，网页沿用上一次的结果'); process.exit(1); }

const out = {
  source: 'Blitz（blitz.gg）', note: '只有评级 T1~T5，没有胜率；非公开授权接口', patch: String(blitzPatch).replace(/^16\./, '26.'),
  fetchedAt: new Date().toISOString(), champions, augments,
};
const file = join(ROOT, 'data', 'open', 'blitz.json');
await mkdir(dirname(file), { recursive: true });
let prev = null;
try { prev = JSON.parse(await readFile(file, 'utf8')); } catch {}
if (prev && JSON.stringify({ ...prev, fetchedAt: 0 }) === JSON.stringify({ ...out, fetchedAt: 0 })) console.log('Blitz 数据没有变化');
else { await writeFile(file, JSON.stringify(out)); console.log(`已写入 data/open/blitz.json：版本 ${blitzPatch}，英雄 ${Object.keys(champions).length}，全局海克斯 ${augments.length}`); }
