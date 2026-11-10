import test from 'node:test';import assert from 'node:assert/strict';
import readVisibleHero from '../scripts/browser-hero-reader.cjs';
test('continues reading when a disappearing interactive link times out',async()=>{
 let reads=0,clicks=0;
 const page={locator:()=>({innerText:async()=>++reads===1?'加载中':'完整可见表'}),title:async()=>'亚索',getByRole:()=>({count:async()=>1,isVisible:async()=>true,click:async options=>{assert.equal(options.timeout,1000);clicks++;throw Error('入口已被动态页面替换')}})};
 const count=await readVisibleHero(page,{id:157},async(id,html,body)=>{assert.equal(id,'157');if(body!=='完整可见表')throw Error('尚未加载');return 16},{pause:async()=>{}});
 assert.equal(count,16);assert.equal(reads,2);assert.equal(clicks,1);
});
test('does not click the old entry when the visible table is already loaded',async()=>{
 const page={locator:()=>({innerText:async()=>'完整可见表'}),title:async()=>'亚索',getByRole:()=>{throw Error('不应点击旧入口')}};
 assert.equal(await readVisibleHero(page,{id:157},async()=>16),16);
});
test('stops on an access challenge without attempting clicks or import',async()=>{
 const page={locator:()=>({innerText:async()=>'数据访问暂时受限，请完成验证'})};
 await assert.rejects(readVisibleHero(page,{id:157},async()=>{throw Error('不应导入')}),/来源要求访问验证/);
});
