# Mahsupla

Lisanssız elektrik üretiminde tüketim/üretim tesislerinin fatura, mahsuplaşma ve satış değerlerini kaydetme, izleme ve analiz programı.

## Çalıştırma
`index.html` dosyasını tarayıcıda açın (sunucu gerekmez). Tek dosyalık sürüm: `dist/Mahsupla.html` (`python3 tools/build-single.py` ile üretilir). Veriler tarayıcıda (localStorage) saklanır;
düzenli olarak **Yedek Al** ile JSON yedeği alın.

## Modüller
- **Tesisler** — tüketim tesisleri; altında birden çok abonelik (EIC, abone grubu, faturalar) ve üretim tesisleri (mahsuplaştığı aboneliklerle).
- **Fatura Yükle** — PDF e-faturaları tarayıcıda okur (pdf.js), birleştirilmiş PDF’leri faturalara böler, aritmetik kontrolleri yapar, tesisle eşleştirip kaydeder. Desteklenen biçimler: CK Enerji Ortaklığı Toptan, CK Boğaziçi Perakende.
- **Veriler** — alttaki sekmelerle iki sayfa:
  - **Faturalar**: aboneliğe (veya tesisin tüm aboneliklerine) ait faturaların Excel benzeri tablosu (düzenleme, kopyala/yapıştır, geri al, gizleme, CSV).
  - **OSOS (Saatlik)**: sayaçların saatlik çekiş/veriş verileri (Excel/CSV içe aktarma, sütun eşleştirme) ve saatlik mahsuplaşma:
    mahsup = min(üretim, tüketim), ihtiyaç fazlası, net çekiş, öz tüketim oranı, aylık mahsuplaşmaya göre fark, 2× bedelli üretim limiti takibi.

## Fatura veri modeli
Her fatura üç parçada saklanır:
1. **Standart özet** (`js/fields.js`): dönem, tüketim, enerji / dağıtım / diğer bedeller, GES mahsubu, BTV, KDV, fatura tutarı. Tüm tedarikçiler aynı sütunlara düşer.
2. **Kalemler**: faturadaki her bedel satırı, faturada yazdığı adla. Kalem → kategori eşleştirmesi `js/kalemler.js` varsayılan kuralları ve kullanıcının **Kalem Eşleştirme** penceresindeki seçimleriyle yapılır; bedel alanları kategori toplamlarıdır.
3. **Detay**: endeksler, demand, reaktif, yıllık tüketim gibi diğer bilgiler (fatura detay penceresinde görünür).

## Geliştirme
- `js/fatura-parser.js` ayrıştırıcıyı test etmek için: `node tests/parser.test.js <fatura.pdf>`
- OSOS çevirme ve saatlik mahsuplaşma testleri: `node tests/osos.test.js`
- Mevzuat notları: `docs/BILGI_BANKASI.md`
