// 读取普通浏览器页面已经展示的表格；不调用私有接口，不处理登录或访问挑战。
const {chromium}=require('../work/browser/node_modules/playwright');
const fs=require('node:fs/promises');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const {importHeroTable}=await import('./import-hero-table.mjs');
 const cache=JSON.parse(await fs.readFile('data/open/hexdata.json','utf8'));
 const limit=Math.max(1,Math.min(173,Number(process.env.MAX_HEROES)||20));
 const targets=cache.heroes.rows.filter(h=>h.coverage!=='visible-table'||h.augmentDate!==cache.heroes.date||h.augmentPatch!==cache.heroes.patch).slice(0,limit);
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true});
 const page=await browser.newPage({locale:'zh-CN',viewport:{width:1440,height:1000}});
 let success=0,failures=0;
 try {for(const h of targets){
  try {
   const response=await page.goto(`https://hexdata.com.cn/hero/${h.id}-${h.slug}`,{waitUntil:'domcontentloaded',timeout:30000});
   if([401,403,429].includes(response?.status())){console.log(`访问受限 ${response.status()}，停止本批读取`);break;}
   await page.waitForTimeout(2000);
   const entry=page.getByRole('link',{name:'打开交互详情',exact:true});
   if(await entry.count() && await entry.isVisible())await entry.click();
   await page.getByRole('heading',{name:'英雄海克斯表现',exact:true}).waitFor({state:'visible',timeout:20000});
   await page.waitForFunction(()=>/显示\s*\d+\s*\/\s*\d+\s*条/.test(document.body.innerText),null,{timeout:20000});
   await importHeroTable(String(h.id),'',await page.locator('body').innerText(),await page.title());success++;failures=0;
  } catch(e) {console.log(`${h.name} 未同步：${e.message.split('\n')[0]}`);if(++failures>=3){console.log('连续失败三次，停止并保留现有数据');break;}}
  await sleep(2000);
 }} finally {await browser.close();}
 console.log(`可见表本批同步 ${success}/${targets.length}`);
 if(targets.length && !success)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
