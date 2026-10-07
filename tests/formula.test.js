/* Formül motoru testleri: node tests/formula.test.js */
const F = require('../js/formula.js');

let hata = 0;
function esit(ad, gercek, beklenen) {
  const ok = typeof beklenen === 'number' && typeof gercek === 'number'
    ? Math.abs(gercek - beklenen) < 1e-9 : gercek === beklenen;
  if (!ok) { hata++; console.log(`HATA  ${ad}: ${JSON.stringify(gercek)} (beklenen ${JSON.stringify(beklenen)})`); }
}

// Basit hücre ortamı: anahtar "Sayfa!C5" ya da "C" (aynı satır)
const hucreler = { C: 10, D: 4, C1: 1, C2: 2, C3: 3, H: 1, I: 2, J: 3, 'Fiyatlar!C': 2.5, 'GES 1!D5': 7, K: 'Mesken' };
const d = (k, s, p) => hucreler[(p ? p + '!' : '') + k + (s ?? '')] ?? 0;
const hesap = (ifade) => {
  const c = F.derle(ifade);
  return c ? c.fn(d, F.FONKSIYONLAR) : 'GEÇERSİZ';
};

esit('MİN noktalı virgül', hesap('=MİN(C;D)'), 4);
esit('MAX virgül ayraç', hesap('MAX(D-C,0)'), 0);
esit('sütun aralığı', hesap('SUM(H:J)'), 6);
esit('TOPLA dikdörtgen', hesap('TOPLA(C1:C3)'), 6);
esit('ondalık virgül', hesap('C*0,5'), 5);
esit('sayfa başvurusu', hesap('C*Fiyatlar!C'), 25);
esit('tırnaklı sayfa', hesap("='GES 1'!D5+1"), 8);
esit('EĞER metin', hesap('EĞER(C>5;"Büyük";"Küçük")'), 'Büyük');
esit('metin karşılaştırma büyük/küçük harf', hesap('EĞER(K="mesken";1;0)'), 1);
esit('YUVARLA', hesap('YUVARLA(10/3;2)'), 3.33);
esit('üs', hesap('2^3'), 8);
esit('yüzde', hesap('50%*C'), 5);
esit('birleştirme', hesap('C&"x"'), '10x');
esit('EĞERHATA', hesap('EĞERHATA(C/0;-1)'), -1);
esit('VE', hesap('VE(C>1;D<5)'), true);
esit('küçük harf referans', hesap('=c+d'), 14);
esit('mutlak başvuru', hesap('$C$1+C2'), 3);
esit('aralık işlemde geçersiz', hesap('TOPLA(C1:C3*2)'), 'GEÇERSİZ');
esit('yarım ifade geçersiz', hesap('C+'), 'GEÇERSİZ');
esit('bilinmeyen fonksiyon', hesap('FOO(1)'), 'GEÇERSİZ');
esit('fonksiyon dışında aralık', hesap('H:J'), 'GEÇERSİZ');

const refs = F.referanslar("=TOPLA('GES 1'!C1:C2)+D");
esit('referans sayısı', refs.length, 3);
esit('referans sayfası', refs[0].sayfa, 'GES 1');
esit('aynı satır referansı', refs[2].satir, null);
esit('sayfa adı yazımı (sade)', F.sayfaAdiFormulde('Fiyatlar'), 'Fiyatlar');
esit('sayfa adı yazımı (boşluklu)', F.sayfaAdiFormulde('Tarife Tablosu'), "'Tarife Tablosu'");
esit('hücre adına benzeyen sayfa adı tırnaklanır', F.sayfaAdiFormulde('AB12'), "'AB12'");

console.log(hata ? `${hata} test başarısız` : 'Tüm formül testleri geçti');
process.exitCode = hata ? 1 : 0;
