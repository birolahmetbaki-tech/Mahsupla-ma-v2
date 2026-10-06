/* Elektrik faturası ayrıştırıcı.
   Girdi: pdf.js textContent öğelerinden üretilmiş [{str, x, y}] listesi (y yukarıdan aşağı) ve sayfa genişliği.
   Faturalar iki sütunlu: sol sütun tüketici/okuma bilgisi, sağ sütun bedeller. Sütun sınırı "Fatura Özeti"
   başlığının konumundan bulunur.
   Desteklenen biçimler:
     - ckenerji   : CK Enerji Ortaklığı Toptan (Fatura No, EIC Kodu, Tüketim/Sistem Kullanım Bedelleri ...)
     - ckbogazici : CK Boğaziçi Perakende (Fatura Sıra No, Etso Kodu, Enerji Bedeli-Gündüz, Ek Tüketim ...)
   Birden çok faturanın birleştirildiği PDF'ler splitInvoices() ile faturalara bölünür. */
(function (root) {
  'use strict';

  var NODE = typeof require !== 'undefined' && typeof module !== 'undefined';
  var U = NODE ? require('./util.js') : root.App.util;
  var F = NODE ? require('./fields.js') : root.App.fields;
  var K = NODE ? require('./kalemler.js') : root.App.kalemler;
  var numTR = U.parseTRNumber;
  var norm = U.normalizeLabel;

  var NUM_RE = /^-?(\d[\d.,]*|,\d+)\s*(TL)?$/;
  var DATE_RE = /^\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}$/;
  var SPACED_DATE_RE = /(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{4})/;

  // Noktası ondalık ayırıcı olan sayılar (Boğaziçi endeks/toplam alanları: "5007.490", "196254.61").
  function numDot(s) {
    if (s === null || s === undefined) return null;
    s = String(s).replace(/TL/gi, '').replace(/\s/g, '');
    if (s.indexOf(',') >= 0) return numTR(s);
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }
  function isNum(s) { return NUM_RE.test(String(s).trim()); }

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
    var ozet = items.filter(function (it) { return /^Fatura Özeti/i.test(it.str.trim()); })[0];
    this.split = ozet ? ozet.x - 4 : width * 0.48;
    this.left = buildLines(items, -1e9, this.split);
    this.right = buildLines(items, this.split, 1e9);
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
        return { line: l, index: i, label: l.items[0].str.trim(), values: vals };
      }
    }
    return null;
  };

  // Değeri etiket satırında olmayan (üst/alt satıra kaymış) alanlar için komşu satırlara da bakar.
  Doc.prototype.rowNear = function (col, label, re) {
    var row = this.row(col, label);
    if (!row) return null;
    if (row.values.length) return row.values.join(' ');
    var lines = this[col];
    for (var d = 1; d <= 2; d++) {
      [row.index - d, row.index + d].forEach(function (i) {
        if (row.found || !lines[i] || Math.abs(lines[i].y - row.line.y) > 6) return;
        var t = lines[i].text.replace(/^:\s*/, '');
        if (re.test(t)) row.found = t;
      });
    }
    return row.found || null;
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

  function nums(values, parser) {
    return values.filter(isNum).map(parser || numTR);
  }

  function detectFormat(d) {
    var txt = d.all.map(function (l) { return l.text; }).join('\n');
    if (/Fatura Sıra No|Etso Kodu|CK BOĞAZİÇİ/i.test(txt)) return 'ckbogazici';
    return 'ckenerji';
  }

  // ---------------------------------------------------------------------------------------------
  function parse(items, width) {
    var d = new Doc(items, width);
    var ctx = { d: d, r: {}, meta: {}, warnings: [], found: 0, kalemler: [] };
    ctx.set = function (key, value) {
      if (value !== null && value !== undefined && value !== '' && !(typeof value === 'number' && isNaN(value))) { ctx.r[key] = value; ctx.found++; }
    };
    var bicim = detectFormat(d);
    ctx.r.bicim = bicim;
    parseCommonHeader(ctx);
    if (bicim === 'ckbogazici') parseBogazici(ctx); else parseCKEnerji(ctx);
    finish(ctx);
    // Boğaziçi kalemleri satır satır toplandı; CK Enerji kalemleri ayrıştırılmış alanlardan, faturadaki adlarıyla kurulur
    var kalemler = bicim === 'ckbogazici' ? ctx.kalemler : K.fromLegacy(ctx.r);
    var rec = F.split(ctx.r);
    rec.kalemler = kalemler;
    var sum = K.applySummary(rec, null);
    if (sum.tanimsiz.length) ctx.warnings.push('Tanınmayan kalem: ' + sum.tanimsiz.join(', ') + ' — kategorisini seçin (şimdilik "Diğer bedeller"e eklendi).');
    return { record: rec, meta: ctx.meta, warnings: ctx.warnings, found: ctx.found, lines: d.all.map(function (l) { return l.text; }) };
  }

  function parseCommonHeader(ctx) {
    var d = ctx.d, r = ctx.r, meta = ctx.meta;
    var tuketiciBaslik = d.findLine('left', /^Tüketici Bilgisi/i);
    ctx.tuketiciY = tuketiciBaslik ? tuketiciBaslik.y : 240;

    // Tedarikçi: sağ sütunda adres satırına kadar olan büyük harfli satırlar
    var ted = [];
    for (var i = 0; i < d.right.length; i++) {
      var l = d.right[i];
      if (l.y >= ctx.tuketiciY) break;
      if (/e-?fatura/i.test(l.text)) continue;
      if (/\d/.test(l.text) || /:/.test(l.text)) { if (ted.length) break; else continue; }
      ted.push(l.text);
    }
    if (ted.length) ctx.set('tedarikci', ted.join(' '));
    var tvkn = d.findLine('right', /^VKN:\s*\d+/, { maxY: ctx.tuketiciY });
    if (tvkn) meta.tedarikciVkn = tvkn.text.replace(/\D/g, '');
    var ettn = d.row('left', 'ETTN:') || d.row('left', 'ETTN');
    if (ettn) meta.ettn = ettn.values[0];

    // Tüketici adı ve adresi
    if (tuketiciBaslik) {
      var adresSatiri = d.findLine('left', /^Adres\s*:/i, { minY: tuketiciBaslik.y });
      var ad = d.left.filter(function (x) { return x.y > tuketiciBaslik.y && (!adresSatiri || x.y < adresSatiri.y); })
        .map(function (x) { return x.text; });
      if (ad.length) meta.musteriAdi = ad.join(' ');
      if (adresSatiri) {
        var adr = [adresSatiri.text.replace(/^Adres\s*:\s*/i, '').replace(/^[.,\s]+/, '')];
        var sonraki = d.left[d.left.indexOf(adresSatiri) + 1];
        if (sonraki && sonraki.y - adresSatiri.y < 10 && !/:/.test(sonraki.text)) adr.push(sonraki.text);
        meta.adres = adr.join(' ');
      }
    }
    var vkn = d.rowNear('left', 'TCKN / VKN', /\d{10,11}/) || d.rowNear('left', 'TCKN/VKN', /\d{10,11}/);
    if (vkn) {
      var p = vkn.split('/');
      meta.vkn = p[0].replace(/[^\d]/g, '');
      if (p[1]) meta.vergiDairesi = p.slice(1).join('/').trim();
    }
  }

  // --- CK Enerji Ortaklığı biçimi ------------------------------------------------------------------
  function parseCKEnerji(ctx) {
    var d = ctx.d, r = ctx.r, meta = ctx.meta, set = ctx.set, warnings = ctx.warnings;
    function text(col, label, key) {
      var row = d.row(col, label);
      if (row && row.values.length) set(key, row.values.join(' '));
      return row;
    }

    text('left', 'Fatura No:', 'faturaNo');
    var ft = d.row('left', 'Fatura Tarihi:');
    if (ft) set('faturaTarihi', U.parseTRDate(ft.values[0]));
    text('left', 'Sözleşme / Hesap No:', 'sozlesmeNo');
    text('left', 'EIC Kodu:', 'eic');
    text('left', 'Tekil Kod / Tesisat No:', 'tesisatNo');
    text('left', 'Tüketici Grubu:', 'tuketiciGrubu');
    var sinif = d.row('left', 'Tüketici Sınıfı:');
    if (sinif && sinif.values.length) meta.tuketiciSinifi = sinif.values.join(' ');

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
     ['Gündüz', 't1Ilk', 't1Son', 't1Kwh'],
     ['Puant', 't2Ilk', 't2Son', 't2Kwh'],
     ['Gece', 't3Ilk', 't3Son', 't3Kwh'],
     ['Endüktif', 'endIlk', 'endSon', 'enduktifKvarh'],
     ['Kapasitif', 'kapIlk', 'kapSon', 'kapasitifKvarh']].forEach(function (def) {
      var row = d.row('left', def[0], okumaOpts);
      if (!row) return;
      var v = nums(row.values);
      set(def[1], v[0]);
      set(def[2], v[1]);
      set(def[3], v[2]);
    });

    parseCarpan(ctx, d.row('left', 'Çarpan/Demand/Anl.Gücü'), numTR);
    var seri = d.row('left', 'Say.Marka/Tip/Seri No');
    if (seri && seri.values.length) meta.sayac = seri.values.join(' ');

    var gy = d.row('left', 'Geçmiş Yıl Tüketim');
    if (gy) set('gecmisYilKwh', nums(gy.values)[0]);
    var cy = d.row('left', 'Cari Yıl Tüketim');
    if (cy) set('cariYilKwh', nums(cy.values)[0]);

    // Fatura özeti satırı: tutar / son ödeme / ort. tüketim
    var ozet = d.findLine('right', SPACED_DATE_RE, { maxY: (d.findLine('right', /^Tüketim Bedelleri Toplamı/i) || { y: 1e9 }).y });
    if (ozet) {
      ozet.items.forEach(function (it) {
        var s = it.str.trim();
        if (DATE_RE.test(s)) set('sonOdemeTarihi', U.parseTRDate(s));
        else if (/TL$/.test(s)) meta.ozetTutar = numTR(s);
        else if (isNum(s)) set('ortGunlukKwh', numTR(s));
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
    [['Gündüz', 't1'], ['Puant', 't2'], ['Gece', 't3'], ['Tek Zaman', 'tek'], ['Tek Zamanlı', 'tek']].forEach(function (def) {
      var row = rightRow(def[0], enerjiOpts);
      if (!row) return;
      var v = nums(row.values);
      set(def[1] === 'tek' ? 'tekKwh' : def[1] + 'FatKwh', v[0]);
      set(def[1] + 'Birim', v[1]);
      set(def[1] + 'Tutar', v[2]);
    });

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
      if (oran) set('kdvOrani', numTR(oran[1]));
      var kv = nums(kdvRow.values);
      if (kv.length) set('kdv', kv[kv.length - 1]);
    }
    var ft2 = d.row('right', 'Fatura Tutarı', { minY: dig ? dig.line.y : 0 });
    if (ft2) set('faturaTutari', nums(ft2.values)[0]);
    else if (meta.ozetTutar !== undefined) set('faturaTutari', meta.ozetTutar);

    // Sol alt: "anahtar:değer#" biçimli makine okunur satırlar
    var kvs = {};
    d.all.forEach(function (l) {
      var m = l.text.match(/^([A-Za-zÇĞİÖŞÜçğıöşü]+)\s*:\s*(.*?)#?$/);
      if (m) kvs[m[1].toLowerCase()] = m[2].trim();
    });
    var bilgiCK = d.findLine('right', /^Bilgilendirme$/i);
    if (bilgiCK) {
      var nt = d.right.filter(function (l) { return l.y > bilgiCK.y && l.y < bilgiCK.y + 40 && !/^Sayın Müşterimiz/i.test(l.text); }).map(function (l) { return l.text; });
      if (nt.length) set('bilgilendirme', nt.join(' '));
    }
    if (kvs.digerbedeltutar !== undefined) set('digerTutar', numTR(kvs.digerbedeltutar));
    if (kvs.digerbedelaciklama) set('digerAciklama', kvs.digerbedelaciklama);
    if (kvs.kdvoran && r.kdvOrani === undefined) set('kdvOrani', numTR(kvs.kdvoran));
    var ekKwh = numTR(kvs['ektüketimeksiktüketim']), ekTl = numTR(kvs['ektüketimeksiktüketimtl']);
    if (ekKwh || ekTl) {
      set('ekTekKwh', ekKwh);
      set('ekTekBirim', numTR(kvs['ektüketimeksiktüketimbirim']));
      set('ekTekTutar', ekTl);
    }
    if (kvs.iban) meta.iban = kvs.iban;

    if (r.ilkOkuma && r.sonOkuma) {
      set('gunSayisi', U.daysBetween(r.ilkOkuma, r.sonOkuma)); // CK Enerji: okuma günleri dahil (01.09–30.09 = 30)
      var mid = new Date((Date.parse(r.ilkOkuma) + Date.parse(r.sonOkuma)) / 2);
      r.donem = mid.getUTCFullYear() + '-' + ('0' + (mid.getUTCMonth() + 1)).slice(-2);
    } else if (r.faturaTarihi) {
      r.donem = r.faturaTarihi.slice(0, 7);
    }

    if (r.t1Birim && r.enerjiToplam && r.aktifKwh && !r.ekTekKwh) {
      var ef = r.enerjiToplam / r.aktifKwh;
      if (Math.abs(ef - r.t1Birim) > 0.0001 && Math.abs(ef - r.t1Birim) < 0.01) {
        warnings.push('Faturadaki birim fiyat yuvarlanmış (' + r.t1Birim + '); gerçek birim fiyat ≈ ' + ef.toFixed(6) + ' TL/kWh.');
      }
    }
  }

  // --- CK Boğaziçi biçimi ------------------------------------------------------------------------
  function parseBogazici(ctx) {
    var d = ctx.d, r = ctx.r, meta = ctx.meta, set = ctx.set, warnings = ctx.warnings;
    function text(label, key) {
      var row = d.row('left', label);
      if (row && row.values.length) set(key, row.values.join(' '));
      return row;
    }

    text('Fatura Sıra No', 'faturaNo');
    var fd = d.row('left', 'Fatura Dönemi');
    if (fd) {
      var s = fd.values.join(' ');
      var m = s.match(SPACED_DATE_RE);
      if (m) set('faturaTarihi', m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2));
      var dm = s.match(/\/\s*(\d{1,2})\s*-\s*(\d{4})\s*$/);
      if (dm) r.donem = dm[2] + '-' + ('0' + dm[1]).slice(-2);
    }
    text('Sözleşme Hesap No', 'sozlesmeNo');
    text('Etso Kodu', 'eic');
    text('Tekil Kod/Tesisat No', 'tesisatNo');
    text('Tüketici Grubu', 'tuketiciGrubu');
    var sinif = d.row('left', 'Tüketici Sınıfı');
    if (sinif && sinif.values.length) meta.tuketiciSinifi = sinif.values.join(' ');

    // Okuma bilgisi (endeks ve farklar noktalı ondalık)
    var og = d.row('left', 'Okuma Günü');
    if (og) {
      var dates = og.values.filter(function (v) { return DATE_RE.test(v); });
      set('ilkOkuma', U.parseTRDate(dates[0]));
      set('sonOkuma', U.parseTRDate(dates[1]));
      var gunTok = og.values.filter(function (v) { return /^\d{1,3}$/.test(v); });
      if (gunTok.length) set('gunSayisi', parseInt(gunTok[0], 10));
    }
    var okumaBaslik = d.findLine('left', /^Okuma Bilgisi/i);
    var digerBaslik = d.findLine('left', /^Diğer Bilgiler/i);
    var okumaOpts = { minY: okumaBaslik ? okumaBaslik.y : undefined, maxY: digerBaslik ? digerBaslik.y : undefined };
    [['Tek Zamanlı', 'aktifIlk', 'aktifSon', 'aktifKwh'],
     ['Gündüz', 't1Ilk', 't1Son', 't1Kwh'],
     ['Puant', 't2Ilk', 't2Son', 't2Kwh'],
     ['Gece', 't3Ilk', 't3Son', 't3Kwh'],
     ['Endüktif', 'endIlk', 'endSon', 'enduktifKvarh'],
     ['Kapasitif', 'kapIlk', 'kapSon', 'kapasitifKvarh']].forEach(function (def) {
      var row = d.row('left', def[0], okumaOpts);
      if (!row) return;
      var v = nums(row.values, numDot);
      set(def[1], v[0]);
      set(def[2], v[1]);
      set(def[3], v[2]);
    });

    parseCarpan(ctx, d.row('left', 'Çarpan/Demand/Anl.Gücü'), numDot);
    var seri = d.row('left', 'Say.Marka/Tip/Seri No');
    if (seri && seri.values.length) meta.sayac = seri.values.join(' ');

    // Yıllık tüketim tablosu: "2024  19248725.76  52592.147"
    var yillar = {};
    d.left.forEach(function (l) {
      if (/^(19|20)\d{2}$/.test(l.items[0].str.trim()) && l.items.length >= 2) {
        yillar[l.items[0].str.trim()] = numDot(l.items[1].str);
      }
    });
    meta.yillikTuketim = yillar;
    var cariYil = (r.donem || r.faturaTarihi || '').slice(0, 4);
    if (cariYil && yillar[cariYil] !== undefined) set('cariYilKwh', yillar[cariYil]);
    if (cariYil && yillar[String(+cariYil - 1)] !== undefined) set('gecmisYilKwh', yillar[String(+cariYil - 1)]);

    // Fatura özeti: ödenecek tutar / son ödeme / ort. tüketim (tarih boşluklu: "11 - 04 - 2025")
    var ozetBaslik = d.findLine('right', /^Fatura Özeti/i);
    var detayBaslik = d.findLine('right', /^Fatura Detayı/i);
    var ozet = d.findLine('right', SPACED_DATE_RE, { minY: ozetBaslik ? ozetBaslik.y : 0, maxY: detayBaslik ? detayBaslik.y : 1e9 });
    if (ozet) {
      var dm2 = ozet.text.match(SPACED_DATE_RE);
      if (dm2) set('sonOdemeTarihi', dm2[3] + '-' + ('0' + dm2[2]).slice(-2) + '-' + ('0' + dm2[1]).slice(-2));
      var parts = ozet.text.replace(SPACED_DATE_RE, '|').split('|');
      var tutarTok = (parts[0] || '').trim().split(/\s+/).filter(isNum);
      if (tutarTok.length) set('odenecekTutar', numTR(tutarTok[tutarTok.length - 1]));
      var ortTok = (parts[1] || '').trim().split(/\s+/).filter(isNum);
      if (ortTok.length) set('ortGunlukKwh', numDot(ortTok[0]));
    }

    // Fatura detayı: kalemleri mantıksal satırlara topla (sarılmış etiketleri birleştir)
    var startY = detayBaslik ? detayBaslik.y : ctx.tuketiciY;
    var kalemler = [];
    d.right.forEach(function (l) {
      if (l.y <= startY) return;
      if (/^Tüketim\s*\(kWh\)/i.test(l.text)) return;
      var labelParts = [], numParts = [];
      l.items.forEach(function (it) {
        var s = it.str.trim();
        if (!numParts.length && !isNum(s)) labelParts.push(s);
        else numParts.push(s);
      });
      var label = labelParts.join(' ');
      var prev = kalemler[kalemler.length - 1];
      var near = prev && l.y - prev.y < 9;
      if (label && !numParts.length) {
        if (near && prev.nums.length && (prev.label.split('(').length > prev.label.split(')').length)) { prev.label += ' ' + label; prev.y = l.y; return; }
        kalemler.push({ label: label, nums: [], y: l.y });
      } else if (!label && numParts.length) {
        if (near && !prev.nums.length) { prev.nums = numParts; prev.y = l.y; }
        else kalemler.push({ label: '', nums: numParts, y: l.y });
      } else if (label) {
        kalemler.push({ label: label, nums: numParts, y: l.y });
      }
    });

    var enerjiSatirlari = [], digerSatirlari = [], toplamEnerjiYazili = null;
    function kalem(ad, miktar, miktarBirimi, birim, tutar) {
      ctx.kalemler.push({ ad: ad, miktar: miktar, miktarBirimi: miktar === null ? null : miktarBirimi, birim: birim, tutar: tutar });
    }
    var digerToplam = 0, digerVar = false;
    kalemler.forEach(function (k) {
      var lab = k.label;
      var n = k.nums;
      if (/^Enerji Bedeli/i.test(lab)) {
        var zone = /Gündüz/i.test(lab) ? 't1' : /Puant/i.test(lab) ? 't2' : /Gece/i.test(lab) ? 't3' : 'tek';
        var ek = /Ek\s*Tüketim|Eksik/i.test(lab);
        var kwh = n.length >= 3 ? numTR(n[0]) : null, birim = n.length >= 3 ? numTR(n[1]) : null, tutar = n.length ? numTR(n[n.length - 1]) : null;
        enerjiSatirlari.push({ zone: zone, ek: ek, kwh: kwh, birim: birim, tutar: tutar, aciklama: lab });
        kalem(lab, kwh, 'kWh', birim, tutar);
      } else if (/^Toplam Enerji Bedeli/i.test(lab)) {
        if (n.length) toplamEnerjiYazili = numDot(n[0]);
      } else if (/^Dağıtım Bedeli/i.test(lab)) {
        if (n.length) set('dagitimTutar', numTR(n[n.length - 1]));
        if (n.length >= 3) { set('dagitimMiktar', numTR(n[0]) / 1000); set('dagitimBirim', numTR(n[1]) * 1000); }
        if (n.length) kalem(lab, n.length >= 3 ? numTR(n[0]) : null, 'kWh', n.length >= 3 ? numTR(n[1]) : null, numTR(n[n.length - 1]));
      } else if (/^Güncel Yuvarlama/i.test(lab)) {
        if (n.length) { set('guncelYuvarlama', numDot(n[0])); kalem(lab, null, null, null, numDot(n[0])); }
      } else if (/^Önceki Yuvarlama/i.test(lab)) {
        if (n.length) { set('oncekiYuvarlama', numDot(n[0])); kalem(lab, null, null, null, numDot(n[0])); }
      } else if (/^Vergi ve Fonlar/i.test(lab)) {
        if (n.length) set('vergiToplam', numDot(n[0]));
      } else if (/^Elekt\.?\s*Ver|Tük\.?\s*Ver|Belediye Tüketim/i.test(lab)) {
        if (n.length) { set('btv', numTR(n[n.length - 1])); kalem(lab, null, null, null, numTR(n[n.length - 1])); }
      } else if (/^Enerji Fonu/i.test(lab)) {
        if (n.length) { set('enerjiFonu', numTR(n[n.length - 1])); kalem(lab, null, null, null, numTR(n[n.length - 1])); }
      } else if (/^TRT/i.test(lab)) {
        if (n.length) { set('trtPayi', numTR(n[n.length - 1])); kalem(lab, null, null, null, numTR(n[n.length - 1])); }
      } else if (/^KDV/i.test(lab)) {
        var mm = lab.match(/Matrah\s*([-\d.,]+)/i);
        if (mm) set('kdvMatrah', numTR(mm[1]));
        if (n.length) { set('kdv', numTR(n[n.length - 1])); kalem(lab, null, null, null, numTR(n[n.length - 1])); }
      } else if (/^Fatura Tutarı/i.test(lab)) {
        if (n.length) set('faturaTutari', numTR(n[0]));
      } else if (n.length && lab && kalemler.indexOf(k) >= 0 && k.y < (d.findLine('right', /^Fatura Tutarı/i) || { y: 1e9 }).y) {
        digerSatirlari.push(lab + ': ' + n[n.length - 1]);
        kalem(lab, n.length >= 3 ? numTR(n[0]) : null, n.length >= 3 ? 'kWh' : null, n.length >= 3 ? numTR(n[1]) : null, numTR(n[n.length - 1]));
        digerToplam += numTR(n[n.length - 1]) || 0;
        digerVar = true;
      }
    });

    // Enerji satırlarını alanlara dağıt
    var enerjiToplam = 0, enerjiVar = false;
    enerjiSatirlari.forEach(function (e) {
      if (e.tutar !== null) { enerjiToplam += e.tutar; enerjiVar = true; }
      if (!e.ek && e.zone !== 'tek') {
        // Üç zamanlı satırlar: kWh okumadan gelir; birim ve tutar faturadan
        set(e.zone + 'Birim', e.birim);
        if (e.tutar !== null) r[e.zone + 'Tutar'] = Math.round(((r[e.zone + 'Tutar'] || 0) + e.tutar) * 100) / 100;
        if (e.kwh !== null) r[e.zone + 'FatKwh'] = Math.round(((r[e.zone + 'FatKwh'] || 0) + e.kwh) * 1000) / 1000;
        ctx.found++;
        return;
      }
      var p = e.ek ? 'ek' + (e.zone === 'tek' ? 'Tek' : e.zone.toUpperCase()) : 'tek';
      r[p + 'Kwh'] = (r[p + 'Kwh'] || 0) + (e.kwh || 0);
      r[p + 'Tutar'] = (r[p + 'Tutar'] || 0) + (e.tutar || 0);
      if (e.birim) r[p + 'Birim'] = e.birim;
      ctx.found++;
    });
    if (enerjiVar) set('enerjiToplam', Math.round(enerjiToplam * 100) / 100);
    if (toplamEnerjiYazili !== null && enerjiVar && Math.abs(toplamEnerjiYazili - enerjiToplam) > 0.05) {
      warnings.push('Faturadaki "Toplam Enerji Bedeli" (' + U.formatTRNumber(toplamEnerjiYazili) + ') kalemlerin toplamıyla (' + U.formatTRNumber(enerjiToplam) + ') uyuşmuyor.');
    }
    if (toplamEnerjiYazili === null && enerjiVar) warnings.push('"Toplam Enerji Bedeli" faturada boş; kalemlerin toplamı kullanıldı.');
    if (r.dagitimTutar !== undefined) set('skbToplam', r.dagitimTutar);
    if (digerVar) { set('digerToplam', Math.round(digerToplam * 100) / 100); set('digerAciklama', digerSatirlari.join('; ')); }
    // Boğaziçi: Fatura Tutarı = KDV matrahı + KDV + önceki yuvarlama ; Ödenecek = Fatura Tutarı + güncel yuvarlama
    if (r.oncekiYuvarlama !== undefined) set('kdvDisiTutar', r.oncekiYuvarlama);
    if (r.kdv && r.kdvMatrah) set('kdvOrani', Math.round(r.kdv / r.kdvMatrah * 100));
    meta.enerjiKalemleri = enerjiSatirlari;
    var bilgi = d.findLine('right', /^Önemli Bilgilendirme/i);
    var bilgiSon = d.findLine('all', /^Fatura ve Ödeme/i);
    if (bilgi) {
      var notlar = d.right.filter(function (l) { return l.y > bilgi.y && (!bilgiSon || l.y < bilgiSon.y); }).map(function (l) { return l.text; });
      if (notlar.length) set('bilgilendirme', notlar.join(' ').replace(/\s+/g, ' '));
    }
    var fat = ['t1FatKwh', 't2FatKwh', 't3FatKwh', 'tekKwh'].reduce(function (a, k) { return a + (r[k] || 0); }, 0);
    if (fat && r.aktifKwh && Math.abs(fat - r.aktifKwh) > 1) {
      warnings.push('Faturalanan enerji (' + U.formatTRNumber(fat, 3) + ' kWh) okunan aktif tüketimden (' + U.formatTRNumber(r.aktifKwh, 3) +
        ' kWh) farklı' + (/sayaç değişikliği/i.test(r.bilgilendirme || '') ? ' — faturada sayaç değişikliği notu var.' : '.'));
    }

    if (!r.donem && r.ilkOkuma && r.sonOkuma) {
      var mid = new Date((Date.parse(r.ilkOkuma) + Date.parse(r.sonOkuma)) / 2);
      r.donem = mid.getUTCFullYear() + '-' + ('0' + (mid.getUTCMonth() + 1)).slice(-2);
    }
    if (r.gunSayisi > 35) warnings.push('Fatura ' + r.gunSayisi + ' günlük okuma aralığını kapsıyor (birden fazla ay).');
  }

  function parseCarpan(ctx, row, parser) {
    if (!row || !row.values.length) return;
    var cp = row.values.join('').split('/').map(function (s) { return s.trim(); });
    ctx.set('carpan', parser(cp[0]));
    if (cp.length >= 3) {
      if (cp[1]) ctx.set('demand', parser(cp[1]));
      if (cp[2]) ctx.set('anlasmaGucu', parser(cp[2]));
    } else if (cp.length === 2 && cp[1]) {
      var v = parser(cp[1]);
      if (v !== null && v >= 10) ctx.set('anlasmaGucu', v); else ctx.set('demand', v);
    }
  }

  function finish(ctx) {
    var r = ctx.r, warnings = ctx.warnings;
    if (r.enduktifKvarh === 0 && r.endSon > r.endIlk) {
      warnings.push('Endüktif endeks ilerlemiş ama faturada endüktif tüketim 0 yazıyor (sınır altı olduğu için bedellendirilmemiş olabilir).');
    }
    if (r.kapasitifKvarh === 0 && r.kapSon > r.kapIlk) {
      warnings.push('Kapasitif endeks ilerlemiş ama faturada kapasitif tüketim 0 yazıyor (sınır altı olduğu için bedellendirilmemiş olabilir).');
    }
    var ek = ['ekT1Kwh', 'ekT2Kwh', 'ekT3Kwh', 'ekTekKwh'].reduce(function (a, k) { return a + (r[k] || 0); }, 0);
    if (ek) warnings.push('GES mahsubu / ek tüketim satırı var: ' + U.formatTRNumber(ek, 3) + ' kWh.');
    if (ctx.found < 10) warnings.push('Az sayıda alan okunabildi (' + ctx.found + '). Fatura biçimi farklı olabilir; değerleri elle kontrol edin.');
  }

  // ---------------------------------------------------------------------------------------------
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
              page: pn,
              width: vp.width,
              height: vp.height,
              items: tc.items.filter(function (it) { return it.str && it.str.trim(); }).map(function (it) {
                // w/h: fatura penceresinde değerlerin üzerine kutu çizmek için
                return { str: it.str, x: it.transform[4], y: vp.height - it.transform[5], w: it.width || 0, h: it.height || Math.abs(it.transform[3]) || 8 };
              })
            });
          });
        });
      })(p);
    }
    return chain.then(function () { return pages; });
  }

  // Birleştirilmiş PDF'i faturalara böler: "Fatura No" / "Fatura Sıra No" içeren sayfa yeni bir fatura başlatır,
  // içermeyen sayfalar (ödeme kanalları vb.) önceki faturanın devamı sayılır.
  function splitInvoices(pages) {
    var out = [];
    pages.forEach(function (pg) {
      var starts = pg.items.some(function (it) { return /^Fatura (Sıra )?No\b/i.test(it.str.trim()); });
      if (starts || !out.length) out.push({ pageFrom: pg.page, pageTo: pg.page, items: pg.items, width: pg.width, height: pg.height });
      else out[out.length - 1].pageTo = pg.page;
    });
    return out;
  }

  var api = { parse: parse, extractItems: extractItems, splitInvoices: splitInvoices, numDot: numDot };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.App = root.App || {}; root.App.faturaParser = api; }
})(this);
