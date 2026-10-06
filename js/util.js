/* Ortak yardımcılar: Türkçe sayı/tarih biçimleri, id, dosya indirme. */
(function (root) {
  'use strict';

  // "1.952.369,34" -> 1952369.34 | "0.000" -> 0 | "2.070//" -> 2070 | "-403251,57" -> -403251.57
  function parseTRNumber(input) {
    if (input === null || input === undefined) return null;
    if (typeof input === 'number') return isFinite(input) ? input : null;
    var s = String(input).replace(/TL|kWh|kVArh|%/gi, '').replace(/\s/g, '');
    var m = s.match(/-?[\d.,]+/);
    if (!m) return null;
    s = m[0];
    if (s.indexOf(',') >= 0) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, ''); // yalnız binlik ayırıcı
    }
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  function formatTRNumber(n, decimals) {
    if (n === null || n === undefined || n === '' || isNaN(n)) return '';
    var d = decimals === undefined ? 2 : decimals;
    return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  // "30-09-2026" | "30.09.2026" | "2026-09-30" -> "2026-09-30"
  function parseTRDate(input) {
    if (!input) return '';
    var s = String(input).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return s;
    m = s.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
    if (!m) return '';
    return m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]);
  }

  function formatTRDate(iso) {
    if (!iso) return '';
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[3] + '.' + m[2] + '.' + m[1] : String(iso);
  }

  function pad2(v) { return ('0' + v).slice(-2); }

  function daysBetween(isoA, isoB) {
    if (!isoA || !isoB) return null;
    var a = Date.parse(isoA + 'T00:00:00Z'), b = Date.parse(isoB + 'T00:00:00Z');
    if (isNaN(a) || isNaN(b)) return null;
    return Math.round((b - a) / 86400000) + 1; // okuma günleri dahil
  }

  var AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  function donemLabel(donem) {
    var m = String(donem || '').match(/^(\d{4})-(\d{2})$/);
    return m ? AYLAR[parseInt(m[2], 10) - 1] + ' ' + m[1] : (donem || '');
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function normalizeLabel(s) {
    return String(s || '').toLocaleLowerCase('tr-TR')
      .replace(/[:]/g, '').replace(/\s+/g, ' ').trim();
  }

  var api = {
    parseTRNumber: parseTRNumber, formatTRNumber: formatTRNumber,
    parseTRDate: parseTRDate, formatTRDate: formatTRDate, daysBetween: daysBetween,
    donemLabel: donemLabel, AYLAR: AYLAR, uid: uid, escapeHtml: escapeHtml,
    download: download, normalizeLabel: normalizeLabel
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.App = root.App || {}; root.App.util = api; }
})(this);
