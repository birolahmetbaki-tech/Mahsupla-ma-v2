/* Veriler › OSOS sayfası: sayaçların saatlik çekiş/veriş verileri ve saatlik mahsuplaşma takibi.
   Tüketim = seçili aboneliklerin (tüketim sayaçları) çekişi; Üretim = bu aboneliklere bağlı üretim tesislerinin (üretim sayaçları) verişi. */
(function (root) {
  'use strict';
  var App = root.App, U = App.util, S = App.store, UI = App.ui, O = App.osos;

  var PREF_KEY = 'mahsupla.osos.prefs';
  var prefs = (function () { try { return Object.assign({ gorunum: 'saatlik', ay: null }, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) { return { gorunum: 'saatlik', ay: null }; } })();
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* önemsiz */ } }

  var ctxRef = null, pageRef = null;

  function fmt(v, d) { return typeof v === 'number' && isFinite(v) ? U.formatTRNumber(v, d === undefined ? 0 : d) : ''; }
  function pct(v) { return typeof v === 'number' && isFinite(v) ? U.formatTRNumber(v * 100, 1) + ' %' : '—'; }
  function pad(n) { return ('0' + n).slice(-2); }

  // Seçime göre tüketim (abonelik) ve üretim (üretim tesisi) sayaçları
  function kaynaklar(ctx) {
    var tumAb = S.abonelikList(ctx.tt);
    var abs = ctx.ab === 'tum' ? tumAb : tumAb.filter(function (a) { return a.id === ctx.ab; });
    var abIds = abs.map(function (a) { return a.id; });
    var urs = S.uretimList(ctx.tt).filter(function (u) {
      return !u.abonelikIds || !u.abonelikIds.length || u.abonelikIds.some(function (id) { return abIds.indexOf(id) >= 0; });
    });
    return { abonelikler: abs, uretimler: urs, abIds: abIds, urIds: urs.map(function (u) { return u.id; }) };
  }

  function render(page, ctx) {
    ctxRef = ctx; pageRef = page;
    var k = kaynaklar(ctx);
    var tumIds = k.abIds.concat(k.urIds);
    var aylar = O.aylar(tumIds);
    if (!prefs.ay || aylar.indexOf(prefs.ay) < 0) prefs.ay = aylar[aylar.length - 1] || null;

    var bar = UI.el('div', { class: 'toolbar' });
    if (aylar.length) {
      var aySel = UI.el('select', { title: 'Ay' });
      aylar.slice().reverse().forEach(function (a) { var o = UI.el('option', { value: a }, U.donemLabel(a)); if (a === prefs.ay) o.selected = true; aySel.appendChild(o); });
      aySel.onchange = function () { prefs.ay = aySel.value; savePrefs(); App.pages.veriler.rerenderPage(); };
      bar.appendChild(aySel);
      var seg = UI.el('div', { class: 'seg' });
      [['saatlik', 'Saatlik'], ['gunluk', 'Günlük'], ['aylik', 'Aylık (yıl)']].forEach(function (g) {
        seg.appendChild(UI.el('button', { class: 'btn sm' + (prefs.gorunum === g[0] ? ' on' : ''), onclick: function () { prefs.gorunum = g[0]; savePrefs(); App.pages.veriler.rerenderPage(); } }, g[1]));
      });
      bar.appendChild(seg);
      bar.appendChild(UI.el('span', { class: 'sep' }));
    }
    bar.appendChild(UI.el('button', { class: 'btn primary sm', onclick: function () { secDosya(ctx); } }, '⬆ OSOS Verisi Yükle'));
    bar.appendChild(UI.el('button', { class: 'btn sm', onclick: function () { sayaclar(ctx); } }, 'Sayaçlar'));
    if (aylar.length) bar.appendChild(UI.el('button', { class: 'btn sm', onclick: function () { csvIndir(ctx); } }, 'CSV (Excel) indir'));
    page.appendChild(bar);

    if (!k.abonelikler.length) {
      page.appendChild(UI.el('div', { class: 'empty' }, '<p>Bu tesiste abonelik yok. Önce Tesisler sayfasından abonelik ekleyin.</p>'));
      return;
    }

    // Kaynak sayaçlar ve seçili aydaki doluluk
    var src = UI.el('div', { class: 'osos-src' });
    function chip(ad, tur, id) {
      var s = O.seri(id), m = s && prefs.ay ? s.aylar[prefs.ay] : null;
      var dolu = 0; if (m) for (var i = 0; i < m.c.length; i++) if (m.c[i] !== null || m.v[i] !== null) dolu++;
      var n = prefs.ay ? O.gunSayisi(prefs.ay) * 24 : 0;
      return '<span class="src-chip ' + (m ? (dolu === n ? 'ok' : 'part') : 'none') + '" title="' + (m ? dolu + ' / ' + n + ' saat dolu' : 'Bu ay için veri yok') + '">' +
        '<b>' + tur + '</b> ' + U.escapeHtml(ad) + (m ? ' · ' + (dolu === n ? 'tam' : dolu + '/' + n + ' saat') : ' · veri yok') + '</span>';
    }
    src.innerHTML = '<span class="muted">Sayaçlar:</span> ' +
      k.abonelikler.map(function (a) { return chip(a.ad, 'Tüketim', a.id); }).join('') +
      (k.uretimler.length ? k.uretimler.map(function (u) { return chip(u.ad, 'Üretim', u.id); }).join('') : '<span class="muted">Bağlı üretim tesisi yok</span>');
    page.appendChild(src);

    if (!aylar.length) {
      page.appendChild(UI.el('div', { class: 'empty' },
        '<p><b>Henüz OSOS verisi yok.</b></p><p class="muted">Dağıtım şirketinin OSOS ekranından ya da EPİAŞ’tan indirdiğiniz saatlik çekiş/veriş dosyasını (Excel veya CSV) yükleyin.<br>' +
        'Tüketim sayacı verisini aboneliğe, üretim sayacı verisini üretim tesisine yükleyin; saatlik mahsuplaşma otomatik hesaplanır.</p>'));
      return;
    }

    if (prefs.gorunum === 'aylik') renderYil(page, k);
    else renderAy(page, k, ctx);
  }

  function kart(baslik, deger, alt, cls) {
    return '<div class="kpi ' + (cls || '') + '"><span>' + baslik + '</span><b>' + deger + '</b>' + (alt ? '<small>' + alt + '</small>' : '') + '</div>';
  }

  function renderAy(page, k, ctx) {
    var sonuc = O.hesaplaAy(prefs.ay, k.abIds, k.urIds);
    var oz = sonuc.ozet;
    var uv = oz.uretimVar;

    // Faturayla karşılaştırma (aynı dönem, seçili abonelikler)
    var faturalar = S.faturaList(ctx.tt).filter(function (f) { return f.donem === prefs.ay && k.abIds.indexOf(f.abonelikId) >= 0; });
    var fCekis = faturalar.reduce(function (a, f) { return a + (f.aktifKwh || 0); }, 0);
    var fMahsup = faturalar.reduce(function (a, f) { return a + Math.abs(f.mahsupKwh || 0); }, 0);

    var kpis = UI.el('div', { class: 'kpis' });
    kpis.innerHTML =
      kart('Tüketim (çekiş)', fmt(oz.T) + ' kWh', faturalar.length ? 'Fatura: ' + fmt(fCekis) + ' kWh' + (fCekis ? ' (' + (oz.T >= fCekis ? '+' : '') + U.formatTRNumber((oz.T / fCekis - 1) * 100, 1) + ' %)' : '') : '') +
      kart(uv ? 'Üretim (veriş)' : 'Şebekeye veriş', fmt(oz.U) + ' kWh') +
      (uv ? kart('Saatlik mahsuplaşan', fmt(oz.mahsup) + ' kWh', 'Öz tüketim: ' + pct(oz.ozTuketim) + (fMahsup ? ' · Fatura mahsubu: ' + fmt(fMahsup) + ' kWh' : ''), 'accent') : '') +
      kart('İhtiyaç fazlası', fmt(oz.fazla) + ' kWh', uv ? 'Üretimin ' + pct(oz.U ? oz.fazla / oz.U : null) + '’i' : 'Sayaçtan veriş') +
      kart('Şebekeden net çekiş', fmt(oz.net) + ' kWh') +
      (uv ? kart('Aylık mahsuplaşma olsaydı', fmt(oz.aylikMahsup) + ' kWh', 'Saatlik fark: ' + fmt(oz.kayip) + ' kWh', oz.kayip > 0 ? 'warn' : '') : '') +
      kart('Eksik saat', oz.eksik + ' / ' + oz.saat, oz.eksik ? 'Eksik saatler hesaba katılmadı' : 'Tüm saatler dolu', oz.eksik ? 'warn' : 'ok');
    page.appendChild(kpis);
    if (!uv) page.appendChild(UI.el('p', { class: 'note' }, 'Seçili aboneliklere bağlı üretim sayacı verisi yok. Aynı ölçüm noktası varsayıldı: sayacın verişi ihtiyaç fazlası, çekişi şebekeden net çekiştir; sayacın arkasında kalan öz tüketim görünmez.'));

    var wrap = UI.el('div', { class: 'sheet-wrap osos-wrap' });
    var cokAb = k.abonelikler.length > 1;
    var html = '<table class="sheet osos"><thead><tr>';
    if (prefs.gorunum === 'gunluk') html += '<th class="corner">Gün</th>';
    else html += '<th class="corner">Tarih</th><th>Saat</th>';
    if (cokAb) k.abonelikler.forEach(function (a) { html += '<th>' + U.escapeHtml(a.ad) + '<small>çekiş kWh</small></th>'; });
    html += '<th>Tüketim<small>kWh</small></th><th>' + (uv ? 'Üretim' : 'Veriş') + '<small>kWh</small></th>' +
      (uv ? '<th>Mahsuplaşan<small>kWh</small></th>' : '') + '<th>İhtiyaç Fazlası<small>kWh</small></th><th>Net Çekiş<small>kWh</small></th>' +
      (prefs.gorunum === 'gunluk' ? '<th>Eksik Saat</th>' : '') + '</tr></thead><tbody>';
    var p = prefs.ay.split('-');
    if (prefs.gorunum === 'gunluk') {
      var gunler = O.gunluk(sonuc);
      var abGun = cokAb ? k.abonelikler.map(function (a) { return gunlukSeri(a.id, prefs.ay); }) : [];
      gunler.forEach(function (g, gi) {
        html += '<tr class="' + (g.eksik ? 'eksik' : '') + '"><th class="rowh">' + pad(g.gun) + '.' + p[1] + '.' + p[0] + '</th>';
        abGun.forEach(function (s) { html += '<td class="num">' + fmt(s[gi]) + '</td>'; });
        html += '<td class="num">' + fmt(g.T) + '</td><td class="num">' + fmt(g.U) + '</td>' + (uv ? '<td class="num">' + fmt(g.mahsup) + '</td>' : '') +
          '<td class="num' + (g.fazla ? ' fazla' : '') + '">' + fmt(g.fazla) + '</td><td class="num">' + fmt(g.net) + '</td><td class="num">' + (g.eksik || '') + '</td></tr>';
      });
    } else {
      var abSaat = cokAb ? k.abonelikler.map(function (a) { var s = O.seri(a.id); return s && s.aylar[prefs.ay] ? s.aylar[prefs.ay].c : []; }) : [];
      sonuc.rows.forEach(function (r) {
        html += '<tr class="' + (r.eksik ? 'eksik' : '') + (r.saat === 0 ? ' gunbasi' : '') + '"><th class="rowh">' + pad(r.gun) + '.' + p[1] + '.' + p[0] + '</th><td>' + pad(r.saat) + ':00</td>';
        abSaat.forEach(function (arr) { html += '<td class="num">' + fmt(arr[r.idx], 3) + '</td>'; });
        html += '<td class="num">' + fmt(r.T, 3) + '</td><td class="num">' + fmt(r.U, 3) + '</td>' + (uv ? '<td class="num">' + fmt(r.mahsup, 3) + '</td>' : '') +
          '<td class="num' + (r.fazla ? ' fazla' : '') + '">' + fmt(r.fazla, 3) + '</td><td class="num">' + fmt(r.net, 3) + '</td></tr>';
      });
    }
    html += '</tbody><tfoot><tr><th class="rowh">Toplam</th>' + (prefs.gorunum === 'gunluk' ? '' : '<td></td>');
    if (cokAb) k.abonelikler.forEach(function (a) { var s = O.seri(a.id), m = s && s.aylar[prefs.ay]; html += '<td class="num">' + fmt(m ? m.c.reduce(function (x, y) { return x + (y || 0); }, 0) : null) + '</td>'; });
    html += '<td class="num">' + fmt(oz.T) + '</td><td class="num">' + fmt(oz.U) + '</td>' + (uv ? '<td class="num">' + fmt(oz.mahsup) + '</td>' : '') +
      '<td class="num">' + fmt(oz.fazla) + '</td><td class="num">' + fmt(oz.net) + '</td>' + (prefs.gorunum === 'gunluk' ? '<td class="num">' + oz.eksik + '</td>' : '') + '</tr></tfoot></table>';
    wrap.innerHTML = html;
    page.appendChild(wrap);
  }

  function gunlukSeri(id, ay) {
    var s = O.seri(id), m = s && s.aylar[ay], out = [];
    if (!m) return out;
    for (var i = 0; i < m.c.length; i++) { var g = Math.floor(i / 24); out[g] = (out[g] || 0) + (m.c[i] || 0); }
    return out;
  }

  // Yıl görünümü: aylık özetler, kümülatif üretim ve 2× bedelli üretim limiti
  function renderYil(page, k) {
    var yil = prefs.ay.slice(0, 4);
    var aylar = O.aylar(k.abIds.concat(k.urIds)).filter(function (a) { return a.indexOf(yil) === 0; });
    var limitRef = 0, limitTam = true;
    k.abonelikler.forEach(function (a) { if (a.aboneGrubu === 'Mesken') return; if (a.oncekiYilTuketim) limitRef += a.oncekiYilTuketim; else limitTam = false; });
    var limit = limitRef * 2;
    var kum = 0, top = { T: 0, U: 0, mahsup: 0, fazla: 0, net: 0, aylik: 0 };
    var uvHerhangi = false;
    var rows = aylar.map(function (a) {
      var o = O.hesaplaAy(a, k.abIds, k.urIds).ozet;
      if (o.uretimVar) uvHerhangi = true;
      kum += o.U;
      top.T += o.T; top.U += o.U; top.mahsup += o.mahsup; top.fazla += o.fazla; top.net += o.net; top.aylik += o.aylikMahsup || 0;
      return { ay: a, o: o, kum: kum };
    });
    var kpis = UI.el('div', { class: 'kpis' });
    kpis.innerHTML =
      kart(yil + ' tüketim', fmt(top.T) + ' kWh') +
      kart(yil + ' üretim', fmt(top.U) + ' kWh') +
      (uvHerhangi ? kart('Saatlik mahsuplaşan', fmt(top.mahsup) + ' kWh', 'Öz tüketim: ' + pct(top.U ? top.mahsup / top.U : null), 'accent') : '') +
      kart('İhtiyaç fazlası', fmt(top.fazla) + ' kWh') +
      (limit ? kart('2× bedelli üretim limiti', fmt(limit) + ' kWh', 'Kullanılan: ' + pct(kum / limit) + (limitTam ? '' : ' · bazı aboneliklerde önceki yıl tüketimi girilmemiş'), kum > limit ? 'warn' : '') :
        kart('2× bedelli üretim limiti', '—', 'Aboneliklerde "Önceki Yıl Tüketimi" girilmemiş'));
    page.appendChild(kpis);

    var html = '<table class="sheet osos"><thead><tr><th class="corner">Ay</th><th>Tüketim<small>kWh</small></th><th>Üretim<small>kWh</small></th>' +
      '<th>Mahsuplaşan<small>kWh</small></th><th>İhtiyaç Fazlası<small>kWh</small></th><th>Net Çekiş<small>kWh</small></th><th>Öz Tüketim</th>' +
      '<th>Aylık Mahsup Olsaydı<small>kWh</small></th><th>Saatlik Fark<small>kWh</small></th><th>Kümülatif Üretim<small>kWh</small></th>' +
      (limit ? '<th>Limit Kullanımı</th>' : '') + '<th>Eksik Saat</th></tr></thead><tbody>' +
      rows.map(function (x) {
        var o = x.o;
        return '<tr class="' + (o.eksik ? 'eksik' : '') + '"><th class="rowh">' + U.donemLabel(x.ay) + '</th><td class="num">' + fmt(o.T) + '</td><td class="num">' + fmt(o.U) + '</td>' +
          '<td class="num">' + (o.uretimVar ? fmt(o.mahsup) : '—') + '</td><td class="num">' + fmt(o.fazla) + '</td><td class="num">' + fmt(o.net) + '</td>' +
          '<td class="num">' + pct(o.ozTuketim) + '</td><td class="num">' + (o.uretimVar ? fmt(o.aylikMahsup) : '—') + '</td><td class="num">' + (o.uretimVar ? fmt(o.kayip) : '—') + '</td>' +
          '<td class="num">' + fmt(x.kum) + '</td>' + (limit ? '<td class="num' + (x.kum > limit ? ' asim' : '') + '">' + pct(x.kum / limit) + '</td>' : '') +
          '<td class="num">' + (o.eksik || '') + '</td></tr>';
      }).join('') +
      '</tbody><tfoot><tr><th class="rowh">Toplam</th><td class="num">' + fmt(top.T) + '</td><td class="num">' + fmt(top.U) + '</td><td class="num">' + fmt(top.mahsup) + '</td>' +
      '<td class="num">' + fmt(top.fazla) + '</td><td class="num">' + fmt(top.net) + '</td><td class="num">' + pct(top.U ? top.mahsup / top.U : null) + '</td>' +
      '<td class="num">' + fmt(top.aylik) + '</td><td class="num">' + fmt(top.aylik - top.mahsup) + '</td><td class="num">' + fmt(kum) + '</td>' + (limit ? '<td class="num">' + pct(kum / limit) + '</td>' : '') + '<td></td></tr></tfoot></table>';
    var wrap = UI.el('div', { class: 'sheet-wrap osos-wrap' }, html);
    page.appendChild(wrap);
  }

  // ---------------------------------------------------------------------------------------------
  // İçe aktarma
  function secDosya(ctx) {
    var inp = UI.el('input', { type: 'file', accept: '.xlsx,.xls,.csv,.txt' });
    inp.onchange = function () { if (inp.files[0]) dosyaOku(inp.files[0]).then(function (wb) { eslestir(ctx, inp.files[0], wb); }, function (e) { UI.toast('Dosya okunamadı: ' + e.message, 'err'); }); };
    inp.click();
  }

  // { sayfalar: [{ ad, rows }] }
  function dosyaOku(file) {
    if (/\.(csv|txt)$/i.test(file.name)) {
      return file.text().then(function (txt) { return { sayfalar: [{ ad: file.name, rows: csvParse(txt) }] }; });
    }
    if (!root.XLSX) return Promise.reject(new Error('Excel okuyucu yüklenemedi.'));
    return file.arrayBuffer().then(function (buf) {
      var wb = root.XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
      return { sayfalar: wb.SheetNames.map(function (n) {
        return { ad: n, rows: root.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }) };
      }).filter(function (s) { return s.rows.length; }) };
    });
  }

  function csvParse(txt) {
    txt = txt.replace(/^﻿/, '');
    var ilk = txt.split(/\r?\n/).slice(0, 10).join('\n');
    var ayr = [';', '\t', ','].map(function (d) { return { d: d, n: ilk.split(d).length }; }).sort(function (a, b) { return b.n - a.n; })[0].d;
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < txt.length; i++) {
      var ch = txt[i];
      if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ayr) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function hucre(v) { return v === null || v === undefined ? '' : v instanceof Date ? U.formatTRDate(v.toISOString().slice(0, 10)) + (v.getHours() || v.getMinutes() ? ' ' + pad(v.getHours()) + ':' + pad(v.getMinutes()) : '') : String(v); }

  function eslestir(ctx, file, wb) {
    if (!wb.sayfalar.length) { UI.toast('Dosyada veri bulunamadı.', 'err'); return; }
    var k = kaynaklar(ctx);
    var tumAb = S.abonelikList(ctx.tt), tumUr = S.uretimList(ctx.tt);
    var st = { sayfa: 0 };
    var body = UI.el('div', { class: 'osos-import' });
    var form = UI.el('div', { class: 'form-grid' });
    body.appendChild(form);
    var onizleme = UI.el('div', { class: 'osos-preview' });
    body.appendChild(onizleme);

    // Dosyada EIC geçiyorsa hedef sayacı otomatik seç
    var metin = wb.sayfalar.map(function (s) { return s.rows.slice(0, 15).map(function (r) { return (r || []).join(' '); }).join(' '); }).join(' ').toUpperCase();
    var hedef = null;
    tumAb.concat(tumUr).forEach(function (x) { if (!hedef && x.eic && metin.indexOf(String(x.eic).toUpperCase()) >= 0) hedef = x.id; });
    if (!hedef) hedef = ctx.ab !== 'tum' ? ctx.ab : (tumAb[0] && tumAb[0].id);

    function rowsNow() { return wb.sayfalar[st.sayfa].rows; }
    var g = O.tahmin(rowsNow());
    st.map = Object.assign({ baslik: g.baslik, birim: 'kWh', carpan: 1, saatTipi: 'otomatik' }, g.cols);

    function kolonSecenek(sel, bos) {
      var rows = rowsNow(), bas = rows[st.map.baslik] || [], genislik = 0;
      rows.slice(0, 40).forEach(function (r) { if (r && r.length > genislik) genislik = r.length; });
      var o = bos ? '<option value="">— yok —</option>' : '';
      for (var i = 0; i < genislik; i++) {
        var ad = bas[i] !== undefined && bas[i] !== null && String(bas[i]).trim() ? hucre(bas[i]) : 'Sütun ' + String.fromCharCode(65 + (i % 26));
        o += '<option value="' + i + '"' + (String(sel) === String(i) ? ' selected' : '') + '>' + U.escapeHtml(ad) + '</option>';
      }
      return o;
    }

    function cizForm() {
      var hedefOpts = '<optgroup label="Tüketim sayaçları (abonelikler)">' + tumAb.map(function (a) { return '<option value="ab:' + a.id + '"' + (a.id === hedef ? ' selected' : '') + '>' + U.escapeHtml(a.ad + (a.eic ? ' · ' + a.eic : '')) + '</option>'; }).join('') + '</optgroup>' +
        (tumUr.length ? '<optgroup label="Üretim sayaçları (üretim tesisleri)">' + tumUr.map(function (u) { return '<option value="ut:' + u.id + '"' + (u.id === hedef ? ' selected' : '') + '>' + U.escapeHtml(u.ad + (u.eic ? ' · ' + u.eic : '')) + '</option>'; }).join('') + '</optgroup>' : '');
      form.innerHTML =
        '<label class="field full"><span class="field-label">Verinin ait olduğu sayaç <b class="req">*</b></span><select data-k="hedef">' + hedefOpts + '</select>' +
        '<small class="help">Tüketim sayacı → çekiş tüketim olarak; üretim sayacı → veriş üretim olarak kullanılır.</small></label>' +
        (wb.sayfalar.length > 1 ? '<label class="field"><span class="field-label">Excel sayfası</span><select data-k="sayfa">' + wb.sayfalar.map(function (s, i) { return '<option value="' + i + '"' + (i === st.sayfa ? ' selected' : '') + '>' + U.escapeHtml(s.ad) + '</option>'; }).join('') + '</select></label>' : '') +
        '<label class="field"><span class="field-label">Başlık satırı</span><input data-k="baslik" type="number" min="0" value="' + (st.map.baslik + 1) + '"><small class="help">0 = başlık yok</small></label>' +
        '<label class="field"><span class="field-label">Tarih (veya tarih-saat) sütunu <b class="req">*</b></span><select data-k="tarih">' + kolonSecenek(st.map.tarih, false) + '</select></label>' +
        '<label class="field"><span class="field-label">Saat sütunu</span><select data-k="saat">' + kolonSecenek(st.map.saat, true) + '</select><small class="help">Saat tarih sütunundaysa "yok" bırakın.</small></label>' +
        '<label class="field"><span class="field-label">Çekiş sütunu (şebekeden alınan)</span><select data-k="cekis">' + kolonSecenek(st.map.cekis, true) + '</select></label>' +
        '<label class="field"><span class="field-label">Veriş sütunu (şebekeye verilen)</span><select data-k="veris">' + kolonSecenek(st.map.veris, true) + '</select></label>' +
        '<label class="field"><span class="field-label">Birim</span><select data-k="birim"><option' + (st.map.birim === 'kWh' ? ' selected' : '') + '>kWh</option><option' + (st.map.birim === 'MWh' ? ' selected' : '') + '>MWh</option></select></label>' +
        '<label class="field"><span class="field-label">Çarpan</span><input data-k="carpan" type="text" value="' + U.formatTRNumber(st.map.carpan, 0) + '"><small class="help">Değerler çarpılmamış endeks farkıysa sayaç çarpanını girin.</small></label>' +
        '<label class="field"><span class="field-label">Saat gösterimi</span><select data-k="saatTipi">' +
        [['otomatik', 'Otomatik algıla'], ['baslangic', 'Saat başlangıcı (00:00 = 00–01)'], ['bitis', 'Saat sonu (01:00 = 00–01)']].map(function (o) { return '<option value="' + o[0] + '"' + (st.map.saatTipi === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>';
    }

    function cizOnizleme() {
      var rows = rowsNow();
      var veri = rows.slice(st.map.baslik + 1, st.map.baslik + 7);
      var sonuc = st.map.tarih === undefined || st.map.tarih === '' ? null : O.cevir(rows, st.map);
      st.sonuc = sonuc;
      var h = '<h4>Dosyadan ilk satırlar</h4><div class="table-wrap"><table class="table"><tbody>' +
        veri.map(function (r) { return '<tr>' + (r || []).map(function (c, i) {
          var rol = ['tarih', 'saat', 'cekis', 'veris'].filter(function (x) { return String(st.map[x]) === String(i); })[0];
          return '<td class="' + (rol ? 'rol-' + rol : '') + '">' + U.escapeHtml(hucre(c)) + '</td>';
        }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
      if (!sonuc || !sonuc.saatler.length) {
        h += '<p class="err-text">Seçili sütunlarla okunabilen saat bulunamadı. Tarih ve değer sütunlarını kontrol edin.</p>';
      } else {
        var ilk5 = sonuc.saatler.slice(0, 5);
        h += '<h4>Okunacak veri</h4><p><b>' + sonuc.saatler.length + ' saat</b> · ' + sonuc.ilk + ' – ' + sonuc.son +
          (sonuc.ceyrek ? ' · 15 dakikalık değerler saate toplandı' : '') + (sonuc.bitis ? ' · saat sonu gösterimi (1 saat geri alındı)' : '') +
          (sonuc.atlanan ? ' · ' + sonuc.atlanan + ' satır okunamadı' : '') + '</p>' +
          sonuc.uyarilar.map(function (u) { return '<p class="warn">' + U.escapeHtml(u) + '</p>'; }).join('') +
          '<div class="table-wrap"><table class="table"><thead><tr><th>Saat</th><th class="num">Çekiş kWh</th><th class="num">Veriş kWh</th></tr></thead><tbody>' +
          ilk5.map(function (x) { return '<tr><td>' + O.saatEtiketi(x) + '</td><td class="num">' + fmt(x.c, 3) + '</td><td class="num">' + fmt(x.v, 3) + '</td></tr>'; }).join('') + '</tbody></table></div>';
      }
      onizleme.innerHTML = h;
    }

    form.addEventListener('change', function (e) {
      var el = e.target.closest('[data-k]');
      if (!el) return;
      var key = el.dataset.k, v = el.value;
      if (key === 'hedef') { hedef = v.split(':')[1]; return; }
      if (key === 'sayfa') { st.sayfa = +v; var g2 = O.tahmin(rowsNow()); st.map = Object.assign({ baslik: g2.baslik, birim: st.map.birim, carpan: st.map.carpan, saatTipi: st.map.saatTipi }, g2.cols); cizForm(); }
      else if (key === 'baslik') { st.map.baslik = Math.max(-1, (parseInt(v, 10) || 0) - 1); cizForm(); }
      else if (key === 'carpan') st.map.carpan = U.parseTRNumber(v) || 1;
      else if (['saat', 'cekis', 'veris'].indexOf(key) >= 0) { if (v === '') delete st.map[key]; else st.map[key] = +v; }
      else if (key === 'tarih') st.map.tarih = +v;
      else st.map[key] = v;
      cizOnizleme();
    });
    cizForm();
    cizOnizleme();

    UI.openModal('OSOS Verisi Yükle — ' + file.name, body, [
      { label: 'Vazgeç', onclick: UI.closeModal },
      { label: 'İçe aktar', class: 'primary', onclick: function () {
        if (!st.sonuc || !st.sonuc.saatler.length) { UI.toast('Okunabilen saat yok.', 'err'); return; }
        var hedefSel = form.querySelector('[data-k="hedef"]').value.split(':');
        var tur = hedefSel[0] === 'ut' ? 'uretim' : 'abonelik';
        var r = O.ekle(tur, hedefSel[1], st.sonuc.saatler, { dosya: file.name, ilk: st.sonuc.ilk, son: st.sonuc.son });
        UI.closeModal();
        var ilkAy = st.sonuc.saatler[0].ay;
        prefs.ay = st.sonuc.saatler[st.sonuc.saatler.length - 1].ay || ilkAy; savePrefs();
        UI.toast(st.sonuc.saatler.length + ' saat yüklendi (' + r.yeni + ' yeni, ' + r.guncel + ' güncellendi).', 'ok');
        App.pages.veriler.rerenderPage();
      } }
    ]);
    var box = document.querySelector('.modal-box');
    if (box) box.classList.add('wide');
  }

  // ---------------------------------------------------------------------------------------------
  function sayaclar(ctx) {
    var tumAb = S.abonelikList(ctx.tt), tumUr = S.uretimList(ctx.tt);
    var list = tumAb.map(function (a) { return { id: a.id, ad: a.ad, tur: 'Tüketim (abonelik)' }; })
      .concat(tumUr.map(function (u) { return { id: u.id, ad: u.ad, tur: 'Üretim (üretim tesisi)' }; }));
    var body = UI.el('div');
    body.innerHTML = '<p class="muted">Tarayıcıda kayıtlı OSOS verisi: ' + U.formatTRNumber(O.boyut() / 1024, 0) + ' KB</p>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Sayaç</th><th>Tür</th><th>Aylar</th><th class="num">Dolu saat</th><th class="num">Çekiş kWh</th><th class="num">Veriş kWh</th><th></th></tr></thead><tbody>' +
      list.map(function (x) {
        var o = O.ozet(x.id);
        return '<tr><td><b>' + U.escapeHtml(x.ad) + '</b></td><td>' + x.tur + '</td><td>' + (o ? o.aylar.map(function (a) { return '<span class="ay-chip">' + U.donemLabel(a) + ' <button class="x" data-sil="' + x.id + '|' + a + '" title="Bu ayı sil">×</button></span>'; }).join(' ') : '<i class="muted">veri yok</i>') + '</td>' +
          '<td class="num">' + (o ? o.doluSaat + ' / ' + o.toplamSaat : '') + '</td><td class="num">' + (o ? fmt(o.cekis) : '') + '</td><td class="num">' + (o ? fmt(o.veris) : '') + '</td>' +
          '<td>' + (o ? '<button class="btn xs danger" data-sil="' + x.id + '">Tümünü sil</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    body.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sil]');
      if (!b) return;
      var p = b.dataset.sil.split('|');
      if (!confirm(p[1] ? U.donemLabel(p[1]) + ' verisi silinsin mi?' : 'Bu sayacın tüm OSOS verisi silinsin mi?')) return;
      O.sil(p[0], p[1]);
      UI.closeModal();
      sayaclar(ctx);
      App.pages.veriler.rerenderPage();
    });
    UI.openModal('OSOS Sayaçları', body, [{ label: 'Kapat', onclick: UI.closeModal }]);
    var box = document.querySelector('.modal-box');
    if (box) box.classList.add('wide');
  }

  function csvIndir(ctx) {
    var k = kaynaklar(ctx), lines = [];
    var esc = function (s) { s = String(s === null || s === undefined ? '' : s); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var n = function (v) { return typeof v === 'number' ? U.formatTRNumber(v, 3).replace(/\./g, '') : ''; };
    if (prefs.gorunum === 'aylik') {
      var yil = prefs.ay.slice(0, 4);
      lines.push(['Ay', 'Tüketim kWh', 'Üretim kWh', 'Mahsuplaşan kWh', 'İhtiyaç Fazlası kWh', 'Net Çekiş kWh', 'Aylık Mahsup Olsaydı kWh', 'Eksik Saat'].join(';'));
      O.aylar(k.abIds.concat(k.urIds)).filter(function (a) { return a.indexOf(yil) === 0; }).forEach(function (a) {
        var o = O.hesaplaAy(a, k.abIds, k.urIds).ozet;
        lines.push([a, n(o.T), n(o.U), n(o.mahsup), n(o.fazla), n(o.net), n(o.aylikMahsup), o.eksik].map(esc).join(';'));
      });
    } else {
      var s = O.hesaplaAy(prefs.ay, k.abIds, k.urIds), p = prefs.ay.split('-');
      lines.push(['Tarih', 'Saat', 'Tüketim kWh', 'Üretim kWh', 'Mahsuplaşan kWh', 'İhtiyaç Fazlası kWh', 'Net Çekiş kWh', 'Eksik'].join(';'));
      s.rows.forEach(function (r) {
        lines.push([pad(r.gun) + '.' + p[1] + '.' + p[0], pad(r.saat) + ':00', n(r.T), n(r.U), n(r.mahsup), n(r.fazla), n(r.net), r.eksik ? 'evet' : ''].map(esc).join(';'));
      });
    }
    var t = S.tuketimGet(ctx.tt);
    U.download((t ? t.ad : 'osos') + ' - OSOS ' + (prefs.gorunum === 'aylik' ? prefs.ay.slice(0, 4) : prefs.ay) + '.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }

  App.pages = App.pages || {};
  App.pages.osos = { render: render };
})(this);
