// Excel dışa aktarma. Veri ve Hesaplanmış Değerler sayfalarındaki tabloları
// .xlsx dosyasına yazar. Program çevrimdışı çalıştığı için SheetJS pakete
// gömülüdür; buradan yalnızca yazma tarafı kullanılır.

/** Dosya adı için gün ve saat damgası — aynı gün birden çok aktarım karışmasın. */
function zamanDamgasi() {
  const d = new Date();
  const p = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * Excel sayfa adı kuralları: en çok 31 karakter, : \ / ? * [ ] yasak,
 * aynı ad iki kez kullanılamaz. Sekme ve tesis adları bu kurallara uymayabilir.
 */
function sayfaAdiTemizle(ad, kullanilan) {
  let temiz = String(ad ?? "Sayfa").replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31);
  if (!temiz) temiz = "Sayfa";
  if (!kullanilan.has(temiz)) { kullanilan.add(temiz); return temiz; }
  for (let i = 2; ; i++) {
    const ek = ` (${i})`;
    const aday = temiz.slice(0, 31 - ek.length) + ek;
    if (!kullanilan.has(aday)) { kullanilan.add(aday); return aday; }
  }
}

/** Sütun genişlikleri: en uzun hücreye göre, 8–42 karakter arasında. */
function sutunGenislikleri(satirlar) {
  const en = [];
  for (const satir of satirlar) {
    satir.forEach((h, i) => {
      const uzunluk = h === null || h === undefined ? 0 : String(h).length;
      if (uzunluk > (en[i] ?? 0)) en[i] = uzunluk;
    });
  }
  return en.map((u) => ({ wch: Math.min(Math.max((u ?? 0) + 2, 8), 42) }));
}

/**
 * Sayfaları tek bir çalışma kitabına yazıp indirir.
 * @param {string} dosyaAdi  Uzantısız ad; sonuna zaman damgası eklenir.
 * @param {{ad: string, satirlar: any[][]}[]} sayfalar
 * @returns {string|null} İndirilen dosyanın adı, yazılamadıysa null.
 */
function calismaKitabiIndir(dosyaAdi, sayfalar) {
  const dolu = sayfalar.filter((s) => s.satirlar?.length);
  if (!dolu.length) return null;
  if (typeof XLSX === "undefined") {
    alert("Excel kitaplığı yüklenemedi; dışa aktarma yapılamıyor.");
    return null;
  }
  const wb = XLSX.utils.book_new();
  const kullanilan = new Set();
  for (const s of dolu) {
    const ws = XLSX.utils.aoa_to_sheet(s.satirlar);
    ws["!cols"] = sutunGenislikleri(s.satirlar);
    XLSX.utils.book_append_sheet(wb, ws, sayfaAdiTemizle(s.ad, kullanilan));
  }
  const tamAd = `${dosyaAdi}-${zamanDamgasi()}.xlsx`;
  XLSX.writeFile(wb, tamAd);
  return tamAd;
}

// Türkçe harfler dosya adında tarayıcıdan tarayıcıya sorun çıkarıyor;
// indirilen dosya adsız kalabiliyor. Bu yüzden ASCII karşılıklarına çevrilir.
const ASCII_KARSILIK = {
  ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", İ: "i",
  ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
};

/** Dosya adında kullanılabilecek hâle getirir (ASCII, boşluk yerine tire). */
function dosyaAdiTemizle(ad) {
  return String(ad ?? "")
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (h) => ASCII_KARSILIK[h])
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60) || "aktarim";
}

/**
 * Hücreye yazılacak değer. Sayılar ham hâlde gider ki Excel'de toplanabilsin;
 * hesap hatası olan hücreler metin olarak işaretlenir.
 */
function aktarimDegeri(v, basamak) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "object") return v.hata ? "#HATA" : null;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    return Number.isInteger(basamak) ? Number(v.toFixed(basamak)) : v;
  }
  return v;
}
