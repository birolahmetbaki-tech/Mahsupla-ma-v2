/* Fatura alan tanımları. Veriler sayfası, yükleme önizlemesi ve CSV dışa aktarımı bu listeyi kullanır.
   Faturadan okunan ama bu listede olmayan değerler saklanmaz (bkz. pick).
   type: text | date | month | num ; dec: ondalık hane ; calc: hesaplanan (salt okunur) alan ;
   hidden: saklanır ve kontrollerde kullanılır, ama tablolarda gösterilmez ;
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
  function ekKwh(r) { return sum(r.ekT1Kwh, r.ekT2Kwh, r.ekT3Kwh, r.ekTekKwh); }
  function ekTutar(r) { return sum(r.ekT1Tutar, r.ekT2Tutar, r.ekT3Tutar, r.ekTekTutar); }
  function matrah(r) {
    return sum(r.enerjiToplam, r.skbToplam, r.digerToplam, r.btv, r.enerjiFonu, r.trtPayi);
  }

  var GROUPS = [
    { id: 'genel', label: 'Genel' },
    { id: 'tuketim', label: 'Tüketim' },
    { id: 'enerji', label: 'Tüketim (Enerji) Bedelleri' },
    { id: 'mahsup', label: 'GES Mahsup / Ek Tüketim' },
    { id: 'skb', label: 'Sistem Kullanım Bedelleri' },
    { id: 'diger', label: 'Diğer Tutarlar' },
    { id: 'vergi', label: 'Vergi ve Fonlar' },
    { id: 'toplam', label: 'Fatura Toplamı' },
    { id: 'kontrol', label: 'Hesaplanan / Kontrol' }
  ];

  var FIELDS = [
    // Genel
    { key: 'donem', label: 'Dönem', group: 'genel', type: 'month', w: 80 },
    { key: 'bicim', label: 'Fatura Biçimi', group: 'genel', type: 'text', w: 90 },
    { key: 'faturaNo', label: 'Fatura No', group: 'genel', type: 'text', w: 140 },
    { key: 'faturaTarihi', label: 'Fatura Tarihi', group: 'genel', type: 'date', w: 90 },
    { key: 'tedarikci', label: 'Tedarikçi', group: 'genel', type: 'text', w: 180 },
    { key: 'tuketiciGrubu', label: 'Tüketici Grubu', group: 'genel', type: 'text', w: 130 },
    { key: 'eic', label: 'EIC Kodu', group: 'genel', type: 'text', w: 130 },
    { key: 'sozlesmeNo', label: 'Sözleşme / Hesap No', group: 'genel', type: 'text', w: 140 },
    { key: 'tesisatNo', label: 'Tesisat No', group: 'genel', type: 'text', w: 100 },
    { key: 'ilkOkuma', label: 'İlk Okuma', group: 'genel', type: 'date', w: 90 },
    { key: 'sonOkuma', label: 'Son Okuma', group: 'genel', type: 'date', w: 90 },
    { key: 'gunSayisi', label: 'Gün Sayısı', unit: 'gün', group: 'genel', type: 'num', dec: 0, w: 70 },
    { key: 'carpan', hidden: true, label: 'Çarpan', group: 'genel', type: 'num', dec: 0, w: 70 },

    // Endeksler

    // Tüketim
    { key: 'aktifKwh', label: 'Aktif Tüketim', unit: 'kWh', group: 'tuketim', type: 'num', dec: 3 },
    { key: 't1Kwh', label: 'Gündüz (T1)', unit: 'kWh', group: 'tuketim', type: 'num', dec: 3 },
    { key: 't2Kwh', label: 'Puant (T2)', unit: 'kWh', group: 'tuketim', type: 'num', dec: 3 },
    { key: 't3Kwh', label: 'Gece (T3)', unit: 'kWh', group: 'tuketim', type: 'num', dec: 3 },

    // Enerji bedelleri
    { key: 't1FatKwh', label: 'Gündüz Faturalanan', unit: 'kWh', group: 'enerji', type: 'num', dec: 3 },
    { key: 't2FatKwh', label: 'Puant Faturalanan', unit: 'kWh', group: 'enerji', type: 'num', dec: 3 },
    { key: 't3FatKwh', label: 'Gece Faturalanan', unit: 'kWh', group: 'enerji', type: 'num', dec: 3 },
    { key: 't1Birim', label: 'Gündüz Birim Fiyat', unit: 'TL/kWh', group: 'enerji', type: 'num', dec: 6 },
    { key: 't2Birim', label: 'Puant Birim Fiyat', unit: 'TL/kWh', group: 'enerji', type: 'num', dec: 6 },
    { key: 't3Birim', label: 'Gece Birim Fiyat', unit: 'TL/kWh', group: 'enerji', type: 'num', dec: 6 },
    { key: 't1Tutar', label: 'Gündüz Tutar', unit: 'TL', group: 'enerji', type: 'num' },
    { key: 't2Tutar', label: 'Puant Tutar', unit: 'TL', group: 'enerji', type: 'num' },
    { key: 't3Tutar', label: 'Gece Tutar', unit: 'TL', group: 'enerji', type: 'num' },
    { key: 'tekKwh', label: 'Tek Zamanlı / Diğer Enerji', unit: 'kWh', group: 'enerji', type: 'num', dec: 3 },
    { key: 'tekBirim', label: 'Tek Zamanlı Birim Fiyat', unit: 'TL/kWh', group: 'enerji', type: 'num', dec: 6 },
    { key: 'tekTutar', label: 'Tek Zamanlı / Diğer Tutar', unit: 'TL', group: 'enerji', type: 'num' },
    { key: 'enerjiToplam', label: 'Enerji Bedelleri Toplamı', unit: 'TL', group: 'enerji', type: 'num' },

    // GES mahsup / ek tüketim (negatif kWh: üretimden mahsup edilen enerji)
    { key: 'ekT1Kwh', label: 'Gündüz Ek Tüketim (Mahsup)', unit: 'kWh', group: 'mahsup', type: 'num', dec: 3 },
    { key: 'ekT1Birim', label: 'Gündüz Ek Tük. Birim', unit: 'TL/kWh', group: 'mahsup', type: 'num', dec: 6 },
    { key: 'ekT1Tutar', label: 'Gündüz Ek Tük. Tutar', unit: 'TL', group: 'mahsup', type: 'num' },
    { key: 'ekT2Kwh', label: 'Puant Ek Tüketim (Mahsup)', unit: 'kWh', group: 'mahsup', type: 'num', dec: 3 },
    { key: 'ekT2Birim', label: 'Puant Ek Tük. Birim', unit: 'TL/kWh', group: 'mahsup', type: 'num', dec: 6 },
    { key: 'ekT2Tutar', label: 'Puant Ek Tük. Tutar', unit: 'TL', group: 'mahsup', type: 'num' },
    { key: 'ekT3Kwh', label: 'Gece Ek Tüketim (Mahsup)', unit: 'kWh', group: 'mahsup', type: 'num', dec: 3 },
    { key: 'ekT3Birim', label: 'Gece Ek Tük. Birim', unit: 'TL/kWh', group: 'mahsup', type: 'num', dec: 6 },
    { key: 'ekT3Tutar', label: 'Gece Ek Tük. Tutar', unit: 'TL', group: 'mahsup', type: 'num' },
    { key: 'ekTekKwh', label: 'Ek/Eksik Tüketim (zamansız)', unit: 'kWh', group: 'mahsup', type: 'num', dec: 3 },
    { key: 'ekTekBirim', label: 'Ek/Eksik Tük. Birim', unit: 'TL/kWh', group: 'mahsup', type: 'num', dec: 6 },
    { key: 'ekTekTutar', label: 'Ek/Eksik Tük. Tutar', unit: 'TL', group: 'mahsup', type: 'num' },
    { key: 'c_ekKwh', label: 'Ek Tüketim Toplamı', unit: 'kWh', group: 'mahsup', type: 'num', dec: 3, calc: ekKwh },
    { key: 'c_ekTutar', label: 'Ek Tüketim Tutarı Toplamı', unit: 'TL', group: 'mahsup', type: 'num', calc: ekTutar },
    { key: 'c_ekBirim', label: 'Ek Tüketim Ort. Birim', unit: 'TL/kWh', group: 'mahsup', type: 'num', dec: 6,
      calc: function (r) { return ratio(ekTutar(r), ekKwh(r)); } },
    { key: 'c_netKwh', label: 'Net Faturalanan Enerji (Aktif + Ek)', unit: 'kWh', group: 'mahsup', type: 'num', dec: 3,
      calc: function (r) { var e = ekKwh(r); return n(r.aktifKwh) !== null ? r.aktifKwh + (e || 0) : null; } },
    { key: 'c_mahsupTL', label: 'Mahsup/İndirim Toplamı (Ek Tük. + GES Diğer)', unit: 'TL', group: 'mahsup', type: 'num',
      calc: function (r) { return sum(ekTutar(r), /ges|mahsup/i.test(r.digerAciklama || '') ? r.digerTutar : null); } },

    // Sistem kullanım
    { key: 'dagitimMiktar', label: 'Dağıtım Miktarı', unit: 'MWh', group: 'skb', type: 'num', dec: 3 },
    { key: 'dagitimBirim', label: 'Dağıtım Birim Fiyat', unit: 'TL/MWh', group: 'skb', type: 'num', dec: 3 },
    { key: 'dagitimTutar', label: 'Dağıtım Bedeli', unit: 'TL', group: 'skb', type: 'num' },
    { key: 'gucMiktar', label: 'Güç (Sözleşme Gücü)', unit: 'kW', group: 'skb', type: 'num', dec: 3 },
    { key: 'gucBirim', label: 'Güç Birim Fiyat', unit: 'TL/kW', group: 'skb', type: 'num', dec: 3 },
    { key: 'gucTutar', label: 'Güç Bedeli', unit: 'TL', group: 'skb', type: 'num' },
    { key: 'skbToplam', label: 'Sistem Kullanım Toplamı', unit: 'TL', group: 'skb', type: 'num' },

    // Diğer
    { key: 'digerTutar', label: 'Diğer Bedel (Mahsup vb.)', unit: 'TL', group: 'diger', type: 'num' },
    { key: 'digerAciklama', label: 'Diğer Bedel Açıklaması', group: 'diger', type: 'text', w: 260 },
    { key: 'oncekiYuvarlama', hidden: true, label: 'Önceki Yuvarlama', unit: 'TL', group: 'diger', type: 'num' },
    { key: 'guncelYuvarlama', hidden: true, label: 'Güncel Yuvarlama', unit: 'TL', group: 'diger', type: 'num' },
    { key: 'muhtelifBedel', hidden: true, label: 'Muhtelif Bedel', unit: 'TL', group: 'diger', type: 'num' },
    { key: 'digerToplam', hidden: true, label: 'Diğer Tutarlar Toplamı', unit: 'TL', group: 'diger', type: 'num' },
    { key: 'bilgilendirme', label: 'Faturadaki Bilgilendirme Notu', group: 'diger', type: 'text', w: 320 },

    // Vergiler
    { key: 'enerjiFonu', label: 'Enerji Fonu', unit: 'TL', group: 'vergi', type: 'num' },
    { key: 'trtPayi', label: 'TRT Fon Payı', unit: 'TL', group: 'vergi', type: 'num' },
    { key: 'btv', label: 'Belediye Tüketim Vergisi', unit: 'TL', group: 'vergi', type: 'num' },
    { key: 'kdvMatrah', label: 'KDV Matrahı (faturada)', unit: 'TL', group: 'vergi', type: 'num' },
    { key: 'kdvOrani', hidden: true, label: 'KDV Oranı', unit: '%', group: 'vergi', type: 'num', dec: 0 },
    { key: 'kdv', hidden: true, label: 'KDV', unit: 'TL', group: 'vergi', type: 'num' },
    { key: 'vergiToplam', label: 'Vergiler Toplamı', unit: 'TL', group: 'vergi', type: 'num' },

    // Toplam
    { key: 'kdvDisiTutar', label: 'KDV Dışı Tutar (önceki yuvarlama vb.)', unit: 'TL', group: 'toplam', type: 'num' },
    { key: 'faturaTutari', label: 'Fatura Tutarı', unit: 'TL', group: 'toplam', type: 'num' },
    { key: 'odenecekTutar', label: 'Ödenecek Tutar', unit: 'TL', group: 'toplam', type: 'num' },

    // Hesaplanan / kontrol
    { key: 'c_fatFark', label: 'Faturalanan − Okunan Enerji', unit: 'kWh', group: 'kontrol', type: 'num', dec: 3,
      calc: function (r) { return diff(sum(r.t1FatKwh, r.t2FatKwh, r.t3FatKwh, r.tekKwh), r.aktifKwh); } },
    { key: 'k_zaman', label: 'Kontrol: T1+T2+T3 − Aktif', unit: 'kWh', group: 'kontrol', type: 'num', dec: 3, check: true, tol: 1,
      calc: function (r) { return diff(sum(r.t1Kwh, r.t2Kwh, r.t3Kwh), r.aktifKwh); } },
    { key: 'c_efektifBirim', label: 'Efektif Enerji Birim Fiyatı', unit: 'TL/kWh', group: 'kontrol', type: 'num', dec: 6,
      calc: function (r) { return ratio(r.enerjiToplam, r.aktifKwh); } },
    { key: 'k_enerji', label: 'Kontrol: Kalemler − Enerji Toplamı', unit: 'TL', group: 'kontrol', type: 'num', check: true, tol: 0.05,
      calc: function (r) { return diff(sum(r.t1Tutar, r.t2Tutar, r.t3Tutar, r.tekTutar, ekTutar(r)), r.enerjiToplam); } },
    { key: 'k_dagitim', label: 'Kontrol: Miktar×Birim − Dağıtım', unit: 'TL', group: 'kontrol', type: 'num', check: true, tol: 1,
      // Birim fiyat faturada 3 haneye yuvarlandığı için tolerans miktarla büyür
      tolFn: function (r) { return Math.max(1, (r.dagitimMiktar || 0) * 0.0005 + 0.01); },
      calc: function (r) { return n(r.dagitimMiktar) !== null && n(r.dagitimBirim) !== null ? r.dagitimMiktar * r.dagitimBirim - r.dagitimTutar : null; } },
    { key: 'c_dagitimKwh', label: 'Dağıtım Bedeli / Aktif Tüketim', unit: 'TL/kWh', group: 'kontrol', type: 'num', dec: 6,
      calc: function (r) { return ratio(r.dagitimTutar, r.aktifKwh); } },
    { key: 'k_vergi', label: 'Kontrol: Fon+BTV+KDV − Vergi Toplamı', unit: 'TL', group: 'kontrol', type: 'num', check: true, tol: 0.05,
      calc: function (r) { return diff(sum(r.enerjiFonu, r.trtPayi, r.btv, r.kdv), r.vergiToplam); } },
    { key: 'k_matrah', label: 'Kontrol: Hesap Matrah − Faturadaki Matrah', unit: 'TL', group: 'kontrol', type: 'num', check: true, tol: 0.05,
      calc: function (r) { return diff(matrah(r), r.kdvMatrah); } },
    { key: 'k_toplam', label: 'Kontrol: Matrah+KDV − Fatura', unit: 'TL', group: 'kontrol', type: 'num', check: true, tol: 0.05,
      calc: function (r) { var m = matrah(r); return m !== null && n(r.faturaTutari) !== null ? m + (r.kdv || 0) + (r.kdvDisiTutar || 0) - r.faturaTutari : null; } },
    { key: 'c_kwhMaliyet', label: 'Ort. Toplam Maliyet (KDV dahil)', unit: 'TL/kWh', group: 'kontrol', type: 'num', dec: 4,
      calc: function (r) { return ratio(r.faturaTutari, r.aktifKwh); } },
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

  // Kayıtta yalnızca tanımlı (hesaplanmayan) alanları ve sistem alanlarını bırakır.
  var SYSTEM_KEYS = { id: 1, tuketimTesisId: 1, kaynak: 1, duzeltilen: 1, olusturma: 1, guncelleme: 1 };
  function pick(record) {
    var out = {};
    Object.keys(record).forEach(function (k) {
      if (SYSTEM_KEYS[k] || (byKey[k] && !byKey[k].calc)) out[k] = record[k];
    });
    return out;
  }

  function checkStatus(field, value, record) {
    if (!field.check || value === null || value === undefined) return null;
    var tol = field.tolFn && record ? field.tolFn(record) : (field.tol || 0.01);
    return Math.abs(value) <= tol ? 'ok' : 'err';
  }

  var api = { GROUPS: GROUPS, FIELDS: FIELDS, byKey: byKey, compute: compute, checkStatus: checkStatus, pick: pick };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.App = root.App || {}; root.App.fields = api; }
})(this);
