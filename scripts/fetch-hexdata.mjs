// 下载 Hexdata（hexdata.com.cn）公开排行页上的胜率数据：英雄胜率与场次、海克斯综合分与胜率、装备综合分与胜率。
// Hexdata 的 robots.txt 允许抓取这些公开页面，要求引用时注明“数据来源：Hexdata（hexdata.com.cn）”并附链接。
// 结果写入 data/open/hexdata.json，再由 import-sheet.mjs 合并进网页数据。
// 用法：node scripts/fetch-hexdata.mjs
// 每天只请求 3 个页面；任何一页解析异常就整体不更新（网页沿用上一次的数据）。
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://hexdata.com.cn';
const UA = { 'User-Agent': 'hexaram-site (github.com/wangyuanpei8-del/WypHex-aram-site)', 'Accept-Language': 'zh-CN,zh;q=0.9' };

async function page(path) {
  const r = await fetch(BASE + path, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${BASE}${path}`);
  return r.text();
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
