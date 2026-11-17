// 下载 arammayhem 公开的「英雄 + 海克斯推荐组合」名单（https://arammayhem.com/data/，CC BY 4.0，注明 "Data: arammayhem.com"）。
// 只读一个公开数据文件，不抓网页。整理成 data/open/arammayhem-combos.json。
// 下载失败时保留旧文件、不报错，不影响海克斯胜率和出装的更新。
// 用法：node scripts/fetch-arammayhem.mjs
import { writeFile, mkdir } from 'node:fs/promises';

const URL_COMBOS = process.env.ARAMMAYHEM_COMBOS || 'https://arammayhem.com/data/v1/latest/combos.json';
const OUT = new URL('../data/open/arammayhem-combos.json', import.meta.url);

async function get() {
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch(URL_COMBOS);
      if (res.ok) return await res.json();
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (i === 3) throw e;
      await new Promise(r => setTimeout(r, i * 5000));
    }
  }
}

try {
  const src = await get();
  if (!Array.isArray(src.rows)) throw new Error('文件格式变了，没有 rows');
  const rows = src.rows.map(r => ({
    champ: r.championId,
    champZh: r.championName?.['zh-CN'] || '',
    augs: (r.augmentNames || []).map(a => a['zh-CN'] || a.en).filter(Boolean),
    types: Array.isArray(r.types) ? r.types : String(r.types || '').split('|').filter(Boolean),
    url: String(r.url || '').replace(/\/combo\//, '/zh-cn/combo/'),
  })).filter(r => r.champ && r.augs.length && /^https:\/\/arammayhem\.com\//.test(r.url));
  if (rows.length < 20) throw new Error(`只有 ${rows.length} 个组合，可能下载不完整`);
  rows.sort((a, b) => a.champ.localeCompare(b.champ) || a.augs.join().localeCompare(b.augs.join()));
  const out = { source: { name: 'arammayhem', url: 'https://arammayhem.com/data/', attribution: src.attribution || 'Data: arammayhem.com', license: 'CC BY 4.0' }, rows };
  await mkdir(new URL('.', OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`arammayhem：${rows.length} 个推荐组合`);
} catch (e) {
  console.log(`提醒：arammayhem 组合下载失败（${e.message}），沿用上次的数据`);
}
