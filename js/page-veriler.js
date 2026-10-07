/* Veriler sayfası: tüketim tesisine ait boş bir hesap tablosu (Excel gibi satır/sütun/hücre, formül, gizleme)
   ve OSOS (saatlik) alt sayfası. Formül motoru: tablo.js.
   Klavye: oklar (Ctrl ile veri kenarına), Shift+ok (alan seçimi), Enter/Tab (gezinme), F2 veya yazmaya başlama (düzenleme),
   Esc (vazgeç), Delete (temizle), Ctrl+C / Ctrl+X / Ctrl+V, Ctrl+Z / Ctrl+Y, Ctrl+A, Ctrl+D / Ctrl+R (aşağı / sağa doldur),
   Ctrl+9 / Ctrl+0 (satır / sütun gizle), Ctrl+Shift+9 / Ctrl+Shift+0 (seçimdeki gizlileri göster).
   Formül yazarken hücreye tıklamak (sürüklemek) başvuruyu formüle ekler. */
(function (root) {
  'use strict';
  var App = root.App, U = App.util, S = App.store, UI = App.ui, T = App.tablo;

  var PREF_KEY = 'mahsupla.veriler.prefs';
  var prefs = (function () { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch (e) { return {}; } })();
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* önemsiz */ } }

  var MIN_SATIR = 100, MIN_SUTUN = 26, VARS_GEN = 96, SATIR_BASLIK = 46;
  var state = { tt: null, ab: 'tum' };
  var st = { tt: null, veri: null, hesap: null, satir: 0, sutun: 0, sel: { r: 0, c: 0 }, anchor: { r: 0, c: 0 }, edit: null, undo: [], redo: [], pano: null, pick: null, td: {} };
  var containerRef = null;

  // Kaydederken genel sayfa yenilemesini bastırır; tablo kendi yerinde güncellenir.
  function quiet(fn) { App.quietRender = true; try { fn(); } finally { App.quietRender = false; } }

  // ================= Sayfa kabuğu =================
  function render(container, params) {
    containerRef = container;
    closeMenu();
    if (params && params.sayfa) { prefs.sayfa = params.sayfa === 'osos' ? 'osos' : 'tablo'; savePrefs(); }
    secimiCoz(params);
    container.innerHTML = '';
    var page = UI.el('div', { class: 'veriler-page' + (prefs.sayfa === 'osos' ? ' osos-page' : '') });
    container.appendChild(page);
    if (!S.tuketimList().length) {
      page.appendChild(UI.el('div', { class: 'empty' }, '<p>Önce bir tüketim tesisi oluşturun.</p><a class="btn primary" href="#/tesisler">Tesisler</a>'));
      return;
    }
    if (prefs.sayfa === 'osos') renderOsos(page); else renderTablo(page);
    page.appendChild(sekmeler());
  }

  function secimiCoz(params) {
    var list = S.tuketimList();
    if (params && params.tt) { if (params.tt !== state.tt) state.ab = 'tum'; state.tt = params.tt; }
    if (params && params.ab) state.ab = params.ab;
    if (!state.tt || !S.tuketimGet(state.tt)) { state.tt = list.length ? list[0].id : null; state.ab = 'tum'; }
    if (state.ab !== 'tum' && !S.abonelikGet(state.ab)) state.ab = 'tum';
  }

  function sekmeler() {
    var tabs = UI.el('div', { class: 'sheet-tabs', role: 'tablist' });
    [['tablo', 'Faturalar'], ['osos', 'OSOS (Saatlik)']].forEach(function (t) {
      tabs.appendChild(UI.el('button', { class: 'sheet-tab' + ((prefs.sayfa || 'tablo') === t[0] ? ' active' : ''), role: 'tab',
        onclick: function () { if (st.edit) bitir(true); prefs.sayfa = t[0]; savePrefs(); render(containerRef); } }, t[1]));
    });
    return tabs;
  }

  function tesisSecimi(bar, abonelikDe) {
    var sel = UI.el('select', { title: 'Tüketim tesisi' });
    S.tuketimList().forEach(function (t) {
      var o = UI.el('option', { value: t.id }, U.escapeHtml(t.ad));
      if (t.id === state.tt) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = function () { if (st.edit) bitir(true); location.hash = '#/veriler?tt=' + sel.value + '&ab=tum'; };
    bar.appendChild(UI.el('label', { class: 'inline' }, '<b>Veriler</b> —'));
    bar.appendChild(sel);
    if (!abonelikDe) return;
    var abSel = UI.el('select', { title: 'Abonelik' });
    var abs = S.abonelikList(state.tt);
    abSel.appendChild(UI.el('option', { value: 'tum' }, 'Tüm abonelikler (' + abs.length + ')'));
    abs.forEach(function (a) {
      var o = UI.el('option', { value: a.id }, U.escapeHtml(a.ad + (a.eic ? ' · ' + a.eic : '')));
      if (a.id === state.ab) o.selected = true;
      abSel.appendChild(o);
    });
    abSel.onchange = function () { location.hash = '#/veriler?tt=' + state.tt + '&ab=' + abSel.value; };
    bar.appendChild(abSel);
  }

  function renderOsos(page) {
    var bar = UI.el('div', { class: 'toolbar' });
    tesisSecimi(bar, true);
    page.appendChild(bar);
    App.pages.osos.render(page, { tt: state.tt, ab: state.ab });
  }

  // ================= Hesap tablosu =================
  function renderTablo(page) {
    if (st.tt !== state.tt) {
      st.tt = state.tt; st.veri = S.tabloGet(state.tt); st.undo = []; st.redo = []; st.edit = null; st.pick = null;
      st.sel = { r: 0, c: 0 }; st.anchor = { r: 0, c: 0 }; st.mod = 'hucre'; st.satir = 0; st.sutun = 0;
    }
    st.edit = null;
    hesapla();
    boyutla();

    var bar = UI.el('div', { class: 'toolbar' });
    tesisSecimi(bar, false);
    bar.appendChild(UI.el('span', { class: 'sep' }));
    bar.appendChild(UI.el('button', { class: 'btn sm', id: 'xlGeri', title: 'Geri al (Ctrl+Z)', onclick: geriAl }, '↶ Geri al'));
    bar.appendChild(UI.el('button', { class: 'btn sm', id: 'xlYinele', title: 'Yinele (Ctrl+Y)', onclick: yinele }, '↷ Yinele'));
    bar.appendChild(UI.el('span', { class: 'sep' }));
    bar.appendChild(UI.el('button', { class: 'btn sm', id: 'xlGizli', onclick: tumunuGoster, title: 'Gizlenen tüm satır ve sütunları göster' }, ''));
    bar.appendChild(UI.el('button', { class: 'btn sm', onclick: formulYardim, title: 'Kullanılabilen formüller ve kısayollar' }, 'ƒx Formüller'));
    bar.appendChild(UI.el('button', { class: 'btn sm', onclick: excelIndir, title: 'Tabloyu Excel dosyası olarak indir (değerler)' }, 'Excel indir'));
    page.appendChild(bar);

    var fbar = UI.el('div', { class: 'formula-bar' });
    var ad = UI.el('input', { class: 'fx-ad', id: 'xlAd', type: 'text', spellcheck: 'false', title: 'Ad kutusu: hücre veya aralık yazıp Enter (ör. C12 ya da A1:D20)' });
    ad.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var rg = T.parseRange(ad.value);
        if (!rg || rg.r0 === null) { UI.toast('Geçerli bir hücre ya da aralık yazın (ör. B5 veya A1:C10).', 'err'); return; }
        st.anchor = { r: rg.r0, c: rg.c0 }; st.sel = { r: rg.r1, c: rg.c1 }; st.mod = 'hucre';
        genislet(rg.r1, rg.c1); boya(true); izgara().focus({ preventScroll: true });
      }
      if (e.key === 'Escape') { boya(); izgara().focus(); }
    });
    fbar.appendChild(ad);
    fbar.appendChild(UI.el('span', { class: 'fx-icon' }, 'fx'));
    var fx = UI.el('input', { id: 'fxInput', type: 'text', spellcheck: 'false', autocomplete: 'off' });
    fx.addEventListener('focus', function () { if (!st.edit) basla('', 'cubuk'); });
    fx.addEventListener('input', function () { if (st.edit && st.edit.input) { st.edit.input.value = fx.value; edGenislik(); } });
    fx.addEventListener('keydown', function (e) { editorTus(e, fx); });
    fx.addEventListener('blur', function () { if (st.edit && st.edit.kaynak === 'cubuk' && !st.edit.kapaniyor) bitir(true, null, true); });
    fbar.appendChild(fx);
    page.appendChild(fbar);

    var wrap = UI.el('div', { class: 'sheet-wrap xl-wrap', tabindex: '0', id: 'sheet' });
    page.appendChild(wrap);
    page.appendChild(UI.el('div', { class: 'statusbar', id: 'statusbar' }));
    tabloyuCiz();
    bagla(wrap);
    boya(true);
    wrap.focus({ preventScroll: true });
  }

  function izgara() { return document.getElementById('sheet'); }

  function hesapla() { st.hesap = new T.Hesap(st.veri.hucreler); }
  function boyutla() {
    var maxR = st.hesap.maxR, maxC = st.hesap.maxC;
    Object.keys(st.veri.gizliSatir).forEach(function (k) { maxR = Math.max(maxR, +k); });
    Object.keys(st.veri.gizliSutun).forEach(function (k) { maxC = Math.max(maxC, +k); });
    st.satir = Math.max(st.satir, MIN_SATIR, maxR + 21, st.sel.r + 2, st.anchor.r + 2);
    st.sutun = Math.max(st.sutun, MIN_SUTUN, maxC + 6, st.sel.c + 2, st.anchor.c + 2);
  }
  function genislet(r, c) {
    var degisti = false;
    if (r >= st.satir - 1) { st.satir = r + 21; degisti = true; }
    if (c >= st.sutun - 1) { st.sutun = c + 6; degisti = true; }
    if (degisti) tabloyuCiz();
  }
  function gizliR(r) { return !!st.veri.gizliSatir[r]; }
  function gizliC(c) { return !!st.veri.gizliSutun[c]; }
  function gen(c) { return st.veri.genislik[c] || VARS_GEN; }

  function hucreSinif(v) {
    if (v === null) return '';
    if (T.isErr(v)) return 'e';
    if (typeof v === 'number') return 'n';
    if (typeof v === 'boolean') return 'b';
    return '';
  }

  function tabloyuCiz() {
    var wrap = izgara();
    if (!wrap) return;
    var eski = wrap.querySelector('table.xl');
    var html = '<colgroup><col style="width:' + SATIR_BASLIK + 'px">';
    var gor = [];
    for (var c = 0; c < st.sutun; c++) if (!gizliC(c)) { gor.push(c); html += '<col style="width:' + gen(c) + 'px">'; }
    var genToplam = SATIR_BASLIK + gor.reduce(function (s, c) { return s + gen(c); }, 0);
    html += '</colgroup><thead><tr><th class="xl-kose" title="Tümünü seç (Ctrl+A)"></th>';
    gor.forEach(function (c) {
      var once = c > 0 && gizliC(c - 1);
      html += '<th class="xl-ch' + (once ? ' gizli-once' : '') + '" data-c="' + c + '">' + T.colName(c) +
        (once ? '<button type="button" class="xl-goster" data-eksen="sutun" data-at="' + c + '" title="Gizli sütunları göster">◂▸</button>' : '') +
        '<span class="xl-rs" data-c="' + c + '" title="Genişliği değiştirmek için sürükleyin"></span></th>';
    });
    html += '</tr></thead><tbody>';
    for (var r = 0; r < st.satir; r++) {
      if (gizliR(r)) continue;
      var once2 = r > 0 && gizliR(r - 1);
      html += '<tr><th class="xl-rh' + (once2 ? ' gizli-once' : '') + '" data-r="' + r + '">' + (r + 1) +
        (once2 ? '<button type="button" class="xl-goster" data-eksen="satir" data-at="' + r + '" title="Gizli satırları göster">▴▾</button>' : '') + '</th>';
      for (var i = 0; i < gor.length; i++) {
        var cc = gor[i], v = st.hesap.deger(r, cc);
        html += '<td data-r="' + r + '" data-c="' + cc + '" class="' + hucreSinif(v) + '">' + U.escapeHtml(T.goster(v)) + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody>';
    var t = document.createElement('table');
    t.className = 'xl';
    t.style.width = genToplam + 'px';
    t.innerHTML = html;
    if (eski) wrap.replaceChild(t, eski); else wrap.insertBefore(t, wrap.firstChild);
    st.td = {};
    t.querySelectorAll('td').forEach(function (td) { st.td[td.dataset.r + ',' + td.dataset.c] = td; });
    if (!wrap.querySelector('.xl-secim')) {
      wrap.appendChild(UI.el('div', { class: 'xl-secim' }));
      wrap.appendChild(UI.el('div', { class: 'xl-tutamac', title: 'Doldurmak için sürükleyin' }));
    }
    st.boyali = [];
    boya();
    araclariGuncelle();
  }

  // Formül sonuçlarını yeniden hesaplayıp görünen hücreleri günceller
  function yenile() {
    hesapla();
    Object.keys(st.td).forEach(function (k) {
      var td = st.td[k], v = st.hesap.deger(+td.dataset.r, +td.dataset.c), s = T.goster(v), cls = hucreSinif(v);
      if (td.textContent !== s) td.textContent = s;
      var tam = cls + (td.classList.contains('sel') ? ' sel' : '');
      if (td.className !== tam) td.className = tam;
    });
    boya();
    araclariGuncelle();
  }

  function araclariGuncelle() {
    var nR = Object.keys(st.veri.gizliSatir).length, nC = Object.keys(st.veri.gizliSutun).length;
    var b = document.getElementById('xlGizli');
    if (b) {
      b.innerHTML = '👁 Gizlenenleri göster' + (nR + nC ? ' <b>(' + [nR ? nR + ' satır' : '', nC ? nC + ' sütun' : ''].filter(Boolean).join(', ') + ')</b>' : '');
      b.disabled = !(nR + nC);
      b.classList.toggle('has-hidden', !!(nR + nC));
    }
    var g = document.getElementById('xlGeri'), y = document.getElementById('xlYinele');
    if (g) g.disabled = !st.undo.length;
    if (y) y.disabled = !st.redo.length;
  }

  // ---- Seçim
  function aralik() {
    var a = st.anchor, b = st.sel;
    var rg = { r0: Math.min(a.r, b.r), r1: Math.max(a.r, b.r), c0: Math.min(a.c, b.c), c1: Math.max(a.c, b.c) };
    if (st.mod === 'satir' || st.mod === 'tum') { rg.c0 = 0; rg.c1 = st.sutun - 1; }
    if (st.mod === 'sutun' || st.mod === 'tum') { rg.r0 = 0; rg.r1 = st.satir - 1; }
    return rg;
  }
  function aralikAdi(rg) {
    if (st.mod === 'tum') return 'Tümü';
    if (st.mod === 'sutun') return T.colName(rg.c0) + ':' + T.colName(rg.c1);
    if (st.mod === 'satir') return (rg.r0 + 1) + ':' + (rg.r1 + 1);
    var a = T.addr(rg.r0, rg.c0), b = T.addr(rg.r1, rg.c1);
    return a === b ? a : a + ':' + b;
  }
  function gorunurIlk(a, b, gizli) { for (var i = a; i <= b; i++) if (!gizli(i)) return i; return -1; }
  function gorunurSon(a, b, gizli) { for (var i = b; i >= a; i--) if (!gizli(i)) return i; return -1; }

  function boya(kaydir) {
    var wrap = izgara();
    if (!wrap) return;
    (st.boyali || []).forEach(function (e) { e.classList.remove('sel', 'hl', 'act'); });
    st.boyali = [];
    var rg = aralik();
    var r1 = Math.min(rg.r1, st.satir - 1), c1 = Math.min(rg.c1, st.sutun - 1);
    var cokHucre = rg.r0 !== r1 || rg.c0 !== c1;
    for (var r = rg.r0; r <= r1; r++) {
      if (gizliR(r)) continue;
      for (var c = rg.c0; c <= c1; c++) {
        var td = st.td[r + ',' + c];
        if (td && cokHucre && !(r === st.sel.r && c === st.sel.c && st.mod === 'hucre')) { td.classList.add('sel'); st.boyali.push(td); }
      }
    }
    wrap.querySelectorAll('th.xl-ch').forEach(function (th) { var c = +th.dataset.c; if (c >= rg.c0 && c <= c1) { th.classList.add(st.mod === 'sutun' || st.mod === 'tum' ? 'act' : 'hl'); st.boyali.push(th); } });
    wrap.querySelectorAll('th.xl-rh').forEach(function (th) { var r = +th.dataset.r; if (r >= rg.r0 && r <= r1) { th.classList.add(st.mod === 'satir' || st.mod === 'tum' ? 'act' : 'hl'); st.boyali.push(th); } });
    // Seçim çerçevesi ve doldurma tutamacı
    var kutu = wrap.querySelector('.xl-secim'), tut = wrap.querySelector('.xl-tutamac');
    var ra = gorunurIlk(rg.r0, r1, gizliR), rb = gorunurSon(rg.r0, r1, gizliR), ca = gorunurIlk(rg.c0, c1, gizliC), cb = gorunurSon(rg.c0, c1, gizliC);
    var ilk = ra >= 0 && ca >= 0 ? st.td[ra + ',' + ca] : null, son = rb >= 0 && cb >= 0 ? st.td[rb + ',' + cb] : null;
    if (ilk && son && kutu) {
      var t = wrap.querySelector('table.xl');
      var x = ilk.offsetLeft + t.offsetLeft, y = ilk.offsetTop + t.offsetTop;
      var w = son.offsetLeft + son.offsetWidth - ilk.offsetLeft, h = son.offsetTop + son.offsetHeight - ilk.offsetTop;
      kutu.style.cssText = 'display:block;left:' + (x - 1) + 'px;top:' + (y - 1) + 'px;width:' + (w + 1) + 'px;height:' + (h + 1) + 'px';
      tut.style.cssText = 'display:' + (st.edit ? 'none' : 'block') + ';left:' + (x + w - 4) + 'px;top:' + (y + h - 4) + 'px';
    } else if (kutu) { kutu.style.display = 'none'; tut.style.display = 'none'; }
    if (kaydir) gorunurYap(st.sel.r, st.sel.c);
    var ad = document.getElementById('xlAd');
    if (ad && document.activeElement !== ad) ad.value = aralikAdi(rg);
    var fx = document.getElementById('fxInput');
    if (fx && !st.edit) {
      var raw = st.veri.hucreler[T.addr(st.sel.r, st.sel.c)];
      fx.value = raw === undefined ? '' : raw;
    }
    durum();
  }

  function gorunurYap(r, c) {
    var wrap = izgara(), td = st.td[r + ',' + c];
    if (!wrap || !td) return;
    var bas = wrap.querySelector('thead').offsetHeight, sol = SATIR_BASLIK;
    var t = wrap.querySelector('table.xl');
    var x = td.offsetLeft + t.offsetLeft, y = td.offsetTop + t.offsetTop;
    if (x - sol < wrap.scrollLeft) wrap.scrollLeft = x - sol;
    else if (x + td.offsetWidth > wrap.scrollLeft + wrap.clientWidth) wrap.scrollLeft = x + td.offsetWidth - wrap.clientWidth;
    if (y - bas < wrap.scrollTop) wrap.scrollTop = y - bas;
    else if (y + td.offsetHeight > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = y + td.offsetHeight - wrap.clientHeight;
  }

  function durum() {
    var sb = document.getElementById('statusbar');
    if (!sb) return;
    var rg = aralik(), top = 0, say = 0, dolu = 0;
    var r1 = Math.min(rg.r1, Math.max(st.hesap.maxR, 0)), c1 = Math.min(rg.c1, Math.max(st.hesap.maxC, 0));
    for (var r = rg.r0; r <= r1; r++) for (var c = rg.c0; c <= c1; c++) {
      var v = st.hesap.deger(r, c);
      if (v === null) continue;
      dolu++;
      if (typeof v === 'number') { top += v; say++; }
    }
    var html = '<span class="muted">' + U.escapeHtml(aralikAdi(rg)) + '</span><span class="grow"></span>';
    if (dolu > 1 || say > 1) {
      if (say) html += '<span>Ortalama: <b>' + T.goster(top / say) + '</b></span>';
      html += '<span>Sayım: <b>' + dolu + '</b></span>';
      if (say) html += '<span>Toplam: <b>' + T.goster(top) + '</b></span>';
    }
    sb.innerHTML = html;
  }

  // ---- Değişiklik, geri alma, kaydetme
  function anlik() { return JSON.stringify(st.veri); }
  function degistir(fn) {
    var once = anlik();
    fn();
    if (anlik() === once) return false;
    st.undo.push(once);
    if (st.undo.length > 200) st.undo.shift();
    st.redo = [];
    kaydet();
    return true;
  }
  function kaydet() { quiet(function () { S.tabloSave(st.tt, st.veri); }); }
  function geriAl() {
    if (st.edit) bitir(false);
    if (!st.undo.length) return;
    st.redo.push(anlik());
    st.veri = JSON.parse(st.undo.pop());
    kaydet(); hesapla(); boyutla(); tabloyuCiz();
  }
  function yinele() {
    if (st.edit) bitir(false);
    if (!st.redo.length) return;
    st.undo.push(anlik());
    st.veri = JSON.parse(st.redo.pop());
    kaydet(); hesapla(); boyutla(); tabloyuCiz();
  }
  function hucreYaz(r, c, raw) {
    var k = T.addr(r, c);
    if (raw === null || raw === undefined || raw === '') delete st.veri.hucreler[k];
    else st.veri.hucreler[k] = String(raw);
  }

  // ---- Düzenleme
  function basla(ilkMetin, kaynak) {
    if (st.mod !== 'hucre') { st.mod = 'hucre'; st.anchor = { r: st.sel.r, c: st.sel.c }; }
    var r = st.sel.r, c = st.sel.c;
    var mevcut = st.veri.hucreler[T.addr(r, c)] || '';
    var fx = document.getElementById('fxInput');
    st.edit = { r: r, c: c, kaynak: kaynak, ilk: mevcut, input: null };
    st.pick = null;
    if (kaynak === 'cubuk') { boya(); return; }
    var wrap = izgara(), td = st.td[r + ',' + c];
    if (!td) { st.edit = null; return; }
    gorunurYap(r, c);
    var t = wrap.querySelector('table.xl');
    var inp = UI.el('input', { class: 'xl-editor', type: 'text', spellcheck: 'false', autocomplete: 'off' });
    inp.value = kaynak === 'yaz' ? ilkMetin : mevcut;
    inp.style.left = (td.offsetLeft + t.offsetLeft) + 'px';
    inp.style.top = (td.offsetTop + t.offsetTop) + 'px';
    inp.style.minWidth = td.offsetWidth + 'px';
    inp.style.height = td.offsetHeight + 'px';
    inp.style.textAlign = 'left';
    wrap.appendChild(inp);
    st.edit.input = inp;
    inp.addEventListener('keydown', function (e) { e.stopPropagation(); editorTus(e, inp); }); // ızgaraya kabarmasın (iki kez hareket eder)
    inp.addEventListener('input', function () { st.pick = null; if (fx) fx.value = inp.value; edGenislik(); });
    inp.focus();
    inp.setSelectionRange(inp.value.length, inp.value.length);
    if (fx) fx.value = inp.value;
    edGenislik();
    boya();
  }
  function edGenislik() {
    var inp = st.edit && st.edit.input;
    if (!inp) return;
    inp.style.width = '0px';
    inp.style.width = Math.max(parseFloat(inp.style.minWidth) || 0, inp.scrollWidth + 6) + 'px';
  }
  function editorDeger() {
    if (!st.edit) return '';
    if (st.edit.input) return st.edit.input.value;
    var fx = document.getElementById('fxInput');
    return fx ? fx.value : '';
  }
  // kaydet=true: değeri yazar. yon: {dr, dc} ile sonra hareket eder. Sözdizimi hatası varsa false döner.
  function bitir(kaydetsin, yon, odakKalsin) {
    if (!st.edit) return true;
    var e = st.edit, deger = editorDeger();
    if (kaydetsin && deger !== e.ilk) {
      if (T.isFormula(deger)) {
        var h = T.formulDene(deger);
        if (h) {
          UI.toast('Formülde hata: ' + h + '. Düzeltin ya da Esc ile vazgeçin.', 'err');
          return false;
        }
      }
      degistir(function () { hucreYaz(e.r, e.c, deger === '' ? null : deger); });
    }
    e.kapaniyor = true;
    if (e.input) e.input.remove();
    st.edit = null; st.pick = null;
    yenile();
    if (yon) git(e.r + yon.dr, e.c + yon.dc, false);
    if (!odakKalsin && izgara()) izgara().focus({ preventScroll: true });
    boya(true);
    return true;
  }
  function editorTus(e, el) {
    if (!st.edit) return;
    if (e.key === 'Enter') { e.preventDefault(); bitir(true, { dr: e.shiftKey ? -1 : 1, dc: 0 }); return; }
    if (e.key === 'Tab') { e.preventDefault(); bitir(true, { dr: 0, dc: e.shiftKey ? -1 : 1 }); return; }
    if (e.key === 'Escape') { e.preventDefault(); bitir(false); return; }
    // Yazarak başlanan düzenlemede oklar (formül değilse) değeri kaydedip hareket eder — Excel'deki gibi
    var oklar = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (oklar[e.key] && el !== document.getElementById('fxInput') && st.edit.kaynak === 'yaz' && !T.isFormula(el.value)) {
      e.preventDefault();
      bitir(true, { dr: oklar[e.key][0], dc: oklar[e.key][1] });
    }
  }

  // Formül yazılırken tıklanan hücrenin başvurusu eklenebilir mi?
  function secilebilir() {
    if (!st.edit || !st.edit.input) return false;
    var inp = st.edit.input, v = inp.value;
    if (!T.isFormula(v) && v !== '=') return false;
    if (inp.selectionStart !== v.length) return false;
    if (st.pick) return true;
    return /[=(;,+\-*/^&<>:]\s*$/.test(v);
  }
  function basvuruEkle(r0, c0, r1, c1) {
    var inp = st.edit.input;
    var ref = T.addr(Math.min(r0, r1), Math.min(c0, c1));
    if (r0 !== r1 || c0 !== c1) ref += ':' + T.addr(Math.max(r0, r1), Math.max(c0, c1));
    var bas = st.pick ? st.pick.bas : inp.value.length;
    inp.value = inp.value.slice(0, bas) + ref;
    st.pick = { bas: bas, r: r0, c: c0 };
    var fx = document.getElementById('fxInput');
    if (fx) fx.value = inp.value;
    edGenislik();
    inp.focus();
    inp.setSelectionRange(inp.value.length, inp.value.length);
  }

  // ---- Gezinme
  function adim(i, d, n, gizli) {
    var j = i;
    for (var k = 0; k < 100000; k++) { j += d; if (j < 0) return i; if (!gizli(j)) return j; if (j >= n + 1000) return i; }
    return i;
  }
  function git(r, c, uzat) {
    r = Math.max(0, r); c = Math.max(0, c);
    // Gizli hücreye denk gelirse ilk görünür olana kay
    while (gizliR(r)) r++;
    while (gizliC(c)) c++;
    st.sel = { r: r, c: c };
    if (!uzat) { st.anchor = { r: r, c: c }; st.mod = 'hucre'; }
    genislet(r, c);
  }
  function dolu(r, c) { var v = st.veri.hucreler[T.addr(r, c)]; return v !== undefined && v !== ''; }
  // Ctrl+ok: veri bloğunun kenarına atlar
  function kenar(r, c, dr, dc) {
    var gR = function (x) { return gizliR(x); }, gC = function (x) { return gizliC(x); };
    var nr = r, nc = c;
    function sonraki(a, b) { return { r: dr ? adim(a, dr, st.satir, gR) : a, c: dc ? adim(b, dc, st.sutun, gC) : b }; }
    var n = sonraki(nr, nc);
    if (n.r === nr && n.c === nc) return n;
    var sinirR = Math.max(st.hesap.maxR, r), sinirC = Math.max(st.hesap.maxC, c);
    if (dolu(nr, nc) && dolu(n.r, n.c)) {
      while (true) { var m = sonraki(n.r, n.c); if ((m.r === n.r && m.c === n.c) || !dolu(m.r, m.c)) return n; n = m; }
    }
    while (true) {
      if (dolu(n.r, n.c)) return n;
      var m2 = sonraki(n.r, n.c);
      if ((m2.r === n.r && m2.c === n.c) || (dr > 0 && m2.r > sinirR) || (dc > 0 && m2.c > sinirC)) return dr > 0 || dc > 0 ? n : m2;
      n = m2;
    }
  }

  function klavye(e) {
    if (st.edit) return;
    var ctrl = e.ctrlKey || e.metaKey, k = e.key;
    var gR = function (x) { return gizliR(x); }, gC = function (x) { return gizliC(x); };
    var oklar = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (oklar[k]) {
      e.preventDefault();
      var d = oklar[k], hedef;
      if (ctrl) hedef = kenar(st.sel.r, st.sel.c, d[0], d[1]);
      else hedef = { r: d[0] ? adim(st.sel.r, d[0], st.satir, gR) : st.sel.r, c: d[1] ? adim(st.sel.c, d[1], st.sutun, gC) : st.sel.c };
      if (e.shiftKey) { if (st.mod !== 'hucre' && st.mod !== (d[0] ? 'satir' : 'sutun')) st.mod = 'hucre'; st.sel = hedef; genislet(hedef.r, hedef.c); }
      else git(hedef.r, hedef.c, false);
      boya(true);
      return;
    }
    if (k === 'Enter' || k === 'Tab') {
      e.preventDefault();
      var dr = k === 'Enter' ? (e.shiftKey ? -1 : 1) : 0, dc = k === 'Tab' ? (e.shiftKey ? -1 : 1) : 0;
      git(dr ? adim(st.sel.r, dr, st.satir, gR) : st.sel.r, dc ? adim(st.sel.c, dc, st.sutun, gC) : st.sel.c, false);
      boya(true);
      return;
    }
    if (k === 'PageDown' || k === 'PageUp') { e.preventDefault(); git(st.sel.r + (k === 'PageDown' ? 20 : -20), st.sel.c, e.shiftKey); boya(true); return; }
    if (k === 'Home') { e.preventDefault(); if (ctrl) git(0, 0, e.shiftKey); else git(st.sel.r, 0, e.shiftKey); boya(true); return; }
    if (k === 'End' && ctrl) { e.preventDefault(); git(Math.max(0, st.hesap.maxR), Math.max(0, st.hesap.maxC), e.shiftKey); boya(true); return; }
    if (k === 'F2') { e.preventDefault(); basla('', 'f2'); return; }
    if (k === 'Delete') { e.preventDefault(); temizle(); return; }
    if (k === 'Backspace') { e.preventDefault(); basla('', 'yaz'); return; }
    if (ctrl && !e.altKey) {
      var lk = k.toLowerCase();
      if (lk === 'z' && !e.shiftKey) { e.preventDefault(); geriAl(); return; }
      if (lk === 'y' || (lk === 'z' && e.shiftKey)) { e.preventDefault(); yinele(); return; }
      if (lk === 'a') { e.preventDefault(); st.mod = 'tum'; st.anchor = { r: 0, c: 0 }; boya(); return; }
      if (lk === 'd') { e.preventDefault(); kisaDoldur('asagi'); return; }
      if (lk === 'r') { e.preventDefault(); kisaDoldur('saga'); return; }
      if (e.code === 'Digit9' || k === '9' || k === '(') { e.preventDefault(); if (e.shiftKey) goster('satir'); else gizle('satir'); return; }
      if (e.code === 'Digit0' || k === '0' || k === '=') { e.preventDefault(); if (e.shiftKey) goster('sutun'); else gizle('sutun'); return; }
      return;
    }
    // AltGr (Türkçe klavyede @ { [ € ...) Ctrl+Alt, Mac'te Option ile gelir; bunlar da yazı sayılır
    if (k.length === 1) { e.preventDefault(); basla(k, 'yaz'); }
  }

  // ---- İşlemler
  function temizle() {
    var rg = aralik();
    degistir(function () {
      Object.keys(st.veri.hucreler).forEach(function (key) {
        var a = T.parseAddr(key);
        if (a.r >= rg.r0 && a.r <= rg.r1 && a.c >= rg.c0 && a.c <= rg.c1) delete st.veri.hucreler[key];
      });
    });
    yenile();
  }

  function gizle(eksen) {
    var rg = aralik();
    var a = eksen === 'satir' ? rg.r0 : rg.c0, b = eksen === 'satir' ? rg.r1 : rg.c1;
    if (eksen === 'satir' && st.mod === 'sutun') { UI.toast('Satır gizlemek için satır(lar) seçin.', 'err'); return; }
    if (eksen === 'sutun' && st.mod === 'satir') { UI.toast('Sütun gizlemek için sütun(lar) seçin.', 'err'); return; }
    if (st.mod === 'tum') { UI.toast('Tüm ' + (eksen === 'satir' ? 'satırlar' : 'sütunlar') + ' gizlenemez.', 'err'); return; }
    var map = eksen === 'satir' ? 'gizliSatir' : 'gizliSutun';
    degistir(function () { for (var i = a; i <= b; i++) st.veri[map][i] = true; });
    // Seçimi gizlenenlerden sonraki ilk görünür satır/sütuna taşı
    if (eksen === 'satir') git(b + 1, st.sel.c, false); else git(st.sel.r, b + 1, false);
    tabloyuCiz(); boya(true);
    UI.toast((b - a + 1) + ' ' + (eksen === 'satir' ? 'satır' : 'sütun') + ' gizlendi. Göstermek için başlıktaki işarete tıklayın.', 'ok');
  }
  // Seçimdeki (ve hemen bitişiğindeki) gizli satır/sütunları gösterir
  function goster(eksen, at) {
    var map = eksen === 'satir' ? 'gizliSatir' : 'gizliSutun', a, b;
    if (at !== undefined) { a = at - 1; while (a > 0 && st.veri[map][a - 1]) a--; b = at - 1; }
    else {
      var rg = aralik();
      a = eksen === 'satir' ? rg.r0 : rg.c0; b = eksen === 'satir' ? rg.r1 : rg.c1;
      if ((eksen === 'satir' && st.mod === 'sutun') || (eksen === 'sutun' && st.mod === 'satir') || st.mod === 'tum') { a = 0; b = Infinity; }
      // Tek satır/sütun seçiliyse komşu gizli bloklar da açılır
      while (a > 0 && st.veri[map][a - 1]) a--;
      while (b !== Infinity && st.veri[map][b + 1]) b++;
    }
    var n = 0;
    var ok = degistir(function () { Object.keys(st.veri[map]).forEach(function (k) { if (+k >= a && +k <= b) { delete st.veri[map][k]; n++; } }); });
    if (!ok) { UI.toast('Seçimde gizli ' + (eksen === 'satir' ? 'satır' : 'sütun') + ' yok.', 'err'); return; }
    tabloyuCiz(); boya();
    UI.toast(n + ' ' + (eksen === 'satir' ? 'satır' : 'sütun') + ' gösterildi.', 'ok');
  }
  function tumunuGoster() {
    var n = Object.keys(st.veri.gizliSatir).length + Object.keys(st.veri.gizliSutun).length;
    if (!n) return;
    degistir(function () { st.veri.gizliSatir = {}; st.veri.gizliSutun = {}; });
    tabloyuCiz(); boya();
    UI.toast(n + ' satır/sütun gösterildi.', 'ok');
  }

  function ekleSil(eksen, at, n) {
    degistir(function () { T.yapiDegistir(st.veri, eksen, at, n); });
    hesapla();
    if (n > 0) { if (eksen === 'satir') st.satir += n; else st.sutun += n; }
    tabloyuCiz(); boya();
  }

  // Doldurma: kaynak aralığı hedef aralığa tekrarlayarak kopyalar; formüller kaydırılır,
  // aynı sütunda (satırda) en az iki sabit sayı varsa doğrusal seri sürdürülür.
  function doldur(kaynak, hedef, yon) {
    degistir(function () {
      var dikey = yon === 'asagi' || yon === 'yukari';
      var uz = dikey ? kaynak.r1 - kaynak.r0 + 1 : kaynak.c1 - kaynak.c0 + 1;
      var seriler = {};
      var dis0 = dikey ? kaynak.c0 : kaynak.r0, dis1 = dikey ? kaynak.c1 : kaynak.r1;
      for (var d = dis0; d <= dis1; d++) {
        var vals = [];
        for (var i = 0; i < uz; i++) {
          var raw = dikey ? st.veri.hucreler[T.addr(kaynak.r0 + i, d)] : st.veri.hucreler[T.addr(d, kaynak.c0 + i)];
          vals.push(raw !== undefined && !T.isFormula(raw) && typeof T.sabitDeger(raw) === 'number' ? T.sabitDeger(raw) : null);
        }
        if (uz >= 2 && vals.every(function (v) { return v !== null; })) {
          seriler[d] = { ilk: vals[0], son: vals[uz - 1], adim: (vals[uz - 1] - vals[0]) / (uz - 1) };
        }
      }
      for (var r = hedef.r0; r <= hedef.r1; r++) for (var c = hedef.c0; c <= hedef.c1; c++) {
        var konum = dikey ? r - kaynak.r0 : c - kaynak.c0; // kaynağa göre konum (negatif = yukarı/sola)
        var mod = ((konum % uz) + uz) % uz;
        var sr = dikey ? kaynak.r0 + mod : r, sc = dikey ? c : kaynak.c0 + mod;
        var sd = dikey ? c : r, seri = seriler[sd];
        if (seri) { hucreYaz(r, c, T.goster(Number((seri.ilk + seri.adim * konum).toPrecision(15))).replace(/\./g, '')); continue; }
        var src = st.veri.hucreler[T.addr(sr, sc)];
        hucreYaz(r, c, src === undefined ? null : (T.isFormula(src) ? T.kaydir(src, r - sr, c - sc) : src));
      }
    });
    yenile();
  }
  function kisaDoldur(yon) {
    var rg = aralik();
    if (yon === 'asagi') {
      if (rg.r0 === rg.r1) { if (rg.r0 === 0) return; doldur({ r0: rg.r0 - 1, r1: rg.r0 - 1, c0: rg.c0, c1: rg.c1 }, rg, 'asagi'); }
      else doldur({ r0: rg.r0, r1: rg.r0, c0: rg.c0, c1: rg.c1 }, { r0: rg.r0 + 1, r1: rg.r1, c0: rg.c0, c1: rg.c1 }, 'asagi');
    } else {
      if (rg.c0 === rg.c1) { if (rg.c0 === 0) return; doldur({ r0: rg.r0, r1: rg.r1, c0: rg.c0 - 1, c1: rg.c0 - 1 }, rg, 'saga'); }
      else doldur({ r0: rg.r0, r1: rg.r1, c0: rg.c0, c1: rg.c0 }, { r0: rg.r0, r1: rg.r1, c0: rg.c0 + 1, c1: rg.c1 }, 'saga');
    }
  }

  // ---- Pano
  function sinirli(rg) {
    // Tüm satır/sütun seçiminde yalnız kullanılan alanı al
    return { r0: rg.r0, c0: rg.c0, r1: Math.min(rg.r1, Math.max(st.hesap.maxR, rg.r0)), c1: Math.min(rg.c1, Math.max(st.hesap.maxC, rg.c0)) };
  }
  function kopyala(kes, olay) {
    var rg = sinirli(aralik()), satirlar = [], ham = [];
    for (var r = rg.r0; r <= rg.r1; r++) {
      var s = [], h = [];
      for (var c = rg.c0; c <= rg.c1; c++) {
        var v = st.hesap.deger(r, c);
        s.push(v === null ? '' : T.goster(v));
        h.push(st.veri.hucreler[T.addr(r, c)]);
      }
      satirlar.push(s.join('\t')); ham.push(h);
    }
    var metin = satirlar.join('\r\n');
    st.pano = { rg: rg, ham: ham, metin: metin, kes: !!kes };
    if (olay && olay.clipboardData) { olay.clipboardData.setData('text/plain', metin); olay.preventDefault(); }
    else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(metin).catch(function () { /* yalnız iç pano */ });
    if (!olay) UI.toast((kes ? 'Kesildi' : 'Kopyalandı') + ': ' + aralikAdi(rg) + ' — yapıştırmak için Ctrl+V', 'ok');
  }
  function tsvOku(metin) {
    var satirlar = [], satir = [], hucre = '', tirnak = false, i = 0;
    metin = metin.replace(/\r\n?/g, '\n');
    if (metin.slice(-1) === '\n') metin = metin.slice(0, -1);
    for (; i < metin.length; i++) {
      var ch = metin.charAt(i);
      if (tirnak) {
        if (ch === '"') { if (metin.charAt(i + 1) === '"') { hucre += '"'; i++; } else tirnak = false; }
        else hucre += ch;
      } else if (ch === '"' && hucre === '') tirnak = true;
      else if (ch === '\t') { satir.push(hucre); hucre = ''; }
      else if (ch === '\n') { satir.push(hucre); satirlar.push(satir); satir = []; hucre = ''; }
      else hucre += ch;
    }
    satir.push(hucre); satirlar.push(satir);
    return satirlar;
  }
  function yapistir(metin) {
    var rg = aralik(), r0 = rg.r0, c0 = rg.c0, p = st.pano;
    if (p && metin === p.metin) {
      var h = p.ham.length, w = p.ham[0].length;
      // Tek hücre kopyalanıp birden çok hücre seçildiyse seçimin tamamı doldurulur
      var tekrarR = (rg.r1 - rg.r0 + 1) % h === 0 && st.mod === 'hucre' ? (rg.r1 - rg.r0 + 1) / h : 1;
      var tekrarC = (rg.c1 - rg.c0 + 1) % w === 0 && st.mod === 'hucre' ? (rg.c1 - rg.c0 + 1) / w : 1;
      degistir(function () {
        if (p.kes) for (var a = p.rg.r0; a <= p.rg.r1; a++) for (var b = p.rg.c0; b <= p.rg.c1; b++) delete st.veri.hucreler[T.addr(a, b)];
        for (var tr = 0; tr < tekrarR; tr++) for (var tc = 0; tc < tekrarC; tc++)
          for (var i = 0; i < h; i++) for (var j = 0; j < w; j++) {
            var src = p.ham[i][j], r = r0 + tr * h + i, c = c0 + tc * w + j;
            hucreYaz(r, c, src === undefined ? null : (T.isFormula(src) && !p.kes ? T.kaydir(src, r - (p.rg.r0 + i), c - (p.rg.c0 + j)) : src));
          }
      });
      if (p.kes) st.pano = null;
      st.anchor = { r: r0, c: c0 }; st.sel = { r: r0 + h * tekrarR - 1, c: c0 + w * tekrarC - 1 }; st.mod = 'hucre';
    } else {
      var tablo = tsvOku(metin);
      degistir(function () {
        tablo.forEach(function (satir, i) { satir.forEach(function (v, j) { hucreYaz(r0 + i, c0 + j, v.trim() === '' ? null : v); }); });
      });
      st.anchor = { r: r0, c: c0 }; st.sel = { r: r0 + tablo.length - 1, c: c0 + Math.max.apply(null, tablo.map(function (s) { return s.length; })) - 1 }; st.mod = 'hucre';
    }
    genislet(st.sel.r, st.sel.c);
    yenile();
  }

  // ---- Fare
  var surukle = null; // { tur: 'hucre'|'satir'|'sutun'|'genislik'|'doldur'|'sec', ... }
  function hucreAlt(e) {
    var el = document.elementFromPoint(e.clientX, e.clientY);
    return el ? el.closest('.xl-wrap td[data-r], .xl-wrap th.xl-rh, .xl-wrap th.xl-ch') : null;
  }
  function bagla(wrap) {
    wrap.addEventListener('mousedown', function (e) {
      closeMenu();
      if (st.edit && st.edit.input && e.target === st.edit.input) return;
      var gb = e.target.closest('.xl-goster');
      if (gb) { e.preventDefault(); e.stopPropagation(); goster(gb.dataset.eksen, +gb.dataset.at); return; }
      var rs = e.target.closest('.xl-rs');
      if (rs) { e.preventDefault(); surukle = { tur: 'genislik', c: +rs.dataset.c, x: e.clientX, w0: gen(+rs.dataset.c) }; return; }
      if (e.target.closest('.xl-tutamac')) { e.preventDefault(); surukle = { tur: 'doldur', kaynak: aralik(), hedef: null }; return; }
      var td = e.target.closest('td[data-r]'), rh = e.target.closest('th.xl-rh'), ch = e.target.closest('th.xl-ch'), kose = e.target.closest('th.xl-kose');
      // Formül yazarken hücre tıklaması başvuru ekler
      if (td && secilebilir()) {
        e.preventDefault();
        var p = { r: +td.dataset.r, c: +td.dataset.c };
        basvuruEkle(p.r, p.c, p.r, p.c);
        surukle = { tur: 'sec', r: p.r, c: p.c };
        return;
      }
      if (e.button === 2) {
        // Sağ tık: seçimin dışındaysa önce oraya taşı
        var rg = aralik();
        if (td) { var r = +td.dataset.r, c = +td.dataset.c; if (r < rg.r0 || r > rg.r1 || c < rg.c0 || c > rg.c1) { if (st.edit && !bitir(true)) return; git(r, c, false); boya(); } }
        else if (rh) { var rr = +rh.dataset.r; if (st.mod !== 'satir' || rr < rg.r0 || rr > rg.r1) { st.mod = 'satir'; st.anchor = { r: rr, c: 0 }; st.sel = { r: rr, c: st.sel.c }; boya(); } }
        else if (ch) { var cc = +ch.dataset.c; if (st.mod !== 'sutun' || cc < rg.c0 || cc > rg.c1) { st.mod = 'sutun'; st.anchor = { r: 0, c: cc }; st.sel = { r: st.sel.r, c: cc }; boya(); } }
        return;
      }
      if (!td && !rh && !ch && !kose) return;
      if (st.edit && !bitir(true)) { e.preventDefault(); return; }
      e.preventDefault();
      wrap.focus({ preventScroll: true });
      if (kose) { st.mod = 'tum'; st.anchor = { r: 0, c: 0 }; st.sel = { r: st.sel.r, c: st.sel.c }; boya(); return; }
      if (td) {
        var p2 = { r: +td.dataset.r, c: +td.dataset.c };
        if (e.shiftKey && st.mod === 'hucre') st.sel = p2; else { st.mod = 'hucre'; st.sel = p2; st.anchor = { r: p2.r, c: p2.c }; }
        surukle = { tur: 'hucre' };
      } else if (rh) {
        var r2 = +rh.dataset.r;
        if (!(e.shiftKey && st.mod === 'satir')) st.anchor = { r: r2, c: 0 };
        st.mod = 'satir'; st.sel = { r: r2, c: st.sel.c };
        surukle = { tur: 'satir' };
      } else if (ch) {
        var c2 = +ch.dataset.c;
        if (!(e.shiftKey && st.mod === 'sutun')) st.anchor = { r: 0, c: c2 };
        st.mod = 'sutun'; st.sel = { r: st.sel.r, c: c2 };
        surukle = { tur: 'sutun' };
      }
      boya();
    });
    wrap.addEventListener('dblclick', function (e) {
      var td = e.target.closest('td[data-r]');
      if (td && !st.edit) { git(+td.dataset.r, +td.dataset.c, false); basla('', 'f2'); }
      var rs = e.target.closest('.xl-rs');
      if (rs) { // çift tık: genişliği içeriğe uydur
        var c = +rs.dataset.c, en = 40;
        Object.keys(st.td).forEach(function (k) { var td2 = st.td[k]; if (+td2.dataset.c === c) en = Math.max(en, metinGenisligi(td2.textContent) + 16); });
        degistir(function () { st.veri.genislik[c] = Math.min(600, en); });
        tabloyuCiz(); boya();
      }
    });
    wrap.addEventListener('keydown', klavye);
    wrap.addEventListener('copy', function (e) { if (!st.edit) kopyala(false, e); });
    wrap.addEventListener('cut', function (e) { if (!st.edit) kopyala(true, e); });
    wrap.addEventListener('paste', function (e) {
      if (st.edit) return;
      e.preventDefault();
      yapistir((e.clipboardData || root.clipboardData).getData('text/plain') || '');
    });
    wrap.addEventListener('contextmenu', function (e) {
      if (st.edit && st.edit.input && e.target === st.edit.input) return;
      e.preventDefault();
      menu(e.clientX, e.clientY);
    });
    wrap.addEventListener('scroll', function () {
      if (wrap.scrollTop + wrap.clientHeight > wrap.scrollHeight - 300) { st.satir += 100; tabloyuCiz(); }
      if (wrap.scrollLeft + wrap.clientWidth > wrap.scrollWidth - 200) { st.sutun += 10; tabloyuCiz(); }
    });
  }
  var olcuCanvas = null;
  function metinGenisligi(s) {
    olcuCanvas = olcuCanvas || document.createElement('canvas');
    var ctx = olcuCanvas.getContext('2d');
    ctx.font = '13px ' + getComputedStyle(document.body).fontFamily;
    return ctx.measureText(s).width;
  }

  document.addEventListener('mousemove', function (e) {
    if (!surukle) return;
    if (surukle.tur === 'genislik') {
      var w = Math.max(24, surukle.w0 + e.clientX - surukle.x);
      st.veri.genislik[surukle.c] = w;
      var wrap = izgara(), t = wrap && wrap.querySelector('table.xl');
      if (t) {
        var cols = t.querySelectorAll('col'), idx = 1;
        for (var c = 0; c < surukle.c; c++) if (!gizliC(c)) idx++;
        cols[idx].style.width = w + 'px';
        var top = SATIR_BASLIK; for (var i = 1; i < cols.length; i++) top += parseFloat(cols[i].style.width);
        t.style.width = top + 'px';
        boya();
      }
      return;
    }
    var el = hucreAlt(e);
    if (!el) return;
    var r = el.dataset.r !== undefined ? +el.dataset.r : null, c = el.dataset.c !== undefined ? +el.dataset.c : null;
    if (surukle.tur === 'hucre' && r !== null && c !== null) { st.sel = { r: r, c: c }; boya(); }
    else if (surukle.tur === 'satir' && r !== null) { st.sel = { r: r, c: st.sel.c }; boya(); }
    else if (surukle.tur === 'sutun' && c !== null) { st.sel = { r: st.sel.r, c: c }; boya(); }
    else if (surukle.tur === 'sec' && r !== null && c !== null && st.edit) { basvuruEkle(surukle.r, surukle.c, r, c); }
    else if (surukle.tur === 'doldur' && r !== null && c !== null) {
      var k = surukle.kaynak, h = null;
      var asagi = r - k.r1, yukari = k.r0 - r, sag = c - k.c1, sol = k.c0 - c;
      var m = Math.max(asagi, yukari, sag, sol);
      if (m > 0) {
        if (m === asagi) h = { yon: 'asagi', rg: { r0: k.r1 + 1, r1: r, c0: k.c0, c1: k.c1 } };
        else if (m === yukari) h = { yon: 'yukari', rg: { r0: r, r1: k.r0 - 1, c0: k.c0, c1: k.c1 } };
        else if (m === sag) h = { yon: 'saga', rg: { r0: k.r0, r1: k.r1, c0: k.c1 + 1, c1: c } };
        else h = { yon: 'sola', rg: { r0: k.r0, r1: k.r1, c0: c, c1: k.c0 - 1 } };
      }
      surukle.hedef = h;
      // Önizleme: seçimi kaynak + hedef olarak göster
      var tum = h ? { r0: Math.min(k.r0, h.rg.r0), r1: Math.max(k.r1, h.rg.r1), c0: Math.min(k.c0, h.rg.c0), c1: Math.max(k.c1, h.rg.c1) } : k;
      st.mod = 'hucre'; st.anchor = { r: tum.r0, c: tum.c0 }; st.sel = { r: tum.r1, c: tum.c1 };
      boya();
    }
  });
  document.addEventListener('mouseup', function () {
    if (!surukle) return;
    var s = surukle;
    surukle = null;
    if (s.tur === 'genislik') {
      var w = st.veri.genislik[s.c];
      st.veri.genislik[s.c] = s.w0; // geri alma için önce eski hali
      if (w !== s.w0) degistir(function () { st.veri.genislik[s.c] = w; });
      if (st.veri.genislik[s.c] === VARS_GEN) delete st.veri.genislik[s.c];
      return;
    }
    if (s.tur === 'doldur') {
      if (s.hedef) doldur(s.kaynak, s.hedef.rg, s.hedef.yon);
      else { st.anchor = { r: s.kaynak.r0, c: s.kaynak.c0 }; st.sel = { r: s.kaynak.r1, c: s.kaynak.c1 }; boya(); }
    }
  });

  // ---- Bağlam menüsü
  function closeMenu() { var m = document.getElementById('ctxmenu'); if (m) m.remove(); }
  function menu(x, y) {
    closeMenu();
    var rg = aralik();
    var nr = rg.r1 - rg.r0 + 1, nc = rg.c1 - rg.c0 + 1;
    var satirSec = st.mod === 'satir', sutunSec = st.mod === 'sutun', tum = st.mod === 'tum';
    var gizliVarR = Object.keys(st.veri.gizliSatir).length > 0, gizliVarC = Object.keys(st.veri.gizliSutun).length > 0;
    var items = [
      { label: 'Kes', key: 'Ctrl+X', fn: function () { kopyala(true); } },
      { label: 'Kopyala', key: 'Ctrl+C', fn: function () { kopyala(false); } },
      { label: 'Yapıştır', key: 'Ctrl+V', disabled: !st.pano, fn: function () { if (st.pano) yapistir(st.pano.metin); } },
      { label: 'İçeriği temizle', key: 'Delete', fn: temizle },
      null
    ];
    if (!sutunSec && !tum) {
      items.push({ label: (nr > 1 ? nr + ' satırı' : 'Satırı') + ' gizle', key: 'Ctrl+9', fn: function () { gizle('satir'); } });
      if (gizliVarR) items.push({ label: 'Satırları göster', key: 'Ctrl+Shift+9', fn: function () { goster('satir'); } });
    }
    if (!satirSec && !tum) {
      items.push({ label: (nc > 1 ? nc + ' sütunu' : 'Sütunu') + ' gizle', key: 'Ctrl+0', fn: function () { gizle('sutun'); } });
      if (gizliVarC) items.push({ label: 'Sütunları göster', key: 'Ctrl+Shift+0', fn: function () { goster('sutun'); } });
    }
    if (tum && (gizliVarR || gizliVarC)) items.push({ label: 'Tüm gizlileri göster', fn: tumunuGoster });
    if (!tum) {
      items.push(null);
      if (!sutunSec) {
        items.push({ label: 'Üste ' + (nr > 1 ? nr + ' satır' : 'satır') + ' ekle', fn: function () { ekleSil('satir', rg.r0, nr); } });
        items.push({ label: 'Alta ' + (nr > 1 ? nr + ' satır' : 'satır') + ' ekle', fn: function () { ekleSil('satir', rg.r1 + 1, nr); } });
        items.push({ label: (nr > 1 ? nr + ' satırı' : 'Satırı') + ' sil', fn: function () { ekleSil('satir', rg.r0, -nr); } });
      }
      if (!satirSec) {
        if (!sutunSec) items.push(null);
        items.push({ label: 'Sola ' + (nc > 1 ? nc + ' sütun' : 'sütun') + ' ekle', fn: function () { ekleSil('sutun', rg.c0, nc); } });
        items.push({ label: 'Sağa ' + (nc > 1 ? nc + ' sütun' : 'sütun') + ' ekle', fn: function () { ekleSil('sutun', rg.c1 + 1, nc); } });
        items.push({ label: (nc > 1 ? nc + ' sütunu' : 'Sütunu') + ' sil', fn: function () { ekleSil('sutun', rg.c0, -nc); } });
      }
    }
    var m = UI.el('div', { class: 'ctxmenu', id: 'ctxmenu', role: 'menu' });
    items.forEach(function (it) {
      if (!it) { m.appendChild(UI.el('div', { class: 'ctx-sep' })); return; }
      var b = UI.el('button', { type: 'button', role: 'menuitem' }, '<span>' + it.label + '</span>' + (it.key ? '<kbd>' + it.key + '</kbd>' : ''));
      if (it.disabled) b.disabled = true;
      b.onmousedown = function (ev) { ev.preventDefault(); };
      b.onclick = function () { closeMenu(); it.fn(); if (izgara()) izgara().focus({ preventScroll: true }); };
      m.appendChild(b);
    });
    document.body.appendChild(m);
    var r = m.getBoundingClientRect();
    m.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
    m.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
  }
  document.addEventListener('mousedown', function (ev) { var m = document.getElementById('ctxmenu'); if (m && !m.contains(ev.target)) closeMenu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  root.addEventListener('hashchange', closeMenu);

  // ---- Yardım ve dışa aktarma
  function formulYardim() {
    var satirlar = T.ISLEVLER.map(function (f) {
      return '<tr><td><b>' + U.escapeHtml(f.adlar[0]) + '</b>' + (f.adlar.length > 1 ? ' <span class="muted">' + U.escapeHtml(f.adlar.slice(1).join(', ')) + '</span>' : '') + '</td>' +
        '<td>' + U.escapeHtml(f.aciklama) + '</td><td><code>' + U.escapeHtml(f.ornek) + '</code></td></tr>';
    }).join('');
    var body = UI.el('div', { class: 'xl-yardim' },
      '<p>Formül <b>=</b> ile başlar. Bağımsız değişkenler <b>;</b> ile ayrılır, ondalık için <b>,</b> kullanılır (Türkçe Excel gibi). ' +
      'Başvurular: <code>A1</code>, aralık <code>A1:C10</code>, tüm sütun <code>B:B</code>; <code>$A$1</code> kopyalarken sabit kalır. ' +
      'İşleçler: <code>+ - * / ^ %</code>, metin birleştirme <code>&amp;</code>, karşılaştırma <code>= &lt;&gt; &lt; &gt; &lt;= &gt;=</code>.</p>' +
      '<p>Formül yazarken bir hücreye tıklamak ya da sürüklemek başvuruyu formüle ekler. Sağ alt köşedeki tutamaç sürüklenerek formül/seri doldurulur.</p>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>İşlev</th><th>Açıklama</th><th>Örnek</th></tr></thead><tbody>' + satirlar + '</tbody></table></div>' +
      '<h4>Kısayollar</h4><p class="small">Oklar / Ctrl+ok (veri kenarı) · Shift+ok (seçim) · F2 veya yazmaya başlama (düzenle) · Enter / Tab · Esc · Delete (temizle) · ' +
      'Ctrl+C / X / V · Ctrl+Z / Y · Ctrl+A · Ctrl+D / Ctrl+R (aşağı / sağa doldur) · Ctrl+9 / Ctrl+0 (satır / sütun gizle) · Ctrl+Shift+9 / 0 (göster). ' +
      'Satır ve sütun başlıklarına sağ tıklayarak gizleme, ekleme ve silme yapılabilir.</p>');
    UI.openModal('Formüller ve kısayollar', body, [{ label: 'Kapat', class: 'primary', onclick: UI.closeModal }]);
    var box = document.querySelector('#modal .modal-box');
    if (box) box.classList.add('wide');
  }

  function excelIndir() {
    var X = root.XLSX;
    if (!X) { UI.toast('Excel kütüphanesi yüklenemedi.', 'err'); return; }
    var maxR = st.hesap.maxR, maxC = st.hesap.maxC;
    if (maxR < 0) { UI.toast('Tablo boş.', 'err'); return; }
    var aoa = [];
    for (var r = 0; r <= maxR; r++) {
      var s = [];
      for (var c = 0; c <= maxC; c++) {
        var v = st.hesap.deger(r, c);
        s.push(v === null ? null : T.isErr(v) ? v.kod : v);
      }
      aoa.push(s);
    }
    var ws = X.utils.aoa_to_sheet(aoa);
    var cols = [], rows = [];
    for (var c2 = 0; c2 <= maxC; c2++) cols.push({ wpx: gen(c2), hidden: gizliC(c2) });
    for (var r2 = 0; r2 <= maxR; r2++) rows.push(gizliR(r2) ? { hidden: true } : {});
    ws['!cols'] = cols; ws['!rows'] = rows;
    var wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, 'Faturalar');
    var t = S.tuketimGet(st.tt);
    X.writeFile(wb, ((t ? t.ad : 'Veriler') + ' - Veriler').replace(/[\\/:*?"<>|]/g, '') + '.xlsx');
  }

  App.pages = App.pages || {};
  App.pages.veriler = { render: render, rerenderPage: function () { render(containerRef); } };
})(this);
