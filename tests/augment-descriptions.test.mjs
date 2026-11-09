import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDescription } from '../scripts/hexdata-descriptions.mjs';
test('extracts only the Hexdata effect, preserving numbers and decoding markup', () => {
  assert.equal(extractDescription('<p>男爵之手更适合先在甲、乙这类高分高样本英雄上考虑。获得<b>25%</b>适应之力。护盾 &amp; 治疗。如果你的英雄机制能稳定触发这个海克斯，优先看上方适配英雄。</p>'), '获得 25% 适应之力。护盾 & 治疗。');
});
test('does not treat stats or generic recommendations as effects', () => {
  assert.equal(extractDescription('<p>胜率 57.8%，样本 1000 场。</p>'), '');
  assert.equal(extractDescription('这类高分高样本英雄上考虑。如果你的英雄机制'), '');
});
