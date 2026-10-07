// Mahsuplaşma hesap motoru.
//
// Her tesis sekmesi için, her dönemde (yıl + ay) sekmedeki rollerden
// mahsuplaşma göstergelerini hesaplar. Roller sütunlara sütun menüsünden
// verilir (Tüketim, Üretim, Mahsuplaşan enerji…); motor sütun adlarına bakmaz.
//
// Kurallar (docs/BILGI_BANKASI.md):
//   M  = girilen mahsuplaşan enerji; yoksa aylık varsayım min(U, T)
//   İF = girilen ihtiyaç fazlası; yoksa U − M
//   Net çekiş = T − M
//   Yıllık limit = katsayı (2) × referans tüketim (önceki yılın tüketimi);
//   mahsuplaşan enerji ve satılan ihtiyaç fazlası limiti tüketir, limitten
//   sonra kalan ihtiyaç fazlası YEKDEM'e bedelsiz katkıdır. Mesken muaftır.
//   Limit ay sırasıyla uygulanır — saat sırası bilinmediği için yaklaşıktır.
//
// Göstergenin bir dönem aralığındaki değeri türüne göre bulunur:
//   toplam — dönem değerlerinin toplamı (kWh, TL)
//   oran   — pay ve paydanın aralık değerlerinin oranı (ortalamaların ortalaması alınmaz)
//   son    — aralıktaki son dolu dönemin değeri (yıl başından kümülatif büyüklükler)

const HESAP_DEPO = "mahsupla-hesap";

const HESAP_VARSAYILAN = {
  gorunum: "tesis",          // "tesis" | "matris"
  seciliTesis: "toplam",
  seciliGosterge: "mahsup",
  gizliGostergeler: [],
  gostergeSirasi: [],
  tesisSirasi: [],
  kaynakRozeti: false,
};

const hesapAyar = structuredClone(HESAP_VARSAYILAN);

/* ================= Göstergeler ================= */

