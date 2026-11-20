(function () {
  var destinations = {b:'messages.html', f:'files.html', d:'door.html', c:'art/exchange.gif', x:'../index.html'};
  document.addEventListener('keydown', function (event) {
    if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    var target = event.target;
    if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)) return;
    var file = destinations[(event.key || '').toLowerCase()];
    if (!file) return;
    event.preventDefault();
    window.location.assign(file);
  });
}());
