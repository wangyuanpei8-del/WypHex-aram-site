// 读取普通浏览器页面已经展示的表格；不调用私有接口，不处理登录或访问挑战。
const {chromium}=require('../work/browser/node_modules/playwright');
const fs=require('node:fs/promises');
const readVisibleHero=require('./browser-hero-reader.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const {importHeroTable}=await import('./import-hero-table.mjs');
 const cache=JSON.parse(await fs.readFile('data/open/hexdata.json','utf8'));
 const limit=Math.max(1,Math.min(173,Number(process.env.MAX_HEROES)||20));
 const targets=cache.heroes.rows.filter(h=>h.coverage!=='visible-table'||h.augmentDate!==cache.heroes.date||h.augmentPatch!==cache.heroes.patch||!h.augs?.length||h.sourceCount!==h.augs.length).slice(0,limit);
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--blink-settings=imagesEnabled=false']});
 const context=await browser.newContext({locale:'zh-CN',viewport:{width:1440,height:1000}});
 let page;
 let success=0,failures=0;
 try {for(const h of targets){
  try {
   page=await context.newPage();
   const response=await page.goto(`https://hexdata.com.cn/hero/${h.id}-${h.slug}`,{waitUntil:'domcontentloaded',timeout:30000});
   if([401,403,429].includes(response?.status())){console.log(`访问受限 ${response.status()}，停止本批读取`);break;}
   await readVisibleHero(page,h,importHeroTable);
   success++;failures=0;
  } catch(e) {console.log(`${h.name} 未同步：${e.message.split('\n')[0]}`);if(page){try{console.log('失败页面可见状态',JSON.stringify({hero:h.name,url:page.url(),title:await page.title(),body:(await page.locator('body').innerText({timeout:2000})).slice(0,3500)}))}catch{}};if(/访问验证/.test(e.message)){console.log('尊重来源访问限制，停止本批');break;}if(++failures>=3){console.log('连续失败三次，停止并保留现有数据');break;}}
  if(page)await page.close();
  await sleep(2000);
 }} finally {await browser.close();}
 console.log(`可见表本批同步 ${success}/${targets.length}`);
 if(targets.length && !success)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
