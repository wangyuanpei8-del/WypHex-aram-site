#!/usr/bin/env node
/**
 * 海斗助手数据更新脚本（Node 20+，无第三方依赖）
 *
 * 做的事：
 *   1. 从 Riot API 滚动采样海克斯大乱斗对局（match-v5），按英雄聚合胜率、出装、海克斯；
 *   2. 与 data/data.json 里手写的文字（称号、外号、流派、要点、组合说明）合并；
 *   3. 输出 data/data.json（源数据）和 data/data.js（网页加载用）。
 *
 * 用法：
 *   RIOT_API_KEY=RGAPI-xxx node scripts/update-data.mjs            # 正式采样
 *   node scripts/update-data.mjs --mock --out /tmp/test             # 不联网，用模拟对局测试整条流程
 *
 * 环境变量：
 *   RIOT_API_KEY   必填（--mock 除外）。在 https://developer.riotgames.com 申请 Personal API Key。
 *   RIOT_PLATFORMS 采样服务器，逗号分隔，默认 kr,na1,euw1,sg2（各服务器限速分开算，同时采样快几倍；国服不在 Riot API 内）。
 *   QUEUE_ID       海克斯大乱斗的 queueId。留空时自动识别：先查官方 queues.json 里名称含 Mayhem 的队列，
 *                  再抽查种子玩家最近的对局，统计各队列出现次数并打印出来。
 *   MAX_REQUESTS   单次运行最多请求数，默认 9000（Personal key 约 100 次/2 分钟，9000 次约 3 小时，按命中率可新增数千局）。
 *   MIN_GAMES      英雄进入榜单的最少场次，默认 30。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const MOCK = args.includes('--mock');
const REBUILD = args.includes('--rebuild'); // 只用已累计的数据重算，不采样、不需要 key
if (MOCK && !process.env.QUEUE_ID) process.env.QUEUE_ID = '2400';
const OUT = args.includes('--out') ? resolve(args[args.indexOf('--out') + 1]) : join(ROOT, 'data');

const KEY = process.env.RIOT_API_KEY;
const PLATFORMS = (process.env.RIOT_PLATFORMS || process.env.RIOT_PLATFORM || 'kr,na1,euw1,sg2')
  .toLowerCase().split(/[,\s]+/).filter(Boolean);
let QUEUE_ID = Number(process.env.QUEUE_ID || 0); // 0 = 自动识别
const MAX_REQUESTS = Number(process.env.MAX_REQUESTS || 9000);
const MIN_GAMES = Number(process.env.MIN_GAMES || 30);
const REGION_OF = {
  kr: 'asia', jp1: 'asia',
  sg2: 'sea', tw2: 'sea', vn2: 'sea', ph2: 'sea', th2: 'sea', oc1: 'sea',
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas',
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe', me1: 'europe',
};
const NAMES = { kr: '韩服', jp1: '日服', sg2: '东南亚服', tw2: '台服', vn2: '越南服', na1: '北美服', euw1: '西欧服', eun1: '北欧服', br1: '巴西服' };
const nameOf = pf => NAMES[pf] || pf;
const SERVER_NAME = PLATFORMS.map(nameOf).join('、');

if (!MOCK && !REBUILD && !KEY) {
  console.error('缺少 RIOT_API_KEY。测试流程可用 --mock。');
  process.exit(1);
}

/* ---------------- HTTP（带限速与 429 重试） ---------------- */
let requests = 0; // 所有服务器合计
const MIN_GAP_MS = Number(process.env.MIN_GAP_MS || 1250); // 每个服务器 100 次 / 120 秒
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 每个服务器一个独立限速器（Riot 的限速按服务器分别计算）
function makeRiot(tag) {
  let last = 0; let count = 0;
  const riot = async url => {
  if (count >= MAX_REQUESTS) throw new Error('BUDGET');
  for (let attempt = 0; attempt < 5; attempt++) {
    const wait = last + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    requests++; count++;
    const res = await fetch(url, { headers: { 'X-Riot-Token': KEY } });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      const ra = Number(res.headers.get('retry-after') || 10);
      console.warn(`  [${tag}] ${res.status}，${ra}s 后重试`);
      await sleep(ra * 1000);
      continue;
    }
    if (res.status === 404) return null;
    throw new Error(`${res.status} ${url}\n${await res.text()}`);
  }
  return null;
  };
  riot.count = () => count;
  return riot;
}
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

