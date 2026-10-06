/* Elektrik faturası ayrıştırıcı.
   Girdi: pdf.js textContent öğelerinden üretilmiş [{str, x, y}] listesi (y yukarıdan aşağı) ve sayfa genişliği.
   Fatura iki sütunlu düzende: sol sütun tüketici/okuma bilgisi, sağ sütun bedeller.
   Etikete göre arama yapıldığı için aynı etiketleri kullanan diğer tedarikçi faturalarında da büyük ölçüde çalışır. */
(function (root) {
  'use strict';

  var U = (typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./util.js') : root.App.util;
  var num = U.parseTRNumber;
  var norm = U.normalizeLabel;

  var NUM_RE = /^-?[\d.,]+(\s*TL)?$/;
  var DATE_RE = /^\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}$/;

  function buildLines(items, x0, x1) {
    var sel = items.filter(function (it) { return it.str.trim() && it.x >= x0 && it.x < x1; })
      .sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    var lines = [];
    sel.forEach(function (it) {
      var last = lines[lines.length - 1];
      if (last && Math.abs(last.y - it.y) <= 2.5) last.items.push(it);
      else lines.push({ y: it.y, items: [it] });
    });
    lines.forEach(function (l) {
      l.items.sort(function (a, b) { return a.x - b.x; });
      l.text = l.items.map(function (i) { return i.str.trim(); }).join(' ');
    });
    return lines;
  }

  function Doc(items, width) {
    var split = width * 0.48;
    this.left = buildLines(items, -1e9, split);
    this.right = buildLines(items, split, 1e9);
    this.all = buildLines(items, -1e9, 1e9);
  }

  // Etiketle başlayan satırı bulur; etiket öğesinden sonraki değerleri döndürür.
  Doc.prototype.row = function (col, label, opts) {
    opts = opts || {};
    var lines = this[col];
    var target = norm(label);
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (opts.minY !== undefined && l.y < opts.minY) continue;
      if (opts.maxY !== undefined && l.y > opts.maxY) continue;
      var first = norm(l.items[0].str);
      if (first === target || (opts.prefix && first.indexOf(target) === 0)) {
        var vals = l.items.slice(1).map(function (it) { return it.str.trim(); })
          .filter(function (s) { return s && s !== ':'; });
        return { line: l, label: l.items[0].str.trim(), values: vals };
      }
    }
    return null;
  };

  Doc.prototype.findLine = function (col, re, opts) {
    opts = opts || {};
    var lines = this[col];
    for (var i = 0; i < lines.length; i++) {
      if (opts.minY !== undefined && lines[i].y < opts.minY) continue;
      if (opts.maxY !== undefined && lines[i].y > opts.maxY) continue;
      if (re.test(lines[i].text)) return lines[i];
    }
    return null;
  };

  function nums(values) {
    return values.filter(function (v) { return NUM_RE.test(v); }).map(num);
  }

  function parse(items, width) {
    var d = new Doc(items, width);
    var r = {};
    var meta = {};
    var warnings = [];
    var found = 0;

    function set(key, value) {
      if (value !== null && value !== undefined && value !== '') { r[key] = value; found++; }
    }
    function text(col, label, key, opts) {
      var row = d.row(col, label, opts);
      if (row && row.values.length) set(key, row.values.join(' '));
      return row;
    }

    // --- Sol üst: fatura kimliği
    text('left', 'Fatura No:', 'faturaNo');
    var ft = d.row('left', 'Fatura Tarihi:');
    if (ft) set('faturaTarihi', U.parseTRDate(ft.values[0]));
    var ettn = d.row('left', 'ETTN:');
    if (ettn) meta.ettn = ettn.values[0];

    // --- Tedarikçi: sağ sütunda adres satırına kadar olan büyük harfli satırlar
    var tuketiciBaslik = d.findLine('left', /^Tüketici Bilgisi/i);
    var ustSinir = tuketiciBaslik ? tuketiciBaslik.y : 240;
    var ted = [];
    for (var i = 0; i < d.right.length; i++) {
      var l = d.right[i];
      if (l.y >= ustSinir) break;
      if (/e-?fatura/i.test(l.text)) continue;
      if (/\d/.test(l.text) || /:/.test(l.text)) { if (ted.length) break; else continue; }
      ted.push(l.text);
    }
    if (ted.length) set('tedarikci', ted.join(' '));
    var tvkn = d.findLine('right', /^VKN:\s*\d+/, { maxY: ustSinir });
    if (tvkn) meta.tedarikciVkn = tvkn.text.replace(/\D/g, '');

    // --- Tüketici bilgisi
    if (tuketiciBaslik) {
      var adresSatiri = d.findLine('left', /^Adres:/i, { minY: tuketiciBaslik.y });
      var ad = d.left.filter(function (x) {
        return x.y > tuketiciBaslik.y && (!adresSatiri || x.y < adresSatiri.y);
      }).map(function (x) { return x.text; });
      if (ad.length) meta.musteriAdi = ad.join(' ');
      if (adresSatiri) {
        var adr = [adresSatiri.text.replace(/^Adres:\s*/i, '')];
        var sonraki = d.left[d.left.indexOf(adresSatiri) + 1];
        if (sonraki && sonraki.y - adresSatiri.y < 10 && !/:/.test(sonraki.text)) adr.push(sonraki.text);
        meta.adres = adr.join(' ');
      }
    }
    var vkn = d.row('left', 'TCKN / VKN');
    if (vkn && vkn.values.length) {
      var p = vkn.values.join(' ').split('/');
      meta.vkn = p[0].trim();
      if (p[1]) meta.vergiDairesi = p.slice(1).join('/').trim();
    }
    text('left', 'Sözleşme / Hesap No:', 'sozlesmeNo');
    text('left', 'EIC Kodu:', 'eic');
    text('left', 'Tekil Kod / Tesisat No:', 'tesisatNo');
    text('left', 'Tüketici Grubu:', 'tuketiciGrubu');
    var sinif = d.row('left', 'Tüketici Sınıfı:');
    if (sinif && sinif.values.length) meta.tuketiciSinifi = sinif.values.join(' ');

    // --- Okuma bilgisi
    var og = d.row('left', 'Okuma Günü');
    if (og) {
      var dates = og.values.filter(function (v) { return DATE_RE.test(v); });
      set('ilkOkuma', U.parseTRDate(dates[0]));
      set('sonOkuma', U.parseTRDate(dates[1]));
    }
    var okumaBaslik = d.findLine('left', /^Okuma Bilgisi/i);
    var digerBaslik = d.findLine('left', /^Diğer Bilgiler/i);
    var okumaOpts = { minY: okumaBaslik ? okumaBaslik.y : undefined, maxY: digerBaslik ? digerBaslik.y : undefined };
    [['Aktif', 'aktifIlk', 'aktifSon', 'aktifKwh'],
     ['Gündüz', 't1Ilk', 't1Son', null],
     ['Puant', 't2Ilk', 't2Son', null],
     ['Gece', 't3Ilk', 't3Son', null],
     ['Endüktif', 'endIlk', 'endSon', 'enduktifKvarh'],
     ['Kapasitif', 'kapIlk', 'kapSon', 'kapasitifKvarh']].forEach(function (def) {
      var row = d.row('left', def[0], okumaOpts);
      if (!row) return;
      var v = nums(row.values);
      set(def[1], v[0]);
      set(def[2], v[1]);
      if (def[3]) set(def[3], v[2]);
      else meta[def[1].replace('Ilk', 'OkumaKwh')] = v[2];
    });

    var carp = d.row('left', 'Çarpan/Demand/Anl.Gücü');
    if (carp && carp.values.length) {
      var cp = carp.values.join('').split('/');
      set('carpan', num(cp[0]));
      if (cp[1]) meta.demand = num(cp[1]);
      if (cp[2]) meta.anlasmaGucu = num(cp[2]);
    }
    var seri = d.row('left', 'Say.Marka/Tip/Seri No');
    if (seri && seri.values.length) meta.sayac = seri.values.join(' ');
    var trafo = d.row('left', 'Akım / Gerilim Trafo Oranı');
    if (trafo && trafo.values.join('').replace(/\//g, '')) meta.trafoOrani = trafo.values.join(' ');

    var gy = d.row('left', 'Geçmiş Yıl Tüketim');
    if (gy) set('gecmisYilKwh', nums(gy.values)[0]);
    var cy = d.row('left', 'Cari Yıl Tüketim');
    if (cy) set('cariYilKwh', nums(cy.values)[0]);

    // --- Sağ: fatura özeti (tutar / son ödeme / ort. tüketim aynı satırda)
    var ozet = d.findLine('right', /\d{1,2}-\d{1,2}-\d{4}/);
    if (ozet) {
      ozet.items.forEach(function (it) {
        var s = it.str.trim();
        if (DATE_RE.test(s)) set('sonOdemeTarihi', U.parseTRDate(s));
        else if (/TL$/.test(s)) meta.ozetTutar = num(s);
        else if (NUM_RE.test(s)) set('ortGunlukKwh', num(s));
      });
    }

    function rightRow(label, opts) { return d.row('right', label, opts); }
    function rightTotal(label, key) {
      var row = rightRow(label);
      if (row) set(key, nums(row.values)[0]);
      return row;
    }

    var tbt = rightTotal('Tüketim Bedelleri Toplamı', 'enerjiToplam');
    var skb = rightTotal('Sistem Kullanım Bedelleri Toplamı', 'skbToplam');
    var enerjiOpts = { minY: tbt ? tbt.line.y : undefined, maxY: skb ? skb.line.y : undefined };
    var tekZaman = false;
    [['Gündüz', 't1'], ['Puant', 't2'], ['Gece', 't3'], ['Tek Zaman', 't1'], ['Tek Zamanlı', 't1']].forEach(function (def) {
      var row = rightRow(def[0], enerjiOpts);
      if (!row) return;
      var v = nums(row.values);
      if (/tek/i.test(def[0])) tekZaman = true;
      set(def[1] + 'Kwh', v[0]);
      set(def[1] + 'Birim', v[1]);
      set(def[1] + 'Tutar', v[2]);
    });
    if (tekZaman) warnings.push('Tek zamanlı tarife satırı bulundu; değerler Gündüz (T1) sütununa yazıldı.');

    var skbOpts = { minY: skb ? skb.line.y : undefined };
    [['Dağıtım Bedeli', 'dagitim'], ['Güç Bedeli', 'guc']].forEach(function (def) {
      var row = rightRow(def[0], skbOpts);
      if (!row) return;
      var v = nums(row.values);
      if (v.length >= 3) { set(def[1] + 'Miktar', v[0]); set(def[1] + 'Birim', v[1]); set(def[1] + 'Tutar', v[2]); }
      else if (v.length === 1) set(def[1] + 'Tutar', v[0]);
    });
    [['Reaktif Bedeli', 'reaktifTutar'], ['Güç Aşım Bedeli', 'gucAsimTutar']].forEach(function (def) {
      var row = rightRow(def[0], skbOpts);
      if (row) { var v = nums(row.values); if (v.length) set(def[1], v[v.length - 1]); }
    });

    var dig = rightTotal('Diğer Tutarlar Toplamı', 'digerToplam');
    [['Önceki Yuvarlama', 'oncekiYuvarlama'], ['Güncel Yuvarlama', 'guncelYuvarlama'],
     ['Kesme-Bağlama', 'kesmeBaglama'], ['Tenzil Bedeli', 'tenzilBedeli'], ['Muhtelif Bedel', 'muhtelifBedel'],
     ['Enerji Fonu', 'enerjiFonu'], ['TRT Fon Payı', 'trtPayi'], ['Belediye Tüketim Vergisi', 'btv']].forEach(function (def) {
      var row = rightRow(def[0]);
      if (row) { var v = nums(row.values); if (v.length) set(def[1], v[v.length - 1]); }
    });
    rightTotal('Devlete Ödenen Vergiler Toplamı', 'vergiToplam');
    var kdvRow = rightRow('KDV', { prefix: true });
    if (kdvRow) {
      var oran = kdvRow.label.match(/(\d+(?:[.,]\d+)?)/);
      if (oran) set('kdvOrani', num(oran[1]));
      var kv = nums(kdvRow.values);
      if (kv.length) set('kdv', kv[kv.length - 1]);
    }
    var ft2 = d.row('right', 'Fatura Tutarı', { minY: dig ? dig.line.y : 0 });
    if (ft2) set('faturaTutari', nums(ft2.values)[0]);
    else if (meta.ozetTutar !== undefined) set('faturaTutari', meta.ozetTutar);

    // --- Sol alt: "anahtar:değer#" biçimli makine okunur satırlar
    var kv = {};
    d.all.forEach(function (l) {
      var m = l.text.match(/^([A-Za-zÇĞİÖŞÜçğıöşü]+)\s*:\s*(.*?)#?$/);
      if (m) kv[m[1].toLowerCase()] = m[2].trim();
    });
    if (kv.digerbedeltutar !== undefined) set('digerTutar', num(kv.digerbedeltutar));
    if (kv.digerbedelaciklama) set('digerAciklama', kv.digerbedelaciklama);
    if (kv.kdvoran && r.kdvOrani === undefined) set('kdvOrani', num(kv.kdvoran));
    if (kv['ektüketimeksiktüketim'] !== undefined) set('ekTuketimKwh', num(kv['ektüketimeksiktüketim']));
    if (kv['ektüketimeksiktüketimbirim'] !== undefined) set('ekTuketimBirim', num(kv['ektüketimeksiktüketimbirim']));
    if (kv['ektüketimeksiktüketimtl'] !== undefined) set('ekTuketimTutar', num(kv['ektüketimeksiktüketimtl']));
    if (kv.iban) meta.iban = kv.iban;

    // --- Dönem: okuma aralığının orta noktasının ayı
    if (r.ilkOkuma && r.sonOkuma) {
      var mid = new Date((Date.parse(r.ilkOkuma) + Date.parse(r.sonOkuma)) / 2);
      r.donem = mid.getUTCFullYear() + '-' + ('0' + (mid.getUTCMonth() + 1)).slice(-2);
    } else if (r.faturaTarihi) {
      r.donem = r.faturaTarihi.slice(0, 7);
    }

    // --- Uyarılar
    if (r.enduktifKvarh === 0 && r.endSon > r.endIlk) {
      warnings.push('Endüktif endeks ilerlemiş ama faturada endüktif tüketim 0 yazıyor (sınır altı olduğu için bedellendirilmemiş olabilir).');
    }
    if (r.kapasitifKvarh === 0 && r.kapSon > r.kapIlk) {
      warnings.push('Kapasitif endeks ilerlemiş ama faturada kapasitif tüketim 0 yazıyor (sınır altı olduğu için bedellendirilmemiş olabilir).');
    }
    if (r.t1Birim && r.enerjiToplam && r.aktifKwh) {
      var ef = r.enerjiToplam / r.aktifKwh;
      if (Math.abs(ef - r.t1Birim) > 0.0001) {
        warnings.push('Faturadaki birim fiyat yuvarlanmış (' + r.t1Birim + '); gerçek birim fiyat ≈ ' + ef.toFixed(6) + ' TL/kWh.');
      }
    }
    if (found < 10) warnings.push('Az sayıda alan okunabildi (' + found + '). Fatura biçimi farklı olabilir; değerleri elle kontrol edin.');

    return { record: r, meta: meta, warnings: warnings, found: found, lines: d.all.map(function (l) { return l.text; }) };
  }

  // pdf.js belgesinden konumlu metin öğeleri çıkarır (tarayıcı ve Node'da çalışır).
  function extractItems(pdfDoc) {
    var pages = [];
    var chain = Promise.resolve();
    for (var p = 1; p <= pdfDoc.numPages; p++) {
      (function (pn) {
        chain = chain.then(function () { return pdfDoc.getPage(pn); }).then(function (page) {
          var vp = page.getViewport({ scale: 1 });
          return page.getTextContent().then(function (tc) {
            pages.push({
              width: vp.width,
              items: tc.items.filter(function (it) { return it.str && it.str.trim(); }).map(function (it) {
                return { str: it.str, x: it.transform[4], y: vp.height - it.transform[5] };
              })
            });
          });
        });
      })(p);
    }
    return chain.then(function () { return pages; });
  }

  var api = { parse: parse, extractItems: extractItems };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.App = root.App || {}; root.App.faturaParser = api; }
})(this);
