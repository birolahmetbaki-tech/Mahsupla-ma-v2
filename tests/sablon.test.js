/* Şablon testi: her biçimin ilk faturasından otomatik şablon üretilir, tüm faturalara uygulanır ve
   sonuç yerleşik ayrıştırıcının okumasıyla karşılaştırılır.
   Kullanım: node tests/sablon.test.js <fatura.pdf> [<fatura2.pdf> ...] */
'use strict';
const fs = require('fs');
const path = require('path');
globalThis.pdfjsWorker = require(path.join(__dirname, '../vendor/pdfjs/pdf.worker.min.js'));
const pdfjs = require(path.join(__dirname, '../vendor/pdfjs/pdf.min.js'));
const parser = require('../js/fatura-parser.js');
const Sb = require('../js/sablon.js');

const ALANLAR = ['faturaNo', 'faturaTarihi', 'donem', 'gunSayisi', 'aktifKwh', 't1Kwh', 't2Kwh', 't3Kwh', 'enerjiBedeli', 'dagitimBedeli',
  'digerBedeller', 'mahsupKwh', 'mahsupTL', 'btv', 'kdv', 'faturaTutari', 'eic', 'tedarikci'];

(async () => {
  const faturalar = [];
  for (const file of process.argv.slice(2)) {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), isEvalSupported: false }).promise;
    const pages = await parser.extractItems(doc);
    parser.splitInvoices(pages).forEach(inv => faturalar.push(Object.assign(inv, { parsed: parser.parse(inv.items, inv.width) })));
  }
  const sablonlar = {};
  let fark = 0;
  const sira = process.env.TERS ? faturalar.slice().reverse() : faturalar;
  for (const f of sira) {
    const b = f.parsed.record.bicim;
    if (!sablonlar[b]) {
      sablonlar[b] = Sb.otomatikTanimla(f.items, f.width, f.parsed);
      const say = {}; sablonlar[b].tanimlar.forEach(t => { say[t.tur] = (say[t.tur] || 0) + 1; });
      console.log(`Şablon ${b} (${f.parsed.record.faturaNo} faturasından): ${JSON.stringify(say)} anahtar=${JSON.stringify(sablonlar[b].anahtarlar)}`);
    }
  }
  // Kullanıcı davranışı: tanımsız satırı olan faturada "Otomatik tanımla" → yeni tanımlar şablona eklenir
  for (const f of faturalar) {
    const s = Sb.bul(f.items, Object.values(sablonlar));
    const res = Sb.uygula(f.items, f.width, s, null);
    if (res.tanimsiz.length) {
      const n = Sb.birlestir(s, Sb.otomatikTanimla(f.items, f.width, f.parsed));
      console.log(`  ${f.parsed.record.faturaNo}: ${res.tanimsiz.length} tanımsız satır → otomatik tanımla ile ${n} tanım eklendi`);
    }
  }
  for (const f of faturalar) {
    const r0 = f.parsed.record;
    const s = Sb.bul(f.items, Object.values(sablonlar));
    if (!s) { console.log(`HATA ${r0.faturaNo}: şablon bulunamadı`); fark++; continue; }
    const res = Sb.uygula(f.items, f.width, s, null);
    const r = res.record;
    const farklar = ALANLAR.filter(k => {
      const a = r0[k], b = r[k];
      if (typeof a === 'number' || typeof b === 'number') return Math.abs((a || 0) - (b || 0)) > 0.011;
      return (a || '') !== (b || '');
    }).map(k => `${k}: ${r0[k]} → ${r[k]}`);
    fark += farklar.length;
    console.log(`${farklar.length ? 'FARK ' : 'TAMAM'} s.${String(f.pageFrom).padStart(2)} ${String(r0.faturaNo).padEnd(17)} kalem=${r.kalemler.length}/${r0.kalemler.length} eksik=${res.eksik.map(t => t.hedef).join(',') || '-'} tanımsız=${res.tanimsiz.map(l => l.etiket || l.metin).join(' | ') || '-'}` + (farklar.length ? '\n      ' + farklar.join('\n      ') : ''));
  }
  console.log(fark ? fark + ' fark' : 'Tüm faturalar şablonla aynı okundu');
  process.exit(fark ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
