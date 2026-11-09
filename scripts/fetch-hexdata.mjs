// 下载 Hexdata（hexdata.com.cn）的公开页面：英雄排行、海克斯排行、单英雄页（8 个海克斯、8 件装备）、海克斯详情页（稀有度、效果描述、12 位英雄的搭配胜率）。
// Hexdata 的 robots.txt 允许抓取这些公开页面，要求引用时注明“数据来源：Hexdata（hexdata.com.cn）”并附链接。
// 结果写入 data/open/hexdata.json，再由 build-data.mjs 生成网页数据。
// 用法：node scripts/fetch-hexdata.mjs        （自动任务每小时运行一次）
import { parseHeroTables } from './hero-tables.mjs';
import { validDescription } from './data-quality.mjs';
import { extractDescription } from './hexdata-descriptions.mjs';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://hexdata.com.cn';
const UA = { 'User-Agent': 'hexaram-site (github.com/wangyuanpei8-del/WypHex-aram-site)', 'Accept-Language': 'zh-CN,zh;q=0.9' };

const sleep = ms => new Promise(r => setTimeout(r, ms));
// 503 时等 20 秒重试一次；429（限流）直接放弃，下次再读
async function page(path) {
  for (let i = 0; ; i++) {
    const r = await fetch(BASE + path, { headers: UA, signal: AbortSignal.timeout(30000) });
    if (r.ok) return r.text();
    if (i < 1 && r.status === 503) {
      const wait = 20;
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

const [hh, ah] = await Promise.all([page('/heroes'), page('/augments')]);

// 英雄：链接形如 /hero/157-yasuo，名称形如“疾风剑豪（亚索）”
const heroes = rows(hh, /\/hero\/(\d+-[\w-]+)/).map(r => {
  const [, title, name] = /^(.*?)[（(](.*?)[）)]\s*$/.exec(r.name) || [, '', r.name];
  return { id: +r.id.split('-')[0], slug: r.id.split('-').slice(1).join('-'), title: title.trim(), name: name.trim(), wr: pct(r.body, '胜率'), games: val(r.body, '样本') };
}).filter(h => h.wr != null);

// 海克斯：链接路径未知，接受 /augment/xxx 或 /augments/xxx（不含排行页本身）
const augments = rows(ah, /\/augments?\/([^"'?#/]+)/).map(r => ({
  name: r.name, slug: r.id, score: val(r.body, '综合评分') ?? val(r.body, 'HexScore'), wr: pct(r.body, '胜率'), pick: pct(r.body, '选取率'), games: val(r.body, '样本'),
})).filter(a => a.name && a.wr != null);

const dedupe = (list, k) => [...new Map(list.map(x => [x[k], x])).values()];

/* 单英雄页：该英雄的推荐海克斯和装备（综合分、胜率、样本） */
// 一行的文字形如“科学狂人 84.8 56.9% 19,793”
const STAT = /(\d+(?:\.\d+)?)[^\d%]{0,14}?(\d+(?:\.\d+)?)\s*%[^\d]{0,14}?(\d[\d,]*)/;
function heroPage(html) {
  return parseHeroTables(html);
}

let prev = null;
try { prev = JSON.parse(await readFile(join(ROOT, 'data', 'open', 'hexdata.json'), 'utf8')); } catch {}
const listDate = pageInfo(hh).date || '';

// 先沿用上一次读到的英雄页、海克斯页数据
const prevHero = new Map((prev?.heroes?.rows || []).map(r => [r.id, r]));
for (const h of heroes) { const p = prevHero.get(h.id); if (p && p.augs) Object.assign(h, { augs: p.augs, items: p.items, date: p.date, detailPatch: p.detailPatch, coverage: p.coverage, sourceCount: p.sourceCount, augmentDate: p.augmentDate, augmentPatch: p.augmentPatch }); }
const prevAug = new Map((prev?.augments?.rows || []).map(a => [a.name, a]));
for (const a of augments) { const p = prevAug.get(a.name); if (p) Object.assign(a, { rarity: p.rarity, heroes: p.heroes, date: p.date, description: p.description, descriptionChecked: p.descriptionChecked, detailPatch: p.detailPatch, descriptionPatch: p.descriptionPatch, descriptionDate: p.descriptionDate, descriptionCheckedAt: p.descriptionCheckedAt }); }

/* 海克斯详情页：稀有度（“xx是棱彩海克斯”）和最适合的 12 位英雄的搭配胜率 */
function augPage(a, html) {
  const info = pageInfo(html);
  a.descriptionChecked = listDate;
  a.descriptionCheckedAt = new Date().toISOString();
  const description = extractDescription(html);
  if (validDescription(description)) Object.assign(a, { description, descriptionPatch: info.patch, descriptionDate: info.date });
  const m = /(棱彩|黄金|白银)海克斯/.exec(text(html));
  if (m) a.rarity = m[1];
  const list = [];
  const add = (id, rest) => {
    const st = STAT.exec(rest);
    if (!id || !st) return;
    const x = { id, score: num(st[1]), wr: num(st[2]), games: num(st[3]) };
    if (x.wr >= 20 && x.wr <= 80 && !list.some(y => y.id === x.id)) list.push(x);
  };
  // 适配英雄表：优先按英雄链接认人，没有链接就按“称号（名字）”认
  for (const r of rows(html, /\/hero\/(\d+)-[\w-]+/)) add(+r.id, r.body.slice(r.name.length));
  if (!list.length) {
    const who = cell => { const n = cell.replace(/\s+/g, ''); return (heroes.find(h => n.includes(h.name) && (n.includes(h.title) || n === h.name)) || {}).id; };
    for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
      const cells = (tr.match(/<td\b[\s\S]*?<\/td>/gi) || []).map(text);
      if (cells.length >= 3) add(who(cells[0]), cells.slice(1).join(' | '));
    }
  }
  if (!list.length) { console.log(`海克斯页 ${a.name} 没解析到适配英雄；页面开头：${text(html).slice(0, 400)}`); return; }
  a.heroes = list; a.date = info.date; a.detailPatch = info.patch;
}

// Hexdata 连续读 40 个左右页面就会限流（429），所以每次最多读 MAX 个页面，被限流就停下，下次接着读。
// 顺序：稀有度或描述缺项（同一数据日最多检查一次）→ 过时的英雄页 → 过时的海克斯页。
const MAX = +(process.env.HEXDATA_MAX || 30);
// 每批保留英雄更新名额；描述核对按上次尝试时间轮转，避免缺项阻塞。
const audit = augments.filter(a => !a.description || a.descriptionPatch !== pageInfo(hh).patch || a.descriptionDate !== listDate)
  .sort((a,b) => Number(Boolean(a.description)) - Number(Boolean(b.description)) || String(a.descriptionCheckedAt || '').localeCompare(String(b.descriptionCheckedAt || '')));
const descriptionOnly = process.env.HEXDATA_MODE === 'descriptions';
const candidates = descriptionOnly ? audit.map(a => ['aug', a]) : [
  ...audit.slice(0, Math.min(10, MAX)).map(a => ['aug', a]),
  ...heroes.filter(h => !h.augs || h.date !== listDate).map(h => ['hero', h]),
  ...audit.slice(10).map(a => ['aug', a]),
  ...augments.filter(a => !a.heroes || a.date !== listDate).map(a => ['aug', a]),
];
const seen = new Set();
const queue = candidates.filter(([kind,x]) => { const key = kind + (x.id || x.slug); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, MAX);
let done = 0;
for (const [kind, x] of queue) {
  const path = kind === 'hero' ? `/hero/${x.id}-${x.slug}` : `/augment/${x.slug}`;
  let html;
  try { html = await page(path); } catch (e) { console.log(`${path} 读取失败：${e.message}，本次停止，下次继续`); break; }
  if (kind === 'aug') augPage(x, html);
  else {
    const d = heroPage(html);
    if (x.coverage === 'visible-table' && d.coverage !== 'visible-table') {
      if (d.items.length >= 3) Object.assign(x, { items: d.items, date: pageInfo(html).date, detailPatch: pageInfo(html).patch });
      console.log(`保留 ${x.name} 已导入的完整可见表，不用精选摘要覆盖`);
      done++; await sleep(2000); continue;
    }
    if (d.augs.length >= 3 && d.items.length >= 3) Object.assign(x, d, { date: pageInfo(html).date, detailPatch: pageInfo(html).patch, augmentDate: pageInfo(html).date, augmentPatch: pageInfo(html).patch });
    else console.log(`英雄页 ${x.name} 解析到海克斯 ${d.augs.length}、装备 ${d.items.length}，跳过；页面开头：${text(html).slice(0, 300)}`);
  }
  done++;
  await sleep(2000); // 慢慢读，不给对方添负担
}
const fresh = list => list.filter(x => x.date === listDate).length;
console.log(`本次读取 ${done}/${queue.length} 个页面；英雄页最新 ${fresh(heroes)}/${heroes.length}，海克斯页最新 ${fresh(augments)}/${augments.length}（数据日 ${listDate}）`);

const out = {
  source: 'Hexdata（hexdata.com.cn）',
  heroes: { ...pageInfo(hh), rows: dedupe(heroes, 'id') },
  augments: { ...pageInfo(ah), rows: dedupe(augments, 'name') },
};
const bad = out.heroes.rows.length < 100 || out.augments.rows.length < 50 || !out.heroes.patch ||
  out.heroes.rows.some(h => h.wr < 20 || h.wr > 80) || out.augments.rows.some(a => a.wr < 20 || a.wr > 80);
if (bad) {
  console.error(`Hexdata 数据异常（英雄 ${out.heroes.rows.length}、海克斯 ${out.augments.rows.length}），不更新。页面开头：`, text(hh).slice(0, 600));
  process.exit(1);
}
const file = join(ROOT, 'data', 'open', 'hexdata.json');
await mkdir(dirname(file), { recursive: true });
await writeFile(file, JSON.stringify(out, null, 1));
