# Mahsupla

Lisanssız elektrik üretiminde mahsuplaşma takip programı: aylık tüketim, üretim, mahsuplaşan enerji,
ihtiyaç fazlası, yıllık 2× limit ve bunların parasal karşılığı.

## Çalıştırma
`index.html` dosyasını tarayıcıda açın (sunucu gerekmez). Tek dosyalık sürüm: `dist/Mahsupla.html`
(`python3 tools/build-single.py` ile üretilir). Veriler tarayıcıda (localStorage) saklanır;
düzenli olarak **Ayarlar → Yedekleme** ile JSON yedeği alın.

## Sayfalar
- **Ana Sayfa** — Ayarlar → Açılış Sayfası'ndan düzenlenen karşılama sayfası.
- **Dashboard** — serbest yerleşimli pencereler: değer kartı, çizgi, sıralı çubuk, dönem kıyası, pasta,
  yıllık toplam, hedef göstergesi (limit kullanımı), tablo, öngörü, not.
- **Veri** — Excel benzeri çalışma kitabı; **sekmeler alttaki çubukta** (ekle, çift tıkla adlandır,
  sağ tık menüsü, sürükleyerek sırala, Ctrl+PageUp/PageDown). Her sekme aylık bir tablodur (YIL, AY + sütunlar).
  - *Tesis sekmesi* (⚡): bir mahsuplaşma birimi; hesaplara katılır. Sağ tık → **Tesis bilgileri**
    (kurulu güç, abone grubu, sözleşme gücü, periyot, işletmeye giriş, limit referansı).
  - *Genel sekme*: fiyat/tarife tabloları ve notlar. Tesis sekmeleri formülle başvurur: `=Fiyatlar!C`
    (aynı dönemin satırı), `=Fiyatlar!C5`, `='GES 1'!D`.
  - Formüller Türkçe Excel yazımıyla: `=MİN(C;D)`, `=TOPLA(C1:C12)`, `=EĞER(C>0;"Var";"Yok")`, `^ % & = <> < >`.
  - Excel içe aktarma (bir sayfayı açık/yeni sekmeye ya da her sayfayı ayrı sekmeye), çok sayfalı dışa aktarma.
- **Hesaplanmış Değerler** — her tesis ve tüm tesislerin toplamı için: mahsuplaşan enerji, ihtiyaç fazlası,
  net çekiş, öz tüketim ve karşılanma oranı, saatlik mahsuplaşma farkı, yıllık limit / kullanım / bedelsiz katkı,
  ihtiyaç fazlası geliri, kaçınılan maliyet, toplam fayda, net gider, kapasite faktörü, özgül üretim.
  Tesis ve Matris görünümü, yıl toplamları, hücre denetçisi, Excel'e aktarma.
- **Veri Tutarlılık Kontrolü** — formül hataları, metin/negatif değer, mükerrer/eksik dönem, mahsuplaşan > min(üretim, tüketim),
  ihtiyaç fazlası tutarsızlığı, limit aşımı/yaklaşma, fiyat aralığı, bedel tutarsızlığı, kapasite faktörü,
  sözleşme gücü, 10 yıllık sürenin dolması.
- **Analiz robotu** (kenar çubuğundaki simge) — kural tabanlı yardımcı: durum özeti, limit durumu,
  saatlik mahsuplaşma etkisi, yıl karşılaştırma, öngörü, tesis sıralama, veri kalitesi.

## Hesap kuralları
Hesap motoru (`js/mahsup-motoru.js`) sütunları **rolleri**nden tanır (Tüketim, Üretim, Mahsuplaşan enerji,
İhtiyaç fazlası, Aktif enerji birim fiyatı, İhtiyaç fazlası birim fiyatı, İhtiyaç fazlası bedeli, Tedarikçi faturası).
Aynı role bağlı birden çok sütun toplanır.
- Mahsuplaşan enerji girilmemişse aylık varsayım: `min(üretim, tüketim)`; ihtiyaç fazlası girilmemişse `üretim − mahsuplaşan`.
- Yıllık limit (mesken hariç): `katsayı (2) × önceki yılın tüketimi` (ya da elle girilen referans). Mahsuplaşan enerji ve
  satılan ihtiyaç fazlası limiti ay sırasıyla tüketir; aşan ihtiyaç fazlası YEKDEM'e bedelsiz katkıdır.
- Oran göstergelerinin aralık değeri pay ve paydanın ayrı ayrı toplanmasıyla bulunur.

Mevzuat notları: `docs/BILGI_BANKASI.md`.

## Geliştirme
- Kaynaklar `js/` altında klasik betiklerdir (tek küresel kapsam); `index.html` onları sırayla yükler.
- Formül motoru testleri: `node tests/formula.test.js`
- Mahsuplaşma motoru testleri: `node tests/mahsup.test.js`
