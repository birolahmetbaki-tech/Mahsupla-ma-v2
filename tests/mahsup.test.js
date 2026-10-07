/* Mahsuplaşma motoru testleri: node tests/mahsup.test.js */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

// Motor tarayıcıda klasik betik olarak çalışır; testte aynı küresel kapsam kurulur
const ctx = { console, structuredClone, document: { addEventListener() {} } };
vm.createContext(ctx);
for (const f of ['sablon.js', 'mahsup-motoru.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
}
const { tesisDetaylariHesapla } = ctx.module?.exports ?? vm.runInContext('({ tesisDetaylariHesapla })', ctx);

let hata = 0;
function esit(ad, gercek, beklenen) {
  const ok = typeof beklenen === 'number' && typeof gercek === 'number'
    ? Math.abs(gercek - beklenen) < 1e-6 : gercek === beklenen;
  if (!ok) { hata++; console.log(`HATA  ${ad}: ${JSON.stringify(gercek)} (beklenen ${JSON.stringify(beklenen)})`); }
}

/** Dönemler ve rol değerleri: { "2025|1": { tuketim: 100, uretim: 80 } } */
function hesapla(veri, bilgi = {}) {
  const anahtarlar = Object.keys(veri).sort((a, b) => {
    const [y1, a1] = a.split('|').map(Number); const [y2, a2] = b.split('|').map(Number);
    return y1 - y2 || a1 - a2;
  });
  const donemler = anahtarlar.map((k, i) => {
    const [yil, ayNo] = k.split('|').map(Number);
    return { no: i + 1, yil, ayNo, anahtar: k, etiket: k };
  });
  const rolOku = (rol, p) => ({ deger: veri[p.anahtar]?.[rol] ?? null, kolonlar: [], satirVar: true });
  return tesisDetaylariHesapla({ bilgi, donemler, rolOku });
}

// 1) Aylık varsayım: mahsup girilmemiş → min(U, T), İF = U − M
{
  const [d] = hesapla({ '2025|6': { tuketim: 100, uretim: 160 } });
  esit('aylık M', d.M, 100);
  esit('aylık İF', d.IF, 60);
  esit('net çekiş', d.NC, 0);
  esit('fark girilmeden hesaplanmaz', d.fark, null);
  esit('varsayım notu', d.notlar.length >= 2, true);
}

// 2) Saatlik sonuç girilmiş: M girilen, İF = U − M, fark = min(U,T) − M
{
  const [d] = hesapla({ '2026|6': { tuketim: 100, uretim: 160, mahsup: 70 } });
  esit('saatlik M', d.M, 70);
  esit('saatlik İF', d.IF, 90);
  esit('saatlik net çekiş', d.NC, 30);
  esit('saatlik fark', d.fark, 30);
}

// 3) Yıllık 2× limit: önceki yıl tüketimi 100 → limit 200
{
  const veri = { '2025|1': { tuketim: 100, uretim: 0 } };
  veri['2026|1'] = { tuketim: 50, uretim: 150, mahsup: 50 };   // kullanım 50 + 100 = 150
  veri['2026|2'] = { tuketim: 50, uretim: 150, mahsup: 50 };   // kalan 50 − 50 = 0 → İF 100 bedelsiz
  const [, ocak, subat] = hesapla(veri);
  esit('limit', ocak.limit, 200);
  esit('ocak satılabilir', ocak.satilabilir, 100);
  esit('ocak kullanım', ocak.kullanim, 150);
  esit('şubat satılabilir', subat.satilabilir, 0);
  esit('şubat bedelsiz', subat.bedelsiz, 100);
  esit('şubat kullanım (yalnız mahsup)', subat.kullanim, 200);
}

// 4) Limit kısmen kalmışsa İF bölünür
{
  const veri = { '2025|1': { tuketim: 100, uretim: 0 }, '2026|1': { tuketim: 50, uretim: 220, mahsup: 50 } };
  const [, d] = hesapla(veri);
  esit('kısmi satılabilir', d.satilabilir, 150);
  esit('kısmi bedelsiz', d.bedelsiz, 20);
}

// 5) Mesken: limit yok, tüm İF satılabilir
{
  const veri = { '2025|1': { tuketim: 100, uretim: 0 }, '2026|1': { tuketim: 10, uretim: 1000 } };
  const [, d] = hesapla(veri, { aboneGrubu: 'mesken' });
  esit('mesken limit', d.limit, null);
  esit('mesken bedelsiz', d.bedelsiz, 0);
  esit('mesken satılabilir', d.satilabilir, 990);
}

// 6) Referans tüketim elle girilmiş ve katsayı
{
  const [d] = hesapla({ '2026|1': { tuketim: 10, uretim: 50 } }, { referansTuketim: 1000, limitKatsayi: 3 });
  esit('elle referans limit', d.limit, 3000);
}

// 7) Parasal değerler
{
  const [d] = hesapla({ '2026|3': { tuketim: 100, uretim: 160, mahsup: 70, aktifFiyat: 3, ifFiyat: 2.5 } }, { referansTuketim: 10000 });
  esit('İF geliri', d.gelir, 90 * 2.5);
  esit('kaçınılan maliyet', d.kacinilan, 70 * 3);
  esit('toplam fayda', d.fayda, 225 + 210);
  const [e] = hesapla({ '2026|3': { tuketim: 100, uretim: 160, ifBedel: 999, fatura: 1500 } });
  esit('faturadaki bedel önceliklidir', e.gelir, 999);
  esit('net gider', e.netGider, 501);
}

// 8) Kurulu güç → teorik üretim (Şubat 2024: 29 gün)
{
  const [d] = hesapla({ '2024|2': { tuketim: 1, uretim: 1 } }, { kuruluGuc: 100 });
  esit('teorik üretim', d.teorik, 100 * 29 * 24);
}

// 9) Dönemde satır yoksa ayrıntı null
{
  const donemler = [{ no: 1, yil: 2026, ayNo: 1, anahtar: '2026|1' }];
  const [d] = tesisDetaylariHesapla({ bilgi: {}, donemler, rolOku: () => null });
  esit('satırsız dönem', d, null);
}

console.log(hata ? `${hata} test başarısız` : 'Tüm mahsuplaşma testleri geçti');
process.exitCode = hata ? 1 : 0;