const GOSTERGELER = [
  { id: "uretim", ad: "Üretim", birim: "kWh", basamak: 0, tur: "toplam", yon: "yuksek",
    roller: ["uretim"], deger: (d) => d.U,
    aciklama: "Lisanssız üretim tesisinin dönemdeki üretimi (Üretim rolündeki sütunların toplamı)." },
  { id: "tuketim", ad: "Tüketim", birim: "kWh", basamak: 0, tur: "toplam", yon: "dusuk",
    roller: ["tuketim"], deger: (d) => d.T,
    aciklama: "İlişkili tüketim tesis(ler)inin dönemdeki toplam tüketimi." },
  { id: "mahsup", ad: "Mahsuplaşan enerji", birim: "kWh", basamak: 0, tur: "toplam", yon: "yuksek",
    roller: ["mahsup", "uretim", "tuketim"], deger: (d) => d.M,
    aciklama: "Girilmişse saatlik mahsuplaşma sonucu; girilmemişse aylık mahsuplaşma varsayımıyla " +
      "min(üretim, tüketim). Saatlik mahsuplaşmada gerçek değer bu varsayımdan düşük olabilir." },
  { id: "ihtiyacFazlasi", ad: "İhtiyaç fazlası", birim: "kWh", basamak: 0, tur: "toplam",
    roller: ["ihtiyacFazlasi", "uretim"], deger: (d) => d.IF,
    aciklama: "Girilmişse faturadaki ihtiyaç fazlası; girilmemişse üretim − mahsuplaşan enerji." },
  { id: "netCekis", ad: "Şebekeden net çekiş", birim: "kWh", basamak: 0, tur: "toplam", yon: "dusuk",
    roller: ["tuketim"], deger: (d) => d.NC,
    aciklama: "Tüketimin üretimle karşılanamayan, tedarikçiden faturalanan kısmı: tüketim − mahsuplaşan enerji." },
  { id: "ozTuketim", ad: "Öz tüketim oranı", birim: "%", basamak: 1, tur: "oran", yon: "yuksek",
    pay: "mahsup", payda: "uretim", carpan: 100,
    aciklama: "Üretimin ne kadarının tüketimle mahsuplaştığı: mahsuplaşan / üretim × 100." },
  { id: "karsilama", ad: "Tüketimin karşılanma oranı", birim: "%", basamak: 1, tur: "oran", yon: "yuksek",
    pay: "mahsup", payda: "tuketim", carpan: 100,
    aciklama: "Tüketimin ne kadarının kendi üretimle karşılandığı: mahsuplaşan / tüketim × 100." },
  { id: "ifOrani", ad: "İhtiyaç fazlası oranı", birim: "%", basamak: 1, tur: "oran",
    pay: "ihtiyacFazlasi", payda: "uretim", carpan: 100,
    aciklama: "Üretimin şebekeye satılan (ya da bedelsiz verilen) kısmı: ihtiyaç fazlası / üretim × 100." },
  { id: "saatlikFark", ad: "Saatlik mahsuplaşma farkı", birim: "kWh", basamak: 0, tur: "toplam", yon: "dusuk",
    roller: ["mahsup", "uretim", "tuketim"], deger: (d) => d.fark,
    aciklama: "Aylık mahsuplaşma uygulansaydı fazladan mahsuplaşacak enerji: min(üretim, tüketim) − mahsuplaşan. " +
      "Yalnızca mahsuplaşan enerji girildiğinde hesaplanır; saatlik sisteme geçişin etkisini gösterir." },
  { id: "satilabilir", ad: "Satılabilir ihtiyaç fazlası", birim: "kWh", basamak: 0, tur: "toplam", yon: "yuksek",
    roller: ["ihtiyacFazlasi", "mahsup", "uretim", "tuketim"], deger: (d) => d.satilabilir,
    aciklama: "Yıllık limit içinde kalan, bedeli ödenen ihtiyaç fazlası." },
  { id: "bedelsiz", ad: "YEKDEM'e bedelsiz katkı", birim: "kWh", basamak: 0, tur: "toplam", yon: "dusuk",
    roller: ["ihtiyacFazlasi", "mahsup", "uretim", "tuketim"], deger: (d) => d.bedelsiz,
    aciklama: "Yıllık limiti aşan ihtiyaç fazlası; karşılığında ödeme yapılmaz." },
  { id: "yillikLimit", ad: "Yıllık limit", birim: "kWh", basamak: 0, tur: "son",
    roller: ["tuketim"], deger: (d) => d.limit,
    aciklama: "Limit katsayısı × referans tüketim. Referans, Tesis bilgilerinde girilmemişse bir önceki " +
      "takvim yılının tüketimidir. Mesken abone grubunda limit yoktur." },
  { id: "limitKullanimi", ad: "Limit kullanımı (yıl başından)", birim: "kWh", basamak: 0, tur: "son", yon: "dusuk",
    hedefId: "yillikLimit",
    roller: ["mahsup", "ihtiyacFazlasi", "uretim", "tuketim"], deger: (d) => d.kullanim,
    aciklama: "Yıl başından bu döneme kadar mahsuplaşan enerji + satılan ihtiyaç fazlası." },
  { id: "limitOrani", ad: "Limit kullanım oranı", birim: "%", basamak: 1, tur: "oran", yon: "dusuk",
    pay: "limitKullanimi", payda: "yillikLimit", carpan: 100,
    aciklama: "Yıllık limitin yıl başından bu yana kullanılan kısmı. %100'ü geçen ihtiyaç fazlası bedelsizdir." },
  { id: "ifGeliri", ad: "İhtiyaç fazlası geliri", birim: "TL", basamak: 2, tur: "toplam", yon: "yuksek",
    roller: ["ifBedel", "ifFiyat", "ihtiyacFazlasi"], deger: (d) => d.gelir,
    aciklama: "Faturadaki ihtiyaç fazlası bedeli; girilmemişse satılabilir ihtiyaç fazlası × birim fiyat." },
  { id: "kacinilan", ad: "Kaçınılan enerji maliyeti", birim: "TL", basamak: 2, tur: "toplam", yon: "yuksek",
    roller: ["aktifFiyat", "mahsup", "uretim", "tuketim"], deger: (d) => d.kacinilan,
    aciklama: "Mahsuplaşan enerjinin şebekeden alınsaydı ödenecek bedeli: mahsuplaşan × aktif enerji birim fiyatı." },
  { id: "fayda", ad: "Toplam fayda", birim: "TL", basamak: 2, tur: "toplam", yon: "yuksek",
    roller: ["ifBedel", "ifFiyat", "aktifFiyat"], deger: (d) => d.fayda,
    aciklama: "İhtiyaç fazlası geliri + kaçınılan enerji maliyeti." },
  { id: "birimFayda", ad: "Üretilen kWh başına fayda", birim: "TL/kWh", basamak: 3, tur: "oran", yon: "yuksek",
    pay: "fayda", payda: "uretim", carpan: 1,
    aciklama: "Toplam fayda / üretim." },
  { id: "fatura", ad: "Tedarikçi faturası", birim: "TL", basamak: 2, tur: "toplam", yon: "dusuk",
    roller: ["fatura"], deger: (d) => d.fatura,
    aciklama: "Tüketim tesisinin şebekeden çektiği enerji için ödenen fatura." },
  { id: "netGider", ad: "Net enerji gideri", birim: "TL", basamak: 2, tur: "toplam", yon: "dusuk",
    roller: ["fatura", "ifBedel", "ifFiyat"], deger: (d) => d.netGider,
    aciklama: "Tedarikçi faturası − ihtiyaç fazlası geliri." },
  { id: "teorikUretim", ad: "Teorik azami üretim", birim: "kWh", basamak: 0, tur: "toplam",
    roller: [], deger: (d) => d.teorik,
    aciklama: "Kurulu güç × aydaki saat. Kurulu güç Tesis bilgilerinden gelir." },
  { id: "kapasiteFaktoru", ad: "Kapasite faktörü", birim: "%", basamak: 1, tur: "oran", yon: "yuksek",
    pay: "uretimGucuBilinen", payda: "teorikUretim", carpan: 100,
    aciklama: "Üretim / (kurulu güç × saat) × 100. GES için yıllık %15–20 olağandır." },
  { id: "ozgulUretim", ad: "Özgül üretim", birim: "kWh/kWp", basamak: 1, tur: "oran", yon: "yuksek",
    pay: "uretimGucuBilinen", payda: "kuruluGucAy", carpan: 1,
    aciklama: "Üretim / kurulu güç. Bir yıllık aralıkta tesisin yıllık özgül üretimidir." },

  // Yardımcılar: tabloda görünmez, oranların pay ve paydasıdır
  { id: "uretimGucuBilinen", ad: "Üretim (kurulu gücü bilinen)", birim: "kWh", basamak: 0, tur: "toplam",
    yardimci: true, roller: ["uretim"], deger: (d) => (d.kWp ? d.U : null), aciklama: "" },
  { id: "kuruluGucAy", ad: "Kurulu güç", birim: "kWp", basamak: 1, tur: "son",
    yardimci: true, roller: [], deger: (d) => (d.U !== null && d.kWp ? d.kWp : null), aciklama: "" },
];

