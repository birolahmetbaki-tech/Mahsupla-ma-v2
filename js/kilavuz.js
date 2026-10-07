// Kullanım kılavuzu: Ayarlar → Hakkında sekmesinin metni.
// "Kılavuzu Yazdır" düğmesi aynı metni yazdırılabilir bir pencerede açar;
// tarayıcının "PDF olarak kaydet" seçeneğiyle PDF'e de çevrilebilir.

const KILAVUZ_BASLIK = "Mahsupla — Kullanım Kılavuzu";
const KILAVUZ_ALT_BASLIK = "Lisanssız elektrik üretiminde mahsuplaşma, ihtiyaç fazlası ve yıllık limit takibi";

const KILAVUZ_BOLUMLER = [
  {
    baslik: "Program ne yapar?",
    parcalar: [
      { tur: "p", govde: "Mahsupla, lisanssız elektrik üretim tesislerinizin (GES, RES…) ilişkili tüketim tesisleriyle mahsuplaşmasını ay ay takip eder: ne kadar üretildi, ne kadarı tüketimle mahsuplaştı, ne kadarı ihtiyaç fazlası olarak satıldı, yıllık 2× limitin ne kadarı kullanıldı ve bunların parasal karşılığı ne oldu." },
      { tur: "p", govde: "Programın tamamı tek bir HTML dosyasıdır. Kurulum gerektirmez, internet bağlantısı istemez. Çift tıklayıp tarayıcıda açarsınız." },
      { tur: "uyari", govde: "Verileriniz tarayıcının yerel deposunda saklanır. Başka bir bilgisayara ya da başka bir tarayıcıya kendiliğinden taşınmaz. Ayarlar → Yedekleme sekmesinden düzenli olarak yedek alın." },
    ],
  },
  {
    baslik: "Bilgi nasıl akıyor?",
    parcalar: [
      { tur: "akis", govde: [
        "Veri — her tesis için bir sekme; aylık tüketim, üretim, mahsuplaşan enerji, fiyat ve bedeller girilir",
        "Hesaplanmış Değerler — her tesis ve bütün tesislerin toplamı için mahsuplaşma göstergeleri hesaplanır",
        "Veri Tutarlılık Kontrolü — imkânsız ya da şüpheli değerler listelenir",
        "Dashboard — seçtiğiniz göstergeler kart ve grafiklerle gösterilir",
      ] },
      { tur: "p", govde: "Bir sayfada beklediğiniz sayıyı göremiyorsanız zincirde ondan önceki halkaya bakın: Hesaplanmış Değerler'de bir hücre boşsa, o tesisin sekmesinde ilgili dönemin verisi ya da sütunun hesap rolü eksiktir." },
    ],
  },
  {
    baslik: "Veri sayfası ve sekmeler",
    parcalar: [
      { tur: "p", govde: "Excel'e benzeyen bir çalışma kitabıdır. Sekmeler ekranın altındaki çubukta durur; her sekme aylık bir tablodur: ilk iki sütun YIL ve AY'dır, satırlar dönemleri tutar." },
      { tur: "liste", govde: [
        "Yeni sekme: alttaki + düğmesi. Şablonlar: Mahsuplaşma tesisi, Fiyat tablosu, Boş sayfa",
        "Sekmeye geçmek: üzerine tıklayın ya da hücredeyken Ctrl + PageUp / PageDown",
        "Adlandırmak: sekmeye çift tıklayın. Bu sekmeye başvuran formüller de yeni adla güncellenir",
        "Sağ tık menüsü: tesis bilgileri, sekme rengi, çoğaltma, sola/sağa taşıma, silme. Sekmeleri sürükleyerek de sıralayabilirsiniz",
        "Tesis sekmeleri (⚡ simgeli) hesaplara katılır; genel sekmeler (fiyat tabloları, notlar) yalnızca veri tutar. Tür sağ tık menüsünden değiştirilir",
        "Excel İçe Aktar: dosyadaki bir sayfayı açık sekmeye ya da yeni sekmeye, ya da her Excel sayfasını ayrı bir sekmeye aktarır",
        "Excel Dışa Aktar: bütün sekmeleri tek dosyada, her biri ayrı sayfa olarak indirir",
      ] },
    ],
  },
  {
    baslik: "Hücreler ve formüller",
    parcalar: [
      { tur: "p", govde: "Her hücreye yazabilirsiniz. = ile başlayan giriş formüldür. Türkçe Excel yazımı geçerlidir: argümanlar noktalı virgülle ayrılır, iki rakam arasındaki virgül ondalıktır." },
      { tur: "liste", govde: [
        "Harf tek başına aynı satırı gösterir: =D-E (üretim − mahsuplaşan)",
        "Belirli bir hücre: =C3 · aralık: =TOPLA(C1:C12)",
        "Başka sekme: =Fiyatlar!C aynı dönemin (YIL + AY) satırını okur; =Fiyatlar!C5 doğrudan 5. satırı. Adında boşluk olan sekme tırnakla yazılır: ='GES 1'!D",
        "Fonksiyonlar: TOPLA, ORTALAMA, MİN, MAK, BAĞ_DEĞ_SAY, MUTLAK, YUVARLA, EĞER, VE, YADA, DEĞİL, EĞERHATA (İngilizce adları da çalışır)",
        "İşleçler: + − * / ^ % & = <> < > <= >=",
        "Sütun formülü: başlıktaki ▾ menüsünden verilir ve sütunun boş hücrelerine uygulanır. Bir hücreye değer yazarsanız o hücrede formülün yerine geçer",
        "Hatalar: #HATA (hesaplanamadı), #SAYFA (olmayan sekme), #DÖNGÜ (döngüsel başvuru)",
      ] },
    ],
  },
  {
    baslik: "Tesis sekmesi ve hesap rolleri",
    parcalar: [
      { tur: "p", govde: "Hesaplar sütunları adlarından değil rollerinden tanır. Şablondaki sütunlar rolleriyle gelir; başlıktaki Σ işareti sütunun bir rolü olduğunu gösterir. Eklediğiniz sütuna ▾ menüsünden \"Hesap rolü\" verin ya da Hesaplanmış Değerler → Sütun Rolleri penceresini kullanın." },
      { tur: "liste", govde: [
        "Tüketim (çekiş) — gerekli. İlişkili tüketim tesislerinin aylık toplamı. Birden çok sayacı ayrı sütunlara yazıp hepsine bu rolü verirseniz toplanır",
        "Üretim (veriş) — gerekli. Üretim tesisinin aylık üretimi",
        "Mahsuplaşan enerji — faturadaki / EPİAŞ LÜM'deki saatlik mahsuplaşma sonucu. Boşsa aylık varsayım min(üretim, tüketim) kullanılır",
        "İhtiyaç fazlası enerji — boşsa üretim − mahsuplaşan",
        "Aktif enerji birim fiyatı (TL/kWh) — kaçınılan maliyet için. Şablonda =Fiyatlar!C ile fiyat sekmesine bağlıdır",
        "İhtiyaç fazlası birim fiyatı (TL/kWh) — ilk 10 yıl aktif enerji bedeli; sonrasında min(YEKDEM × %90, PTF)",
        "İhtiyaç fazlası bedeli (TL) — faturadaki tutar. Boşsa satılabilir ihtiyaç fazlası × birim fiyat",
        "Tedarikçi fatura tutarı (TL) — net enerji gideri için",
      ] },
      { tur: "p", govde: "Tesis bilgileri (sekmeye sağ tık): kaynak türü, kurulu güç, abone grubu, sözleşme gücü, mahsuplaşma periyodu, işletmeye giriş tarihi, limit referans tüketimi ve limit katsayısı. Kurulu güç kapasite faktörü için, abone grubu ve referans tüketim yıllık limit için kullanılır." },
    ],
  },
  {
    baslik: "Hesaplanmış Değerler",
    parcalar: [
      { tur: "p", govde: "Tesis görünümünde seçili tesisin (ya da bütün tesislerin toplamının) bütün göstergeleri, Matris görünümünde tek gösterge bütün tesisler için görünür. Her yılın sonunda yıl toplamı, en üstte tüm dönemlerin toplamı vardır. Bir hücreye tıklayınca hangi veriyle nasıl hesaplandığı sağda açılır; ↗ düğmesi sizi veri sekmesindeki hücreye götürür." },
      { tur: "liste", govde: [
        "Mahsuplaşan enerji, ihtiyaç fazlası, şebekeden net çekiş (tüketim − mahsuplaşan)",
        "Öz tüketim oranı (mahsuplaşan / üretim) ve tüketimin karşılanma oranı (mahsuplaşan / tüketim)",
        "Saatlik mahsuplaşma farkı: aylık mahsuplaşma olsaydı fazladan mahsuplaşacak enerji",
        "Yıllık limit, limit kullanımı ve oranı; satılabilir ihtiyaç fazlası ve YEKDEM'e bedelsiz katkı",
        "İhtiyaç fazlası geliri, kaçınılan enerji maliyeti, toplam fayda, net enerji gideri",
        "Kapasite faktörü ve özgül üretim (kurulu güç girildiyse)",
      ] },
      { tur: "p", govde: "Oranların aralık değeri ortalamaların ortalaması değildir: pay ve payda ayrı ayrı toplanıp bölünür. Limit gibi yıl başından birikimli büyüklüklerde aralığın son dönemi alınır." },
    ],
  },
  {
    baslik: "Mahsuplaşma kuralları (özet)",
    parcalar: [
      { tur: "liste", govde: [
        "1 Mayıs 2026'dan itibaren mesken dışı abonelerde mahsuplaşma saatliktir: her saat min(üretim, tüketim) mahsuplaşır, bir saatin fazlası başka bir saatin açığını kapatamaz. Meskende aylıktır",
        "İhtiyaç fazlası: mahsuplaşmadan sonra kalan üretim. İlk 10 yılda abone grubunun tek zamanlı aktif enerji bedeliyle satılır",
        "Yıllık limit (mesken hariç): mahsuplaşan enerji + satılan ihtiyaç fazlası, ilişkili tüketimin önceki yılki toplamının 2 katını geçemez. Aşan ihtiyaç fazlası YEKDEM'e bedelsiz katkıdır",
        "10 yılını dolduran tesislerde ihtiyaç fazlası fiyatı min(YEKDEM × %90, PTF); veriş yönünde Lisanssız Üretici-2 dağıtım bedeli uygulanır",
        "Sözleşme gücü üretim tesisinin gücünden düşük olamaz",
      ] },
      { tur: "uyari", govde: "Program limiti ay sırasıyla uygular; gerçek uzlaştırma saat sırasıyla yapıldığından limitin aşıldığı ayda küçük farklar olabilir. Tarife ve fiyatları resmî kaynaklardan (EPDK, EPİAŞ) teyit ederek girin. Ayrıntılı mevzuat notları depodaki docs/BILGI_BANKASI.md dosyasındadır." },
    ],
  },
  {
    baslik: "Veri Tutarlılık Kontrolü",
    parcalar: [
      { tur: "p", govde: "Her veri değişiminde bütün sekmeler yeniden taranır. Hata: imkânsız ya da çelişen değer (mahsuplaşan enerjinin üretimden büyük olması, formül hatası, mükerrer dönem). Uyarı: mümkün ama şüpheli (limit aşımı, fiyat aralık dışı, faturadaki bedelin hesapla uyuşmaması, eksik tüketim/üretim). Bilgi: dikkat edilmesi gereken durum (saatlik dönemde mahsuplaşan enerjinin girilmemesi, limite yaklaşma, 10 yıllık sürenin dolması)." },
    ],
  },
  {
    baslik: "Dashboard ve analiz robotu",
    parcalar: [
      { tur: "p", govde: "Dashboard serbest yerleşimli pencerelerden oluşur: değer kartı, çizgi grafik, sıralı çubuk, dönem kıyası, pasta, yıllık toplam, hedef göstergesi, tablo, öngörü ve not. Pencereleri sürükleyerek taşıyın, köşeden boyutlandırın, çift tıklayarak ayarlayın. Hedef göstergesine \"Limit kullanımı\" bağlarsanız hedef yıllık limit olur." },
      { tur: "p", govde: "Kenar çubuğundaki robot simgesi, verinizi kural tabanlı olarak yorumlayan yardımcıyı açar: durum özeti, yıllık limit durumu, saatlik mahsuplaşma etkisi, yıl karşılaştırma, öngörü, tesis sıralama ve veri kalitesi. Robot bir dil modeli değildir; yalnızca programın kendi hesaplarını kullanır." },
    ],
  },
  {
    baslik: "Sık sorulanlar",
    parcalar: [
      { tur: "sss", govde: ["Faturada mahsuplaşan enerji yazmıyor, ne yapmalıyım?", "Sütunu boş bırakın; program aylık varsayımla min(üretim, tüketim) kullanır. Saatlik mahsuplaşmada bu değer gerçekten yüksektir; EPİAŞ LÜM ya da dağıtım şirketinden saatlik sonucu edinip girmeniz önerilir."] },
      { tur: "sss", govde: ["Birden çok tüketim tesisi tek üretim tesisine bağlı.", "Her tüketim tesisi için ayrı bir sütun açın ve hepsine \"Tüketim\" rolünü verin; değerler toplanır. Tüketim grubundaki tesisler aynı abone grubunda olmalıdır."] },
      { tur: "sss", govde: ["Yıllık limit boş görünüyor.", "Limit, önceki takvim yılının tüketiminden hesaplanır. İlk yılın verisi yoksa Tesis bilgileri penceresine referans tüketimi elle yazın."] },
      { tur: "sss", govde: ["Verilerimi başka bilgisayara nasıl taşırım?", "Ayarlar → Yedekleme → Yedeği İndir. Diğer bilgisayarda aynı sekmeden Yedekten Yükle."] },
    ],
  },
];

