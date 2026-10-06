/* Kullanım: node tests/parser.test.js <fatura.pdf> [beklenen.json]
   Faturayı vendor/pdfjs ile okur, ayrıştırır ve sonucu yazdırır; beklenen.json verilirse alanları karşılaştırır. */
'use strict';
const fs = require('fs');
const path = require('path');
globalThis.pdfjsWorker = require(path.join(__dirname, '../vendor/pdfjs/pdf.worker.min.js'));
const pdfjs = require(path.join(__dirname, '../vendor/pdfjs/pdf.min.js'));
const parser = require('../js/fatura-parser.js');
const fields = require('../js/fields.js');

(async () => {
  const file = process.argv[2];
  if (!file) { console.error('PDF yolu verin.'); process.exit(2); }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), isEvalSupported: false }).promise;
  const pages = await parser.extractItems(doc);
  const res = parser.parse(pages[0].items, pages[0].width);
  const calc = fields.compute(res.record);
  console.log(JSON.stringify({ record: res.record, meta: res.meta, warnings: res.warnings, found: res.found }, null, 2));
  let fail = 0;
  fields.FIELDS.filter(f => f.check).forEach(f => {
    const st = fields.checkStatus(f, calc[f.key]);
    console.log((st === 'ok' ? 'TAMAM ' : st === 'err' ? 'HATA  ' : 'YOK   ') + f.label + ': ' + calc[f.key]);
    if (st === 'err') fail++;
  });
  if (process.argv[3]) {
    const exp = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
    for (const k of Object.keys(exp)) {
      if (JSON.stringify(exp[k]) !== JSON.stringify(res.record[k])) { console.log('FARK ' + k + ': beklenen ' + exp[k] + ', okunan ' + res.record[k]); fail++; }
    }
  }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
