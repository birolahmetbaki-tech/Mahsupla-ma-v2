# Lisanssız Elektrik Üretimi — Mahsuplaşma ve Satış Bilgi Bankası

> Derleme tarihi: 6 Ekim 2026. Kaynak: web taraması (haber, hukuk bürosu, sektör derneği yayınları).
> Resmî Gazete / EPDK / EPİAŞ sayfaları geliştirme ortamından doğrudan açılamadı; maddeler ikincil
> kaynaklardan çapraz kontrol edildi. **⚠ işaretli değerler programda parametre olarak tutulmalı ve
> resmî kaynaktan teyit edilmelidir.**

---

## 1. Mevzuat zinciri (kronolojik)

| Tarih | Düzenleme | Program açısından önemi |
|---|---|---|
| 12.05.2019 (RG 30772) | Elektrik Piyasasında Lisanssız Elektrik Üretim Yönetmeliği (LÜY) | Tüketimle ilişkili üretim, aylık mahsuplaşma, ihtiyaç fazlası 10 yıl tarife üzerinden satış |
| 25.11.2025 (RG 33088) | LÜY değişikliği | Tüketim tesisi ilişkilendirme kuralları; sözleşme gücü ≥ üretim gücü; aykırılıkta üretim YEKDEM'e bedelsiz katkı; aynı ölçüm noktası kapasite tahsisinde 1. öncelik |
| 02.04.2026 (RG 33212) | LÜY değişikliği | **Saatlik mahsuplaşma** (1 Mayıs 2026'dan itibaren), 2× yıllık tüketim limiti, mesken istisnası, endüstri bölgeleri, depolama, tüketim grupları |
| 01.05.2026 | Saatlik mahsuplaşma yürürlüğe girdi | EPİAŞ **Lisanssız Üretim Modülü (LÜM)** üzerinden saatlik hesap |
| — | EPDK 1 No'lu Açıklama | Mesken: kurulu güç fark etmeksizin aylık mahsuplaşma, limit yok |
| 21.05.2026 | EPDK Kurul Kararı 14613 | 10 yılını dolduranlara **Lisanssız Üretici-2** veriş yönlü dağıtım tarifesi |
| 13.06.2026 (RG 33279) | Cumhurbaşkanı Kararı 11415 | 10 yıl sonrası ihtiyaç fazlası fiyatı: **min(YEKDEM × %90, saatlik PTF)** |
| 18.06.2026 (RG 20.06.2026) | EPDK Kurul Kararı 14671 | 10 yılını dolduranlar için 2026'da ihtiyaç fazlası satışına sınır yok |

---

## 2. Temel kavramlar

- **Lisanssız üretim**: 6446 s. Kanun md.14 kapsamında, bir tüketim tesisiyle ilişkilendirilerek (öz tüketim amaçlı) lisans almadan yapılan üretim. Ağırlıklı GES; ayrıca RES, JES, biyokütle vb.
- **Aynı ölçüm noktası**: Üretim ve tüketim aynı sayaç/bağlantı noktasında (çatı GES vb.).
- **Farklı ölçüm noktası**: Üretim tesisi başka yerde (arazi GES), tüketim tesisleriyle sanal olarak ilişkilendirilir. Farklı dağıtım bölgesinde olabilir; tüketim verisi bağlantı anlaşmasındaki sayaçtan saatlik okunur.
- **Mahsuplaşma**: Üretimin ilişkili tüketimden düşülmesi.
- **İhtiyaç fazlası enerji**: Mahsuplaşma sonrası kalan, şebekeye verilmiş sayılan üretim.
- **Görevli tedarik şirketi (GTŞ)**: İhtiyaç fazlasını satın alan ve YEKDEM üzerinden maliyeti tahsil eden şirket.
- **YEKDEM**: Yenilenebilir Enerji Kaynakları Destekleme Mekanizması. İhtiyaç fazlası bedelleri ve "bedelsiz katkı" bu havuzdan/havuza akar.
- **YEKDEM'e bedelsiz katkı**: Limiti aşan veya kurallara aykırı üretim; **hiç ödeme yapılmaz**, sistem kullanım bedeli de tahakkuk ettirilmez.
- **Sanal sayaç**: EPİAŞ'ın mahsuplaşma sonrası abone grubu ve kaynak bazında saatlik üretimi kaydettiği sayaç.
- **Tüketim grubu**: Birden çok tüketim tesisi tek üretim tesisiyle ilişkilendirilebilir; **aynı abone grubunda** olmaları gerekir.

---

## 3. Mahsuplaşma kuralları (1 Mayıs 2026 sonrası)

### 3.1 Kimler saatlik, kimler aylık?

| Tüketim abone grubu | Mahsuplaşma periyodu | Üretim/satış limiti |
|---|---|---|
| Mesken | **Aylık** (kurulu güç fark etmeksizin) | **Limit yok** (1 No'lu Açıklama) |
| Sanayi | **Saatlik** | 2× yıllık tüketim |
| Ticarethane (kamu ve özel hizmetler / diğer) | **Saatlik** | 2× yıllık tüketim |
| Tarımsal sulama | **Saatlik** | 2× yıllık tüketim |
| Aydınlatma vb. diğer | Saatlik (⚠ teyit) | 2× yıllık tüketim |

- Kapsam: **12.05.2019 sonrası** bağlantı anlaşmasına çağrı mektubu alan YEK tesisleri — **mevcut tesisler dahil** saatlik sisteme geçti (mesken hariç).
- 12.05.2019 öncesi (eski yönetmelik) tesisler: tüketimden bağımsız, tüm ihtiyaç fazlası 10 yıl YEKDEM (13,3 $cent/kWh GES) fiyatıyla. Bunların çoğu 2026 itibarıyla 10 yılını dolduruyor → §5.3 rejimine geçer.
- Mesken limiti 5 kW → **10 kW**, tarımsal sulama limiti 250 kW → **500 kW** yükseltildi (02.04.2026; ⚠ bu eşiklerin hangi istisnaya — muafiyet/başvuru kolaylığı — bağlandığı teyit edilmeli).

### 3.2 Saatlik mahsuplaşma algoritması (her saat h için)

```
U(h) = üretim (kWh)               — üretim sayacı veriş
T(h) = ilişkili tüketim (kWh)     — tüm tüketim tesislerinin o saatteki toplam çekişi

M(h)  = min(U(h), T(h))           # mahsuplaşan enerji
IF(h) = max(U(h) − T(h), 0)       # ihtiyaç fazlası (şebekeye satılabilir aday)
SC(h) = max(T(h) − U(h), 0)       # şebekeden çekilen net enerji (tedarikçiden faturalı)
```

- Bir saatteki fazla, başka bir saatteki açığı **kapatamaz**.
- Ay sonunda ~720–744 saatlik sonuç toplanır: ΣM, ΣIF, ΣSC.
- Aynı ölçüm noktasında sayaç zaten net ölçüyorsa (çift yönlü sayaç, saatlik veriş/çekiş), U ve T yerine veriş/çekiş verisiyle aynı sonuç: IF(h)=veriş(h), SC(h)=çekiş(h). Farklı ölçüm noktasında U ve T ayrı sayaçlardan gelir.
- Gün içi örnek (kaynak: gemkurumsal, 300 kW GES yaz günü): U=2.355 kWh, T=2.400 kWh → aylıkta neredeyse tamamı mahsup olurdu; saatlikte M=1.530 kWh, IF=825 kWh, SC=870 kWh.

### 3.3 Aylık mahsuplaşma (mesken)

```
M_ay  = min(ΣU, ΣT)
IF_ay = max(ΣU − ΣT, 0)
SC_ay = max(ΣT − ΣU, 0)
```

### 3.4 Yıllık limit (2× kuralı) — mesken dışı

- Üretim tesisinin yıllık (bedelli) üretimi, ilişkili tüketim tesis(ler)inin **yıllık tüketiminin en fazla 2 katı** olabilir.
- Referans tüketim: **bir önceki yılın** toplam tüketimi (yeni tesis/ilk yılda bağlantı anlaşmasına esas tüketim ⚠ teyit).
- Limit kullanımı: mahsuplaşan enerji (M) de limiti tüketir. Örnek: referans tüketim 1.000 MWh → limit 2.000 MWh → yıl içinde ΣM + ΣIF_bedelli ≤ 2.000.
- Limit aşıldıktan sonraki tüm IF → **YEKDEM'e bedelsiz katkı** (0 TL). Mahsuplaşma devam eder.
- 01.05.2026 sonrası açıklamaya göre limit içindeki ihtiyaç fazlasının **tamamı** satılabilir (eski "satış ≤ tüketim" alt sınırı yerine tek 2× sınırı ⚠ teyit).

Program uygulaması (kümülatif, kronolojik):
```
kalan_limit = 2 × referans_yillik_tuketim
her saat h (yıl başından itibaren):
    kalan_limit -= M(h)
    satilabilir = min(IF(h), max(kalan_limit, 0))
    bedelsiz    = IF(h) − satilabilir
    kalan_limit -= satilabilir
```

### 3.5 Bedelsiz katkı sayılan diğer durumlar

- Depolama ünitesinden şebekeye verilen ve mahsuplaşma sonrası ihtiyaç fazlası olan enerji → **ödeme yok**.
- 25.11.2025 kurallarına aykırı tüketim ilişkilendirmesi (ör. sözleşme gücü < üretim gücü, öncelikle kazanılan projede yeni tüketim < başvurudaki tüketim) → üretim bedelsiz katkı.
- 10 yıl sonrası, ihtiyaç fazlasının üzerinde sisteme verilen enerji (11415 s. Karar) → bedelsiz katkı (2026 için 14671 s. Kararla sınır kaldırıldı).

---

## 4. Tüketim grupları ve çoklu tesis

- Bir üretim tesisi birden fazla tüketim tesisiyle ilişkilendirilebilir; tesisler **aynı abone grubunda** olmalı.
- T(h) = grup içindeki tüm tesislerin aynı saatteki tüketim toplamı.
- Grup içi tesislerin enerji tedariki tek tedarikçiden değilse, mahsuplaşma yapılmaksızın ilgili tedarikçiler ikili anlaşma hükümlerine göre faturalar (⚠ mekanizma ayrıntısı teyit).
- Endüstri Bölgeleri (EB) 02.04.2026 ile kapsama alındı; EB dağıtım lisansı sahipleri "ilgili şebeke işletmecisi" sayılır (OSB'lere benzer).

---

## 5. Satış fiyatları

### 5.1 12.05.2019 sonrası tesisler — işletmeye girişten itibaren ilk 10 yıl

```
Gelir_IF = Σ satilabilir(h) × P_aktif_tek_zamanlı(abone grubu, gerilim seviyesi)
```
- Fiyat: tüketim tesisinin abone grubuna ait **perakende tek zamanlı aktif enerji bedeli** (EPDK tarife tablosu; vergi, fon, dağıtım hariç).
- Tarifeler çeyreklik güncellenir (Ocak / Nisan / Temmuz / Ekim) → program **saatin ait olduğu dönemin** tarifesini kullanmalı.
- Ödeyici: görevli tedarik şirketi; maliyet YEKDEM'e yansır.

⚠ 2026 tarife değerleri (kaynaklar tutarsız, teyit şart):
| Abone grubu | Tek zamanlı aktif enerji bedeli (krş/kWh) | Kaynak/dönem |
|---|---|---|
| Sanayi (AG/OG) | ~290,97 | Nisan 2026 haberleri |
| Ticarethane / diğer | ~326,20 | Nisan 2026 haberleri |
| Mesken | ~242,49 | (dönem belirsiz) |
| Tarımsal sulama | ~171,08 | (dönem belirsiz) |

### 5.2 Mahsuplaşan enerjinin değeri

- Mahsuplaşan enerji (M) için tüketiciye çift fatura kesilmez; tüketici o enerjiyi şebekeden almamış sayılır.
- Değeri = tüketicinin **kaçınılan maliyeti**: serbest tüketici ise ikili anlaşma fiyatı (genellikle (PTF + YEKDEM) × katsayı), değilse tarife (aktif enerji + dağıtım + vergiler).
- Parasal uzlaşma EPİAŞ – GTŞ – tedarikçi hattında yürür.

### 5.3 10 yılını dolduran tesisler (11415 s. Cumhurbaşkanı Kararı, 13.06.2026)

```
P_10y(h) = min( yuvarla(YEKDEM_tesis_tipi_güncel × 0,90, 2), PTF(h) )
Gelir_IF = Σ satilabilir(h) × P_10y(h)
```
- YEKDEM fiyatı: lisanslı tesisler için tesis tipi bazında uygulanan **güncel** YEKDEM fiyatı (EPİAŞ her ay/çeyrek yayımlar).
- PTF: Gün Öncesi Piyasası saatlik Piyasa Takas Fiyatı (EPİAŞ Şeffaflık). PTF tavanı (azami fiyat limiti) **3.400 TL/MWh** ⚠.
- Aynı ölçüm noktasındaki tesislerde üretimin tamamı satışa konu edilebilir.
- 2026 yılı için ihtiyaç fazlası satışına **sınır yok** (14671 s. Karar; farklı ölçüm noktaları dahil).
- Veriş yönlü dağıtım bedeli: **Lisanssız Üretici-2** tarifesi (14613 s. Karar).

⚠ Güncel YEKDEM fiyatları (01.09.2026, EPİAŞ; birimler kaynakta "kr/kWh" olarak geçiyor):
| Kaynak | YEKDEM fiyatı | Yerli aksam desteği |
|---|---|---|
| Güneş | 284,81 | 77,40 |
| Karasal rüzgâr | 284,81 | 77,40 |
| Deniz üstü rüzgâr | 386,99 | 103,30 |
| Depolama bütünleşik RES/GES | 335,93 | 103,30 |

⚠ PTF referans: 2026 Ocak–Mayıs ortalaması ~1.644,71 TL/MWh.

---

## 6. Dağıtım bedelleri (sistem kullanım)

| Durum | Kural |
|---|---|
| İlk 10 yıl, veriş yönü | %100 indirim → **0** (YEK tesisleri) |
| İlk 10 yıl, aynı ölçüm noktası, çekiş yönü | Mahsuplaşan / üretim kapasitesi kadar kısım için abone grubu dağıtım tarifesinde **%50 indirim**; aşan kısım tam tarife |
| 10 yıl sonrası, veriş yönü | **Lisanssız Üretici-2: 65,6008 krş/kWh** (önceden LÜ-1: 208,1065 krş/kWh) |
| Lisanssız Üretici-1 | 208,1065 krş/kWh ⚠ |
| Bedelsiz katkı enerjisi | Sistem kullanım bedeli tahakkuk ettirilmez |

Net satış geliri (10 yıl sonrası):
```
Net_IF = Σ satilabilir(h) × (P_10y(h) − dağıtım_bedeli_LÜ2)
```

---

## 7. Diğer teknik/idari kurallar

- Sözleşme gücü, üretim tesisi gücünden düşük olamaz (25.11.2025).
- Aynı ölçüm noktası başvuruları kapasite tahsisinde 1. öncelikli.
- Lisans sahibi tüzel kişiler fazla enerjiyi **toplayıcı** aracılığıyla satabilir.
- Depolama: lisanssız üretimle bütünleşik depolama mümkün; depodan şebekeye verilen IF ödenmez → depolama yalnızca **öz tüketim kaydırma** için ekonomik (gündüz fazlasını depola, akşam tüketimde kullan).
- Faturalama: 2026'da fatura düzenleme sınırı KDV dahil 12.000 TL; bilanço esaslı mükellefler için her fatura e-Arşiv/e-Fatura. Mesken (gerçek kişi) üreticilerin vergisel durumu ⚠ teyit (GİB / mali müşavir).

---

## 8. Program için veri modeli önerisi

**Girdiler**
- Üretim tesisi: id, kaynak tipi (GES/RES/…), kurulu güç (kWe/kWp), işletmeye giriş tarihi, çağrı mektubu tarihi (≥/≤ 12.05.2019), ölçüm noktası (aynı/farklı), depolama var mı.
- Tüketim tesisleri: id, abone grubu, gerilim seviyesi (AG/OG), tarife tipi (tek zamanlı / serbest tüketici), önceki yıl tüketimi (kWh), tedarikçi + ikili anlaşma fiyatı.
- Saatlik seriler (CSV): `zaman, uretim_kwh` ve `zaman, tesis_id, tuketim_kwh` (EPİAŞ LÜM / OSOS / dağıtım şirketi sayaç verisi); depolama varsa `depodan_veris_kwh`.
- Fiyat serileri: saatlik PTF (EPİAŞ), aylık YEKDEM fiyatı, çeyreklik EPDK tarife tablosu, LÜ-1/LÜ-2 dağıtım bedelleri.

**Hesap motoru adımları**
1. Rejim belirle: mesken → aylık; diğer → saatlik. 10 yıl doldu mu (işletmeye giriş + 10 yıl)?
2. Saatlik T(h) = grup tüketim toplamı; M, IF, SC hesapla.
3. Yıllık 2× limiti kümülatif uygula (mesken hariç) → satılabilir / bedelsiz ayrımı.
4. Depodan veriş kaynaklı IF → bedelsiz.
5. Fiyatla: ilk 10 yıl → tarife aktif enerji bedeli; 10 yıl sonrası → min(YEKDEM×0,9, PTF(h)).
6. Dağıtım bedeli düş (10 yıl sonrası LÜ-2), çekiş tarafı %50 indirim hesapla.
7. Raporla: aylık özet (ΣU, ΣT, ΣM, ΣIF satılabilir/bedelsiz, ΣSC, gelir, kaçınılan maliyet, öz tüketim oranı = ΣM/ΣU, limit kullanım %), saatlik detay, aylık vs saatlik karşılaştırma (senaryo analizi), depolama simülasyonu.

**Doğrulanacak açık noktalar (⚠)**
- Yeni tesislerde ilk yıl referans tüketim tanımı.
- Limitin takvim yılı mı, işletme yılı mı bazında sıfırlandığı.
- 10 yıl sonrası rejimde 2027+ satış sınırı (2026 için kaldırıldı; yıllık EPDK kararına bağlı).
- Güncel çeyrek EPDK tarife tablosu ve YEKDEM fiyat birimi.
- Çoklu tedarikçili tüketim gruplarında uzlaştırma.

---

## 9. Kaynaklar

- AA / Enerji Terminali: saatlik mahsuplaşma dönemi — https://www.aa.com.tr/tr/enerjiterminali/genel/lisanssiz-elektrik-uretiminde-saatlik-mahsuplasma-donemi-basladi/56064
- Bloomberg HT — https://www.bloomberght.com/lisanssiz-elektrik-uretiminde-saatlik-mahsuplasma-donemi-basladi-3773567
- Paksoy: saatlik mahsuplaşma — https://paksoy.av.tr/2026/04/lisanssiz-elektrik-uretiminde-saatlik-mahsuplasma-donemine-gecildi/
- Alomaliye (02.04.2026 değişiklik metni) — https://www.alomaliye.com/2026/04/02/elektrik-piyasasinda-lisanssiz-elektrik-uretim-yonetmeliginde-degisiklik-02-04-2026/
- Alomaliye (25.11.2025 değişiklik metni) — https://www.alomaliye.com/2025/11/25/elektrik-piyasasinda-lisanssiz-elektrik-uretim-yonetmeliginde-degisiklik-25-11-2025/
- GENSED: EPDK 1 No'lu Açıklama — https://gensed.org/epdk-lisanssiz-elektrik-uretimine-iliskin-1-nolu-aciklama-paylasti/
- GENSED: 11415 s. Karar — https://gensed.org/10-yilini-dolduran-lisanssiz-gesler-icin-yeni-donem/
- GENSED: 2026 satış kısıtı kalktı — https://gensed.org/10-yilini-dolduran-lisanssiz-elektrik-uretim-tesisleri-icin-2026da-satis-kisiti-uygulanmayacak-ihtiyac-fazlasi-elektrigin-tamami-satilabilecek/
- Esin Avukatlık: 10 yıl düzenlemesi — https://www.esin.av.tr/tr/2026/06/18/10-yillik-yekdem-suresini-tamamlayan-lisanssiz-elektrik-uretim-tesislerine-iliskin-yeni-duzenleme/
- Yeşil Haber: 11415 s. Karar — https://yesilhaber.net/lisanssiz-elektrik-10-yil-ptf-yekdem/
- Enoptimal: LÜ-2 dağıtım bedeli — https://enoptimal.com/blog/10-yil-lisanssiz-uretim-dagitim-bedeli-2026
- Enoptimal: satış limitleri 2026 — https://enoptimal.com/blog/lisanssiz-ges-enerji-satisi-limitleri-2026
- Gemkurumsal: saatlik mahsuplaşma hesaplama — https://www.gemkurumsal.com/saatlik-mahsuplasma-hesaplama/
- myenerjisolar: 2 katı kuralı — https://www.myenerjisolar.com/10796-2/
- apollo.eco: 2 Nisan 2026 analizi — https://apollo.eco/tr/2-nisan-lisanssiz-elektrik-uretim-yonetmeligi-degisiklikleri-analizi/
- GENSED: Eylül 2026 YEKDEM fiyatları — https://gensed.org/23550-2/
- EMO: dağıtım bedeli avantajı — https://www.emo.org.tr/genel/bizden_detay.php?kod=128308
- EMO: mahsuplaşma işlemleri sunumu (2023) — https://www.emo.org.tr/ekler/b237575f5446b6f_ek.pdf
- EPİAŞ azami fiyat limiti — https://www.epias.com.tr/tum-duyurular/gun-oncesi-piyasasinda-ve-dengeleme-guc-piyasasinda-azami-fiyat-limitinin-3-400-tl-mwh-olarak-belirlenmesine-iliskin-kurul-karari
