// 从来源页面保存的渲染后 HTML 导入可见表；不访问私有接口。
import {readFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {verifyHeroPage} from './hero-identity.mjs';
import {parseHeroTables,parseVisibleHeroText} from './hero-tables.mjs';
export async function importHeroTable(id,html,visibleText,visibleTitle,visibleUrl) {
id=String(id);
if(!/^\d+$/.test(String(id)))throw Error('Invalid hero ID');
const root=new URL('../',import.meta.url), target=new URL('data/open/hexdata.json',root);
const data=JSON.parse(await readFile(target,'utf8')), hero=data.heroes.rows.find(h=>String(h.id)===id);
if(!hero)throw Error('未知英雄');
const title=visibleTitle || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]||'';
let fallbackTitle='';
if(!hero.title){const catalog=JSON.parse(await readFile(new URL('data/heroes.json',root),'utf8'));fallbackTitle=catalog.find(h=>h.name===hero.name)?.title || '';}
if(!verifyHeroPage({hero,title,body:visibleText,url:visibleUrl,fallbackTitle}))throw Error(`页面标题与指定英雄不符：期望${hero.title||fallbackTitle}（${hero.name}），实际${title}`);
const plain=(visibleText || html).replace(/<(script|style)\b[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
const meta = name => new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)`, 'i').exec(html)?.[1];
const patch=meta('report-patch') || /(?:Patch|版本)\s*(\d+\.\d+)/i.exec(plain)?.[1];
const cnDate=/截至\s*(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(plain);
const date=meta('report-date') || /数据日期\D{0,6}(\d{4}-\d{2}-\d{2})/.exec(plain)?.[1] || (cnDate && `${cnDate[1]}-${cnDate[2].padStart(2,'0')}-${cnDate[3].padStart(2,'0')}`);
if(patch!==data.heroes.patch||date!==data.heroes.date)throw Error('来源版本或数据日期与当前榜单不符，请先核对来源页面');
const parsed=visibleText ? parseVisibleHeroText(visibleText) : parseHeroTables(html);
if(parsed.coverage!=='visible-table'||parsed.sourceCount===null)throw Error('未找到完整交互表或来源条目总数，拒绝用精选摘要替代');
const norm=s=>s.replace(/[\s·・!！?？:：,，.。'"“”]/g,'').toLowerCase();
const known=new Map(data.augments.rows.map(a=>[norm(a.name),a.name]));
for(const a of parsed.augs){const name=known.get(norm(a.name));if(!name)throw Error(`未知海克斯：${a.name}`);a.name=name;}
if(new Set(parsed.augs.map(a=>norm(a.name))).size!==parsed.augs.length)throw Error('来源表存在重复海克斯，保留缓存');
// 仅替换海克斯搭配，不覆盖来源不同的出装统计。
Object.assign(hero,{augs:parsed.augs,coverage:parsed.coverage,sourceCount:parsed.sourceCount,augmentDate:date,augmentPatch:patch});
const temporary=new URL('data/open/hexdata.json.tmp',root);
await writeFile(temporary,JSON.stringify(data,null,1)+'\n');await rename(temporary,target);
console.log(`${hero.name}：已导入来源表 ${parsed.augs.length}/${parsed.sourceCount} 条，版本 ${patch}，日期 ${date}`);

return parsed.augs.length;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [id,file]=process.argv.slice(2);
 if(!id||!file)throw Error('Usage: node scripts/import-hero-table.mjs <hero-id> <rendered-page.html>');
 await importHeroTable(id,await readFile(file,'utf8'));
}
