/* Veriler sayfası: tüketim tesisine ait fatura kayıtlarını Excel benzeri tabloda gösterir ve düzenletir.
   Klavye: oklar, Tab/Enter (gezinme), F2 veya yazmaya başlama (düzenleme), Esc (vazgeç), Delete (temizle),
   Ctrl+C / Ctrl+V (Excel ile kopyala-yapıştır), Ctrl+Z (geri al), Shift+ok veya sürükleme (alan seçimi). */
(function (root) {
  'use strict';
  var App = root.App, U = App.util, S = App.store, UI = App.ui, F = App.fields;

  var PREF_KEY = 'mahsupla.veriler.prefs';
  var prefs = loadPrefs();
  var state = { tt: null, records: [], fields: [], sel: null, anchor: null, editing: null, undo: [] };
  var containerRef = null;

  var NO_SUM = { carpan: 1, kdvOrani: 1 };

  function loadPrefs() {
    var d = { orient: 'cols', hidden: {}, yil: 'tum' };
    try { return Object.assign(d, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) { return d; }
  }
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* önemsiz */ } }

  // Kaydederken genel sayfa yenilemesini bastırır; tablo kendi yerinde güncellenir.
  function quiet(fn) { App.quietRender = true; try { fn(); } finally { App.quietRender = false; } }

  function summable(f) {
    return f.type === 'num' && !f.check && !NO_SUM[f.key] && f.group !== 'endeks' &&
      ['kWh', 'TL', 'MWh', 'kVArh'].indexOf(f.unit) >= 0;
  }

  function loadData() {
    var all = state.tt ? S.faturaList(state.tt) : [];
    state.years = Array.from(new Set(all.map(function (r) { return String(r.donem || '').slice(0, 4); }).filter(Boolean))).sort();
    state.records = prefs.yil === 'tum' ? all : all.filter(function (r) { return String(r.donem || '').indexOf(prefs.yil) === 0; });
    state.calc = state.records.map(function (r) { return F.compute(r); });
    state.notes = recordNotes(state.records);
    state.fields = F.FIELDS.filter(function (f) { return !f.hidden && !prefs.hidden[f.group]; });
  }

  // Kayıtlar arası uyarılar: aynı dönemde birden fazla fatura, çakışan okuma aralıkları, kontrol hataları
  function recordNotes(recs) {
    var notes = recs.map(function () { return []; });
    recs.forEach(function (a, i) {
      recs.forEach(function (b, j) {
        if (j <= i) return;
        if (a.donem && a.donem === b.donem) {
          notes[i].push('Aynı dönemde başka fatura: ' + (b.faturaNo || '—'));
          notes[j].push('Aynı dönemde başka fatura: ' + (a.faturaNo || '—'));
        } else if (a.ilkOkuma && a.sonOkuma && b.ilkOkuma && b.sonOkuma && a.ilkOkuma < b.sonOkuma && b.ilkOkuma < a.sonOkuma) {
          notes[i].push('Okuma aralığı ' + (b.faturaNo || U.donemLabel(b.donem)) + ' ile çakışıyor');
          notes[j].push('Okuma aralığı ' + (a.faturaNo || U.donemLabel(a.donem)) + ' ile çakışıyor');
        }
      });
      var errs = F.FIELDS.filter(function (f) { return f.check && F.checkStatus(f, state.calc[i][f.key], a) === 'err'; });
      if (errs.length) notes[i].push('Kontrol hatası: ' + errs.map(function (f) { return f.label.replace('Kontrol: ', ''); }).join(', '));
    });
    return notes;
  }
  function headLabel(ri) {
    var rec = state.records[ri];
    var label = U.escapeHtml(U.donemLabel(rec.donem) || '(dönem yok)');
    var n = state.notes[ri];
    return n.length ? '<span class="warn-mark" title="' + U.escapeHtml(n.join('\n')) + '">⚠</span> ' + label : label;
  }

  // Görünüm koordinatları (satır, sütun) <-> (kayıt, alan)
  function dims() {
    return prefs.orient === 'rows' ? { rows: state.records.length, cols: state.fields.length } : { rows: state.fields.length, cols: state.records.length };
  }
  function cellRef(r, c) {
    return prefs.orient === 'rows' ? { ri: r, fi: c } : { ri: c, fi: r };
  }
  function value(ri, fi) {
    var f = state.fields[fi];
    return f.calc ? state.calc[ri][f.key] : state.records[ri][f.key];
  }
  function display(f, v) {
    if (v === null || v === undefined || v === '') return '';
    if (f.type === 'num') return U.formatTRNumber(v, f.dec === undefined ? 2 : f.dec);
    if (f.type === 'date') return U.formatTRDate(v);
    if (f.type === 'month') return U.donemLabel(v);
    return String(v);
  }
  function editText(f, v) {
    if (v === null || v === undefined) return '';
    if (f.type === 'num') return U.formatTRNumber(v, f.dec === undefined ? 2 : f.dec).replace(/\./g, '');
    if (f.type === 'date') return U.formatTRDate(v);
    return String(v);
  }
  function parse(f, s) {
    s = String(s === undefined || s === null ? '' : s).trim();
    if (s === '') return null;
    if (f.type === 'num') { var n = U.parseTRNumber(s); return n === null ? undefined : n; }
    if (f.type === 'date') return U.parseTRDate(s) || undefined;
    if (f.type === 'month') {
      var m = s.match(/^(\d{4})[-./](\d{1,2})$/) || s.match(/^(\d{1,2})[-./](\d{4})$/);
      if (m) return m[1].length === 4 ? m[1] + '-' + ('0' + m[2]).slice(-2) : m[2] + '-' + ('0' + m[1]).slice(-2);
      var idx = U.AYLAR.findIndex(function (a) { return s.toLocaleLowerCase('tr-TR').indexOf(a.toLocaleLowerCase('tr-TR')) === 0; });
      var y = s.match(/\d{4}/);
      if (idx >= 0 && y) return y[0] + '-' + ('0' + (idx + 1)).slice(-2);
      return undefined;
    }
    return s;
  }

  function render(container, params) {
    containerRef = container;
    var list = S.tuketimList();
    if (params && params.tt) state.tt = params.tt;
    if (!state.tt || !S.tuketimGet(state.tt)) state.tt = list.length ? list[0].id : null;
    loadData();

    container.innerHTML = '';
    var page = UI.el('div', { class: 'veriler-page' });

    if (!list.length) {
      page.appendChild(UI.el('div', { class: 'empty' }, '<p>Önce bir tüketim tesisi oluşturun.</p><a class="btn primary" href="#/tesisler">Tesisler</a>'));
      container.appendChild(page);
      return;
    }

    // Araç çubuğu
    var bar = UI.el('div', { class: 'toolbar' });
    var sel = UI.el('select');
    list.forEach(function (t) {
      var o = UI.el('option', { value: t.id }, U.escapeHtml(t.ad));
      if (t.id === state.tt) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = function () { state.tt = sel.value; state.sel = state.anchor = null; state.undo = []; location.hash = '#/veriler?tt=' + state.tt; };
    bar.appendChild(UI.el('label', { class: 'inline' }, '<b>Veriler</b> —'));
    bar.appendChild(sel);

    var yil = UI.el('select', { title: 'Yıl filtresi' });
    yil.appendChild(UI.el('option', { value: 'tum' }, 'Tüm yıllar'));
    state.years.forEach(function (y) { var o = UI.el('option', { value: y }, y); if (prefs.yil === y) o.selected = true; yil.appendChild(o); });
    yil.onchange = function () { prefs.yil = yil.value; savePrefs(); render(container); };
    bar.appendChild(yil);

    var orient = UI.el('button', { class: 'btn sm', title: 'Satır/sütun yönünü değiştir', onclick: function () {
      prefs.orient = prefs.orient === 'rows' ? 'cols' : 'rows'; state.sel = state.anchor = null; savePrefs(); render(container);
    } }, prefs.orient === 'rows' ? '⇄ Aylar sütunda göster' : '⇄ Aylar satırda göster');
    bar.appendChild(orient);

    bar.appendChild(UI.el('span', { class: 'sep' }));
    bar.appendChild(UI.el('button', { class: 'btn sm', onclick: addRow }, '+ Boş kayıt'));
    bar.appendChild(UI.el('button', { class: 'btn sm danger', onclick: deleteSelected }, 'Seçili kaydı sil'));
    bar.appendChild(UI.el('button', { class: 'btn sm', onclick: exportCSV }, 'CSV (Excel) indir'));
    bar.appendChild(UI.el('a', { class: 'btn sm', href: '#/yukle?tt=' + state.tt }, 'Fatura Yükle'));
    page.appendChild(bar);

    // Grup görünürlüğü
    var chips = UI.el('div', { class: 'chips' }, '<span class="muted">Sütun grupları:</span>');
    F.GROUPS.forEach(function (g) {
      var c = UI.el('button', { class: 'chip' + (prefs.hidden[g.id] ? '' : ' on'), onclick: function () {
        prefs.hidden[g.id] = !prefs.hidden[g.id]; state.sel = state.anchor = null; savePrefs(); render(container);
      } }, U.escapeHtml(g.label));
      chips.appendChild(c);
    });
    page.appendChild(chips);

    // Formül çubuğu
    var fbar = UI.el('div', { class: 'formula-bar' }, '<span class="fx-name" id="fxName"></span><span class="fx-icon">fx</span>');
    var fx = UI.el('input', { id: 'fxInput', type: 'text', spellcheck: 'false' });
    fx.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); if (state.sel) commitValue(state.sel.r, state.sel.c, fx.value); gridEl().focus(); }
      if (e.key === 'Escape') { updateFormulaBar(); gridEl().focus(); }
    });
    fbar.appendChild(fx);
    page.appendChild(fbar);

    if (!state.records.length) {
      page.appendChild(UI.el('div', { class: 'empty' }, '<p>Bu tesis için kayıtlı fatura yok.</p><a class="btn primary" href="#/yukle?tt=' + state.tt + '">Fatura Yükle</a> <button class="btn" id="bosKayit">+ Elle kayıt ekle</button>'));
      container.appendChild(page);
      page.querySelector('#bosKayit').onclick = addRow;
      return;
    }

    var wrap = UI.el('div', { class: 'sheet-wrap', tabindex: '0', id: 'sheet' });
    wrap.appendChild(buildTable());
    page.appendChild(wrap);
    page.appendChild(UI.el('div', { class: 'statusbar', id: 'statusbar' }));
    container.appendChild(page);

    bindGrid(wrap);
    if (!state.sel) { state.sel = { r: 0, c: 0 }; state.anchor = { r: 0, c: 0 }; }
    clampSel();
    paintSelection();
    wrap.focus({ preventScroll: true });
  }

  function gridEl() { return document.getElementById('sheet'); }

  function groupSpans() {
    var spans = [];
    state.fields.forEach(function (f) {
      var last = spans[spans.length - 1];
      if (last && last.group === f.group) last.n++;
      else spans.push({ group: f.group, n: 1 });
    });
    return spans;
  }
  function groupLabel(id) { var g = F.GROUPS.find(function (x) { return x.id === id; }); return g ? g.label : id; }

  function cellHtml(ri, fi, r, c) {
    var f = state.fields[fi];
    var v = value(ri, fi);
    var cls = ['cell'];
    if (f.type === 'num') cls.push('num');
    if (f.calc) cls.push('calc');
    var rec = state.records[ri];
    var st = F.checkStatus(f, v, rec);
    if (st) cls.push(st);
    if (rec.duzeltilen && rec.duzeltilen[f.key]) cls.push('edited');
    var txt = display(f, v);
    var title = f.type === 'text' && txt.length > 30 ? ' title="' + U.escapeHtml(txt) + '"' : '';
    return '<td class="' + cls.join(' ') + '" data-r="' + r + '" data-c="' + c + '"' + title + '>' + U.escapeHtml(txt) + '</td>';
  }

  function totalFor(fi) {
    var f = state.fields[fi];
    if (!summable(f)) return '';
    var t = 0, any = false;
    for (var ri = 0; ri < state.records.length; ri++) {
      var v = value(ri, fi);
      if (typeof v === 'number') { t += v; any = true; }
    }
    return any ? U.formatTRNumber(t, f.dec === undefined ? 2 : f.dec) : '';
  }

  function buildTable() {
    var t = UI.el('table', { class: 'sheet ' + prefs.orient });
    var html = '';
    if (prefs.orient === 'rows') {
      html += '<thead><tr class="grp"><th class="corner" rowspan="2">Dönem</th>';
      groupSpans().forEach(function (s) { html += '<th colspan="' + s.n + '" class="g-' + s.group + '">' + U.escapeHtml(groupLabel(s.group)) + '</th>'; });
      html += '</tr><tr class="fld">';
      state.fields.forEach(function (f, fi) {
        html += '<th class="colh g-' + f.group + '" data-c="' + fi + '" style="min-width:' + (f.w || 96) + 'px" title="' + U.escapeHtml(f.label) + '">' +
          U.escapeHtml(f.label) + (f.unit ? '<small>' + U.escapeHtml(f.unit) + '</small>' : '') + '</th>';
      });
      html += '</tr></thead><tbody>';
      state.records.forEach(function (rec, ri) {
        html += '<tr><th class="rowh" data-r="' + ri + '">' + headLabel(ri) + '<small class="fno">' + U.escapeHtml(rec.faturaNo || '') + '</small></th>';
        state.fields.forEach(function (f, fi) { html += cellHtml(ri, fi, ri, fi); });
        html += '</tr>';
      });
      html += '</tbody><tfoot><tr><th class="rowh">Toplam</th>';
      state.fields.forEach(function (f, fi) { html += '<td class="num">' + totalFor(fi) + '</td>'; });
      html += '</tr></tfoot>';
    } else {
      html += '<thead><tr class="fld"><th class="corner">Alan</th>';
      state.records.forEach(function (rec, ri) { html += '<th class="colh" data-c="' + ri + '">' + headLabel(ri) + '<small>' + U.escapeHtml(rec.faturaNo || '') + '</small></th>'; });
      html += '<th class="colh total">Toplam</th></tr></thead><tbody>';
      var lastGroup = null;
      state.fields.forEach(function (f, fi) {
        if (f.group !== lastGroup) {
          html += '<tr class="grp-row"><th class="rowh g-' + f.group + '" colspan="' + (state.records.length + 2) + '">' + U.escapeHtml(groupLabel(f.group)) + '</th></tr>';
          lastGroup = f.group;
        }
        html += '<tr><th class="rowh g-' + f.group + '" data-r="' + fi + '" title="' + U.escapeHtml(f.label) + '">' + U.escapeHtml(f.label) + (f.unit ? ' <small>' + U.escapeHtml(f.unit) + '</small>' : '') + '</th>';
        state.records.forEach(function (rec, ri) { html += cellHtml(ri, fi, fi, ri); });
        html += '<td class="num total">' + totalFor(fi) + '</td></tr>';
      });
      html += '</tbody>';
    }
    t.innerHTML = html;
    return t;
  }

  // --- Seçim
  function clampSel() {
    var d = dims();
    [state.sel, state.anchor].forEach(function (p) {
      if (!p) return;
      p.r = Math.max(0, Math.min(d.rows - 1, p.r));
      p.c = Math.max(0, Math.min(d.cols - 1, p.c));
    });
  }
  function range() {
    var a = state.anchor || state.sel, b = state.sel;
    return { r0: Math.min(a.r, b.r), r1: Math.max(a.r, b.r), c0: Math.min(a.c, b.c), c1: Math.max(a.c, b.c) };
  }
  function tdAt(r, c) { return gridEl() && gridEl().querySelector('td[data-r="' + r + '"][data-c="' + c + '"]'); }

  function paintSelection() {
    var g = gridEl();
    if (!g || !state.sel) return;
    g.querySelectorAll('.sel, .active, .hl').forEach(function (e) { e.classList.remove('sel', 'active', 'hl'); });
    var rg = range();
    for (var r = rg.r0; r <= rg.r1; r++) for (var c = rg.c0; c <= rg.c1; c++) { var td = tdAt(r, c); if (td) td.classList.add('sel'); }
    var act = tdAt(state.sel.r, state.sel.c);
    if (act) {
      act.classList.add('active');
      scrollIntoView(act);
    }
    g.querySelectorAll('th.rowh[data-r]').forEach(function (th) { var r = +th.dataset.r; if (r >= rg.r0 && r <= rg.r1) th.classList.add('hl'); });
    g.querySelectorAll('th.colh[data-c]').forEach(function (th) { var c = +th.dataset.c; if (c >= rg.c0 && c <= rg.c1) th.classList.add('hl'); });
    updateFormulaBar();
    updateStatus();
  }

  function scrollIntoView(td) {
    var g = gridEl();
    var stickyLeft = g.querySelector('tbody th.rowh') ? g.querySelector('tbody th.rowh').offsetWidth : 0;
    var stickyTop = g.querySelector('thead') ? g.querySelector('thead').offsetHeight : 0;
    var gr = g.getBoundingClientRect(), tr = td.getBoundingClientRect();
    if (tr.left < gr.left + stickyLeft) g.scrollLeft -= (gr.left + stickyLeft - tr.left);
    else if (tr.right > gr.right) g.scrollLeft += tr.right - gr.right + 2;
    if (tr.top < gr.top + stickyTop) g.scrollTop -= (gr.top + stickyTop - tr.top);
    else if (tr.bottom > gr.bottom - 14) g.scrollTop += tr.bottom - gr.bottom + 16;
  }

  function updateFormulaBar() {
    var name = document.getElementById('fxName'), inp = document.getElementById('fxInput');
    if (!name || !state.sel) return;
    var ref = cellRef(state.sel.r, state.sel.c);
    var f = state.fields[ref.fi], rec = state.records[ref.ri];
    if (!f || !rec) return;
    name.textContent = U.donemLabel(rec.donem) + ' › ' + f.label;
    inp.value = editText(f, value(ref.ri, ref.fi));
    inp.readOnly = !!f.calc;
    inp.title = f.calc ? 'Hesaplanan alan (salt okunur)' : '';
  }

  function updateStatus() {
    var sb = document.getElementById('statusbar');
    if (!sb) return;
    var rg = range(), sum = 0, cnt = 0, n = 0;
    for (var r = rg.r0; r <= rg.r1; r++) for (var c = rg.c0; c <= rg.c1; c++) {
      var ref = cellRef(r, c), v = value(ref.ri, ref.fi);
      if (v !== null && v !== undefined && v !== '') cnt++;
      if (typeof v === 'number' && state.fields[ref.fi].type === 'num') { sum += v; n++; }
    }
    var checks = 0, errs = 0;
    state.records.forEach(function (rec, ri) {
      F.FIELDS.forEach(function (f) { if (f.check) { var st = F.checkStatus(f, state.calc[ri][f.key], rec); if (st) { checks++; if (st === 'err') errs++; } } });
    });
    var uyarili = state.notes.filter(function (x) { return x.length; }).length;
    sb.innerHTML = '<span>' + state.records.length + ' kayıt</span>' +
      (uyarili ? '<span class="warn">⚠ ' + uyarili + ' kayıtta uyarı (başlıktaki ⚠ üzerine gelin)</span>' : '') +
      '<span class="' + (errs ? 'err' : 'ok') + '">Kontroller: ' + (checks - errs) + '/' + checks + ' tamam' + (errs ? ' · ' + errs + ' hata' : '') + '</span>' +
      '<span class="grow"></span>' +
      (n > 1 ? '<span>Ortalama: ' + U.formatTRNumber(sum / n, 2) + '</span><span>Toplam: ' + U.formatTRNumber(sum, 2) + '</span>' : '') +
      '<span>Sayım: ' + cnt + '</span>';
  }

  // --- Düzenleme
  function startEdit(initial) {
    var ref = cellRef(state.sel.r, state.sel.c);
    var f = state.fields[ref.fi];
    if (f.calc) { UI.toast('Bu alan hesaplanır; değiştirilemez.', ''); return; }
    var td = tdAt(state.sel.r, state.sel.c);
    if (!td) return;
    var inp = UI.el('input', { class: 'cell-editor', type: 'text', spellcheck: 'false' });
    inp.value = initial !== undefined ? initial : editText(f, value(ref.ri, ref.fi));
    td.classList.add('editing');
    td.textContent = '';
    td.appendChild(inp);
    inp.focus();
    if (initial === undefined) inp.select();
    state.editing = { r: state.sel.r, c: state.sel.c, input: inp };
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
      else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        var dirDown = prefs.orient === 'rows';
        finishEdit();
        if (e.key === 'Enter') move(e.shiftKey ? -1 : 1, 0, false, !dirDown);
        else move(0, e.shiftKey ? -1 : 1);
      }
    });
    inp.addEventListener('blur', function () { if (state.editing && state.editing.input === inp) finishEdit(); });
  }
  function cancelEdit() {
    state.editing = null;
    rerender();
  }
  function finishEdit() {
    var ed = state.editing;
    if (!ed) return;
    state.editing = null;
    commitValue(ed.r, ed.c, ed.input.value);
  }

  function commitValue(r, c, text, batch) {
    var ref = cellRef(r, c);
    var f = state.fields[ref.fi], rec = state.records[ref.ri];
    if (!f || !rec || f.calc) return false;
    var v = parse(f, text);
    if (v === undefined) { UI.toast('"' + text + '" geçerli bir ' + (f.type === 'num' ? 'sayı' : f.type === 'date' ? 'tarih (gg.aa.yyyy)' : 'dönem (yyyy-aa)') + ' değil.', 'err'); if (!batch) rerender(); return false; }
    var old = rec[f.key] === undefined ? null : rec[f.key];
    if (old === v) { if (!batch) rerender(); return false; }
    state.undo.push({ id: rec.id, key: f.key, old: old, wasEdited: !!(rec.duzeltilen && rec.duzeltilen[f.key]) });
    rec[f.key] = v;
    rec.duzeltilen = rec.duzeltilen || {};
    rec.duzeltilen[f.key] = true;
    quiet(function () { S.faturaSave(rec, !!batch); });
    if (!batch) rerender();
    return true;
  }

  function rerender() {
    var g = gridEl();
    if (!g) return render(containerRef);
    var sl = g.scrollLeft, st = g.scrollTop;
    var selId = state.sel ? state.records[cellRef(state.sel.r, state.sel.c).ri].id : null;
    loadData();
    // Dönem değişip sıralama kaydıysa seçimi aynı kayıtta tut
    if (selId) {
      var ri = state.records.findIndex(function (x) { return x.id === selId; });
      if (ri >= 0) { if (prefs.orient === 'rows') state.sel.r = state.anchor.r = ri; else state.sel.c = state.anchor.c = ri; }
    }
    g.innerHTML = '';
    g.appendChild(buildTable());
    g.scrollLeft = sl; g.scrollTop = st;
    clampSel();
    paintSelection();
    g.focus({ preventScroll: true });
  }

  function move(dr, dc, extend, swap) {
    if (swap) { var t = dr; dr = dc; dc = t; }
    var d = dims();
    state.sel = { r: Math.max(0, Math.min(d.rows - 1, state.sel.r + dr)), c: Math.max(0, Math.min(d.cols - 1, state.sel.c + dc)) };
    if (!extend) state.anchor = { r: state.sel.r, c: state.sel.c };
    paintSelection();
  }

  function bindGrid(g) {
    var dragging = false;
    g.addEventListener('mousedown', function (e) {
      var td = e.target.closest('td[data-r]');
      var rh = e.target.closest('th.rowh[data-r]');
      var ch = e.target.closest('th.colh[data-c]');
      if (state.editing && e.target === state.editing.input) return;
      var d = dims();
      if (td) {
        var p = { r: +td.dataset.r, c: +td.dataset.c };
        if (e.shiftKey) state.sel = p; else { state.sel = p; state.anchor = { r: p.r, c: p.c }; }
        dragging = true;
      } else if (rh) {
        state.anchor = { r: +rh.dataset.r, c: 0 }; state.sel = { r: +rh.dataset.r, c: d.cols - 1 };
      } else if (ch) {
        state.anchor = { r: 0, c: +ch.dataset.c }; state.sel = { r: d.rows - 1, c: +ch.dataset.c };
      } else return;
      e.preventDefault();
      g.focus({ preventScroll: true });
      paintSelection();
    });
    g.addEventListener('mouseover', function (e) {
      if (!dragging) return;
      var td = e.target.closest('td[data-r]');
      if (td) { state.sel = { r: +td.dataset.r, c: +td.dataset.c }; paintSelection(); }
    });
    document.addEventListener('mouseup', function () { dragging = false; });
    g.addEventListener('dblclick', function (e) { if (e.target.closest('td[data-r]')) startEdit(); });

    g.addEventListener('keydown', function (e) {
      if (state.editing) return;
      var k = e.key, ctrl = e.ctrlKey || e.metaKey;
      var rowsMode = prefs.orient === 'rows';
      if (k === 'ArrowDown') { e.preventDefault(); move(1, 0, e.shiftKey); }
      else if (k === 'ArrowUp') { e.preventDefault(); move(-1, 0, e.shiftKey); }
      else if (k === 'ArrowRight') { e.preventDefault(); move(0, 1, e.shiftKey); }
      else if (k === 'ArrowLeft') { e.preventDefault(); move(0, -1, e.shiftKey); }
      else if (k === 'Tab') { e.preventDefault(); move(0, e.shiftKey ? -1 : 1); }
      else if (k === 'Enter') { e.preventDefault(); move(e.shiftKey ? -1 : 1, 0, false, !rowsMode); }
      else if (k === 'Home') { e.preventDefault(); state.sel.c = 0; if (!e.shiftKey) state.anchor = { r: state.sel.r, c: 0 }; paintSelection(); }
      else if (k === 'End') { e.preventDefault(); state.sel.c = dims().cols - 1; if (!e.shiftKey) state.anchor = { r: state.sel.r, c: state.sel.c }; paintSelection(); }
      else if (k === 'F2') { e.preventDefault(); startEdit(); }
      else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); clearRange(); }
      else if (ctrl && (k === 'c' || k === 'C')) { e.preventDefault(); copyRange(); }
      else if (ctrl && (k === 'z' || k === 'Z')) { e.preventDefault(); undo(); }
      else if (ctrl && (k === 'a' || k === 'A')) { e.preventDefault(); var d = dims(); state.anchor = { r: 0, c: 0 }; state.sel = { r: d.rows - 1, c: d.cols - 1 }; paintSelection(); }
      else if (!ctrl && !e.altKey && k.length === 1) { e.preventDefault(); startEdit(k); }
    });
    g.addEventListener('paste', function (e) {
      if (state.editing) return;
      e.preventDefault();
      pasteText((e.clipboardData || root.clipboardData).getData('text'));
    });
  }

  function clearRange() {
    var rg = range(), n = 0;
    for (var r = rg.r0; r <= rg.r1; r++) for (var c = rg.c0; c <= rg.c1; c++) if (commitValue(r, c, '', true)) n++;
    if (n) { quiet(S.save); rerender(); }
  }

  function copyRange() {
    var rg = range(), lines = [];
    for (var r = rg.r0; r <= rg.r1; r++) {
      var row = [];
      for (var c = rg.c0; c <= rg.c1; c++) {
        var ref = cellRef(r, c), f = state.fields[ref.fi];
        row.push(editText(f, value(ref.ri, ref.fi)));
      }
      lines.push(row.join('\t'));
    }
    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { UI.toast('Kopyalandı.'); }, fallback);
    else fallback();
    function fallback() {
      var ta = UI.el('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); UI.toast('Kopyalandı.'); } catch (err) { UI.toast('Kopyalanamadı.', 'err'); }
      ta.remove(); gridEl().focus();
    }
  }

  function pasteText(text) {
    if (!text) return;
    var rows = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(function (l) { return l.split('\t'); });
    var d = dims(), n = 0, r0 = range().r0, c0 = range().c0;
    rows.forEach(function (row, i) {
      row.forEach(function (val, j) {
        var r = r0 + i, c = c0 + j;
        if (r < d.rows && c < d.cols && commitValue(r, c, val, true)) n++;
      });
    });
    if (n) { quiet(S.save); UI.toast(n + ' hücre yapıştırıldı.', 'ok'); }
    state.anchor = { r: r0, c: c0 };
    state.sel = { r: Math.min(d.rows - 1, r0 + rows.length - 1), c: Math.min(d.cols - 1, c0 + rows[0].length - 1) };
    rerender();
  }

  function undo() {
    var u = state.undo.pop();
    if (!u) { UI.toast('Geri alınacak işlem yok.'); return; }
    var rec = S.faturaGet(u.id);
    if (!rec) return;
    rec[u.key] = u.old;
    if (rec.duzeltilen && !u.wasEdited) delete rec.duzeltilen[u.key];
    quiet(function () { S.faturaSave(rec); });
    rerender();
  }

  function addRow() {
    var now = new Date();
    var donem = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2);
    var rec = S.faturaSave({ tuketimTesisId: state.tt, donem: donem, kaynak: { elle: true } });
    prefs.yil = 'tum'; savePrefs();
    render(containerRef);
    var ri = state.records.findIndex(function (x) { return x.id === rec.id; });
    if (ri >= 0) {
      state.sel = prefs.orient === 'rows' ? { r: ri, c: 0 } : { r: 0, c: ri };
      state.anchor = { r: state.sel.r, c: state.sel.c };
      paintSelection();
    }
    UI.toast('Boş kayıt eklendi; dönemi ve değerleri girin.', 'ok');
  }

  function deleteSelected() {
    if (!state.sel || !state.records.length) return;
    var rg = range();
    var ids = [];
    var a = prefs.orient === 'rows' ? rg.r0 : rg.c0, b = prefs.orient === 'rows' ? rg.r1 : rg.c1;
    for (var i = a; i <= b; i++) ids.push(state.records[i]);
    UI.confirmModal('Kayıt sil', ids.map(function (r) { return U.donemLabel(r.donem) + (r.faturaNo ? ' (' + r.faturaNo + ')' : ''); }).join(', ') + ' silinsin mi?', 'Sil', function () {
      ids.forEach(function (r) { S.faturaDelete(r.id); });
      state.sel = state.anchor = null;
      UI.toast(ids.length + ' kayıt silindi.');
    });
  }

  function exportCSV() {
    var t = S.tuketimGet(state.tt);
    var fields = state.fields;
    var esc = function (s) { s = String(s === null || s === undefined ? '' : s); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var lines = [['Dönem'].concat(fields.map(function (f) { return f.label + (f.unit ? ' (' + f.unit + ')' : ''); })).map(esc).join(';')];
    state.records.forEach(function (rec, ri) {
      lines.push([rec.donem].concat(fields.map(function (f, fi) { return editText(f, value(ri, fi)); })).map(esc).join(';'));
    });
    U.download((t ? t.ad : 'veriler').replace(/[^\wçğıöşüÇĞİÖŞÜ -]/g, '') + ' - Veriler.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }

  App.pages = App.pages || {};
  App.pages.veriler = { render: render };
})(this);
