(function () {
  var route = location.pathname;
  if (/^\/members\/[a-z0-9-]{1,40}(?:\/(?:index\.html|text\.html|images\/\d{1,2})?)?$/.test(route) ||
      /^\/creators\/[0-9a-f]{32}\/?$/.test(route)) {
    location.replace("https://yestersites-webring.jamesmweeksjr.chatgpt.site" + route + location.search + location.hash);
  }
}());
