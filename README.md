# Mahsupla

Lisanssız elektrik üretiminde tüketim/üretim tesislerinin fatura, mahsuplaşma ve satış değerlerini kaydetme, izleme ve analiz programı.

## Çalıştırma
`index.html` dosyasını tarayıcıda açın (sunucu gerekmez). Tek dosyalık sürüm: `dist/Mahsupla.html` (`python3 tools/build-single.py` ile üretilir). Veriler tarayıcıda (localStorage) saklanır;
düzenli olarak **Yedek Al** ile JSON yedeği alın.

## Modüller
- **Tesisler** — tüketim tesisleri ve bağlı üretim tesisleri.
- **Fatura Yükle** — PDF e-faturaları tarayıcıda okur (pdf.js), birleştirilmiş PDF’leri faturalara böler, aritmetik kontrolleri yapar, tesisle eşleştirip kaydeder. Desteklenen biçimler: CK Enerji Ortaklığı Toptan, CK Boğaziçi Perakende.
- **Veriler** — tesise ait faturaların Excel benzeri tablosu (düzenleme, kopyala/yapıştır, geri al, CSV).

## Geliştirme
- `js/fatura-parser.js` ayrıştırıcıyı test etmek için: `node tests/parser.test.js <fatura.pdf>`
- Mevzuat notları: `docs/BILGI_BANKASI.md`
