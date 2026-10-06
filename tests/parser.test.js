/* Kullanım: node tests/parser.test.js <fatura.pdf> [--json]
   PDF'i vendor/pdfjs ile okur, faturalara böler, her birini ayrıştırır ve kontrol sonuçlarını yazdırır.
   Herhangi bir kontrol HATA verirse çıkış kodu 1 olur. */
'use strict';
const fs = require('fs');
const path = require('path');
globalThis.pdfjsWorker = require(path.join(__dirname, '../vendor/pdfjs/pdf.worker.min.js'));
const pdfjs = require(path.join(__dirname, '../vendor/pdfjs/pdf.min.js'));
const U = require('../js/util.js');
const parser = require('../js/fatura-parser.js');
const fields = require('../js/fields.js');

(async () => {
  const file = process.argv[2];
  const asJson = process.argv.includes('--json');
  if (!file) { console.error('PDF yolu verin.'); process.exit(2); }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), isEvalSupported: false }).promise;
  const pages = await parser.extractItems(doc);
  const invoices = parser.splitInvoices(pages);
  let fail = 0;
  const checkFields = fields.FIELDS.filter(f => f.check);
  for (const inv of invoices) {
    const res = parser.parse(inv.items, inv.width);
    const r = res.record;
    const calc = fields.compute(r);
    const st = checkFields.map(f => ({ f, s: fields.checkStatus(f, calc[f.key], r), v: calc[f.key] }));
    const errs = st.filter(x => x.s === 'err');
    fail += errs.length;
    if (asJson) { console.log(JSON.stringify({ sayfa: inv.pageFrom, record: r, meta: res.meta, warnings: res.warnings }, null, 2)); continue; }
    const f = (v, d) => U.formatTRNumber(v, d === undefined ? 2 : d);
    console.log(
      `s.${String(inv.pageFrom).padStart(2)}-${String(inv.pageTo).padEnd(2)} ${r.bicim.padEnd(10)} ${String(r.faturaNo).padEnd(17)} ${r.donem} ` +
      `çekiş=${f(r.aktifKwh, 0).padStart(10)} enerji=${f(r.enerjiBedeli).padStart(13)} dağıtım=${f(r.dagitimBedeli).padStart(12)} ` +
      `diğer=${f(r.digerBedeller).padStart(10)} mahsup=${f(r.mahsupKwh, 0).padStart(11)} kWh/${f(r.mahsupTL).padStart(14)} ` +
      `btv=${f(r.btv).padStart(10)} fatura=${f(r.faturaTutari).padStart(14)} ` +
      `alan=${res.found} kontrol=${st.filter(x => x.s === 'ok').length}/${st.filter(x => x.s).length}` +
      (errs.length ? '  HATA: ' + errs.map(x => x.f.label.replace('Kontrol: ', '') + '=' + U.formatTRNumber(x.v, 2)).join(', ') : ''));
    res.warnings.filter(w => /Tanınmayan/.test(w)).forEach(w => console.log('        ! ' + w));
  }
  console.log(`${invoices.length} fatura, ${fail} kontrol hatası`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
