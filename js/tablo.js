/* Hesap tablosu çekirdeği (arayüzden bağımsız, Node ile test edilebilir):
   hücre adresleri, değer/formül ayrıştırma, formül hesaplama, kopyalamada başvuru kaydırma,
   satır/sütun ekleme-silmede başvuru düzeltme.
   Sözdizimi Türkçe Excel gibidir: =TOPLA(A1:A5;B2*2) — bağımsız değişken ayırıcı ";" (virgül de kabul edilir
   ama sayının içindeyse ondalık sayılır: 1,5), metin "çift tırnak" içinde. İşlevlerin İngilizce adları da çalışır. */
(function (root) {
  'use strict';

  // --- Adresler
  function colName(c) { var s = ''; c++; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
  function colIndex(name) { var n = 0; name = String(name).toUpperCase(); for (var i = 0; i < name.length; i++) n = n * 26 + (name.charCodeAt(i) - 64); return n - 1; }
  function addr(r, c) { return colName(c) + (r + 1); }
  function parseAddr(a) {
    var m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(String(a).trim());
    return m && +m[2] > 0 ? { r: +m[2] - 1, c: colIndex(m[1]) } : null;
  }
  // "B2" | "B2:D5" | "c:c" -> { r0, c0, r1, c1 } (sütun aralığında satırlar null)
  function parseRange(s) {
    s = String(s).trim();
    var p = s.split(':');
    if (p.length === 1) { var a = parseAddr(p[0]); return a ? { r0: a.r, c0: a.c, r1: a.r, c1: a.c } : null; }
    if (p.length !== 2) return null;
    var x = parseAddr(p[0]), y = parseAddr(p[1]);
    if (x && y) return { r0: Math.min(x.r, y.r), c0: Math.min(x.c, y.c), r1: Math.max(x.r, y.r), c1: Math.max(x.c, y.c) };
    var cm = /^\$?([A-Za-z]{1,3})$/;
    if (cm.test(p[0]) && cm.test(p[1])) {
      var c0 = colIndex(p[0].replace('$', '')), c1 = colIndex(p[1].replace('$', ''));
      return { r0: null, r1: null, c0: Math.min(c0, c1), c1: Math.max(c0, c1) };
    }
    return null;
  }

  // --- Hatalar
  function Hata(kod) { this.kod = kod; }
  Hata.prototype.toString = function () { return this.kod; };
  var E = { DIV0: new Hata('#SAYI/0!'), VALUE: new Hata('#DEĞER!'), NAME: new Hata('#AD?'), REF: new Hata('#BAŞV!'), NA: new Hata('#YOK'), NUM: new Hata('#SAYI!'), CIRC: new Hata('#DÖNGÜ!') };
  var HATA_KOD = {};
  Object.keys(E).forEach(function (k) { HATA_KOD[E[k].kod] = E[k]; });
  function isErr(v) { return v instanceof Hata; }

  // --- Hücreye yazılan değer (formül değilse)
  var NUM_TR = /^[-+]?([1-9]\d{0,2}(\.\d{3})+|\d+)(,\d+)?$/;   // 1.234,56 | 1234,5 | 1.500
  var NUM_DOT = /^[-+]?\d*\.\d+$/;                         // 0.5 | 12.75
  function sayiOku(s) {
    s = String(s).trim();
    if (!s) return null;
    var pct = /%$/.test(s);
    if (pct) s = s.slice(0, -1).trim();
    var n = null;
    if (NUM_TR.test(s)) n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    else if (NUM_DOT.test(s)) n = parseFloat(s);
    else if (/^[-+]?\d+(,\d+)?[eE][-+]?\d+$/.test(s)) n = parseFloat(s.replace(',', '.'));
    if (n === null || !isFinite(n)) return null;
    return pct ? n / 100 : n;
  }
  function trUpper(s) { return String(s).toLocaleUpperCase('tr-TR'); }
  function sabitDeger(raw) {
    var s = String(raw);
    if (s.trim() === '') return null;
    if (s.charAt(0) === "'") return s.slice(1);
    var n = sayiOku(s);
    if (n !== null) return n;
    var u = trUpper(s.trim());
    if (u === 'DOĞRU' || u === 'TRUE') return true;
    if (u === 'YANLIŞ' || u === 'FALSE') return false;
    if (HATA_KOD[u]) return HATA_KOD[u];
    return s;
  }
  function isFormula(raw) { return typeof raw === 'string' && raw.length > 1 && raw.charAt(0) === '='; }

  // --- Görüntüleme
  // b: sayı biçimi { g: binlik ayıracı, d: ondalık basamak (yoksa gerektiği kadar), p: yüzde }; yoksa Excel'deki "Genel"
  function goster(v, b) {
    if (v === null || v === undefined) return '';
    if (isErr(v)) return v.kod;
    if (v === true) return 'DOĞRU';
    if (v === false) return 'YANLIŞ';
    if (typeof v === 'number') {
      if (!isFinite(v)) return E.NUM.kod;
      if (b && (b.g || b.p || typeof b.d === 'number')) {
        var x = b.p ? v * 100 : v, d = typeof b.d === 'number' ? b.d : null;
        var s = Number(x.toPrecision(15)).toLocaleString('tr-TR', d === null ? { useGrouping: !!b.g, maximumFractionDigits: 10 } : { useGrouping: !!b.g, minimumFractionDigits: d, maximumFractionDigits: d });
        return s + (b.p ? '%' : '');
      }
      var a = Math.abs(v);
      if (a !== 0 && (a >= 1e15 || a < 1e-9)) return v.toExponential(4).replace('.', ',');
      return Number(v.toPrecision(15)).toLocaleString('tr-TR', { useGrouping: false, maximumFractionDigits: 10 });
    }
    return String(v);
  }
  // Yazılan sayının biçiminden hücre biçimi çıkarır (Excel gibi): "1.234,50" -> binlikli 2 ondalık, "3,00" -> 2 ondalık, "%18" -> yüzde
  function bicimTahmin(raw) {
    var s = String(raw).trim(), m;
    var pct = /%$/.test(s);
    if (pct) s = s.slice(0, -1).trim();
    if ((m = /^[-+]?[1-9]\d{0,2}(\.\d{3})+(,(\d+))?$/.exec(s))) return { g: true, d: m[3] ? m[3].length : 0, p: pct || undefined };
    if ((m = /^[-+]?\d+,(\d*0)$/.exec(s))) return { d: m[1].length, p: pct || undefined };
    if (pct && sayiOku(s) !== null) { var dm = /,(\d+)$/.exec(s); return { p: true, d: dm ? dm[1].length : 0 }; }
    return null;
  }
  // Excel biçim kodu <-> biçim: "#,##0.00" | "0.000" | "0%"
  function bicimKodu(b) {
    if (!b) return null;
    var d = typeof b.d === 'number' ? b.d : null;
    var k = (b.g ? '#,##0' : '0') + (d ? '.' + new Array(d + 1).join('0') : '') + (b.p ? '%' : '');
    return d === null && !b.g && !b.p ? null : k;
  }
  function bicimOku(z) {
    if (!z || typeof z !== 'string') return null;
    var k = z.split(';')[0].replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '');
    if (/^general$/i.test(k.trim()) || k.trim() === '@' || /[dmyhs]/i.test(k)) return null;
    if (!/[0#]/.test(k)) return null;
    var g = /#,##|0,0/.test(k), p = /%/.test(k), m = /[0#]\.([0#]+)/.exec(k);
    var b = { g: g || undefined, d: m ? m[1].length : 0, p: p || undefined };
    return b;
  }
  function metin(v) {
    if (v === null || v === undefined) return '';
    if (v === true) return 'DOĞRU';
    if (v === false) return 'YANLIŞ';
    if (typeof v === 'number') return String(Number(v.toPrecision(15))).replace('.', ',');
    return String(v);
  }

  // --- Sözcük ayırıcı
  var HARF = 'A-Za-zÇĞİÖŞÜçğıöşü_';
  var RE_ERR = /^#(SAYI\/0!|DEĞER!|AD\?|BAŞV!|YOK|SAYI!|DÖNGÜ!)/i;
  var RE_CELL = /^(\$?[A-Za-z]{1,3}\$?\d+)(?::(\$?[A-Za-z]{1,3}\$?\d+))?(?![A-Za-z0-9_(ÇĞİÖŞÜçğıöşü])/;
  var RE_COLS = /^(\$?[A-Za-z]{1,3}):(\$?[A-Za-z]{1,3})(?![A-Za-z0-9_(ÇĞİÖŞÜçğıöşü])/;
  var RE_NUM = /^\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?/;
  var RE_FN = new RegExp('^[' + HARF + '][' + HARF + '0-9.]*(?=\\s*\\()');
  var RE_NAME = new RegExp('^[' + HARF + '][' + HARF + '0-9.]*');

  function SozdizimHatasi(msg) { this.message = msg; }

  function tokenize(src) {
    var t = [], i = 0, n = src.length, m;
    while (i < n) {
      var ch = src.charAt(i);
      if (/\s/.test(ch)) { i++; continue; }
      var rest = src.slice(i);
      if (ch === '"') {
        var j = i + 1, s = '';
        for (;;) {
          if (j >= n) throw new SozdizimHatasi('Kapanmamış tırnak (")');
          if (src.charAt(j) === '"') { if (src.charAt(j + 1) === '"') { s += '"'; j += 2; continue; } break; }
          s += src.charAt(j++);
        }
        t.push({ t: 'str', v: s, s: i, e: j + 1 }); i = j + 1; continue;
      }
      if ((m = RE_ERR.exec(rest))) { t.push({ t: 'err', v: HATA_KOD[trUpper(m[0])] || E.REF, s: i, e: i + m[0].length }); i += m[0].length; continue; }
      if ((m = RE_CELL.exec(rest))) { t.push({ t: 'ref', a: m[1], b: m[2] || null, s: i, e: i + m[0].length }); i += m[0].length; continue; }
      if ((m = RE_COLS.exec(rest))) { t.push({ t: 'ref', a: m[1], b: m[2], col: true, s: i, e: i + m[0].length }); i += m[0].length; continue; }
      if ((m = RE_NUM.exec(rest))) { t.push({ t: 'num', v: parseFloat(m[0].replace(',', '.')), s: i, e: i + m[0].length }); i += m[0].length; continue; }
      if ((m = RE_FN.exec(rest))) { t.push({ t: 'fn', v: m[0], s: i, e: i + m[0].length }); i += m[0].length; continue; }
      if ((m = RE_NAME.exec(rest))) { t.push({ t: 'name', v: m[0], s: i, e: i + m[0].length }); i += m[0].length; continue; }
      var two = src.substr(i, 2);
      if (two === '<=' || two === '>=' || two === '<>') { t.push({ t: 'op', v: two, s: i, e: i + 2 }); i += 2; continue; }
      if ('+-*/^&=<>%(),;:'.indexOf(ch) >= 0) { t.push({ t: 'op', v: ch, s: i, e: i + 1 }); i++; continue; }
      throw new SozdizimHatasi('Tanınmayan karakter: ' + ch);
    }
    return t;
  }

  // --- Ayrıştırıcı (öncelik: karşılaştırma < & < +- < */ < ^ < tekli - < %)
  function parse(src) {
    var toks = tokenize(src), p = 0;
    function peek() { return toks[p]; }
    function isOp(v) { var k = toks[p]; return k && k.t === 'op' && k.v === v; }
    function expect(v) { if (!isOp(v)) throw new SozdizimHatasi('"' + v + '" bekleniyordu'); p++; }
    function bin(next, ops) {
      return function () {
        var a = next();
        while (toks[p] && toks[p].t === 'op' && ops.indexOf(toks[p].v) >= 0) { var op = toks[p++].v; a = { k: 'bin', op: op, a: a, b: next() }; }
        return a;
      };
    }
    function primary() {
      var k = peek();
      if (!k) throw new SozdizimHatasi('Formül eksik');
      p++;
      if (k.t === 'num') return { k: 'v', v: k.v };
      if (k.t === 'str') return { k: 'v', v: k.v };
      if (k.t === 'err') return { k: 'v', v: k.v };
      if (k.t === 'ref') {
        if (k.col) return { k: 'rng', r0: null, r1: null, c0: Math.min(colIndex(k.a.replace('$', '')), colIndex(k.b.replace('$', ''))), c1: Math.max(colIndex(k.a.replace('$', '')), colIndex(k.b.replace('$', ''))) };
        var a = parseAddr(k.a);
        if (!a) return { k: 'v', v: E.REF };
        if (!k.b) return { k: 'ref', r: a.r, c: a.c };
        var b = parseAddr(k.b);
        if (!b) return { k: 'v', v: E.REF };
        return { k: 'rng', r0: Math.min(a.r, b.r), r1: Math.max(a.r, b.r), c0: Math.min(a.c, b.c), c1: Math.max(a.c, b.c) };
      }
      if (k.t === 'name') {
        var u = trUpper(k.v);
        if (u === 'DOĞRU' || u === 'TRUE') return { k: 'v', v: true };
        if (u === 'YANLIŞ' || u === 'FALSE') return { k: 'v', v: false };
        return { k: 'v', v: E.NAME };
      }
      if (k.t === 'fn') {
        expect('(');
        var args = [];
        if (!isOp(')')) {
          for (;;) {
            if (isOp(';') || isOp(',') || isOp(')')) args.push({ k: 'bos' });
            else args.push(expr());
            if (isOp(';') || isOp(',')) { p++; continue; }
            break;
          }
        }
        expect(')');
        return { k: 'fn', ad: k.v, args: args };
      }
      if (k.t === 'op' && k.v === '(') { var e = expr(); expect(')'); return e; }
      throw new SozdizimHatasi('Beklenmeyen "' + (k.v === undefined ? k.a : k.v) + '"');
    }
    function postfix() { var a = primary(); while (isOp('%')) { p++; a = { k: 'pct', a: a }; } return a; }
    function unary() {
      if (isOp('-')) { p++; return { k: 'neg', a: unary() }; }
      if (isOp('+')) { p++; return unary(); }
      return postfix();
    }
    var pow = bin(unary, ['^']);
    var mul = bin(pow, ['*', '/']);
    var add = bin(mul, ['+', '-']);
    var cat = bin(add, ['&']);
    var cmp = bin(cat, ['=', '<>', '<', '>', '<=', '>=']);
    function expr() { return cmp(); }
    var ast = expr();
    if (p < toks.length) throw new SozdizimHatasi('Fazladan "' + (toks[p].v === undefined ? toks[p].a : toks[p].v) + '"');
    return ast;
  }

  // Formülün sözdizimini dener; hata varsa açıklamasını döndürür
  function formulDene(raw) {
    try { parse(String(raw).slice(1)); return null; } catch (e) { return e instanceof SozdizimHatasi ? e.message : String(e); }
  }

  // --- Tür dönüşümleri
  function sayi(v) {
    if (isErr(v)) return v;
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    var n = sayiOku(v);
    return n === null ? E.VALUE : n;
  }
  function mantik(v) {
    if (isErr(v)) return v;
    if (v === null || v === undefined) return false;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    var u = trUpper(v);
    if (u === 'DOĞRU' || u === 'TRUE') return true;
    if (u === 'YANLIŞ' || u === 'FALSE') return false;
    return E.VALUE;
  }
  function sonuc(n) { return typeof n === 'number' && !isFinite(n) ? E.NUM : n; }
  function tur(v) { return typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : -1; }
  function karsilastir(a, b) {
    if (a === null || a === undefined) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
    if (b === null || b === undefined) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
    var ta = tur(a), tb = tur(b);
    if (ta !== tb) return ta < tb ? -1 : 1;
    if (ta === 1) return a.localeCompare(b, 'tr', { sensitivity: 'accent' });
    return a === b ? 0 : (a < b ? -1 : 1);
  }

  // --- Ölçüt (ETOPLA, EĞERSAY...): 5 | ">100" | "<>0" | "elma*" | "" (boş)
  function olcut(c) {
    if (typeof c === 'number' || typeof c === 'boolean') return function (v) { return karsilastir(v === null ? '' : v, c) === 0 && v !== null; };
    var s = metin(c), m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(s), op = m[1] || '=', rhs = m[2];
    var n = sayiOku(rhs);
    if (n !== null) {
      return function (v) {
        var x = typeof v === 'number' ? v : (typeof v === 'string' ? sayiOku(v) : null);
        if (x === null) return op === '<>';
        return op === '=' ? x === n : op === '<>' ? x !== n : op === '<' ? x < n : op === '>' ? x > n : op === '<=' ? x <= n : x >= n;
      };
    }
    if (rhs === '') return function (v) { var bos = v === null || v === ''; return op === '<>' ? !bos : op === '=' ? bos : false; };
    var re = /[*?]/.test(rhs) ? new RegExp('^' + rhs.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[\\s\\S]*').replace(/\?/g, '.') + '$', 'i') : null;
    return function (v) {
      if (v === null) return op === '<>';
      var sv = metin(v), eq = re ? re.test(sv) : sv.localeCompare(rhs, 'tr', { sensitivity: 'accent' }) === 0;
      if (op === '=') return eq;
      if (op === '<>') return !eq;
      if (typeof v !== 'string') return false;
      var k = sv.localeCompare(rhs, 'tr', { sensitivity: 'accent' });
      return op === '<' ? k < 0 : op === '>' ? k > 0 : op === '<=' ? k <= 0 : k >= 0;
    };
  }

  // --- İşlevler: her biri (args, h) alır; h.deger(düğüm) tek değer, h.duz(düğüm) [{v, aralik}] listesi, h.aralik(düğüm) 2B dizi döndürür
  function ad(s) { return trUpper(s).replace(/Ç/g, 'C').replace(/Ğ/g, 'G').replace(/İ/g, 'I').replace(/Ö/g, 'O').replace(/Ş/g, 'S').replace(/Ü/g, 'U'); }
  function sayilar(args, h) {
    var out = [];
    for (var i = 0; i < args.length; i++) {
      var list = h.duz(args[i]);
      for (var j = 0; j < list.length; j++) {
        var x = list[j];
        if (isErr(x.v)) return x.v;
        if (x.aralik) { if (typeof x.v === 'number') out.push(x.v); }
        else if (x.v !== null) { var n = sayi(x.v); if (isErr(n)) return n; out.push(n); }
      }
    }
    return out;
  }
  function tekSayi(h, node) { return sayi(h.deger(node)); }
  function yuvarla(x, d, yon) {
    var f = Math.pow(10, d), y = x * f;
    y = Number(y.toPrecision(15));
    var r = yon === 0 ? Math.round(Math.abs(y)) * (y < 0 ? -1 : 1) : yon > 0 ? Math.ceil(Math.abs(y)) * (y < 0 ? -1 : 1) : Math.floor(Math.abs(y)) * (y < 0 ? -1 : 1);
    return r / f;
  }
  function sartliTopla(h, aralikNode, olcutNode, toplamNode, mod) {
    var r = h.aralik(aralikNode), c = h.deger(olcutNode);
    if (isErr(r)) return r; if (isErr(c)) return c;
    var s = toplamNode ? h.aralik(toplamNode, r.length, r[0] ? r[0].length : 0) : r;
    if (isErr(s)) return s;
    var test = olcut(c), top = 0, say = 0;
    for (var i = 0; i < r.length; i++) for (var j = 0; j < r[i].length; j++) {
      if (!test(r[i][j])) continue;
      var v = s[i] ? s[i][j] : null;
      if (mod === 'say') { say++; continue; }
      if (isErr(v)) return v;
      if (typeof v === 'number') { top += v; say++; }
    }
    if (mod === 'say') return say;
    if (mod === 'ort') return say ? top / say : E.DIV0;
    return top;
  }
  function cokSartli(h, args, toplamNode, mod) {
    if (args.length % 2) return E.VALUE;
    var s = toplamNode ? h.aralik(toplamNode) : null;
    if (isErr(s)) return s;
    var ciftler = [];
    for (var k = 0; k < args.length; k += 2) {
      var r = h.aralik(args[k], s ? s.length : undefined, s && s[0] ? s[0].length : undefined), c = h.deger(args[k + 1]);
      if (isErr(r)) return r; if (isErr(c)) return c;
      ciftler.push({ r: r, test: olcut(c) });
    }
    var ref = s || ciftler[0].r, top = 0, say = 0;
    for (var i = 0; i < ref.length; i++) for (var j = 0; j < ref[i].length; j++) {
      var ok = ciftler.every(function (p) { return p.r[i] && p.test(p.r[i][j] === undefined ? null : p.r[i][j]); });
      if (!ok) continue;
      if (mod === 'say') { say++; continue; }
      var v = s[i][j];
      if (isErr(v)) return v;
      if (typeof v === 'number') top += v;
    }
    return mod === 'say' ? say : top;
  }

  var ISLEVLER = [
    { adlar: ['TOPLA', 'SUM'], ornek: '=TOPLA(A1:A10)', aciklama: 'Sayıları toplar', f: function (a, h) { var l = sayilar(a, h); return isErr(l) ? l : l.reduce(function (s, x) { return s + x; }, 0); } },
    { adlar: ['ORTALAMA', 'AVERAGE'], ornek: '=ORTALAMA(B2:B13)', aciklama: 'Aritmetik ortalama', f: function (a, h) { var l = sayilar(a, h); return isErr(l) ? l : l.length ? l.reduce(function (s, x) { return s + x; }, 0) / l.length : E.DIV0; } },
    { adlar: ['MİN', 'MIN'], ornek: '=MİN(A1:A10)', aciklama: 'En küçük değer', f: function (a, h) { var l = sayilar(a, h); return isErr(l) ? l : l.length ? Math.min.apply(null, l) : 0; } },
    { adlar: ['MAK', 'MAX'], ornek: '=MAK(A1:A10)', aciklama: 'En büyük değer', f: function (a, h) { var l = sayilar(a, h); return isErr(l) ? l : l.length ? Math.max.apply(null, l) : 0; } },
    { adlar: ['ÇARPIM', 'PRODUCT'], ornek: '=ÇARPIM(A1:A3)', aciklama: 'Sayıları çarpar', f: function (a, h) { var l = sayilar(a, h); return isErr(l) ? l : l.length ? sonuc(l.reduce(function (s, x) { return s * x; }, 1)) : 0; } },
    { adlar: ['BAĞ_DEĞ_SAY', 'COUNT'], ornek: '=BAĞ_DEĞ_SAY(A1:A10)', aciklama: 'Sayı içeren hücreleri sayar', f: function (a, h) {
      var n = 0; a.forEach(function (x) { h.duz(x).forEach(function (y) { if (typeof y.v === 'number' || (!y.aralik && typeof y.v === 'string' && sayiOku(y.v) !== null)) n++; }); }); return n; } },
    { adlar: ['BAĞ_DEĞ_DOLU_SAY', 'COUNTA'], ornek: '=BAĞ_DEĞ_DOLU_SAY(A1:A10)', aciklama: 'Boş olmayan hücreleri sayar', f: function (a, h) {
      var n = 0; a.forEach(function (x) { h.duz(x).forEach(function (y) { if (y.v !== null && y.v !== '') n++; }); }); return n; } },
    { adlar: ['BOŞLUKSAY', 'COUNTBLANK'], ornek: '=BOŞLUKSAY(A1:A10)', aciklama: 'Boş hücreleri sayar', f: function (a, h) {
      var r = h.aralik(a[0]); if (isErr(r)) return r; var n = 0; r.forEach(function (s) { s.forEach(function (v) { if (v === null || v === '') n++; }); }); return n; } },
    { adlar: ['YUVARLA', 'ROUND'], ornek: '=YUVARLA(A1;2)', aciklama: 'Belirtilen basamağa yuvarlar', f: function (a, h) { var x = tekSayi(h, a[0]), d = a[1] ? tekSayi(h, a[1]) : 0; return isErr(x) ? x : isErr(d) ? d : yuvarla(x, Math.trunc(d), 0); } },
    { adlar: ['YUKARIYUVARLA', 'ROUNDUP'], ornek: '=YUKARIYUVARLA(A1;0)', aciklama: 'Sıfırdan uzağa yuvarlar', f: function (a, h) { var x = tekSayi(h, a[0]), d = a[1] ? tekSayi(h, a[1]) : 0; return isErr(x) ? x : isErr(d) ? d : yuvarla(x, Math.trunc(d), 1); } },
    { adlar: ['AŞAĞIYUVARLA', 'ROUNDDOWN'], ornek: '=AŞAĞIYUVARLA(A1;0)', aciklama: 'Sıfıra doğru yuvarlar', f: function (a, h) { var x = tekSayi(h, a[0]), d = a[1] ? tekSayi(h, a[1]) : 0; return isErr(x) ? x : isErr(d) ? d : yuvarla(x, Math.trunc(d), -1); } },
    { adlar: ['TAMSAYI', 'INT'], ornek: '=TAMSAYI(A1)', aciklama: 'Aşağıdaki tam sayıya yuvarlar', f: function (a, h) { var x = tekSayi(h, a[0]); return isErr(x) ? x : Math.floor(x); } },
    { adlar: ['MUTLAK', 'ABS'], ornek: '=MUTLAK(A1)', aciklama: 'Mutlak değer', f: function (a, h) { var x = tekSayi(h, a[0]); return isErr(x) ? x : Math.abs(x); } },
    { adlar: ['KAREKÖK', 'SQRT'], ornek: '=KAREKÖK(A1)', aciklama: 'Karekök', f: function (a, h) { var x = tekSayi(h, a[0]); return isErr(x) ? x : x < 0 ? E.NUM : Math.sqrt(x); } },
    { adlar: ['KUVVET', 'POWER'], ornek: '=KUVVET(A1;2)', aciklama: 'Üs alır (A1^2 ile aynı)', f: function (a, h) { var x = tekSayi(h, a[0]), y = tekSayi(h, a[1]); return isErr(x) ? x : isErr(y) ? y : sonuc(Math.pow(x, y)); } },
    { adlar: ['MOD'], ornek: '=MOD(A1;12)', aciklama: 'Bölümden kalan', f: function (a, h) { var x = tekSayi(h, a[0]), y = tekSayi(h, a[1]); return isErr(x) ? x : isErr(y) ? y : y === 0 ? E.DIV0 : x - y * Math.floor(x / y); } },
    { adlar: ['EĞER', 'IF'], ornek: '=EĞER(A1>100;"Fazla";"Normal")', aciklama: 'Koşula göre değer seçer', f: function (a, h) {
      var c = mantik(h.deger(a[0])); if (isErr(c)) return c;
      if (c) return a.length > 1 ? h.deger(a[1]) : true;
      return a.length > 2 ? h.deger(a[2]) : false; } },
    { adlar: ['EĞERHATA', 'IFERROR'], ornek: '=EĞERHATA(A1/B1;0)', aciklama: 'Hata varsa ikinci değeri verir', f: function (a, h) { var v = h.deger(a[0]); return isErr(v) ? h.deger(a[1]) : v; } },
    { adlar: ['VE', 'AND'], ornek: '=VE(A1>0;B1>0)', aciklama: 'Tüm koşullar doğruysa DOĞRU', f: function (a, h) {
      var r = true; for (var i = 0; i < a.length; i++) { var l = h.duz(a[i]); for (var j = 0; j < l.length; j++) { if (l[j].v === null) continue; var b = mantik(l[j].v); if (isErr(b)) return b; r = r && b; } } return r; } },
    { adlar: ['YADA', 'OR'], ornek: '=YADA(A1>0;B1>0)', aciklama: 'Koşullardan biri doğruysa DOĞRU', f: function (a, h) {
      var r = false; for (var i = 0; i < a.length; i++) { var l = h.duz(a[i]); for (var j = 0; j < l.length; j++) { if (l[j].v === null) continue; var b = mantik(l[j].v); if (isErr(b)) return b; r = r || b; } } return r; } },
    { adlar: ['DEĞİL', 'NOT'], ornek: '=DEĞİL(A1>0)', aciklama: 'Mantıksal tersini alır', f: function (a, h) { var b = mantik(h.deger(a[0])); return isErr(b) ? b : !b; } },
    { adlar: ['ETOPLA', 'SUMIF'], ornek: '=ETOPLA(A2:A13;">0";B2:B13)', aciklama: 'Ölçüte uyan hücreleri toplar', f: function (a, h) { return sartliTopla(h, a[0], a[1], a[2], 'top'); } },
    { adlar: ['EĞERORTALAMA', 'AVERAGEIF'], ornek: '=EĞERORTALAMA(A2:A13;">0")', aciklama: 'Ölçüte uyanların ortalaması', f: function (a, h) { return sartliTopla(h, a[0], a[1], a[2], 'ort'); } },
    { adlar: ['EĞERSAY', 'COUNTIF'], ornek: '=EĞERSAY(A2:A13;"Ocak*")', aciklama: 'Ölçüte uyan hücreleri sayar', f: function (a, h) { return sartliTopla(h, a[0], a[1], null, 'say'); } },
    { adlar: ['ÇOKETOPLA', 'SUMIFS'], ornek: '=ÇOKETOPLA(C2:C13;A2:A13;"2026*";B2:B13;">0")', aciklama: 'Birden çok ölçüte göre toplar', f: function (a, h) { return cokSartli(h, a.slice(1), a[0], 'top'); } },
    { adlar: ['ÇOKEĞERSAY', 'COUNTIFS'], ornek: '=ÇOKEĞERSAY(A2:A13;">0";B2:B13;"<5")', aciklama: 'Birden çok ölçüte göre sayar', f: function (a, h) { return cokSartli(h, a, null, 'say'); } },
    { adlar: ['DÜŞEYARA', 'VLOOKUP'], ornek: '=DÜŞEYARA("Ocak";A2:C13;3;YANLIŞ)', aciklama: 'Tablonun ilk sütununda arar, aynı satırdaki değeri verir', f: function (a, h) {
      var v = h.deger(a[0]), t = h.aralik(a[1]), k = tekSayi(h, a[2]), yaklasik = a.length > 3 ? mantik(h.deger(a[3])) : true;
      if (isErr(v)) return v; if (isErr(t)) return t; if (isErr(k)) return k; if (isErr(yaklasik)) return yaklasik;
      k = Math.trunc(k);
      if (!t.length || k < 1) return E.VALUE;
      if (k > t[0].length) return E.REF;
      var bul = -1;
      for (var i = 0; i < t.length; i++) {
        var x = t[i][0];
        if (yaklasik) { if (x !== null && tur(x) === tur(v) && karsilastir(x, v) <= 0) bul = i; else if (x !== null && tur(x) === tur(v)) break; }
        else if (x !== null && karsilastir(x, v) === 0) { bul = i; break; }
      }
      return bul < 0 ? E.NA : t[bul][k - 1]; } },
    { adlar: ['BİRLEŞTİR', 'CONCAT', 'CONCATENATE'], ornek: '=BİRLEŞTİR(A1;" ";B1)', aciklama: 'Metinleri birleştirir (& ile aynı)', f: function (a, h) {
      var s = ''; for (var i = 0; i < a.length; i++) { var l = h.duz(a[i]); for (var j = 0; j < l.length; j++) { if (isErr(l[j].v)) return l[j].v; s += metin(l[j].v); } } return s; } },
    { adlar: ['UZUNLUK', 'LEN'], ornek: '=UZUNLUK(A1)', aciklama: 'Metnin karakter sayısı', f: function (a, h) { var v = h.deger(a[0]); return isErr(v) ? v : metin(v).length; } },
    { adlar: ['SOLDAN', 'LEFT'], ornek: '=SOLDAN(A1;3)', aciklama: 'Metnin başındaki karakterler', f: function (a, h) { var v = h.deger(a[0]), n = a[1] ? tekSayi(h, a[1]) : 1; return isErr(v) ? v : isErr(n) ? n : metin(v).slice(0, Math.max(0, n)); } },
    { adlar: ['SAĞDAN', 'RIGHT'], ornek: '=SAĞDAN(A1;3)', aciklama: 'Metnin sonundaki karakterler', f: function (a, h) { var v = h.deger(a[0]), n = a[1] ? tekSayi(h, a[1]) : 1; if (isErr(v)) return v; if (isErr(n)) return n; var s = metin(v); return n <= 0 ? '' : s.slice(-n); } },
    { adlar: ['KIRP', 'TRIM'], ornek: '=KIRP(A1)', aciklama: 'Fazla boşlukları siler', f: function (a, h) { var v = h.deger(a[0]); return isErr(v) ? v : metin(v).replace(/\s+/g, ' ').trim(); } },
    { adlar: ['BÜYÜKHARF', 'UPPER'], ornek: '=BÜYÜKHARF(A1)', aciklama: 'Büyük harfe çevirir', f: function (a, h) { var v = h.deger(a[0]); return isErr(v) ? v : trUpper(metin(v)); } },
    { adlar: ['KÜÇÜKHARF', 'LOWER'], ornek: '=KÜÇÜKHARF(A1)', aciklama: 'Küçük harfe çevirir', f: function (a, h) { var v = h.deger(a[0]); return isErr(v) ? v : metin(v).toLocaleLowerCase('tr-TR'); } },
    { adlar: ['EBOŞSA', 'ISBLANK'], ornek: '=EBOŞSA(A1)', aciklama: 'Hücre boşsa DOĞRU', f: function (a, h) { var v = h.deger(a[0]); return v === null; } },
    { adlar: ['ESAYIYSA', 'ISNUMBER'], ornek: '=ESAYIYSA(A1)', aciklama: 'Değer sayıysa DOĞRU', f: function (a, h) { return typeof h.deger(a[0]) === 'number'; } },
    { adlar: ['EHATALIYSA', 'ISERROR'], ornek: '=EHATALIYSA(A1/B1)', aciklama: 'Değer hataysa DOĞRU', f: function (a, h) { return isErr(h.deger(a[0])); } },
    { adlar: ['Pİ', 'PI'], ornek: '=Pİ()', aciklama: 'π sayısı', f: function () { return Math.PI; } }
  ];
  var ISLEV = {};
  ISLEVLER.forEach(function (x) { x.adlar.forEach(function (n) { ISLEV[ad(n)] = x.f; }); });

  // --- Hesaplayıcı: hücreler { "A1": "ham giriş" } üzerinde tembel, önbellekli hesap
  function Hesap(hucreler) {
    this.h = hucreler || {};
    this.onbellek = {};
    this.hesaplaniyor = {};
    var maxR = -1, maxC = -1;
    Object.keys(this.h).forEach(function (k) { var a = parseAddr(k); if (a) { if (a.r > maxR) maxR = a.r; if (a.c > maxC) maxC = a.c; } });
    this.maxR = maxR; this.maxC = maxC;
  }
  var AST = {};
  function astAl(raw) {
    if (AST[raw] === undefined) {
      var keys = Object.keys(AST);
      if (keys.length > 5000) AST = {};
      try { AST[raw] = parse(raw.slice(1)); } catch (e) { AST[raw] = { k: 'v', v: E.NAME, sozdizimi: true }; }
    }
    return AST[raw];
  }
  Hesap.prototype.deger = function (r, c) {
    var key = addr(r, c);
    if (key in this.onbellek) return this.onbellek[key];
    var raw = this.h[key];
    if (raw === undefined || raw === null || raw === '') return null;
    if (!isFormula(raw)) return (this.onbellek[key] = sabitDeger(raw));
    if (this.hesaplaniyor[key]) return E.CIRC;
    this.hesaplaniyor[key] = true;
    var v;
    try { v = this.calistir(astAl(raw)); } finally { delete this.hesaplaniyor[key]; }
    if (v && v.aralik) v = this.tekil(v);
    if (v === null) v = 0; // boş hücreye başvuran formül 0 gösterir
    if (typeof v === 'number' && !isFinite(v)) v = E.NUM;
    this.onbellek[key] = v;
    return v;
  };
  Hesap.prototype.tekil = function (rg) {
    if (rg.r0 === rg.r1 && rg.c0 === rg.c1 && rg.r0 !== null) return this.deger(rg.r0, rg.c0);
    return E.VALUE;
  };
  // Aralığı kullanılan alana kırpar (A:A gibi sütun aralıkları için)
  Hesap.prototype.sinir = function (rg, minR, minC) {
    var r0 = rg.r0 === null ? 0 : rg.r0, r1 = rg.r1 === null ? Math.max(this.maxR, (minR || 0) - 1) : rg.r1;
    var c1 = rg.c1;
    if (rg.r1 === null && minR) r1 = Math.max(r1, r0 + minR - 1);
    if (minC) c1 = Math.max(c1, rg.c0 + minC - 1);
    return { r0: r0, r1: r1, c0: rg.c0, c1: c1 };
  };
  Hesap.prototype.calistir = function (n) {
    var self = this;
    switch (n.k) {
      case 'v': return n.v;
      case 'bos': return null;
      case 'ref': return this.deger(n.r, n.c);
      case 'rng': return { aralik: true, r0: n.r0, r1: n.r1, c0: n.c0, c1: n.c1 };
      case 'neg': { var x = sayi(this.skaler(n.a)); return isErr(x) ? x : -x; }
      case 'pct': { var y = sayi(this.skaler(n.a)); return isErr(y) ? y : y / 100; }
      case 'bin': return this.ikili(n.op, this.skaler(n.a), this.skaler(n.b));
      case 'fn': {
        var f = ISLEV[ad(n.ad)];
        if (!f) return E.NAME;
        var h = {
          deger: function (d) { return self.skaler(d); },
          duz: function (d) { return self.duz(d); },
          aralik: function (d, minR, minC) { return self.matris(d, minR, minC); }
        };
        return f(n.args, h);
      }
    }
    return E.VALUE;
  };
  Hesap.prototype.skaler = function (d) {
    var v = this.calistir(d);
    return v && v.aralik ? this.tekil(v) : v;
  };
  Hesap.prototype.duz = function (d) {
    var v = this.calistir(d);
    if (!(v && v.aralik)) return [{ v: v, aralik: d.k === 'ref' }];
    var b = this.sinir(v), out = [];
    for (var r = b.r0; r <= b.r1; r++) for (var c = b.c0; c <= b.c1; c++) out.push({ v: this.deger(r, c), aralik: true });
    return out;
  };
  Hesap.prototype.matris = function (d, minR, minC) {
    var v = this.calistir(d);
    if (isErr(v)) return v;
    if (!(v && v.aralik)) {
      if (d.k === 'ref') v = { r0: d.r, r1: d.r, c0: d.c, c1: d.c };
      else return [[v]];
    }
    var b = this.sinir(v, minR, minC), out = [];
    for (var r = b.r0; r <= b.r1; r++) { var row = []; for (var c = b.c0; c <= b.c1; c++) row.push(this.deger(r, c)); out.push(row); }
    return out;
  };
  Hesap.prototype.ikili = function (op, a, b) {
    if (isErr(a)) return a;
    if (isErr(b)) return b;
    if (op === '&') return metin(a) + metin(b);
    if (['=', '<>', '<', '>', '<=', '>='].indexOf(op) >= 0) {
      var k = karsilastir(a, b);
      return op === '=' ? k === 0 : op === '<>' ? k !== 0 : op === '<' ? k < 0 : op === '>' ? k > 0 : op === '<=' ? k <= 0 : k >= 0;
    }
    var x = sayi(a), y = sayi(b);
    if (isErr(x)) return x;
    if (isErr(y)) return y;
    if (op === '+') return x + y;
    if (op === '-') return x - y;
    if (op === '*') return x * y;
    if (op === '/') return y === 0 ? E.DIV0 : x / y;
    if (op === '^') return x === 0 && y < 0 ? E.DIV0 : sonuc(Math.pow(x, y));
    return E.VALUE;
  };

  // --- Formül metnindeki başvuruları dönüştürme
  // fn(uc) -> yeni uç ya da null (#BAŞV!). uc: { r, c, rAbs, cAbs } (sütun aralığında r = null)
  function ucOku(s) {
    var m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d*)$/.exec(s);
    return { cAbs: !!m[1], c: colIndex(m[2]), rAbs: !!m[3], r: m[4] ? +m[4] - 1 : null };
  }
  function ucYaz(u) { return (u.cAbs ? '$' : '') + colName(u.c) + (u.r === null ? '' : (u.rAbs ? '$' : '') + (u.r + 1)); }
  function basvurulariDonustur(raw, fn) {
    if (!isFormula(raw)) return raw;
    var src = raw.slice(1), toks;
    try { toks = tokenize(src); } catch (e) { return raw; }
    var out = '', last = 0;
    toks.forEach(function (t) {
      if (t.t !== 'ref') return;
      var a = ucOku(t.a), b = t.b ? ucOku(t.b) : null;
      var res = fn(a, b);
      out += src.slice(last, t.s) + (res ? ucYaz(res[0]) + (res[1] ? ':' + ucYaz(res[1]) : '') : E.REF.kod);
      last = t.e;
    });
    return '=' + out + src.slice(last);
  }
  // Kopyala-yapıştır / doldurma: göreli başvuruları dr satır, dc sütun kaydırır
  function kaydir(raw, dr, dc) {
    return basvurulariDonustur(raw, function (a, b) {
      function k(u) {
        var r = u.r === null || u.rAbs ? u.r : u.r + dr, c = u.cAbs ? u.c : u.c + dc;
        if ((r !== null && r < 0) || c < 0) return null;
        return { r: r, c: c, rAbs: u.rAbs, cAbs: u.cAbs };
      }
      var x = k(a), y = b ? k(b) : null;
      if (!x || (b && !y)) return null;
      return [x, y];
    });
  }
  // Satır/sütun ekleme (n > 0, at konumuna) veya silme (n < 0, at'tan başlayarak -n adet)
  function yapisal(raw, eksen, at, n) {
    var key = eksen === 'satir' ? 'r' : 'c';
    return basvurulariDonustur(raw, function (a, b) {
      if (a[key] === null) return [a, b]; // sütun aralığında satır işlemi
      if (n > 0) {
        var f = function (u) { var x = Object.assign({}, u); if (x[key] >= at) x[key] += n; return x; };
        return [f(a), b ? f(b) : null];
      }
      var bit = at - n; // silinen [at, bit)
      if (!b) {
        if (a[key] >= at && a[key] < bit) return null;
        var x = Object.assign({}, a); if (x[key] >= bit) x[key] += n; return [x, null];
      }
      var lo = Object.assign({}, a), hi = Object.assign({}, b);
      if (lo[key] > hi[key]) { var tmp = lo; lo = hi; hi = tmp; }
      if (lo[key] >= at && hi[key] < bit) return null;
      if (lo[key] >= bit) lo[key] += n; else if (lo[key] >= at) lo[key] = at;
      if (hi[key] >= bit) hi[key] += n; else if (hi[key] >= at) hi[key] = at - 1;
      return [lo, hi];
    });
  }

  // Tablo verisinde satır/sütun ekleme-silme: hücreleri, formülleri, gizleme ve genişlikleri taşır
  function tasiIndeks(map, at, n) {
    var out = {};
    Object.keys(map || {}).forEach(function (k) {
      var i = +k;
      if (n < 0 && i >= at && i < at - n) return;
      out[i >= at ? (n > 0 ? i + n : i + n) : i] = map[k];
    });
    return out;
  }
  function yapiDegistir(veri, eksen, at, n) {
    var hucreler = {};
    Object.keys(veri.hucreler || {}).forEach(function (k) {
      var a = parseAddr(k);
      if (!a) return;
      var i = eksen === 'satir' ? a.r : a.c;
      if (n < 0 && i >= at && i < at - n) return;
      if (i >= at) i += n;
      var yeni = eksen === 'satir' ? addr(i, a.c) : addr(a.r, i);
      hucreler[yeni] = yapisal(veri.hucreler[k], eksen, at, n);
    });
    veri.hucreler = hucreler;
    var bicim = {};
    Object.keys(veri.bicim || {}).forEach(function (k) {
      var a = parseAddr(k);
      if (!a) return;
      var i = eksen === 'satir' ? a.r : a.c;
      if (n < 0 && i >= at && i < at - n) return;
      if (i >= at) i += n;
      bicim[eksen === 'satir' ? addr(i, a.c) : addr(a.r, i)] = veri.bicim[k];
    });
    veri.bicim = bicim;
    if (eksen === 'satir') veri.gizliSatir = tasiIndeks(veri.gizliSatir, at, n);
    else { veri.gizliSutun = tasiIndeks(veri.gizliSutun, at, n); veri.genislik = tasiIndeks(veri.genislik, at, n); }
    return veri;
  }

  // Formül bu motorda çalışır mı? (sözdizimi doğru, tüm işlevler ve adlar tanınıyor)
  function desteklenir(raw) {
    var ast;
    try { ast = parse(String(raw).slice(1)); } catch (e) { return false; }
    var ok = true;
    (function gez(n) {
      if (!n || !ok) return;
      if (n.k === 'v' && n.v === E.NAME) ok = false;
      else if (n.k === 'fn') { if (!ISLEV[ad(n.ad)]) ok = false; else n.args.forEach(gez); }
      else if (n.k === 'bin') { gez(n.a); gez(n.b); }
      else if (n.a) gez(n.a);
    })(ast);
    return ok;
  }
  // Excel dosyasındaki (İngilizce, virgül ayırıcılı) formülü bu motorun yazımına çevirir: dışarıdaki virgüller ";" olur
  function excelFormulu(f) {
    var out = '', tirnak = false;
    for (var i = 0; i < f.length; i++) {
      var ch = f.charAt(i);
      if (ch === '"') tirnak = !tirnak;
      out += !tirnak && ch === ',' ? ';' : ch;
    }
    return '=' + out.replace(/^=/, '');
  }
  var EXCEL_HATA = { '#DIV/0!': '#SAYI/0!', '#VALUE!': '#DEĞER!', '#NAME?': '#AD?', '#REF!': '#BAŞV!', '#N/A': '#YOK', '#NUM!': '#SAYI!', '#NULL!': '#BOŞ!' };

  var api = {
    colName: colName, colIndex: colIndex, addr: addr, parseAddr: parseAddr, parseRange: parseRange,
    E: E, Hata: Hata, isErr: isErr, sabitDeger: sabitDeger, sayiOku: sayiOku, isFormula: isFormula, goster: goster, bicimTahmin: bicimTahmin, bicimKodu: bicimKodu, bicimOku: bicimOku,
    parse: parse, formulDene: formulDene, Hesap: Hesap, kaydir: kaydir, yapisal: yapisal, yapiDegistir: yapiDegistir,
    ISLEVLER: ISLEVLER, desteklenir: desteklenir, excelFormulu: excelFormulu, EXCEL_HATA: EXCEL_HATA
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.App = root.App || {}; root.App.tablo = api; }
})(this);
