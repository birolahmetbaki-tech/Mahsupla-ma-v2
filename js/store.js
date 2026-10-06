/* Veri katmanı: tüm veriler tarayıcıda localStorage'da tek JSON olarak tutulur.
   Yedekleme/taşıma için JSON dışa/içe aktarma vardır. */
(function (root) {
  'use strict';
  var U = root.App.util;
  var KEY = 'mahsupla.db.v1';
  var listeners = [];

  function empty() {
    return { version: 1, tuketimTesisleri: [], uretimTesisleri: [], faturalar: [] };
  }

  var db = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        var e = empty();
        Object.keys(e).forEach(function (k) { if (d[k] === undefined) d[k] = e[k]; });
        migrate(d);
        return d;
      }
    } catch (err) {
      console.error('Veri okunamadı', err);
    }
    return empty();
  }

  // Eski sürüm alan adlarını yenilerine taşır.
  function migrate(d) {
    d.faturalar = d.faturalar.map(function (f) {
      [['ekTuketimKwh', 'ekTekKwh'], ['ekTuketimBirim', 'ekTekBirim'], ['ekTuketimTutar', 'ekTekTutar']].forEach(function (m) {
        if (f[m[0]] !== undefined) { if (f[m[1]] === undefined && f[m[0]]) f[m[1]] = f[m[0]]; delete f[m[0]]; }
      });
      // İlk sürümde fatura satırlarındaki kWh, faturalanan kWh olarak ayrıca tutulmuyordu
      ['t1', 't2', 't3'].forEach(function (z) {
        if (f[z + 'FatKwh'] === undefined && f[z + 'Tutar'] !== undefined && f[z + 'Kwh'] !== undefined) f[z + 'FatKwh'] = f[z + 'Kwh'];
      });
      // Artık saklanmayan alanları at
      return root.App.fields.pick(f);
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
    db.uretimTesisleri = db.uretimTesisleri.filter(function (u) { return u.tuketimTesisId !== id; });
    db.faturalar = db.faturalar.filter(function (f) { return f.tuketimTesisId !== id; });
    save();
  }
  // Faturadaki EIC / sözleşme no ile eşleşen tesisi bulur.
  function tuketimMatch(rec) {
    var clean = function (s) { return String(s || '').replace(/\s/g, '').toUpperCase(); };
    return db.tuketimTesisleri.find(function (t) {
      return (rec.eic && clean(t.eic) === clean(rec.eic)) ||
             (rec.sozlesmeNo && clean(t.sozlesmeNo) === clean(rec.sozlesmeNo));
    }) || null;
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

  // --- Faturalar
  function faturaList(tuketimTesisId) {
    return db.faturalar.filter(function (f) { return f.tuketimTesisId === tuketimTesisId; })
      .sort(function (a, b) { return String(a.donem || '').localeCompare(String(b.donem || '')) || String(a.faturaNo || '').localeCompare(String(b.faturaNo || '')); });
  }
  function faturaGet(id) { return db.faturalar.find(function (f) { return f.id === id; }) || null; }
  function faturaFindDuplicate(tuketimTesisId, rec) {
    return db.faturalar.find(function (f) {
      return f.tuketimTesisId === tuketimTesisId && f.id !== rec.id &&
        ((rec.faturaNo && f.faturaNo === rec.faturaNo) || (!rec.faturaNo && rec.donem && f.donem === rec.donem));
    }) || null;
  }
  function faturaSave(f, silent) {
    f.guncelleme = new Date().toISOString();
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

  // --- Yedekleme
  function exportJSON() { return JSON.stringify(db, null, 2); }
  function importJSON(text, mode) {
    var d = JSON.parse(text);
    if (!d || !Array.isArray(d.tuketimTesisleri)) throw new Error('Geçerli bir Mahsupla yedeği değil.');
    if (mode === 'merge') {
      ['tuketimTesisleri', 'uretimTesisleri', 'faturalar'].forEach(function (k) {
        var ids = {};
        db[k].forEach(function (x) { ids[x.id] = true; });
        (d[k] || []).forEach(function (x) { if (!ids[x.id]) db[k].push(x); });
      });
    } else {
      var e = empty();
      Object.keys(e).forEach(function (k) { if (d[k] === undefined) d[k] = e[k]; });
      migrate(d);
      db = d;
    }
    save();
  }
  function stats() {
    return { tuketim: db.tuketimTesisleri.length, uretim: db.uretimTesisleri.length, fatura: db.faturalar.length,
             bytes: (localStorage.getItem(KEY) || '').length };
  }

  root.App.store = {
    onChange: onChange, save: save,
    tuketimList: tuketimList, tuketimGet: tuketimGet, tuketimSave: tuketimSave, tuketimDelete: tuketimDelete, tuketimMatch: tuketimMatch,
    uretimList: uretimList, uretimGet: uretimGet, uretimSave: uretimSave, uretimDelete: uretimDelete,
    faturaList: faturaList, faturaGet: faturaGet, faturaSave: faturaSave, faturaDelete: faturaDelete, faturaFindDuplicate: faturaFindDuplicate,
    exportJSON: exportJSON, importJSON: importJSON, stats: stats
  };
})(this);
