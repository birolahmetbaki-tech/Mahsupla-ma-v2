// Yedekleme: programın tarayıcıda sakladığı her şeyi tek bir dosyaya
// yazar ve geri yükler.
//
// Veriler tarayıcının yerel deposunda durur; başka bir bilgisayara ya da
// tarayıcıya geçildiğinde kendiliğinden taşınmaz. Yedek dosyası bu boşluğu
// kapatır: veri sekmeleri ve tesis bilgileri, hesap ayarları, dashboard
// yerleşimi ve açılış sayfası düzeni bir arada gider. Hesaplanmış değerler
// yedeğe girmez: veriden her açılışta yeniden hesaplanır.

const YEDEK_ON_EK = "mahsupla-";
const YEDEK_TURU = "mahsupla-yedek";
const YEDEK_SURUMU = 1;

/** Yeniden hesaplanabildiği için yedeğe alınmayan anahtarlar. */
const TUREYEN_ANAHTARLAR = new Set();

/** Anahtarların okunur adları ve içerik özeti. */
const ANAHTAR_ADLARI = {
  "mahsupla-veri":   { ad: "Veri sekmeleri ve tesis bilgileri", ozet: (v) => sayiliOzet(v, "sayfalar", "sekme") },
  "mahsupla-acilis": { ad: "Açılış sayfası" },
  "mahsupla-hesap":  { ad: "Hesaplanmış Değerler görünüm ayarları" },
  "mahsupla-pano":   { ad: "Dashboard yerleşimi", ozet: (v) => sayiliOzet(v, "pencereler", "pencere") },
  "mahsupla-robot":  { ad: "Robot sohbet geçmişi" },
  "mahsupla-tema":   { ad: "Tema" },
  "mahsupla-kabuk":  { ad: "Kenar çubuğu" },
  "mahsupla-sayfa":  { ad: "Son açık sayfa" },
};

function sayiliOzet(ham, alan, birim) {
  try {
    const v = JSON.parse(ham);
    const dizi = v?.[alan];
    if (Array.isArray(dizi)) return `${dizi.length} ${birim}`;
  } catch { /* özet çıkaramazsak ad yeterli */ }
  return null;
}

const kilobayt = (metin) => Math.max(1, Math.round(metin.length / 1024));

/* ================= Yedek alma ================= */

/** Saklanan her şeyi tek pakette toplar. */
function yedekUret() {
  const veriler = {};
  for (let i = 0; i < localStorage.length; i++) {
    const anahtar = localStorage.key(i);
    if (!anahtar?.startsWith(YEDEK_ON_EK) || TUREYEN_ANAHTARLAR.has(anahtar)) continue;
    const deger = localStorage.getItem(anahtar);
    if (deger !== null) veriler[anahtar] = deger;
  }
  return {
    tur: YEDEK_TURU,
    surum: YEDEK_SURUMU,
    zaman: new Date().toISOString(),
    uygulama: "Mahsupla",
    veriler,
  };
}

/** Dosya adı: mahsupla-yedek-2026-09-23-0715.json */
function yedekDosyaAdi(tarih = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `mahsupla-yedek-${tarih.getFullYear()}-${p(tarih.getMonth() + 1)}-${p(tarih.getDate())}`
       + `-${p(tarih.getHours())}${p(tarih.getMinutes())}.json`;
}

/** Yedeği dosya olarak indirir. */
function yedegiIndir() {
  const paket = yedekUret();
  const metin = JSON.stringify(paket);
  const bag = URL.createObjectURL(new Blob([metin], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = bag;
  a.download = yedekDosyaAdi(new Date(paket.zaman));
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Tarayıcı indirmeyi başlatana kadar bağlantı ayakta kalsın
  setTimeout(() => URL.revokeObjectURL(bag), 10000);
  return { paket, boyut: kilobayt(metin) };
}

/* ================= Yedek okuma ================= */

/** Dosyayı okur ve paketin geçerli olduğunu doğrular. */
function yedegiOku(dosya) {
  return new Promise((coz, reddet) => {
    const okuyucu = new FileReader();
    okuyucu.onerror = () => reddet(new Error("Dosya okunamadı."));
    okuyucu.onload = () => {
      let paket;
      try {
        paket = JSON.parse(String(okuyucu.result));
      } catch {
        reddet(new Error("Dosya geçerli bir yedek değil (JSON çözümlenemedi)."));
        return;
      }
      if (paket?.tur !== YEDEK_TURU || !paket.veriler || typeof paket.veriler !== "object") {
        reddet(new Error("Bu dosya bir Mahsupla yedeği değil."));
        return;
      }
      if (Number(paket.surum) > YEDEK_SURUMU) {
        reddet(new Error("Yedek, programın bu sürümünden daha yeni. Önce programı güncelleyin."));
        return;
      }
      coz(paket);
    };
    okuyucu.readAsText(dosya);
  });
}

/** Paketin içeriğini kullanıcıya gösterilecek satırlara çevirir. */
function yedekOzeti(paket) {
  return Object.entries(paket.veriler).map(([anahtar, deger]) => {
    const tanim = ANAHTAR_ADLARI[anahtar];
    return {
      anahtar,
      ad: tanim?.ad ?? anahtar,
      ozet: tanim?.ozet?.(deger) ?? null,
      boyut: kilobayt(deger),
    };
  }).sort((a, b) => b.boyut - a.boyut);
}

/**
 * Paketi yerel depoya yazar. Mevcut veriler tamamen değiştirilir:
 * yarı yüklenmiş bir durum, eski ayarlarla yeni veri sekmelerinin
 * karışmasından daha az kafa karıştırıcı olmaz.
 */
function yedegiYukle(paket) {
  const eski = [];
  for (let i = 0; i < localStorage.length; i++) {
    const anahtar = localStorage.key(i);
    if (anahtar?.startsWith(YEDEK_ON_EK)) eski.push(anahtar);
  }
  for (const anahtar of eski) localStorage.removeItem(anahtar);

  let yazilan = 0;
  for (const [anahtar, deger] of Object.entries(paket.veriler)) {
    if (!anahtar.startsWith(YEDEK_ON_EK) || typeof deger !== "string") continue;
    localStorage.setItem(anahtar, deger);
    yazilan++;
  }
  return { silinen: eski.length, yazilan };
}

/** Yedekteki zamanın okunur hâli. */
function yedekZamani(paket) {
  const t = new Date(paket.zaman);
  return Number.isNaN(t.getTime()) ? "bilinmiyor" : t.toLocaleString("tr-TR");
}
