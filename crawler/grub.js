(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var originals = window.GrubMembers;
  if (!Array.isArray(originals) || !window.URL || !window.URLSearchParams) return;

  var records = originals.slice();
  var profiles = {text:'Text', classic:'Classic', millennium:'Millennium'};
  var query = $('words'), profile = $('profile'), results = $('results');
  function words(value) {
    return String(value || '').toLowerCase().replace(/[’']/g, '').match(/[a-z0-9\u00c0-\uffff]+/g) || [];
  }
  function searchable(value) { return words(value).join(' '); }
  function element(tag, text, klass) {
    var item = document.createElement(tag);
    if (text) item.textContent = text;
    if (klass) item.className = klass;
    return item;
  }
  function a(label, href) {
    var link = element('a', label);
    link.href = href;
    return link;
  }
  var subject=$('subject');
  var subjects={anime:/anime|manga|shrine/i,games:/game|nintendo|arcade|console/i,radio:/radio|broadcast|shortwave|station/i,bbs:/bbs|bulletin board|dial.up/i};
  Object.entries(RetroTopics.labels).forEach(function(entry){
    var choice=Array.from(subject.options).find(function(o){return o.value===entry[0];});
    if(choice)choice.textContent=entry[1];else subject.add(new Option(entry[1],entry[0]));
  });
  function searchURL(raw, chosen) {
    var params = new URLSearchParams();
    if(subject.value)params.set('subject',subject.value);
    if (raw) params.set('q', raw);
    if (chosen) params.set('profile', chosen);
    return 'index.html' + (params.toString() ? '?' + params.toString() : '');
  }
  function readQuery() {
    var params = new URLSearchParams(location.search);
    subject.value=params.get('subject')||'';
    query.value = (params.get('q') || '').slice(0,160);
    var selected = params.get('profile');
    profile.value = Object.prototype.hasOwnProperty.call(profiles, selected) ? selected : '';
  }
  function pageRank(tokens, record) {
    var name = searchable(record.title), subject = searchable([record.excerpt,record.byline,record.keywords,record.slug].join(' '));
    var pages = record.pages || [];
    var best = null, score = -1;
    // Each returned hit has one document (or catalogue card) that explains the match.
    [{title:'',body:'',url:record.url}].concat(pages).forEach(function (page) {
      var title = searchable(page.title), body = searchable(page.body), sum = 0;
      if (!tokens.every(function (t) {
        if (name.indexOf(t) >= 0) { sum += 8; return true; }
        if (title.indexOf(t) >= 0) { sum += 5; return true; }
        if (subject.indexOf(t) >= 0) { sum += 3; return true; }
        if (body.indexOf(t) >= 0) { sum++; return true; }
        return false;
      })) return;
      if (sum > score) {score=sum; best=page;}
    });
    return {score:score, page:best};
  }
  var gifPanel = window.GifCities.panel($('gif-matches'));
  $('gifcities').onclick = function () { gifPanel.search(query.value); };
  query.addEventListener('input',gifPanel.clear);
  function draw() {
    var raw = query.value.trim(), kind = profile.value, tokens=words(raw), bySlug=Object.create(null);
    var hits = [];
    records.forEach(function (r,i) {
      bySlug[(r.published?'member:':'original:')+r.slug]=r;
      if(subject.value==='text' && !(r.published || r.profile==='text' || (r.pages||[]).some(p=>/text/i.test(p.url))))return;
      if(subject.value && subject.value!=='text' && (r.categories?.length ? !r.categories.includes(subject.value) : !subjects[subject.value] || !subjects[subject.value].test([r.title,r.excerpt,r.keywords,(r.pages||[]).map(p=>p.title+' '+p.body).join(' ')].join(' '))))return;
      if (kind && r.profile!==kind) return;
      var match = pageRank(tokens,r);
      if (match.score>=0) hits.push({r:r,m:match,n:i});
    });
    hits.sort(function (x,y) {return y.m.score-x.m.score || x.n-y.n;});
    results.textContent='';
    $('sectionname').textContent=raw ? 'Cards for “'+raw+'”' : 'The card file';
    $('count').textContent=hits.length+' of '+records.length+' sites';
    if (!hits.length) {
      var msg=element('div',null,'nohits');
      msg.appendChild(element('p','No cards in this drawer. Try a shorter word or another site profile.'));
      msg.appendChild(a('See the full card file','index.html'));
      results.appendChild(msg);
    }
    hits.forEach(function (hit) {
      var r=hit.r, art=element('article',null,'hit'), title=element('h3');
      title.appendChild(a(r.title,r.url)); art.appendChild(title);
      var by=element('span',' · '+(profiles[r.profile]||'Member site'),'cat');
      if(r.byline){by.appendChild(document.createTextNode(' · '));by.appendChild(r.creatorUrl?a(r.byline,r.creatorUrl):document.createTextNode(r.byline));}art.appendChild(by);
      if (r.excerpt) art.appendChild(element('p',r.excerpt));
      if (raw && hit.m.page && hit.m.page.title && hit.m.page.url!==r.url) {
        var match = element('p','Found in ','hitpage');
        match.appendChild(a(hit.m.page.title,hit.m.page.url)); art.appendChild(match);
      }
      var neighbors = [];
      (r.links || []).forEach(function (v) {
        var key=typeof v==='string' ? v : '';
        var match=/^\/?members\/([a-z0-9-]+)\/?$/.exec(key);
        if (match) key=match[1];
        var dst=bySlug[(match || r.published?'member:':'original:')+key];
        if (dst && dst!==r && neighbors.indexOf(dst)<0) neighbors.push(dst);
      });
      if (neighbors.length) {
        var junction=element('p','Links to ','junction');
        neighbors.forEach(function (dst,idx) {
          if (idx) junction.appendChild(document.createTextNode(' / '));
          junction.appendChild(a(dst.title,dst.url));
        });
        art.appendChild(junction);
      }
      if(r.categories?.length || r.tags?.length){
        var topics=(r.categories||[]).map(k=>RetroTopics.labels[k]).concat((r.tags||[]).map(t=>'#'+t));
        art.appendChild(element('small',topics.join(' · '),'card-topics'));
      }
      results.appendChild(art);
    });
  }
  var memberOrigin='https://yestersites-webring.jamesmweeksjr.chatgpt.site';
  function published(raw) {
    if (!raw || typeof raw.slug!=='string'|| typeof raw.title!=='string' || typeof raw.url!=='string') return null;
    var parsed;
    try { parsed=new URL(raw.url,memberOrigin+'/'); } catch (e) {return null;}
    if(parsed.origin!==memberOrigin && parsed.href!=='https://'+raw.slug+'.yestersites.com/')return null;
    return {published:true,slug:raw.slug,title:raw.title,profile:raw.profile,byline:raw.byline || '',
      creatorUrl:/^\/creators\/[0-9a-f]{32}\/$/.test(raw.creatorUrl||'')?memberOrigin+raw.creatorUrl:null,categories:raw.categories||[],tags:raw.tags||[],url:parsed.href,excerpt:raw.excerpt || raw.snippet || '',keywords:[].concat(raw.keywords||[],raw.tags||[],(raw.categories||[]).map(k=>RetroTopics.labels[k])).join(' '),
      links:Array.isArray(raw.links)?raw.links:[]};
  }
  readQuery(); draw(); $('lookup').hidden=false;
  $('lookup').addEventListener('submit',function (event) {
    event.preventDefault(); gifPanel.clear(); updateSearch();
  });
  function updateSearch() {
    var path=searchURL(query.value.trim(),profile.value);
    if (window.history && history.pushState) {
      try { history.pushState(null,'',path); } catch(e) { /* file:// still searches in place */ }
    }
    draw();
  }
  subject.addEventListener('change',updateSearch);
  profile.addEventListener('change',updateSearch);
  window.addEventListener('popstate',function () { readQuery(); draw(); });
  if (!window.fetch || !/^https?:$/.test(location.protocol)) {
    $('network').textContent='Offline card file · the local site index.'; return;
  }
  var seenCursors=Object.create(null),loaded=Object.create(null),loadedCount=0;
  async function directoryPage(path) {
    for (var attempt=0; ; attempt++) {
      try {
        var res=await fetch(path,{credentials:'omit',cache:'no-store',headers:{Accept:'application/json'}});
      } catch (error) {
        if (attempt>=2) throw error;
        res=null;
      }
      if (res && res.ok) return res.json();
      if (res && (attempt>=2 || (res.status<500 && res.status!==429))) throw Error('Directory unavailable');
      await new Promise(function(resolve){setTimeout(resolve,600*(attempt+1));});
    }
  }
  function readDirectory(cursor) {
    var path=memberOrigin+'/api/directory'+(cursor?'?cursor='+encodeURIComponent(cursor):'');
    return directoryPage(path).then(function (data) {
      if (!Array.isArray(data.sites)) throw new Error('directory');
      data.sites.forEach(function (row) {
        var member=published(row);
        if(!member || loaded[member.url])return;
        var original=originals.find(function(r){return r.slug===member.slug;});
        if(original){original.creatorUrl=member.creatorUrl;original.categories=member.categories;original.tags=member.tags;if(member.tags.length)original.keywords=[original.keywords,member.keywords].join(' ');return;}
        loaded[member.url]=true;loadedCount++;records.push(member);
      });
      draw();
      if (data.nextCursor && !seenCursors[data.nextCursor]) {
        seenCursors[data.nextCursor]=true;
        return readDirectory(data.nextCursor);
      }
      $('network').textContent=loadedCount ? loadedCount+' published member '+(loadedCount===1?'site':'sites')+' in the file.' : '';
    });
  }
  function refresh(){
    $('network').textContent='Opening the member card file…';
    readDirectory('').catch(function(){
      $('network').textContent='Showing the cards received so far. ';
      var retry=element('button','Retry member search');retry.type='button';retry.onclick=refresh;
      $('network').appendChild(retry);
      seenCursors=Object.create(null);
    });
  }
  refresh();
}());
