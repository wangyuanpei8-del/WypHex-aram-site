#!/usr/bin/env node
// 下载全部英雄头像到 assets/icons/<key>.png，之后网页优先用本地图片，打包单文件版时会直接嵌入。
// 用法：node scripts/fetch-icons.mjs        （需要能访问腾讯或拳头的图片服务器）
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(join(ROOT, 'data', 'data.json'), 'utf8'));
const dir = join(ROOT, 'assets', 'icons');
await mkdir(dir, { recursive: true });

let ddv = null;
try { ddv = (await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json())[0]; } catch { /* 忽略 */ }
const sources = k => [
  `https://game.gtimg.cn/images/lol/act/img/champion/${k}.png`,
  ddv && `https://ddragon.leagueoflegends.com/cdn/${ddv}/img/champion/${k}.png`,
].filter(Boolean);

let ok = 0; const failed = [];
for (const h of data.heroes) {
  if (!h.key) { failed.push(h.name + '（无编号）'); continue; }
  const file = join(dir, h.key + '.png');
  try { await access(file); ok++; continue; } catch { /* 需要下载 */ }
  let done = false;
  for (const url of sources(h.key)) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 500) continue;
      await writeFile(file, buf); done = true; break;
    } catch { /* 换下一个源 */ }
  }
  done ? ok++ : failed.push(`${h.name}(${h.key})`);
}
console.log(`头像 ${ok}/${data.heroes.length} 张已就绪${failed.length ? '；失败：' + failed.join('、') : ''}`);
