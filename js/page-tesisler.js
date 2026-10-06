/* Tesisler modülü: tüketim tesisleri ve bunlara bağlı üretim tesisleri. */
(function (root) {
  'use strict';
  var App = root.App, U = App.util, S = App.store, UI = App.ui;

  var ABONE_GRUPLARI = ['Sanayi', 'Ticarethane', 'Mesken', 'Tarımsal Sulama', 'Aydınlatma', 'Diğer'];

  var TUKETIM_FORM = [
    { type: 'section', label: 'Kimlik' },
    { key: 'ad', label: 'Tesis Adı', required: true, help: 'Programda görünecek kısa ad (ör. "Esenyurt Fabrika").' },
    { key: 'unvan', label: 'Abone Unvanı' },
    { key: 'vkn', label: 'TCKN / VKN' },
    { key: 'vergiDairesi', label: 'Vergi Dairesi' },
    { key: 'adres', label: 'Adres', type: 'textarea', full: true },
    { type: 'section', label: 'Abonelik' },
    { key: 'aboneGrubu', label: 'Abone Grubu', type: 'select', options: ABONE_GRUPLARI, required: true,
      help: 'Mesken: aylık mahsuplaşma. Diğer gruplar: 1 Mayıs 2026’dan itibaren saatlik mahsuplaşma.' },
    { key: 'gerilim', label: 'Gerilim Seviyesi', type: 'select', options: ['AG', 'OG', 'YG'] },
    { key: 'tarifeTerim', label: 'Tarife', type: 'select', options: ['Tek Terimli', 'Çift Terimli'] },
    { key: 'tarifeZaman', label: 'Zaman Dilimi', type: 'select', options: ['Tek Zamanlı', 'Üç Zamanlı'] },
    { key: 'serbestTuketici', label: 'Serbest Tüketici (İkili Anlaşma)', type: 'select', options: ['Evet', 'Hayır'] },
    { key: 'tedarikci', label: 'Tedarikçi' },
    { key: 'dagitimSirketi', label: 'Dağıtım Şirketi' },
    { key: 'tuketiciGrubuFatura', label: 'Faturadaki Tüketici Grubu', help: 'Ör. "DSK Sanayi TT OG"' },
    { type: 'section', label: 'Sayaç / Bağlantı' },
    { key: 'eic', label: 'EIC Kodu', help: 'Fatura yüklenirken tesis eşleştirmesi bu kodla yapılır.' },
    { key: 'sozlesmeNo', label: 'Sözleşme / Hesap No' },
    { key: 'tesisatNo', label: 'Tekil Kod / Tesisat No' },
    { key: 'sozlesmeGucu', label: 'Sözleşme Gücü', type: 'number', unit: 'kW', dec: 3 },
    { key: 'carpan', label: 'Sayaç Çarpanı', type: 'number', dec: 0 },
    { key: 'oncekiYilTuketim', label: 'Önceki Yıl Tüketimi', type: 'number', unit: 'kWh', dec: 3,
      help: '2× bedelli üretim limitinin referansı.' },
    { key: 'notlar', label: 'Notlar', type: 'textarea', full: true }
  ];

  var URETIM_FORM = [
    { type: 'section', label: 'Kimlik' },
    { key: 'ad', label: 'Üretim Tesisi Adı', required: true },
    { key: 'kaynak', label: 'Kaynak', type: 'select', options: ['GES', 'RES', 'HES', 'Biyokütle', 'JES', 'Kojenerasyon', 'Diğer'], required: true },
    { key: 'olcumNoktasi', label: 'Ölçüm Noktası', type: 'select', options: ['Aynı ölçüm noktası', 'Farklı ölçüm noktası'], required: true,
      help: 'Aynı: çatı vb. tüketimle aynı sayaç. Farklı: arazi tesisi, sanal mahsuplaşma.' },
    { key: 'konum', label: 'Konum / Adres', type: 'textarea', full: true },
    { type: 'section', label: 'Teknik' },
    { key: 'kuruluGucDC', label: 'Kurulu Güç (DC)', type: 'number', unit: 'kWp', dec: 3 },
    { key: 'kuruluGucAC', label: 'Kurulu Güç (AC)', type: 'number', unit: 'kWe', dec: 3 },
    { key: 'depolama', label: 'Depolama', type: 'select', options: ['Yok', 'Var'] },
    { key: 'depolamaGuc', label: 'Depolama Gücü', type: 'number', unit: 'kW', dec: 3 },
    { key: 'depolamaKapasite', label: 'Depolama Kapasitesi', type: 'number', unit: 'kWh', dec: 3 },
    { type: 'section', label: 'Sayaç / Mevzuat' },
    { key: 'eic', label: 'EIC Kodu' },
    { key: 'tesisatNo', label: 'Tesisat No' },
    { key: 'dagitimSirketi', label: 'Dağıtım Şirketi' },
    { key: 'cagriMektubuTarihi', label: 'Çağrı Mektubu Tarihi', type: 'date',
      help: '12.05.2019 öncesi/sonrası rejim ayrımı için.' },
    { key: 'isletmeTarihi', label: 'İşletmeye Giriş (Kabul) Tarihi', type: 'date',
      help: '10 yıllık YEKDEM süresi bu tarihten başlar.' },
    { key: 'notlar', label: 'Notlar', type: 'textarea', full: true }
  ];

  var selectedId = null;

  function mahsupPeriyodu(t) {
    if (!t.aboneGrubu) return '—';
    return t.aboneGrubu === 'Mesken' ? 'Aylık' : 'Saatlik';
  }

  function onYilBitis(u) {
    if (!u.isletmeTarihi) return null;
    var d = new Date(u.isletmeTarihi + 'T00:00:00Z');
    d.setUTCFullYear(d.getUTCFullYear() + 10);
    return d.toISOString().slice(0, 10);
  }

  function satisRejimi(u) {
    var bitis = onYilBitis(u);
    var bugun = new Date().toISOString().slice(0, 10);
    if (u.cagriMektubuTarihi && u.cagriMektubuTarihi < '2019-05-12') {
      return bitis && bitis <= bugun ? '10 yıl doldu: min(YEKDEM×%90, PTF)' : '2019 öncesi: YEKDEM sabit fiyat';
    }
    if (bitis && bitis <= bugun) return '10 yıl doldu: min(YEKDEM×%90, PTF)';
    return 'İlk 10 yıl: abone grubu aktif enerji bedeli';
  }

  function render(container, params) {
    if (params && params.tt) selectedId = params.tt;
    var list = S.tuketimList();
    if (!selectedId || !S.tuketimGet(selectedId)) selectedId = list.length ? list[0].id : null;

    container.innerHTML = '';
    var page = UI.el('div', { class: 'tesis-page' });

    // Sol: tüketim tesisleri listesi
    var side = UI.el('aside', { class: 'tesis-list' });
    var head = UI.el('div', { class: 'panel-head' }, '<h2>Tüketim Tesisleri</h2>');
    head.appendChild(UI.el('button', { class: 'btn primary sm', onclick: function () { editTuketim(null); } }, '+ Yeni'));
    side.appendChild(head);
    if (!list.length) {
      side.appendChild(UI.el('p', { class: 'muted pad' }, 'Henüz tesis yok. "+ Yeni" ile ekleyin ya da Fatura Yükle sayfasından faturayla otomatik oluşturun.'));
    }
    list.forEach(function (t) {
      var uretimler = S.uretimList(t.id);
      var guc = uretimler.reduce(function (a, u) { return a + (u.kuruluGucAC || 0); }, 0);
      var item = UI.el('button', { class: 'tesis-item' + (t.id === selectedId ? ' active' : ''), onclick: function () { selectedId = t.id; render(container); } },
        '<strong>' + U.escapeHtml(t.ad) + '</strong>' +
        '<span>' + U.escapeHtml(t.aboneGrubu || '—') + (t.gerilim ? ' · ' + t.gerilim : '') + '</span>' +
        '<span class="muted">' + uretimler.length + ' üretim tesisi' + (guc ? ' · ' + U.formatTRNumber(guc, 0) + ' kWe' : '') +
        ' · ' + S.faturaList(t.id).length + ' fatura</span>');
      side.appendChild(item);
    });
    page.appendChild(side);

    // Sağ: detay
    var main = UI.el('section', { class: 'tesis-detail' });
    var t = selectedId ? S.tuketimGet(selectedId) : null;
    if (t) main.appendChild(detail(t, container));
    else main.appendChild(UI.el('div', { class: 'empty' }, '<p>Soldan bir tüketim tesisi seçin veya yeni ekleyin.</p>'));
    page.appendChild(main);
    container.appendChild(page);
  }

  function kv(label, value) {
    return '<div class="kv"><span>' + U.escapeHtml(label) + '</span><b>' + (value === undefined || value === null || value === '' ? '<i class="muted">—</i>' : U.escapeHtml(value)) + '</b></div>';
  }

  function detail(t, container) {
    var wrap = UI.el('div');
    var faturalar = S.faturaList(t.id);
    var son = faturalar[faturalar.length - 1];

    var head = UI.el('div', { class: 'panel-head' }, '<div><h2>' + U.escapeHtml(t.ad) + '</h2><span class="muted">' + U.escapeHtml(t.unvan || '') + '</span></div>');
    var actions = UI.el('div', { class: 'actions' });
    actions.appendChild(UI.el('button', { class: 'btn sm', onclick: function () { location.hash = '#/yukle?tt=' + t.id; } }, 'Fatura Yükle'));
    actions.appendChild(UI.el('button', { class: 'btn sm', onclick: function () { location.hash = '#/veriler?tt=' + t.id; } }, 'Veriler'));
    actions.appendChild(UI.el('button', { class: 'btn sm', onclick: function () { editTuketim(t); } }, 'Düzenle'));
    actions.appendChild(UI.el('button', { class: 'btn sm danger', onclick: function () {
      UI.confirmModal('Tesisi sil', '"' + t.ad + '" ile birlikte bağlı ' + S.uretimList(t.id).length + ' üretim tesisi ve ' + faturalar.length + ' fatura kaydı silinecek. Emin misiniz?', 'Sil', function () {
        S.tuketimDelete(t.id); selectedId = null; render(container); UI.toast('Tesis silindi.');
      });
    } }, 'Sil'));
    head.appendChild(actions);
    wrap.appendChild(head);

    var limitRef = t.oncekiYilTuketim;
    var cards = UI.el('div', { class: 'cards' },
      '<div class="card"><h4>Abonelik</h4>' +
        kv('Abone Grubu', t.aboneGrubu) + kv('Gerilim', t.gerilim) + kv('Tarife', [t.tarifeTerim, t.tarifeZaman].filter(Boolean).join(' / ')) +
        kv('Serbest Tüketici', t.serbestTuketici) + kv('Tedarikçi', t.tedarikci) + kv('Dağıtım Şirketi', t.dagitimSirketi) + '</div>' +
      '<div class="card"><h4>Sayaç</h4>' +
        kv('EIC', t.eic) + kv('Sözleşme / Hesap No', t.sozlesmeNo) + kv('Tesisat No', t.tesisatNo) +
        kv('Sözleşme Gücü', t.sozlesmeGucu ? U.formatTRNumber(t.sozlesmeGucu, 0) + ' kW' : '') +
        kv('Çarpan', t.carpan ? U.formatTRNumber(t.carpan, 0) : '') + '</div>' +
      '<div class="card"><h4>Mahsuplaşma</h4>' +
        kv('Periyot', mahsupPeriyodu(t)) +
        kv('Önceki Yıl Tüketimi', limitRef ? U.formatTRNumber(limitRef, 0) + ' kWh' : '') +
        kv('Bedelli Üretim Limiti (2×)', t.aboneGrubu === 'Mesken' ? 'Limit yok (mesken)' : (limitRef ? U.formatTRNumber(limitRef * 2, 0) + ' kWh' : '')) +
        kv('Kayıtlı Fatura', faturalar.length + (son ? ' (son: ' + U.donemLabel(son.donem) + ')' : '')) + '</div>');
    wrap.appendChild(cards);

    // Üretim tesisleri
    var uretimler = S.uretimList(t.id);
    var uh = UI.el('div', { class: 'panel-head sub' }, '<h3>Bağlı Üretim Tesisleri</h3>');
    uh.appendChild(UI.el('button', { class: 'btn primary sm', onclick: function () { editUretim(null, t.id); } }, '+ Üretim Tesisi Ekle'));
    wrap.appendChild(uh);

    if (!uretimler.length) {
      wrap.appendChild(UI.el('p', { class: 'muted' }, 'Bu tüketim tesisine bağlı üretim tesisi yok.'));
    } else {
      var rows = uretimler.map(function (u) {
        var bitis = onYilBitis(u);
        return '<tr data-id="' + u.id + '">' +
          '<td><strong>' + U.escapeHtml(u.ad) + '</strong></td>' +
          '<td>' + U.escapeHtml(u.kaynak || '') + '</td>' +
          '<td>' + U.escapeHtml(u.olcumNoktasi || '') + '</td>' +
          '<td class="num">' + U.formatTRNumber(u.kuruluGucDC, 2) + '</td>' +
          '<td class="num">' + U.formatTRNumber(u.kuruluGucAC, 2) + '</td>' +
          '<td>' + (u.depolama === 'Var' ? 'Var' + (u.depolamaKapasite ? ' (' + U.formatTRNumber(u.depolamaKapasite, 0) + ' kWh)' : '') : 'Yok') + '</td>' +
          '<td>' + U.formatTRDate(u.isletmeTarihi) + '</td>' +
          '<td>' + U.formatTRDate(bitis) + '</td>' +
          '<td>' + U.escapeHtml(satisRejimi(u)) + '</td>' +
          '<td class="row-actions"><button class="btn xs" data-act="edit">Düzenle</button><button class="btn xs danger" data-act="del">Sil</button></td></tr>';
      }).join('');
      var totDC = uretimler.reduce(function (a, u) { return a + (u.kuruluGucDC || 0); }, 0);
      var totAC = uretimler.reduce(function (a, u) { return a + (u.kuruluGucAC || 0); }, 0);
      var table = UI.el('div', { class: 'table-wrap' },
        '<table class="table"><thead><tr><th>Ad</th><th>Kaynak</th><th>Ölçüm Noktası</th><th class="num">DC (kWp)</th><th class="num">AC (kWe)</th>' +
        '<th>Depolama</th><th>İşletme</th><th>10 Yıl Bitiş</th><th>Satış Rejimi</th><th></th></tr></thead><tbody>' + rows +
        '</tbody><tfoot><tr><td colspan="3">Toplam</td><td class="num">' + U.formatTRNumber(totDC, 2) + '</td><td class="num">' + U.formatTRNumber(totAC, 2) + '</td><td colspan="5"></td></tr></tfoot></table>');
      table.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-act]');
        if (!btn) return;
        var u = S.uretimGet(btn.closest('tr').dataset.id);
        if (btn.dataset.act === 'edit') editUretim(u, t.id);
        else UI.confirmModal('Üretim tesisini sil', '"' + u.ad + '" silinsin mi?', 'Sil', function () { S.uretimDelete(u.id); UI.toast('Üretim tesisi silindi.'); });
      });
      wrap.appendChild(table);
    }
    if (t.notlar) wrap.appendChild(UI.el('p', { class: 'note' }, '<b>Not:</b> ' + U.escapeHtml(t.notlar)));
    return wrap;
  }

  function editTuketim(t, prefill) {
    UI.formModal(t ? 'Tüketim Tesisini Düzenle' : 'Yeni Tüketim Tesisi', TUKETIM_FORM, t || prefill || { serbestTuketici: 'Hayır' }, function (v) {
      var saved = S.tuketimSave(v);
      selectedId = saved.id;
      UI.toast('Tüketim tesisi kaydedildi.', 'ok');
      if (App.onTuketimSaved) App.onTuketimSaved(saved);
    });
  }

  function editUretim(u, tuketimTesisId) {
    UI.formModal(u ? 'Üretim Tesisini Düzenle' : 'Yeni Üretim Tesisi', URETIM_FORM, u || { tuketimTesisId: tuketimTesisId, kaynak: 'GES', depolama: 'Yok' }, function (v) {
      v.tuketimTesisId = tuketimTesisId;
      S.uretimSave(v);
      UI.toast('Üretim tesisi kaydedildi.', 'ok');
    });
  }

  App.pages = App.pages || {};
  App.pages.tesisler = { render: render, editTuketim: editTuketim, ABONE_GRUPLARI: ABONE_GRUPLARI };
})(this);
