// Çalışma kitabının varsayılan düzeni ve mahsuplaşma kavramları.
//
// Veri sayfası Excel gibi sekmelerden oluşur. Her sekme aylık bir tablodur:
// ilk iki sütun her zaman YIL ve AY'dır, satırlar dönemleri tutar. Sekmenin
// iki türü vardır:
//   tesis  — bir mahsuplaşma birimi (üretim tesisi + ilişkili tüketim). Hesaplanmış
//            Değerler sayfası her tesis sekmesi için göstergeleri hesaplar.
//   genel  — yalnızca veri: tarife ve fiyat tabloları, notlar. Tesis sekmeleri
//            bu sekmelere formülle başvurabilir: =Fiyatlar!C
//
// Hesap motoru sütunları adlarından değil "rol"lerinden tanır. Şablondaki
// sütunlar rolleriyle gelir; kullanıcı eklediği sütuna sütun menüsünden rol verir.

const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

const ILK_YIL = 2024;
const SON_YIL = 2027;

/**
 * Hesap rolleri. "toplanir" rollerde aynı role bağlı birden çok sütun
 * toplanır (örneğin iki tüketim tesisinin sayaçları); fiyat rollerinde
 * yalnızca ilk sütun okunur.
 */
const MAHSUP_ROLLERI = [
  { anahtar: "tuketim", ad: "Tüketim (çekiş)", birim: "kWh", zorunlu: true, toplanir: true,
    aciklama: "İlişkili tüketim tesis(ler)inin aylık toplam tüketimi." },
  { anahtar: "uretim", ad: "Üretim (veriş)", birim: "kWh", zorunlu: true, toplanir: true,
    aciklama: "Lisanssız üretim tesisinin aylık üretimi." },
  { anahtar: "mahsup", ad: "Mahsuplaşan enerji", birim: "kWh", toplanir: true,
    aciklama: "Saatlik mahsuplaşma sonucu (EPİAŞ LÜM / fatura). Boş bırakılırsa aylık " +
      "mahsuplaşma varsayılır: min(üretim, tüketim)." },
  { anahtar: "ihtiyacFazlasi", ad: "İhtiyaç fazlası enerji", birim: "kWh", toplanir: true,
    aciklama: "Faturadaki ihtiyaç fazlası. Boş bırakılırsa üretim − mahsuplaşan enerji alınır." },
  { anahtar: "aktifFiyat", ad: "Aktif enerji birim fiyatı", birim: "TL/kWh",
    aciklama: "Tüketicinin şebekeden aldığı enerjinin birim bedeli; mahsuplaşan enerjinin " +
      "kaçınılan maliyeti bununla hesaplanır." },
  { anahtar: "ifFiyat", ad: "İhtiyaç fazlası birim fiyatı", birim: "TL/kWh",
    aciklama: "İlk 10 yılda abone grubunun tek zamanlı aktif enerji bedeli; 10 yıldan sonra " +
      "min(YEKDEM × %90, PTF)." },
  { anahtar: "ifBedel", ad: "İhtiyaç fazlası bedeli (fatura)", birim: "TL", toplanir: true,
    aciklama: "Görevli tedarik şirketinin ödediği tutar. Boşsa satılabilir enerji × birim fiyat hesaplanır." },
  { anahtar: "fatura", ad: "Tedarikçi fatura tutarı", birim: "TL", toplanir: true,
    aciklama: "Tüketim tesisinin şebekeden çektiği enerji için ödenen fatura." },
];

const ROL_ADI = Object.fromEntries(MAHSUP_ROLLERI.map((r) => [r.anahtar, r]));

