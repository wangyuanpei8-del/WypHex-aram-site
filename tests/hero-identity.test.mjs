import test from 'node:test';import assert from 'node:assert/strict';import {verifyHeroPage} from '../scripts/hero-identity.mjs';
const hero={id:805,name:'洛克',title:''};const example={hero,title:'灰烬驱魔人海克斯胜率 · Patch 16.22',fallbackTitle:'灰烬驱魔人',url:'https://hexdata.com.cn/hero/805-locke',body:'返回全英雄排行\n下载 HexBox\n\n灰烬驱魔人\n\n刺客 · 法师\n02\n推荐决策'};
test('identifies a hero with an omitted name using URL ID and the curated visible title',()=>assert.equal(verifyHeroPage(example),true));
test('rejects the same title on the wrong hero URL',()=>assert.equal(verifyHeroPage({...example,url:'https://hexdata.com.cn/hero/157-yasuo'}),false));
test('does not accept a missing name without a canonical URL or matching overview',()=>{assert.equal(verifyHeroPage({...example,url:undefined}),false);assert.equal(verifyHeroPage({...example,body:'灰烬驱魔人'}),false);assert.equal(verifyHeroPage({...example,title:'海克斯大乱斗英雄详情'}),false)});
test('keeps normal hero title checks strict',()=>{const h={id:157,name:'亚索',title:'疾风剑豪'};assert(verifyHeroPage({hero:h,title:'疾风剑豪（亚索）胜率'}));assert.equal(verifyHeroPage({hero:h,title:'亚索胜率'}),false)});
