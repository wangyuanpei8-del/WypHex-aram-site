// 把 data/sheets/*.csv 转回 data/data.json 和 data/data.js（网页加载的就是 data.js）
// 用法：node scripts/import-sheet.mjs
// 在 GitHub 上改了表格并提交后，“导入表格”任务会自动运行这个脚本。
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCSV, splitList, num, yes, parseHeroAugs, TIER_LABEL } from './sheet-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(ROOT, 'data', 'sheets');
const old = JSON.parse(await readFile(join(ROOT, 'data', 'data.json'), 'utf8'));
const errors = []; const warns = [];
const need = (row, col, file) => { if (!row[col]) errors.push(`${file} 第 ${row._line} 行：“${col}”不能为空`); return row[col]; };

/* 版本信息 */
const metaRows = await readCSV(join(dir, '0-版本信息.csv'));
const mv = Object.fromEntries(metaRows.map(r => [r['项目'], r['内容']]));
const date = mv['更新日期'] || new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(date)) errors.push(`0-版本信息.csv：更新日期要写成 2026-11-04 这样，现在是“${date}”`);
const meta = {
  ...old.meta,
  patch: mv['版本'] || old.meta.patch,
  mode: mv['模式'] || old.meta.mode,
  updatedAt: `${date.replace(/-(\d)(?!\d)/g, '-0$1')}T00:00:00+08:00`,
  source: mv['数据来源'] || old.meta.source,
  sampleMatches: num(mv['总样本局数']) || 0,
  pipeline: 'sheet',
};

