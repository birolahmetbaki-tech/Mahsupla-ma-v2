/* Uygulama kabuğu: sayfa yönlendirme (#/tesisler, #/veriler) ve yedekleme. */
(function (root) {
  'use strict';
  var App = root.App, S = App.store, UI = App.ui, U = App.util;

  var ROUTES = { tesisler: 'Tesisler', veriler: 'Veriler' };
  var current = null;

  function parseHash() {
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('?');
    var params = {};
    (parts[1] || '').split('&').forEach(function (kv) { if (kv) { var p = kv.split('='); params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); } });
    return { page: ROUTES[parts[0]] ? parts[0] : 'tesisler', params: params };
  }

  function route() {
    var r = parseHash();
    current = r;
    document.querySelectorAll('.nav a').forEach(function (a) { a.classList.toggle('active', a.dataset.page === r.page); });
    App.pages[r.page].render(document.getElementById('main'), r.params);
    document.title = ROUTES[r.page] + ' · Mahsupla';
  }

  S.onChange(function () {
    if (App.quietRender || !current) return;
    App.pages[current.page].render(document.getElementById('main'), {});
  });

  function backup() {
    var d = new Date().toISOString().slice(0, 10);
    U.download('mahsupla-yedek-' + d + '.json', S.exportJSON(), 'application/json');
  }

  function restore() {
    var inp = UI.el('input', { type: 'file', accept: '.json,application/json' });
    inp.onchange = function () {
      var f = inp.files[0];
      if (!f) return;
      f.text().then(function (text) {
        var body = UI.el('div', null, '<p><b>' + U.escapeHtml(f.name) + '</b> yüklenecek.</p><p>Birleştir: mevcut kayıtlar korunur, yedekteki yeni kayıtlar eklenir.<br>Değiştir: mevcut tüm veriler silinip yedekle değiştirilir.</p>');
        UI.openModal('Yedekten yükle', body, [
          { label: 'Vazgeç', onclick: UI.closeModal },
          { label: 'Birleştir', onclick: function () { apply('merge'); } },
          { label: 'Değiştir', class: 'danger', onclick: function () { apply('replace'); } }
        ]);
        function apply(mode) {
          try { S.importJSON(text, mode); UI.closeModal(); UI.toast('Yedek yüklendi.', 'ok'); route(); }
          catch (e) { UI.toast(e.message, 'err'); }
        }
      });
    };
    inp.click();
  }

  document.getElementById('btnBackup').onclick = backup;
  document.getElementById('btnRestore').onclick = restore;
  root.addEventListener('hashchange', route);
  route();
})(this);
