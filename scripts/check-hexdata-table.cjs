// 仅检查普通浏览器页面可见的英雄搭配表，不直接请求数据接口。
const {chromium}=require('../work/browser/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true});
 const page=await browser.newPage({locale:'zh-CN',viewport:{width:1440,height:1000}});
 await page.goto('https://hexdata.com.cn/hero/157-yasuo',{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForTimeout(12000);
 console.log('PAGE TITLE',await page.title());
 const body=await page.locator('body').innerText();
 console.log('VISIBLE TEXT',body.slice(0,26000));
 await page.screenshot({path:'work/hexdata-page.png',fullPage:true});
 await require('node:fs/promises').writeFile('work/hexdata-rendered.html',await page.content());
 await browser.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