/* 英雄 */
const F1 = '1-英雄.csv';
const heroRows = await readCSV(join(dir, F1));
const seen = new Set();
let heroes = heroRows.map(r => {
  const name = need(r, '英雄', F1);
  if (seen.has(name)) errors.push(`${F1} 第 ${r._line} 行：英雄“${name}”重复`);
  seen.add(name);
  const tier = (r['梯队'] || '').toUpperCase();
  if (!TIER_LABEL[tier]) errors.push(`${F1} 第 ${r._line} 行：梯队只能填 T1~T5，现在是“${r['梯队']}”`);
  const wr = num(r['胜率']);
  if (wr == null || wr < 0 || wr > 100) errors.push(`${F1} 第 ${r._line} 行：胜率要填 0~100 的数字，现在是“${r['胜率']}”`);
  let augments = [];
  try { augments = parseHeroAugs(r['海克斯'], `${F1} 第 ${r._line} 行`); } catch (e) { errors.push(e.message); }
  const core = splitList(r['核心装备']);
  if (core.length < 3) warns.push(`${F1} 第 ${r._line} 行：${name} 的核心装备少于 3 件`);
  return {
    rank: 0, title: r['称号'], name, key: r['英文ID'] || undefined, aliases: r['别名'],
    wr: wr ?? 0, matches: num(r['场次']) || 0, tier, tierLabel: TIER_LABEL[tier] || tier,
    roles: splitList(String(r['定位'] || '').replace(/\//g, '、')), style: r['流派'], skill: r['加点'], anvil: r['锻体'],
    coreItems: core, altItems: splitList(r['备选装备']), augments,
    comboTitle: r['组合标题'], comboDesc: r['组合说明'], tips: r['上手要点'], generic: yes(r['通用模板']),
  };
});
heroes.sort((a, b) => b.wr - a.wr).forEach((h, i) => { h.rank = i + 1; });

/* 海克斯榜 */
const F2 = '2-海克斯.csv';
const oldAug = new Map(old.augments.map(a => [a.name, a]));
const augments = (await readCSV(join(dir, F2))).map(r => {
  const name = need(r, '海克斯', F2);
  const rarity = r['稀有度'] || '未知';
  if (!/^(棱彩|黄金|白银|未知)$/.test(rarity)) errors.push(`${F2} 第 ${r._line} 行：稀有度只能填 棱彩/黄金/白银/未知`);
  const wr = num(r['胜率']) ?? 0;
  const prev = oldAug.get(name);
  return {
    name, rarity, tier: r['梯队'] || 'A', score: prev && prev.wr === wr ? prev.score : wr, wr,
    pick: num(r['选取率']) ?? 0, isNew: yes(r['本版本新增']), effect: r['效果'], heroes: splitList(r['推荐英雄']),
  };
});

/* 装备榜 */
const F3 = '3-装备.csv';
const oldItem = new Map(old.items.map(i => [i.name, i]));
const items = (await readCSV(join(dir, F3))).map(r => {
  const name = need(r, '装备', F3);
  const wr = num(r['胜率']) ?? 0;
  const prev = oldItem.get(name);
  return { name, score: prev && prev.wr === wr ? prev.score : wr, wr, matches: r['场次'], tag: r['标签'], best: splitList(r['推荐英雄']), desc: r['说明'] };
});

/* 王牌组合 */
const F4 = '4-王牌组合.csv';
const combos = (await readCSV(join(dir, F4))).map(r => ({
  title: need(r, '标题', F4), tag: r['标签'], tier: r['梯队'], hero: r['英雄'], items: splitList(r['核心装备']), desc: r['说明'],
}));

/* 交叉检查：英雄名写错会导致页面链接失效 */
const heroNames = new Set(heroes.map(h => h.name));
augments.forEach(a => a.heroes.forEach(n => { if (!heroNames.has(n)) warns.push(`${F2}：“${a.name}”的推荐英雄“${n}”不在英雄表里`); }));
items.forEach(i => i.best.forEach(n => { if (!heroNames.has(n)) warns.push(`${F3}：“${i.name}”的推荐英雄“${n}”不在英雄表里`); }));
combos.forEach(c => { if (c.hero && !heroNames.has(c.hero)) warns.push(`${F4}：组合“${c.title}”的英雄“${c.hero}”不在英雄表里`); });

warns.forEach(w => console.log('提醒：' + w));
if (errors.length) {
  console.error(`\n表格有 ${errors.length} 处错误，网页没有更新：`);
  errors.forEach(e => console.error('  ✗ ' + e));
  process.exit(1);
}
if (heroes.length < 20) { console.error('英雄表少于 20 行，可能是表格损坏，网页没有更新'); process.exit(1); }

heroes = heroes.map(h => { if (!h.key) delete h.key; return h; });
const out = { meta, heroes, augments, items, combos, bands: old.bands };

/* 合并 arammayhem.com 开放数据（出场率、选取率、稀有度、精选组合），文件由 fetch-open-data.mjs 下载 */
let open = null;
try { open = JSON.parse(await readFile(join(ROOT, 'data', 'open', 'arammayhem.json'), 'utf8')); } catch {}
if (open) {
  const champ = new Map(open.champions.map(c => [c.key, c]));
  // 名称比较时忽略空格和标点（如“鼓声暴起 低音轰鸣”与“鼓声暴起低音轰鸣”是同一个）
  const nk = n => String(n).replace(/[\s·・!！?？:：,，.。'"“”]/g, '').toLowerCase();
  const oa = new Map(open.augments.map(a => [nk(a.name), a]));
  const combosBy = new Map();
  open.combos.forEach(c => { (combosBy.get(c.key) || combosBy.set(c.key, []).get(c.key)).push({ augs: c.augs, types: c.types, url: c.url }); });
  let heroHit = 0;
  for (const h of heroes) {
    const c = champ.get(h.key);
    if (c) { h.pick = c.pick; h.pickChange = c.pickChange; h.pickRank = c.pickRank; h.openUrl = c.url; heroHit++; }
    if (combosBy.has(h.key)) h.openCombos = combosBy.get(h.key);
    h.augments.forEach(a => { const o = oa.get(nk(a.name)); if (o && o.rarity !== '未知') a.rarity = o.rarity; });
  }
  const mine = new Map(augments.map(a => [nk(a.name), a]));
  for (const o of open.augments) {
    const a = mine.get(nk(o.name));
    if (a) Object.assign(a, { pick: o.pick, pickChange: o.pickChange, isNew: o.isNew, openUrl: o.url, ...(o.rarity !== '未知' ? { rarity: o.rarity } : {}) });
    else augments.push({ name: o.name, rarity: o.rarity, tier: '', score: null, wr: null, pick: o.pick, pickChange: o.pickChange, isNew: o.isNew, effect: '', heroes: [], openUrl: o.url });
  }
  const unknown = new Set(heroes.flatMap(h => h.augments.map(a => a.name)).filter(n => !oa.has(nk(n))));
  meta.open = { source: open.source, license: open.license, patch: open.patch, statsDate: open.statsDate };
  console.log(`已合并 arammayhem 数据（版本 ${open.patch}，统计日 ${open.statsDate}）：英雄出场率 ${heroHit}/${heroes.length}，海克斯 ${open.augments.length} 个`);
  if (unknown.size) console.log(`提醒：英雄表里有 ${unknown.size} 个海克斯名称在 arammayhem 里找不到（可能是译名不同或已移除）：${[...unknown].slice(0, 30).join('、')}`);
}
/* 合并 Blitz 评级（每个英雄的海克斯、装备评级 T1~T5，没有胜率），文件由 fetch-blitz.mjs 下载 */
let blitz = null;
try { blitz = JSON.parse(await readFile(join(ROOT, 'data', 'open', 'blitz.json'), 'utf8')); } catch {}
if (blitz) {
  const nk = n => String(n).replace(/[\s·・!！?？:：,，.。'"“”]/g, '').toLowerCase();
  const rar = new Map(augments.map(a => [nk(a.name), a.rarity]));
  let hit = 0;
  for (const h of heroes) {
    const b = blitz.champions[h.key];
    if (!b || b.augs.length < 4 || b.items.length < 6) continue;
    let boots = false;
    const items = b.items.filter(i => { if (!i.boots) return true; if (boots) return false; boots = true; return true; });
    h.coreItems = items.slice(0, 6).map(i => i.name);
    h.altItems = items.slice(6, 12).map(i => i.name);
    h.itemTiers = Object.fromEntries(items.slice(0, 12).map(i => [i.name, i.tier]));
    const augs = b.augs.map(a => ({ ...a, rarity: rar.get(nk(a.name)) || a.rarity || '未知' }));
    h.augments = augs.slice(0, 8).map(a => ({ name: a.name, rarity: a.rarity, tier: a.tier, score: 6 - a.tier, wr: null }));
    // 选海克斯速查用：该英雄 T1~T3 的全部海克斯
    h.augTiers = augs.filter(a => a.tier <= 3).map(a => [a.name, a.tier]);
    h.blitz = true;
    hit++;
  }
  const gt = new Map(blitz.augments.map(a => [nk(a.name), a.tier]));
  augments.forEach(a => { const t = gt.get(nk(a.name)); if (t) a.btier = t; });
  meta.blitz = { source: blitz.source, patch: blitz.patch, date: String(blitz.fetchedAt).slice(0, 10) };
  console.log(`已合并 Blitz 评级（版本 ${blitz.patch}）：英雄 ${hit}/${heroes.length}，全局海克斯评级 ${gt.size}`);
}
await writeFile(join(ROOT, 'data', 'data.json'), JSON.stringify(out, null, 1));
await writeFile(join(ROOT, 'data', 'data.js'), '/* 自动生成，勿手改：由 scripts/import-sheet.mjs 从 data/sheets 生成 */\nwindow.HEX_DATA = ' + JSON.stringify(out) + ';\n');
console.log(`已导入：英雄 ${heroes.length}、海克斯 ${augments.length}、装备 ${items.length}、组合 ${combos.length}；版本 ${meta.patch}，更新日期 ${date}`);
