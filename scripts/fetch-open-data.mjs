// 下载 arammayhem.com 的开放数据（CC BY 4.0，需注明“数据：arammayhem.com”）
// 内容：英雄出场率、海克斯选取率与稀有度、编辑精选组合。不含胜率与出装。
// 结果写入 data/open/arammayhem.json，再由 import-sheet.mjs 合并进网页数据。
// 用法：node scripts/fetch-open-data.mjs
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://arammayhem.com/data/v1/latest';
const UA = { 'User-Agent': 'hexaram-site (github.com/wangyuanpei8-del/WypHex-aram-site)' };

async function get(name) {
  const r = await fetch(`${BASE}/${name}.json`, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${BASE}/${name}.json`);
  return r.json();
}
const zh = n => (n && typeof n === 'object' ? n['zh-CN'] || n.en : n) || '';
const RAR = { silver: '白银', gold: '黄金', prismatic: '棱彩' };
const r2 = x => (x == null ? null : Math.round(x * 100) / 100);

const [champs, augs, combos] = await Promise.all([get('champions'), get('augments'), get('combos').catch(() => ({ rows: [] }))]);
const meta = champs.meta || {};

const out = {
  source: 'arammayhem.com',
  license: 'CC BY 4.0',
  patch: meta.patch,
  statsDate: meta.statsDate,
  comparedTo: meta.comparedTo?.patch || null,
  fetchedAt: new Date().toISOString(),
  champions: (champs.rows || []).map(c => ({
    key: c.championId, name: zh(c.name), pick: r2(c.pickRate), pickRank: c.pickRateRank,
    pickChange: r2(c.pickRateChange), url: c.url,
  })),
  augments: (augs.rows || []).filter(a => !a.retiredPatch).map(a => ({
    id: a.augmentId, name: zh(a.name), nameEn: a.name?.en || '', rarity: RAR[String(a.rarity).toLowerCase()] || '未知',
    pick: r2(a.pickRate), pickRank: a.pickRateRank, pickChange: r2(a.pickRateChange),
    isNew: a.presence === 'new', introduced: a.introducedPatch || null, url: a.url,
  })),
  combos: (combos.rows || []).map(c => ({
    key: c.championId, augs: (c.augmentNames || []).map(zh), types: c.types || [], url: c.url,
  })),
};

if (out.champions.length < 50 || out.augments.length < 30) {
  console.error(`数据量异常（英雄 ${out.champions.length}、海克斯 ${out.augments.length}），不更新`);
  process.exit(1);
}

const file = join(ROOT, 'data', 'open', 'arammayhem.json');
await mkdir(dirname(file), { recursive: true });
let prev = null;
try { prev = JSON.parse(await readFile(file, 'utf8')); } catch {}
// 内容没变就不改文件（避免每天产生无意义的提交）
const same = prev && JSON.stringify({ ...prev, fetchedAt: 0 }) === JSON.stringify({ ...out, fetchedAt: 0 });
if (same) console.log(`arammayhem 数据没有变化（版本 ${out.patch}，统计日 ${out.statsDate}）`);
else {
  await writeFile(file, JSON.stringify(out, null, 1));
  console.log(`已更新 arammayhem 数据：版本 ${out.patch}，统计日 ${out.statsDate}；英雄 ${out.champions.length}、海克斯 ${out.augments.length}、组合 ${out.combos.length}`);
}
