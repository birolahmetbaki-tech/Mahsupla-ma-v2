/* Hesap tablosu çekirdeği testleri: node tests/tablo.test.js */
const T = require('../js/tablo.js');

let hata = 0;
function esit(ad, gercek, beklenen) {
  const g = T.isErr(gercek) ? gercek.kod : gercek;
  const ok = typeof beklenen === 'number' && typeof g === 'number' ? Math.abs(g - beklenen) < 1e-9 : g === beklenen;
  if (!ok) { hata++; console.log('HATA  ' + ad + ': ' + JSON.stringify(g) + ' (beklenen ' + JSON.stringify(beklenen) + ')'); }
}
function hesap(hucreler, a) { const p = T.parseAddr(a); return new T.Hesap(hucreler).deger(p.r, p.c); }

// Adresler
esit('colName 0', T.colName(0), 'A');
esit('colName 25', T.colName(25), 'Z');
esit('colName 26', T.colName(26), 'AA');
esit('colName 701', T.colName(701), 'ZZ');
esit('colIndex AB', T.colIndex('AB'), 27);
esit('parseAddr', JSON.stringify(T.parseAddr('$c$12')), JSON.stringify({ r: 11, c: 2 }));

// Sabit değerler
esit('TR sayı', T.sabitDeger('1.234,56'), 1234.56);
esit('virgül ondalık', T.sabitDeger('12,5'), 12.5);
esit('nokta ondalık', T.sabitDeger('0.376'), 0.376);
esit('binlik', T.sabitDeger('1.500'), 1500);
esit('yüzde', T.sabitDeger('18%'), 0.18);
esit('negatif', T.sabitDeger('-403.251,57'), -403251.57);
esit('metin', T.sabitDeger('Ocak 2026'), 'Ocak 2026');
esit('tarih metin kalır', T.sabitDeger('30.09.2026'), '30.09.2026');
esit('kesme işareti', T.sabitDeger("'123"), '123');
esit('mantıksal', T.sabitDeger('doğru'), true);

// Formüller
const h = { A1: '10', A2: '20', A3: '30,5', A4: 'metin', B1: '=A1*2', B2: '=TOPLA(A1:A4)', B3: '=ORTALAMA(A1:A3)', B4: '=A1/0',
  C1: '=EĞER(A1>5;"büyük";"küçük")', C2: '=if(a1<5,"x","y")', C3: '=A1&" kWh"', C4: '=-2^2', C5: '=2+3*4', C6: '=(2+3)*4', C7: '=10%',
  D1: '=D2+1', D2: '=D1+1', D3: '=YUVARLA(2,345;2)', D4: '=EĞERHATA(A1/0;0)', D5: '=BİLİNMEYEN(1)', D6: '=A1+A4', D7: '=TOPLA(A:A)',
  E1: '=ETOPLA(A1:A3;">15")', E2: '=EĞERSAY(A1:A4;"<>")', E3: '=MAK(A1:A3)-MİN(A1:A3)', E4: '=BAĞ_DEĞ_SAY(A1:A4)', E5: '=E6', E7: '=A1=10',
  F1: 'Ocak', F2: 'Şubat', G1: '100', G2: '200', F3: '=DÜŞEYARA("şubat";F1:G2;2;YANLIŞ)', F4: '=ÇOKETOPLA(G1:G2;F1:F2;"Ş*")', F5: '=YUVARLA(0,1+0,2;10)=0,3',
  H1: '=sum(A1;A2)', H2: '=TOPLA(1,5;2)', H3: '=VE(A1>0;A2>0)', H4: '=MOD(-3;2)', H5: '=SOLDAN("Mahsup";3)', H6: '=1/3*3', H7: '=TOPLA(A1:A2' };
