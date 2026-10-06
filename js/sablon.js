/* Fatura şablonları: bir fatura biçiminde hangi değerin nerede durduğunu ve ne anlama geldiğini tanımlar.
   Yalnız şablonda tanımlı değerler içeri aktarılır; tanımsız bedel satırları ayrıca listelenir.

   Şablon: { id, ad, anahtarlar: [faturada geçen tanıma metinleri], tanimlar: [...] }
   Tanım türleri:
     alan  : standart fatura alanı  { hedef, kolon, etiket, deger: 'sayi'|'tarih'|'donem'|'metin', sira, sayiBicimi: 'tr'|'nokta' }
     kalem : bedel satırı           { kolon, etiket, ad, kategori, miktarBirimi }  (etiketi eşleşen her satır bir kalem olur)
     detay : ek bilgi               { ad, kolon, etiket, deger, sira, sayiBicimi }
     sabit : sabit değer            { hedef, sabit }
     kural : hesaplanan alan        { hedef, kural: 'okumaOrtasi'|'faturaTarihi'|'okumaDahil'|'okumaFarki' }
     yoksay: bilinçli olarak alınmayan satır { kolon, etiket }
   Satırlar etiketlerinden (satırın başındaki metin) bulunur; böylece satır sayısı değişse de değerler doğru yerden okunur. */
