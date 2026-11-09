const base='https://hexdata.com.cn';
const html=await fetch(base,{signal:AbortSignal.timeout(30000)}).then(r=>r.text());
const queue=[...html.matchAll(/<script[^>]+src=["']([^"']+)/g)].map(m=>new URL(m[1],base));
const seen=new Set();
while(queue.length&&seen.size<12){const url=queue.shift();if(url.origin!==base||seen.has(url.href))continue;seen.add(url.href);
const js=await fetch(url,{signal:AbortSignal.timeout(30000)}).then(r=>r.text());console.log('FILE',url.href,'BYTES',js.length);
if(js.length<15000)console.log(js);
else for(const m of js.matchAll(/.{0,160}(?:fetch\(|\/api\/|\.json|\.csv|\.parquet).{0,260}/g))console.log(m[0]);
for(const m of js.matchAll(/(?:["'`])((?:\/assets\/|\.\/)[^"'`]+\.js)(?:["'`])/g))queue.push(new URL(m[1],url));
}