esit('çarpım', hesap(h, 'B1'), 20);
esit('TOPLA metni atlar', hesap(h, 'B2'), 60.5);
esit('ORTALAMA', hesap(h, 'B3'), 60.5 / 3);
esit('sıfıra bölme', hesap(h, 'B4'), '#SAYI/0!');
esit('EĞER', hesap(h, 'C1'), 'büyük');
esit('İngilizce + virgül ayırıcı', hesap(h, 'C2'), 'y');
esit('& birleştirme', hesap(h, 'C3'), '10 kWh');
esit('tekli eksi önce', hesap(h, 'C4'), 4);
esit('öncelik', hesap(h, 'C5'), 14);
esit('parantez', hesap(h, 'C6'), 20);
esit('yüzde işleci', hesap(h, 'C7'), 0.1);
esit('döngü', hesap(h, 'D1'), '#DÖNGÜ!');
esit('YUVARLA', hesap(h, 'D3'), 2.35);
esit('EĞERHATA', hesap(h, 'D4'), 0);
esit('bilinmeyen işlev', hesap(h, 'D5'), '#AD?');
esit('metin + sayı', hesap(h, 'D6'), '#DEĞER!');
esit('sütun aralığı', hesap(h, 'D7'), 60.5);
esit('ETOPLA', hesap(h, 'E1'), 50.5);
esit('EĞERSAY boş olmayan', hesap(h, 'E2'), 4);
esit('MAK-MİN', hesap(h, 'E3'), 20.5);
esit('BAĞ_DEĞ_SAY', hesap(h, 'E4'), 3);
esit('boş başvuru 0', hesap(h, 'E5'), 0);
esit('eşitlik', hesap(h, 'E7'), true);
esit('DÜŞEYARA büyük/küçük harf', hesap(h, 'F3'), 200);
esit('ÇOKETOPLA joker', hesap(h, 'F4'), 200);
esit('kayan nokta', hesap(h, 'F5'), true);
esit('sum ;', hesap(h, 'H1'), 30);
esit('virgül ondalık formülde', hesap(h, 'H2'), 3.5);
esit('VE', hesap(h, 'H3'), true);
esit('MOD negatif', hesap(h, 'H4'), 1);
esit('SOLDAN', hesap(h, 'H5'), 'Mah');
esit('1/3*3', hesap(h, 'H6'), 1);
esit('sözdizimi hatası', hesap(h, 'H7'), '#AD?');
esit('formulDene', T.formulDene('=TOPLA(A1:A2'), '")" bekleniyordu');
esit('formulDene tamam', T.formulDene('=TOPLA(A1:A2)'), null);

// Görüntüleme
esit('göster sayı', T.goster(1234567.891), '1.234.567,891');
esit('göster kayan', T.goster(0.1 + 0.2), '0,3');
esit('göster mantık', T.goster(false), 'YANLIŞ');

// Başvuru kaydırma
esit('kaydır göreli', T.kaydir('=A1+$B$2+C$3+$D4', 1, 1), '=B2+$B$2+D$3+$D5');
esit('kaydır aralık', T.kaydir('=TOPLA(A1:A5)', 0, 2), '=TOPLA(C1:C5)');
esit('kaydır dışarı', T.kaydir('=A1*2', -1, 0), '=#BAŞV!*2');
esit('kaydır metin dokunulmaz', T.kaydir('="A1"&A1', 1, 0), '="A1"&A2');
esit('kaydır sütun aralığı', T.kaydir('=TOPLA(B:B)', 5, 1), '=TOPLA(C:C)');
esit('kaydır işlev adı', T.kaydir('=LOG10(A1)', 1, 0), '=LOG10(A2)');

// Satır/sütun ekle-sil
esit('satır ekle', T.yapisal('=TOPLA(A1:A5)+A6', 'satir', 2, 1), '=TOPLA(A1:A6)+A7');
esit('satır sil içerde', T.yapisal('=TOPLA(A1:A5)+A3', 'satir', 2, -1), '=TOPLA(A1:A4)+#BAŞV!');
esit('satır sil uç', T.yapisal('=TOPLA(A3:A5)', 'satir', 2, -2), '=TOPLA(A3:A3)');
esit('sütun ekle', T.yapisal('=$B$1+C1', 'sutun', 1, 2), '=$D$1+E1');
esit('sütun sil tümü', T.yapisal('=TOPLA(B1:C1)', 'sutun', 1, -2), '=TOPLA(#BAŞV!)');
const v = T.yapiDegistir({ hucreler: { A1: '1', A2: '2', A3: '=A1+A2' }, gizliSatir: { 1: true }, gizliSutun: {}, genislik: {} }, 'satir', 1, 1);
esit('yapı ekle hücre', v.hucreler.A4, '=A1+A3');
esit('yapı ekle gizli', JSON.stringify(v.gizliSatir), '{"2":true}');
const s = T.yapiDegistir({ hucreler: { A1: '1', B1: '2', C1: '=A1+B1' }, gizliSatir: {}, gizliSutun: { 2: true }, genislik: { 2: 140 } }, 'sutun', 1, -1);
esit('yapı sil hücre', s.hucreler.B1, '=A1+#BAŞV!');
esit('yapı sil genişlik', JSON.stringify(s.genislik), '{"1":140}');

console.log(hata ? hata + ' test başarısız' : 'Tüm tablo testleri geçti');
process.exit(hata ? 1 : 0);
