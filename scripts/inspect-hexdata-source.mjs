const base='https://hexdata.com.cn';
const html=await fetch(base,{signal:AbortSignal.timeout(30000)}).then(r=>r.text());
const urls=[...html.matchAll(/<script[^>]+src=["']([^"']+)/g)].map(m=>new URL(m[1],base));
console.log('SCRIPTS',urls.map(u=>u.href));
for(const url of urls){
 if(url.origin!==base)continue;
 const js=await fetch(url,{signal:AbortSignal.timeout(30000)}).then(r=>r.text());
 console.log('FILE',url.href,'BYTES',js.length);
 for(const m of js.matchAll(/.{0,180}(?:fetch\(|\/api\/|\.json|\.csv|\.parquet).{0,220}/g))console.log(m[0]);
}
