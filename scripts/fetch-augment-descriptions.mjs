// 从 CommunityDragon 获取中文海克斯效果；网页使用本地副本，悬停时无需联网。
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = 'https://raw.communitydragon.org/latest';
const normalize = s => String(s).replace(/[\s·・!！?？:：,，.。'"“”（）()]/g, '').toLowerCase();
const plain = s => String(s).replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')
  .replace(/%i:[^%]+%/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();

export function collectDescriptions(node, out = new Map()) {
  if (!node || typeof node !== 'object') return out;
  const name = node.nameTRA || node.name || node.displayName || node.DisplayName;
  const description = node.descTRA || node.descriptionTRA || node.desc || node.description || node.tooltip;
  if (typeof name === 'string' && typeof description === 'string' && description.trim()) {
    const text = plain(description).replace(/\{\{SpellName\}\}|@SpellName@/gi, '对应技能').split(/\n+(?:命中的敌人|任务进度|已获取攻击力的总和|伤害总和)[：:]/)[0].trim();
    // 未展开的游戏变量不伪装成确定数值。
    const unresolved = /@[^@\n]+@|\{\{[^}]+\}\}/.test(text);
    out.set(normalize(name), text.replace(/@[^@\n]+@|\{\{[^}]+\}\}/g, '（游戏内数值）') + (unresolved ? '\n具体数值以游戏内显示为准。' : ''));
  }
  for (const child of Object.values(node)) if (child && typeof child === 'object') collectDescriptions(child, out);
  return out;
}

const run = promisify(execFile);
async function get(url, json = true) {
  // curl 遵循运行环境的 HTTPS_PROXY 和 CA 设置。
  const { stdout } = await run('curl', ['--fail', '--silent', '--show-error', '--location', '--max-time', '60', url], { maxBuffer: 64 * 1024 * 1024 });
  return json ? JSON.parse(stdout) : stdout;
}

export function collectStringDescriptions(entries, names) {
  const out = new Map();
  for (const name of names) {
    const candidates = Object.keys(entries).filter(k => (k.endsWith('_name') || k.startsWith('kiwi_')) && normalize(entries[k]) === normalize(name))
      .sort((a, b) => Number(b.startsWith('kiwi_')) - Number(a.startsWith('kiwi_')));
    for (const key of candidates) {
      const prefix = key.replace(/_name$/, '');
      const stem = prefix.replace(/^(kiwi_aram_|kiwi_|cherry_)/, '');
      const prefixes = [...new Set(['kiwi_aram_' + stem, 'kiwi_' + stem, 'kiwi_augment_' + stem, stem, stem.replace(/^quest_/, ''), prefix])];
      // 静态效果说明不包含对局中的追踪器数值。
      const desc = prefixes.flatMap(p => ['_description', '_tooltipdescription', '_summary', '_desc', '_quest_desc', '_tooltip'].map(s => entries[p + s])).find(Boolean);
      if (desc) { collectDescriptions({ name, desc }, out); break; }
    }
  }
  return out;
}

async function main() {
  const data = await readFile(join(root, 'data/data.js'), 'utf8');
  const heroes = JSON.parse(data.slice(data.indexOf('{'), data.lastIndexOf('}') + 1)).heroes;
  const names = [...new Set(heroes.flatMap(h => h.augs.map(a => a.n)))];
  const strings = await get(`${base}/game/zh_cn/data/menu/en_us/lol.stringtable.json`);
  const descriptions = collectStringDescriptions(strings.entries, names);
  const result = {};
  for (const name of names) {
    const description = descriptions.get(normalize(name));
    if (description) result[name] = description;
  }
  if (!Object.keys(result).length) throw new Error('未获取到匹配的海克斯描述，保留原文件。');
  // 数据源缺项时保留已有描述，避免临时缺失导致说明消失。
  let previous = {};
  try {
    const saved = await readFile(join(root, 'data/augment-descriptions.js'), 'utf8');
    previous = JSON.parse(saved.slice(saved.indexOf('{'), saved.lastIndexOf('}') + 1));
  } catch {}
  for (const name of names) if (!result[name] && previous[name]) result[name] = previous[name];
  await writeFile(join(root, 'data/augment-descriptions.js'),
    '/* 自动生成：scripts/fetch-augment-descriptions.mjs；来源：CommunityDragon */\nwindow.HEX_AUG_DESCRIPTIONS = ' + JSON.stringify(result) + ';\n');
  console.log(`海克斯描述 ${Object.keys(result).length}/${names.length}`);
  const missing = names.filter(n => !result[n]);
  if (missing.length) console.log('缺少描述：' + missing.join('、'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
