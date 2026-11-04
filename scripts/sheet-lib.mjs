// 读表格用的共用工具：CSV 解析、单元格格式
import { readFile } from 'node:fs/promises';

export const TIER_LABEL = {
  T1: 'T1 · S+霸主', T2: 'T2 · S级强势', T3: 'T3 · A级稳健', T4: 'T4 · B级吃符文', T5: 'T5 · C级特化',
};

/* ---------- CSV ---------- */
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
