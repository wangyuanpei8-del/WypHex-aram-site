// 自动更新海克斯效果说明（海斗版文字），写入 data/augment-descriptions.js。
// 来源：Hexdata 公开的海克斯详情页（robots 允许，注明出处）。为不给对方添负担：
// 每次最多读 MAX 页、每页间隔 3 秒，遇到限流（429）或出错立即停，下次接着读；先补缺的，再轮流刷新最久没核对的。
// 用法：node scripts/fetch-descriptions.mjs
import { readFile, writeFile } from 'node:fs/promises';

const BASE = 'https://hexdata.com.cn';
const MAX = 25;
const UA = { 'User-Agent': 'hexaram-site (github.com/wangyuanpei8-del/WypHex-aram-site)', 'Accept-Language': 'zh-CN,zh;q=0.9' };
const root = new URL('../', import.meta.url);
const FILE = new URL('data/augment-descriptions.js', root);
const nk = n => String(n).replace(/[\s·・!！?？:：,，.。'"“”（）()]/g, '').toLowerCase();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function page(path) {
  const r = await fetch(BASE + path, { headers: UA, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.text();
}
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·' };
const decode = s => s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m);
const text = h => decode(h.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
// 详情页里“效果”那一段：夹在推荐语和通用建议之间
const extract = html => /这类高分高样本英雄上考虑[。.]\s*([\s\S]*?)\s*如果你的英雄机制/.exec(text(html))?.[1]?.trim() || '';
const valid = s => typeof s === 'string' && s.length >= 4 && s.length <= 2000 && !/(?:\.{3}|…)$|@[^@]+@|\{\{|<[^>]+>|如果你的英雄机制|这类高分高样本/.test(s);
function pageInfo(html) {
  const meta = n => (new RegExp(`<meta[^>]+(?:name|property)=["']${n}["'][^>]*content=["']([^"']+)`, 'i').exec(html) || [])[1];
  const t = text(html);
  return { patch: meta('report-patch') || (/Patch\s*(\d+\.\d+)/i.exec(t) || [])[1] || null, date: meta('report-date') || (/数据日期\D{0,6}(\d{4}-\d{2}-\d{2})/.exec(t) || [])[1] || null };
}

// 现有说明
const old = {};
new Function('window', await readFile(FILE, 'utf8'))(old);
const desc = old.HEX_AUG_DESCRIPTIONS || {}, meta = old.HEX_AUG_DESCRIPTION_META || {}, sources = old.HEX_AUG_SOURCES || {};
const findKey = (obj, name) => Object.keys(obj).find(k => nk(k) === nk(name));

// 网页用到的海克斯
const src = JSON.parse(await readFile(new URL('data/open/aramhex.json', root), 'utf8'));
const wanted = new Map();
for (const h of src.heroes) for (const a of h.augs) wanted.set(nk(a.name), a.name);

// 海克斯列表页：名称 → 详情页地址
let list;
try { list = await page('/augments'); } catch (e) { console.log(`读取 Hexdata 海克斯列表失败（${e.message}），保留现有说明`); process.exit(0); }
const slug = new Map();
for (const m of list.matchAll(/<a\b[^>]*href=["'][^"']*\/augments?\/([^"'?#/]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
  const k = nk(text(m[2])); if (k && !slug.has(k)) slug.set(k, decodeURIComponent(m[1]));
}

// 先补缺的，再按核对日期从旧到新
const queue = [...wanted.entries()].filter(([k]) => slug.has(k)).map(([k, name]) => {
  const key = findKey(desc, name);
  return { k, name, key, checked: key ? (meta[key]?.checkedAt || meta[key]?.date || '') : null };
}).sort((a, b) => (a.key ? 1 : 0) - (b.key ? 1 : 0) || String(a.checked).localeCompare(String(b.checked))).slice(0, MAX);

const today = new Date().toISOString().slice(0, 10);
let read = 0, changed = 0;
for (const q of queue) {
  const path = `/augment/${encodeURIComponent(slug.get(q.k))}`;
  let html;
  try { html = await page(path); } catch (e) { console.log(`${path} 读取失败（${e.message}），本次停止，下次继续`); break; }
  read++;
  const s = extract(html), info = pageInfo(html);
  if (q.key && q.key !== q.name) { desc[q.name] = desc[q.key]; meta[q.name] = meta[q.key]; delete desc[q.key]; delete meta[q.key]; delete sources[q.key]; }
  if (valid(s)) {
    if (desc[q.name] !== s) changed++;
    desc[q.name] = s;
    meta[q.name] = { status: 'current', patch: info.patch, date: info.date || today, checkedAt: today };
  } else if (meta[q.name]) meta[q.name].checkedAt = today; // 页面结构不对时保留原文，不猜
  sources[q.name] = BASE + path;
  await sleep(3000);
}

await writeFile(FILE, '/* 自动生成；海克斯效果说明来自 Hexdata（hexdata.com.cn）公开的海克斯详情页。 */\n'
  + 'window.HEX_AUG_DESCRIPTIONS = ' + JSON.stringify(desc) + ';\nwindow.HEX_AUG_SOURCES = ' + JSON.stringify(sources) + ';\nwindow.HEX_AUG_DESCRIPTION_META = ' + JSON.stringify(meta) + ';\n');
const missing = [...wanted.values()].filter(n => !findKey(desc, n));
console.log(`效果说明：本次读 ${read}/${queue.length} 页，更新 ${changed} 条；共 ${wanted.size} 个海克斯，仍缺 ${missing.length} 个${missing.length ? '：' + missing.join('、') : ''}`);
