/* Fatura Yükle modülü: PDF e-faturaları okur, önizletir, kontrol eder ve tüketim tesisinin Veriler sayfasına kaydeder. */
(function (root) {
  'use strict';
  var App = root.App, U = App.util, S = App.store, UI = App.ui, F = App.fields, P = App.faturaParser;

  var queue = []; // {id, file, status, result, record, tesisId, error}
  var hedef = 'auto';
  var containerRef = null;

  function render(container, params) {
    containerRef = container;
    if (params && params.tt) hedef = params.tt;
    container.innerHTML = '';
    var page = UI.el('div', { class: 'yukle-page' });

    var head = UI.el('div', { class: 'panel-head' }, '<div><h2>Fatura Yükle</h2><span class="muted">PDF e-fatura dosyalarını sürükleyin; değerler okunur, kontrol edilir ve onayınızla kaydedilir.</span></div>');
    page.appendChild(head);

    var bar = UI.el('div', { class: 'toolbar' });
    var sel = UI.el('select', { id: 'hedefTesis' });
    sel.appendChild(UI.el('option', { value: 'auto' }, 'Otomatik eşleştir (EIC / Sözleşme No)'));
    S.tuketimList().forEach(function (t) {
      var o = UI.el('option', { value: t.id }, U.escapeHtml(t.ad));
      if (t.id === hedef) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = function () {
      hedef = sel.value;
      queue.forEach(function (q) { if (q.status === 'hazir') q.tesisId = resolveTesis(q.record); });
      renderQueue();
    };
    bar.appendChild(UI.el('label', { class: 'inline' }, 'Hedef tüketim tesisi:'));
    bar.appendChild(sel);
    if (queue.length) {
      bar.appendChild(UI.el('button', { class: 'btn primary sm', onclick: saveAll }, 'Hazır olanların tümünü kaydet'));
      bar.appendChild(UI.el('button', { class: 'btn sm', onclick: function () { queue = []; render(container); } }, 'Listeyi temizle'));
    }
    page.appendChild(bar);

    var drop = UI.el('label', { class: 'dropzone' },
      '<input type="file" accept="application/pdf,.pdf" multiple hidden>' +
      '<div class="dz-icon">⬆</div><div><strong>PDF faturaları buraya bırakın</strong> veya tıklayıp seçin</div>' +
      '<div class="muted">Birden fazla dosya seçebilirsiniz. Dosyalar bilgisayarınızdan dışarı gönderilmez; okuma tarayıcıda yapılır.</div>');
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

  function resolveTesis(rec) {
    if (hedef !== 'auto') return hedef;
    var m = S.tuketimMatch(rec || {});
    return m ? m.id : null;
  }

  function addFiles(files) {
    Array.prototype.forEach.call(files, function (file) {
      if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { UI.toast(file.name + ': PDF değil, atlandı.', 'err'); return; }
      var q = { id: U.uid('q'), file: file, status: 'okunuyor' };
      queue.push(q);
      readPdf(file).then(function (res) {
        q.result = res;
        q.record = res.record;
        q.tesisId = resolveTesis(res.record);
        q.status = 'hazir';
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
    return file.arrayBuffer().then(function (buf) {
      return root.pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    }).then(P.extractItems).then(function (pages) {
      if (!pages.length || !pages[0].items.length) throw new Error('PDF içinde metin bulunamadı (taranmış görüntü olabilir).');
      var res = P.parse(pages[0].items, pages[0].width);
      if (pages.length > 1) res.warnings.push('PDF ' + pages.length + ' sayfa; yalnızca ilk sayfa okundu.');
      return res;
    });
  }

  function renderQueue() {
    var box = document.getElementById('queue');
    if (!box) return;
    box.innerHTML = '';
    queue.forEach(function (q) { box.appendChild(card(q)); });
  }

  function card(q) {
    var c = UI.el('div', { class: 'fcard ' + q.status });
    var title = '<strong>' + U.escapeHtml(q.file.name) + '</strong>';
    if (q.status === 'okunuyor') { c.innerHTML = '<div class="fcard-head">' + title + '<span class="badge">Okunuyor…</span></div>'; return c; }
    if (q.status === 'hata') { c.innerHTML = '<div class="fcard-head">' + title + '<span class="badge err">Hata</span></div><p class="err-text">' + U.escapeHtml(q.error) + '</p>'; return c; }
    if (q.status === 'kaydedildi') {
      c.innerHTML = '<div class="fcard-head">' + title + '<span class="badge ok">Kaydedildi</span></div><p>' +
        U.escapeHtml((S.tuketimGet(q.tesisId) || {}).ad || '') + ' · ' + U.donemLabel(q.record.donem) +
        ' · <a href="#/veriler?tt=' + q.tesisId + '">Veriler sayfasında aç →</a></p>';
      return c;
    }
    if (q.status === 'atlandi') { c.innerHTML = '<div class="fcard-head">' + title + '<span class="badge">Atlandı</span></div>'; return c; }

    var r = q.record, res = q.result, calc = F.compute(r);
    var checks = F.FIELDS.filter(function (f) { return f.check; }).map(function (f) {
      var st = F.checkStatus(f, calc[f.key]);
      return '<span class="chk ' + (st || 'na') + '" title="' + U.escapeHtml(f.label) + ': ' + (calc[f.key] === null ? 'hesaplanamadı' : U.formatTRNumber(calc[f.key], 3)) + '">' +
        (st === 'ok' ? '✓' : st === 'err' ? '✗' : '–') + ' ' + U.escapeHtml(f.label.replace('Kontrol: ', '')) + '</span>';
    }).join('');

    var head = UI.el('div', { class: 'fcard-head' }, title +
      '<span class="badge">' + U.escapeHtml(U.donemLabel(r.donem)) + '</span>' +
      '<span class="badge">' + res.found + ' alan okundu</span>' +
      '<span class="muted">' + U.escapeHtml(r.tedarikci || '') + ' · ' + U.escapeHtml(r.faturaNo || '') + '</span>');
    c.appendChild(head);

    // Tesis eşleştirme
    var match = UI.el('div', { class: 'match' });
    var sel = UI.el('select');
    sel.appendChild(UI.el('option', { value: '' }, '— Tüketim tesisi seçin —'));
    S.tuketimList().forEach(function (t) {
      var o = UI.el('option', { value: t.id }, U.escapeHtml(t.ad));
      if (t.id === q.tesisId) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = function () { q.tesisId = sel.value || null; renderQueue(); };
    match.appendChild(UI.el('span', null, 'Kaydedilecek tesis:'));
    match.appendChild(sel);
    match.appendChild(UI.el('button', { class: 'btn sm', onclick: function () { createTesisFrom(q); } }, 'Faturadan yeni tesis oluştur'));
    c.appendChild(match);

    var dup = q.tesisId ? S.faturaFindDuplicate(q.tesisId, r) : null;
    var info = [];
    if (!q.tesisId) info.push('<li class="warn">Bu fatura hiçbir tesisle eşleşmedi (EIC: ' + U.escapeHtml(r.eic || '—') + '). Tesis seçin veya faturadan yeni tesis oluşturun.</li>');
    if (dup) info.push('<li class="warn">Bu tesiste aynı fatura zaten kayıtlı (' + U.escapeHtml(dup.faturaNo || U.donemLabel(dup.donem)) + '). Kaydederseniz mevcut kayıt güncellenir.</li>');
    res.warnings.forEach(function (w) { info.push('<li>' + U.escapeHtml(w) + '</li>'); });
    if (info.length) c.appendChild(UI.el('ul', { class: 'notes' }, info.join('')));

    c.appendChild(UI.el('div', { class: 'checks' }, checks));

    // Meta bilgiler
    var m = res.meta;
    c.appendChild(UI.el('div', { class: 'meta' },
      [['Abone', m.musteriAdi], ['VKN', m.vkn], ['Vergi Dairesi', m.vergiDairesi], ['Adres', m.adres], ['Tedarikçi VKN', m.tedarikciVkn], ['Sayaç', m.sayac], ['ETTN', m.ettn]]
        .filter(function (x) { return x[1]; }).map(function (x) { return '<span><i>' + x[0] + ':</i> ' + U.escapeHtml(x[1]) + '</span>'; }).join('')));

    // Alan önizleme / düzeltme
    var det = UI.el('details', { class: 'preview' });
    det.appendChild(UI.el('summary', null, 'Okunan değerleri göster / düzelt'));
    var grid = UI.el('div', { class: 'preview-grid' });
    F.GROUPS.forEach(function (g) {
      var fs = F.FIELDS.filter(function (f) { return f.group === g.id; });
      var sec = UI.el('div', { class: 'pg-group' }, '<h5>' + U.escapeHtml(g.label) + '</h5>');
      fs.forEach(function (f) {
        var v = f.calc ? calc[f.key] : r[f.key];
        var row = UI.el('label', { class: 'pg-row' + (f.calc ? ' calc' : '') + (!f.calc && (v === undefined || v === null || v === '') ? ' missing' : '') });
        row.appendChild(UI.el('span', null, U.escapeHtml(f.label) + (f.unit ? ' <i>' + U.escapeHtml(f.unit) + '</i>' : '')));
        if (f.calc) {
          var st = F.checkStatus(f, v);
          row.appendChild(UI.el('b', { class: st || '' }, v === null || v === undefined ? '—' : U.formatTRNumber(v, f.dec === undefined ? 2 : f.dec)));
        } else {
          var inp = UI.el('input', { type: 'text', value: displayValue(f, v) });
          inp.onchange = function () { r[f.key] = parseValue(f, inp.value); renderQueue(); };
          row.appendChild(inp);
        }
        sec.appendChild(row);
      });
      grid.appendChild(sec);
    });
    det.appendChild(grid);
    var raw = UI.el('details', { class: 'raw' });
    raw.appendChild(UI.el('summary', null, 'PDF’ten çıkarılan ham metin'));
    raw.appendChild(UI.el('pre', null, U.escapeHtml(res.lines.join('\n'))));
    det.appendChild(raw);
    c.appendChild(det);

    var foot = UI.el('div', { class: 'fcard-foot' });
    foot.appendChild(UI.el('button', { class: 'btn sm', onclick: function () { q.status = 'atlandi'; renderQueue(); } }, 'Atla'));
    var saveBtn = UI.el('button', { class: 'btn primary sm', onclick: function () { saveOne(q); renderQueue(); } }, dup ? 'Güncelle' : 'Kaydet');
    if (!q.tesisId) saveBtn.disabled = true;
    foot.appendChild(saveBtn);
    c.appendChild(foot);
    return c;
  }

  function displayValue(f, v) {
    if (v === null || v === undefined) return '';
    if (f.type === 'num') return U.formatTRNumber(v, f.dec === undefined ? 2 : f.dec);
    if (f.type === 'date') return U.formatTRDate(v);
    return String(v);
  }
  function parseValue(f, s) {
    s = String(s).trim();
    if (s === '') return null;
    if (f.type === 'num') return U.parseTRNumber(s);
    if (f.type === 'date') return U.parseTRDate(s) || s;
    return s;
  }

  function saveOne(q) {
    if (!q.tesisId || q.status !== 'hazir') return false;
    var rec = Object.assign({}, q.record);
    var dup = S.faturaFindDuplicate(q.tesisId, rec);
    if (dup) rec.id = dup.id;
    rec.tuketimTesisId = q.tesisId;
    rec.kaynak = { dosya: q.file.name, yukleme: new Date().toISOString(), meta: q.result.meta };
    S.faturaSave(rec);
    // Tesis kartındaki boş alanları faturadan tamamla
    var t = S.tuketimGet(q.tesisId);
    var changed = false;
    [['eic', rec.eic], ['sozlesmeNo', rec.sozlesmeNo], ['tedarikci', rec.tedarikci], ['tuketiciGrubuFatura', rec.tuketiciGrubu],
     ['carpan', rec.carpan], ['sozlesmeGucu', rec.gucMiktar]].forEach(function (p) {
      if ((t[p[0]] === undefined || t[p[0]] === null || t[p[0]] === '') && p[1] !== undefined && p[1] !== null) { t[p[0]] = p[1]; changed = true; }
    });
    if (rec.gecmisYilKwh && rec.donem && (!t.oncekiYilTuketimDonem || rec.donem >= t.oncekiYilTuketimDonem)) {
      t.oncekiYilTuketim = rec.gecmisYilKwh; t.oncekiYilTuketimDonem = rec.donem; changed = true;
    }
    if (changed) S.tuketimSave(t);
    q.status = 'kaydedildi';
    UI.toast(q.file.name + ' kaydedildi.', 'ok');
    return true;
  }

  function saveAll() {
    var n = 0;
    queue.forEach(function (q) { if (q.status === 'hazir' && q.tesisId && saveOne(q)) n++; });
    UI.toast(n + ' fatura kaydedildi.', 'ok');
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

  function createTesisFrom(q) {
    var r = q.record, m = q.result.meta;
    var grup = r.tuketiciGrubu || '';
    var prefill = {
      ad: (m.musteriAdi || 'Yeni Tesis').split(/\s+/).slice(0, 3).join(' '),
      unvan: m.musteriAdi, vkn: m.vkn, vergiDairesi: m.vergiDairesi, adres: m.adres,
      aboneGrubu: guessAbone(grup),
      gerilim: /\bOG\b/.test(grup) ? 'OG' : /\bAG\b/.test(grup) ? 'AG' : /\bYG\b/.test(grup) ? 'YG' : '',
      tarifeTerim: /\bTT\b/.test(grup) ? 'Tek Terimli' : /\bÇT\b|\bCT\b/.test(grup) ? 'Çift Terimli' : '',
      tarifeZaman: (r.t2Kwh || r.t3Kwh) ? 'Üç Zamanlı' : '',
      serbestTuketici: /toptan|ortakl/i.test(r.tedarikci || '') ? 'Evet' : '',
      tedarikci: r.tedarikci, tuketiciGrubuFatura: grup, eic: r.eic, sozlesmeNo: r.sozlesmeNo, tesisatNo: r.tesisatNo,
      sozlesmeGucu: r.gucMiktar, carpan: r.carpan, oncekiYilTuketim: r.gecmisYilKwh, oncekiYilTuketimDonem: r.donem
    };
    App.onTuketimSaved = function (t) { q.tesisId = t.id; App.onTuketimSaved = null; render(containerRef); };
    App.pages.tesisler.editTuketim(null, prefill);
  }

  App.pages = App.pages || {};
  App.pages.yukle = { render: render };
})(this);
