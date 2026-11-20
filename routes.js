(function () {
  var route = location.pathname;
  if (/^\/members\/[a-z0-9-]{1,40}(?:\/(?:(?:index|modern|phone|classic|text)\.html|page-[0-9a-f]{32}(?:-(?:modern|phone|classic|text))?\.html|(?:page-[0-9a-f]{32}-)?terminal\.txt|guestbook\/|media\/[0-9a-f-]{36}\/\d+|images\/\d{1,2})?)?$/.test(route) ||
      /^\/creators\/(?:roddy|[0-9a-f]{32})\/?$/.test(route)) {
    location.replace("https://yestersites-webring.jamesmweeksjr.chatgpt.site" + route + location.search + location.hash);
  }
}());