const GOSTERGE = Object.fromEntries(GOSTERGELER.map((g) => [g.id, g]));

/** Tabloda ve seçimlerde görünen göstergeler. */
function gorunurGostergeListesi() {
  return GOSTERGELER.filter((g) => !g.yardimci);
}

/* ================= Depolama ================= */

function hesapYukle() {
  try {
    const ham = localStorage.getItem(HESAP_DEPO);
    if (!ham) return;
    const v = JSON.parse(ham);
    if (!v || typeof v !== "object") return;
    Object.assign(hesapAyar, structuredClone(HESAP_VARSAYILAN), v);
    for (const a of ["gizliGostergeler", "gostergeSirasi", "tesisSirasi"]) {
      if (!Array.isArray(hesapAyar[a])) hesapAyar[a] = [];
    }
  } catch (e) {
    console.warn("Hesaplama ayarları okunamadı:", e);
  }
}

function hesapKaydet() {
  try {
    localStorage.setItem(HESAP_DEPO, JSON.stringify(hesapAyar));
  } catch (e) {
    console.warn(e);
  }
}

/* ================= Çekirdek ================= */

const say = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const topla = (...a) => {
  const s = a.filter((v) => v !== null);
  return s.length ? s.reduce((x, y) => x + y, 0) : null;
};

/**
 * Bir tesisin bütün dönemlerini hesaplar. Saf fonksiyon — testler doğrudan çağırır.
 * @param {object} bilgi          tesis bilgileri (kurulu güç, abone grubu, limit…)
 * @param {Array}  donemler       [{ no, yil, ayNo, anahtar }], takvim sırasıyla
 * @param {(rol, donem) => {deger, kolonlar}|null} rolOku  dönemin rol değeri
 * @returns {Array} her dönem için ayrıntı nesnesi; tesiste o dönem yoksa null
 */
