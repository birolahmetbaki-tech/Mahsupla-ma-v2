/* OSOS dosya çevirme ve saatlik mahsuplaşma birim testleri: node tests/osos.test.js */
'use strict';
const O = require('../js/osos.js');
let fail = 0;
function eq(ad, a, b) { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) fail++; console.log((ok ? 'TAMAM ' : 'HATA  ') + ad + (ok ? '' : ' → ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b))); }

// 1) Başlıklı, ayrı saat sütunu 1–24 (saat sonu), TR sayılar
const t1 = [['Sayaç Seri No: 123'], ['Tarih', 'Saat', 'Çekiş (kWh)', 'Veriş (kWh)']];
for (let h = 1; h <= 24; h++) t1.push(['01.09.2026', h, (100 + h).toLocaleString('tr-TR', { minimumFractionDigits: 3 }), h > 8 && h < 18 ? '250,5' : '0']);
const g1 = O.tahmin(t1);
eq('başlık satırı', g1.baslik, 1);
eq('sütunlar', g1.cols, { tarih: 0, saat: 1, cekis: 2, veris: 3 });
const r1 = O.cevir(t1, Object.assign({ baslik: g1.baslik, birim: 'kWh', carpan: 1, saatTipi: 'otomatik' }, g1.cols));
eq('saat sonu algılandı', r1.bitis, true);
eq('24 saat', r1.saatler.length, 24);
eq('ilk saat 00:00 = 101 kWh', [r1.saatler[0].idx, r1.saatler[0].c], [0, 101]);
eq('son saat 23:00', [r1.ilk, r1.son], ['01.09.2026 00:00', '01.09.2026 23:00']);

// 2) Birleşik tarih-saat metni, saat başlangıcı 00–23, MWh
const t2 = [['Okuma Zamanı', 'Aktif Tüketim', 'Aktif Üretim']];
for (let h = 0; h < 48; h++) t2.push([`${String(1 + Math.floor(h / 24)).padStart(2, '0')}.10.2026 ${String(h % 24).padStart(2, '0')}:00`, 0.1, 0.05]);
const g2 = O.tahmin(t2);
eq('birleşik sütunlar', g2.cols, { tarih: 0, cekis: 1, veris: 2 });
const r2 = O.cevir(t2, Object.assign({ baslik: g2.baslik, birim: 'MWh', carpan: 1, saatTipi: 'otomatik' }, g2.cols));
eq('saat başlangıcı', r2.bitis, false);
eq('MWh → kWh', [r2.saatler.length, r2.saatler[30].c, r2.saatler[30].v], [48, 100, 50]);

// 3) 15 dakikalık veri, Date nesneleri
const t3 = [['Tarih', 'Çekiş', 'Veriş']];
for (let q = 0; q < 8; q++) t3.push([new Date(2026, 8, 1, Math.floor(q / 4), (q % 4) * 15), 10, 2]);
const r3 = O.cevir(t3, { baslik: 0, tarih: 0, cekis: 1, veris: 2, birim: 'kWh', carpan: 1, saatTipi: 'baslangic' });
eq('15 dk → saatlik toplam', [r3.ceyrek, r3.saatler.length, r3.saatler[0].c, r3.saatler[1].v], [true, 2, 40, 8]);

// 4) Saatlik mahsuplaşma: iki abonelik + bir üretim sayacı
O._set({ seriler: {} });
const ay = '2026-09';
const tuk = [], tuk2 = [], ur = [];
for (let i = 0; i < 24; i++) {
  tuk.push({ ay, idx: i, c: 100, v: 0 });
  tuk2.push({ ay, idx: i, c: 50, v: 0 });
  ur.push({ ay, idx: i, c: 0, v: i >= 8 && i < 16 ? 400 : 0 });
}
O.ekle('abonelik', 'ab1', tuk); O.ekle('abonelik', 'ab2', tuk2); O.ekle('uretim', 'ut1', ur);
const h = O.hesaplaAy(ay, ['ab1', 'ab2'], ['ut1']);
const s = h.ozet;
// 1 gün: T=24*150=3600, Ü=8*400=3200, saatlik mahsup=8*150=1200, fazla=8*250=2000, net=16*150=2400
eq('gün 1 toplamlar', [h.rows.slice(0, 24).reduce((a, r) => a + r.T, 0), h.rows.slice(0, 24).reduce((a, r) => a + r.U, 0)], [3600, 3200]);
eq('saatlik mahsup / fazla / net', [s.mahsup, s.fazla, s.net], [1200, 2000, 2400]);
eq('aylık mahsup olsaydı', s.aylikMahsup, 3200);
eq('saatlik kayıp', s.kayip, 2000);
eq('eksik saat (ay 720 saat, 24 dolu)', s.eksik, 720 - 24);

// 5) Üretim sayacı yok → aynı ölçüm noktası (veriş = fazla)
O._set({ seriler: {} });
O.ekle('abonelik', 'ab1', [{ ay, idx: 0, c: 0, v: 30 }, { ay, idx: 1, c: 20, v: 0 }]);
const h2 = O.hesaplaAy(ay, ['ab1'], []);
eq('aynı ölçüm noktası', [h2.ozet.uretimVar, h2.ozet.fazla, h2.ozet.net, h2.rows[0].mahsup], [false, 30, 20, null]);

console.log(fail ? fail + ' HATA' : 'Tüm OSOS testleri geçti');
process.exit(fail ? 1 : 0);
