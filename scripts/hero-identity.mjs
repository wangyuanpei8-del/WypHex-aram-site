// 标题缺少新英雄姓名时，要求来源 URL 的 ID、维护的称号和页面概览共同匹配。
export function verifyHeroPage({hero,title,body='',url,fallbackTitle=''}) {
 let canonical=false;
 if(url){try{const u=new URL(url);canonical=u.origin==='https://hexdata.com.cn'&&new RegExp(`^/hero/${hero.id}(?:-[^/]+)?/?$`).test(u.pathname);if(!canonical)return false;}catch{return false;}}
 if(title.includes(hero.name)&&(!hero.title||title.includes(hero.title)))return true;
 if(hero.title||!canonical||!fallbackTitle||!title.includes(fallbackTitle))return false;
 const start=body.indexOf('返回全英雄排行');
 const end=body.indexOf('\n02\n推荐决策',start);
 if(start<0||end<0)return false;
 return body.slice(start,end).split('\n').some(line=>line.trim()===fallbackTitle);
}
