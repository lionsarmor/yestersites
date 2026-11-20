(() => {
  const list=document.getElementById('trending-sites');
  function draw(sites){
    const fragment=document.createDocumentFragment();
    for(const r of sites){
      if(!/^[a-z0-9-]{1,40}$/.test(r.slug))continue;
      const li=document.createElement('li'),link=document.createElement('a'),credit=document.createElement('small');
      link.href='https://'+r.slug+'.yestersites.com/';link.textContent=r.title;
      credit.textContent=' · '+(r.byline||r.slug);
      li.append(link,credit,document.createElement('br'),r.snippet||r.excerpt||'');fragment.append(li);
    }
    if(fragment.childNodes.length)list.replaceChildren(fragment);
  }
  const day=new Date().toISOString().slice(0,10);
  function score(slug){let h=2166136261;for(const c of slug+day)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
  draw([...window.GrubMembers].sort((a,b)=>score(b.slug)-score(a.slug)).slice(0,5));
  fetch('https://yestersites-webring.jamesmweeksjr.chatgpt.site/api/trending',{credentials:'omit'}).then(r=>r.ok?r.json():null).then(data=>{if(data?.sites)draw(data.sites);}).catch(()=>{});
})();
