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
// 把 assets/icons/ 里已下载的头像嵌进单文件（先运行 scripts/fetch-icons.mjs）
const icons = {};
try {
  for (const f of await readdir(join(ROOT, 'assets', 'icons'))) {
    if (f.endsWith('.png')) icons[f.slice(0, -4)] = 'data:image/png;base64,' + (await readFile(join(ROOT, 'assets', 'icons', f))).toString('base64');
  }
} catch { /* 没有头像目录 */ }
const iconJs = `window.HEX_ICONS = ${JSON.stringify(icons)};`;
const safe = s => s.replace(/<\/script/gi, '<\\/script');
html = html
  .replace('<link rel="stylesheet" href="assets/app.css" />', () => `<style>\n${css}\n</style>`)
  .replace('<script src="data/data.js"></script>', () => `<script>\n${safe(data)}\n${iconJs}\n</script>`)
  .replace('<script src="assets/app.js"></script>', () => `<script>\n${safe(app)}\n</script>`);
await mkdir(join(ROOT, 'dist'), { recursive: true });
await writeFile(join(ROOT, 'dist', 'hexaram.html'), html);
console.log(`dist/hexaram.html ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB，内嵌头像 ${Object.keys(icons).length} 张`);
