#!/usr/bin/env node
/**
 * 下载英雄头像、装备图标、海克斯图标到 assets/icons/，并生成 data/icons.js（名称 → 本地图片路径）。
 * 网页优先使用这些本地图片；scripts/build-standalone.mjs 打包单文件版时会把它们直接嵌进去。
 *
 * 数据来源：
 *   英雄头像   腾讯 game.gtimg.cn，失败换 Data Dragon
 *   装备图标   Data Dragon zh_CN item.json（按中文名匹配）
 *   海克斯图标 CommunityDragon：自动扫描目录里所有含 augment 的 JSON（斗魂竞技场、海克斯大乱斗等），按中文名匹配
 *
 * 用法：node scripts/fetch-icons.mjs        已下载的图片会跳过，网页用不到的旧图标会删掉
 */
import { readFile, writeFile, mkdir, access, readdir, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(join(ROOT, 'data', 'data.json'), 'utf8'));
const DIR = join(ROOT, 'assets', 'icons');
const CD = 'https://raw.communitydragon.org/latest';
const DD = 'https://ddragon.leagueoflegends.com';

const nk = s => String(s || '').replace(/[\s·・：:！!，,。.（）()]/g, '').toLowerCase();
const exists = p => access(p).then(() => true, () => false);
async function get(url, type = 'json') {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return type === 'json' ? await r.json() : type === 'text' ? await r.text() : Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}
async function save(file, urls) {
  if (await exists(file)) return true;
  for (const u of urls.filter(Boolean)) {
    const buf = await get(u, 'buf');
    if (buf && buf.length > 300) { await writeFile(file, buf); return true; }
  }
  return false;
}
const safeName = s => s.replace(/[\\/:*?"<>|]/g, '_');

/* ---------- 需要图标的名称 ---------- */
const itemNames = new Set([...data.items.map(i => i.name), ...data.heroes.flatMap(h => [...h.coreItems, ...h.altItems])]);
const augInfo = new Map();
[...data.augments, ...data.heroes.flatMap(h => h.augments)].forEach(a => { if (!augInfo.has(a.name)) augInfo.set(a.name, a.rarity); });

await mkdir(join(DIR, 'champ'), { recursive: true });
await mkdir(join(DIR, 'item'), { recursive: true });
await mkdir(join(DIR, 'aug'), { recursive: true });

const ddv = (await get(DD + '/api/versions.json'))?.[0];
console.log('Data Dragon 版本', ddv || '获取失败');

/* ---------- 英雄头像 ---------- */
let champOk = 0; const champMiss = [];
for (const h of data.heroes) {
  if (!h.key) { champMiss.push(h.name); continue; }
  const ok = await save(join(DIR, 'champ', h.key + '.png'), [
    `https://game.gtimg.cn/images/lol/act/img/champion/${h.key}.png`,
    ddv && `${DD}/cdn/${ddv}/img/champion/${h.key}.png`,
  ]);
  ok ? champOk++ : champMiss.push(h.name);
}

/* ---------- 装备图标 ---------- */
const itemMap = {}; const itemMiss = [];
const itemJson = ddv ? await get(`${DD}/cdn/${ddv}/data/zh_CN/item.json`) : null;
const ddItems = new Map();
if (itemJson?.data) {
  Object.entries(itemJson.data).forEach(([id, it]) => {
    const k = nk(it.name);
    // 同名装备（如奥恩升级版）保留编号最小的
    if (!ddItems.has(k) || +id < +ddItems.get(k)) ddItems.set(k, id);
  });
}
for (const name of itemNames) {
  const id = ddItems.get(nk(name));
  if (!id) { itemMiss.push(name); continue; }
  const rel = `assets/icons/item/${id}.png`;
  if (await save(join(ROOT, rel), [`${DD}/cdn/${ddv}/img/item/${id}.png`])) itemMap[name] = rel;
  else itemMiss.push(name);
}

/* ---------- 海克斯图标：扫描 CommunityDragon 上所有海克斯数据 ---------- */
// 把各种 JSON 里的图标路径转成完整地址
function iconUrl(p) {
  if (!p || typeof p !== 'string') return null;
  const s = p.toLowerCase();
  if (s.startsWith('http')) return p;
  if (s.startsWith('/lol-game-data/assets/')) return `${CD}/plugins/rcp-be-lol-game-data/global/default/${s.slice('/lol-game-data/assets/'.length)}`;
  return `${CD}/game/${s.replace(/^\//, '').replace(/\.(tex|dds)$/, '.png')}`;
}
// 在任意 JSON 结构里找 {名称, 图标} 对
function collect(node, out) {
  if (Array.isArray(node)) { node.forEach(n => collect(n, out)); return; }
  if (!node || typeof node !== 'object') return;
  const name = node.nameTRA || node.name || node.displayName || node.DisplayName;
  const keys = Object.keys(node);
  const iconKey = keys.find(k => /small.*icon|icon.*small/i.test(k) && typeof node[k] === 'string')
    || keys.find(k => /icon/i.test(k) && typeof node[k] === 'string' && /\.(png|tex|dds)$/i.test(node[k]));
  if (typeof name === 'string' && iconKey) {
    const k = nk(name);
    if (k && !out.has(k)) out.set(k, iconUrl(node[iconKey]));
  }
  Object.values(node).forEach(v => { if (v && typeof v === 'object') collect(v, out); });
}
// 读取目录页，列出含 augment / kiwi / mayhem 的 JSON
async function listJson(dirUrl) {
  const html = await get(dirUrl, 'text');
  if (!html) return [];
  return [...html.matchAll(/href="([^"]+\.json)"/gi)].map(m => m[1])
    .filter(f => /augment|kiwi|mayhem|aram/i.test(f))
    .map(f => (f.startsWith('http') ? f : dirUrl + f.replace(/^\.?\//, '')));
}
const sources = new Set([
  `${CD}/cdragon/arena/zh_cn.json`,
  `${CD}/plugins/rcp-be-lol-game-data/global/zh_cn/v1/cherry-augments.json`,
  ...(await listJson(`${CD}/plugins/rcp-be-lol-game-data/global/zh_cn/v1/`)),
]);
// cdragon/ 下每个子目录（arena、kiwi 等）的 zh_cn.json
const cdDirs = await get(`${CD}/cdragon/`, 'text');
if (cdDirs) {
  [...cdDirs.matchAll(/href="([a-z0-9_-]+)\/"/gi)].map(m => m[1])
    .filter(d => /arena|kiwi|mayhem|aram|augment/i.test(d))
    .forEach(d => sources.add(`${CD}/cdragon/${d}/zh_cn.json`));
}
const augIcons = new Map();
for (const url of sources) {
  const j = await get(url);
  if (!j) { console.log('  无法读取', url); continue; }
  const before = augIcons.size;
  collect(j, augIcons);
  console.log(`  ${url} → 新增 ${augIcons.size - before} 个图标`);
}
const augMap = {}; const augMiss = [];
for (const [name] of augInfo) {
  const u = augIcons.get(nk(name));
  if (!u) { augMiss.push(name); continue; }
  const rel = `assets/icons/aug/${safeName(nk(name))}.png`;
  if (await save(join(ROOT, rel), [u])) augMap[name] = rel;
  else augMiss.push(name);
}

/* ---------- 删掉网页已经用不到的旧图标 ---------- */
const keep = new Set([...Object.values(itemMap), ...Object.values(augMap), ...data.heroes.filter(h => h.key).map(h => `assets/icons/champ/${h.key}.png`)]);
let removed = 0;
// 只有装备和海克斯资料都下载成功时才清理，避免网络出错时误删
if (ddv && ddItems.size && augIcons.size) for (const sub of ['champ', 'item', 'aug']) {
  for (const f of await readdir(join(DIR, sub))) {
    if (!keep.has(`assets/icons/${sub}/${f}`)) { await unlink(join(DIR, sub, f)); removed++; }
  }
}
if (removed) console.log(`删掉了 ${removed} 个用不到的旧图标`);

/* ---------- 写出映射 ---------- */
await writeFile(join(ROOT, 'data', 'icons.js'),
  '/* 自动生成：scripts/fetch-icons.mjs */\n' +
  `window.HEX_ITEM_ICONS = ${JSON.stringify(itemMap)};\n` +
  `window.HEX_AUG_ICONS = ${JSON.stringify(augMap)};\n`);

console.log(`英雄头像 ${champOk}/${data.heroes.length}${champMiss.length ? '，缺：' + champMiss.join('、') : ''}`);
console.log(`装备图标 ${Object.keys(itemMap).length}/${itemNames.size}${itemMiss.length ? '，缺：' + itemMiss.join('、') : ''}`);
console.log(`海克斯图标 ${Object.keys(augMap).length}/${augInfo.size}${augMiss.length ? '，缺：' + augMiss.join('、') : ''}`);
