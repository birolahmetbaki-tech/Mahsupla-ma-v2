# Mahsupla

Lisanssız elektrik üretiminde tüketim/üretim tesislerinin fatura, mahsuplaşma ve satış değerlerini kaydetme, izleme ve analiz programı.

## Çalıştırma
`index.html` dosyasını tarayıcıda açın (sunucu gerekmez). Tek dosyalık sürüm: `dist/Mahsupla.html` (`python3 tools/build-single.py` ile üretilir). Veriler tarayıcıda (localStorage) saklanır;
düzenli olarak **Yedek Al** ile JSON yedeği alın.

## Modüller
- **Tesisler** — tüketim tesisleri; altında birden çok abonelik (EIC, abone grubu, faturalar) ve üretim tesisleri (mahsuplaştığı aboneliklerle).
- **Veriler** — alttaki sekmelerle iki sayfa:
  - **Faturalar**: tüketim tesisine ait boş bir hesap tablosu (Excel gibi A, B, C… sütunları ve 1, 2, 3… satırları).
    Hücrelere değer ya da `=` ile başlayan formül yazılır (Türkçe Excel sözdizimi: `=TOPLA(A1:A12)`, `=EĞER(B2>0;"Var";"Yok")`; İngilizce adlar da çalışır).
    Satır/sütun gizleme-gösterme, ekleme-silme, sütun genişliği, kopyala/kes/yapıştır (Excel'den de), doldurma tutamacı, geri al/yinele, Excel indirme.
  - **OSOS (Saatlik)**: sayaçların saatlik çekiş/veriş verileri (Excel/CSV içe aktarma, sütun eşleştirme) ve saatlik mahsuplaşma:
    mahsup = min(üretim, tüketim), ihtiyaç fazlası, net çekiş, öz tüketim oranı, aylık mahsuplaşmaya göre fark, 2× bedelli üretim limiti takibi.

## Veri modeli
- Hesap tablosu: `tablolar[tüketimTesisId] = { hucreler: { "A1": "ham giriş" }, gizliSatir, gizliSutun, genislik }`; formül motoru `js/tablo.js`.
- Önceki sürümlerden kalan fatura kayıtları (`faturalar`) silinmez; yedekte durur, OSOS sayfasındaki fatura karşılaştırmasında kullanılır.

## Geliştirme
- Formül motoru testleri: `node tests/tablo.test.js`
- OSOS çevirme ve saatlik mahsuplaşma testleri: `node tests/osos.test.js`
- Mevzuat notları: `docs/BILGI_BANKASI.md`