/** Sütun başlığından rol tahmini — içe aktarmada ve yeni sütunda öneri olarak. */
function rolTahmin(baslik, birim = "") {
  const b = String(baslik ?? "").toLocaleLowerCase("tr");
  const u = String(birim ?? "").toLocaleLowerCase("tr").replace(/\s/g, "");
  const tl = u === "tl" || u === "₺";
  const fiyat = u.includes("/kwh") || /birim fiyat|fiyatı|tarife/.test(b);
  if (/ihtiyaç fazlası|ihtiyac fazlasi/.test(b)) return fiyat ? "ifFiyat" : tl || /bedel/.test(b) ? "ifBedel" : "ihtiyacFazlasi";
  if (/mahsup/.test(b) && !tl && !fiyat) return "mahsup";
  if (fiyat && /aktif|enerji bedeli/.test(b)) return "aktifFiyat";
  if (/fatura/.test(b) && (tl || /tutar/.test(b))) return "fatura";
  if (tl || fiyat) return null;
  if (/üretim|uretim|veriş|veris/.test(b)) return "uretim";
  if (/tüketim|tuketim|çekiş|cekis/.test(b)) return "tuketim";
  return null;
}

const ABONE_GRUPLARI = {
  sanayi: "Sanayi",
  ticarethane: "Ticarethane",
  mesken: "Mesken",
  tarimsal: "Tarımsal sulama",
  aydinlatma: "Aydınlatma",
  diger: "Diğer",
};

const KAYNAK_TURLERI = { ges: "GES (güneş)", res: "RES (rüzgâr)", biyokutle: "Biyokütle / biyogaz",
  jes: "JES (jeotermal)", hes: "HES (hidroelektrik)", kojen: "Kojenerasyon", diger: "Diğer" };

const TESIS_BILGI_VARSAYILAN = {
  kaynak: "ges",
  kuruluGuc: null,          // kWp / kWe
  sozlesmeGucu: null,       // kW — tüketim tesisinin
  aboneGrubu: "sanayi",
  periyot: "saatlik",       // "saatlik" | "aylik" — mesken aylıktır
  olcumNoktasi: "ayni",     // "ayni" | "farkli"
  isletmeTarihi: "",        // "YYYY-AA"
  referansTuketim: null,    // kWh/yıl — boşsa bir önceki yılın tüketimi
  limitKatsayi: 2,
  not: "",
};

/** Abone grubu için yıllık 2× limit uygulanır mı? Mesken muaftır. */
function limitUygulanirMi(bilgi) {
  return (bilgi?.aboneGrubu ?? "sanayi") !== "mesken";
}

const TESIS_KOLONLARI = [
  { col: "A", header: "YIL", type: "year" },
  { col: "B", header: "AY", type: "month" },
  { col: "C", header: "Tüketim", birim: "kWh", type: "input", rol: "tuketim" },
  { col: "D", header: "Üretim", birim: "kWh", type: "input", rol: "uretim" },
  { col: "E", header: "Mahsuplaşan enerji", birim: "kWh", type: "input", rol: "mahsup" },
  { col: "F", header: "İhtiyaç fazlası enerji", birim: "kWh", type: "input", rol: "ihtiyacFazlasi" },
  { col: "G", header: "Aktif enerji birim fiyatı", birim: "TL/kWh", type: "formula",
    formula: "Fiyatlar!C", rol: "aktifFiyat" },
  { col: "H", header: "İhtiyaç fazlası birim fiyatı", birim: "TL/kWh", type: "formula",
    formula: "G", rol: "ifFiyat" },
  { col: "I", header: "İhtiyaç fazlası bedeli", birim: "TL", type: "input", rol: "ifBedel" },
  { col: "J", header: "Tedarikçi fatura tutarı", birim: "TL", type: "input", rol: "fatura" },
  { col: "K", header: "Açıklama", type: "text" },
];

const FIYAT_KOLONLARI = [
  { col: "A", header: "YIL", type: "year" },
  { col: "B", header: "AY", type: "month" },
  { col: "C", header: "Aktif enerji bedeli – Sanayi", birim: "TL/kWh", type: "input" },
  { col: "D", header: "Aktif enerji bedeli – Ticarethane", birim: "TL/kWh", type: "input" },
  { col: "E", header: "Aktif enerji bedeli – Mesken", birim: "TL/kWh", type: "input" },
  { col: "F", header: "Aktif enerji bedeli – Tarımsal sulama", birim: "TL/kWh", type: "input" },
  { col: "G", header: "YEKDEM fiyatı – Güneş", birim: "TL/kWh", type: "input" },
  { col: "H", header: "PTF aylık ortalama", birim: "TL/MWh", type: "input" },
  { col: "I", header: "10 yıl sonrası İF fiyatı (yaklaşık)", birim: "TL/kWh", type: "formula",
    formula: "MİN(G*0,9;H/1000)" },
  { col: "J", header: "Açıklama", type: "text" },
];

