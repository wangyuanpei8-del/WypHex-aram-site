// 读取普通浏览器页面已经展示的表格；不调用私有接口，不处理登录或访问挑战。
const {chromium}=require('../work/browser/node_modules/playwright');
const fs=require('node:fs/promises');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const {importHeroTable}=await import('./import-hero-table.mjs');
 const cache=JSON.parse(await fs.readFile('data/open/hexdata.json','utf8'));
 const limit=Math.max(1,Math.min(173,Number(process.env.MAX_HEROES)||20));
 const targets=cache.heroes.rows.filter(h=>h.coverage!=='visible-table'||h.augmentDate!==cache.heroes.date||h.augmentPatch!==cache.heroes.patch||!h.augs?.length||h.sourceCount!==h.augs.length).slice(0,limit);
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true});
 const page=await browser.newPage({locale:'zh-CN',viewport:{width:1440,height:1000}});
 let success=0,failures=0;
 try {for(const h of targets){
  try {
   const response=await page.goto(`https://hexdata.com.cn/hero/${h.id}-${h.slug}`,{waitUntil:'domcontentloaded',timeout:30000});
   if([401,403,429].includes(response?.status())){console.log(`访问受限 ${response.status()}，停止本批读取`);break;}
   let imported=false,lastError;
   for(let attempt=0;attempt<40;attempt++){
    const entry=page.getByRole('link',{name:'打开交互详情',exact:true});
    if(await entry.count() && await entry.isVisible())await entry.click();
    const body=await page.locator('body').innerText();
    if(/数据访问暂时受限|请完成验证|访问验证/.test(body))throw Error('来源要求访问验证，停止自动读取');
    try {
     await importHeroTable(String(h.id),'',body,await page.title());
     imported=true;break;
    } catch(e){lastError=e;}
    await sleep(500);
   }
   if(!imported)throw lastError || Error('来源页面尚未就绪');
   success++;failures=0;
  } catch(e) {console.log(`${h.name} 未同步：${e.message.split('\n')[0]}`);if(/访问验证/.test(e.message)){console.log('尊重来源访问限制，停止本批');break;}if(++failures>=3){console.log('连续失败三次，停止并保留现有数据');break;}}
  await sleep(2000);
 }} finally {await browser.close();}
 console.log(`可见表本批同步 ${success}/${targets.length}`);
 if(targets.length && !success)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
