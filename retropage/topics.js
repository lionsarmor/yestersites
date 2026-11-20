/* Grub and Retro Page share the same public subjects. */
const RetroTopics=(()=>{
  const labels={anime:'Anime & manga',games:'Games & arcades',radio:'Radio & audio',bbs:'BBS & dial-up',pets:'Virtual pets',flash:'Flash & animation',art:'Art & design',music:'Music',tech:'Computers & technology',zines:'Personal pages & zines',science:'Science & space',clubs:'Clubs & fandom'};
  function read(categories,tags,required=false){
    if(!Array.isArray(categories)||categories.length>3||categories.some(key=>!Object.hasOwn(labels,key)))throw Error('Choose up to three Grub categories.');
    categories=[...new Set(categories)];
    if(required&&!categories.length)throw Error('Choose at least one Grub category before publishing.');
    if(!Array.isArray(tags)||tags.length>8||tags.some(t=>typeof t!=='string'||!t.trim()||t.trim().length>32||/[\x00-\x1f,]/.test(t)))throw Error('Add up to eight topic tags, each 1–32 characters.');
    return {categories,tags:[...new Set(tags.map(t=>t.trim().toLowerCase()))]};
  }
  function unpack(words){return {categories:words.filter(s=>s.startsWith('category:')).map(s=>s.slice(9)).filter(k=>Object.hasOwn(labels,k)),tags:words.filter(s=>s.startsWith('tag:')).map(s=>s.slice(4))};}
  return {labels,read,unpack};
})();
