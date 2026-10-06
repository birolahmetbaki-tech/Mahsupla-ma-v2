/* Standart fatura özeti alanları. Her tedarikçinin faturası bu alanlara indirgenir; Veriler sayfası,
   yükleme önizlemesi ve CSV dışa aktarımı bu listeyi kullanır.
   Bedel alanları (enerji, dağıtım, diğer, mahsup, BTV, KDV) fatura kalemlerinin kategori toplamlarıdır (bkz. kalemler.js).
   Faturadan okunan diğer bilgiler (endeksler, demand, reaktif, yıllık tüketim ...) kayıtta "detay" altında saklanır.
   type: text | date | month | num ; dec: ondalık hane ; calc: hesaplanan (salt okunur) ;
   hidden: saklanır ve eşleştirme/uyarılarda kullanılır, tabloda gösterilmez ; check: kontrol alanı. */
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
  function kdvHaric(r) { return sum(r.enerjiBedeli, r.mahsupTL, r.dagitimBedeli, r.digerBedeller, r.btv); }

  var GROUPS = [
    { id: 'genel', label: 'Genel' },
    { id: 'tuketim', label: 'Tüketim' },
    { id: 'bedel', label: 'Bedeller' },
    { id: 'mahsup', label: 'GES Mahsup' },
    { id: 'vergi', label: 'Vergi ve Toplam' },
    { id: 'kontrol', label: 'Hesaplanan / Kontrol' }
  ];

  var FIELDS = [
    // Genel
    { key: 'donem', label: 'Dönem', group: 'genel', type: 'month', w: 80 },
    { key: 'faturaNo', label: 'Fatura No', group: 'genel', type: 'text', w: 140 },
    { key: 'faturaTarihi', label: 'Fatura Tarihi', group: 'genel', type: 'date', w: 90 },
    { key: 'tedarikci', label: 'Tedarikçi', group: 'genel', type: 'text', w: 180 },
    { key: 'gunSayisi', label: 'Gün Sayısı', unit: 'gün', group: 'genel', type: 'num', dec: 0, w: 70 },

    // Tüketim (sayaçtan okunan, şebekeden çekilen)
    { key: 'aktifKwh', label: 'Çekilen Enerji', unit: 'kWh', group: 'tuketim', type: 'num', dec: 3 },
    { key: 't1Kwh', label: 'Gündüz (T1)', unit: 'kWh', group: 'tuketim', type: 'num', dec: 3 },
    { key: 't2Kwh', label: 'Puant (T2)', unit: 'kWh', group: 'tuketim', type: 'num', dec: 3 },
    { key: 't3Kwh', label: 'Gece (T3)', unit: 'kWh', group: 'tuketim', type: 'num', dec: 3 },

    // Bedeller (kalem toplamları)
    { key: 'enerjiBedeli', label: 'Enerji Bedeli (mahsup öncesi)', unit: 'TL', group: 'bedel', type: 'num' },
    { key: 'dagitimBedeli', label: 'Dağıtım Bedeli', unit: 'TL', group: 'bedel', type: 'num' },
    { key: 'digerBedeller', label: 'Diğer Bedeller', unit: 'TL', group: 'bedel', type: 'num' },

    // GES mahsup
    { key: 'mahsupKwh', label: 'GES Mahsubu', unit: 'kWh', group: 'mahsup', type: 'num', dec: 3 },
    { key: 'mahsupTL', label: 'GES Mahsubu / İndirim', unit: 'TL', group: 'mahsup', type: 'num' },

    // Vergi ve toplam
    { key: 'btv', label: 'BTV', unit: 'TL', group: 'vergi', type: 'num' },
    { key: 'kdv', label: 'KDV', unit: 'TL', group: 'vergi', type: 'num' },
    { key: 'faturaTutari', label: 'Fatura Tutarı', unit: 'TL', group: 'vergi', type: 'num' },

    // Arka planda tutulanlar (eşleştirme ve uyarılar için)
    { key: 'bicim', label: 'Fatura Biçimi', group: 'genel', type: 'text', hidden: true },
    { key: 'eic', label: 'EIC Kodu', group: 'genel', type: 'text', hidden: true },
    { key: 'sozlesmeNo', label: 'Sözleşme / Hesap No', group: 'genel', type: 'text', hidden: true },
    { key: 'tesisatNo', label: 'Tesisat No', group: 'genel', type: 'text', hidden: true },
    { key: 'tuketiciGrubu', label: 'Tüketici Grubu', group: 'genel', type: 'text', hidden: true },
    { key: 'ilkOkuma', label: 'İlk Okuma', group: 'genel', type: 'date', hidden: true },
    { key: 'sonOkuma', label: 'Son Okuma', group: 'genel', type: 'date', hidden: true },
    { key: 'kdvOrani', label: 'KDV Oranı', unit: '%', group: 'vergi', type: 'num', dec: 0, hidden: true },
    { key: 'bilgilendirme', label: 'Faturadaki Bilgilendirme Notu', group: 'genel', type: 'text', hidden: true },

    // Hesaplanan / kontrol
    { key: 'c_netKwh', label: 'Net Enerji (Çekilen + Mahsup)', unit: 'kWh', group: 'kontrol', type: 'num', dec: 3,
      calc: function (r) { return n(r.aktifKwh) !== null ? r.aktifKwh + (n(r.mahsupKwh) || 0) : null; } },
    { key: 'c_enerjiBirim', label: 'Enerji Birim Fiyatı', unit: 'TL/kWh', group: 'kontrol', type: 'num', dec: 6,
      calc: function (r) { return ratio(r.enerjiBedeli, r.aktifKwh); } },
    { key: 'c_mahsupBirim', label: 'Mahsup Birim Fiyatı', unit: 'TL/kWh', group: 'kontrol', type: 'num', dec: 6,
      calc: function (r) { return ratio(r.mahsupTL, r.mahsupKwh); } },
    { key: 'c_dagitimBirim', label: 'Dağıtım Bedeli / Çekilen Enerji', unit: 'TL/kWh', group: 'kontrol', type: 'num', dec: 6,
      calc: function (r) { return ratio(r.dagitimBedeli, r.aktifKwh); } },
    { key: 'c_kdvHaric', label: 'KDV Hariç Toplam', unit: 'TL', group: 'kontrol', type: 'num', calc: kdvHaric },
    { key: 'c_netBirim', label: 'Net Maliyet (KDV hariç) / Çekilen', unit: 'TL/kWh', group: 'kontrol', type: 'num', dec: 6,
      calc: function (r) { return ratio(kdvHaric(r), r.aktifKwh); } },
    { key: 'k_zaman', label: 'Kontrol: T1+T2+T3 − Çekilen', unit: 'kWh', group: 'kontrol', type: 'num', dec: 3, check: true, tol: 1,
      calc: function (r) { return diff(sum(r.t1Kwh, r.t2Kwh, r.t3Kwh), r.aktifKwh); } },
    { key: 'k_toplam', label: 'Kontrol: Kalemler + KDV − Fatura Tutarı', unit: 'TL', group: 'kontrol', type: 'num', check: true, tol: 0.05,
      calc: function (r) { var k = kdvHaric(r); return k !== null && n(r.faturaTutari) !== null ? k + (n(r.kdv) || 0) - r.faturaTutari : null; } },
    { key: 'k_kdv', label: 'Kontrol: KDV Hariç × Oran − KDV', unit: 'TL', group: 'kontrol', type: 'num', check: true, tol: 1,
      calc: function (r) { var k = kdvHaric(r); return k !== null && n(r.kdv) !== null ? k * (n(r.kdvOrani) || 20) / 100 - r.kdv : null; } }
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

  function checkStatus(field, value, record) {
    if (!field.check || value === null || value === undefined) return null;
    var tol = field.tolFn && record ? field.tolFn(record) : (field.tol || 0.01);
    return Math.abs(value) <= tol ? 'ok' : 'err';
  }

  // Kayıt sistem alanları: standart alan değildir ama korunur
  var SYSTEM_KEYS = { id: 1, tuketimTesisId: 1, abonelikId: 1, kaynak: 1, duzeltilen: 1, olusturma: 1, guncelleme: 1, kalemler: 1, detay: 1, sablonId: 1 };

  // Fatura penceresinde gösterilen alan anlamları
  var ACIKLAMA = {
    donem: 'Faturanın ait olduğu ay (YYYY-AA). Faturada yazmıyorsa okuma tarihlerinden hesaplanır.',
    faturaNo: 'Faturanın seri/sıra numarası; aynı faturanın iki kez kaydedilmesini önler.',
    faturaTarihi: 'Faturanın düzenlendiği tarih.',
    tedarikci: 'Faturayı kesen elektrik tedarik şirketi.',
    gunSayisi: 'İlk ve son okuma arasındaki gün sayısı.',
    aktifKwh: 'Sayaçtan okunan, şebekeden çekilen toplam aktif enerji.',
    t1Kwh: 'Gündüz zaman dilimi (06–17) çekilen enerji.',
    t2Kwh: 'Puant zaman dilimi (17–22) çekilen enerji.',
    t3Kwh: 'Gece zaman dilimi (22–06) çekilen enerji.',
    faturaTutari: 'KDV dahil fatura toplamı.',
    eic: 'Sayacın EIC kodu; faturayı aboneliğe eşleştirmek için kullanılır.',
    sozlesmeNo: 'Tedarikçideki sözleşme / hesap numarası.',
    tesisatNo: 'Dağıtım şirketi tesisat numarası.',
    tuketiciGrubu: 'Tarife / abone grubu (ör. Sanayi OG Tek Terim).',
    ilkOkuma: 'Sayacın ilk okuma tarihi.',
    sonOkuma: 'Sayacın son okuma tarihi.',
    kdvOrani: 'Uygulanan KDV oranı (%).',
    bilgilendirme: 'Faturadaki açıklama / bilgilendirme notu.'
  };

  // Kalem listesinde zaten bulunan tutar alanları detay'a yazılmaz
  var KALEMDE_OLAN = /^(t[123]|tek|ekT[123]|ekTek)(Tutar|Birim|FatKwh|Kwh)$|^(dagitim|guc)(Tutar|Miktar|Birim)$|^(reaktifTutar|gucAsimTutar|digerTutar|digerToplam|digerAciklama|muhtelifBedel|kesmeBaglama|tenzilBedeli|oncekiYuvarlama|guncelYuvarlama|enerjiFonu|trtPayi|enerjiToplam|skbToplam|kdvDisiTutar|enerjiBedeli|dagitimBedeli|digerBedeller|mahsupKwh|mahsupTL)$/;

  // Ayrıştırıcı (veya eski sürüm) kaydını standart alanlar + detay olarak ayırır; standart olmayan bilgiler detay'a gider.
  function split(raw) {
    var out = { detay: Object.assign({}, raw.detay || {}) };
    Object.keys(raw).forEach(function (k) {
      if (k === 'detay') return;
      if (SYSTEM_KEYS[k]) out[k] = raw[k];
      else if (byKey[k] && !byKey[k].calc) out[k] = raw[k];
      else if (!KALEMDE_OLAN.test(k) && raw[k] !== undefined && raw[k] !== null && raw[k] !== '') out.detay[k] = raw[k];
    });
    return out;
  }

  // Detay anahtarlarının okunur adları
  var DETAY_ADLARI = {
    aktifIlk: 'Aktif ilk endeks', aktifSon: 'Aktif son endeks', t1Ilk: 'Gündüz ilk endeks', t1Son: 'Gündüz son endeks',
    t2Ilk: 'Puant ilk endeks', t2Son: 'Puant son endeks', t3Ilk: 'Gece ilk endeks', t3Son: 'Gece son endeks',
    endIlk: 'Endüktif ilk endeks', endSon: 'Endüktif son endeks', kapIlk: 'Kapasitif ilk endeks', kapSon: 'Kapasitif son endeks',
    enduktifKvarh: 'Endüktif (kVArh)', kapasitifKvarh: 'Kapasitif (kVArh)', carpan: 'Çarpan', demand: 'Demand (endeks)',
    anlasmaGucu: 'Anlaşma gücü (kW)', gecmisYilKwh: 'Geçmiş yıl tüketim (kWh)', cariYilKwh: 'Cari yıl tüketim (kWh)',
    ortGunlukKwh: 'Ort. günlük tüketim (kWh)', sonOdemeTarihi: 'Son ödeme tarihi', odenecekTutar: 'Ödenecek tutar (TL)',
    kdvMatrah: 'KDV matrahı (faturada, TL)', vergiToplam: 'Vergiler toplamı (TL)'
  };

  var api = { GROUPS: GROUPS, FIELDS: FIELDS, byKey: byKey, compute: compute, checkStatus: checkStatus, split: split, SYSTEM_KEYS: SYSTEM_KEYS, DETAY_ADLARI: DETAY_ADLARI, ACIKLAMA: ACIKLAMA };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.App = root.App || {}; root.App.fields = api; }
})(this);
