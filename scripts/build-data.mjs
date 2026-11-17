// 生成网页数据 data/data.js：每个英雄的海克斯胜率排名和推荐出装。
// 输入：data/heroes.json（英雄中文名、称号、头像编号、外号）+ data/open/aramhex.json（fetch-aramhex.mjs 下载）
// 用法：node scripts/build-data.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const heroes = JSON.parse(await readFile(join(ROOT, 'data', 'heroes.json'), 'utf8'));
const src = JSON.parse(await readFile(join(ROOT, 'data', 'open', 'aramhex.json'), 'utf8'));
// 推荐组合（arammayhem，CC BY 4.0）：没有这个文件也能生成，只是不显示组合
let combos = [];
try { combos = JSON.parse(await readFile(join(ROOT, 'data', 'open', 'arammayhem-combos.json'), 'utf8')).rows || []; } catch { /* 还没下载过 */ }
// 显示顺序：神组合、强势、黑科技、娱乐、bug，陷阱放最后
const TYPE_ORDER = ['god', 'strong', 'blackTech', 'entertainment', 'bug', 'trap'];
const rank = c => Math.min(...(c.types.length ? c.types : ['none']).map(t => { const i = TYPE_ORDER.indexOf(t); return i < 0 ? 5.5 : i; }));
const combosOf = h => combos.filter(c => c.champ === h.key || (!h.key && c.champZh === h.title))
  .sort((a, b) => rank(a) - rank(b)).map(c => ({ a: c.augs, t: c.types, u: c.url }));

// 客户端版本号 16.22，游戏里叫 26.22
const patch = p => { const m = /^(\d+)\.(\d+)/.exec(p || ''); return m ? `${+m[1] < 20 ? +m[1] + 10 : +m[1]}.${m[2]}` : ''; };

const miss = [];
const out = heroes.map(h => {
  const r = src.heroes.find(x => x.name === h.name) || src.heroes.find(x => x.title === h.title);
  if (!r) { miss.push(h.name); return { ...h, wr: null, games: null, augs: [], items: [], combos: combosOf(h) }; }
  return {
    ...h, wr: r.wr, games: r.games,
    // 网页每个稀有度最多显示 50 个，只保留各稀有度前 50，文件小一些
    augs: r.augs.filter((a, i, all) => all.slice(0, i).filter(b => b.rarity === a.rarity).length < 50)
      .map(a => ({ n: a.name, r: a.rarity, w: a.wr, g: a.games })),
    items: r.items.map(i => ({ n: i.name, w: i.wr, g: i.games })),
    combos: combosOf(h),
  };
}).sort((a, b) => (b.wr ?? 0) - (a.wr ?? 0));

const data = { meta: { patch: patch(src.source.patch), date: src.source.date || '', matches: src.source.matches || null }, heroes: out };
await writeFile(join(ROOT, 'data', 'data.js'), '/* 自动生成，勿手改：由 scripts/build-data.mjs 生成；数据来源：AramHex（github.com/czgreat/aramhex-data，CC BY-NC 4.0）；推荐组合 Data: arammayhem.com（CC BY 4.0） */\nwindow.HEX_DATA = ' + JSON.stringify(data) + ';\n');
const done = out.filter(h => h.augs.length);
console.log(`网页数据：版本 ${data.meta.patch}，截至 ${data.meta.date}；有海克斯排名的英雄 ${done.length}/${out.length}`);
if (done.length < 150) throw new Error('有数据的英雄太少，数据可能有问题，本次不更新');
console.log(`推荐组合：${out.reduce((s, h) => s + h.combos.length, 0)}/${combos.length} 个对上了英雄`);
if (miss.length) console.log(`提醒：${miss.length} 位英雄在 AramHex 里没找到：${miss.join('、')}`);
