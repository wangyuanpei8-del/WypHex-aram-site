#!/usr/bin/env node
// 把 index.html + CSS + JS + 数据打包成一个 dist/hexaram.html，方便直接发到微信/QQ 群离线打开。
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFile(join(ROOT, p), 'utf8');
let html = await read('index.html');
const css = await read('assets/app.css');
const data = await read('data/data.js');
const app = await read('assets/app.js');
const descriptions = await read('data/augment-descriptions.js');
// 把 scripts/fetch-icons.mjs 下载的图标嵌进单文件，在任何地方打开都能显示
const b64 = async rel => 'data:image/png;base64,' + (await readFile(join(ROOT, rel))).toString('base64');
const icons = {};
try {
  for (const f of await readdir(join(ROOT, 'assets', 'icons', 'champ'))) {
    if (f.endsWith('.png')) icons[f.slice(0, -4)] = await b64(`assets/icons/champ/${f}`);
  }
} catch { /* 还没下载头像 */ }
const inlineMap = async name => {
  const m = {};
  try {
    const js = await read('data/icons.js');
    const found = js.match(new RegExp(`window\\.${name} = (\\{.*\\});`));
    for (const [k, rel] of Object.entries(found ? JSON.parse(found[1]) : {})) {
      try { m[k] = await b64(rel); } catch { /* 文件不存在 */ }
    }
  } catch { /* 没有 icons.js */ }
  return m;
};
const itemIcons = await inlineMap('HEX_ITEM_ICONS');
const augIcons = await inlineMap('HEX_AUG_ICONS');
const iconJs = `window.HEX_ICONS = ${JSON.stringify(icons)};\nwindow.HEX_ITEM_ICONS = ${JSON.stringify(itemIcons)};\nwindow.HEX_AUG_ICONS = ${JSON.stringify(augIcons)};`;
const safe = s => s.replace(/<\/script/gi, '<\\/script');
html = html
  .replace('href="heroes.html"', 'href="https://wangyuanpei8-del.github.io/WypHex-aram-site/heroes.html"')
  .replace(/<link rel="stylesheet" href="assets\/app\.css(?:\?[^"]*)?" \/>/, () => `<style>\n${css}\n</style>`)
  .replace(/<script src="data\/data\.js(?:\?[^"]*)?"><\/script>/, () => `<script>\n${safe(data)}\n${iconJs}\n</script>`)
  .replace(/<script src="data\/icons\.js(?:\?[^"]*)?"><\/script>/, () => '')
  .replace(/<script src="data\/augment-descriptions\.js(?:\?[^"]*)?"><\/script>/, () => `<script>\n${safe(descriptions)}\n</script>`)
  .replace(/<script src="assets\/app\.js(?:\?[^"]*)?"><\/script>/, () => `<script>\n${safe(app)}\n</script>`);
await mkdir(join(ROOT, 'dist'), { recursive: true });
await writeFile(join(ROOT, 'dist', 'hexaram.html'), html);
console.log(`dist/hexaram.html ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB，内嵌头像 ${Object.keys(icons).length} / 装备 ${Object.keys(itemIcons).length} / 海克斯 ${Object.keys(augIcons).length} 张`);