function tesisDetaylariHesapla({ bilgi = {}, donemler, rolOku }) {
  const b = { ...TESIS_BILGI_VARSAYILAN, ...bilgi };
  const limitVar = limitUygulanirMi(b);
  const katsayi = say(b.limitKatsayi) ?? 2;
  const kWp = say(b.kuruluGuc) && b.kuruluGuc > 0 ? b.kuruluGuc : null;

  // 1) Dönem başına temel değerler
  const detaylar = donemler.map((p) => {
    const girdiler = {};
    let satirVar = false;
    for (const r of MAHSUP_ROLLERI) {
      const g = rolOku(r.anahtar, p);
      if (g) satirVar = satirVar || g.satirVar;
      girdiler[r.anahtar] = g ?? { deger: null, kolonlar: [] };
    }
    if (!satirVar) return null;
    const v = (rol) => girdiler[rol].deger;

    const U = v("uretim");
    const T = v("tuketim");
    const Mg = v("mahsup");
    const IFg = v("ihtiyacFazlasi");
    const notlar = [];

    let M = Mg;
    if (M === null && U !== null && T !== null) {
      M = Math.min(U, T);
      notlar.push(b.periyot === "saatlik"
        ? "Mahsuplaşan enerji girilmemiş; aylık varsayımla min(üretim, tüketim) alındı. Saatlik mahsuplaşmada gerçek değer daha düşüktür — faturadaki değeri girin."
        : "Mahsuplaşan enerji girilmemiş; aylık mahsuplaşma kuralıyla min(üretim, tüketim) alındı.");
    }
    let IF = IFg;
    if (IF === null && U !== null && M !== null) {
      IF = Math.max(U - M, 0);
      notlar.push("İhtiyaç fazlası girilmemiş; üretim − mahsuplaşan enerji alındı.");
    }
    const NC = T !== null && M !== null ? Math.max(T - M, 0) : null;
    const fark = Mg !== null && U !== null && T !== null ? Math.max(Math.min(U, T) - Mg, 0) : null;
    const teorik = kWp ? kWp * aydakiSaat(p.yil, p.ayNo) : null;

    return {
      donem: p, girdiler, notlar, kWp,
      U, T, Mg, M, IFg, IF, NC, fark, teorik,
      aktifFiyat: v("aktifFiyat"), ifFiyat: v("ifFiyat"), ifBedelG: v("ifBedel"), fatura: v("fatura"),
      limit: null, kullanim: null, satilabilir: null, bedelsiz: null,
      gelir: null, kacinilan: null, fayda: null, netGider: null,
    };
  });

  // 2) Referans tüketim: yıllık toplamlar
  const yillikTuketim = new Map();
  for (const d of detaylar) {
    if (!d || d.T === null) continue;
    yillikTuketim.set(d.donem.yil, (yillikTuketim.get(d.donem.yil) ?? 0) + d.T);
  }
  const referans = (yil) => say(b.referansTuketim) ?? (yillikTuketim.get(yil - 1) || null);

  // 3) Limit — takvim yılı içinde ay sırasıyla
  let yil = null;
  let kullanim = 0;
  for (const d of detaylar) {
    if (!d) continue;
    if (d.donem.yil !== yil) { yil = d.donem.yil; kullanim = 0; }
    const IF = d.IF;
    if (!limitVar) {
      d.satilabilir = IF;
      d.bedelsiz = IF === null ? null : 0;
    } else {
      const ref = referans(yil);
      d.limit = ref ? katsayi * ref : null;
      const M = d.M ?? 0;
      if (d.limit === null) {
        d.satilabilir = IF;
        d.bedelsiz = IF === null ? null : 0;
        if (IF) d.notlar.push("Yıllık limit hesaplanamadı (önceki yılın tüketimi yok, referans tüketim de girilmemiş); ihtiyaç fazlasının tamamı satılabilir sayıldı.");
      } else {
        const kalan = d.limit - kullanim - M;
        d.satilabilir = IF === null ? null : Math.min(IF, Math.max(kalan, 0));
        d.bedelsiz = IF === null ? null : IF - d.satilabilir;
        if (d.bedelsiz > 0) d.notlar.push("Yıllık limit aşıldı; limiti aşan ihtiyaç fazlası YEKDEM'e bedelsiz katkı sayıldı.");
      }
      if (d.M !== null || d.satilabilir !== null) {
        kullanim += M + (d.satilabilir ?? 0);
        d.kullanim = kullanim;
      }
    }

    // 4) Parasal değerler
    if (d.ifBedelG !== null) d.gelir = d.ifBedelG;
    else if (d.ifFiyat !== null && d.satilabilir !== null) d.gelir = d.satilabilir * d.ifFiyat;
    d.kacinilan = d.M !== null && d.aktifFiyat !== null ? d.M * d.aktifFiyat : null;
    d.fayda = topla(d.gelir, d.kacinilan);
    d.netGider = d.fatura !== null ? d.fatura - (d.gelir ?? 0) : null;
  }
  return detaylar;
}