// 稀有度：数字 0/1/2 或 kSilver/gold/prismatic 等写法；认不出就标“未知”，不瞎猜
function rarityOf(r) {
  if (r === 0 || r === 1 || r === 2) return ['白银', '黄金', '棱彩'][r];
  const s = String(r ?? '').toLowerCase();
  if (/silver|白银/.test(s)) return '白银';
  if (/gold|黄金/.test(s)) return '黄金';
  if (/prism|棱彩/.test(s)) return '棱彩';
  return '未知';
}

/* ---------------- 静态资料：英雄 / 装备 / 海克斯名称 ---------------- */
async function loadStatic(existing) {
  if (MOCK) {
    const champs = {};
    existing.heroes.forEach((h, i) => { champs[1000 + i] = { name: h.name, title: h.title, id: h.key }; });
    const items = {};
    const itemNames = [...new Set(existing.heroes.flatMap(h => [...h.coreItems, ...h.altItems]))];
    itemNames.forEach((n, i) => { items[3000 + i] = { name: n, full: true }; });
    const augs = {};
    const augNames = [...new Set([...existing.augments.map(a => a.name), ...existing.heroes.flatMap(h => h.augments.map(a => a.name))])];
    const rar = new Map([...existing.heroes.flatMap(h => h.augments), ...existing.augments].map(a => [a.name, a.rarity]));
    augNames.forEach((n, i) => { augs[1 + i] = { name: n, rarity: rar.get(n) || '白银', desc: '' }; });
    return { version: 'mock', champs, items, augs };
  }
  const version = (await getJSON('https://ddragon.leagueoflegends.com/api/versions.json'))[0];
  const base = `https://ddragon.leagueoflegends.com/cdn/${version}/data/zh_CN`;
  const champJson = (await getJSON(`${base}/champion.json`)).data;
  const champs = {};
  // zh_CN 中 name 是称号（疾风剑豪），title 是名字（亚索）
  Object.values(champJson).forEach(c => { champs[c.key] = { name: c.title, title: c.name, id: c.id }; });
  const itemJson = (await getJSON(`${base}/item.json`)).data;
  const items = {};
  Object.entries(itemJson).forEach(([id, it]) => {
    const boots = (it.tags || []).includes('Boots') && (it.gold?.total || 0) >= 900;
    const full = boots || ((it.gold?.total || 0) >= 2200 && !(it.into && it.into.length));
    items[id] = { name: it.name, full, boots };
  });
  let augs = {};
  try {
    const cd = await getJSON('https://raw.communitydragon.org/latest/cdragon/arena/zh_cn.json');
    (cd.augments || []).forEach(a => {
      augs[a.id] = { name: a.name, rarity: rarityOf(a.rarity), desc: (a.desc || '').replace(/<[^>]+>/g, '') };
    });
  } catch (e) {
    console.warn('竞技场海克斯表获取失败：', e.message);
  }
  // 大乱斗专属海克斯：扫描 CommunityDragon 上其它海克斯表，只补缺的编号
  const CD = 'https://raw.communitydragon.org/latest';
  const extra = [`${CD}/plugins/rcp-be-lol-game-data/global/zh_cn/v1/cherry-augments.json`];
  try {
    const html = await (await fetch(`${CD}/plugins/rcp-be-lol-game-data/global/zh_cn/v1/`)).text();
    [...html.matchAll(/href="([^"]+\.json)"/gi)].map(m => m[1]).filter(f => /augment|kiwi|mayhem|aram/i.test(f))
      .forEach(f => extra.push(f.startsWith('http') ? f : `${CD}/plugins/rcp-be-lol-game-data/global/zh_cn/v1/` + f.replace(/^\.?\//, '')));
  } catch {}
  for (const url of new Set(extra)) {
    const j = await getJSON(url).catch(() => null);
    if (!j) continue;
    const walk = n => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (!n || typeof n !== 'object') return;
      const name = n.nameTRA || n.name || n.displayName;
      if (Number.isInteger(+n.id) && typeof name === 'string' && name && !augs[n.id]) {
        augs[n.id] = { name, rarity: rarityOf(n.rarity ?? n.augmentRarity), desc: String(n.desc || n.description || n.tooltip || '').replace(/<[^>]+>/g, '') };
      }
      Object.values(n).forEach(v => v && typeof v === 'object' && walk(v));
    };
    walk(j);
  }
  return { version, champs, items, augs };
}

/* ---------------- 采样状态 ---------------- */
async function loadJSON(p, fallback) {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return fallback; }
}
function emptyState() {
  return { patch: null, seeds: [], seen: [], matches: 0, agg: {} };
}
const patchOf = gv => (gv || '').split('.').slice(0, 2).join('.');
const newer = (a, b) => { const [x1, y1] = a.split('.').map(Number); const [x2, y2] = (b || '0.0').split('.').map(Number); return x1 > x2 || (x1 === x2 && y1 > y2); };

function addMatch(state, m, reg) {
  const gv = patchOf(m.info.gameVersion);
  if (state.patch && gv !== state.patch) {
    if (!newer(gv, state.patch)) return false; // 旧版本的对局跳过
    console.log(`检测到新版本 ${gv}，清空旧版本 ${state.patch} 的统计`);
    Object.assign(state, { patch: gv, matches: 0, agg: {}, seen: [] });
  }
  state.patch = gv;
  state.matches++;
  for (const p of m.info.participants) {
    const c = (state.agg[p.championId] ||= { g: 0, w: 0, items: {}, augs: {} });
    const win = p.win ? 1 : 0;
    c.g++; c.w += win;
    for (let i = 0; i <= 5; i++) {
      const id = p['item' + i];
      if (id) { const s = (c.items[id] ||= [0, 0]); s[0]++; s[1] += win; }
    }
    for (let i = 1; i <= 6; i++) {
      const id = p['playerAugment' + i];
      if (id) { const s = (c.augs[id] ||= [0, 0]); s[0]++; s[1] += win; }
    }
    // 打过大乱斗的玩家进入“玩家池”，下次优先查他们（覆盖所有段位，包括没打排位的玩家）
    if (p.puuid && reg) addPool(reg, p.puuid);
  }
  return true;
}

/* ---------------- 识别海克斯大乱斗的队列编号 ---------------- */
async function resolveQueue(state, reg, riot, R) {
  const queues = (await getJSON('https://static.developer.riotgames.com/docs/lol/queues.json').catch(() => [])) || [];
  const desc = id => { const q = queues.find(x => x.queueId === id); return q ? `${q.map} / ${q.description || ''}` : '未知'; };
  const mayhem = queues.filter(q => /mayhem/i.test(`${q.description} ${q.notes || ''}`));
  console.log('queues.json 中含 Mayhem 的队列：', mayhem.map(q => `${q.queueId}（${q.description}）`).join('、') || '无');

  // 抽查前 4 个种子玩家最近 10 局（不限队列），打印各队列出现次数，方便核对
  const hist = {};
  for (const puuid of reg.seeds.slice(0, 4)) {
    const ids = await riot(`${R}/lol/match/v5/matches/by-puuid/${puuid}/ids?count=10`) || [];
    for (const id of ids) {
      const m = await riot(`${R}/lol/match/v5/matches/${id}`);
      if (!m?.info) continue;
      const k = `${m.info.queueId}|${m.info.gameMode}`;
      hist[k] = (hist[k] || 0) + 1;
      // 把这些对局里的玩家也加入种子，扩大覆盖面
      if (m.info.queueId === QUEUE_ID || !QUEUE_ID) for (const p of m.info.participants) if (p.puuid) addPool(reg, p.puuid);
    }
  }
  console.log('抽查对局的队列分布：');
  Object.entries(hist).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => {
    const [id, mode] = k.split('|');
    console.log(`  queueId ${id}  gameMode ${mode}  ${n} 局  ${desc(+id)}`);
  });

  if (!QUEUE_ID) {
    const seenMayhem = Object.keys(hist).map(k => k.split('|')).find(([id, mode]) => mayhem.some(q => q.queueId === +id) || /kiwi|mayhem/i.test(mode));
    QUEUE_ID = seenMayhem ? +seenMayhem[0] : (mayhem[0]?.queueId || 2400);
  }
  console.log(`使用 queueId ${QUEUE_ID}（${desc(QUEUE_ID)}）`);
  if (state.queueId && state.queueId !== QUEUE_ID) {
    console.log('队列编号变了，清空旧统计');
    Object.assign(state, { patch: null, matches: 0, agg: {}, seen: [] });
  }
  state.queueId = QUEUE_ID;
}

