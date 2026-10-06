/* OSOS (Otomatik Sayaç Okuma Sistemi) saatlik verileri ve saatlik mahsuplaşma hesabı.
   Saatlik seriler ana veritabanından ayrı bir anahtarda saklanır (büyük veri; her hücre düzenlemesinde yeniden yazılmasın).
   Seri sahibi: abonelik (tüketim sayacı) veya üretim tesisi (üretim sayacı).
   Saklama: seriler[sahipId].aylar['YYYY-AA'] = { c: [çekiş kWh], v: [veriş kWh] } ; dizin = (gün-1)*24 + saat (0–23, saat başlangıcı).

   Saatlik mahsuplaşma (her saat ayrı; bir saatin fazlası başka saatin açığını kapatmaz):
     T = seçili aboneliklerin çekiş toplamı, Ü = bağlı üretim sayaçlarının veriş toplamı
     Mahsup = min(Ü, T), İhtiyaç fazlası = max(Ü − T, 0), Net çekiş = max(T − Ü, 0) */
(function (root) {
  'use strict';
  var NODE = typeof require !== 'undefined' && typeof module !== 'undefined';
  var U = NODE ? require('./util.js') : root.App.util;
  var KEY = 'mahsupla.osos.v1';
  var data = NODE ? { seriler: {} } : load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { var d = JSON.parse(raw); d.seriler = d.seriler || {}; return d; }
    } catch (e) {
      console.error('OSOS verisi okunamadı', e);
      try { localStorage.setItem(KEY + '.okunamayan.' + Date.now(), localStorage.getItem(KEY)); } catch (e2) { /* yer yok */ }
    }
    return { seriler: {} };
  }
  function save() {
    if (NODE) return;
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (err) { alert('OSOS verisi kaydedilemedi (tarayıcı depolama alanı dolu olabilir). Lütfen JSON yedek alın ve eski ayları silin.\n' + err.message); }
  }

  function gunSayisi(ay) { var p = ay.split('-'); return new Date(Date.UTC(+p[0], +p[1], 0)).getUTCDate(); }
  function pad(n) { return ('0' + n).slice(-2); }

  // --- Seri işlemleri
  function seri(sahipId) { return data.seriler[sahipId] || null; }
  function seriler() { return Object.keys(data.seriler).map(function (k) { return data.seriler[k]; }); }
  function aylar(sahipIds) {
    var set = {};
    sahipIds.forEach(function (id) { var s = data.seriler[id]; if (s) Object.keys(s.aylar).forEach(function (a) { set[a] = true; }); });
    return Object.keys(set).sort();
  }
  // saatler: [{ ay, idx, c, v }] — verilen saatlerin üzerine yazar
  function ekle(sahipTur, sahipId, saatler, kaynak) {
    var s = data.seriler[sahipId] || (data.seriler[sahipId] = { sahipTur: sahipTur, sahipId: sahipId, aylar: {}, yuklemeler: [] });
    var yeni = 0, guncel = 0;
    saatler.forEach(function (x) {
      var a = s.aylar[x.ay];
      if (!a) {
        var n = gunSayisi(x.ay) * 24;
        a = s.aylar[x.ay] = { c: new Array(n).fill(null), v: new Array(n).fill(null) };
      }
      var vardi = a.c[x.idx] !== null || a.v[x.idx] !== null;
      if (x.c !== null && x.c !== undefined) a.c[x.idx] = x.c;
      if (x.v !== null && x.v !== undefined) a.v[x.idx] = x.v;
      if (vardi) guncel++; else yeni++;
    });
    s.yuklemeler.push(Object.assign({ tarih: new Date().toISOString(), saat: saatler.length }, kaynak || {}));
    save();
    return { yeni: yeni, guncel: guncel };
  }
  function sil(sahipId, ay) {
    var s = data.seriler[sahipId];
    if (!s) return;
    if (ay) delete s.aylar[ay]; else delete data.seriler[sahipId];
    if (s && !Object.keys(s.aylar).length) delete data.seriler[sahipId];
    save();
  }
  function ozet(sahipId) {
    var s = data.seriler[sahipId];
    if (!s) return null;
    var ays = Object.keys(s.aylar).sort(), dolu = 0, toplam = 0, c = 0, v = 0;
    ays.forEach(function (a) {
      var m = s.aylar[a];
      toplam += m.c.length;
      for (var i = 0; i < m.c.length; i++) {
        if (m.c[i] !== null || m.v[i] !== null) dolu++;
        c += m.c[i] || 0; v += m.v[i] || 0;
      }
    });
    return { aylar: ays, doluSaat: dolu, toplamSaat: toplam, cekis: c, veris: v };
  }

  // --- Saatlik mahsuplaşma hesabı
  // tuketimIds: abonelik serileri, uretimIds: üretim tesisi serileri
  function hesaplaAy(ay, tuketimIds, uretimIds) {
    var n = gunSayisi(ay) * 24;
    var uretimVar = uretimIds.some(function (id) { return data.seriler[id] && data.seriler[id].aylar[ay]; });
    var rows = new Array(n);
    var sum = { T: 0, U: 0, mahsup: 0, fazla: 0, net: 0, eksik: 0, saat: n, uretimVar: uretimVar };
    for (var i = 0; i < n; i++) {
      var T = null, Ue = null, eksik = false;
      tuketimIds.forEach(function (id) {
        var m = data.seriler[id] && data.seriler[id].aylar[ay];
        var c = m ? m.c[i] : null;
        if (c === null || c === undefined) eksik = true; else T = (T || 0) + c;
        // Üretim sayacı yoksa: aynı ölçüm noktasında veriş = ihtiyaç fazlası
        if (!uretimVar && m && m.v[i] !== null && m.v[i] !== undefined) Ue = (Ue || 0) + m.v[i];
      });
      if (uretimVar) {
        uretimIds.forEach(function (id) {
          var m = data.seriler[id] && data.seriler[id].aylar[ay];
          var v = m ? m.v[i] : null;
          if (v === null || v === undefined) eksik = true; else Ue = (Ue || 0) + v;
        });
      }
      var r = { idx: i, gun: Math.floor(i / 24) + 1, saat: i % 24, T: T, U: Ue, eksik: eksik };
      if (uretimVar) {
        if (T !== null && Ue !== null) {
          r.mahsup = Math.min(Ue, T); r.fazla = Math.max(Ue - T, 0); r.net = Math.max(T - Ue, 0);
        }
      } else {
        r.mahsup = null; r.fazla = Ue; r.net = T; // aynı ölçüm noktası: sayaç zaten net ölçer
      }
      if (eksik) sum.eksik++;
      sum.T += T || 0; sum.U += Ue || 0; sum.mahsup += r.mahsup || 0; sum.fazla += r.fazla || 0; sum.net += r.net || 0;
      rows[i] = r;
    }
    sum.aylikMahsup = uretimVar ? Math.min(sum.U, sum.T) : null;
    sum.kayip = uretimVar ? sum.aylikMahsup - sum.mahsup : null;
    sum.ozTuketim = uretimVar && sum.U ? sum.mahsup / sum.U : null;
    return { ay: ay, rows: rows, ozet: sum };
  }

  // Saatlik satırları güne toplar
  function gunluk(sonuc) {
    var gunler = [];
    sonuc.rows.forEach(function (r) {
      var g = gunler[r.gun - 1] || (gunler[r.gun - 1] = { gun: r.gun, T: 0, U: 0, mahsup: 0, fazla: 0, net: 0, eksik: 0 });
      g.T += r.T || 0; g.U += r.U || 0; g.mahsup += r.mahsup || 0; g.fazla += r.fazla || 0; g.net += r.net || 0;
      if (r.eksik) g.eksik++;
    });
    return gunler;
  }

  // ---------------------------------------------------------------------------------------------
  // Dosya okuma: tablo (dizi dizileri) → saatlik değerler

  var KELIMELER = {
    tarih: /tarih|date|zaman|d[öo]nem|time/i,
    saat: /^saat|hour|^sa\.?$|zaman aral/i,
    cekis: /[çc]eki[şs]|t[üu]ketim|import|al[ıi]nan|aktif.*\(?\+|^\+?a\+|consum/i,
    veris: /veri[şs]|[üu]retim|export|verilen|aktif.*-|^-?a-|generation/i
  };

  function hucreMetni(v) { return v === null || v === undefined ? '' : (v instanceof Date ? v.toISOString() : String(v)).trim(); }

  // Başlık satırını ve sütunları tahmin eder
  function tahmin(rows) {
    var best = null;
    for (var r = 0; r < Math.min(rows.length, 30); r++) {
      var row = rows[r] || [];
      var cols = {};
      row.forEach(function (cell, i) {
        var t = hucreMetni(cell);
        if (!t || cell instanceof Date || typeof cell === 'number') return;
        // Her sütun en fazla bir role atanır ("Tarih Saat" gibi birleşik başlık tarih sayılır)
        ['tarih', 'saat', 'cekis', 'veris'].some(function (k) {
          if (cols[k] === undefined && KELIMELER[k].test(t)) { cols[k] = i; return true; }
          return false;
        });
      });
      var skor = Object.keys(cols).length;
      if (skor >= 2 && (!best || skor > best.skor)) best = { baslik: r, cols: cols, skor: skor };
    }
    if (!best) {
      // Başlık yok: ilk tarih benzeri sütun + sonraki sayısal sütunlar
      var first = rows.find(function (row) { return row && row.some(function (c) { return c instanceof Date || /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(hucreMetni(c)); }); }) || [];
      var cols2 = {};
      first.forEach(function (c, i) {
        if (cols2.tarih === undefined && (c instanceof Date || /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(hucreMetni(c)))) cols2.tarih = i;
        else if (typeof c === 'number' || /^-?[\d.,]+$/.test(hucreMetni(c))) { if (cols2.cekis === undefined) cols2.cekis = i; else if (cols2.veris === undefined) cols2.veris = i; }
      });
      best = { baslik: -1, cols: cols2, skor: 0 };
    }
    // Tarih sütununda saat de varsa ayrı saat sütununa gerek yok
    return best;
  }

  // Tarih hücresinden {y,m,d,h,mi}; saat hücresi ayrıca verilebilir
  function tarihCoz(v) {
    if (v instanceof Date && !isNaN(v)) return { y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate(), h: v.getHours(), mi: v.getMinutes(), saatVar: v.getHours() || v.getMinutes() ? true : null };
    if (typeof v === 'number' && v > 20000 && v < 80000) { // Excel seri tarih
      var ms = Math.round((v - 25569) * 86400000);
      var dt = new Date(ms);
      return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), h: dt.getUTCHours(), mi: dt.getUTCMinutes(), saatVar: v % 1 ? true : null };
    }
    var s = hucreMetni(v);
    var m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (m) return { y: +m[1], m: +m[2], d: +m[3], h: m[4] !== undefined ? +m[4] : 0, mi: m[5] !== undefined ? +m[5] : 0, saatVar: m[4] !== undefined };
    m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\s+(\d{1,2})[:.](\d{2}))?/);
    if (m) {
      var y = +m[3]; if (y < 100) y += 2000;
      return { y: y, m: +m[2], d: +m[1], h: m[4] !== undefined ? +m[4] : 0, mi: m[5] !== undefined ? +m[5] : 0, saatVar: m[4] !== undefined };
    }
    return null;
  }
  function saatCoz(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return { h: v.getHours(), mi: v.getMinutes() };
    if (typeof v === 'number') {
      if (v >= 0 && v < 1) { var t = Math.round(v * 1440); return { h: Math.floor(t / 60), mi: t % 60 }; } // Excel saat kesri
      if (v >= 0 && v <= 24 && v % 1 === 0) return { h: v, mi: 0 };
    }
    var s = hucreMetni(v);
    var m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?/);
    return m ? { h: +m[1], mi: m[2] ? +m[2] : 0 } : null;
  }

  /* mapping: { baslik, tarih, saat?, cekis?, veris?, birim: 'kWh'|'MWh', carpan, saatTipi: 'otomatik'|'baslangic'|'bitis' }
     Dönüş: { saatler: [{ay, idx, c, v}], ilk, son, satir, atlanan, ceyrek, uyarilar } */
  function cevir(rows, mapping) {
    var kat = (mapping.birim === 'MWh' ? 1000 : 1) * (mapping.carpan || 1);
    var ham = [], atlanan = 0, dakikaVar = false, saat24 = false, saat0 = false;
    for (var r = mapping.baslik + 1; r < rows.length; r++) {
      var row = rows[r];
      if (!row || !row.length) continue;
      var t = tarihCoz(row[mapping.tarih]);
      if (!t) { if (row.some(function (c) { return hucreMetni(c); })) atlanan++; continue; }
      if (mapping.saat !== undefined && mapping.saat !== null && mapping.saat !== '') {
        var sc = saatCoz(row[mapping.saat]);
        if (!sc) { atlanan++; continue; }
        t.h = sc.h; t.mi = sc.mi;
      }
      var c = mapping.cekis !== undefined && mapping.cekis !== '' ? U.parseTRNumber(row[mapping.cekis]) : null;
      var v = mapping.veris !== undefined && mapping.veris !== '' ? U.parseTRNumber(row[mapping.veris]) : null;
      if (c === null && v === null) { atlanan++; continue; }
      if (t.mi) dakikaVar = true;
      if (t.h === 24) saat24 = true;
      if (t.h === 0) saat0 = true;
      ham.push({ t: t, c: c === null ? null : c * kat, v: v === null ? null : v * kat });
    }
    // Saat gösterimi: 1–24 ise "saat sonu" kabul edilir (01:00 → 00:00–01:00 dilimi)
    var bitis = mapping.saatTipi === 'bitis' || (mapping.saatTipi !== 'baslangic' && (saat24 || (!saat0 && !dakikaVar && ham.length > 23)));
    var map = {}, uyarilar = [];
    ham.forEach(function (x) {
      var dt = new Date(Date.UTC(x.t.y, x.t.m - 1, x.t.d, x.t.h, x.t.mi));
      if (bitis) dt = new Date(dt.getTime() - (dakikaVar ? 15 : 60) * 60000);
      var ay = dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1);
      var idx = (dt.getUTCDate() - 1) * 24 + dt.getUTCHours();
      var k = ay + '|' + idx;
      var o = map[k] || (map[k] = { ay: ay, idx: idx, c: null, v: null, n: 0 });
      // 15 dakikalık veriler saate toplanır; aynı saat tekrar ederse son değer geçerli
      if (dakikaVar) { if (x.c !== null) o.c = (o.c || 0) + x.c; if (x.v !== null) o.v = (o.v || 0) + x.v; }
      else { if (o.n) uyarilar.push('tekrar'); if (x.c !== null) o.c = x.c; if (x.v !== null) o.v = x.v; }
      o.n++;
    });
    var saatler = Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return a.ay < b.ay ? -1 : a.ay > b.ay ? 1 : a.idx - b.idx; });
    var tekrar = uyarilar.length;
    var out = { saatler: saatler, satir: ham.length, atlanan: atlanan, ceyrek: dakikaVar, bitis: bitis, uyarilar: [] };
    if (tekrar) out.uyarilar.push(tekrar + ' saat dosyada birden fazla kez geçiyor (son değer alındı).');
    if (saatler.length) {
      out.ilk = saatEtiketi(saatler[0]); out.son = saatEtiketi(saatler[saatler.length - 1]);
    }
    return out;
  }
  function saatEtiketi(x) {
    var p = x.ay.split('-'), g = Math.floor(x.idx / 24) + 1, h = x.idx % 24;
    return pad(g) + '.' + p[1] + '.' + p[0] + ' ' + pad(h) + ':00';
  }

  // Dışa aktarma / yedek
  function exportData() { return data; }
  function importData(d, mode) {
    if (!d || !d.seriler) return;
    if (mode === 'merge') {
      Object.keys(d.seriler).forEach(function (k) { if (!data.seriler[k]) data.seriler[k] = d.seriler[k]; });
    } else data = { seriler: d.seriler };
    save();
  }
  function boyut() { try { return (localStorage.getItem(KEY) || '').length; } catch (e) { return 0; } }

  var api = {
    seri: seri, seriler: seriler, aylar: aylar, ekle: ekle, sil: sil, ozet: ozet,
    hesaplaAy: hesaplaAy, gunluk: gunluk, gunSayisi: gunSayisi,
    tahmin: tahmin, cevir: cevir, tarihCoz: tarihCoz, saatEtiketi: saatEtiketi,
    exportData: exportData, importData: importData, boyut: boyut, _set: function (d) { data = d; }
  };
  if (NODE) module.exports = api;
  else { root.App = root.App || {}; root.App.osos = api; }
})(this);