const BOS_KOLONLAR = [
  { col: "A", header: "YIL", type: "year" },
  { col: "B", header: "AY", type: "month" },
  { col: "C", header: "Değer", type: "input" },
];

/** Sekme şablonları — "Yeni sayfa" penceresinde seçilir. */
const SAYFA_SABLONLARI = {
  tesis: { ad: "Mahsuplaşma tesisi", tur: "tesis", kolonlar: TESIS_KOLONLARI,
           aciklama: "Tüketim, üretim, mahsuplaşan enerji, ihtiyaç fazlası ve bedeller. Hesaplanmış Değerler'de görünür." },
  fiyat: { ad: "Fiyat tablosu", tur: "genel", kolonlar: FIYAT_KOLONLARI,
           aciklama: "Aylık tarife, YEKDEM ve PTF değerleri. Tesis sekmeleri =Fiyatlar!C gibi başvurur." },
  bos:   { ad: "Boş sayfa", tur: "genel", kolonlar: BOS_KOLONLAR,
           aciklama: "Yalnızca YIL ve AY sütunlarıyla başlayan serbest tablo." },
};

function bosSatirOlustur(kolonListesi, yil, ay) {
  const s = { A: yil, B: ay };
  for (const c of kolonListesi) if (c.type === "input" || c.type === "text") s[c.col] = null;
  return s;
}

function donemSatirlari(kolonListesi, ilk = ILK_YIL, son = SON_YIL) {
  const out = [];
  for (let y = ilk; y <= son; y++) for (const ay of AYLAR) out.push(bosSatirOlustur(kolonListesi, y, ay));
  return out;
}

let sayfaSayaci = 0;
function yeniSayfaKimligi() {
  sayfaSayaci++;
  return `s${Date.now().toString(36)}${sayfaSayaci}`;
}

/** Şablondan yeni sekme nesnesi üretir. */
function sablondanSayfa(sablonAdi, ad, { ilk, son } = {}) {
  const sablon = SAYFA_SABLONLARI[sablonAdi] ?? SAYFA_SABLONLARI.bos;
  const kolonlar = structuredClone(sablon.kolonlar);
  return {
    id: yeniSayfaKimligi(),
    ad,
    tur: sablon.tur,
    sablon: sablonAdi,
    renk: null,
    kolonlar,
    satirlar: donemSatirlari(kolonlar, ilk, son),
    bilgi: sablon.tur === "tesis" ? { ...TESIS_BILGI_VARSAYILAN } : {},
  };
}

function varsayilanKitap() {
  const tesis = sablondanSayfa("tesis", "Tesis 1");
  const fiyat = sablondanSayfa("fiyat", "Fiyatlar");
  return { sayfalar: [tesis, fiyat], aktif: tesis.id, ondalik: 2 };
}

/** "Mayıs", "mayis", 5, "05" → 5; tanınmazsa null. */
function ayNumarasi(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isInteger(v) && v >= 1 && v <= 12 ? v : null;
  const t = String(v).trim();
  if (/^\d{1,2}$/.test(t)) {
    const n = Number(t);
    return n >= 1 && n <= 12 ? n : null;
  }
  const sade = (s) => s.toLocaleLowerCase("tr").replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" }[c]));
  const i = AYLAR.findIndex((a) => sade(a) === sade(t) || sade(a).slice(0, 3) === sade(t).slice(0, 3) && sade(t).length >= 3);
  return i >= 0 ? i + 1 : null;
}

/** Ayın saat sayısı — kapasite faktörü için. */
function aydakiSaat(yil, ayNo) {
  return new Date(yil, ayNo, 0).getDate() * 24;
}

if (typeof module !== "undefined") {
  module.exports = { AYLAR, MAHSUP_ROLLERI, ROL_ADI, rolTahmin, ayNumarasi, aydakiSaat,
                     limitUygulanirMi, TESIS_BILGI_VARSAYILAN, varsayilanKitap, sablondanSayfa };
}
