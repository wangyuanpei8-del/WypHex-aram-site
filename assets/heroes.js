(() => {
  'use strict';
  const roles=[['all','全部'],['fighter','战士'],['mage','法师'],['assassin','刺客'],['marksman','射手'],['tank','坦克'],['support','辅助']];
  const heroes=window.HEX_DATA.heroes,tags=window.HEX_HERO_ROLES||{};
  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let selected=new URLSearchParams(location.hash.slice(1)).get('role')||'all';
  const valid=()=>{if(!roles.some(r=>r[0]===selected))selected='all'}; valid();
  try{const t=localStorage.getItem('hexaram.theme');if(t)document.documentElement.dataset.theme=t}catch{}
  function render(){
    document.querySelector('#roles').innerHTML=roles.map(([id,label])=>`<button type="button" data-role="${id}" aria-pressed="${id===selected}" aria-selected="${id===selected}">${label}<span>${heroes.filter(h=>id==='all'||(tags[h.key]||[]).includes(id)).length}</span></button>`).join('');
    const list=heroes.filter(h=>selected==='all'||(tags[h.key]||[]).includes(selected));
    document.querySelector('#count').textContent=`${roles.find(r=>r[0]===selected)[1]} · ${list.length} 位英雄`;
    document.querySelector('#heroes').innerHTML=list.map(h=>`<a class="hero-tile" href="index.html#hero=${encodeURIComponent(h.name)}&from=catalog&role=${selected}" aria-label="查看${esc(h.name)}的适配海克斯"><img loading="lazy" src="assets/icons/champ/${esc(h.key)}.png" alt="" width="56" height="56"><b>${esc(h.name)}</b><small title="${esc(h.title)}">${esc(h.title)}</small></a>`).join('');
  }
  document.querySelector('#roles').addEventListener('click',e=>{const b=e.target.closest('[data-role]');if(!b||b.dataset.role===selected)return;selected=b.dataset.role;history.replaceState(null,'','#role='+selected);render();window.scrollTo({top:0,behavior:'instant'})});
  document.querySelector('#heroes').addEventListener('click',e=>{if(e.target.closest('.hero-tile'))try{sessionStorage.setItem('hexaram.catalog-position',JSON.stringify({role:selected,y:scrollY}))}catch{}});
  window.addEventListener('hashchange',()=>{selected=new URLSearchParams(location.hash.slice(1)).get('role')||'all';valid();render()});
  document.querySelector('#theme-toggle').onclick=()=>{const light=(document.documentElement.dataset.theme||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'))==='light';const t=light?'dark':'light';document.documentElement.dataset.theme=t;try{localStorage.setItem('hexaram.theme',t)}catch{}};
  render();
  if(new URLSearchParams(location.search).has('return'))try{const saved=JSON.parse(sessionStorage.getItem('hexaram.catalog-position'));if(saved?.role===selected)requestAnimationFrame(()=>window.scrollTo(0,saved.y))}catch{}
})();
