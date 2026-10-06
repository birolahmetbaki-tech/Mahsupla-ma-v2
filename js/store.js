/* Veri katmanı: tüm veriler tarayıcıda localStorage'da tek JSON olarak tutulur.
   Yedekleme/taşıma için JSON dışa/içe aktarma vardır.
   Yapı: Tüketim Tesisi → Abonelikler (EIC, abone grubu, faturalar) + Üretim Tesisleri (abonelikIds ile mahsuplaştığı abonelikler). */
(function (root) {
  'use strict';
  var U = root.App.util;
  var KEY = 'mahsupla.db.v1';
  var listeners = [];

  function empty() {
    return { version: 3, tuketimTesisleri: [], abonelikler: [], uretimTesisleri: [], faturalar: [], kalemEslestirme: {}, sablonlar: [] };
  }

  // Eksik koleksiyonları ekler; sürüm numarasına dokunmaz (eski veri sürüm 1 sayılır).
  function fillDefaults(d) {
    var e = empty();
    Object.keys(e).forEach(function (k) { if (k !== 'version' && d[k] === undefined) d[k] = e[k]; });
  }

  var ABONELIK_ALANLARI = ['unvan', 'vkn', 'vergiDairesi', 'aboneGrubu', 'gerilim', 'tarifeTerim', 'tarifeZaman', 'serbestTuketici',
    'tedarikci', 'dagitimSirketi', 'tuketiciGrubuFatura', 'eic', 'sozlesmeNo', 'tesisatNo', 'sozlesmeGucu', 'carpan', 'oncekiYilTuketim'];

  var db = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        fillDefaults(d);
        migrate(d);
        return d;
      }
    } catch (err) {
      console.error('Veri okunamadı', err);
      // Okunamayan veriyi kaybetmemek için ayrı bir anahtara kopyala
      try { localStorage.setItem(KEY + '.okunamayan.' + Date.now(), localStorage.getItem(KEY)); } catch (e2) { /* yer yok */ }
      setTimeout(function () { alert('Kayıtlı veriler okunamadı. Ham veri tarayıcıda ayrıca saklandı; lütfen bu durumu bildirin.\n' + err.message); }, 0);
    }
    return empty();
  }

  // Sürüm 1'de abonelik bilgileri tüketim tesisinin üzerindeydi; her tesis için bir abonelik oluşturulur.
  function migrateV2(d) {
    // load() boş koleksiyonları önceden eklediği için sürüm numarasına bakılır
    if ((d.version || 1) >= 2) return;
    d.abonelikler = d.abonelikler || [];
    d.tuketimTesisleri.forEach(function (t) {
      var a = { id: U.uid('ab'), tuketimTesisId: t.id, ad: t.ad, olusturma: new Date().toISOString() };
      ABONELIK_ALANLARI.forEach(function (k) { if (t[k] !== undefined) { a[k] = t[k]; delete t[k]; } });
      if (t.adres) a.adres = t.adres;
      d.abonelikler.push(a);
      d.faturalar.forEach(function (f) { if (f.tuketimTesisId === t.id && !f.abonelikId) f.abonelikId = a.id; });
      d.uretimTesisleri.forEach(function (u) { if (u.tuketimTesisId === t.id && !u.abonelikIds) u.abonelikIds = [a.id]; });
    });
    d.version = 2;
  }

  // Sürüm 3: faturalar standart özet + kalem listesi + detay yapısına çevrilir (eski ayrıntılı alanlardan kalem üretilir).
  function migrateV3(d) {
    if ((d.version || 1) >= 3) return;
    var K = root.App.kalemler, F = root.App.fields;
    d.faturalar = d.faturalar.map(function (f) {
      var kalemler = f.kalemler || K.fromLegacy(f);
      var duz = f.duzeltilen;
      var rec = F.split(f);
      rec.kalemler = kalemler;
      rec.duzeltilen = {};
      // Eski elle düzeltmeler yalnız standart alanlarda anlamlı
      if (duz) Object.keys(duz).forEach(function (k) { if (F.byKey[k] && !F.byKey[k].calc && ['enerjiBedeli', 'dagitimBedeli', 'digerBedeller', 'mahsupTL', 'mahsupKwh'].indexOf(k) < 0) rec.duzeltilen[k] = true; });
      K.applySummary(rec, d.kalemEslestirme);
      return rec;
    });
    d.version = 3;
  }

  // Eski sürüm alan adlarını yenilerine taşır.
  function migrate(d) {
    migrateV2(d);
    d.faturalar.forEach(function (f) {
      [['ekTuketimKwh', 'ekTekKwh'], ['ekTuketimBirim', 'ekTekBirim'], ['ekTuketimTutar', 'ekTekTutar']].forEach(function (m) {
        if (f[m[0]] !== undefined) { if (f[m[1]] === undefined && f[m[0]]) f[m[1]] = f[m[0]]; delete f[m[0]]; }
      });
      // İlk sürümde fatura satırlarındaki kWh, faturalanan kWh olarak ayrıca tutulmuyordu
      ['t1', 't2', 't3'].forEach(function (z) {
        if (f[z + 'FatKwh'] === undefined && f[z + 'Tutar'] !== undefined && f[z + 'Kwh'] !== undefined) f[z + 'FatKwh'] = f[z + 'Kwh'];
      });
    });
    migrateV3(d);
    d.faturalar.forEach(function (f) {
      (f.kalemler || []).forEach(function (k) { if (typeof k.miktar !== 'number') k.miktarBirimi = null; });
    });
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (err) {
      alert('Veri kaydedilemedi (tarayıcı depolama alanı dolu ya da kapalı olabilir). Lütfen JSON yedek alın.\n' + err.message);
    }
    listeners.forEach(function (fn) { fn(); });
  }

  function onChange(fn) { listeners.push(fn); }

  // --- Tüketim tesisleri
  function tuketimList() { return db.tuketimTesisleri.slice().sort(function (a, b) { return a.ad.localeCompare(b.ad, 'tr'); }); }
  function tuketimGet(id) { return db.tuketimTesisleri.find(function (t) { return t.id === id; }) || null; }
  function tuketimSave(t) {
    if (!t.id) { t.id = U.uid('tt'); t.olusturma = new Date().toISOString(); db.tuketimTesisleri.push(t); }
    else { var i = db.tuketimTesisleri.findIndex(function (x) { return x.id === t.id; }); db.tuketimTesisleri[i] = t; }
    save();
    return t;
  }
  function tuketimDelete(id) {
    db.tuketimTesisleri = db.tuketimTesisleri.filter(function (t) { return t.id !== id; });
    db.abonelikler = db.abonelikler.filter(function (a) { return a.tuketimTesisId !== id; });
    db.uretimTesisleri = db.uretimTesisleri.filter(function (u) { return u.tuketimTesisId !== id; });
    db.faturalar = db.faturalar.filter(function (f) { return f.tuketimTesisId !== id; });
    save();
  }

  // --- Abonelikler
  function abonelikList(tuketimTesisId) {
    return db.abonelikler.filter(function (a) { return !tuketimTesisId || a.tuketimTesisId === tuketimTesisId; })
      .sort(function (a, b) { return String(a.ad || '').localeCompare(String(b.ad || ''), 'tr'); });
  }
  function abonelikGet(id) { return db.abonelikler.find(function (a) { return a.id === id; }) || null; }
  function abonelikSave(a) {
    if (!a.id) { a.id = U.uid('ab'); a.olusturma = new Date().toISOString(); db.abonelikler.push(a); }
    else {
      var i = db.abonelikler.findIndex(function (x) { return x.id === a.id; });
      var eski = db.abonelikler[i];
      db.abonelikler[i] = a;
      // Abonelik başka tesise taşındıysa faturaları da taşı, eski tesisin üretim bağlantılarından çıkar
      if (eski && eski.tuketimTesisId !== a.tuketimTesisId) {
        db.faturalar.forEach(function (f) { if (f.abonelikId === a.id) f.tuketimTesisId = a.tuketimTesisId; });
        db.uretimTesisleri.forEach(function (u) { if (u.abonelikIds) u.abonelikIds = u.abonelikIds.filter(function (x) { return x !== a.id; }); });
      }
    }
    save();
    return a;
  }
  function abonelikDelete(id) {
    db.abonelikler = db.abonelikler.filter(function (a) { return a.id !== id; });
    db.faturalar = db.faturalar.filter(function (f) { return f.abonelikId !== id; });
    db.uretimTesisleri.forEach(function (u) { if (u.abonelikIds) u.abonelikIds = u.abonelikIds.filter(function (x) { return x !== id; }); });
    save();
  }
  // Faturadaki EIC / sözleşme no / tesisat no ile eşleşen aboneliği bulur.
  function abonelikMatch(rec) {
    var clean = function (s) { return String(s || '').replace(/\s/g, '').toUpperCase(); };
    var by = function (key) {
      return rec[key] ? db.abonelikler.find(function (a) { return a[key] && clean(a[key]) === clean(rec[key]); }) : null;
    };
    return by('eic') || by('sozlesmeNo') || by('tesisatNo') || null;
  }

  // --- Üretim tesisleri
  function uretimList(tuketimTesisId) {
    return db.uretimTesisleri.filter(function (u) { return !tuketimTesisId || u.tuketimTesisId === tuketimTesisId; });
  }
  function uretimGet(id) { return db.uretimTesisleri.find(function (u) { return u.id === id; }) || null; }
  function uretimSave(u) {
    if (!u.id) { u.id = U.uid('ut'); u.olusturma = new Date().toISOString(); db.uretimTesisleri.push(u); }
    else { var i = db.uretimTesisleri.findIndex(function (x) { return x.id === u.id; }); db.uretimTesisleri[i] = u; }
    save();
    return u;
  }
  function uretimDelete(id) {
    db.uretimTesisleri = db.uretimTesisleri.filter(function (u) { return u.id !== id; });
    save();
  }

  // --- Faturalar (abonelikId verilirse yalnız o aboneliğin faturaları)
  function faturaList(tuketimTesisId, abonelikId) {
    return db.faturalar.filter(function (f) { return (!tuketimTesisId || f.tuketimTesisId === tuketimTesisId) && (!abonelikId || f.abonelikId === abonelikId); })
      .sort(function (a, b) { return String(a.donem || '').localeCompare(String(b.donem || '')) || String(a.faturaNo || '').localeCompare(String(b.faturaNo || '')); });
  }
  function faturaGet(id) { return db.faturalar.find(function (f) { return f.id === id; }) || null; }
  function faturaFindDuplicate(abonelikId, rec) {
    return db.faturalar.find(function (f) {
      return f.abonelikId === abonelikId && f.id !== rec.id &&
        ((rec.faturaNo && f.faturaNo === rec.faturaNo) || (!rec.faturaNo && rec.donem && f.donem === rec.donem));
    }) || null;
  }
  function faturaSave(f, silent) {
    f.guncelleme = new Date().toISOString();
    if (f.kalemler) root.App.kalemler.applySummary(f, db.kalemEslestirme, sablonHaritasi(f.sablonId));
    if (!f.id) { f.id = U.uid('ft'); f.olusturma = f.guncelleme; db.faturalar.push(f); }
    else {
      var i = db.faturalar.findIndex(function (x) { return x.id === f.id; });
      if (i >= 0) db.faturalar[i] = f; else db.faturalar.push(f);
    }
    if (!silent) save();
    return f;
  }
  function faturaDelete(id) {
    db.faturalar = db.faturalar.filter(function (f) { return f.id !== id; });
    save();
  }

  // --- Eski PDF içe aktarmadan kalan şablonlar: yalnız o faturaların kalem kategorilerini korumak için okunur
  function sablonGet(id) { return db.sablonlar.find(function (s) { return s.id === id; }) || null; }
  function sablonHaritasi(id) {
    var sb = id ? sablonGet(id) : null, m = null, K = root.App.kalemler;
    if (sb) (sb.tanimlar || []).forEach(function (t) { if (t.tur === 'kalem' && t.kategori) { m = m || {}; m[K.norm(t.ad)] = t.kategori; } });
    return m;
  }

  // --- Kalem eşleştirme sözlüğü
  function eslestirme() { return db.kalemEslestirme; }
  // kategori null ise kullanıcı kaydı silinir (varsayılana döner)
  function eslestirmeSet(bicim, ad, kategori, silent) {
    var K = root.App.kalemler;
    var k = K.key(bicim, ad);
    if (!kategori || kategori === K.varsayilan(ad, bicim)) delete db.kalemEslestirme[k];
    else db.kalemEslestirme[k] = kategori;
    recomputeAll(silent);
  }
  // Sözlük değişince tüm faturaların özetini yeniden hesaplar (elle düzeltilen alanlara dokunmaz)
  function recomputeAll(silent) {
    var K = root.App.kalemler;
    db.faturalar.forEach(function (f) { if (f.kalemler) K.applySummary(f, db.kalemEslestirme, sablonHaritasi(f.sablonId)); });
    if (!silent) save();
  }
  // Kayıtlı faturalarda geçen tüm kalem adları (biçim bazında), örnek tutar ve sayı ile
  function kalemAdlari() {
    var K = root.App.kalemler, map = {};
    db.faturalar.forEach(function (f) {
      (f.kalemler || []).forEach(function (k) {
        var key = K.key(f.bicim, k.ad);
        if (!map[key]) map[key] = { bicim: f.bicim || 'genel', ad: k.ad, adet: 0, toplam: 0 };
        map[key].adet++;
        map[key].toplam += k.tutar || 0;
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return a.bicim.localeCompare(b.bicim) || a.ad.localeCompare(b.ad, 'tr'); });
  }

  // --- Yedekleme
  // Yedek, ayrı anahtarda tutulan OSOS saatlik verilerini de içerir
  function exportJSON() {
    var out = Object.assign({}, db);
    if (root.App.osos) out.osos = root.App.osos.exportData();
    return JSON.stringify(out);
  }
  function importJSON(text, mode) {
    var d = JSON.parse(text);
    if (!d || !Array.isArray(d.tuketimTesisleri)) throw new Error('Geçerli bir Mahsupla yedeği değil.');
    if (d.osos) { if (root.App.osos) root.App.osos.importData(d.osos, mode); delete d.osos; }
    fillDefaults(d);
    if (mode === 'merge') {
      migrate(d);
      ['tuketimTesisleri', 'abonelikler', 'uretimTesisleri', 'faturalar'].forEach(function (k) {
        var ids = {};
        db[k].forEach(function (x) { ids[x.id] = true; });
        (d[k] || []).forEach(function (x) { if (!ids[x.id]) db[k].push(x); });
      });
      Object.keys(d.kalemEslestirme || {}).forEach(function (k) { if (!db.kalemEslestirme[k]) db.kalemEslestirme[k] = d.kalemEslestirme[k]; });
      (d.sablonlar || []).forEach(function (sb) { if (!sablonGet(sb.id)) db.sablonlar.push(sb); });
      recomputeAll(true);
    } else {
      migrate(d);
      db = d;
    }
    save();
  }
  function stats() {
    return { tuketim: db.tuketimTesisleri.length, abonelik: db.abonelikler.length, uretim: db.uretimTesisleri.length, fatura: db.faturalar.length,
             bytes: (localStorage.getItem(KEY) || '').length };
  }

  root.App.store = {
    onChange: onChange, save: save,
    tuketimList: tuketimList, tuketimGet: tuketimGet, tuketimSave: tuketimSave, tuketimDelete: tuketimDelete,
    abonelikList: abonelikList, abonelikGet: abonelikGet, abonelikSave: abonelikSave, abonelikDelete: abonelikDelete, abonelikMatch: abonelikMatch,
    uretimList: uretimList, uretimGet: uretimGet, uretimSave: uretimSave, uretimDelete: uretimDelete,
    faturaList: faturaList, faturaGet: faturaGet, faturaSave: faturaSave, faturaDelete: faturaDelete, faturaFindDuplicate: faturaFindDuplicate,
    eslestirme: eslestirme, eslestirmeSet: eslestirmeSet, recomputeAll: recomputeAll, kalemAdlari: kalemAdlari,
    exportJSON: exportJSON, importJSON: importJSON, stats: stats
  };
})(this);