/* ---------------- 采样 ---------------- */
const POOL_MAX = 20000;
const poolSets = new WeakMap();
function addPool(reg, puuid) {
  reg.pool ||= [];
  if (!poolSets.has(reg)) poolSets.set(reg, new Set(reg.pool));
  const set = poolSets.get(reg);
  if (set.has(puuid)) return;
  set.add(puuid);
  reg.pool.push(puuid);
  if (reg.pool.length > POOL_MAX) set.delete(reg.pool.shift());
}

// 全段位种子：从黑铁到王者，每个小段各取一页（约 205 人），合计数千名玩家
const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND'];
const DIVS = ['I', 'II', 'III', 'IV'];
async function buildSeeds(P, riot) {
  const seeds = new Set();
  for (const t of ['challengerleagues', 'grandmasterleagues', 'masterleagues']) {
    const l = await riot(`${P}/lol/league/v4/${t}/by-queue/RANKED_SOLO_5x5`);
    (l?.entries || []).slice(0, 300).forEach(e => e.puuid && seeds.add(e.puuid));
  }
  for (const t of TIERS) for (const d of DIVS) {
    const page = 1 + Math.floor(Math.random() * 3); // 随机页，避免每次都是同一批人
    const list = await riot(`${P}/lol/league-exp/v4/entries/RANKED_SOLO_5x5/${t}/${d}?page=${page}`) || [];
    list.forEach(e => e.puuid && seeds.add(e.puuid));
  }
  return [...seeds];
}