(function (root) {
  'use strict';
  var NODE = typeof require !== 'undefined' && typeof module !== 'undefined';
  var U = NODE ? require('./util.js') : root.App.util;
  var F = NODE ? require('./fields.js') : root.App.fields;
  var K = NODE ? require('./kalemler.js') : root.App.kalemler;

  var NUM_RE = /^-?(\d[\d.,]*|,\d+)\s*(TL)?$/;
  var PARA_RE = /^-?\d{1,3}(\.\d{3})*,\d{2}\s*(TL)?$|^-?\d+,\d{2}\s*(TL)?$/;
  var TARIH_RE = /(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{4})/g;

  function norm(s) { return K.norm(s); }

  // Sayı: virgül varsa Türkçe biçim; yoksa biçime göre (nokta = ondalık)
  function sayi(tok, bicim) {
    if (tok === null || tok === undefined) return null;
    var s = String(tok).replace(/TL/gi, '').replace(/\s/g, '');
    if (s.indexOf(',') >= 0 || bicim === 'tr') return U.parseTRNumber(s);
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }
  // Sayı biçimi tahmini: değerin kendisine, belirsizse aynı satırdaki diğer sayılara bakılır
  function bicimTahmin(tok, satir) {
    var s = String(tok).trim();
    if (s.indexOf(',') >= 0) return 'tr';
    if (s.indexOf('.') < 0) return 'tr';
    if (!/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) return 'nokta'; // 0.376, 5007.490, 1.35 → ondalık nokta
    if (satir) {
      var digerleri = satir.degerler.map(function (o) { return String(o.str).trim(); }).filter(function (x) { return x !== s && /\d/.test(x); });
      if (digerleri.some(function (x) { return x.indexOf(',') >= 0; })) return 'tr';
      // Satırda binlik biçimine uymayan noktalı sayı varsa (77205.480, 15180.00) satır ondalık nokta kullanıyor
      if (digerleri.some(function (x) { return x.indexOf('.') >= 0 && !/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(x.replace(/[^\d.\-]/g, '')); })) return 'nokta';
    }
    return 'tr';
  }

  /* Mantıksal satırlar: sütunlara ayrılmış, etiket + değer öğelerine bölünmüş, sarılmış etiketleri birleştirilmiş satırlar.
     Her satır: { id, kolon, y, etiket, etiketNorm, degerler: [öğe], ogeler: [öğe], metin } ; öğe: { str, x, y, w, h, i } */
  function satirlar(items, width) {
    var ozet = items.filter(function (it) { return /^Fatura Özeti/i.test(String(it.str).trim()); })[0];
    var split = ozet ? ozet.x - 4 : width * 0.48;
    var out = [];
    ['left', 'right'].forEach(function (kolon) {
      var sel = items.map(function (it, i) { return Object.assign({ i: i }, it); })
        .filter(function (it) { return String(it.str).trim() && (kolon === 'left' ? it.x < split : it.x >= split); })
        .sort(function (a, b) { return a.y - b.y || a.x - b.x; });
      var lines = [];
      sel.forEach(function (it) {
        var last = lines[lines.length - 1];
        if (last && Math.abs(last.y - it.y) <= 2.5) last.ogeler.push(it); else lines.push({ y: it.y, ogeler: [it] });
      });
      var mant = [];
      lines.forEach(function (l) {
        l.ogeler.sort(function (a, b) { return a.x - b.x; });
        bol(l);
        var prev = mant[mant.length - 1];
        var yakin = prev && l.y - prev.y < 9.5;
        // Yalnız değer içeren satır, hemen üstteki yalnız etiketli satıra eklenir
        if (yakin && !l.etiket && l.degerler.length && prev.etiket && !prev.degerler.length) {
          prev.degerler = l.degerler; prev.ogeler = prev.ogeler.concat(l.ogeler); prev.y2 = l.y; return;
        }
        // Parantezi kapanmamış etiketin devamı ("Enerji Bedeli-Gündüz(Ek" + "Tüketim)")
        if (yakin && l.etiket && !l.degerler.length && prev.degerler.length && prev.etiket.split('(').length > prev.etiket.split(')').length) {
          prev.etiket += ' ' + l.etiket; prev.ogeler = prev.ogeler.concat(l.ogeler); return;
        }
        l.kolon = kolon;
        mant.push(l);
      });
      mant.forEach(function (l) {
        l.etiketNorm = norm(l.etiket);
        l.metin = l.ogeler.map(function (o) { return String(o.str).trim(); }).join(' ');
        l.degerMetni = l.degerler.map(function (o) { return String(o.str).trim(); }).join(' ');
        l.id = kolon[0] + Math.round(l.y * 10);
        out.push(l);
      });
    });
    return out;
  }

  // Satırı etiket ve değer öğelerine böler. "Etiket : değer" ve "VKN:123" biçimleri desteklenir.
  function bol(l) {
    var ogeler = [];
    l.ogeler.forEach(function (o) {
      var s = String(o.str).trim();
      var m = s.match(/^([^:\d]{2,}?)\s*:\s*(\S.*)$/);
      if (m && !/^https?/i.test(s)) {
        var oran = m[1].length / s.length;
        ogeler.push(Object.assign({}, o, { str: m[1] + ':', w: o.w * oran }));
        ogeler.push(Object.assign({}, o, { str: m[2], x: o.x + o.w * oran, w: o.w * (1 - oran) }));
      } else ogeler.push(o);
    });
    l.ogeler = ogeler;
    var ikiNokta = -1;
    ogeler.forEach(function (o, i) { var s = String(o.str).trim(); if (ikiNokta < 0 && (s === ':' || /:$/.test(s))) ikiNokta = i; });
    var etiket = [], deger = [];
    if (ikiNokta >= 0) {
      ogeler.forEach(function (o, i) { var s = String(o.str).trim(); if (i <= ikiNokta) { if (s !== ':') etiket.push(s.replace(/\s*:$/, '')); } else if (s !== ':') deger.push(o); });
    } else {
      ogeler.forEach(function (o) {
        var s = String(o.str).trim();
        if (!deger.length && !NUM_RE.test(s) && !/^\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}$/.test(s)) etiket.push(s); else deger.push(o);
      });
    }
    l.etiket = etiket.join(' ').trim();
    l.degerler = deger;
  }

  // Satırdaki değer listeleri (sıra numarasıyla seçilebilir)
  function sayiOgeleri(l) { return l.degerler.filter(function (o) { return NUM_RE.test(String(o.str).trim()); }); }
  function tarihler(l) {
    var s = l.degerMetni || '', m, out = [];
    TARIH_RE.lastIndex = 0;
    while ((m = TARIH_RE.exec(s))) out.push(m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2));
    return out;
  }
  function donemler(l) {
    var s = (l.degerMetni || '').replace(TARIH_RE, ' '), m, out = [], re = /(\d{1,2})\s*-\s*(\d{4})/g;
    while ((m = re.exec(s))) out.push(m[2] + '-' + ('0' + m[1]).slice(-2));
    return out;
  }

  // Tanımın satırdan okuduğu değer ve kullandığı öğeler
  function degerOku(l, t) {
    if (t.deger === 'sayi') {
      var ns = sayiOgeleri(l), o = ns[t.sira || 0];
      return o ? { deger: sayi(o.str, t.sayiBicimi), ogeler: [o] } : null;
    }
    if (t.deger === 'tarih') { var ts = tarihler(l); return ts[t.sira || 0] ? { deger: ts[t.sira || 0], ogeler: l.degerler } : null; }
    if (t.deger === 'donem') { var ds = donemler(l); return ds[t.sira || 0] ? { deger: ds[t.sira || 0], ogeler: l.degerler } : null; }
    var metin = t.sira !== undefined && t.sira !== null && l.degerler[t.sira] ? String(l.degerler[t.sira].str).trim() : l.degerMetni;
    return metin ? { deger: metin.replace(/#$/, ''), ogeler: t.sira !== undefined && t.sira !== null && l.degerler[t.sira] ? [l.degerler[t.sira]] : l.degerler } : null;
  }

  function satirBul(lines, t) {
    return lines.filter(function (l) { return (!t.kolon || l.kolon === t.kolon) && l.etiketNorm === t.etiket; });
  }

  /* Şablonu faturaya uygular.
     Dönüş: { record, bulunan: [{ tanim, deger, ogeler, satir }], eksik: [tanim], tanimsiz: [satır], yoksayilan: [satır], lines } */
  function uygula(items, width, sablon, userMap) {
    var lines = satirlar(items, width);
    var raw = { bicim: sablon.id }, detay = {}, kalemler = [], bulunan = [], eksik = [];
    var kullanilan = {};
    (sablon.tanimlar || []).forEach(function (t) {
      if (t.tur === 'sabit') { raw[t.hedef] = t.sabit; return; }
      if (t.tur === 'kural') return;
      var ls = satirBul(lines, t);
      if (t.tur === 'yoksay') { ls.forEach(function (l) { kullanilan[l.id] = 'yoksay'; }); return; }
      if (t.tur === 'kalem') {
        ls.forEach(function (l) {
          var ns = sayiOgeleri(l).map(function (o) { return sayi(o.str); });
          if (!ns.length) return;
          var k = { ad: t.ad || l.etiket, miktar: ns.length >= 3 ? ns[0] : null, miktarBirimi: ns.length >= 3 ? (t.miktarBirimi || 'kWh') : null,
            birim: ns.length >= 3 ? ns[1] : null, tutar: ns[ns.length - 1] };
          kalemler.push(k);
          kullanilan[l.id] = 'kalem';
          bulunan.push({ tanim: t, deger: k.tutar, ogeler: sayiOgeleri(l), satir: l, kalem: k });
        });
        return;
      }
      var hit = null, satir = null;
      for (var i = 0; i < ls.length && !hit; i++) { hit = degerOku(ls[i], t); satir = ls[i]; }
      if (!hit || hit.deger === null || hit.deger === '') { if (t.tur === 'alan') eksik.push(t); return; }
      if (!kullanilan[satir.id]) kullanilan[satir.id] = t.tur;
      bulunan.push({ tanim: t, deger: hit.deger, ogeler: hit.ogeler, satir: satir });
      if (t.tur === 'alan') raw[t.hedef] = hit.deger; else detay[t.ad] = hit.deger;
    });
    // Kurallar (dönem, gün sayısı vb. faturada yazmıyorsa)
    (sablon.tanimlar || []).filter(function (t) { return t.tur === 'kural'; }).forEach(function (t) {
      var v = kural(t.kural, raw);
      if (v !== null && v !== undefined) raw[t.hedef] = v;
    });
    if (!raw.donem) raw.donem = kural('okumaOrtasi', raw) || kural('faturaTarihi', raw);

    var rec = F.split(raw);
    rec.detay = detay;
    rec.kalemler = kalemler;
    rec.sablonId = sablon.id;
    K.applySummary(rec, userMap, sablonKategorileri(sablon));

    // Tanımsız bedel satırları: para biçimli değer içeren, hiçbir tanımın kullanmadığı satırlar
    var tanimsiz = lines.filter(function (l) {
      return !kullanilan[l.id] && l.degerler.some(function (o) { return PARA_RE.test(String(o.str).trim()); });
    });
    var yoksayilan = lines.filter(function (l) { return kullanilan[l.id] === 'yoksay'; });
    return { record: rec, bulunan: bulunan, eksik: eksik, tanimsiz: tanimsiz, yoksayilan: yoksayilan, lines: lines };
  }

  function sablonKategorileri(sablon) {
    var m = {};
    (sablon.tanimlar || []).forEach(function (t) { if (t.tur === 'kalem' && t.kategori) m[norm(t.ad)] = t.kategori; });
    return m;
  }

  function kural(ad, r) {
    if (ad === 'okumaOrtasi' && r.ilkOkuma && r.sonOkuma) {
      var mid = new Date((Date.parse(r.ilkOkuma) + Date.parse(r.sonOkuma)) / 2);
      return mid.getUTCFullYear() + '-' + ('0' + (mid.getUTCMonth() + 1)).slice(-2);
    }
    if (ad === 'faturaTarihi' && r.faturaTarihi) return String(r.faturaTarihi).slice(0, 7);
    if (ad === 'okumaDahil' && r.ilkOkuma && r.sonOkuma) return U.daysBetween(r.ilkOkuma, r.sonOkuma);
    if (ad === 'okumaFarki' && r.ilkOkuma && r.sonOkuma) return U.daysBetween(r.ilkOkuma, r.sonOkuma) - 1;
    return null;
  }

  // Şablonun anahtar metinleri faturada geçiyorsa eşleşir; en çok anahtarı tutan şablon seçilir.
  function bul(items, sablonlar) {
    var metin = items.map(function (it) { return String(it.str); }).join(' ').toUpperCase().replace(/\s+/g, ' ');
    var best = null;
    (sablonlar || []).forEach(function (s) {
      var a = (s.anahtarlar || []).filter(Boolean);
      if (!a.length) return;
      var ok = a.every(function (k) { return metin.indexOf(String(k).toUpperCase().replace(/\s+/g, ' ')) >= 0; });
      if (ok && (!best || a.length > best.anahtarlar.length)) best = s;
    });
    return best;
  }

  // ---------------------------------------------------------------------------------------------
  // Otomatik tanımlama: yerleşik ayrıştırıcının bulduğu değerleri faturadaki yerlerine bağlayıp şablon üretir.
  var ALAN_IPUCU = {
    faturaNo: /fatura (s[ıi]ra )?no/, faturaTarihi: /fatura (tarihi|d[öo]nemi)/, donem: /fatura d[öo]nemi/, gunSayisi: /okuma g[üu]n/,
    aktifKwh: /^aktif$|tek zamanl/, t1Kwh: /^g[üu]nd[üu]z$/, t2Kwh: /^puant$/, t3Kwh: /^gece$/, faturaTutari: /fatura tutar/,
    eic: /eic|etso/, sozlesmeNo: /s[öo]zle[şs]me/, tesisatNo: /tesisat/, tuketiciGrubu: /t[üu]ketici grubu/, ilkOkuma: /okuma g[üu]n/, sonOkuma: /okuma g[üu]n/
  };
  var ALAN_TUR = { faturaTarihi: 'tarih', ilkOkuma: 'tarih', sonOkuma: 'tarih', donem: 'donem', faturaNo: 'metin', eic: 'metin', sozlesmeNo: 'metin', tesisatNo: 'metin', tuketiciGrubu: 'metin' };

  function otomatikTanimla(items, width, parsed, opts) {
    opts = opts || {};
    var lines = satirlar(items, width);
    var r = parsed.record, meta = parsed.meta || {};
    var tanimlar = [], kullanilan = {};
    var id = 0;
    function yeni(t) { t.id = 't' + (++id); tanimlar.push(t); return t; }

    function alanBul(hedef, deger) {
      var tur = ALAN_TUR[hedef] || 'sayi';
      var adaylar = [];
      lines.forEach(function (l) {
        if (tur === 'sayi') {
          sayiOgeleri(l).forEach(function (o, i) {
            var s = String(o.str).trim();
            [bicimTahmin(s, l), 'tr', 'nokta'].some(function (b) {
              var v = sayi(s, b);
              if (v !== null && Math.abs(v - deger) <= Math.max(0.005, Math.abs(deger) * 1e-9)) { adaylar.push({ l: l, sira: i, sayiBicimi: b }); return true; }
              return false;
            });
          });
        } else if (tur === 'tarih') {
          tarihler(l).forEach(function (d, i) { if (d === deger) adaylar.push({ l: l, sira: i }); });
        } else if (tur === 'donem') {
          donemler(l).forEach(function (d, i) { if (d === deger) adaylar.push({ l: l, sira: i }); });
        } else {
          var hedefMetin = String(deger).replace(/\s+/g, ' ').trim();
          if (l.degerMetni && l.degerMetni.replace(/\s+/g, ' ').trim() === hedefMetin) adaylar.push({ l: l, sira: null });
          else l.degerler.forEach(function (o, i) { if (String(o.str).trim() === hedefMetin) adaylar.push({ l: l, sira: i }); });
        }
      });
      if (!adaylar.length) return null;
      var ipucu = ALAN_IPUCU[hedef];
      var uygun = (ipucu && adaylar.filter(function (a) { return ipucu.test(a.l.etiketNorm); })) || [];
      if (!uygun.length) uygun = adaylar.filter(function (a) { return a.l.etiket; });
      // Aynı satırda birden çok eşleşme varsa en sağdaki (örn. ilk endeks 0 iken son endeks = tüketim)
      var secilen = uygun.filter(function (a) { return a.l === (uygun[0] && uygun[0].l); }).pop() || null;
      if (!secilen || !secilen.l.etiket) return null;
      return yeni({ tur: 'alan', hedef: hedef, kolon: secilen.l.kolon, etiket: secilen.l.etiketNorm, etiketMetni: secilen.l.etiket, deger: tur, sira: secilen.sira, sayiBicimi: secilen.sayiBicimi });
    }

    ['faturaNo', 'faturaTarihi', 'donem', 'gunSayisi', 'aktifKwh', 't1Kwh', 't2Kwh', 't3Kwh', 'faturaTutari',
     'eic', 'sozlesmeNo', 'tesisatNo', 'tuketiciGrubu', 'ilkOkuma', 'sonOkuma'].forEach(function (k) {
      if (r[k] === undefined || r[k] === null || r[k] === '') return;
      var t = alanBul(k, r[k]);
      if (!t) {
        if (k === 'donem') yeni({ tur: 'kural', hedef: 'donem', kural: 'okumaOrtasi' });
        if (k === 'gunSayisi' && r.ilkOkuma && r.sonOkuma) yeni({ tur: 'kural', hedef: 'gunSayisi', kural: kural('okumaDahil', r) === r.gunSayisi ? 'okumaDahil' : 'okumaFarki' });
      }
    });
    if (r.tedarikci) yeni({ tur: 'sabit', hedef: 'tedarikci', sabit: r.tedarikci });

    // Kalemler: tutarı ve etiketi faturadaki satırla eşleşen her bedel satırı
    (r.kalemler || []).forEach(function (k) {
      if (typeof k.tutar !== 'number') return;
      var adaylar = lines.filter(function (l) {
        if (kullanilan[l.id] || !l.etiket) return false;
        var ns = sayiOgeleri(l);
        if (!ns.length) return false;
        var son = sayi(ns[ns.length - 1].str);
        return son !== null && Math.abs(son - k.tutar) <= 0.005;
      });
      var adN = norm(k.ad);
      var aday = adaylar.filter(function (l) { return l.etiketNorm === adN || adN.indexOf(l.etiketNorm) >= 0 || l.etiketNorm.indexOf(adN) >= 0; })[0] ||
        adaylar.filter(function (l) { return !/toplam/.test(l.etiketNorm); })[0] || null;
      if (!aday) return;
      kullanilan[aday.id] = true;
      var var_ = tanimlar.some(function (t) { return t.tur === 'kalem' && t.kolon === aday.kolon && t.etiket === aday.etiketNorm; });
      if (!var_) yeni({ tur: 'kalem', kolon: aday.kolon, etiket: aday.etiketNorm, etiketMetni: aday.etiket, ad: k.ad, kategori: K.resolve(k.ad, r.bicim, opts.userMap).kategori, miktarBirimi: k.miktarBirimi || 'kWh' });
    });

    // Kalan para biçimli satırlar (toplamlar, ara toplamlar): bilinçli olarak yok sayılır
    var alanSatirlari = {};
    tanimlar.forEach(function (t) { if (t.tur === 'alan') alanSatirlari[t.kolon + '|' + t.etiket] = true; });
    lines.forEach(function (l) {
      if (kullanilan[l.id] || alanSatirlari[l.kolon + '|' + l.etiketNorm] || !l.etiket) return;
      if (!l.degerler.some(function (o) { return PARA_RE.test(String(o.str).trim()); })) return;
      if (tanimlar.some(function (t) { return (t.tur === 'yoksay' || t.tur === 'kalem') && t.kolon === l.kolon && t.etiket === l.etiketNorm; })) return;
      // Bu faturada 0 olsa da bilinen bir bedel satırıysa (muhtelif, yuvarlama, fon...) kalem olarak tanımla; toplamları yok say
      var kat = !/toplam/.test(l.etiketNorm) ? K.varsayilan(l.etiket, r.bicim) : null;
      if (kat) yeni({ tur: 'kalem', kolon: l.kolon, etiket: l.etiketNorm, etiketMetni: l.etiket, ad: l.etiket, kategori: kat, miktarBirimi: 'kWh' });
      else yeni({ tur: 'yoksay', kolon: l.kolon, etiket: l.etiketNorm, etiketMetni: l.etiket });
    });

    var anahtarlar = [];
    if (meta.tedarikciVkn) anahtarlar.push(meta.tedarikciVkn);
    else if (r.tedarikci) anahtarlar.push(r.tedarikci);
    return { id: opts.id || r.bicim || ('sablon_' + Date.now().toString(36)), ad: opts.ad || r.tedarikci || 'Yeni şablon', anahtarlar: anahtarlar, tanimlar: tanimlar };
  }

  // Yeni tanımları mevcut şablona ekler; aynı hedef/satır için var olan tanım korunur. Dönüş: eklenen tanım sayısı
  function birlestir(sablon, yeni) {
    var n = 0;
    function anahtar(t) {
      if (t.tur === 'alan' || t.tur === 'kural' || t.tur === 'sabit') return 'h|' + t.hedef;
      return 's|' + t.kolon + '|' + t.etiket;
    }
    var mevcut = {};
    sablon.tanimlar.forEach(function (t) { mevcut[anahtar(t)] = true; });
    yeni.tanimlar.forEach(function (t) {
      if (mevcut[anahtar(t)]) return;
      // Alan için hem kural hem alan olmasın: faturada bulunan alan kuralın yerini alır
      if (t.tur === 'alan') sablon.tanimlar = sablon.tanimlar.filter(function (x) { return !(x.tur === 'kural' && x.hedef === t.hedef); });
      t.id = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      sablon.tanimlar.push(t); mevcut[anahtar(t)] = true; n++;
    });
    (yeni.anahtarlar || []).forEach(function (a) { if (sablon.anahtarlar.indexOf(a) < 0 && !sablon.anahtarlar.length) sablon.anahtarlar.push(a); });
    return n;
  }

  // Seçilen satır/değerden tanım üretir (elle tanımlama)
  function tanimOlustur(satir, secim) {
    var t = { id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), tur: secim.tur, kolon: satir.kolon, etiket: satir.etiketNorm, etiketMetni: satir.etiket };
    if (secim.tur === 'alan' || secim.tur === 'detay') {
      t.deger = secim.deger; t.sira = secim.sira; t.sayiBicimi = secim.sayiBicimi;
      if (secim.tur === 'alan') t.hedef = secim.hedef; else t.ad = secim.ad;
    } else if (secim.tur === 'kalem') {
      t.ad = secim.ad || satir.etiket; t.kategori = secim.kategori; t.miktarBirimi = secim.miktarBirimi || 'kWh';
    }
    return t;
  }

  var api = { satirlar: satirlar, uygula: uygula, bul: bul, otomatikTanimla: otomatikTanimla, tanimOlustur: tanimOlustur, birlestir: birlestir, sablonKategorileri: sablonKategorileri,
    sayiOgeleri: sayiOgeleri, tarihler: tarihler, donemler: donemler, sayi: sayi, bicimTahmin: bicimTahmin, degerOku: degerOku, PARA_RE: PARA_RE, NUM_RE: NUM_RE };
  if (NODE) module.exports = api;
  else { root.App = root.App || {}; root.App.sablon = api; }
})(this);