/* ================= Veri sayfasından okuma ================= */

/** Bir sekmenin rol → sütun eşlemesi. */
function rolKolonlari(sayfaId) {
  const harita = {};
  for (const c of sayfaKolonlari(sayfaId)) {
    if (!c.rol || c.type === "text" || c.type === "year" || c.type === "month") continue;
    (harita[c.rol] ??= []).push(c);
  }
  return harita;
}

function sayfaRolOkuyucu(sayfaId) {
  const harita = rolKolonlari(sayfaId);
  return (rol, donem) => {
    const satirNo = donemSatiri(sayfaId, donem.anahtar);
    if (!satirNo) return null;
    const tanim = ROL_ADI[rol];
    const kolonlar = (harita[rol] ?? []).map((c) => {
      const v = sayfaDegeri(sayfaId, c.col, satirNo);
      return { col: c.col, header: c.header, birim: c.birim, satirNo, deger: say(v),
               ham: v && typeof v === "object" ? v.hata : v };
    });
    const sayilar = kolonlar.map((k) => k.deger).filter((v) => v !== null);
    let deger = null;
    if (sayilar.length) deger = tanim?.toplanir ? sayilar.reduce((a, x) => a + x, 0) : sayilar[0];
    return { deger, kolonlar, satirVar: true };
  };
}

/* ================= Sonuç önbelleği ================= */

let sonucOnbellegi = null;   // { damga, donemler, tesisler: Map(id -> { sayfa, detaylar }) }

function mahsupSonucu() {
  const d = damga();
  if (sonucOnbellegi?.damga === d) return sonucOnbellegi;
  const donemler = donemleriAl();
  const tesisler = new Map();
  for (const s of tesisSayfalariAl()) {
    tesisler.set(s.id, {
      sayfa: s,
      detaylar: tesisDetaylariHesapla({ bilgi: s.bilgi, donemler, rolOku: sayfaRolOkuyucu(s.id) }),
    });
  }
  sonucOnbellegi = { damga: d, donemler, tesisler, degerler: new Map() };
  return sonucOnbellegi;
}

function onbellekleriBosalt() { sonucOnbellegi = null; }

/** Hesap birimleri: önce bütün tesislerin toplamı, sonra her tesis sekmesi. */
function hesapTesisleri() {
  const s = mahsupSonucu();
  return [
    { id: "toplam", ad: "Tüm tesisler (toplam)", toplam: true },
    ...[...s.tesisler.values()].map((t) => ({ id: t.sayfa.id, ad: t.sayfa.ad, bilgi: t.sayfa.bilgi })),
  ];
}

function hesapTesisi(id) {
  return hesapTesisleri().find((t) => t.id === id) ?? null;
}

/** Göstergenin dönem değeri. */
function gostergeDegeri(tesisId, gostergeId, donemNo) {
  const s = mahsupSonucu();
  const g = GOSTERGE[gostergeId];
  if (!g) return null;
  const anahtar = `${tesisId}|${gostergeId}|${donemNo}`;
  if (s.degerler.has(anahtar)) return s.degerler.get(anahtar);

  let v = null;
  if (g.tur === "oran") {
    const pay = gostergeDegeri(tesisId, g.pay, donemNo);
    const payda = gostergeDegeri(tesisId, g.payda, donemNo);
    v = pay !== null && payda ? (pay / payda) * g.carpan : null;
  } else if (tesisId === "toplam") {
    v = topla(...[...s.tesisler.keys()].map((id) => gostergeDegeri(id, gostergeId, donemNo)));
  } else {
    const d = s.tesisler.get(tesisId)?.detaylar[donemNo - 1];
    v = d ? say(g.deger(d)) : null;
  }
  s.degerler.set(anahtar, v);
  return v;
}

/** Göstergenin bütün dönemlerdeki değerleri (donemleriAl() sırasıyla). */
function gostergeSerisi(tesisId, gostergeId) {
  return mahsupSonucu().donemler.map((p) => gostergeDegeri(tesisId, gostergeId, p.no));
}