async function sample(state, stat) {
  if (MOCK) return mockSample(state, stat);
  // 旧版状态（只采韩服）迁移到按服务器分开存
  state.regions ||= {};
  if (state.seeds?.length || state.pool?.length) {
    state.regions.kr ||= { seeds: state.seeds || [], pool: state.pool || [], seedsBuilt: state.seedsBuilt };
    delete state.seeds; delete state.pool; delete state.seedsBuilt;
  }
  const seen = new Set(state.seen);
  const today = new Date().toISOString().slice(0, 10);
  // 第一个服务器先识别队列编号，之后各服务器同时采样
  let queueReady = null;
  const results = await Promise.all(PLATFORMS.map(async (pf, idx) => {
    const reg = (state.regions[pf] ||= { seeds: [], pool: [] });
    const riot = makeRiot(nameOf(pf));
    const P = `https://${pf}.api.riotgames.com`;
    const R = `https://${REGION_OF[pf] || 'asia'}.api.riotgames.com`;
    let added = 0;
    try {
      if (!reg.seeds.length || reg.seedsBuilt !== today) {
        reg.seeds = await buildSeeds(P, riot);
        reg.seedsBuilt = today;
        console.log(`[${nameOf(pf)}] 全段位种子玩家 ${reg.seeds.length} 个`);
      }
      if (idx === 0) queueReady = resolveQueue(state, reg, riot, R);
      else await sleep(1000);
      await queueReady;
      const visited = new Set();
      let scanned = 0;
      const pickRandom = arr => arr[Math.floor(Math.random() * arr.length)];
      for (let guard = 0; guard < 1e6; guard++) {
        // 七成从“打过大乱斗的玩家池”里抽，三成从全段位种子里抽，兼顾命中率和覆盖面
        const pool = reg.pool || [];
        const puuid = pool.length && Math.random() < 0.7 ? pickRandom(pool) : pickRandom(reg.seeds);
        if (!puuid) break;
        if (visited.has(puuid)) { if (visited.size >= reg.seeds.length + pool.length) break; continue; }
        visited.add(puuid);
        const ids = await riot(`${R}/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${QUEUE_ID}&count=20`) || [];
        for (const id of ids) {
          if (seen.has(id)) continue;
          seen.add(id);
          const m = await riot(`${R}/lol/match/v5/matches/${id}`);
          if (m && m.info && m.info.queueId === QUEUE_ID && addMatch(state, m, reg)) added++;
        }
        if (++scanned % 50 === 0) console.log(`  [${nameOf(pf)}] 已查 ${scanned} 名玩家，新增 ${added} 局，玩家池 ${pool.length}，请求 ${riot.count()}/${MAX_REQUESTS}`);
      }
    } catch (e) {
      if (e.message !== 'BUDGET') { console.error(`[${nameOf(pf)}] 出错，跳过这个服务器：`, e.message); if (idx === 0 && !QUEUE_ID) throw e; }
    }
    console.log(`[${nameOf(pf)}] 新增 ${added} 局`);
    return added;
  }));
  const added = results.reduce((a, b) => a + b, 0);
  state.seen = [...seen].slice(-150000);
  console.log(`本次合计新增 ${added} 局（${PLATFORMS.map((pf, i) => `${nameOf(pf)} ${results[i]}`).join('，')}），版本 ${state.patch} 累计 ${state.matches} 局`);
  return added;
}

