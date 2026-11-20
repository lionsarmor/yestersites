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
  function searchURL(raw, chosen) {
    var params = new URLSearchParams();
    if (raw) params.set('q', raw);
    if (chosen) params.set('profile', chosen);
    return 'index.html' + (params.toString() ? '?' + params.toString() : '');
  }
  function readQuery() {
    var params = new URLSearchParams(location.search);
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
      art.appendChild(element('span',' · '+(profiles[r.profile] || 'Member site')+(r.byline?' · '+r.byline:''),'cat'));
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
      results.appendChild(art);
    });
  }
  var memberOrigin='https://yestersites-webring.jamesmweeksjr.chatgpt.site';
  function published(raw) {
    if (!raw || typeof raw.slug!=='string'|| typeof raw.title!=='string' || typeof raw.url!=='string') return null;
    var parsed;
    try { parsed=new URL(raw.url,memberOrigin+'/'); } catch (e) {return null;}
    if (parsed.origin!==memberOrigin || !/^https?:$/.test(parsed.protocol)) return null;
    return {published:true,slug:raw.slug,title:raw.title,profile:raw.profile,byline:raw.byline || '',
      url:parsed.href,excerpt:raw.excerpt || raw.snippet || '',keywords:Array.isArray(raw.keywords)?raw.keywords.join(' '):raw.keywords || '',
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
  profile.addEventListener('change',updateSearch);
  window.addEventListener('popstate',function () { readQuery(); draw(); });
  if (!window.fetch || !/^https?:$/.test(location.protocol)) {
    $('network').textContent='Offline card file · the local site index.'; return;
  }
  var seenCursors=Object.create(null),loaded=Object.create(null),loadedCount=0;
  function readDirectory(cursor) {
    var path=memberOrigin+'/api/directory'+(cursor?'?cursor='+encodeURIComponent(cursor):'');
    return fetch(path,{headers:{Accept:'application/json'}}).then(function (res) {
      if (!res.ok) throw new Error('directory');
      return res.json();
    }).then(function (data) {
      if (!Array.isArray(data.sites)) throw new Error('directory');
      data.sites.forEach(function (row) {
        var member=published(row);
        if (!member || loaded[member.url]) return;
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
  readDirectory('').catch(function () {
    $('network').textContent=loadedCount?'The member index stopped partway through. Showing the cards received.':'The member index is unavailable. Searching the local site index.';
  });
}());
