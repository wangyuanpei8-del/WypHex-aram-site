// 把 data/data.json 导出成 data/sheets/*.csv，方便用 Excel 或 GitHub 网页直接改
// 用法：node scripts/export-sheet.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toCSV, joinList, fmtHeroAugs, HERO_COLS, AUG_COLS, ITEM_COLS, COMBO_COLS, META_COLS } from './sheet-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const D = JSON.parse(await readFile(join(ROOT, 'data', 'data.json'), 'utf8'));
const dir = join(ROOT, 'data', 'sheets');
await mkdir(dir, { recursive: true });

const m = D.meta;
await writeFile(join(dir, '0-版本信息.csv'), toCSV([META_COLS,
  ['版本', m.patch], ['模式', m.mode], ['更新日期', (m.updatedAt || '').slice(0, 10)],
  ['数据来源', m.source], ['总样本局数', m.sampleMatches || ''],
]));

await writeFile(join(dir, '1-英雄.csv'), toCSV([HERO_COLS, ...D.heroes.map(h => [
  h.name, h.title, h.key || '', h.aliases, h.tier, h.wr, h.matches, (h.roles || []).join('/'), h.style, h.skill, h.anvil,
  joinList(h.coreItems), joinList(h.altItems), fmtHeroAugs(h.augments), h.comboTitle, h.comboDesc, h.tips, h.generic ? '是' : '否',
])]));

await writeFile(join(dir, '2-海克斯.csv'), toCSV([AUG_COLS, ...D.augments.map(a => [
  a.name, a.rarity, a.tier, a.wr, a.pick, a.isNew ? '是' : '否', a.effect, joinList(a.heroes),
])]));

await writeFile(join(dir, '3-装备.csv'), toCSV([ITEM_COLS, ...D.items.map(i => [
  i.name, i.wr, i.matches, i.tag, i.desc, joinList(i.best),
])]));

await writeFile(join(dir, '4-王牌组合.csv'), toCSV([COMBO_COLS, ...(D.combos || []).map(c => [
  c.title, c.hero, c.tier, c.tag, joinList(c.items), c.desc,
])]));

console.log(`已导出到 data/sheets/：英雄 ${D.heroes.length}、海克斯 ${D.augments.length}、装备 ${D.items.length}、组合 ${(D.combos || []).length}`);
