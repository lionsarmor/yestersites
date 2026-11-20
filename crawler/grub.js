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
  readQuery(); draw(); $('lookup').hidden=false;
  $('lookup').addEventListener('submit',function (event) {
    event.preventDefault(); updateSearch();
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
  $('network').textContent='Public neighborhood index · five original homepages.';
}());
