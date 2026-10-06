/* Fatura alan tanımları. Veriler sayfası, yükleme önizlemesi ve CSV dışa aktarımı bu listeyi kullanır.
   type: text | date | month | num ; dec: ondalık hane ; calc: hesaplanan (salt okunur) alan ;
   check: kontrol alanı — sonuç |değer| <= tol ise "tamam" sayılır. */
(function (root) {
  'use strict';

  function n(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function sum() {
    var t = 0, any = false;
    for (var i = 0; i < arguments.length; i++) { var v = n(arguments[i]); if (v !== null) { t += v; any = true; } }
    return any ? t : null;
  }
  function diff(a, b) { return n(a) !== null && n(b) !== null ? a - b : null; }
  function ratio(a, b) { return n(a) !== null && n(b) ? a / b : null; }
  function endeks(r, ilk, son) {
    return n(r[ilk]) !== null && n(r[son]) !== null && n(r.carpan) ? (r[son] - r[ilk]) * r.carpan : null;
  }
  function gun(r) {
    var u = (root.App && root.App.util) || (typeof require !== 'undefined' ? require('./util.js') : null);
    return u ? u.daysBetween(r.ilkOkuma, r.sonOkuma) : null;
  }
  function matrah(r) {
    return sum(r.enerjiToplam, r.skbToplam, r.digerToplam, r.btv, r.enerjiFonu, r.trtPayi);
  }

  var GROUPS = [
    { id: 'genel', label: 'Genel' },
    { id: 'endeks', label: 'Endeksler' },
    { id: 'tuketim', label: 'Tüketim' },
    { id: 'enerji', label: 'Tüketim (Enerji) Bedelleri' },
    { id: 'skb', label: 'Sistem Kullanım Bedelleri' },
    { id: 'diger', label: 'Diğer Tutarlar' },
    { id: 'vergi', label: 'Vergi ve Fonlar' },
    { id: 'toplam', label: 'Fatura Toplamı' },
    { id: 'kontrol', label: 'Hesaplanan / Kontrol' }
  ];

  var FIELDS = [
    // Genel
    { key: 'donem', label: 'Dönem', group: 'genel', type: 'month', w: 80 },
    { key: 'faturaNo', label: 'Fatura No', group: 'genel', type: 'text', w: 140 },
    { key: 'faturaTarihi', label: 'Fatura Tarihi', group: 'genel', type: 'date', w: 90 },
    { key: 'sonOdemeTarihi', label: 'Son Ödeme Tarihi', group: 'genel', type: 'date', w: 90 },
    { key: 'tedarikci', label: 'Tedarikçi', group: 'genel', type: 'text', w: 180 },
    { key: 'tuketiciGrubu', label: 'Tüketici Grubu', group: 'genel', type: 'text', w: 130 },
    { key: 'eic', label: 'EIC Kodu', group: 'genel', type: 'text', w: 130 },
    { key: 'sozlesmeNo', label: 'Sözleşme / Hesap No', group: 'genel', type: 'text', w: 140 },
    { key: 'ilkOkuma', label: 'İlk Okuma', group: 'genel', type: 'date', w: 90 },
    { key: 'sonOkuma', label: 'Son Okuma', group: 'genel', type: 'date', w: 90 },
    { key: 'carpan', label: 'Çarpan', group: 'genel', type: 'num', dec: 0, w: 70 },

    // Endeksler
    { key: 'aktifIlk', label: 'Aktif İlk', group: 'endeks', type: 'num', dec: 3 },
    { key: 'aktifSon', label: 'Aktif Son', group: 'endeks', type: 'num', dec: 3 },
    { key: 't1Ilk', label: 'Gündüz İlk', group: 'endeks', type: 'num', dec: 3 },
    { key: 't1Son', label: 'Gündüz Son', group: 'endeks', type: 'num', dec: 3 },
    { key: 't2Ilk', label: 'Puant İlk', group: 'endeks', type: 'num', dec: 3 },
    { key: 't2Son', label: 'Puant Son', group: 'endeks', type: 'num', dec: 3 },
    { key: 't3Ilk', label: 'Gece İlk', group: 'endeks', type: 'num', dec: 3 },
    { key: 't3Son', label: 'Gece Son', group: 'endeks', type: 'num', dec: 3 },
    { key: 'endIlk', label: 'Endüktif İlk', group: 'endeks', type: 'num', dec: 3 },
    { key: 'endSon', label: 'Endüktif Son', group: 'endeks', type: 'num', dec: 3 },
    { key: 'kapIlk', label: 'Kapasitif İlk', group: 'endeks', type: 'num', dec: 3 },
    { key: 'kapSon', label: 'Kapasitif Son', group: 'endeks', type: 'num', dec: 3 },

    // Tüketim
    { key: 'aktifKwh', label: 'Aktif Tüketim', unit: 'kWh', group: 'tuketim', type: 'num', dec: 3 },
    { key: 't1Kwh', label: 'Gündüz (T1)', unit: 'kWh', group: 'tuketim', type: 'num', dec: 3 },
    { key: 't2Kwh', label: 'Puant (T2)', unit: 'kWh', group: 'tuketim', type: 'num', dec: 3 },
    { key: 't3Kwh', label: 'Gece (T3)', unit: 'kWh', group: 'tuketim', type: 'num', dec: 3 },
    { key: 'enduktifKvarh', label: 'Endüktif (faturada)', unit: 'kVArh', group: 'tuketim', type: 'num', dec: 3 },
    { key: 'kapasitifKvarh', label: 'Kapasitif (faturada)', unit: 'kVArh', group: 'tuketim', type: 'num', dec: 3 },

    // Enerji bedelleri
    { key: 't1Birim', label: 'Gündüz Birim Fiyat', unit: 'TL/kWh', group: 'enerji', type: 'num', dec: 4 },
    { key: 't2Birim', label: 'Puant Birim Fiyat', unit: 'TL/kWh', group: 'enerji', type: 'num', dec: 4 },
    { key: 't3Birim', label: 'Gece Birim Fiyat', unit: 'TL/kWh', group: 'enerji', type: 'num', dec: 4 },
    { key: 't1Tutar', label: 'Gündüz Tutar', unit: 'TL', group: 'enerji', type: 'num' },
    { key: 't2Tutar', label: 'Puant Tutar', unit: 'TL', group: 'enerji', type: 'num' },
    { key: 't3Tutar', label: 'Gece Tutar', unit: 'TL', group: 'enerji', type: 'num' },
    { key: 'enerjiToplam', label: 'Tüketim Bedelleri Toplamı', unit: 'TL', group: 'enerji', type: 'num' },

    // Sistem kullanım
    { key: 'dagitimMiktar', label: 'Dağıtım Miktarı', unit: 'MWh', group: 'skb', type: 'num', dec: 3 },
    { key: 'dagitimBirim', label: 'Dağıtım Birim Fiyat', unit: 'TL/MWh', group: 'skb', type: 'num', dec: 3 },
    { key: 'dagitimTutar', label: 'Dağıtım Bedeli', unit: 'TL', group: 'skb', type: 'num' },
    { key: 'gucMiktar', label: 'Güç (Sözleşme Gücü)', unit: 'kW', group: 'skb', type: 'num', dec: 3 },
    { key: 'gucBirim', label: 'Güç Birim Fiyat', unit: 'TL/kW', group: 'skb', type: 'num', dec: 3 },
    { key: 'gucTutar', label: 'Güç Bedeli', unit: 'TL', group: 'skb', type: 'num' },
    { key: 'reaktifTutar', label: 'Reaktif Bedeli', unit: 'TL', group: 'skb', type: 'num' },
    { key: 'gucAsimTutar', label: 'Güç Aşım Bedeli', unit: 'TL', group: 'skb', type: 'num' },
    { key: 'skbToplam', label: 'Sistem Kullanım Toplamı', unit: 'TL', group: 'skb', type: 'num' },

    // Diğer
    { key: 'digerTutar', label: 'Diğer Bedel (Mahsup vb.)', unit: 'TL', group: 'diger', type: 'num' },
    { key: 'digerAciklama', label: 'Diğer Bedel Açıklaması', group: 'diger', type: 'text', w: 260 },
    { key: 'oncekiYuvarlama', label: 'Önceki Yuvarlama', unit: 'TL', group: 'diger', type: 'num' },
    { key: 'guncelYuvarlama', label: 'Güncel Yuvarlama', unit: 'TL', group: 'diger', type: 'num' },
    { key: 'kesmeBaglama', label: 'Kesme-Bağlama', unit: 'TL', group: 'diger', type: 'num' },
    { key: 'tenzilBedeli', label: 'Tenzil Bedeli', unit: 'TL', group: 'diger', type: 'num' },
    { key: 'muhtelifBedel', label: 'Muhtelif Bedel', unit: 'TL', group: 'diger', type: 'num' },
    { key: 'ekTuketimKwh', label: 'Ek/Eksik Tüketim', unit: 'kWh', group: 'diger', type: 'num', dec: 3 },
    { key: 'ekTuketimBirim', label: 'Ek/Eksik Tük. Birim', unit: 'TL/kWh', group: 'diger', type: 'num', dec: 4 },
    { key: 'ekTuketimTutar', label: 'Ek/Eksik Tük. Tutar', unit: 'TL', group: 'diger', type: 'num' },
    { key: 'digerToplam', label: 'Diğer Tutarlar Toplamı', unit: 'TL', group: 'diger', type: 'num' },

    // Vergiler
    { key: 'enerjiFonu', label: 'Enerji Fonu', unit: 'TL', group: 'vergi', type: 'num' },
    { key: 'trtPayi', label: 'TRT Fon Payı', unit: 'TL', group: 'vergi', type: 'num' },
    { key: 'btv', label: 'Belediye Tüketim Vergisi', unit: 'TL', group: 'vergi', type: 'num' },
    { key: 'kdvOrani', label: 'KDV Oranı', unit: '%', group: 'vergi', type: 'num', dec: 0 },
    { key: 'kdv', label: 'KDV', unit: 'TL', group: 'vergi', type: 'num' },
    { key: 'vergiToplam', label: 'Vergiler Toplamı', unit: 'TL', group: 'vergi', type: 'num' },

    // Toplam
    { key: 'faturaTutari', label: 'Fatura Tutarı', unit: 'TL', group: 'toplam', type: 'num' },
    { key: 'ortGunlukKwh', label: 'Ort. Günlük Tüketim', unit: 'kWh/gün', group: 'toplam', type: 'num', dec: 3 },
    { key: 'gecmisYilKwh', label: 'Geçmiş Yıl Tüketim', unit: 'kWh', group: 'toplam', type: 'num', dec: 3 },
    { key: 'cariYilKwh', label: 'Cari Yıl Tüketim', unit: 'kWh', group: 'toplam', type: 'num', dec: 3 },

    // Hesaplanan / kontrol
    { key: 'c_gun', label: 'Okuma Gün Sayısı', unit: 'gün', group: 'kontrol', type: 'num', dec: 0, calc: gun },
    { key: 'c_endeksAktif', label: 'Aktif (Endeks×Çarpan)', unit: 'kWh', group: 'kontrol', type: 'num', dec: 3,
      calc: function (r) { return endeks(r, 'aktifIlk', 'aktifSon'); } },
    { key: 'k_endeks', label: 'Kontrol: Endeks − Aktif', unit: 'kWh', group: 'kontrol', type: 'num', dec: 3, check: true, tol: 1,
      calc: function (r) { return diff(endeks(r, 'aktifIlk', 'aktifSon'), r.aktifKwh); } },
    { key: 'k_zaman', label: 'Kontrol: T1+T2+T3 − Aktif', unit: 'kWh', group: 'kontrol', type: 'num', dec: 3, check: true, tol: 1,
      calc: function (r) { return diff(sum(r.t1Kwh, r.t2Kwh, r.t3Kwh), r.aktifKwh); } },
    { key: 'c_enduktif', label: 'Endüktif (Endeks×Çarpan)', unit: 'kVArh', group: 'kontrol', type: 'num', dec: 3,
      calc: function (r) { return endeks(r, 'endIlk', 'endSon'); } },
    { key: 'c_enduktifOran', label: 'Endüktif / Aktif', unit: '%', group: 'kontrol', type: 'num', dec: 2,
      calc: function (r) { var v = ratio(endeks(r, 'endIlk', 'endSon'), r.aktifKwh); return v === null ? null : v * 100; } },
    { key: 'c_kapasitif', label: 'Kapasitif (Endeks×Çarpan)', unit: 'kVArh', group: 'kontrol', type: 'num', dec: 3,
      calc: function (r) { return endeks(r, 'kapIlk', 'kapSon'); } },
    { key: 'c_kapasitifOran', label: 'Kapasitif / Aktif', unit: '%', group: 'kontrol', type: 'num', dec: 2,
      calc: function (r) { var v = ratio(endeks(r, 'kapIlk', 'kapSon'), r.aktifKwh); return v === null ? null : v * 100; } },
    { key: 'c_efektifBirim', label: 'Efektif Enerji Birim Fiyatı', unit: 'TL/kWh', group: 'kontrol', type: 'num', dec: 6,
      calc: function (r) { return ratio(r.enerjiToplam, r.aktifKwh); } },
    { key: 'k_enerji', label: 'Kontrol: Kalemler − Enerji Toplamı', unit: 'TL', group: 'kontrol', type: 'num', check: true, tol: 0.05,
      calc: function (r) { return diff(sum(r.t1Tutar, r.t2Tutar, r.t3Tutar), r.enerjiToplam); } },
    { key: 'k_dagitim', label: 'Kontrol: Miktar×Birim − Dağıtım', unit: 'TL', group: 'kontrol', type: 'num', check: true, tol: 1,
      calc: function (r) { return n(r.dagitimMiktar) !== null && n(r.dagitimBirim) !== null ? r.dagitimMiktar * r.dagitimBirim - r.dagitimTutar : null; } },
    { key: 'c_dagitimKwh', label: 'Dağıtım Birim Fiyatı', unit: 'TL/kWh', group: 'kontrol', type: 'num', dec: 6,
      calc: function (r) { return n(r.dagitimBirim) !== null ? r.dagitimBirim / 1000 : null; } },
    { key: 'c_btvOran', label: 'BTV / Enerji Bedeli', unit: '%', group: 'kontrol', type: 'num', dec: 3,
      calc: function (r) { var v = ratio(r.btv, r.enerjiToplam); return v === null ? null : v * 100; } },
    { key: 'k_vergi', label: 'Kontrol: Fon+BTV+KDV − Vergi Toplamı', unit: 'TL', group: 'kontrol', type: 'num', check: true, tol: 0.05,
      calc: function (r) { return diff(sum(r.enerjiFonu, r.trtPayi, r.btv, r.kdv), r.vergiToplam); } },
    { key: 'c_matrah', label: 'KDV Matrahı (hesap)', unit: 'TL', group: 'kontrol', type: 'num', calc: matrah },
    { key: 'k_kdv', label: 'Kontrol: Matrah×Oran − KDV', unit: 'TL', group: 'kontrol', type: 'num', check: true, tol: 0.05,
      calc: function (r) { var m = matrah(r); return m !== null && n(r.kdvOrani) !== null && n(r.kdv) !== null ? m * r.kdvOrani / 100 - r.kdv : null; } },
    { key: 'k_toplam', label: 'Kontrol: Matrah+KDV − Fatura', unit: 'TL', group: 'kontrol', type: 'num', check: true, tol: 0.05,
      calc: function (r) { var m = matrah(r); return m !== null && n(r.faturaTutari) !== null ? m + (r.kdv || 0) - r.faturaTutari : null; } },
    { key: 'c_kwhMaliyet', label: 'Ort. Toplam Maliyet (KDV dahil)', unit: 'TL/kWh', group: 'kontrol', type: 'num', dec: 4,
      calc: function (r) { return ratio(r.faturaTutari, r.aktifKwh); } },
    { key: 'c_limit2x', label: 'Bedelli Üretim Limiti (2×Geçmiş Yıl)', unit: 'kWh', group: 'kontrol', type: 'num', dec: 0,
      calc: function (r) { return n(r.gecmisYilKwh) !== null ? r.gecmisYilKwh * 2 : null; } }
  ];

  var byKey = {};
  FIELDS.forEach(function (f) { byKey[f.key] = f; });

  function compute(record) {
    var out = {};
    FIELDS.forEach(function (f) {
      if (f.calc) {
        try { out[f.key] = f.calc(record); } catch (e) { out[f.key] = null; }
      }
    });
    return out;
  }

  function checkStatus(field, value) {
    if (!field.check || value === null || value === undefined) return null;
    return Math.abs(value) <= (field.tol || 0.01) ? 'ok' : 'err';
  }

  var api = { GROUPS: GROUPS, FIELDS: FIELDS, byKey: byKey, compute: compute, checkStatus: checkStatus };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.App = root.App || {}; root.App.fields = api; }
})(this);
