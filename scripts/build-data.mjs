// 生成网页数据 data/data.js：每个英雄的海克斯胜率排名和推荐出装。
// 输入：data/heroes.json（英雄中文名、称号、头像编号、外号）+ data/open/aramhex.json（fetch-aramhex.mjs 下载）
// 用法：node scripts/build-data.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const heroes = JSON.parse(await readFile(join(ROOT, 'data', 'heroes.json'), 'utf8'));
const src = JSON.parse(await readFile(join(ROOT, 'data', 'open', 'aramhex.json'), 'utf8'));

// 客户端版本号 16.22，游戏里叫 26.22
const patch = p => { const m = /^(\d+)\.(\d+)/.exec(p || ''); return m ? `${+m[1] < 20 ? +m[1] + 10 : +m[1]}.${m[2]}` : ''; };

const miss = [];
const out = heroes.map(h => {
  const r = src.heroes.find(x => x.name === h.name) || src.heroes.find(x => x.title === h.title);
  if (!r) { miss.push(h.name); return { ...h, wr: null, games: null, augs: [], items: [] }; }
  return {
    ...h, wr: r.wr, games: r.games,
    // 网页每个稀有度最多显示 20 个，只保留各稀有度前 20，文件小一些
    augs: r.augs.filter((a, i, all) => all.slice(0, i).filter(b => b.rarity === a.rarity).length < 20)
      .map(a => ({ n: a.name, r: a.rarity, w: a.wr, g: a.games })),
    items: r.items.map(i => ({ n: i.name, w: i.wr, g: i.games })),
  };
}).sort((a, b) => (b.wr ?? 0) - (a.wr ?? 0));

const data = { meta: { patch: patch(src.source.patch), date: src.source.date || '', matches: src.source.matches || null }, heroes: out };
await writeFile(join(ROOT, 'data', 'data.js'), '/* 自动生成，勿手改：由 scripts/build-data.mjs 生成；数据来源：AramHex（github.com/czgreat/aramhex-data，CC BY-NC 4.0） */\nwindow.HEX_DATA = ' + JSON.stringify(data) + ';\n');
const done = out.filter(h => h.augs.length);
console.log(`网页数据：版本 ${data.meta.patch}，截至 ${data.meta.date}；有海克斯排名的英雄 ${done.length}/${out.length}`);
if (done.length < 150) throw new Error('有数据的英雄太少，数据可能有问题，本次不更新');
if (miss.length) console.log(`提醒：${miss.length} 位英雄在 AramHex 里没找到：${miss.join('、')}`);
