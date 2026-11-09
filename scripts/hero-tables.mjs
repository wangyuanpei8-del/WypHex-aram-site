// 按表头识别列，不假设精选表与交互表的列顺序相同。
const entities = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/&(#x[\da-f]+|#\d+|\w+);/gi,(m,k)=>k[0]==='#'?String.fromCodePoint(parseInt(k.slice(k[1]?.toLowerCase()==='x'?2:1),k[1]?.toLowerCase()==='x'?16:10)):entities[k]??m).replace(/\s+/g,' ').trim();
const number = value => { const m=value?.replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):null; };
export function parseHeroTables(html) {
  const summary=new Map(), full=new Map(), items=new Map();
  let expected=null, fullFound=false;
  for(const match of html.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    const table=match[0], rows=[...table.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map(m=>m[0]);
    const header=rows.find(row=>/<th\b/i.test(row));if(!header)continue;
    const headers=[...header.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(m=>text(m[1]));
    const col = re=>headers.findIndex(h=>re.test(h));
    const name=col(/海克斯|符文|装备/), wr=col(/^(?:组合|搭配)?胜率(?:\s*[◆◇▼▲↕])?$/), games=col(/^(?:搭配)?场次|样本/), score=col(/HexScore|综合评分/i);
    if(name<0||wr<0||games<0)continue;
    const isAug=/海克斯|符文/.test(headers[name]);
    const isFull=isAug&&/组合胜率/.test(headers[wr]);
    const target=isAug?(isFull?full:summary):items;
    if(isFull){fullFound=true;const before=text(html.slice(Math.max(0,match.index-16000),match.index));const counts=[...before.matchAll(/显示\s*(\d+)\s*\/\s*(\d+)\s*条/g)];if(counts.length)expected=Number(counts.at(-1)[2]);}
    for(const row of rows){if(/<th\b/i.test(row))continue;
      const cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>text(m[1]));
      const n=cells[name], w=number(cells[wr]), g=number(cells[games]);
      if(!n||w===null||w<0||w>100||!Number.isInteger(g)||g<1)continue;
      target.set(n,{name:n,wr:w,games:g,...(score>=0?{score:number(cells[score])}: {})});
    }
  }
  const augs=[...(fullFound?full:summary).values()];
  if(fullFound&&expected!==null&&augs.length!==expected)throw new Error(`交互表不完整：解析 ${augs.length} / 页面 ${expected}，保留原数据`);
  return {augs,items:[...items.values()],coverage:fullFound?'visible-table':'summary',sourceCount:expected};
}