/** Bir dönem aralığının (dönem numaraları) değeri — gösterge türüne göre. */
function aralikDegeri(tesisId, gostergeId, nolar) {
  const g = GOSTERGE[gostergeId];
  if (!g || !nolar?.length) return null;
  if (g.tur === "oran") {
    const pay = aralikDegeri(tesisId, g.pay, nolar);
    const payda = aralikDegeri(tesisId, g.payda, nolar);
    return pay !== null && payda ? (pay / payda) * g.carpan : null;
  }
  if (g.tur === "son") {
    for (let i = nolar.length - 1; i >= 0; i--) {
      const v = gostergeDegeri(tesisId, gostergeId, nolar[i]);
      if (v !== null) return v;
    }
    return null;
  }
  return topla(...nolar.map((no) => gostergeDegeri(tesisId, gostergeId, no)));
}

/** Hedef tanımlı göstergenin hedefi (limit kullanımı → yıllık limit). */
function gostergeHedefi(tesisId, gostergeId, nolar) {
  const g = GOSTERGE[gostergeId];
  return g?.hedefId ? aralikDegeri(tesisId, g.hedefId, nolar) : null;
}

/* ================= Biçimlendirme ================= */

const hesapBicimOnbellegi = new Map();
function hesapBicimle(v, basamak = 2) {
  if (v === null || v === undefined) return "";
  if (!hesapBicimOnbellegi.has(basamak)) {
    hesapBicimOnbellegi.set(basamak, new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: basamak, maximumFractionDigits: basamak,
    }));
  }
  return hesapBicimOnbellegi.get(basamak).format(v);
}

/* ================= İzlenebilirlik ================= */

/** Göstergenin dayandığı roller — oranlarda pay ve paydanınkiler. */
function gostergeRolleri(gostergeId, gorulen = new Set()) {
  const g = GOSTERGE[gostergeId];
  if (!g || gorulen.has(gostergeId)) return [];
  gorulen.add(gostergeId);
  if (g.tur === "oran") {
    return [...new Set([...gostergeRolleri(g.pay, gorulen), ...gostergeRolleri(g.payda, gorulen)])];
  }
  return g.roller ?? [];
}

/** Bir hücrenin hesabını, okuduğu verilerle birlikte döndürür. */
function izleriAl(tesisId, gostergeId, donemNo) {
  const s = mahsupSonucu();
  const g = GOSTERGE[gostergeId];
  const donem = s.donemler[donemNo - 1];
  if (!g || !donem) return null;
  const sonuc = gostergeDegeri(tesisId, gostergeId, donemNo);

  if (tesisId === "toplam") {
    const dokum = [...s.tesisler.values()].map((t) => ({
      tesis: t.sayfa, deger: gostergeDegeri(t.sayfa.id, gostergeId, donemNo),
    }));
    return { toplam: true, gosterge: g, donem, sonuc, dokum };
  }

  const t = s.tesisler.get(tesisId);
  if (!t) return null;
  const d = t.detaylar[donemNo - 1];
  const roller = gostergeRolleri(gostergeId);
  const girdiler = roller.map((rol) => ({
    rol, tanim: ROL_ADI[rol],
    kolonlar: d?.girdiler[rol]?.kolonlar ?? [],
    deger: d?.girdiler[rol]?.deger ?? null,
  }));
  const ara = d ? [
    ["Mahsuplaşan enerji", d.M, "kWh"], ["İhtiyaç fazlası", d.IF, "kWh"],
    ["Satılabilir ihtiyaç fazlası", d.satilabilir, "kWh"], ["Bedelsiz katkı", d.bedelsiz, "kWh"],
    ["Yıllık limit", d.limit, "kWh"], ["Limit kullanımı (yıl başından)", d.kullanim, "kWh"],
  ] : [];
  return { toplam: false, tesis: t.sayfa, gosterge: g, donem, sonuc, girdiler, notlar: d?.notlar ?? [],
           ara, satirVar: !!d };
}

/** Göstergenin beslendiği sütunlar ("C, D") — başlık rozeti için. */
function gostergeKaynaklari(tesisId, gostergeId) {
  if (tesisId === "toplam") return [];
  const harita = rolKolonlari(tesisId);
  return gostergeRolleri(gostergeId).flatMap((r) => (harita[r] ?? []).map((c) => c.col));
}

function motorKur() {
  hesapYukle();
  document.addEventListener("veri-degisti", onbellekleriBosalt);
}

if (typeof module !== "undefined") {
  module.exports = { tesisDetaylariHesapla, GOSTERGELER };
}
