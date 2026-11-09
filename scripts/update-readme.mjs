// 只维护标记块，其余 README 内容由人工编辑。
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const file = new URL('README.md', root);
let readme = await readFile(file, 'utf8');
const kind = process.argv[2];
if (!['project', 'data'].includes(kind)) throw new Error('Usage: node scripts/update-readme.mjs project|data');
const date = new Date(process.env.README_UPDATE_AT || Date.now());
if (!Number.isFinite(date.getTime())) throw new Error('Invalid README_UPDATE_AT');
const formatted = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}).format(date) + '（UTC+9）';
const start = '<!-- update-status:start -->', end = '<!-- update-status:end -->';
const pattern = /<!-- update-status:start -->[\s\S]*?<!-- update-status:end -->/;
const previous = readme.match(pattern)?.[0] || '';
const project = formatted;
const sync = kind === 'data' ? formatted : previous.match(/数据最近写入：(.+)/)?.[1] || '尚无记录';
const data = JSON.parse(await readFile(new URL('data/open/hexdata.json', root), 'utf8'));
const block = `${start}\n## 更新记录\n\n- 项目最近更新：${project}\n- 数据最近写入：${sync}\n- 来源数据日期：${data.heroes.date || '未知'}（Hexdata）\n\n以上时间由自动流程维护。数据无变化时不刷新“数据最近写入”；项目更新时间表示提交记录，不代表已经部署成功。\n${end}`;
readme = previous ? readme.replace(pattern, () => block) : readme.replace(/^(# .+\n)/, `$1\n${block}\n`);
await writeFile(file, readme);
console.log(`${kind}: ${formatted}`);
