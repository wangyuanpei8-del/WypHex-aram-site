import test from 'node:test';
import assert from 'node:assert/strict';
import { collectDescriptions, collectStringDescriptions } from '../scripts/fetch-augment-descriptions.mjs';

test('extracts nested Chinese descriptions, preserves line breaks and strips markup', () => {
  const descriptions = collectDescriptions({ augments: [{ nameTRA: '测试 海克斯！', descTRA: '<mainText>获得护盾。<br>伤害 &amp; 治疗。</mainText>' }] });
  assert.equal(descriptions.get('测试海克斯'), '获得护盾。\n伤害 & 治疗。');
});

test('ignores missing descriptions and labels unresolved game variables', () => {
  const descriptions = collectDescriptions([{ name: '无描述' }, { name: '效果', desc: '获得 @Shield@ 护盾。' }]);
  assert.equal(descriptions.has('无描述'), false);
  assert.equal(descriptions.get('效果'), '获得 （游戏内数值） 护盾。\n具体数值以游戏内显示为准。');
});


test('matches ARAM text variants and prioritizes mode-specific effects', () => {
  const result = collectStringDescriptions({
    kiwi_handofbaron_name: '男爵之手',
    kiwi_aram_handofbaron_tooltip: '获得<scaleAP>@AFAmp@适应之力</scaleAP>。',
    cherry_handofbaron_tooltip: '其他模式效果',
    kiwi_aram_archmage: '大法师',
    kiwi_archmage_summary: '返还另一个技能的冷却时间。',
    bouncingbees_name: '弹跳蜜蜂',
    bouncingbees_description: '获得%i:scaleAD%攻击力。'
  }, ['男爵之手', '大法师', '弹跳蜜蜂']);
  assert.match(result.get('男爵之手'), /^获得（游戏内数值）适应之力/);
  assert.equal(result.get('大法师'), '返还另一个技能的冷却时间。');
  assert.equal(result.get('弹跳蜜蜂'), '获得攻击力。');
});
