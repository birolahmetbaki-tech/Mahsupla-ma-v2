/* Fatura kalemleri ve kalem eşleştirme sözlüğü.
   Her fatura, faturada yazdığı adıyla bir kalem listesi taşır: { ad, miktar, miktarBirimi, birim, tutar }.
   Kalemler bir kategoriye eşlenir; standart özet alanları (enerji bedeli, dağıtım, mahsup, BTV, KDV ...)
   kategorilerin toplamıdır. Böylece farklı tedarikçilerin farklı adlandırdığı kalemler aynı sütunlarda toplanır.

   Eşleştirme sırası: kullanıcı sözlüğü (biçime özel) → kullanıcı sözlüğü (genel) → varsayılan kurallar → 'tanimsiz'. */
(function (root) {
  'use strict';

  var KATEGORILER = [
    { id: 'enerji', label: 'Enerji bedeli', alan: 'enerjiBedeli' },
    { id: 'mahsup', label: 'GES mahsubu / indirim', alan: 'mahsupTL' },
    { id: 'dagitim', label: 'Dağıtım bedeli', alan: 'dagitimBedeli' },
    { id: 'diger', label: 'Diğer bedeller', alan: 'digerBedeller' },
    { id: 'btv', label: 'BTV', alan: 'btv' },
    { id: 'kdv', label: 'KDV', alan: 'kdv' },
    { id: 'yoksay', label: 'Toplama katma (bilgi amaçlı)', alan: null }
  ];
  var byId = {};
  KATEGORILER.forEach(function (k) { byId[k.id] = k; });

  // Varsayılan kurallar: sıra önemli (ilk eşleşen kazanır). bicim verilirse yalnız o biçimde geçerli.
  var KURALLAR = [
    { re: /ek ?t[üu]ketim|eksik ?t[üu]ketim/, k: 'mahsup' },
    { re: /\bges\b|mahsup/, k: 'mahsup' },
    { re: /g[üu]ncel yuvarlama/, k: 'yoksay', bicim: 'ckbogazici' }, // Boğaziçi: ödenecek tutara eklenir, fatura tutarına değil
    { re: /^enerji bedeli|^(g[üu]nd[üu]z|puant|gece|tek zaman(l[ıi])?) t[üu]ketim bedeli$|sktt/, k: 'enerji' },
    { re: /^da[ğg][ıi]t[ıi]m bedeli/, k: 'dagitim' },
    { re: /belediye t[üu]ketim|elekt.*ver|\bbtv\b/, k: 'btv' },
    { re: /^kdv/, k: 'kdv' },
    { re: /g[üu][çc] bedeli|reaktif|g[üu][çc] a[şs][ıi]m|yuvarlama|muhtelif|kesme|tenzil|gecikme|enerji fonu|trt/, k: 'diger' }
  ];

  // Eşleştirme anahtarı: küçük harf, sayı/noktalama temizlenmiş ad ("KDV (Matrah 1.063.661,37)" → "kdv matrah")
  function norm(ad) {
    return String(ad || '').toLocaleLowerCase('tr-TR')
      .replace(/[\d.,%#:]+/g, ' ').replace(/[()\-/]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function key(bicim, ad) { return (bicim || 'genel') + '|' + norm(ad); }

  function varsayilan(ad, bicim) {
    var n = norm(ad);
    for (var i = 0; i < KURALLAR.length; i++) {
      var r = KURALLAR[i];
      if (r.bicim && r.bicim !== bicim) continue;
      if (r.re.test(n)) return r.k;
    }
    return null;
  }

  // userMap: { 'bicim|ad': kategori, '*|ad': kategori }
  function resolve(ad, bicim, userMap) {
    userMap = userMap || {};
    var n = norm(ad);
    var u = userMap[(bicim || 'genel') + '|' + n] || userMap['*|' + n];
    if (u) return { kategori: u, kaynak: 'kullanici' };
    var v = varsayilan(ad, bicim);
    if (v) return { kategori: v, kaynak: 'varsayilan' };
    return { kategori: 'tanimsiz', kaynak: 'yok' };
  }

  function r2(x) { return Math.round(x * 100) / 100; }

  // Kalemlerden standart özet alanlarını hesaplar. Elle düzeltilmiş alanlara dokunmaz.
  function applySummary(rec, userMap) {
    var kalemler = rec.kalemler || [];
    var top = {}, tanimsiz = [];
    var mahsupKwh = 0, mahsupKwhVar = false;
    kalemler.forEach(function (k) {
      var res = resolve(k.ad, rec.bicim, userMap);
      k.kategori = res.kategori;
      var kat = res.kategori === 'tanimsiz' ? 'diger' : res.kategori; // tanımsızlar onaylanana kadar "diğer"e eklenir
      if (res.kategori === 'tanimsiz') tanimsiz.push(k.ad);
      if (kat === 'yoksay') return;
      var alan = byId[kat].alan;
      if (typeof k.tutar === 'number') top[alan] = (top[alan] || 0) + k.tutar;
      if (kat === 'mahsup' && typeof k.miktar === 'number' && k.miktarBirimi === 'kWh') { mahsupKwh += k.miktar; mahsupKwhVar = true; }
    });
    var duz = rec.duzeltilen || {};
    KATEGORILER.forEach(function (k) {
      if (!k.alan || duz[k.alan]) return;
      rec[k.alan] = top[k.alan] === undefined ? null : r2(top[k.alan]);
    });
    if (!duz.mahsupKwh) rec.mahsupKwh = mahsupKwhVar ? Math.round(mahsupKwh * 1000) / 1000 : null;
    return { tanimsiz: tanimsiz };
  }

  // Sürüm 2 kayıtlarındaki ayrıntılı alanlardan kalem listesi üretir (geçiş için).
  function fromLegacy(r) {
    var k = [];
    function add(ad, tutar, miktar, miktarBirimi, birim) {
      if (typeof tutar !== 'number' && typeof miktar !== 'number') return;
      if (!tutar && !miktar) return;
      k.push({ ad: ad, miktar: typeof miktar === 'number' ? miktar : null, miktarBirimi: typeof miktar === 'number' ? (miktarBirimi || null) : null, birim: typeof birim === 'number' ? birim : null, tutar: typeof tutar === 'number' ? tutar : null });
    }
    var bog = r.bicim === 'ckbogazici';
    [['t1', 'Gündüz'], ['t2', 'Puant'], ['t3', 'Gece']].forEach(function (z) {
      add(bog ? 'Enerji Bedeli-' + z[1] : z[1] + ' (Tüketim Bedeli)', r[z[0] + 'Tutar'], r[z[0] + 'FatKwh'] !== undefined ? r[z[0] + 'FatKwh'] : r[z[0] + 'Kwh'], 'kWh', r[z[0] + 'Birim']);
    });
    add(bog ? 'Enerji Bedeli' : 'Tek Zamanlı (Tüketim Bedeli)', r.tekTutar, r.tekKwh, 'kWh', r.tekBirim);
    [['ekT1', 'Enerji Bedeli-Gündüz(Ek Tüketim)'], ['ekT2', 'Enerji Bedeli-Puant(Ek Tüketim)'], ['ekT3', 'Enerji Bedeli-Gece(Ek Tüketim)'],
     ['ekTek', bog ? 'Enerji Bedeli(Ek Tüketim)' : 'Ek/Eksik Tüketim']].forEach(function (z) {
      add(z[1], r[z[0] + 'Tutar'], r[z[0] + 'Kwh'], 'kWh', r[z[0] + 'Birim']);
    });
    add('Dağıtım Bedeli', r.dagitimTutar, r.dagitimMiktar, 'MWh', r.dagitimBirim);
    add('Güç Bedeli', r.gucTutar, r.gucMiktar, 'kW', r.gucBirim);
    add('Reaktif Bedeli', r.reaktifTutar);
    add('Güç Aşım Bedeli', r.gucAsimTutar);
    if (bog) {
      if (typeof r.digerToplam === 'number' && r.digerToplam) add(r.digerAciklama || 'Diğer Bedel', r.digerToplam);
    } else {
      add(r.digerAciklama || 'Diğer Bedel', r.digerTutar);
      add('Muhtelif Bedel', r.muhtelifBedel);
      add('Kesme-Bağlama', r.kesmeBaglama);
      add('Tenzil Bedeli', r.tenzilBedeli);
    }
    add('Önceki Yuvarlama', r.oncekiYuvarlama);
    add('Güncel Yuvarlama', r.guncelYuvarlama);
    add('Enerji Fonu', r.enerjiFonu);
    add('TRT Fon Payı', r.trtPayi);
    add(bog ? 'Elekt Ver. Hvgz Tük. Ver' : 'Belediye Tüketim Vergisi', r.btv);
    add('KDV', r.kdv);
    return k;
  }

  var api = { KATEGORILER: KATEGORILER, byId: byId, norm: norm, key: key, resolve: resolve, varsayilan: varsayilan, applySummary: applySummary, fromLegacy: fromLegacy };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.App = root.App || {}; root.App.kalemler = api; }
})(this);
