const base='https://hexdata.com.cn';
for(const path of ['/data/meta.json','/data/heroes/157.json','/api/hexdata/heroes/157']){
 const r=await fetch(base+path,{signal:AbortSignal.timeout(30000)});console.log('URL',path,'STATUS',r.status);
 const t=await r.text();console.log(t.slice(0,18000));
}
