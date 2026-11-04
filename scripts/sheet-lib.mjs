// 表格 <-> data.json 的共用工具：CSV 读写、列定义
import { readFile } from 'node:fs/promises';

export const TIER_LABEL = {
  T1: 'T1 · S+霸主', T2: 'T2 · S级强势', T3: 'T3 · A级稳健', T4: 'T4 · B级吃符文', T5: 'T5 · C级特化',
};

/* ---------- CSV ---------- */
export function toCSV(rows) {
  const cell = v => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // 开头加 BOM，Excel 双击打开中文不乱码
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}

// 读 CSV：优先按 UTF-8，若是 Excel 另存的 GBK 编码也能读
export async function readCSV(path) {
  const buf = await readFile(path);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { text = new TextDecoder('gbk').decode(buf); }
  const [head, ...body] = parseCSV(text);
  const cols = head.map(h => h.trim());
  return body.map((r, i) => {
    const o = { _line: i + 2 };
    cols.forEach((c, j) => { o[c] = (r[j] ?? '').trim(); });
    return o;
  });
}

/* ---------- 单元格格式 ---------- */
export const splitList = s => String(s || '').split(/[、,，;；|]/).map(x => x.trim()).filter(Boolean);
export const joinList = a => (a || []).join('、');
export const num = s => { const n = parseFloat(String(s).replace(/[%\s]/g, '')); return Number.isFinite(n) ? n : null; };
export const yes = s => /^(是|y|yes|true|1|新)$/i.test(String(s).trim());

// 英雄海克斯：一格写多个，格式“名称 稀有度 胜率”，用分号隔开
// 例：鼓声暴起低音轰鸣 黄金 68.3；秘术冲拳 棱彩 65.8
export function parseHeroAugs(s, where) {
  return String(s || '').split(/[;；\n]/).map(x => x.trim()).filter(Boolean).map(part => {
    const t = part.split(/\s+/);
    let wr = null; let rarity = '未知';
    if (t.length > 1 && num(t[t.length - 1]) != null) wr = num(t.pop());
    if (t.length > 1 && /^(棱彩|黄金|白银|未知)$/.test(t[t.length - 1])) rarity = t.pop();
    const name = t.join(' ');
    if (!name) throw new Error(`${where}：海克斯格式不对：“${part}”`);
    return { name, rarity, score: wr ?? 0, wr: wr ?? 0 };
  });
}
export const fmtHeroAugs = augs => (augs || []).map(a => `${a.name} ${a.rarity}${a.wr ? ' ' + a.wr : ''}`).join('；');

/* ---------- 列定义（表头就是中文列名） ---------- */
export const HERO_COLS = ['英雄', '称号', '英文ID', '别名', '梯队', '胜率', '场次', '定位', '流派', '加点', '锻体',
  '核心装备', '备选装备', '海克斯', '组合标题', '组合说明', '上手要点', '通用模板'];
export const AUG_COLS = ['海克斯', '稀有度', '梯队', '胜率', '选取率', '本版本新增', '效果', '推荐英雄'];
export const ITEM_COLS = ['装备', '胜率', '场次', '标签', '说明', '推荐英雄'];
export const COMBO_COLS = ['标题', '英雄', '梯队', '标签', '核心装备', '说明'];
export const META_COLS = ['项目', '内容'];
