/* Fatura penceresi: yüklenen faturayı görüntüler, şablondaki tanımları faturanın üzerinde işaretler ve düzenletir.
   Solda fatura (PDF görüntüsü + tıklanabilir değer kutuları), sağda tanımlar, tanımlanmamış satırlar ve kontroller.
   Yalnız tanımlı değerler içeri aktarılır. */
(function (root) {
  'use strict';
  var App = root.App, U = App.util, S = App.store, UI = App.ui, F = App.fields, K = App.kalemler, SB = App.sablon;

  // Elle seçilebilecek fatura alanları (bedel toplamları kalemlerden hesaplandığı için listede yok)
  var ALAN_SECENEKLERI = ['donem', 'faturaNo', 'faturaTarihi', 'tedarikci', 'gunSayisi', 'aktifKwh', 't1Kwh', 't2Kwh', 't3Kwh', 'faturaTutari',
    'eic', 'sozlesmeNo', 'tesisatNo', 'tuketiciGrubu', 'ilkOkuma', 'sonOkuma', 'kdvOrani', 'bilgilendirme'];
  var ZORUNLU = ['donem', 'faturaNo', 'aktifKwh', 'faturaTutari'];
  var VARSAYILAN_TUR = { faturaTarihi: 'tarih', ilkOkuma: 'tarih', sonOkuma: 'tarih', donem: 'donem', faturaNo: 'metin', eic: 'metin', sozlesmeNo: 'metin',
    tesisatNo: 'metin', tuketiciGrubu: 'metin', tedarikci: 'metin', bilgilendirme: 'metin' };
  var RENK = { alan: 'alan', kalem: 'kalem', detay: 'detay' };

  var st = null; // { q, sablon, sonuc, olcek, secili }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function fmtDeger(hedef, v) {
    if (v === null || v === undefined || v === '') return '';
    var f = F.byKey[hedef];
    if (typeof v === 'number') return U.formatTRNumber(v, f && f.dec !== undefined ? f.dec : (Math.abs(v) % 1 ? 3 : 0));
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return U.formatTRDate(v);
    if (/^\d{4}-\d{2}$/.test(v)) return U.donemLabel(v);
    return String(v);
  }
  function para(v) { return typeof v === 'number' ? U.formatTRNumber(v, 2) : ''; }

  /* q: yükleme kuyruğundaki fatura { pdf, inv, parsed, sablon, abId }
     opts: { onKaydet(q), onSablon(sablon), abonelikSelect(seçili) → <select> } */
  function ac(q, opts) {
    st = { q: q, opts: opts, sablon: q.sablon ? clone(q.sablon) : yeniSablon(q), olcek: 1.25, degisti: false };
    if (!q.sablon) st.yeni = true;
    yenidenUygula();
    var m = document.getElementById('modal');
    m.innerHTML = '';
    var box = UI.el('div', { class: 'modal-box fatura-pencere', role: 'dialog', 'aria-modal': 'true' });
    box.innerHTML =
      '<div class="modal-head"><h3>Fatura: ' + U.escapeHtml(q.name) + '</h3><button class="icon-btn modal-x" title="Kapat">&times;</button></div>' +
      '<div class="fp-body"><div class="fp-sol"><div class="fp-araclar"><button class="btn xs" data-zoom="-">−</button><span class="fp-olcek"></span><button class="btn xs" data-zoom="+">+</button><label><input type="checkbox" class="fp-adlar" checked> Adları göster</label>' +
      '<span class="fp-lejant"><i class="lj alan"></i>Fatura bilgisi <i class="lj kalem"></i>Bedel kalemi <i class="lj detay"></i>Ek bilgi <i class="lj tanimsiz"></i>Tanımlanmamış <i class="lj yoksay"></i>Yok sayılan</span></div>' +
      '<div class="fp-gorunum"><div class="fp-sayfa"><canvas></canvas><div class="fp-katman"></div></div></div></div>' +
      '<div class="fp-sag"></div></div>' +
      '<div class="modal-foot"><span class="fp-durum"></span><button class="btn" data-act="kapat">Kapat</button><button class="btn" data-act="sablon">Şablonu kaydet</button>' +
      '<button class="btn primary" data-act="aktar">Şablonu kaydet ve faturayı içe aktar</button></div>';
    m.appendChild(box);
    m.classList.add('open');
    m.onclick = null;
    box.querySelector('.modal-x').onclick = kapat;
    box.querySelector('[data-act="kapat"]').onclick = kapat;
    box.querySelector('[data-act="sablon"]').onclick = function () { sablonKaydet(); UI.toast('Şablon kaydedildi: ' + st.sablon.ad, 'ok'); ciz(); };
    box.querySelector('[data-act="aktar"]').onclick = aktar;
    box.querySelectorAll('[data-zoom]').forEach(function (b) {
      b.onclick = function () { st.olcek = Math.max(0.6, Math.min(2.5, st.olcek + (b.dataset.zoom === '+' ? 0.15 : -0.15))); sayfaCiz(); };
    });
    st.box = box;
    box.querySelector('.fp-adlar').onchange = function (e) { box.querySelector('.fp-katman').classList.toggle('etiketsiz', !e.target.checked); };
    // Sağ paneldeki silme ve kategori değişiklikleri (bir kez bağlanır)
    var sag = box.querySelector('.fp-sag');
    sag.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sil]');
      if (!b) return;
      var t = st.sablon.tanimlar.filter(function (x) { return x.id === b.dataset.sil; })[0];
      if (t) tanimSil(t);
    });
    sag.addEventListener('change', function (e) {
      var s = e.target.closest('[data-kat]');
      if (!s) return;
      var t = st.sablon.tanimlar.filter(function (x) { return x.id === s.dataset.kat; })[0];
      if (t) { t.kategori = s.value; S.eslestirmeSet(st.sablon.id, t.ad, null, true); degisti(); }
    });
    box.querySelector('.fp-gorunum').addEventListener('click', function (e) {
      if (!e.target.closest('.fp-pop') && !e.target.closest('.fp-kutu')) { var p = box.querySelector('.fp-pop'); if (p) p.remove(); }
    });
    sayfaCiz();
    ciz();
  }

  function kapat() {
    var m = document.getElementById('modal');
    m.classList.remove('open'); m.innerHTML = '';
    if (st && st.degisti && st.opts.onKapat) st.opts.onKapat();
    st = null;
  }

  function yeniSablon(q) {
    var p = q.parsed && q.parsed.meta || {};
    var ted = q.parsed && q.parsed.record.tedarikci;
    return { id: 'sablon_' + Date.now().toString(36), ad: ted || 'Yeni şablon', anahtarlar: p.tedarikciVkn ? [p.tedarikciVkn] : (ted ? [ted] : []), tanimlar: [] };
  }

  function yenidenUygula() {
    st.sonuc = SB.uygula(st.q.inv.items, st.q.inv.width, st.sablon, S.eslestirme());
    st.calc = F.compute(st.sonuc.record);
  }

  // --- Sol: fatura görüntüsü ve değer kutuları
  function sayfaCiz() {
    var q = st.q, box = st.box;
    box.querySelector('.fp-olcek').textContent = Math.round(st.olcek * 100) + ' %';
    var canvas = box.querySelector('canvas');
    if (!q.pdf) { canvas.style.display = 'none'; katmanCiz(); return; }
    q.pdf.getPage(q.inv.pageFrom).then(function (page) {
      var vp = page.getViewport({ scale: st.olcek });
      var dpr = root.devicePixelRatio || 1;
      canvas.width = vp.width * dpr; canvas.height = vp.height * dpr;
      canvas.style.width = vp.width + 'px'; canvas.style.height = vp.height + 'px';
      var ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return page.render({ canvasContext: ctx, viewport: vp }).promise;
    }).then(katmanCiz).catch(function (e) { console.error(e); katmanCiz(); });
  }

  function katmanCiz() {
    if (!st) return;
    var kat = st.box.querySelector('.fp-katman'), s = st.olcek, son = st.sonuc;
    kat.innerHTML = '';
    var sayfa = st.box.querySelector('.fp-sayfa');
    sayfa.style.width = (st.q.inv.width * s) + 'px';
    sayfa.style.height = ((st.q.inv.height || 842) * s) + 'px';
    var ogeTur = new Map(), etiketler = [];
    son.bulunan.forEach(function (b) {
      b.ogeler.forEach(function (o) { ogeTur.set(o, b); });
      if (b.ogeler[0]) etiketler.push({ o: b.ogeler[0], ad: tanimAdi(b.tanim), tur: b.tanim.tur });
    });
    var tanimsiz = new Set(son.tanimsiz), yoksay = new Set(son.yoksayilan);
    son.lines.forEach(function (l) {
      l.degerler.forEach(function (o) {
        var b = ogeTur.get(o);
        var cls = b ? RENK[b.tanim.tur] : yoksay.has(l) ? 'yoksay' : tanimsiz.has(l) && SB.PARA_RE.test(String(o.str).trim()) ? 'tanimsiz' : 'serbest';
        var d = UI.el('div', { class: 'fp-kutu ' + cls, title: (b ? tanimAdi(b.tanim) + ': ' : '') + String(o.str) });
        d.style.left = (o.x * s - 1) + 'px';
        d.style.top = ((o.y - o.h) * s - 1) + 'px';
        d.style.width = (Math.max(o.w, 4) * s + 2) + 'px';
        d.style.height = (o.h * s + 3) + 'px';
        d.onclick = function (e) { e.stopPropagation(); popover(l, o, b, d); };
        kat.appendChild(d);
      });
    });
    etiketler.forEach(function (e) {
      var t = UI.el('span', { class: 'fp-etiket ' + e.tur }, U.escapeHtml(e.ad));
      t.style.left = (e.o.x * s) + 'px';
      t.style.top = ((e.o.y - e.o.h) * s - 13) + 'px';
      kat.appendChild(t);
    });
  }

  function tanimAdi(t) {
    if (t.tur === 'alan' || t.tur === 'kural' || t.tur === 'sabit') return (F.byKey[t.hedef] || {}).label || t.hedef;
    return t.ad || t.etiketMetni || t.etiket;
  }

  // --- Değer kutusuna tıklayınca: tanımla / değiştir / kaldır
  function popover(l, o, mevcut, kutu) {
    var eski = st.box.querySelector('.fp-pop');
    if (eski) eski.remove();
    var tok = String(o.str).trim();
    var sayilar = SB.sayiOgeleri(l), sayiSira = sayilar.indexOf(o);
    var tarihSira = l.degerler.filter(function (x) { return /\d{1,2}\s*[.\-/]\s*\d{1,2}/.test(String(x.str)); }).indexOf(o);
    var tip = sayiSira >= 0 && !/[.\-/]\d{2}[.\-/]/.test(tok) ? 'sayi' : (/\d{1,2}[.\-/ ]+\d{1,2}[.\-/ ]+\d{4}/.test(l.degerMetni) ? 'tarih' : 'metin');
    var yoksayT = st.sablon.tanimlar.filter(function (t) { return t.tur === 'yoksay' && t.kolon === l.kolon && t.etiket === l.etiketNorm; })[0];
    var kalemT = st.sablon.tanimlar.filter(function (t) { return t.tur === 'kalem' && t.kolon === l.kolon && t.etiket === l.etiketNorm; })[0];
    var mt = mevcut ? mevcut.tanim : (kalemT || yoksayT || null);
    var varsayilanTur = mt ? mt.tur : (SB.PARA_RE.test(tok) ? 'kalem' : 'alan');

    var pop = UI.el('div', { class: 'fp-pop' });
    var alanOpts = ALAN_SECENEKLERI.map(function (k) { return '<option value="' + k + '"' + (mt && mt.hedef === k ? ' selected' : '') + '>' + U.escapeHtml(F.byKey[k].label) + '</option>'; }).join('');
    var katOpts = K.KATEGORILER.map(function (k) { return '<option value="' + k.id + '"' + ((mt && mt.kategori === k.id) || (!mt && k.id === (K.varsayilan(l.etiket, st.sablon.id) || 'diger')) ? ' selected' : '') + '>' + U.escapeHtml(k.label) + '</option>'; }).join('');
    pop.innerHTML =
      '<div class="fp-pop-head"><b>' + U.escapeHtml(l.etiket || '(etiketsiz satır)') + '</b><button class="icon-btn" data-x>&times;</button></div>' +
      '<div class="fp-pop-satir">Seçilen değer: <code>' + U.escapeHtml(tok) + '</code> · satırdaki değerler: ' + l.degerler.map(function (x) { return '<code' + (x === o ? ' class="sec"' : '') + '>' + U.escapeHtml(String(x.str).trim()) + '</code>'; }).join(' ') + '</div>' +
      '<div class="fp-turler">' + [['alan', 'Fatura bilgisi'], ['kalem', 'Bedel kalemi'], ['detay', 'Ek bilgi'], ['yoksay', 'Yok say']].map(function (t) {
        return '<label><input type="radio" name="fptur" value="' + t[0] + '"' + (varsayilanTur === t[0] ? ' checked' : '') + '> ' + t[1] + '</label>';
      }).join('') + '</div>' +
      '<div class="fp-tur-alan"><label>Alan <select data-f="hedef">' + alanOpts + '</select></label><p class="help fp-anlam"></p></div>' +
      '<div class="fp-tur-kalem"><label>Kalem adı <input data-f="kalemAd" value="' + U.escapeHtml(mt && mt.tur === 'kalem' ? mt.ad : l.etiket) + '"></label>' +
      '<label>Kategori <select data-f="kategori">' + katOpts + '</select></label>' +
      '<label>Miktar birimi <select data-f="miktarBirimi">' + ['kWh', 'MWh', 'kW', 'kVArh'].map(function (b) { return '<option' + (mt && mt.miktarBirimi === b ? ' selected' : '') + '>' + b + '</option>'; }).join('') + '</select></label>' +
      '<p class="help">Bu etiketi taşıyan her satır kalem olarak alınır: 3 değer varsa miktar, birim fiyat, tutar; tek değer varsa tutar.</p></div>' +
      '<div class="fp-tur-detay"><label>Bilgi adı <input data-f="detayAd" value="' + U.escapeHtml(mt && mt.tur === 'detay' ? mt.ad : l.etiket) + '"></label></div>' +
      '<div class="fp-tur-deger"><label>Değer türü <select data-f="deger">' + [['sayi', 'Sayı'], ['tarih', 'Tarih'], ['donem', 'Dönem (AA-YYYY)'], ['metin', 'Metin']].map(function (d) {
        return '<option value="' + d[0] + '"' + ((mt && mt.deger === d[0]) || (!mt && d[0] === tip) ? ' selected' : '') + '>' + d[1] + '</option>'; }).join('') + '</select></label>' +
      '<label>Sayı biçimi <select data-f="sayiBicimi"><option value="tr"' + ((mt && mt.sayiBicimi === 'tr') || (!mt && SB.bicimTahmin(tok, l) === 'tr') ? ' selected' : '') + '>1.234,56</option><option value="nokta"' + ((mt && mt.sayiBicimi === 'nokta') || (!mt && SB.bicimTahmin(tok, l) === 'nokta') ? ' selected' : '') + '>1234.56</option></select></label>' +
      '<p class="fp-onizleme"></p></div>' +
      '<div class="fp-pop-foot">' + (mt ? '<button class="btn sm danger" data-sil>Tanımı kaldır</button>' : '') + '<button class="btn sm primary" data-ok>' + (mt ? 'Güncelle' : 'Tanımla') + '</button></div>';
    st.box.querySelector('.fp-gorunum').appendChild(pop);
    var r = kutu.getBoundingClientRect(), g = st.box.querySelector('.fp-gorunum').getBoundingClientRect();
    var gv = st.box.querySelector('.fp-gorunum');
    pop.style.left = Math.min(r.left - g.left + gv.scrollLeft, gv.scrollWidth - 360) + 'px';
    pop.style.top = (r.bottom - g.top + gv.scrollTop + 6) + 'px';

    function tur() { return pop.querySelector('input[name=fptur]:checked').value; }
    function sec() {
      var t = tur();
      var hedef = pop.querySelector('[data-f=hedef]').value;
      if (t === 'alan' && !mt && VARSAYILAN_TUR[hedef] && pop.dataset.hedefDegisti) pop.querySelector('[data-f=deger]').value = VARSAYILAN_TUR[hedef];
      var deger = pop.querySelector('[data-f=deger]').value;
      return {
        tur: t, hedef: hedef, ad: t === 'kalem' ? pop.querySelector('[data-f=kalemAd]').value.trim() : pop.querySelector('[data-f=detayAd]').value.trim(),
        kategori: pop.querySelector('[data-f=kategori]').value, miktarBirimi: pop.querySelector('[data-f=miktarBirimi]').value,
        deger: deger, sayiBicimi: pop.querySelector('[data-f=sayiBicimi]').value,
        sira: deger === 'sayi' ? Math.max(0, sayiSira) : deger === 'tarih' ? Math.max(0, tarihSira) : deger === 'donem' ? 0 : (l.degerler.length > 1 ? l.degerler.indexOf(o) : null)
      };
    }
    function guncelle() {
      var t = tur();
      ['alan', 'kalem', 'detay'].forEach(function (x) { pop.querySelector('.fp-tur-' + x).style.display = t === x ? '' : 'none'; });
      pop.querySelector('.fp-tur-deger').style.display = t === 'alan' || t === 'detay' ? '' : 'none';
      var h = pop.querySelector('[data-f=hedef]').value;
      pop.querySelector('.fp-anlam').textContent = F.ACIKLAMA[h] || '';
      var s = sec();
      if (t === 'alan' || t === 'detay') {
        var v = SB.degerOku(l, { deger: s.deger, sira: s.sira, sayiBicimi: s.sayiBicimi });
        pop.querySelector('.fp-onizleme').innerHTML = 'Okunacak değer: <b>' + U.escapeHtml(v ? fmtDeger(s.hedef, v.deger) : '— okunamadı —') + '</b>';
      }
    }
    pop.addEventListener('change', function (e) { if (e.target.dataset.f === 'hedef') pop.dataset.hedefDegisti = '1'; guncelle(); });
    guncelle();
    pop.querySelector('[data-x]').onclick = function () { pop.remove(); };
    if (mt) pop.querySelector('[data-sil]').onclick = function () { tanimSil(mt); pop.remove(); };
    pop.querySelector('[data-ok]').onclick = function () {
      var s = sec();
      if (s.tur === 'kalem' && !s.ad) { UI.toast('Kalem adı girin.', 'err'); return; }
      if (s.tur === 'detay' && !s.ad) { UI.toast('Bilgi adı girin.', 'err'); return; }
      if (mt) tanimSil(mt, true);
      if (s.tur === 'alan') st.sablon.tanimlar = st.sablon.tanimlar.filter(function (t) { return !((t.tur === 'alan' || t.tur === 'kural' || t.tur === 'sabit') && t.hedef === s.hedef); });
      st.sablon.tanimlar.push(SB.tanimOlustur(l, s));
      if (s.tur === 'kalem') S.eslestirmeSet(st.sablon.id, s.ad, null, true); // şablondaki kategori geçerli olsun
      pop.remove();
      degisti();
    };
  }

  function tanimSil(t, sessiz) {
    st.sablon.tanimlar = st.sablon.tanimlar.filter(function (x) { return x !== t && x.id !== t.id; });
    if (!sessiz) degisti();
  }
  function degisti() { st.degisti = true; yenidenUygula(); katmanCiz(); ciz(); }

  // --- Sağ panel
  function ciz() {
    if (!st) return;
    var sag = st.box.querySelector('.fp-sag'), son = st.sonuc, r = son.record, sb = st.sablon;
    sag.innerHTML = '';

    var bas = UI.el('div', { class: 'fp-blok' });
    bas.innerHTML = '<div class="fp-sablon"><label>Şablon adı <input data-s="ad" value="' + U.escapeHtml(sb.ad) + '"></label>' +
      '<label>Tanıma metinleri <input data-s="anahtar" value="' + U.escapeHtml((sb.anahtarlar || []).join(', ')) + '" title="Faturada bu metinlerin hepsi geçiyorsa bu şablon kullanılır (ör. tedarikçi VKN)"></label></div>' +
      '<p class="muted small">' + (st.yeni ? 'Bu fatura biçimi için kayıtlı şablon yok. "Otomatik tanımla" ile başlayın veya faturadaki değerlere tıklayarak tanımlayın.' :
        'Kayıtlı şablon uygulandı. Değerlere tıklayarak tanımları düzenleyebilirsiniz.') + '</p>';
    var ot = UI.el('button', { class: 'btn primary sm' }, '✨ Otomatik tanımla');
    ot.onclick = otomatik;
    bas.appendChild(ot);
    bas.addEventListener('change', function (e) {
      var k = e.target.dataset.s;
      if (k === 'ad') sb.ad = e.target.value.trim() || sb.ad;
      if (k === 'anahtar') sb.anahtarlar = e.target.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      st.degisti = true;
    });
    sag.appendChild(bas);

    // Abonelik
    var ab = UI.el('div', { class: 'fp-blok fp-ab' }, '<h4>Abonelik</h4>');
    var sel = st.opts.abonelikSelect(st.q.abId);
    sel.onchange = function () { st.q.abId = sel.value || null; };
    ab.appendChild(sel);
    sag.appendChild(ab);

    // Fatura bilgileri
    var alanlar = UI.el('div', { class: 'fp-blok' }, '<h4>Fatura bilgileri</h4>');
    var rows = ALAN_SECENEKLERI.map(function (k) {
      var t = sb.tanimlar.filter(function (x) { return (x.tur === 'alan' || x.tur === 'kural' || x.tur === 'sabit') && x.hedef === k; })[0];
      var deger = r[k];
      var zor = ZORUNLU.indexOf(k) >= 0;
      if (!t && !deger && !zor) return '';
      var kaynak = !t ? (deger ? 'hesaplandı' : '') : t.tur === 'kural' ? 'hesaplanır' : t.tur === 'sabit' ? 'sabit' : '“' + (t.etiketMetni || t.etiket) + '”';
      var eksik = t && t.tur === 'alan' && son.eksik.indexOf(t) >= 0;
      return '<tr class="' + (!deger ? (zor ? 'zorunlu-eksik' : 'eksik') : '') + '"><td><b>' + U.escapeHtml(F.byKey[k].label) + '</b><small>' + U.escapeHtml(F.ACIKLAMA[k] || '') + '</small></td>' +
        '<td class="num">' + (deger !== undefined && deger !== null && deger !== '' ? U.escapeHtml(fmtDeger(k, deger)) : (eksik ? '<i>faturada bulunamadı</i>' : '<i>tanımlanmadı</i>')) + '</td>' +
        '<td class="muted small">' + U.escapeHtml(kaynak) + '</td>' +
        '<td>' + (t ? '<button class="btn xs" data-sil="' + t.id + '" title="Tanımı kaldır">✕</button>' : '') + '</td></tr>';
    }).join('');
    alanlar.appendChild(UI.el('table', { class: 'table fp-tablo' }, '<tbody>' + rows + '</tbody>'));
    alanlar.appendChild(UI.el('p', { class: 'help' }, 'Eksik bir bilgiyi tanımlamak için faturadaki değerine tıklayın.'));
    sag.appendChild(alanlar);

    // Kalemler
    var kal = UI.el('div', { class: 'fp-blok' }, '<h4>Bedel kalemleri</h4>');
    var kalemTanimlari = sb.tanimlar.filter(function (t) { return t.tur === 'kalem'; });
    var krows = son.bulunan.filter(function (b) { return b.tanim.tur === 'kalem'; }).map(function (b) {
      var k = b.kalem;
      return '<tr><td>' + U.escapeHtml(k.ad) + (k.ad !== b.satir.etiket ? '<small>faturada: ' + U.escapeHtml(b.satir.etiket) + '</small>' : '') + '</td>' +
        '<td><select data-kat="' + b.tanim.id + '">' + K.KATEGORILER.map(function (c) { return '<option value="' + c.id + '"' + (c.id === k.kategori ? ' selected' : '') + '>' + U.escapeHtml(c.label) + '</option>'; }).join('') + '</select></td>' +
        '<td class="num">' + (typeof k.miktar === 'number' ? U.formatTRNumber(k.miktar, 3) + ' ' + (k.miktarBirimi || '') : '') + '</td>' +
        '<td class="num">' + para(k.tutar) + '</td><td><button class="btn xs" data-sil="' + b.tanim.id + '" title="Tanımı kaldır">✕</button></td></tr>';
    }).join('');
    var bulunmayan = kalemTanimlari.filter(function (t) { return !son.bulunan.some(function (b) { return b.tanim === t; }); });
    kal.appendChild(UI.el('table', { class: 'table fp-tablo' }, '<thead><tr><th>Kalem</th><th>Kategori</th><th class="num">Miktar</th><th class="num">Tutar (TL)</th><th></th></tr></thead><tbody>' +
      (krows || '<tr><td colspan="5" class="muted">Kalem yok.</td></tr>') + '</tbody>'));
    if (bulunmayan.length) kal.appendChild(UI.el('p', { class: 'muted small' }, 'Bu faturada geçmeyen şablon kalemleri: ' + bulunmayan.map(function (t) { return U.escapeHtml(t.ad); }).join(', ')));
    sag.appendChild(kal);

    // Ek bilgiler
    var detaylar = son.bulunan.filter(function (b) { return b.tanim.tur === 'detay'; });
    if (detaylar.length) {
      var det = UI.el('div', { class: 'fp-blok' }, '<h4>Ek bilgiler</h4>');
      det.appendChild(UI.el('table', { class: 'table fp-tablo' }, '<tbody>' + detaylar.map(function (b) {
        return '<tr><td>' + U.escapeHtml(b.tanim.ad) + '</td><td class="num">' + U.escapeHtml(fmtDeger(null, b.deger)) + '</td><td><button class="btn xs" data-sil="' + b.tanim.id + '">✕</button></td></tr>';
      }).join('') + '</tbody>'));
      sag.appendChild(det);
    }

    // Tanımlanmamış satırlar
    if (son.tanimsiz.length) {
      var tz = UI.el('div', { class: 'fp-blok fp-tanimsiz' }, '<h4>Tanımlanmamış satırlar (' + son.tanimsiz.length + ')</h4><p class="help">Bu satırlar içeri aktarılmayacak. Bedel kalemiyse kategorisini seçip ekleyin, gereksizse yok sayın.</p>');
      son.tanimsiz.forEach(function (l) {
        var row = UI.el('div', { class: 'tz-satir' });
        row.innerHTML = '<div><b>' + U.escapeHtml(l.etiket || '(etiketsiz)') + '</b> <span class="muted">' + U.escapeHtml(l.degerMetni) + '</span></div>';
        var ks = UI.el('select', null, K.KATEGORILER.map(function (c) { return '<option value="' + c.id + '"' + (c.id === (K.varsayilan(l.etiket, sb.id) || 'diger') ? ' selected' : '') + '>' + U.escapeHtml(c.label) + '</option>'; }).join(''));
        var ek = UI.el('button', { class: 'btn xs primary' }, 'Kalem olarak ekle');
        ek.onclick = function () {
          sb.tanimlar.push(SB.tanimOlustur(l, { tur: 'kalem', ad: l.etiket, kategori: ks.value, miktarBirimi: 'kWh' }));
          S.eslestirmeSet(sb.id, l.etiket, null, true);
          degisti();
        };
        var ys = UI.el('button', { class: 'btn xs' }, 'Yok say');
        ys.onclick = function () { sb.tanimlar.push(SB.tanimOlustur(l, { tur: 'yoksay' })); degisti(); };
        var araclar = UI.el('div', { class: 'tz-arac' });
        araclar.appendChild(ks); araclar.appendChild(ek); araclar.appendChild(ys);
        row.appendChild(araclar);
        tz.appendChild(row);
      });
      sag.appendChild(tz);
    }
    if (son.yoksayilan.length) {
      var yd = UI.el('details', { class: 'fp-blok' });
      yd.appendChild(UI.el('summary', null, 'Yok sayılan satırlar (' + son.yoksayilan.length + ')'));
      son.yoksayilan.forEach(function (l) {
        var t = sb.tanimlar.filter(function (x) { return x.tur === 'yoksay' && x.kolon === l.kolon && x.etiket === l.etiketNorm; })[0];
        var row = UI.el('div', { class: 'tz-satir' }, '<div>' + U.escapeHtml(l.etiket) + ' <span class="muted">' + U.escapeHtml(l.degerMetni) + '</span></div>');
        if (t) { var g = UI.el('button', { class: 'btn xs' }, 'Geri al'); g.onclick = function () { tanimSil(t); }; row.appendChild(g); }
        yd.appendChild(row);
      });
      sag.appendChild(yd);
    }

    // Özet ve kontroller
    var oz = UI.el('div', { class: 'fp-blok' }, '<h4>İçe aktarılacak özet</h4>');
    var ozetAlanlari = ['enerjiBedeli', 'dagitimBedeli', 'digerBedeller', 'mahsupKwh', 'mahsupTL', 'btv', 'kdv', 'faturaTutari'];
    oz.appendChild(UI.el('table', { class: 'table fp-tablo' }, '<tbody>' + ozetAlanlari.map(function (k) {
      var f = F.byKey[k];
      return '<tr><td>' + U.escapeHtml(f.label) + '</td><td class="num">' + (r[k] === null || r[k] === undefined ? '' : U.formatTRNumber(r[k], f.dec === undefined ? 2 : f.dec)) + ' <span class="muted">' + (f.unit || '') + '</span></td></tr>';
    }).join('') + '</tbody>'));
    var kontroller = F.FIELDS.filter(function (f) { return f.check; }).map(function (f) {
      var v = st.calc[f.key], s = F.checkStatus(f, v, r);
      return '<span class="chk ' + (s || 'na') + '" title="' + (v === null || v === undefined ? 'hesaplanamadı' : U.formatTRNumber(v, 2)) + '">' + (s === 'ok' ? '✓' : s === 'err' ? '✗' : '–') + ' ' + U.escapeHtml(f.label.replace('Kontrol: ', '')) + '</span>';
    }).join('');
    oz.appendChild(UI.el('div', { class: 'checks' }, kontroller));
    sag.appendChild(oz);

    // Alt durum satırı
    var hatalar = F.FIELDS.filter(function (f) { return f.check && F.checkStatus(f, st.calc[f.key], r) === 'err'; }).length;
    var eksikZ = ZORUNLU.filter(function (k) { return r[k] === undefined || r[k] === null || r[k] === ''; });
    var durum = [];
    if (eksikZ.length) durum.push('<span class="err-text">Eksik: ' + eksikZ.map(function (k) { return F.byKey[k].label; }).join(', ') + '</span>');
    if (son.tanimsiz.length) durum.push('<span class="warn-text">' + son.tanimsiz.length + ' tanımlanmamış satır</span>');
    if (hatalar) durum.push('<span class="err-text">' + hatalar + ' kontrol tutmuyor</span>');
    if (!durum.length) durum.push('<span class="ok-text">✓ Tüm zorunlu bilgiler tanımlı, kontroller tutuyor</span>');
    st.box.querySelector('.fp-durum').innerHTML = durum.join(' · ');
  }

  function otomatik() {
    var q = st.q;
    if (!q.parsed) { UI.toast('Bu fatura için otomatik tanımlama yapılamadı.', 'err'); return; }
    var oneri = SB.otomatikTanimla(q.inv.items, q.inv.width, q.parsed, { id: st.sablon.id, ad: st.sablon.ad, userMap: S.eslestirme() });
    var n = SB.birlestir(st.sablon, oneri);
    if (!st.sablon.anahtarlar.length) st.sablon.anahtarlar = oneri.anahtarlar;
    degisti();
    UI.toast(n ? n + ' tanım eklendi. Faturada işaretli değerleri kontrol edin.' : 'Eklenecek yeni tanım bulunamadı.', n ? 'ok' : '');
  }

  function sablonKaydet() {
    if (!st.sablon.anahtarlar.length) { UI.toast('Şablonun tanınması için en az bir tanıma metni girin (ör. tedarikçi VKN).', 'err'); return false; }
    var kayitli = S.sablonSave(clone(st.sablon));
    st.q.sablon = kayitli;
    st.yeni = false;
    st.degisti = false;
    if (st.opts.onSablon) st.opts.onSablon(kayitli);
    return true;
  }

  function aktar() {
    var r = st.sonuc.record;
    var eksikZ = ZORUNLU.filter(function (k) { return r[k] === undefined || r[k] === null || r[k] === ''; });
    if (eksikZ.length) { UI.toast('Önce eksik bilgileri tanımlayın: ' + eksikZ.map(function (k) { return F.byKey[k].label; }).join(', '), 'err'); return; }
    if (!st.q.abId) { UI.toast('Faturanın kaydedileceği aboneliği seçin.', 'err'); return; }
    var hatalar = F.FIELDS.filter(function (f) { return f.check && F.checkStatus(f, st.calc[f.key], r) === 'err'; });
    if (hatalar.length && !confirm('Şu kontroller tutmuyor: ' + hatalar.map(function (f) { return f.label.replace('Kontrol: ', ''); }).join(', ') + '.\nYine de içe aktarılsın mı?')) return;
    if (st.sonuc.tanimsiz.length && !confirm(st.sonuc.tanimsiz.length + ' tanımlanmamış satır içeri aktarılmayacak. Devam edilsin mi?')) return;
    if (!sablonKaydet()) return;
    var q = st.q;
    q.sonuc = SB.uygula(q.inv.items, q.inv.width, q.sablon, S.eslestirme());
    q.record = q.sonuc.record;
    var ok = st.opts.onKaydet(q);
    if (ok !== false) kapat();
  }

  App.faturaPencere = { ac: ac };
})(this);
