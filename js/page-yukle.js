/* Fatura Yükle modülü: PDF e-faturaları okur, önizletir, kontrol eder ve ilgili aboneliğe kaydeder.
   Eşleştirme faturadaki EIC / sözleşme no / tesisat no ile aboneliğe yapılır. */
(function (root) {
  'use strict';
  var App = root.App, U = App.util, S = App.store, UI = App.ui, F = App.fields, P = App.faturaParser;

  var queue = []; // {id, file, name, status, result, record, abId, error}
  var hedef = 'auto';
  var containerRef = null;

  function render(container, params) {
    containerRef = container;
    if (params && params.ab) hedef = params.ab;
    container.innerHTML = '';
    var page = UI.el('div', { class: 'yukle-page' });

    var head = UI.el('div', { class: 'panel-head' }, '<div><h2>Fatura Yükle</h2><span class="muted">PDF e-fatura dosyalarını sürükleyin; değerler okunur, kontrol edilir ve onayınızla kaydedilir.</span></div>');
    page.appendChild(head);

    var bar = UI.el('div', { class: 'toolbar' });
    var sel = abonelikSelect(hedef, 'Otomatik eşleştir (EIC / Sözleşme No)', 'auto');
    sel.id = 'hedefTesis';
    sel.onchange = function () {
      hedef = sel.value;
      queue.forEach(function (q) { if (q.status === 'hazir') q.abId = resolveAbonelik(q.record); });
      renderQueue();
    };
    bar.appendChild(UI.el('label', { class: 'inline' }, 'Hedef abonelik:'));
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

  function resolveAbonelik(rec) {
    if (hedef !== 'auto' && S.abonelikGet(hedef)) return hedef;
    var m = S.abonelikMatch(rec || {});
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

  function addFiles(files) {
    Array.prototype.forEach.call(files, function (file) {
      if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { UI.toast(file.name + ': PDF değil, atlandı.', 'err'); return; }
      var q = { id: U.uid('q'), file: file, name: file.name, status: 'okunuyor' };
      queue.push(q);
      readPdf(file).then(function (list) {
        // Bir PDF birden çok fatura içerebilir: her fatura için ayrı kart
        var items = list.map(function (inv) {
          return {
            id: U.uid('q'), file: file, status: 'hazir', result: inv.res, record: inv.res.record,
            name: file.name + (list.length > 1 ? ' · s.' + inv.pageFrom + (inv.pageTo > inv.pageFrom ? '–' + inv.pageTo : '') : ''),
            abId: resolveAbonelik(inv.res.record)
          };
        });
        queue.splice.apply(queue, [queue.indexOf(q), 1].concat(items));
        if (list.length > 1) UI.toast(file.name + ': ' + list.length + ' fatura bulundu.', 'ok');
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
      if (!pages.length || !pages.some(function (p) { return p.items.length; })) throw new Error('PDF içinde metin bulunamadı (taranmış görüntü olabilir).');
      return P.splitInvoices(pages).map(function (inv) {
        return { pageFrom: inv.pageFrom, pageTo: inv.pageTo, res: P.parse(inv.items, inv.width) };
      });
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
    var title = '<strong>' + U.escapeHtml(q.name) + '</strong>';
    if (q.status === 'okunuyor') { c.innerHTML = '<div class="fcard-head">' + title + '<span class="badge">Okunuyor…</span></div>'; return c; }
    if (q.status === 'hata') { c.innerHTML = '<div class="fcard-head">' + title + '<span class="badge err">Hata</span></div><p class="err-text">' + U.escapeHtml(q.error) + '</p>'; return c; }
    if (q.status === 'kaydedildi') {
      var ab = S.abonelikGet(q.abId) || {};
      c.innerHTML = '<div class="fcard-head">' + title + '<span class="badge ok">Kaydedildi</span></div><p>' +
        U.escapeHtml(abonelikAdi(q.abId)) + ' · ' + U.donemLabel(q.record.donem) +
        ' · <a href="#/veriler?tt=' + ab.tuketimTesisId + '&ab=' + q.abId + '">Veriler sayfasında aç →</a></p>';
      return c;
    }
    if (q.status === 'atlandi') { c.innerHTML = '<div class="fcard-head">' + title + '<span class="badge">Atlandı</span></div>'; return c; }

    var r = q.record, res = q.result, calc = F.compute(r);
    var checks = F.FIELDS.filter(function (f) { return f.check; }).map(function (f) {
      var st = F.checkStatus(f, calc[f.key], r);
      return '<span class="chk ' + (st || 'na') + '" title="' + U.escapeHtml(f.label) + ': ' + (calc[f.key] === null ? 'hesaplanamadı' : U.formatTRNumber(calc[f.key], 3)) + '">' +
        (st === 'ok' ? '✓' : st === 'err' ? '✗' : '–') + ' ' + U.escapeHtml(f.label.replace('Kontrol: ', '')) + '</span>';
    }).join('');

    var head = UI.el('div', { class: 'fcard-head' }, title +
      '<span class="badge">' + U.escapeHtml(U.donemLabel(r.donem)) + '</span>' +
      '<span class="badge">' + res.found + ' alan okundu</span>' +
      '<span class="muted">' + U.escapeHtml(r.tedarikci || '') + ' · ' + U.escapeHtml(r.faturaNo || '') + '</span>');
    c.appendChild(head);

    // Abonelik eşleştirme
    var match = UI.el('div', { class: 'match' });
    var sel = abonelikSelect(q.abId, '— Abonelik seçin —', '');
    sel.onchange = function () { q.abId = sel.value || null; renderQueue(); };
    match.appendChild(UI.el('span', null, 'Kaydedilecek abonelik:'));
    match.appendChild(sel);
    match.appendChild(UI.el('button', { class: 'btn sm', onclick: function () { createAbonelikFrom(q); } }, 'Faturadan yeni abonelik oluştur'));
    c.appendChild(match);

    var dup = q.abId ? S.faturaFindDuplicate(q.abId, r) : null;
    var info = [];
    if (!q.abId) info.push('<li class="warn">Bu fatura hiçbir abonelikle eşleşmedi (EIC: ' + U.escapeHtml(r.eic || '—') + '). Abonelik seçin veya faturadan yeni abonelik oluşturun.</li>');
    if (q.abId && r.donem) {
      var ayni = S.faturaList(null, q.abId).filter(function (f) { return f.donem === r.donem && f.faturaNo !== r.faturaNo; });
      if (ayni.length) info.push('<li class="warn">Bu abonelikte ' + U.escapeHtml(U.donemLabel(r.donem)) + ' dönemine ait başka fatura da kayıtlı (' + ayni.map(function (f) { return U.escapeHtml(f.faturaNo || '—'); }).join(', ') + '). Düzeltme/iptal faturası olabilir; kontrol edin.</li>');
    }
    var kardes = queue.filter(function (x) { return x !== q && x.record && x.record.donem === r.donem && x.status === 'hazir' && x.abId === q.abId; });
    if (kardes.length) info.push('<li class="warn">Bu yüklemede ' + U.escapeHtml(U.donemLabel(r.donem)) + ' dönemine ait ' + (kardes.length + 1) + ' fatura var.</li>');
    if (dup) info.push('<li class="warn">Bu abonelikte aynı fatura zaten kayıtlı (' + U.escapeHtml(dup.faturaNo || U.donemLabel(dup.donem)) + '). Kaydederseniz mevcut kayıt güncellenir.</li>');
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
          var st = F.checkStatus(f, v, r);
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
    if (!q.abId) saveBtn.disabled = true;
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

  function saveOne(q, quietToast) {
    var t = q.abId ? S.abonelikGet(q.abId) : null;
    if (!t || q.status !== 'hazir') return false;
    var rec = Object.assign({}, q.record);
    var dup = S.faturaFindDuplicate(q.abId, rec);
    if (dup) rec.id = dup.id;
    rec.abonelikId = t.id;
    rec.tuketimTesisId = t.tuketimTesisId;
    rec.kaynak = { dosya: q.name, yukleme: new Date().toISOString(), meta: q.result.meta };
    S.faturaSave(rec);
    // Abonelik kartındaki boş alanları faturadan tamamla
    var changed = false;
    [['eic', rec.eic], ['sozlesmeNo', rec.sozlesmeNo], ['tedarikci', rec.tedarikci], ['tuketiciGrubuFatura', rec.tuketiciGrubu],
     ['carpan', rec.carpan], ['sozlesmeGucu', rec.gucMiktar]].forEach(function (p) {
      if ((t[p[0]] === undefined || t[p[0]] === null || t[p[0]] === '') && p[1] !== undefined && p[1] !== null) { t[p[0]] = p[1]; changed = true; }
    });
    if (rec.gecmisYilKwh && rec.donem && (!t.oncekiYilTuketimDonem || rec.donem >= t.oncekiYilTuketimDonem)) {
      t.oncekiYilTuketim = rec.gecmisYilKwh; t.oncekiYilTuketimDonem = rec.donem; changed = true;
    }
    if (changed) S.abonelikSave(t);
    q.status = 'kaydedildi';
    if (!quietToast) UI.toast(q.name + ' kaydedildi.', 'ok');
    return true;
  }

  function saveAll() {
    var n = 0;
    App.quietRender = true;
    try { queue.forEach(function (q) { if (q.status === 'hazir' && q.abId && saveOne(q, true)) n++; }); }
    finally { App.quietRender = false; }
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

  function createAbonelikFrom(q) {
    var r = q.record, m = q.result.meta;
    var grup = r.tuketiciGrubu || '';
    var prefill = {
      ad: (m.musteriAdi || 'Yeni Abonelik').split(/\s+/).slice(0, 3).join(' '),
      yeniTesisAdi: (m.musteriAdi || 'Yeni Tesis').split(/\s+/).slice(0, 3).join(' '),
      unvan: m.musteriAdi, vkn: m.vkn, vergiDairesi: m.vergiDairesi, adres: m.adres,
      aboneGrubu: guessAbone(grup),
      gerilim: /\bOG\b/.test(grup) ? 'OG' : /\bAG\b/.test(grup) ? 'AG' : /\bYG\b/.test(grup) ? 'YG' : '',
      tarifeTerim: /\bTT\b|Tek Terim/i.test(grup) ? 'Tek Terimli' : /\bÇT\b|\bCT\b|Çift Terim/i.test(grup) ? 'Çift Terimli' : '',
      tarifeZaman: /Tek Zaman/i.test(grup) ? 'Tek Zamanlı' : /Üç Zaman/i.test(grup) || r.t2Kwh || r.t3Kwh ? 'Üç Zamanlı' : '',
      serbestTuketici: /toptan|ortakl/i.test(r.tedarikci || '') ? 'Evet' : '',
      tedarikci: r.tedarikci, tuketiciGrubuFatura: grup, eic: r.eic, sozlesmeNo: r.sozlesmeNo, tesisatNo: r.tesisatNo,
      sozlesmeGucu: r.gucMiktar, carpan: r.carpan, oncekiYilTuketim: r.gecmisYilKwh, oncekiYilTuketimDonem: r.donem
    };
    App.pages.tesisler.editAbonelik(null, null, prefill, function (a) {
      q.abId = a.id;
      // Aynı EIC/sözleşme no'lu diğer faturalar da yeni aboneliğe eşleşsin
      queue.forEach(function (x) { if (x.status === 'hazir' && !x.abId) x.abId = resolveAbonelik(x.record); });
      render(containerRef);
    });
  }

  App.pages = App.pages || {};
  App.pages.yukle = { render: render };
})(this);
