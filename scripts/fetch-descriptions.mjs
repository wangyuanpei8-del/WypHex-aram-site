// 从游戏文件（CommunityDragon 解包的国服中文资料）自动更新海克斯效果说明，写入 data/augment-descriptions.js。
// 只接受变量全部能换成数字的说明；换不出来的保留原来的说明（之前从 Hexdata 收录），不猜内容。
// 用法：node scripts/fetch-descriptions.mjs
import { readFile, writeFile } from 'node:fs/promises';

const CD = 'https://raw.communitydragon.org/latest';
const root = new URL('../', import.meta.url);
const FILE = new URL('data/augment-descriptions.js', root);
const nk = n => String(n).replace(/[\s·・!！?？:：,，.。'"“”（）()]/g, '').toLowerCase();

async function get(url, type = 'json') {
  try { const r = await fetch(url); if (!r.ok) return null; return type === 'json' ? await r.json() : await r.text(); }
  catch { return null; }
}

// 旧文件：保留已有说明
const old = {};
new Function('window', await readFile(FILE, 'utf8'))(old);
const desc = { ...(old.HEX_AUG_DESCRIPTIONS || {}) };
const meta = { ...(old.HEX_AUG_DESCRIPTION_META || {}) };
const sources = { ...(old.HEX_AUG_SOURCES || {}) };

// 网页用到的海克斯名称
const src = JSON.parse(await readFile(new URL('data/open/aramhex.json', root), 'utf8'));
const wanted = new Map();
for (const h of src.heroes) for (const a of h.augs) wanted.set(nk(a.name), a.name);

// 数字格式：最多两位小数
const num = v => String(Math.round(v * 100) / 100);
function render(text, values) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const vals = new Map(Object.entries(values || {}).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.find(x => x) ?? v[0] : v]));
  let ok = true;
  let s = text.replace(/@([A-Za-z0-9_.]+)(?:\*(-?[\d.]+))?@/g, (_, k, mul) => {
    const v = vals.get(k.toLowerCase());
    if (typeof v !== 'number') { ok = false; return ''; }
    return num(v * (mul ? Number(mul) : 1));
  });
  if (!ok) return null;
  s = s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length < 4 || s.length > 2000 || /@|\{\{|%i:/.test(s)) return null;
  return s;
}

// 在 JSON 里找带名称和说明的对象
const found = new Map();
function collect(node) {
  if (Array.isArray(node)) { node.forEach(collect); return; }
  if (!node || typeof node !== 'object') return;
  const name = node.nameTRA || node.name || node.displayName;
  const text = node.desc || node.description || node.tooltip || node.descriptionTRA;
  if (typeof name === 'string' && typeof text === 'string') {
    const k = nk(name);
    if (wanted.has(k) && !found.has(k)) {
      const s = render(text, node.dataValues || node.DataValues || node.values);
      if (s) found.set(k, s);
    }
  }
  Object.values(node).forEach(v => { if (v && typeof v === 'object') collect(v); });
}

const urls = new Set([`${CD}/cdragon/arena/zh_cn.json`, `${CD}/cdragon/kiwi/zh_cn.json`]);
const dirs = await get(`${CD}/cdragon/`, 'text');
if (dirs) [...dirs.matchAll(/href="([a-z0-9_-]+)\/"/gi)].map(m => m[1]).filter(d => /arena|kiwi|mayhem|aram|augment/i.test(d)).forEach(d => urls.add(`${CD}/cdragon/${d}/zh_cn.json`));
for (const url of urls) {
  const j = await get(url);
  if (!j) { console.log('  无法读取', url); continue; }
  const before = found.size; collect(j);
  console.log(`  ${url} → 新增 ${found.size - before} 条说明`);
}

const today = new Date().toISOString().slice(0, 10);
let updated = 0;
for (const [k, s] of found) {
  const name = wanted.get(k);
  const oldName = Object.keys(desc).find(n => nk(n) === k) || name;
  if (oldName !== name) { delete desc[oldName]; delete meta[oldName]; delete sources[oldName]; }
  if (desc[name] !== s) updated++;
  desc[name] = s;
  meta[name] = { status: 'current', patch: src.source.patch, date: today, source: 'game' };
  delete sources[name];
}
const missing = [...wanted.values()].filter(n => !desc[n] && !Object.keys(desc).some(d => nk(d) === nk(n)));
if (!found.size) { console.log('没有从游戏文件读到说明，保留原文件'); process.exit(0); }
await writeFile(FILE, '/* 自动生成；海克斯效果说明来自游戏文件（CommunityDragon），读不到的保留之前从 Hexdata（hexdata.com.cn）收录的说明。 */\n'
  + 'window.HEX_AUG_DESCRIPTIONS = ' + JSON.stringify(desc) + ';\nwindow.HEX_AUG_SOURCES = ' + JSON.stringify(sources) + ';\nwindow.HEX_AUG_DESCRIPTION_META = ' + JSON.stringify(meta) + ';\n');
console.log(`效果说明：游戏文件读到 ${found.size}/${wanted.size}，本次有变化 ${updated} 条；仍缺 ${missing.length} 个：${missing.join('、')}`);
