(function () {
  var storageKey = 'yestersites.pixelattic.guestbook.1';
  var book = document.getElementById('localbook');
  var list = document.getElementById('entries');
  var form = document.getElementById('sign');
  var status = document.getElementById('status');
  var handle = document.getElementById('handle');
  var note = document.getElementById('note');
  function loadEntries() {
    var saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(saved) ? saved.filter(function (entry) {
      return entry && typeof entry.handle === 'string' && typeof entry.note === 'string';
    }) : [];
  }
  function display(entries) {
    list.textContent = '';
    entries.forEach(function (entry) {
      var message = document.createElement('article');
      var name = document.createElement('h3');
      var text = document.createElement('p');
      message.className = 'letter';
      name.textContent = entry.handle;
      text.textContent = entry.note;
      message.appendChild(name);
      message.appendChild(text);
      list.appendChild(message);
    });
  }
  try { display(loadEntries()); } catch (error) { return; }
  book.hidden = false;
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var entry = { handle: handle.value.trim(), note: note.value.trim() };
    if (!entry.handle || !entry.note) { status.textContent = 'Please enter a handle and a note.'; return; }
    try {
      var entries = loadEntries();
      entries.push(entry);
      localStorage.setItem(storageKey, JSON.stringify(entries));
      display(entries);
      form.reset();
      status.textContent = 'Saved to your visitor book.';
    } catch (error) { status.textContent = 'Your browser could not save this note.'; }
  });
}());
