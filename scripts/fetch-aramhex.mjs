// 下载 AramHex 公开数据（github.com/czgreat/aramhex-data，CC BY-NC 4.0），整理成 data/open/aramhex.json。
// 只读几个公开文件，不抓网页；数据由 AramHex 作者每隔几天更新一次。
// 用法：node scripts/fetch-aramhex.mjs
import { writeFile, readFile, mkdir } from 'node:fs/promises';

const BASE = process.env.ARAMHEX_BASE || 'https://raw.githubusercontent.com/czgreat/aramhex-data/main';
const OUT = new URL('../data/open/aramhex.json', import.meta.url);
const RARITY = { silver: '白银', gold: '黄金', prismatic: '棱彩' };
const ITEM_MIN_SHARE = 0.03; // 出装推荐只看至少 3% 对局会出的成装，避免冷门装备凭少量对局排到前面
const ITEMS_SHOWN = 6;

async function get(path) {
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch(`${BASE}/${path}`);
      if (res.ok) return await res.json();
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (i === 3) throw new Error(`下载 ${path} 失败：${e.message}`);
      await new Promise(r => setTimeout(r, i * 5000));
    }
  }
}

const latest = await get('latest.json');
const dir = latest.path; // 例如 patches/16.22/normal
let old = null;
try { old = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* 第一次运行 */ }
if (old && old.source?.path === dir && old.source?.seq === latest.seq) {
  console.log(`AramHex 数据没有更新（${dir}，第 ${latest.seq} 期），跳过`);
  process.exit(0);
}

const [heroes, heroAugs, augments, heroItems, itemMeta] = await Promise.all(
  ['heroes.json', 'hero_augments.json', 'augments.json', 'hero_items.json', 'item_metadata.json'].map(f => get(`${dir}/${f}`)));

const pct = x => Math.round(x * 1000) / 10;
const rows = Object.entries(heroes).map(([id, h]) => {
  const augs = Object.entries(heroAugs[id] || {})
    .filter(([aid, a]) => augments[aid] && !a.low_sample)
    .map(([aid, a]) => ({ name: augments[aid].name, rarity: RARITY[augments[aid].rarity] || '', wr: pct(a.win_rate), games: a.games }))
    .sort((a, b) => b.wr - a.wr);
  const items = Object.entries(heroItems[id] || {})
    .filter(([iid, it]) => itemMeta[iid]?.category === 'complete_equipment' && !it.low_sample && it.games >= h.games * ITEM_MIN_SHARE)
    .map(([iid, it]) => ({ name: itemMeta[iid].name, wr: pct(it.win_rate), games: it.games }))
    .sort((a, b) => b.wr - a.wr).slice(0, ITEMS_SHOWN);
  return { id, name: h.name, title: h.title, wr: pct(h.win_rate), games: h.games, augs, items };
});

const date = String(latest.snapshot_at || '').slice(0, 10);
const out = { source: { name: 'AramHex', url: 'https://github.com/czgreat/aramhex-data', path: dir, seq: latest.seq, patch: latest.patch, date, matches: latest.matches }, heroes: rows };
await mkdir(new URL('.', OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`AramHex：版本 ${latest.patch}，截至 ${date}，${latest.matches} 局，${rows.length} 位英雄，平均每位 ${(rows.reduce((s, h) => s + h.augs.length, 0) / rows.length).toFixed(0)} 个海克斯`);