/** Kılavuzu yazdırılabilir bir pencerede açar. */
function kilavuzuYazdir() {
  const parca = (p) => {
    if (p.tur === "p") return `<p>${kacisla(p.govde)}</p>`;
    if (p.tur === "uyari") return `<p class="uyari">${kacisla(p.govde)}</p>`;
    if (p.tur === "liste") return `<ul>${p.govde.map((m) => `<li>${kacisla(m)}</li>`).join("")}</ul>`;
    if (p.tur === "akis") return `<ol>${p.govde.map((m) => `<li>${kacisla(m)}</li>`).join("")}</ol>`;
    if (p.tur === "sss") return `<p><b>${kacisla(p.govde[0])}</b><br>${kacisla(p.govde[1])}</p>`;
    return "";
  };
  const pencere = window.open("", "_blank");
  if (!pencere) return alert("Yazdırma penceresi açılamadı; tarayıcının açılır pencere engelini kaldırın.");
  pencere.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8">
    <title>${kacisla(KILAVUZ_BASLIK)}</title>
    <style>
      body { font: 12pt/1.5 "Segoe UI", Calibri, system-ui, sans-serif; color: #1f2933; max-width: 760px; margin: 24px auto; padding: 0 16px; }
      h1 { color: #1f4e79; margin-bottom: 0; } h2 { color: #1f4e79; border-bottom: 1px solid #d6dbe1; margin-top: 28px; }
      .alt { color: #6b7885; margin-top: 4px; } .uyari { background: #fff4e5; border-left: 4px solid #b45309; padding: 6px 10px; }
      @media print { h2 { break-after: avoid; } }
    </style></head><body>
    <h1>${kacisla(KILAVUZ_BASLIK)}</h1><p class="alt">${kacisla(KILAVUZ_ALT_BASLIK)}</p>
    ${KILAVUZ_BOLUMLER.map((b, i) => `<h2>${i + 1}. ${kacisla(b.baslik)}</h2>${b.parcalar.map(parca).join("")}`).join("")}
    <script>setTimeout(function () { window.print(); }, 300);<\/script>
    </body></html>`);
  pencere.document.close();
}