function mockSample(state, stat) {
  const champIds = Object.keys(stat.champs).map(Number);
  const itemIds = Object.keys(stat.items).map(Number);
  const augIds = Object.keys(stat.augs).map(Number);
  let seed = 42; // mulberry32
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const strength = Object.fromEntries(champIds.map(c => [c, rnd() * 0.16 - 0.08]));
  for (let g = 0; g < 4000; g++) {
    const ids = [];
    while (ids.length < 10) { const c = pick(champIds); if (!ids.includes(c)) ids.push(c); }
    const s = ids.slice(0, 5).reduce((a, c) => a + strength[c], 0) - ids.slice(5).reduce((a, c) => a + strength[c], 0);
    const blueWin = rnd() < 0.5 + s;
    const participants = ids.map((c, i) => {
      const p = { championId: c, win: i < 5 ? blueWin : !blueWin, puuid: 'mock' + (g * 10 + i) % 300 };
      for (let k = 0; k <= 5; k++) p['item' + k] = pick(itemIds);
      for (let k = 1; k <= 4; k++) p['playerAugment' + k] = pick(augIds);
      return p;
    });
    addMatch(state, { info: { gameVersion: '26.21.1.1', queueId: QUEUE_ID, participants } }, (state.regions ||= {}).mock ||= { seeds: [], pool: [] });
  }
  return 4000;
}

/* ---------------- 聚合输出 ---------------- */
// Wilson 下界：样本少时压低排名，避免小样本“100% 胜率”冲上榜首
function wilson(w, g, z = 1.64) {
  if (!g) return 0;
  const p = w / g;
  return (p + z * z / (2 * g) - z * Math.sqrt((p * (1 - p) + z * z / (4 * g)) / g)) / (1 + z * z / g);
}
const LOW_N = 100; // 少于 100 场：页面标“样本少”
const r1 = x => Math.round(x * 10) / 10;

