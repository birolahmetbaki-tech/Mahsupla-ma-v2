/* Kalem arayüzü: kalem tablosu (kategori seçimli), Kalem Eşleştirme penceresi ve fatura detay penceresi. */
(function (root) {
  'use strict';
  var App = root.App, U = App.util, S = App.store, UI = App.ui, K = App.kalemler, F = App.fields;

  function katSelect(selected, withTanimsiz) {
    var opts = K.KATEGORILER.map(function (k) {
      return '<option value="' + k.id + '"' + (k.id === selected ? ' selected' : '') + '>' + U.escapeHtml(k.label) + '</option>';
    }).join('');
    if (withTanimsiz) opts = '<option value="tanimsiz"' + (selected === 'tanimsiz' ? ' selected' : '') + '>— Seçin (tanınmadı) —</option>' + opts;
    return '<select class="kat-sel' + (selected === 'tanimsiz' ? ' tanimsiz' : '') + '">' + opts + '</select>';
  }

  function fmt(v, d) { return typeof v === 'number' ? U.formatTRNumber(v, d === undefined ? 2 : d) : ''; }

  /* Faturanın kalem listesini tablo olarak çizer. Kategori değişince sözlüğe kaydedilir ve onChange çağrılır. */
  function kalemTable(rec, onChange) {
    var wrap = UI.el('div', { class: 'table-wrap' });
    var rows = (rec.kalemler || []).map(function (k, i) {
      var res = K.resolve(k.ad, rec.bicim, S.eslestirme());
      return '<tr data-i="' + i + '" class="' + (res.kategori === 'tanimsiz' ? 'tanimsiz' : '') + '">' +
        '<td>' + U.escapeHtml(k.ad) + '</td>' +
        '<td class="num">' + fmt(k.miktar, 3) + (typeof k.miktar === 'number' && k.miktarBirimi ? ' <i class="muted">' + U.escapeHtml(k.miktarBirimi) + '</i>' : '') + '</td>' +
        '<td class="num">' + fmt(k.birim, 6) + '</td>' +
        '<td class="num">' + fmt(k.tutar) + '</td>' +
        '<td>' + katSelect(res.kategori, true) + (res.kaynak === 'kullanici' ? ' <span class="muted" title="Sizin eşleştirmeniz">●</span>' : '') + '</td></tr>';
    }).join('');
    wrap.innerHTML = '<table class="table kalem-table"><thead><tr><th>Kalem (faturadaki adı)</th><th class="num">Miktar</th><th class="num">Birim Fiyat</th><th class="num">Tutar (TL)</th><th>Kategori</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="5" class="muted">Kalem yok.</td></tr>') + '</tbody></table>';
    wrap.addEventListener('change', function (e) {
      var sel = e.target.closest('select.kat-sel');
      if (!sel) return;
      var k = rec.kalemler[+sel.closest('tr').dataset.i];
      S.eslestirmeSet(rec.bicim, k.ad, sel.value === 'tanimsiz' ? null : sel.value);
      UI.toast('"' + k.ad + '" → ' + (K.byId[sel.value] ? K.byId[sel.value].label : 'tanımsız') + ' olarak kaydedildi; tüm faturalarda uygulandı.', 'ok');
      if (onChange) onChange();
    });
    return wrap;
  }

  /* Kayıtlı faturalarda geçen tüm kalem adlarını listeler; kategorileri toplu düzenletir. */
  function openEslestirme(extraKalemler) {
    var list = S.kalemAdlari();
    (extraKalemler || []).forEach(function (x) {
      if (!list.some(function (y) { return K.key(y.bicim, y.ad) === K.key(x.bicim, x.ad); })) list.push({ bicim: x.bicim || 'genel', ad: x.ad, adet: 0, toplam: x.tutar || 0 });
    });
    var body = UI.el('div', { class: 'eslestirme' });
    body.appendChild(UI.el('p', { class: 'muted' },
      'Faturalardaki her kalem bir kategoriye bağlanır; Veriler tablosundaki Enerji / Dağıtım / Diğer / Mahsup / BTV / KDV sütunları bu kategorilerin toplamıdır. ' +
      'Aynı ad farklı tedarikçilerde farklı anlama gelebileceği için eşleştirme fatura biçimi bazındadır. ● işaretli satırlar sizin seçiminizdir.'));
    var tbl = UI.el('div', { class: 'table-wrap' });
    tbl.innerHTML = '<table class="table kalem-table"><thead><tr><th>Biçim</th><th>Kalem</th><th class="num">Fatura</th><th class="num">Toplam Tutar</th><th>Kategori</th><th></th></tr></thead><tbody>' +
      list.map(function (x, i) {
        var res = K.resolve(x.ad, x.bicim, S.eslestirme());
        return '<tr data-i="' + i + '" class="' + (res.kategori === 'tanimsiz' ? 'tanimsiz' : '') + '"><td>' + U.escapeHtml(x.bicim) + '</td><td>' + U.escapeHtml(x.ad) + '</td>' +
          '<td class="num">' + x.adet + '</td><td class="num">' + fmt(x.toplam) + '</td><td>' + katSelect(res.kategori, true) + '</td>' +
          '<td>' + (res.kaynak === 'kullanici' ? '<span title="Sizin eşleştirmeniz">●</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table>';
    body.appendChild(tbl);
    UI.openModal('Kalem Eşleştirme', body, [
      { label: 'Vazgeç', onclick: UI.closeModal },
      { label: 'Kaydet ve uygula', class: 'primary', onclick: function () {
        var n = 0;
        tbl.querySelectorAll('tbody tr').forEach(function (tr) {
          var x = list[+tr.dataset.i], v = tr.querySelector('select').value;
          var cur = K.resolve(x.ad, x.bicim, S.eslestirme()).kategori;
          if (v !== cur) { S.eslestirmeSet(x.bicim, x.ad, v === 'tanimsiz' ? null : v, true); n++; }
        });
        S.recomputeAll();
        UI.closeModal();
        UI.toast(n ? n + ' eşleştirme güncellendi; tüm faturalar yeniden hesaplandı.' : 'Değişiklik yok.', 'ok');
      } }
    ]);
    var box = document.querySelector('.modal-box');
    if (box) box.classList.add('wide');
  }

  /* Bir faturanın kalemlerini, detay bilgilerini ve bilgilendirme notunu gösterir. */
  function openFaturaDetay(rec) {
    var body = UI.el('div', { class: 'fatura-detay' });
    var ab = rec.abonelikId ? S.abonelikGet(rec.abonelikId) : null;
    body.appendChild(UI.el('p', null, '<b>' + U.escapeHtml(U.donemLabel(rec.donem)) + '</b> · ' + U.escapeHtml(rec.faturaNo || '') + ' · ' +
      U.escapeHtml(rec.tedarikci || '') + (ab ? ' · ' + U.escapeHtml(ab.ad) : '') +
      (rec.ilkOkuma ? ' · okuma ' + U.formatTRDate(rec.ilkOkuma) + ' – ' + U.formatTRDate(rec.sonOkuma) : '')));
    body.appendChild(UI.el('h4', null, 'Kalemler'));
    body.appendChild(kalemTable(rec, function () {
      UI.closeModal();
      openFaturaDetay(S.faturaGet(rec.id) || rec);
    }));
    var d = rec.detay || {};
    var keys = Object.keys(d);
    if (keys.length) {
      body.appendChild(UI.el('h4', null, 'Faturadaki diğer bilgiler'));
      body.appendChild(UI.el('div', { class: 'detay-grid' }, keys.map(function (k) {
        var v = d[k];
        var ondalik = typeof v === 'number' ? Math.min(3, (String(v).split('.')[1] || '').length) : 0;
        var txt = typeof v === 'number' ? U.formatTRNumber(v, ondalik) : /^\d{4}-\d{2}-\d{2}$/.test(v) ? U.formatTRDate(v) : typeof v === 'object' ? JSON.stringify(v) : String(v);
        return '<div class="kv"><span>' + U.escapeHtml(F.DETAY_ADLARI[k] || k) + '</span><b>' + U.escapeHtml(txt) + '</b></div>';
      }).join('')));
    }
    if (rec.bilgilendirme) {
      body.appendChild(UI.el('h4', null, 'Bilgilendirme notu'));
      body.appendChild(UI.el('p', { class: 'note' }, U.escapeHtml(rec.bilgilendirme)));
    }
    UI.openModal('Fatura Detayı', body, [{ label: 'Kapat', onclick: UI.closeModal }]);
    var box = document.querySelector('.modal-box');
    if (box) box.classList.add('wide');
  }

  App.kalemUI = { kalemTable: kalemTable, openEslestirme: openEslestirme, openFaturaDetay: openFaturaDetay };
})(this);
