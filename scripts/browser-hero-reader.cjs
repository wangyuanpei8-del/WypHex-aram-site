// 等待用户可见内容；页面入口在动态加载时可能消失，点击失败不能遮蔽已加载表格。
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
module.exports = async function readVisibleHero(page,hero,importTable,options={}){
 let lastError,entryAttempts=0;
 const wait=options.pause||pause;
 for(let attempt=0;attempt<(options.attempts||40);attempt++){
  const body=await page.locator('body').innerText();
  if(/数据访问暂时受限|请完成验证|访问验证/.test(body))throw Error('来源要求访问验证，停止自动读取');
  try{return await importTable(String(hero.id),'',body,await page.title());}catch(e){lastError=e;}
  if(entryAttempts<2){
   const entry=page.getByRole('link',{name:'打开交互详情',exact:true});
   try{if(await entry.count()&&await entry.isVisible()){entryAttempts++;await entry.click({timeout:1000});}}catch{entryAttempts++;}
  }
  await wait(500);
 }
 throw lastError||Error('来源页面尚未就绪');
};