function build(existing, state, stat) {
  const old = new Map(existing.heroes.map(h => [h.name, h]));
  const tierOf = q => (q < 0.13 ? 'T1' : q < 0.33 ? 'T2' : q < 0.66 ? 'T3' : q < 0.87 ? 'T4' : 'T5');
  const tierLabel = { T1: 'T1 · 版本强势', T2: 'T2 · 强力', T3: 'T3 · 稳健', T4: 'T4 · 偏弱', T5: 'T5 · 弱势' };

  const rows = Object.entries(state.agg)
    .filter(([id, a]) => a.g >= MIN_GAMES && stat.champs[id])
    .map(([id, a]) => ({ id, a, wr: a.w / a.g }))
    .sort((x, y) => y.wr - x.wr);

  const heroes = rows.map((r, i) => {
    const info = stat.champs[r.id];
    const prev = old.get(info.name) || {};
    const minN = Math.max(5, r.a.g * 0.03);
    // 按 Wilson 下界排序；整套最多一双鞋
    const seenName = new Set(); let hasBoots = false; const itemStats = [];
    Object.entries(r.a.items)
      .filter(([id, s]) => stat.items[id]?.full && s[0] >= minN)
      .sort((x, y) => wilson(y[1][1], y[1][0]) - wilson(x[1][1], x[1][0]))
      .forEach(([id, s]) => {
        const it = stat.items[id];
        if (seenName.has(it.name)) return;
        if (it.boots) { if (hasBoots) return; hasBoots = true; }
        seenName.add(it.name);
        itemStats.push({ name: it.name, wr: r1(s[1] / s[0] * 100), games: s[0] });
      });
    const uniq = itemStats.map(x => x.name);
    const topAugs = Object.entries(r.a.augs)
      .filter(([, s]) => s[0] >= minN)
      .sort((x, y) => wilson(y[1][1], y[1][0]) - wilson(x[1][1], x[1][0]))
      .slice(0, 6)
      .map(([id, s]) => {
        const a = stat.augs[id] || { name: `海克斯#${id}`, rarity: '未知' };
        return { name: a.name, rarity: a.rarity, score: r1(wilson(s[1], s[0]) * 100), wr: r1(s[1] / s[0] * 100), games: s[0], low: s[0] < LOW_N };
      });
    const tier = tierOf(i / rows.length);
    const dataDriven = uniq.length >= 6 && topAugs.length >= 3;
    return {
      rank: i + 1,
      title: info.title,
      name: info.name,
      key: info.id || prev.key,
      aliases: prev.aliases || info.name,
      wr: r1(r.wr * 100),
      matches: r.a.g,
      tier,
      tierLabel: tierLabel[tier],
      roles: prev.roles || [],
      style: prev.style || '',
      skill: prev.skill || '',
      anvil: prev.anvil || '',
      coreItems: dataDriven ? uniq.slice(0, 6) : (prev.coreItems || uniq.slice(0, 6)),
      altItems: dataDriven ? uniq.slice(6, 12) : (prev.altItems || []),
      itemStats: dataDriven ? itemStats.slice(0, 12).map(x => ({ ...x, low: x.games < LOW_N })) : undefined,
      dataDriven,
      augments: topAugs.length >= 3 ? topAugs : (prev.augments || []),
      comboTitle: prev.comboTitle || '',
      comboDesc: prev.comboDesc || '',
      tips: prev.tips || '',
      generic: dataDriven ? false : !!prev.generic,
    };
  });

  // 全局海克斯榜
  const augTotal = {};
  const augHeroes = {};
  for (const [cid, a] of Object.entries(state.agg)) {
    for (const [id, s] of Object.entries(a.augs)) {
      const t = (augTotal[id] ||= [0, 0]); t[0] += s[0]; t[1] += s[1];
      (augHeroes[id] ||= []).push([cid, wilson(s[1], s[0])]);
    }
  }
  const oldAug = new Map(existing.augments.map(a => [a.name, a]));
  const players = state.matches * 10 || 1;
  const augList = Object.entries(augTotal).filter(([, s]) => s[0] >= 50).map(([id, s]) => {
    const a = stat.augs[id] || { name: `海克斯#${id}`, rarity: '未知', desc: '' };
    const prev = oldAug.get(a.name) || {};
    const score = r1(wilson(s[1], s[0]) * 100);
    return {
      name: a.name, rarity: a.rarity, score, wr: r1(s[1] / s[0] * 100), pick: r1(s[0] / players * 100),
      tier: score >= 56 ? 'S+' : score >= 53 ? 'S' : score >= 50 ? 'A' : 'B',
      isNew: !!prev.isNew, effect: prev.effect || a.desc || '',
      heroes: (augHeroes[id] || []).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([cid]) => stat.champs[cid]?.name).filter(Boolean),
    };
  }).sort((x, y) => y.score - x.score);

  // 全局装备榜
  const itemTotal = {}; const itemHeroes = {};
  for (const [cid, a] of Object.entries(state.agg)) {
    for (const [id, s] of Object.entries(a.items)) {
      if (!stat.items[id]?.full) continue;
      const t = (itemTotal[id] ||= [0, 0]); t[0] += s[0]; t[1] += s[1];
      (itemHeroes[id] ||= []).push([cid, wilson(s[1], s[0])]);
    }
  }
  const oldItem = new Map(existing.items.map(i => [i.name, i]));
  const items = Object.entries(itemTotal).filter(([, s]) => s[0] >= 100).map(([id, s]) => {
    const name = stat.items[id].name; const prev = oldItem.get(name) || {};
    return {
      name, score: r1(wilson(s[1], s[0]) * 100), wr: r1(s[1] / s[0] * 100),
      matches: s[0] >= 10000 ? r1(s[0] / 10000) + '万' : String(s[0]),
      tag: prev.tag || '', desc: prev.desc || '',
      best: (itemHeroes[id] || []).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([cid]) => stat.champs[cid]?.name).filter(Boolean),
    };
  }).sort((x, y) => y.score - x.score).slice(0, 30);

  return {
    meta: {
      ...existing.meta,
      // 对局里的 gameVersion 是 16.x，官方版本号叫 26.x（2026 年起按年份命名）
      patch: state.patch ? state.patch.replace(/^(\d+)\./, (m, a) => (+a < 20 ? +a + 10 : +a) + '.') : existing.meta.patch,
      updatedAt: new Date().toISOString(),
      sampleMatches: state.matches,
      source: MOCK ? '模拟数据（测试）' : `Riot API · ${SERVER_NAME}采样`,
      pipeline: MOCK ? 'mock' : 'riot',
      ddragon: stat.version,
    },
    heroes: heroes.length >= 20 ? heroes : existing.heroes,
    augments: augList.length >= 10 ? augList : existing.augments,
    items: items.length >= 5 ? items : existing.items,
    combos: existing.combos,
    bands: existing.bands,
  };
}

