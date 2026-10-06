/* Fatura Yükle: PDF faturaları okur, kayıtlı şablonla tanır ve yalnız şablonda tanımlı değerleri içeri aktarır.
   Şablonu olmayan veya tanımlanmamış satırı bulunan faturalar fatura penceresinde açılıp tanımlanır (bkz. fatura-pencere.js).
   Abonelik eşleştirmesi faturadaki EIC / sözleşme no / tesisat no ile yapılır. */
(function (root) {
  'use strict';
  var App = root.App, U = App.util, S = App.store, UI = App.ui, F = App.fields, P = App.faturaParser, SB = App.sablon;

  // Kuyruk öğesi: { id, file, name, pdf, inv, parsed, sablon, sonuc, record, abId, status }
  // status: okunuyor | hazir | sablonsuz | kaydedildi | atlandi | hata
  var queue = [];
  var hedef = 'auto';
  var containerRef = null;
  var ZORUNLU = ['donem', 'faturaNo', 'aktifKwh', 'faturaTutari'];

  function render(container, params) {
    containerRef = container;
    if (params && params.ab) hedef = params.ab;
    container.innerHTML = '';
    var page = UI.el('div', { class: 'yukle-page' });
    page.appendChild(UI.el('div', { class: 'panel-head' }, '<div><h2>Fatura Yükle</h2><span class="muted">Faturalar kayıtlı şablonla okunur; yalnız tanımlı değerler içeri aktarılır. ' +
      'Şablonu olmayan faturayı açıp “Otomatik tanımla” ile tanımlayın, gerekirse değerlere tıklayarak düzeltin.</span></div>'));

    var bar = UI.el('div', { class: 'toolbar' });
    var sel = abonelikSelect(hedef, 'Otomatik eşleştir (EIC / Sözleşme No)', 'auto');
    sel.onchange = function () {
      hedef = sel.value;
      queue.forEach(function (q) { if (q.status === 'hazir' || q.status === 'sablonsuz') q.abId = resolveAbonelik(q); });
      renderQueue();
    };
    bar.appendChild(UI.el('label', { class: 'inline' }, 'Hedef abonelik:'));
    bar.appendChild(sel);
    if (queue.length) {
      bar.appendChild(UI.el('button', { class: 'btn primary sm', onclick: saveAll, title: 'Şablonu olan, zorunlu bilgileri tam ve kontrolleri tutan faturaları kaydeder' }, 'Sorunsuz olanların tümünü kaydet'));
      bar.appendChild(UI.el('button', { class: 'btn sm', onclick: function () { queue = []; render(container); } }, 'Listeyi temizle'));
    }
    bar.appendChild(UI.el('button', { class: 'btn sm', onclick: sablonlarPenceresi }, 'Şablonlar (' + S.sablonList().length + ')'));
    bar.appendChild(UI.el('button', { class: 'btn sm', onclick: function () { App.kalemUI.openEslestirme(); } }, 'Kalem Eşleştirme'));
    page.appendChild(bar);

    var drop = UI.el('label', { class: 'dropzone' },
      '<input type="file" accept="application/pdf,.pdf" multiple hidden>' +
      '<div class="dz-icon">⬆</div><div><strong>PDF faturaları buraya bırakın</strong> veya tıklayıp seçin</div>' +
      '<div class="muted">Birden fazla dosya ve çok faturalı PDF olabilir. Dosyalar bilgisayarınızdan dışarı gönderilmez.</div>');
    var input = drop.querySelector('input');
    input.onchange = function () { addFiles(input.files); input.value = ''; };
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files); });
    page.appendChild(drop);

    page.appendChild(UI.el('div', { id: 'queue' }));
    container.appendChild(page);
    renderQueue();
  }

  function resolveAbonelik(q) {
    if (hedef !== 'auto' && S.abonelikGet(hedef)) return hedef;
    var r = q.record || (q.parsed && q.parsed.record) || {};
    var m = S.abonelikMatch(r) || (q.parsed ? S.abonelikMatch(q.parsed.record) : null);
    return m ? m.id : null;
  }

  // Tüketim tesislerine göre gruplanmış abonelik seçimi
  function abonelikSelect(selected, emptyLabel, emptyValue) {
    var sel = UI.el('select');
    sel.appendChild(UI.el('option', { value: emptyValue }, U.escapeHtml(emptyLabel)));
    S.tuketimList().forEach(function (t) {
      var abs = S.abonelikList(t.id);
      if (!abs.length) return;
      var og = UI.el('optgroup', { label: t.ad });
      abs.forEach(function (a) {
        var o = UI.el('option', { value: a.id }, U.escapeHtml(a.ad + (a.eic ? ' · ' + a.eic : '')));
        if (a.id === selected) o.selected = true;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    return sel;
  }
  function abonelikAdi(abId) {
    var a = S.abonelikGet(abId);
    if (!a) return '';
    var t = S.tuketimGet(a.tuketimTesisId);
    return (t ? t.ad + ' › ' : '') + a.ad;
  }

  // Kayıtlı şablonu bulup uygular
  function sablonUygula(q) {
    q.sablon = SB.bul(q.inv.items, S.sablonList());
    if (!q.sablon) { q.status = 'sablonsuz'; q.sonuc = null; q.record = null; }
    else {
      q.sonuc = SB.uygula(q.inv.items, q.inv.width, q.sablon, S.eslestirme());
      q.record = q.sonuc.record;
      q.status = 'hazir';
    }
    if (!q.abId) q.abId = resolveAbonelik(q);
  }

  function addFiles(files) {
    Array.prototype.forEach.call(files, function (file) {
      if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { UI.toast(file.name + ': PDF değil, atlandı.', 'err'); return; }
      var q = { id: U.uid('q'), file: file, name: file.name, status: 'okunuyor' };
      queue.push(q);
      readPdf(file).then(function (res) {
        // Bir PDF birden çok fatura içerebilir: her fatura için ayrı kart
        var items = res.invoices.map(function (inv) {
          var x = { id: U.uid('q'), file: file, pdf: res.pdf, inv: inv, parsed: inv.parsed,
            name: file.name + (res.invoices.length > 1 ? ' · s.' + inv.pageFrom + (inv.pageTo > inv.pageFrom ? '–' + inv.pageTo : '') : '') };
          sablonUygula(x);
          return x;
        });
        queue.splice.apply(queue, [queue.indexOf(q), 1].concat(items));
        if (res.invoices.length > 1) UI.toast(file.name + ': ' + res.invoices.length + ' fatura bulundu.', 'ok');
      }).catch(function (err) {
        console.error(err);
        q.status = 'hata';
        q.error = err.message || String(err);
      }).then(function () { if (containerRef) render(containerRef); });
    });
    render(containerRef);
  }

  function readPdf(file) {
    if (!root.pdfjsLib) return Promise.reject(new Error('PDF okuyucu (pdf.js) yüklenemedi.'));
    var pdf;
    return file.arrayBuffer().then(function (buf) {
      return root.pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    }).then(function (doc) { pdf = doc; return P.extractItems(doc); }).then(function (pages) {
      if (!pages.length || !pages.some(function (p) { return p.items.length; })) throw new Error('PDF içinde metin bulunamadı (taranmış görüntü olabilir).');
      var invoices = P.splitInvoices(pages).map(function (inv) {
        // Yerleşik okuyucu yalnız "Otomatik tanımla" önerisi için kullanılır
        try { inv.parsed = P.parse(inv.items, inv.width); } catch (e) { inv.parsed = null; }
        return inv;
      });
      return { pdf: pdf, invoices: invoices };
    });
  }

  function sorunlar(q) {
    var out = [];
    if (!q.record) return out;
    var eksik = ZORUNLU.filter(function (k) { var v = q.record[k]; return v === undefined || v === null || v === ''; });
    if (eksik.length) out.push({ tur: 'err', metin: 'Eksik: ' + eksik.map(function (k) { return F.byKey[k].label; }).join(', ') });
    if (q.sonuc && q.sonuc.tanimsiz.length) out.push({ tur: 'warn', metin: q.sonuc.tanimsiz.length + ' tanımlanmamış satır: ' + q.sonuc.tanimsiz.map(function (l) { return l.etiket || l.degerMetni; }).join(', ') });
    var calc = F.compute(q.record);
    var hata = F.FIELDS.filter(function (f) { return f.check && F.checkStatus(f, calc[f.key], q.record) === 'err'; });
    if (hata.length) out.push({ tur: 'err', metin: 'Kontrol tutmuyor: ' + hata.map(function (f) { return f.label.replace('Kontrol: ', ''); }).join(', ') });
    return out;
  }

  function renderQueue() {
    var box = document.getElementById('queue');
    if (!box) return;
    box.innerHTML = '';
    queue.forEach(function (q) { box.appendChild(card(q)); });
  }

  function card(q) {
    var c = UI.el('div', { class: 'fcard ' + q.status });
    var title = '<strong>' + U.escapeHtml(q.name) + '</strong>';
    if (q.status === 'okunuyor') { c.innerHTML = '<div class="fcard-head">' + title + '<span class="badge">Okunuyor…</span></div>'; return c; }
    if (q.status === 'hata') { c.innerHTML = '<div class="fcard-head">' + title + '<span class="badge err">Hata</span></div><p class="err-text">' + U.escapeHtml(q.error) + '</p>'; return c; }
    if (q.status === 'kaydedildi') {
      var ab = S.abonelikGet(q.abId) || {};
      c.innerHTML = '<div class="fcard-head">' + title + '<span class="badge ok">Kaydedildi</span></div><p>' +
        U.escapeHtml(abonelikAdi(q.abId)) + ' · ' + U.donemLabel(q.record.donem) +
        ' · <a href="#/veriler?tt=' + ab.tuketimTesisId + '&ab=' + q.abId + '&sayfa=faturalar">Veriler sayfasında aç →</a></p>';
      return c;
    }
    if (q.status === 'atlandi') { c.innerHTML = '<div class="fcard-head">' + title + '<span class="badge">Atlandı</span></div>'; return c; }

    var r = q.record;
    var head = UI.el('div', { class: 'fcard-head' }, title +
      (q.sablon ? '<span class="badge">Şablon: ' + U.escapeHtml(q.sablon.ad) + '</span>' : '<span class="badge warn">Şablon yok</span>') +
      (r ? '<span class="badge">' + U.escapeHtml(U.donemLabel(r.donem)) + '</span><span class="muted">' + U.escapeHtml(r.faturaNo || '') + '</span>' : ''));
    c.appendChild(head);

    if (!r) {
      c.appendChild(UI.el('p', { class: 'muted' }, 'Bu fatura biçimi için kayıtlı şablon yok. Faturayı açıp “Otomatik tanımla” ile tanımlayın; kaydettiğiniz şablon aynı biçimdeki diğer faturalara da uygulanır.'));
    } else {
      c.appendChild(UI.el('div', { class: 'fcard-ozet' },
        [['Çekilen', r.aktifKwh, 'kWh', 0], ['Enerji', r.enerjiBedeli, 'TL'], ['Dağıtım', r.dagitimBedeli, 'TL'], ['GES mahsubu', r.mahsupTL, 'TL'], ['Fatura tutarı', r.faturaTutari, 'TL']]
          .map(function (x) { return '<span><i>' + x[0] + '</i> ' + (typeof x[1] === 'number' ? U.formatTRNumber(x[1], x[3] === undefined ? 2 : x[3]) + ' ' + x[2] : '—') + '</span>'; }).join('')));
      var sr = sorunlar(q);
      c.appendChild(UI.el('ul', { class: 'notes' }, sr.length ? sr.map(function (s) { return '<li class="' + s.tur + '">' + U.escapeHtml(s.metin) + '</li>'; }).join('') : '<li class="ok">✓ Zorunlu bilgiler tam, kontroller tutuyor.</li>'));
    }

    var match = UI.el('div', { class: 'match' });
    var sel = abonelikSelect(q.abId, '— Abonelik seçin —', '');
    sel.onchange = function () { q.abId = sel.value || null; renderQueue(); };
    match.appendChild(UI.el('span', null, 'Abonelik:'));
    match.appendChild(sel);
    match.appendChild(UI.el('button', { class: 'btn sm', onclick: function () { createAbonelikFrom(q); } }, 'Faturadan yeni abonelik oluştur'));
    c.appendChild(match);

    var dup = q.abId && r ? S.faturaFindDuplicate(q.abId, r) : null;
    if (dup) c.appendChild(UI.el('p', { class: 'warn-text' }, 'Bu abonelikte aynı fatura zaten kayıtlı; kaydederseniz güncellenir.'));

    var foot = UI.el('div', { class: 'fcard-foot' });
    foot.appendChild(UI.el('button', { class: 'btn sm', onclick: function () { q.status = 'atlandi'; renderQueue(); } }, 'Atla'));
    foot.appendChild(UI.el('button', { class: 'btn sm' + (r ? '' : ' primary'), onclick: function () { pencereAc(q); } }, r ? 'Faturayı aç / tanımları düzenle' : 'Faturayı aç ve tanımla'));
    var kaydet = UI.el('button', { class: 'btn primary sm', onclick: function () {
      var sr = sorunlar(q);
      if (sr.some(function (s) { return s.tur === 'err'; }) || (q.sonuc && q.sonuc.tanimsiz.length)) { pencereAc(q); return; }
      saveOne(q); renderQueue();
    } }, dup ? 'Güncelle' : 'Kaydet');
    if (!r || !q.abId) kaydet.disabled = true;
    foot.appendChild(kaydet);
    c.appendChild(foot);
    return c;
  }

  function pencereAc(q) {
    App.faturaPencere.ac(q, {
      abonelikSelect: function (secili) { return abonelikSelect(secili, '— Abonelik seçin —', ''); },
      // Şablon kaydedilince aynı şablonla tanınan bekleyen faturalar yeniden okunur
      onSablon: function () { queue.forEach(function (x) { if (x !== q && (x.status === 'hazir' || x.status === 'sablonsuz')) sablonUygula(x); }); },
      onKaydet: function (x) { x.status = 'hazir'; var ok = saveOne(x); render(containerRef); return ok; },
      onKapat: function () { queue.forEach(function (x) { if (x.status === 'hazir' || x.status === 'sablonsuz') sablonUygula(x); }); render(containerRef); }
    });
  }

  function detay(r) { return r.detay || {}; }
  // Sözleşme gücü faturada "Güç Bedeli" kaleminin miktarı (kW) olarak yazar
  function sozlesmeGucu(r) {
    var k = (r.kalemler || []).find(function (x) { return /^g[üu][çc] bedeli/i.test(x.ad) && x.miktarBirimi === 'kW'; });
    return k && k.miktar ? k.miktar : (detay(r).anlasmaGucu || null);
  }

  function saveOne(q, quietToast) {
    var t = q.abId ? S.abonelikGet(q.abId) : null;
    if (!t || !q.record) return false;
    var rec = Object.assign({}, q.record);
    var dup = S.faturaFindDuplicate(q.abId, rec);
    if (dup) rec.id = dup.id;
    rec.abonelikId = t.id;
    rec.tuketimTesisId = t.tuketimTesisId;
    rec.kaynak = { dosya: q.name, yukleme: new Date().toISOString(), sablon: q.sablon ? q.sablon.ad : null };
    S.faturaSave(rec);
    // Abonelik kartındaki boş alanları faturadan tamamla
    var changed = false;
    [['eic', rec.eic], ['sozlesmeNo', rec.sozlesmeNo], ['tedarikci', rec.tedarikci], ['tuketiciGrubuFatura', rec.tuketiciGrubu],
     ['sozlesmeGucu', sozlesmeGucu(rec)]].forEach(function (p) {
      if ((t[p[0]] === undefined || t[p[0]] === null || t[p[0]] === '') && p[1] !== undefined && p[1] !== null) { t[p[0]] = p[1]; changed = true; }
    });
    if (changed) S.abonelikSave(t);
    q.status = 'kaydedildi';
    if (!quietToast) UI.toast(q.name + ' kaydedildi.', 'ok');
    return true;
  }

  function saveAll() {
    var n = 0, atlanan = 0;
    App.quietRender = true;
    try {
      queue.forEach(function (q) {
        if (q.status !== 'hazir') return;
        var sorunlu = !q.abId || sorunlar(q).some(function (s) { return s.tur === 'err'; }) || (q.sonuc && q.sonuc.tanimsiz.length);
        if (sorunlu) { atlanan++; return; }
        if (saveOne(q, true)) n++;
      });
    } finally { App.quietRender = false; }
    var sablonsuz = queue.filter(function (q) { return q.status === 'sablonsuz'; }).length;
    UI.toast(n + ' fatura kaydedildi.' + (atlanan ? ' ' + atlanan + ' fatura sorunlu olduğu için bekletildi.' : '') + (sablonsuz ? ' ' + sablonsuz + ' faturanın şablonu yok.' : ''), n ? 'ok' : '');
    render(containerRef);
  }

  function guessAbone(grup) {
    var g = (grup || '').toLocaleLowerCase('tr-TR');
    if (/sanayi/.test(g)) return 'Sanayi';
    if (/mesken/.test(g)) return 'Mesken';
    if (/tar[ıi]m|sulama/.test(g)) return 'Tarımsal Sulama';
    if (/ayd[ıi]nlatma/.test(g)) return 'Aydınlatma';
    if (/ticar|kamu|hizmet/.test(g)) return 'Ticarethane';
    return '';
  }

  function createAbonelikFrom(q) {
    var r = q.record || (q.parsed && q.parsed.record) || {};
    var p = q.parsed ? q.parsed.record : r;
    var m = q.parsed ? q.parsed.meta : {};
    var grup = r.tuketiciGrubu || p.tuketiciGrubu || '';
    var prefill = {
      ad: (m.musteriAdi || 'Yeni Abonelik').split(/\s+/).slice(0, 3).join(' '),
      yeniTesisAdi: (m.musteriAdi || 'Yeni Tesis').split(/\s+/).slice(0, 3).join(' '),
      unvan: m.musteriAdi, vkn: m.vkn, vergiDairesi: m.vergiDairesi, adres: m.adres,
      aboneGrubu: guessAbone(grup),
      gerilim: /\bOG\b/.test(grup) ? 'OG' : /\bAG\b/.test(grup) ? 'AG' : /\bYG\b/.test(grup) ? 'YG' : '',
      tarifeTerim: /\bTT\b|Tek Terim/i.test(grup) ? 'Tek Terimli' : /\bÇT\b|\bCT\b|Çift Terim/i.test(grup) ? 'Çift Terimli' : '',
      tarifeZaman: /Tek Zaman/i.test(grup) ? 'Tek Zamanlı' : /Üç Zaman/i.test(grup) || p.t2Kwh || p.t3Kwh ? 'Üç Zamanlı' : '',
      serbestTuketici: /toptan|ortakl/i.test(p.tedarikci || '') ? 'Evet' : '',
      tedarikci: p.tedarikci, tuketiciGrubuFatura: grup, eic: r.eic || p.eic, sozlesmeNo: r.sozlesmeNo || p.sozlesmeNo, tesisatNo: r.tesisatNo || p.tesisatNo,
      sozlesmeGucu: sozlesmeGucu(p), carpan: detay(p).carpan, oncekiYilTuketim: detay(p).gecmisYilKwh || null, oncekiYilTuketimDonem: p.donem
    };
    App.pages.tesisler.editAbonelik(null, null, prefill, function (a) {
      q.abId = a.id;
      queue.forEach(function (x) { if ((x.status === 'hazir' || x.status === 'sablonsuz') && !x.abId) x.abId = resolveAbonelik(x); });
      render(containerRef);
    });
  }

  function sablonlarPenceresi() {
    var body = UI.el('div');
    function ciz() {
      var list = S.sablonList();
      body.innerHTML = '<p class="muted">Şablon, bir tedarikçinin fatura biçiminde hangi değerin nerede olduğunu ve ne anlama geldiğini tanımlar. ' +
        'Faturada tanıma metinlerinin hepsi geçiyorsa şablon otomatik uygulanır.</p>' +
        (list.length ? '<table class="table"><thead><tr><th>Şablon</th><th>Tanıma metinleri</th><th class="num">Bilgi</th><th class="num">Kalem</th><th class="num">Yok sayılan</th><th>Güncelleme</th><th></th></tr></thead><tbody>' +
          list.map(function (s) {
            var say = function (t) { return s.tanimlar.filter(function (x) { return x.tur === t; }).length; };
            return '<tr><td><b>' + U.escapeHtml(s.ad) + '</b></td><td>' + U.escapeHtml((s.anahtarlar || []).join(', ')) + '</td>' +
              '<td class="num">' + (say('alan') + say('kural') + say('sabit')) + '</td><td class="num">' + say('kalem') + '</td><td class="num">' + say('yoksay') + '</td>' +
              '<td>' + U.formatTRDate((s.guncelleme || '').slice(0, 10)) + '</td><td><button class="btn xs danger" data-sil="' + s.id + '">Sil</button></td></tr>';
          }).join('') + '</tbody></table>' : '<p><i>Kayıtlı şablon yok.</i></p>');
    }
    body.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sil]');
      if (!b) return;
      var s = S.sablonGet(b.dataset.sil);
      if (s && confirm('"' + s.ad + '" şablonu silinsin mi? Kayıtlı faturalar etkilenmez.')) { S.sablonDelete(s.id); ciz(); }
    });
    ciz();
    UI.openModal('Fatura Şablonları', body, [{ label: 'Kapat', onclick: function () { UI.closeModal(); render(containerRef); } }]);
    var box = document.querySelector('.modal-box');
    if (box) box.classList.add('wide');
  }

  App.pages = App.pages || {};
  App.pages.yukle = { render: render };
})(this);
