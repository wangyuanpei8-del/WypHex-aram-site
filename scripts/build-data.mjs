// 生成网页数据 data/data.js：每个英雄的海克斯胜率排名和推荐出装。
// 输入：data/heroes.json（英雄中文名、称号、头像编号、外号）+ data/open/hexdata.json（fetch-hexdata.mjs 下载）
// 海克斯排名 = 英雄页列出的 8 个 + 海克斯详情页里这位英雄的搭配胜率，按胜率从高到低排。
// 用法：node scripts/build-data.mjs
import { detailDates } from './data-quality.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const heroes = JSON.parse(await readFile(join(ROOT, 'data', 'heroes.json'), 'utf8'));
const hex = JSON.parse(await readFile(join(ROOT, 'data', 'open', 'hexdata.json'), 'utf8'));

// 名称比较时忽略空格和标点（“鼓声暴起 低音轰鸣”和“鼓声暴起低音轰鸣”是同一个）
const nk = n => String(n).replace(/[\s·・!！?？:：,，.。'"“”]/g, '').toLowerCase();
// Hexdata 用客户端版本号（16.21），游戏里叫 26.21
const patch = p => { const m = /^(\d+)\.(\d+)/.exec(p || ''); return m ? `${+m[1] < 20 ? +m[1] + 10 : +m[1]}.${m[2]}` : ''; };

const augByKey = new Map(hex.augments.rows.map(a => [nk(a.name), a]));
const pairs = new Map(); // 英雄编号 -> 海克斯详情页里的搭配
for (const a of hex.augments.rows) for (const x of a.heroes || []) (pairs.get(x.id) || pairs.set(x.id, []).get(x.id)).push({ name: a.name, wr: x.wr, games: x.games, date: a.date, patch: a.detailPatch });

const rows = hex.heroes.rows;
const miss = [];
const out = heroes.map(h => {
  const r = rows.find(x => x.name === h.name) || rows.find(x => x.title === h.title) || rows.find(x => h.key && x.slug.replace(/-/g, '') === h.key.toLowerCase());
  if (!r) { miss.push(h.name); return { ...h, wr: null, games: null, url: '', augs: [], items: [] }; }
  const m = new Map();
  for (const a of r.augs || []) m.set(nk(a.name), { ...a, date: r.augmentDate || r.date, patch: r.augmentPatch || r.detailPatch });
  if (r.augs && r.coverage !== 'visible-table') for (const a of pairs.get(r.id) || []) if (!m.has(nk(a.name))) m.set(nk(a.name), a);
  const augs = [...m.entries()].map(([k, a]) => {
    const g = augByKey.get(k);
    return { n: g ? g.name : a.name, r: (g && g.rarity) || '', w: a.wr, g: a.games, date: a.date || null, patch: a.patch || null };
  }).sort((x, y) => y.w - x.w);
  return {
    ...h, coverage: r.coverage || 'summary', sourceCount: r.sourceCount || null, detailDate: r.date || null, detailPatch: r.detailPatch || (r.date === hex.heroes.date ? hex.heroes.patch : null), freshness: detailDates(r.date, augs, hex.heroes.date), wr: r.wr, games: r.games, url: `https://hexdata.com.cn/hero/${r.id}-${r.slug}`,
    augs, items: (r.items || []).map(i => ({ n: i.name, w: i.wr, g: i.games })),
  };
}).sort((a, b) => (b.wr ?? 0) - (a.wr ?? 0));

const data = { meta: { patch: patch(hex.heroes.patch), date: hex.heroes.date || '' }, heroes: out };
await writeFile(join(ROOT, 'data', 'data.js'), '/* 自动生成，勿手改：由 scripts/build-data.mjs 生成 */\nwindow.HEX_DATA = ' + JSON.stringify(data) + ';\n');
const done = out.filter(h => h.augs.length);
console.log(`网页数据：版本 ${data.meta.patch}，数据日 ${data.meta.date}；有海克斯排名的英雄 ${done.length}/${out.length}，平均每个英雄 ${(done.reduce((s, h) => s + h.augs.length, 0) / Math.max(1, done.length)).toFixed(1)} 个海克斯`);
if (miss.length) console.log(`提醒：${miss.length} 位英雄在 Hexdata 里没找到：${miss.join('、')}`);