/* ---------------- 主流程 ---------------- */
const existing = JSON.parse(await readFile(join(ROOT, 'data', 'data.json'), 'utf8'));
const statePath = join(MOCK ? OUT : join(ROOT, 'data'), 'raw', 'state.json');
const state = await loadJSON(statePath, emptyState());
const stat = await loadStatic(existing);
console.log(`静态资料：${Object.keys(stat.champs).length} 英雄 / ${Object.keys(stat.augs).length} 海克斯（${stat.version}）`);

const added = REBUILD ? 0 : await sample(state, stat);
const out = build(existing, state, stat);

await mkdir(join(OUT, 'raw'), { recursive: true });
await writeFile(statePath, JSON.stringify(state));
if (added === 0 && !MOCK && !REBUILD) {
  console.log('没有新对局，数据文件不变');
} else {
  await writeFile(join(OUT, 'data.json'), JSON.stringify(out, null, 1));
  await writeFile(join(OUT, 'data.js'), '/* 自动生成，勿手改：由 scripts/update-data.mjs 生成 */\nwindow.HEX_DATA = ' + JSON.stringify(out) + ';\n');
  console.log(`已写入 ${OUT}：${out.heroes.length} 英雄，${out.augments.length} 海克斯，${out.items.length} 装备；请求 ${requests} 次`);
}
