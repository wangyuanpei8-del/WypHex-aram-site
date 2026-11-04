// 下载 Hexdata（hexdata.com.cn）公开排行页上的胜率数据：英雄胜率与场次、海克斯综合分与胜率、装备综合分与胜率。
// Hexdata 的 robots.txt 允许抓取这些公开页面，要求引用时注明“数据来源：Hexdata（hexdata.com.cn）”并附链接。
// 结果写入 data/open/hexdata.json，再由 import-sheet.mjs 合并进网页数据。
// 用法：node scripts/fetch-hexdata.mjs
// 每天请求 3 个排行页和 173 个英雄页（每页间隔 1.5 秒，被限流时等待重试）；排行页解析异常就整体不更新（网页沿用上一次的数据），
// 单个英雄页失败时沿用该英雄上一次的数据。
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://hexdata.com.cn';
const UA = { 'User-Agent': 'hexaram-site (github.com/wangyuanpei8-del/WypHex-aram-site)', 'Accept-Language': 'zh-CN,zh;q=0.9' };

const sleep = ms => new Promise(r => setTimeout(r, ms));
// 对方限流（429/503）时按它说的时间等一会再试，最多试 4 次
async function page(path) {
  for (let i = 0; ; i++) {
    const r = await fetch(BASE + path, { headers: UA });
    if (r.ok) return r.text();
    if (i < 3 && (r.status === 429 || r.status === 503)) {
      const wait = Math.min(120, +r.headers.get('retry-after') || 20 * (i + 1));
      console.log(`  ${path} 返回 ${r.status}，等 ${wait} 秒再试`);
      await sleep(wait * 1000);
      continue;
    }
    throw new Error(`${r.status} ${BASE}${path}`);
  }
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·' };
const decode = s => s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m);
const text = h => decode(h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const num = s => (s == null ? null : +String(s).replace(/,/g, ''));

// 页面上的版本与数据日期（meta 标签或正文里的 “Patch 16.21”）
function pageInfo(html) {
  const meta = n => (new RegExp(`<meta[^>]+(?:name|property)=["']${n}["'][^>]*content=["']([^"']+)`, 'i').exec(html) ||
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["']${n}["']`, 'i').exec(html) || [])[1];
  const t = text(html);
  const patch = meta('report-patch') || (/Patch\s*(\d+\.\d+)/i.exec(t) || /版本\s*(\d+\.\d+)/.exec(t) || [])[1] || null;
  const date = meta('report-date') || (/数据日期\D{0,6}(\d{4}-\d{2}-\d{2})/.exec(t) || [])[1] || null;
  return { patch, date };
}

// 按链接把页面切成一行一行：每个匹配 re 的链接开始一行，直到下一个“别的”链接为止
function rows(html, re) {
  const out = []; const a = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m; const hits = [];
  while ((m = a.exec(html))) { const k = re.exec(m[1]); if (k) hits.push({ id: k[1], at: m.index, name: text(m[2]) }); }
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    if (i && hits[i - 1].id === h.id) continue; // 同一行里指向同一对象的第二个链接
    let j = i + 1; while (j < hits.length && hits[j].id === h.id) j++;
    const end = j < hits.length ? hits[j].at : Math.min(html.length, h.at + 4000);
    out.push({ id: h.id, name: h.name || hits.slice(i, j).map(x => x.name).find(Boolean) || '', body: text(html.slice(h.at, end)) });
  }
  return out;
}
const pct = (t, label) => num((new RegExp(label + '\\s*[:：]?\\s*([\\d.]+)\\s*%').exec(t) || [])[1]);
const val = (t, label) => num((new RegExp(label + '\\s*[:：]?\\s*([\\d.,]+)').exec(t) || [])[1]);

const [hh, ah, ih] = await Promise.all([page('/heroes'), page('/augments'), page('/items')]);

// 英雄：链接形如 /hero/157-yasuo，名称形如“疾风剑豪（亚索）”
const heroes = rows(hh, /\/hero\/(\d+-[\w-]+)/).map(r => {
  const [, title, name] = /^(.*?)[（(](.*?)[）)]\s*$/.exec(r.name) || [, '', r.name];
  return { id: +r.id.split('-')[0], slug: r.id.split('-').slice(1).join('-'), title: title.trim(), name: name.trim(), wr: pct(r.body, '胜率'), games: val(r.body, '样本') };
}).filter(h => h.wr != null);

// 海克斯：链接路径未知，接受 /augment/xxx 或 /augments/xxx（不含排行页本身）
const augments = rows(ah, /\/augments?\/([^"'?#/]+)/).map(r => ({
  name: r.name, score: val(r.body, '综合评分') ?? val(r.body, 'HexScore'), wr: pct(r.body, '胜率'), pick: pct(r.body, '选取率'), games: val(r.body, '样本'),
})).filter(a => a.name && a.wr != null);

// 装备：链接形如 /item/994403
const items = rows(ih, /\/item\/(\d+)/).map(r => ({
  id: +r.id, name: r.name, score: val(r.body, 'HexScore') ?? val(r.body, '综合评分'), wr: pct(r.body, '胜率'), games: val(r.body, '样本'),
})).filter(i => i.name && i.wr != null);

const dedupe = (list, k) => [...new Map(list.map(x => [x[k], x])).values()];

/* 单英雄页：该英雄的推荐海克斯和装备（综合分、胜率、样本），以及层级 */
// 一行的文字形如“科学狂人 84.8 56.9% 19,793”
const STAT = /(\d+(?:\.\d+)?)[^\d%]{0,14}?(\d+(?:\.\d+)?)\s*%[^\d]{0,14}?(\d[\d,]*)/;
function heroPage(html) {
  const list = { augs: [], items: [] };
  const push = (kind, name, rest) => {
    const m = STAT.exec(rest); name = name.replace(/\s+/g, ' ').trim();
    if (!m || !name || name.length > 20) return;
    const r = { name, score: num(m[1]), wr: num(m[2]), games: num(m[3]) };
    if (r.wr < 20 || r.wr > 80) return;
    if (!list[kind].some(x => x.name === r.name)) list[kind].push(r);
  };
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  for (const t of tables) {
    // 看表格前面的标题和表头判断是海克斯还是装备
    const before = text(html.slice(Math.max(0, html.indexOf(t) - 400), html.indexOf(t)));
    const head = text((/<thead[\s\S]*?<\/thead>/i.exec(t) || [''])[0]) || before;
    for (const tr of t.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
      if (/<th\b/i.test(tr)) continue;
      const cells = (tr.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) || []).map(text);
      if (cells.length < 3) continue;
      const kind = /\/item\//.test(tr) ? 'items' : /\/augments?\//.test(tr) ? 'augs' : /装备|出装/.test(head) && !/海克斯|符文/.test(head) ? 'items' : /海克斯|符文/.test(head) ? 'augs' : null;
      if (kind) push(kind, cells[0], cells.slice(1).join(' | '));
    }
  }
  if (!list.augs.length && !list.items.length) {
    // 没有表格时：按链接切行
    for (const r of rows(html, /\/augments?\/([^"'?#/]+)/)) push('augs', r.name, r.body.slice(r.name.length));
    for (const r of rows(html, /\/item\/(\d+)/)) push('items', r.name, r.body.slice(r.name.length));
  }
  const t = text(html);
  const tier = (/层级\s*[:：]?\s*(T\d)/.exec(t) || [])[1] || null;
  return { tier, ...list };
}

let prevFile = null;
try { prevFile = JSON.parse(await readFile(join(ROOT, 'data', 'open', 'hexdata.json'), 'utf8')); } catch {}
const prevHero = new Map((prevFile?.heroes?.rows || []).map(r => [r.id, r]));
let ok = 0, sample = null, failRun = 0; const fails = {};
for (const h of dedupe(heroes, 'id')) {
  try {
    const d = heroPage(await page(`/hero/${h.id}-${h.slug}`));
    if (d.augs.length >= 3 && d.items.length >= 3) { Object.assign(h, d); ok++; failRun = 0; sample ||= { name: h.name, ...d }; }
    else throw new Error(`解析到海克斯 ${d.augs.length}、装备 ${d.items.length}`);
  } catch (e) {
    const p = prevHero.get(h.id);
    if (p && p.augs) Object.assign(h, { tier: p.tier, augs: p.augs, items: p.items });
    const why = e.message.split(' ')[0]; fails[why] = (fails[why] || 0) + 1;
    if (fails[why] <= 3) console.log(`英雄页 ${h.name} 读取失败：${e.message}`);
    // 连续失败太多说明被挡住了，剩下的英雄沿用上一次的数据
    if (++failRun >= 8) { console.log('连续失败 8 次，停止读取英雄页，其余沿用上一次的数据'); break; }
  }
  await sleep(1500); // 慢慢读，不给对方添负担
}
console.log(`英雄页：成功 ${ok}/${heroes.length}，失败原因 ${JSON.stringify(fails)}；样例 ${JSON.stringify(sample).slice(0, 300)}`);
if (!ok) { const h0 = heroes[0]; try { console.log('英雄页开头：', text(await page(`/hero/${h0.id}-${h0.slug}`)).slice(0, 1500)); } catch {} }
const out = {
  source: 'Hexdata（hexdata.com.cn）',
  fetchedAt: new Date().toISOString(),
  heroes: { ...pageInfo(hh), rows: dedupe(heroes, 'id') },
  augments: { ...pageInfo(ah), rows: dedupe(augments, 'name') },
  items: { ...pageInfo(ih), rows: dedupe(items, 'id') },
};
console.log(`Hexdata：英雄 ${out.heroes.rows.length}（${out.heroes.patch}，${out.heroes.date}），海克斯 ${out.augments.rows.length}（${out.augments.patch}，${out.augments.date}），装备 ${out.items.rows.length}（${out.items.patch}，${out.items.date}）`);
console.log('样例：', JSON.stringify([out.heroes.rows[0], out.augments.rows[0], out.items.rows[0]]));

const bad = out.heroes.rows.length < 100 || out.augments.rows.length < 50 || !out.heroes.patch ||
  out.heroes.rows.some(h => h.wr < 20 || h.wr > 80) || out.augments.rows.some(a => a.wr < 20 || a.wr > 80);
if (bad) {
  console.error('Hexdata 数据量或数值异常，不更新（网页沿用上一次的数据）。页面开头：', text(hh).slice(0, 600));
  process.exit(1);
}

const file = join(ROOT, 'data', 'open', 'hexdata.json');
await mkdir(dirname(file), { recursive: true });
let prev = null;
try { prev = JSON.parse(await readFile(file, 'utf8')); } catch {}
const same = prev && JSON.stringify({ ...prev, fetchedAt: 0 }) === JSON.stringify({ ...out, fetchedAt: 0 });
if (same) console.log('Hexdata 数据没有变化');
else { await writeFile(file, JSON.stringify(out, null, 1)); console.log('已更新 data/open/hexdata.json'); }
