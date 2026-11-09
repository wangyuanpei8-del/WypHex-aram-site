import test from 'node:test';
import assert from 'node:assert/strict';
import { descriptionStatus, validDescription, detailDates } from '../scripts/data-quality.mjs';
test('does not certify descriptions without a matching source version', () => {
 assert.equal(descriptionStatus({description:'获得护盾。'},'16.22'),'unknown');
 assert.equal(descriptionStatus({description:'获得护盾。',descriptionPatch:'16.21'},'16.22'),'outdated');
 assert.equal(descriptionStatus({description:'获得护盾。',descriptionPatch:'16.22'},'16.22'),'current');
 assert.equal(descriptionStatus({},'16.22'),'missing');
});
test('rejects unresolved or contaminated descriptions', () => {
 for(const s of ['', '获得@Shield@护盾。', '{{SpellName}}造成伤害', '<b>护盾</b>', '如果你的英雄机制能触发'])assert.equal(validDescription(s),false);
 assert.equal(validDescription('获得25%适应之力。'),true);
});
test('preserves mixed dates and unknown dates instead of replacing them with the latest', () => {
 assert.deepEqual(detailDates('2026-10-30',[{date:'2026-11-09'},{date:'2026-10-30'},{}],'2026-11-09'),{oldest:'2026-10-30',newest:'2026-11-09',old:1,unknown:1});
});
