(() => {
  const lookup='https://yestersites-webring.jamesmweeksjr.chatgpt.site/api/member-hosting';
  function rewrite(node){
    const u=new URL(node.href,location.href),m=/^\/members\/([a-z0-9-]{1,40})\/(.*)$/.exec(u.pathname);
    if(!m || !['https://yestersites.com','https://yestersites-webring.jamesmweeksjr.chatgpt.site'].includes(u.origin))return;
    node.href='https://'+m[1]+'.yestersites.com/'+(m[2]==='index.html'?'':m[2])+u.search+u.hash;
  }
  fetch(lookup,{credentials:'omit'}).then(r=>r.json()).then(state=>{
    if(!state.subdomains)return;
    window.memberLinksActive=true;
    document.querySelectorAll('a[href],area[href]').forEach(rewrite);
    new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(n=>{
      if(n.nodeType!==1)return;
      if(n.matches('a[href],area[href]'))rewrite(n);
      n.querySelectorAll('a[href],area[href]').forEach(rewrite);
    }))).observe(document.body,{childList:true,subtree:true});
    window.dispatchEvent(new Event('member-domains-ready'));
  }).catch(()=>{});
})();
