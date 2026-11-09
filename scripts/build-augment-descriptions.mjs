// 从已缓存的 Hexdata 详情页数据生成效果描述，不再访问其他数据源。
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const data = JSON.parse(await readFile(new URL('data/open/hexdata.json', root), 'utf8'));
const descriptions = {}, sources = {};
for (const a of data.augments.rows) {
  sources[a.name] = `https://hexdata.com.cn/augment/${a.slug}`;
  if (a.description) descriptions[a.name] = a.description;
}
await writeFile(new URL('data/augment-descriptions.js', root),
  '/* 自动生成；数据来源：Hexdata（hexdata.com.cn）。 */\nwindow.HEX_AUG_DESCRIPTIONS = ' + JSON.stringify(descriptions) + ';\nwindow.HEX_AUG_SOURCES = ' + JSON.stringify(sources) + ';\n');
console.log(`Hexdata 效果描述 ${Object.keys(descriptions).length}/${Object.keys(sources).length}`);
