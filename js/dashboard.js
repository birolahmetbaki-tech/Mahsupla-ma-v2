// Dashboard: serbest yerleşimli pencerelerden (widget) oluşan tuval.
//
// Pencereler sürüklenerek taşınır, köşe tutamacıyla boyutlandırılır, boş
// alana basılı tutup tuval gezdirilir, Z tuşu basılıyken tekerlekle yakınlaşılır.
//
// Her pencere bir değişkene bağlanır. Değişken havuzu js/degisken.js'tedir:
// veri sekmelerinin sütunları ve tesislerin hesaplanmış mahsuplaşma
// göstergeleri aynı havuzda olduğu için pencere hangisine bağlandığını
// bilmek zorunda değildir.


const PANO_DEPO = "mahsupla-pano";
const PANO_SURUM = 2;

const PANO_IZGARA = 10;
const PANO_EN_KUCUK_EN = 160;
const PANO_EN_KUCUK_BOY = 90;
const PANO_EN_KUCUK_ZUM = 0.4;
const PANO_EN_BUYUK_ZUM = 2.5;

/* ================= Pencere türleri ================= */

const PENCERE_TURLERI = {
  kart:   { ad: "Değer kartı",   en: 260, boy: 130, coklu: true,
            aciklama: "Dönem toplamı ve önceki döneme göre değişim; birden çok değişken seçilirse hepsi aynı kartta alt alta listelenir" },
  cizgi:  { ad: "Çizgi grafik",  en: 560, boy: 280, coklu: true,
            aciklama: "Seçilen değişkenlerin dönem dönem seyri" },
  cubuk:  { ad: "Sıralı çubuk",  en: 420, boy: 300, coklu: true,
            aciklama: "Değişkenleri dönem toplamına göre sıralar" },
  kiyas:  { ad: "Dönem kıyası",  en: 560, boy: 300, coklu: true,
            aciklama: "Bu dönem ile önceki dönemi yan yana koyar" },
  pasta:  { ad: "Pasta (halka)", en: 520, boy: 270, coklu: true,
            aciklama: "Bütünün parçalarını gösterir; aynı birimden en çok altı kalem" },
  yillik: { ad: "Yıllık toplam", en: 560, boy: 300, coklu: true,
            aciklama: "Seçilen göstergeleri yıl yıl toplayıp karşılaştırır" },
  gauge:  { ad: "Hedef göstergesi", en: 260, boy: 180, coklu: false,
            aciklama: "Değeri varlığın hedefiyle karşılaştırır" },
  tablo:  { ad: "Tablo",         en: 520, boy: 300, coklu: true,
            aciklama: "Dönem dönem değerler" },
  ongoru: { ad: "Öngörü",        en: 620, boy: 300, coklu: false,
            aciklama: "Bir değişkenin geçmişi ve önümüzdeki dönemlere ait tahmini" },
  metin:  { ad: "Not",           en: 300, boy: 140, coklu: false,
            aciklama: "Serbest açıklama metni" },
};

/* ================= Veri etiketleri ================= */

/*
 * Excel'deki "veri etiketi" karşılığı: serinin adı, değeri ve yüzdesinden
 * hangilerinin grafikte görüneceğini ve nerede duracağını kullanıcı seçer.
 * Görünen ad ve değer elle de yazılabilir — uzun tesis adlarını
 * kısaltmak ya da bir kalemi başka bir adla sunmak için.
 */
const VERI_ETIKETI_VARSAYILAN = {
  alanlar: { ad: true, deger: true, yuzde: true, birim: false },
  konum: null,        // null → pencere türünün varsayılanı
  ayirac: " · ",
  seriler: {},        // değişken anahtarı -> { ad, deger }
};

/** Pencere türüne göre etiket konumu seçenekleri. */
const VERI_ETIKETI_KONUMLARI = {
  pasta: [["yan", "Yanda liste"], ["ust", "Üstte liste"], ["alt", "Altta liste"],
          ["ic", "Dilimin içinde"], ["dis", "Dilimin dışında"], ["yok", "Gösterme"]],
  cubuk: [["uc", "Çubuğun ucunda"], ["ust", "Üstte liste"], ["alt", "Altta liste"], ["yok", "Gösterme"]],
  cizgi: [["yok", "Gösterme"], ["son", "Son noktada"], ["tum", "Tüm noktalarda"],
          ["ust", "Üstte liste"], ["alt", "Altta liste"]],
  kiyas: [["uc", "Çubuğun ucunda"], ["ust", "Üstte liste"], ["alt", "Altta liste"], ["yok", "Gösterme"]],
  yillik: [["uc", "Çubuğun ucunda"], ["ust", "Üstte liste"], ["alt", "Altta liste"], ["yok", "Gösterme"]],
};

/** Liste konumları grafiğin dışında, kendi satırında durur. */
const LISTE_KONUMLARI = new Set(["ust", "alt"]);

/**
 * Seri listesi: renk kutucuğu, ad, değer ve yüzde. Grafiğin üstüne ya da
 * altına konur; pastadaki yan listenin aynısıdır, bu yüzden aynı biçimi
 * kullanır.
 */
function veriListesiHtml(ogeler, ayar, birim = "", { yuzdeAnlamli = true } = {}) {
  const gecerli = ogeler.filter((o) => o.deger !== null && o.deger !== undefined);
  if (!gecerli.length) return "";

  /*
   * Yüzde ancak kalemler aynı birimdeyse ve bir bütünün parçalarıysa
   * anlamlıdır. kWh ile kWh/kg'ı toplayıp pay çıkarmak "%100 / %0" gibi
   * saçma sonuç verir, bu yüzden böyle durumlarda yüzde yazılmaz.
   */
  const birimler = new Set(gecerli.map((o) => (o.birim ?? birim ?? "").trim()).filter(Boolean));
  const yuzdeVer = ayar.alanlar.yuzde && yuzdeAnlamli && birimler.size <= 1;
  const toplam = gecerli.reduce((a, o) => a + Math.abs(o.deger), 0);

  // Hepsinde ortak olan tesis öneki yeri boşuna doldurur
  const onek = gecerli[0].ad.includes(" · ") ? gecerli[0].ad.split(" · ")[0] + " · " : null;
  const ortak = onek && gecerli.every((o) => o.ad.startsWith(onek)) ? onek : null;

  return `<ul class="pasta-lejant yatay veri-listesi">${gecerli.map((o, i) => {
    const renk = o.renk ?? SERI_RENKLERI[i % SERI_RENKLERI.length];
    const yuzde = toplam ? ((Math.abs(o.deger) / toplam) * 100).toFixed(1) : null;
    const ad = ortak ? o.ad.slice(ortak.length) : o.ad;
    return `<li><i style="background:${renk}"></i>
      ${ayar.alanlar.ad ? `<span class="pasta-ad" title="${kacisla(o.ad)}">${kacisla(ad)}</span>` : ""}
      ${ayar.alanlar.deger ? `<b>${kacisla(o.gorunenDeger ?? kompaktSayi(o.deger))}${
        ayar.alanlar.birim && (o.birim || birim) ? " " + kacisla(o.birim || birim) : ""}</b>` : ""}
      ${yuzdeVer && yuzde !== null ? `<em>%${yuzde}</em>` : ""}</li>`;
  }).join("")}</ul>`;
}

/** Grafiği listeyle birlikte, konuma göre sıralanmış olarak döndürür. */
function listeyleSar(konum, liste, cizim) {
  if (konum === "ust") return liste + cizim;
  if (konum === "alt") return cizim + liste;
  return cizim;
}

/** Liste için ayrılan yükseklik — grafiğe kalan yer bu kadar azalır. */
const listePayi = (konum, adet) =>
  (LISTE_KONUMLARI.has(konum) ? Math.min(74, 18 + Math.ceil(adet / 2) * 17) : 0);

const VERI_ETIKETI_ONTANIMI = { pasta: "yan", cubuk: "uc", cizgi: "yok", kiyas: "uc", yillik: "uc" };

/*
 * Alan varsayılanları da türe göre değişir: gruplu çubukta ve çizgide seri
 * adı zaten göstergede (lejantta) yazdığı için her çubuğun üstüne
 * tekrarlanmaz — tekrarlandığında metin çubuğa sığmaz ve hiç yazılmaz.
 */
const VERI_ETIKETI_ALANLARI = {
  kiyas:  { ad: false, deger: true, yuzde: false, birim: false },
  yillik: { ad: false, deger: true, yuzde: false, birim: false },
  cizgi:  { ad: false, deger: true, yuzde: false, birim: false },
};

/** Pencerenin veri etiketi ayarı, varsayılanlarla tamamlanmış hâlde. */
function veriEtiketiAyari(p) {
  const ham = p.veriEtiketi ?? {};
  const turAlanlari = VERI_ETIKETI_ALANLARI[p.tur] ?? VERI_ETIKETI_VARSAYILAN.alanlar;
  return {
    ...VERI_ETIKETI_VARSAYILAN,
    ...ham,
    alanlar: { ...turAlanlari, ...(ham.alanlar ?? {}) },
    seriler: { ...(ham.seriler ?? {}) },
    konum: ham.konum ?? VERI_ETIKETI_ONTANIMI[p.tur] ?? "yok",
  };
}

/** Elle düzeltilmiş ad ve değerleri grafiğe verilecek öğelere işler. */
function seriyiGiydir(anahtar, ogeler, ayar) {
  const elle = ayar.seriler[anahtar];
  if (!elle) return ogeler;
  return { ...ogeler, gorunenAd: elle.ad || undefined, gorunenDeger: elle.deger || undefined };
}

/* ================= Serbest etiketler ================= */

/*
 * Her pencerenin üzerine serbest yerleştirilebilen etiketler konabilir.
 * Etiketin metni bir kalıptır; içindeki {deger}, {ad}, {birim} ve {donem}
 * yerine hesaplanan değerler geçer. Kullanıcı kalıbı istediği gibi
 * değiştirebilir, tamamen kendi yazdığı bir not da ekleyebilir.
 *
 * Konum, pencere içeriğinin yüzdesi olarak saklanır; pencere yeniden
 * boyutlandırıldığında etiket oranını koruyarak yerinde kalır.
 */
const ETIKET_KAYNAKLARI = {
  ozel:      { ad: "Serbest metin", kalip: "Not", hesapla: () => null },
  sonDeger:  { ad: "Son dönem değeri", kalip: "Son: {deger} {birim}" },
  ilkDeger:  { ad: "İlk dönem değeri", kalip: "İlk: {deger} {birim}" },
  enYuksek:  { ad: "En yüksek", kalip: "En yüksek: {deger} {birim}" },
  enDusuk:   { ad: "En düşük", kalip: "En düşük: {deger} {birim}" },
  ortalama:  { ad: "Ortalama", kalip: "Ortalama: {deger} {birim}" },
  toplam:    { ad: "Dönem toplamı", kalip: "Toplam: {deger} {birim}" },
  degisim:   { ad: "Önceki döneme göre değişim", kalip: "Değişim: {deger}" },
  hedef:     { ad: "Hedef", kalip: "Hedef: {deger} {birim}" },
  donem:     { ad: "Dönem aralığı", kalip: "{donem}" },
  ad:        { ad: "Değişken adı", kalip: "{ad}" },
};

/** Hazır yerleşimler — sürüklemeye gerek kalmadan köşeye oturtmak için. */
const ETIKET_KONUMLARI = {
  solUst:   { ad: "Sol üst",   x: 4,  y: 4 },
  ustOrta:  { ad: "Üst orta",  x: 34, y: 4 },
  sagUst:   { ad: "Sağ üst",   x: 62, y: 4 },
  solAlt:   { ad: "Sol alt",   x: 4,  y: 84 },
  altOrta:  { ad: "Alt orta",  x: 34, y: 84 },
  sagAlt:   { ad: "Sağ alt",   x: 62, y: 84 },
};

/** Etiketin hangi hazır konuma oturduğu; sürüklendiyse "elle". */
function etiketKonumu(e) {
  const eslesen = Object.entries(ETIKET_KONUMLARI)
    .find(([, k]) => Math.abs(k.x - e.x) < 0.5 && Math.abs(k.y - e.y) < 0.5);
  return eslesen ? eslesen[0] : "elle";
}

/** Pencere türüne göre anlamlı etiket kaynakları. */
function etiketSecenekleri(tur) {
  const ortak = ["ozel", "donem", "ad"];
  const seri = ["sonDeger", "ilkDeger", "enYuksek", "enDusuk", "ortalama", "toplam", "degisim"];
  if (tur === "cizgi" || tur === "tablo") return [...seri, ...ortak];
  if (tur === "kart" || tur === "gauge") return ["sonDeger", "toplam", "degisim", "hedef", ...ortak];
  if (tur === "cubuk" || tur === "pasta" || tur === "kiyas") return ["toplam", "degisim", ...ortak];
  return ortak;
}

/** Etiketin {deger} yerine geçecek sayısı ve birimi. */
function etiketDegeri(kaynak, p, ctx) {
  const anahtar = p.degiskenler[0];
  const d = degiskenAl(anahtar);
  if (kaynak === "donem") return { metin: ctx.donemMetni };
  if (kaynak === "ad") return { metin: d?.tamAd ?? "—" };
  if (!d) return null;

  const bicim = (v) => (v === null ? "—" : pDeger(anahtar, v));

  if (kaynak === "toplam" || kaynak === "sonDeger" || kaynak === "ilkDeger"
      || kaynak === "enYuksek" || kaynak === "enDusuk" || kaynak === "ortalama") {
    if (kaynak === "toplam") return { metin: bicim(degiskenAraligi(anahtar, ctx.nolar)), birim: d.birim };
    const seri = degiskenSerisi(anahtar, ctx.satirlar).filter((v) => v !== null);
    if (!seri.length) return { metin: "—", birim: d.birim };
    const deger = {
      sonDeger: seri[seri.length - 1],
      ilkDeger: seri[0],
      enYuksek: Math.max(...seri),
      enDusuk: Math.min(...seri),
      ortalama: seri.reduce((a, v) => a + v, 0) / seri.length,
    }[kaynak];
    return { metin: bicim(deger), birim: d.birim };
  }

  if (kaynak === "degisim") {
    const simdi = degiskenAraligi(anahtar, ctx.nolar);
    const once = ctx.oncekiNolar.length ? degiskenAraligi(anahtar, ctx.oncekiNolar) : null;
    if (simdi === null || once === null || !once) return { metin: "—" };
    const fark = ((simdi - once) / Math.abs(once)) * 100;
    return { metin: `${fark >= 0 ? "▲" : "▼"} %${Math.abs(fark).toFixed(1)}` };
  }

  if (kaynak === "hedef") {
    const h = pSayi(p.ayar?.hedef) ?? degiskenHedefi(anahtar, ctx.nolar)?.deger ?? null;
    return h === null ? { metin: "tanımsız" } : { metin: bicim(h), birim: d.birim };
  }
  return null;
}

/** Kalıptaki yer tutucuları doldurur. */
function etiketMetni(etiket, p, ctx) {
  const kalip = etiket.kalip ?? ETIKET_KAYNAKLARI[etiket.kaynak]?.kalip ?? "";
  if (etiket.kaynak === "ozel") return kalip;
  const v = etiketDegeri(etiket.kaynak, p, ctx);
  const d = degiskenAl(p.degiskenler[0]);
  return kalip
    .replaceAll("{deger}", v?.metin ?? "—")
    .replaceAll("{birim}", v?.birim ?? d?.birim ?? "")
    .replaceAll("{ad}", d?.tamAd ?? "")
    .replaceAll("{donem}", ctx.donemMetni ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Etiketleri pencerenin üzerine yerleştirir. */
function etiketleriCiz(p, ctx) {
  const etiketler = p.etiketler ?? [];
  if (!etiketler.length) return "";
  return etiketler.map((e) => {
    const metin = etiketMetni(e, p, ctx);
    if (!metin) return "";
    return `<span class="pano-etiket${e.vurgu ? " vurgulu" : ""}" data-etiket="${e.id}"
                  style="left:${e.x}%; top:${e.y}%"
                  title="Sürükleyerek taşıyın">${kacisla(metin)}</span>`;
  }).join("");
}

/* ================= Durum ================= */

const PANO_VARSAYILAN = {
  surum: PANO_SURUM,
  bas: null, son: null, hazir: "son12",
  zum: 1,
  olcek: "sigdir",     // "sigdir" → panoyu ekran genişliğine uydur, "elle" → sabit yüzde
  pencereler: [],
  sonrakiNo: 1,
};

let panoAyar = structuredClone(PANO_VARSAYILAN);
let panoBekliyor = false;
let panoKuruldu = false;

let panoSurukleme = null;
let etiketSurukleme = null;
let panoBoyutlandirma = null;
let panoKaydirma = null;
let panoKaydirmaOldu = false;
let panoZBasili = false;

const pSayi = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const panoTuval = () => document.getElementById("panoTuval");
const panoKatman = () => document.getElementById("panoKatman");

/* ================= Depolama ================= */

function panoYukle() {
  try {
    const ham = localStorage.getItem(PANO_DEPO);
    if (ham) {
      const v = JSON.parse(ham);
      panoAyar = { ...structuredClone(PANO_VARSAYILAN), ...v };
      if (!Array.isArray(panoAyar.pencereler)) panoAyar.pencereler = [];
    }
  } catch (e) {
    console.warn("Dashboard ayarları okunamadı:", e);
  }
  if (!panoAyar.pencereler.length) varsayilanPanoyuKur();
  return panoAyar;
}

function panoKaydet() {
  try {
    localStorage.setItem(PANO_DEPO, JSON.stringify(panoAyar));
  } catch (e) {
    console.warn(e);
  }
}

/**
 * Boş panoyu bütün tesislerin toplam mahsuplaşma göstergeleriyle doldurur.
 * Toplam her zaman vardır; tek tesis olduğunda o tesisin değerleridir.
 */
function varsayilanPanoyuKur() {
  const g = (id) => `g:toplam::${id}`;
  const ekle = (tur, x, y, degiskenler, baslik, en, boy) => {
    const t = PENCERE_TURLERI[tur];
    panoAyar.pencereler.push({
      id: `p${panoAyar.sonrakiNo++}`, tur, x, y, en: en ?? t.en, boy: boy ?? t.boy,
      baslik: baslik ?? null, degiskenler, ayar: {}, etiketler: [],
    });
  };

  ekle("kart", 20, 20, [g("uretim")], "Üretim");
  ekle("kart", 300, 20, [g("mahsup")], "Mahsuplaşan enerji");
  ekle("kart", 580, 20, [g("ozTuketim")], "Öz tüketim oranı");
  ekle("kart", 860, 20, [g("fayda")], "Toplam fayda");
  ekle("cizgi", 20, 170, [g("uretim"), g("tuketim"), g("mahsup")], "Üretim, tüketim ve mahsuplaşma");
  ekle("pasta", 600, 170, [g("mahsup"), g("satilabilir"), g("bedelsiz")], "Üretimin dağılımı", 540, 280);
  ekle("kiyas", 20, 470, [g("mahsup"), g("ihtiyacFazlasi"), g("netCekis")],
       "Enerji dengesi — bu dönem / önceki dönem");
  ekle("gauge", 600, 470, [g("limitKullanimi")], "Yıllık 2× limit kullanımı", 300, 180);
  ekle("yillik", 20, 790, [g("ifGeliri"), g("kacinilan")], "Yıllık fayda (TL)");
}

/* ================= Dönem ================= */

/** Verisi girilmiş son dönemin sıra numarası (toplam üretim ya da tüketim). */
function sonDoluDonem(satirlar) {
  const uretim = gostergeSerisi("toplam", "uretim");
  const tuketim = gostergeSerisi("toplam", "tuketim");
  for (let i = satirlar.length - 1; i >= 0; i--) {
    const no = satirlar[i].no;
    if (uretim[no - 1] || tuketim[no - 1]) return no;
  }
  return satirlar.length;
}

function donemAral() {
  const satirlar = mahsupSonucu().donemler;
  if (!satirlar.length) return { satirlar: [], oncekiSatirlar: [], hepsi: [] };
  const son = panoAyar.son ?? sonDoluDonem(satirlar);

  let bas = panoAyar.bas;
  if (bas === null) {
    const uzunluk = { son12: 12, son24: 24, son36: 36 }[panoAyar.hazir] ?? satirlar.length;
    bas = Math.max(1, son - uzunluk + 1);
  }
  const altSinir = Math.min(bas, son);
  const ustSinir = Math.max(bas, son);
  const uzunluk = ustSinir - altSinir + 1;

  return {
    satirlar: satirlar.filter((s) => s.no >= altSinir && s.no <= ustSinir),
    oncekiSatirlar: satirlar.filter((s) => s.no >= altSinir - uzunluk && s.no < altSinir),
    bas: altSinir, son: ustSinir, hepsi: satirlar,
  };
}

/* ================= Biçimlendirme ================= */

function degisimRozeti(simdi, onceki, { dusukIyi = true } = {}) {
  if (simdi === null || onceki === null || !onceki) {
    return `<span class="fark yok">önceki dönem yok</span>`;
  }
  const fark = ((simdi - onceki) / Math.abs(onceki)) * 100;
  const artis = fark > 0;
  const iyiMi = dusukIyi ? !artis : artis;
  const sinif = Math.abs(fark) < 0.5 ? "esit" : iyiMi ? "iyi" : "kotu";
  return `<span class="fark ${sinif}">${artis ? "▲" : "▼"} %${Math.abs(fark).toFixed(1)}
          <em>önceki döneme göre</em></span>`;
}

/** Değişkenin kendi basamak sayısıyla biçimlendirir. */
function pDeger(anahtar, deger) {
  const d = degiskenAl(anahtar);
  if (deger === null) return "—";
  if (d?.tur === "gosterge") return hesapBicimle(deger, d.basamak ?? 2);
  return sayiBicimle(deger);
}

/* ================= Pencere içerikleri ================= */

/**
 * Öngörü penceresinin ayarları. Sürücü değişkenler aynı değişken
 * havuzundan seçilir.
 */
function ongoruAyarlari(p) {
  const a = p.ayar ?? {};
  const yillar = [...new Set(mahsupSonucu().donemler.map((s) => s.yil))];
  const model = a.model === "surucu" ? "surucu" : "trend";
  return `
    <h3 class="etiket-baslik">Öngörü</h3>
    <div class="senaryo-satir">
      <label>Model
        <select id="w-o-model">
          ${Object.entries(ONGORU_MODELLERI).map(([k, m]) =>
            `<option value="${k}" ${k === model ? "selected" : ""}>${kacisla(m.ad)}</option>`).join("")}
        </select></label>
      <label>Ufuk
        <select id="w-o-ufuk">
          ${[6, 12, 24, 36].map((u) =>
            `<option value="${u}" ${u === (Number(a.ufuk) || 12) ? "selected" : ""}>${u} dönem</option>`).join("")}
        </select></label>
      <label title="Model bu yılın sonuna kadarki veriyle kurulur">Baz sonu
        <select id="w-o-baz">
          <option value="">Tüm veri</option>
          ${yillar.map((y) => `<option value="${y}" ${y === Number(a.bazSonu) ? "selected" : ""}>${y} sonu</option>`).join("")}
        </select></label>
      <label title="Sürücü değişkenlerin gelecek değerleri bu oranla çarpılır">Varsayım
        <select id="w-o-carpan" ${model === "surucu" ? "" : "disabled"}>
          ${[80, 90, 95, 100, 105, 110, 120].map((c) =>
            `<option value="${c}" ${c === (Number(a.carpan) || 100) ? "selected" : ""}>%${c}</option>`).join("")}
        </select></label>
    </div>
    <div id="w-o-surucu-alan" ${model === "surucu" ? "" : "hidden"}>
      <p class="yardim">Sürücü değişkenler — hedefin bağlı olduğu üretim, çalışma saati gibi kalemler.</p>
      <input type="text" id="w-o-ara" placeholder="Sürücü ara…" class="arama">
      <div class="esleme-liste kisa-liste" id="w-o-liste">${degiskenListesiHtml(a.surucular ?? [])}</div>
    </div>`;
}

const ICERIKLER = {
  kart(p, ctx) {
    const anahtarlar = p.degiskenler.filter((k) => degiskenAl(k));
    if (!anahtarlar.length) return bosIcerik("Değişken seçilmemiş");
    const ayar = veriEtiketiAyari(p);

    /** Bir değişkenin kartta gösterilecek sayısı, birimi ve değişimi. */
    const oku = (anahtar) => {
      const d = degiskenAl(anahtar);
      const simdi = degiskenAraligi(anahtar, ctx.nolar);
      const onceki = ctx.oncekiNolar.length ? degiskenAraligi(anahtar, ctx.oncekiNolar) : null;
      const elle = ayar.seriler[anahtar];
      return {
        ad: elle?.ad || d.header || anahtar,
        sayi: elle?.deger || pDeger(anahtar, simdi),
        birim: d.birim ?? "",
        rozet: degisimRozeti(simdi, onceki, { dusukIyi: degiskenYonu(anahtar) !== "yuksek" }),
      };
    };

    // Tek değişkende kart eskisi gibi kalır: büyük sayı ve altında değişim.
    if (anahtarlar.length === 1) {
      const o = oku(anahtarlar[0]);
      return `
      <b class="pano-deger">${kacisla(o.sayi)}${
        o.birim ? ` <span class="pano-birim">${kacisla(o.birim)}</span>` : ""}</b>
      ${o.rozet}`;
    }

    // Çoklu kartta her değişken kendi satırında. Kart genişse ad ile değer
    // yan yana sığar; dar kartta ad kırpılıp "Ha…" olarak okunmaz hâle
    // geleceği için ad üstte, değer altta yazılır.
    const genis = (p.en ?? PENCERE_TURLERI.kart.en) >= 340;
    const sinif = `${genis ? "genis" : "dar"} ${
      anahtarlar.length > 4 ? "sik" : anahtarlar.length > 2 ? "orta" : ""}`;
    return `<div class="pano-kart-liste ${sinif}">${anahtarlar.map((k) => {
      const o = oku(k);
      return `<div class="pano-kart-satir">
        <span class="pano-kart-ad" title="${kacisla(o.ad)}">${kacisla(o.ad)}</span>
        <span class="pano-kart-alt">
          <b class="pano-kart-sayi">${kacisla(o.sayi)}${
            o.birim ? ` <span class="pano-birim">${kacisla(o.birim)}</span>` : ""}</b>
          ${o.rozet}
        </span>
      </div>`;
    }).join("")}</div>`;
  },

  cizgi(p, ctx) {
    const ayar = veriEtiketiAyari(p);
    const seriler = p.degiskenler.map((k) => {
      const elle = ayar.seriler[k];
      const d = degiskenAl(k);
      return {
        ad: elle?.ad || d?.header || k,
        birim: d?.birim ?? "",
        degerler: degiskenSerisi(k, ctx.satirlar),
      };
    });
    if (!seriler.length) return bosIcerik("Değişken seçilmemiş");

    const pay = listePayi(ayar.konum, seriler.length);
    const liste = pay
      ? veriListesiHtml(p.degiskenler.map((k, i) => ({
          ad: seriler[i].ad,
          birim: seriler[i].birim,
          deger: degiskenAraligi(k, ctx.nolar),
          gorunenDeger: ayar.seriler[k]?.deger || undefined,
        })), ayar, "", { yuzdeAnlamli: false })
      : "";
    // Liste zaten seri adlarını taşıyor; ayrıca gösterge çizmeye gerek yok
    return (pay ? "" : gosterge(seriler)) + listeyleSar(ayar.konum, liste,
      cizgiGrafik(ctx.etiketler, seriler, {
        genislik: ctx.en, yukseklik: ctx.grafikBoy - pay, etiket: ayar,
      }));
  },

  /**
   * Öngörü penceresi: geçmiş seri ile tahmin aynı grafikte, üstünde
   * öngörülen tam yılların toplamı.
   *
   * Model panonun görüntüleme penceresinden değil, verinin tamamından
   * kurulur — pencere "son 24 ay"a ayarlıyken 24 aylık bir eğilimi yıllarca
   * ileri uzatmak saçma sonuç veriyordu. Pencere yalnızca grafiğin nereden
   * başlayacağını belirler.
   */
  ongoru(p, ctx) {
    const anahtar = p.degiskenler[0];
    const d = degiskenAl(anahtar);
    if (!d) return bosIcerik("Değişken seçilmemiş");

    const a = p.ayar ?? {};
    const tumSatirlar = mahsupSonucu().donemler;
    const o = ongoruKur({
      satirlar: tumSatirlar,
      hedef: anahtar,
      tur: a.model === "surucu" ? "surucu" : "trend",
      surucular: a.surucular ?? [],
      bazSonu: Number(a.bazSonu) || null,
      ufuk: Math.min(36, Math.max(1, Number(a.ufuk) || 12)),
      carpan: (Number(a.carpan) || 100) / 100,
    });
    if (!o || o.hata) return bosIcerik(o?.hata ?? "Öngörü kurulamadı");

    // Grafik pencerenin başından verinin sonuna, oradan da öngörüye uzanır
    const ilkNo = ctx.satirlar[0]?.no ?? tumSatirlar[0]?.no;
    const bas = Math.max(0, tumSatirlar.findIndex((s) => s.no === ilkNo));
    const gecmis = o.seri.slice(bas);
    const gecmisEtiket = tumSatirlar.slice(bas).map((s) => s.etiket);

    const bosluk = new Array(o.ufuk).fill(null);
    const seriler = [
      { ad: d.header ?? anahtar, degerler: [...gecmis, ...bosluk] },
      { ad: "Öngörü", degerler: [...new Array(gecmis.length).fill(null), ...o.tahmin] },
    ];
    const etiketler = [...gecmisEtiket, ...o.gelecek.map((g) => g.etiket)];

    // Tam yılların toplamı — "gelecek yıl ne kadar olacak" sorusunun cevabı
    const tamYillar = ongoruYilToplamlari(o).filter((y) => y.donem === 12);
    const gucMetni = o.r2 === null ? "Model gücü hesaplanamadı"
      : `R² ${o.r2.toFixed(3)} — ${o.r2 >= 0.7 ? "güçlü model"
          : o.r2 >= 0.4 ? "orta güçte model" : "zayıf model, öngörüyü referans sayın"}`;
    const ozet = tamYillar.length
      ? `<div class="pano-ongoru-ozet">${tamYillar.slice(0, 3).map((y) =>
          `<span><em>${y.yil}</em><b>${pDeger(anahtar, y.toplam)}</b></span>`).join("")}
         <span class="pano-ongoru-guc${o.uyari ? " uyarili" : ""}" title="${
           kacisla(gucMetni + (o.uyari ? ` · ${o.uyari}` : ""))}">${
           o.uyari ? "⚠ " : ""}R² ${o.r2 === null ? "—" : o.r2.toFixed(2)}</span></div>`
      : "";

    const ozetPayi = ozet ? 34 : 0;
    return ozet + gosterge(seriler) + cizgiGrafik(etiketler, seriler, {
      genislik: ctx.en, yukseklik: Math.max(80, ctx.grafikBoy - ozetPayi),
    });
  },

  cubuk(p, ctx) {
    const ayar = veriEtiketiAyari(p);
    const ogeler = p.degiskenler.map((k) => seriyiGiydir(k, {
      ad: degiskenAl(k)?.header ?? k,
      deger: degiskenAraligi(k, ctx.nolar) ?? 0,
    }, ayar)).filter((o) => o.deger !== 0).sort((a, b) => b.deger - a.deger);
    if (!ogeler.length) return bosIcerik("Seçili dönemde veri yok");
    const birimler = [...new Set(p.degiskenler.map((k) => degiskenAl(k)?.birim?.trim()).filter(Boolean))];
    const birim = birimler.length === 1 ? birimler[0] : "";
    const pay = listePayi(ayar.konum, ogeler.length);
    return listeyleSar(ayar.konum,
      pay ? veriListesiHtml(ogeler, ayar, birim) : "",
      yatayCubuk(ogeler, {
        genislik: ctx.en, yukseklik: ctx.grafikBoy - pay, etiket: ayar,
        birim,
      }));
  },

  pasta(p, ctx) {
    if (p.degiskenler.length < 2) return bosIcerik("Pasta için en az iki değişken seçin");

    const ogeler = p.degiskenler.map((k) => ({
      ad: degiskenAl(k)?.header ?? k,
      deger: degiskenAraligi(k, ctx.nolar),
      birim: degiskenAl(k)?.birim ?? "",
    }));

    // Farklı birimler toplanamaz: bütünün parçası olmazlar
    const birimler = [...new Set(ogeler.map((o) => o.birim.trim()).filter(Boolean))];
    if (birimler.length > 1) {
      return bosIcerik(`Birimler karışık (${birimler.join(", ")}). Pasta yalnızca aynı birimdeki kalemleri toplayabilir.`);
    }

    const ayar = veriEtiketiAyari(p);
    const giydirilmis = p.degiskenler.map((k, i) => seriyiGiydir(k, ogeler[i], ayar));
    return pastaGrafik(giydirilmis, {
      genislik: ctx.en, yukseklik: ctx.grafikBoy, birim: birimler[0] ?? "",
      etiket: ayar,
    });
  },

  /*
   * Yıllık toplam: dönem aralığı yıllara bölünür ve her yıl için gösterge
   * yeniden hesaplanır. Oran göstergelerinde yılın aylarını toplamak
   * yanlış olacağı için motor, o yılın satırlarıyla yeniden çalıştırılır.
   */
  yillik(p, ctx) {
    if (!p.degiskenler.length) return bosIcerik("Değişken seçilmemiş");

    const yillar = [];
    for (const s of ctx.satirlar) {
      if (!s.yil) continue;
      const son = yillar[yillar.length - 1];
      if (son && son.yil === s.yil) son.nolar.push(s.no);
      else yillar.push({ yil: s.yil, nolar: [s.no] });
    }
    if (yillar.length < 1) return bosIcerik("Seçili dönemde yıl bilgisi yok");

    const ayar = veriEtiketiAyari(p);
    const seriler = p.degiskenler.map((k) => {
      const d = degiskenAl(k);
      return {
        ad: ayar.seriler[k]?.ad || d?.header || k,
        birim: d?.birim ?? "",
        degerler: yillar.map((y) => degiskenAraligi(k, y.nolar)),
      };
    });

    const eksik = yillar.filter((y) => y.nolar.length < 12);
    const pay = listePayi(ayar.konum, seriler.length);
    const liste = pay ? veriListesiHtml(seriler.map((seri, i) => ({
      ad: seri.ad,
      birim: seri.birim,
      deger: seri.degerler.reduce((a, v) => a + (v ?? 0), 0),
      gorunenDeger: ayar.seriler[p.degiskenler[i]]?.deger || undefined,
    })), ayar, "", { yuzdeAnlamli: false }) : "";
    return (pay ? "" : gosterge(seriler)) + listeyleSar(ayar.konum, liste,
      grupluCubuk(yillar.map((y) => String(y.yil)), seriler, {
        genislik: ctx.en, yukseklik: ctx.grafikBoy - pay - (eksik.length ? 16 : 0), etiket: ayar,
      })) +
      (eksik.length
        ? `<p class="pano-not">${eksik.map((y) => `${y.yil} (${y.nolar.length} ay)`).join(", ")}
           tam yıl değil; bu yıllar diğerleriyle doğrudan karşılaştırılamaz.</p>`
        : "");
  },

  kiyas(p, ctx) {
    if (!p.degiskenler.length) return bosIcerik("Değişken seçilmemiş");
    if (!ctx.oncekiNolar.length) return bosIcerik("Karşılaştırılacak önceki dönem yok");
    const ayar = veriEtiketiAyari(p);
    const etiketler = p.degiskenler.map((k) => ayar.seriler[k]?.ad || degiskenAl(k)?.header || k);
    const seriler = [
      { ad: "Bu dönem", degerler: p.degiskenler.map((k) => degiskenAraligi(k, ctx.nolar)) },
      { ad: "Önceki dönem", degerler: p.degiskenler.map((k) => degiskenAraligi(k, ctx.oncekiNolar)) },
    ];
    const pay = listePayi(ayar.konum, seriler.length);
    const liste = pay ? veriListesiHtml(seriler.map((seri) => ({
      ad: seri.ad,
      deger: seri.degerler.reduce((a, v) => a + (v ?? 0), 0),
    })), ayar, "", { yuzdeAnlamli: false }) : "";
    return (pay ? "" : gosterge(seriler)) + listeyleSar(ayar.konum, liste,
      grupluCubuk(etiketler, seriler, {
        genislik: ctx.en, yukseklik: ctx.grafikBoy - pay, etiket: ayar,
      }));
  },

  gauge(p, ctx) {
    const anahtar = p.degiskenler[0];
    const d = degiskenAl(anahtar);
    if (!d) return bosIcerik("Değişken seçilmemiş");
    const deger = degiskenAraligi(anahtar, ctx.nolar);
    const hedefKaydi = degiskenHedefi(anahtar, ctx.nolar);
    const hedef = pSayi(p.ayar?.hedef) ?? hedefKaydi?.deger ?? null;

    if (deger === null) return bosIcerik("Seçili dönemde veri yok");
    if (hedef === null) {
      return `<b class="pano-deger">${pDeger(anahtar, deger)}</b>
        <span class="pano-not">Hedef tanımlı değil. Pencerenin ayarlarına elle yazabilirsiniz;
        "Limit kullanımı" göstergesinde hedef yıllık limittir.</span>`;
    }

    const dusukIyi = degiskenYonu(anahtar) !== "yuksek";
    const oran = hedef ? (deger / hedef) * 100 : null;
    const basarili = dusukIyi ? deger <= hedef : deger >= hedef;
    // Limit gibi bir kapasitenin kullanımı: oluk kullanılan kısım kadar dolar
    const kapasiteMi = !!GOSTERGE[d.gostergeId]?.hedefId;
    const dolu = Math.max(0, Math.min(100, kapasiteMi || !dusukIyi ? oran : (hedef / deger) * 100));

    return `
      <b class="pano-deger">${pDeger(anahtar, deger)}${
        d.birim ? ` <span class="pano-birim">${kacisla(d.birim)}</span>` : ""}</b>
      <div class="pano-oluk"><i class="${basarili ? "iyi" : "kotu"}" style="width:${dolu.toFixed(1)}%"></i></div>
      <span class="pano-not">Hedef ${kisaSayi(hedef)} ${kacisla(d.birim)} ·
        ${kapasiteMi ? `%${oran.toFixed(1).replace(".", ",")} kullanıldı · ` : ""}${basarili ? "hedefin içinde" : `hedefe ${kisaSayi(Math.abs(deger - hedef))} ${kacisla(d.birim)} uzak`}</span>`;
  },

  tablo(p, ctx) {
    if (!p.degiskenler.length) return bosIcerik("Değişken seçilmemiş");
    const seriler = p.degiskenler.map((k) => degiskenSerisi(k, ctx.satirlar));
    return `<div class="pano-tablo-sar"><table class="pano-tablo">
      <thead><tr><th>Dönem</th>${p.degiskenler.map((k) => {
        const d = degiskenAl(k);
        return `<th>${kacisla(d?.header ?? k)}${d?.birim ? `<em>${kacisla(d.birim)}</em>` : ""}</th>`;
      }).join("")}</tr></thead>
      <tbody>${ctx.satirlar.map((s, i) =>
        `<tr><td>${kacisla(s.etiket)}</td>${seriler.map((seri, j) =>
          `<td class="sayi">${pDeger(p.degiskenler[j], seri[i])}</td>`).join("")}</tr>`).join("")}
      </tbody></table></div>`;
  },

  metin(p) {
    const metin = p.ayar?.metin ?? "";
    return metin
      ? `<div class="pano-metin">${kacisla(metin).replace(/\n/g, "<br>")}</div>`
      : bosIcerik("Ayarlardan not yazın");
  },
};

const bosIcerik = (mesaj) => `<p class="pano-bos">${kacisla(mesaj)}</p>`;

/* ================= Çizim ================= */

function panoCiz() {
  const katman = panoKatman();
  if (!katman) return;

  degiskenleriTazele();
  const { satirlar, oncekiSatirlar, hepsi } = donemAral();
  panoDonemleriTazele(hepsi, satirlar);
  panoBilgisiTazele(satirlar);

  if (!hepsi.length) {
    katman.innerHTML = `<p class="pano-bos tuval-bos">Gösterilecek dönem yok. Veri sayfasına satır ekleyin.</p>`;
    return;
  }

  const ortak = {
    satirlar, oncekiSatirlar,
    nolar: satirlar.map((s) => s.no),
    oncekiNolar: oncekiSatirlar.map((s) => s.no),
    etiketler: satirlar.map((s) => s.etiket),
    donemMetni: satirlar.length
      ? `${satirlar[0].etiket} – ${satirlar[satirlar.length - 1].etiket}`
      : "—",
  };

  katman.innerHTML = panoAyar.pencereler.map((p) => {
    const tur = PENCERE_TURLERI[p.tur] ?? PENCERE_TURLERI.kart;
    const ctx = { ...ortak, en: p.en - 24, grafikBoy: Math.max(90, p.boy - 62) };
    let icerik;
    try {
      icerik = ICERIKLER[p.tur]?.(p, ctx) ?? bosIcerik("Bilinmeyen pencere türü");
    } catch (e) {
      console.error(e);
      icerik = bosIcerik("Çizilemedi: " + e.message);
    }
    const baslik = p.baslik ?? otomatikBaslik(p, tur);

    return `<div class="pano-pencere" data-id="${p.id}" data-tur="${p.tur}"
                 style="left:${p.x}px; top:${p.y}px; width:${p.en}px; height:${p.boy}px">
      <div class="pano-baslik">
        <span class="pano-ad">${kacisla(baslik)}</span>
        <span class="pano-dugmeler">
          <button type="button" class="pano-ayar" title="Pencere ayarları">⚙</button>
          <button type="button" class="pano-sil" title="Pencereyi kaldır">×</button>
        </span>
      </div>
      <div class="pano-icerik">${icerik}
        <div class="pano-etiketler">${etiketleriCiz(p, ctx)}</div>
      </div>
      <span class="pano-tutamac" title="Sürükleyerek boyutlandır"></span>
    </div>`;
  }).join("");

  panoGorunumuUygula();
}

function otomatikBaslik(p, tur) {
  if (!p.degiskenler.length) return tur.ad;
  const ilk = degiskenAl(p.degiskenler[0]);
  if (!ilk) return tur.ad;
  return p.degiskenler.length > 1
    ? `${ilk.header} +${p.degiskenler.length - 1}`
    : ilk.tamAd;
}

/** Yakınlaştırmayı yüzde biriminde ayarlar (40 – 250 arası). */
function zumuAyarla(oran) {
  const yeni = Math.min(PANO_EN_BUYUK_ZUM, Math.max(PANO_EN_KUCUK_ZUM, oran));
  panoAyar.olcek = "elle";
  if (Math.abs(yeni - panoAyar.zum) < 1e-9) {
    panoKaydet();
    panoGorunumuUygula();
    return;
  }
  panoAyar.zum = yeni;
  panoKaydet();
  panoGorunumuUygula();
}

/** Panoyu ekran genişliğine uydurma kipine döndürür. */
function ekranaSigdir() {
  panoAyar.olcek = "sigdir";
  panoKaydet();
  panoGorunumuUygula();
}

/** Yüzdeyi bir puan artırır ya da azaltır. */
function zumAdimla(puan) {
  // Yüzde üzerinden yuvarlanır ki tekerlekten gelen ondalıklar birikmesin
  zumuAyarla((Math.round(panoAyar.zum * 100) + puan) / 100);
}

/** Yerleşimin kapladığı alan — pencerelerin en sağ ve en alt kenarı. */
function panoIcerikOlcusu() {
  return {
    en: Math.max(1200, ...panoAyar.pencereler.map((p) => p.x + p.en + 60)),
    boy: Math.max(700, ...panoAyar.pencereler.map((p) => p.y + p.boy + 60)),
  };
}

/**
 * Panoyu ekran genişliğine uyduran yakınlaştırma oranı.
 *
 * Pencerelerin yeri ve boyutu piksel olarak saklanır; ekran büyüdüğünde
 * yerleşimi bozup yeniden dizmek yerine tuval bütün olarak ölçeklenir.
 * Böylece kullanıcının kurduğu düzen aynen korunur, yalnızca büyür.
 */
function otomatikZum() {
  const t = panoTuval();
  if (!t || !t.clientWidth) return null;
  const { en } = panoIcerikOlcusu();
  if (!en) return null;
  // Dikey kaydırma çubuğu için küçük bir pay
  return Math.min(PANO_EN_BUYUK_ZUM, Math.max(PANO_EN_KUCUK_ZUM, (t.clientWidth - 6) / en));
}

function panoGorunumuUygula() {
  const katman = panoKatman();
  if (!katman) return;

  if (panoAyar.olcek === "sigdir") {
    const oran = otomatikZum();
    if (oran !== null) panoAyar.zum = oran;
  }

  katman.style.transform = `scale(${panoAyar.zum})`;
  katman.style.transformOrigin = "0 0";
  const { en: enBuyukX, boy: enBuyukY } = panoIcerikOlcusu();
  katman.style.width = enBuyukX + "px";
  katman.style.height = enBuyukY + "px";
  const sarmal = document.getElementById("panoSahne");
  if (sarmal) {
    sarmal.style.width = enBuyukX * panoAyar.zum + "px";
    sarmal.style.height = enBuyukY * panoAyar.zum + "px";
  }
  const zumEtiket = document.getElementById("panoZum");
  if (zumEtiket) zumEtiket.textContent = `%${Math.round(panoAyar.zum * 100)}`;
  const sigdirBtn = document.getElementById("panoSigdir");
  if (sigdirBtn) {
    const otomatik = panoAyar.olcek === "sigdir";
    sigdirBtn.classList.toggle("etkin", otomatik);
    sigdirBtn.title = otomatik
      ? "Pano ekran genişliğine uyuyor; sabitlemek için − ya da + kullanın"
      : "Panoyu ekran genişliğine uydur";
  }
}

function panoBilgisiTazele(satirlar) {
  const bilgi = document.getElementById("panoBilgi");
  if (!bilgi) return;
  bilgi.textContent = `${panoAyar.pencereler.length} pencere · ${satirlar.length} dönem`;
}

function panoDonemleriTazele(hepsi, secili) {
  const bas = document.getElementById("panoBas");
  const son = document.getElementById("panoSon");
  if (!bas || !son) return;
  const secenek = (s, seciliNo) =>
    `<option value="${s.no}" ${s.no === seciliNo ? "selected" : ""}>${kacisla(s.etiket)}</option>`;
  const ilkNo = secili[0]?.no ?? null;
  const sonNo = secili[secili.length - 1]?.no ?? null;
  bas.innerHTML = hepsi.map((s) => secenek(s, ilkNo)).join("");
  son.innerHTML = hepsi.map((s) => secenek(s, sonNo)).join("");
  for (const btn of document.querySelectorAll(".pano-hazir")) {
    btn.classList.toggle("secili", btn.dataset.hazir === panoAyar.hazir);
  }
}

/* ================= Pencere işlemleri ================= */

function pencereAl(id) {
  return panoAyar.pencereler.find((p) => p.id === id) ?? null;
}

function pencereEkle(tur) {
  const t = PENCERE_TURLERI[tur];
  if (!t) return;
  // Yeni pencere, en alttaki pencerenin altına yerleşsin
  const altSinir = panoAyar.pencereler.reduce((a, p) => Math.max(a, p.y + p.boy), 0);
  panoAyar.pencereler.push({
    id: `p${panoAyar.sonrakiNo++}`, tur,
    x: 20, y: altSinir + 20, en: t.en, boy: t.boy,
    baslik: null, degiskenler: [], ayar: {}, etiketler: [],
  });
  panoKaydet();
  panoCiz();
  pencereAyarDiyalogu(panoAyar.pencereler[panoAyar.pencereler.length - 1].id);
}

function pencereSil(id) {
  panoAyar.pencereler = panoAyar.pencereler.filter((p) => p.id !== id);
  panoKaydet();
  panoCiz();
}

/** Etiket sekmesinin bir satırı. */
function etiketSatiri(e, secenekler) {
  const tanim = ETIKET_KAYNAKLARI[e.kaynak] ?? ETIKET_KAYNAKLARI.ozel;
  return `<div class="etiket-satir" data-etiket="${e.id}">
    <select class="e-kaynak">
      ${secenekler.map((k) => `<option value="${k}" ${k === e.kaynak ? "selected" : ""}>${
        kacisla(ETIKET_KAYNAKLARI[k].ad)}</option>`).join("")}
    </select>
    <input type="text" class="e-kalip" value="${kacisla(e.kalip ?? tanim.kalip)}"
           placeholder="${kacisla(tanim.kalip)}">
    <select class="e-konum" title="Hazır yerleşim; sürükleyerek de taşıyabilirsiniz">
      ${Object.entries(ETIKET_KONUMLARI).map(([k, v]) =>
        `<option value="${k}" ${k === etiketKonumu(e) ? "selected" : ""}>${kacisla(v.ad)}</option>`).join("")}
      <option value="elle" ${etiketKonumu(e) === "elle" ? "selected" : ""}>Elle taşındı</option>
    </select>
    <label class="e-vurgu" title="Koyu zeminde göster">
      <input type="checkbox" class="e-vurgulu" ${e.vurgu ? "checked" : ""}> vurgu</label>
    <button type="button" class="e-sil ufak" title="Etiketi kaldır">×</button>
  </div>`;
}

function pencereAyarDiyalogu(id, acikSekme = "icerik") {
  const p = pencereAl(id);
  if (!p) return;
  const t = PENCERE_TURLERI[p.tur];
  const coklu = t.coklu;
  const secenekler = etiketSecenekleri(p.tur);
  const veAyar = veriEtiketiAyari(p);
  // Taslak üzerinde çalışılır; İptal'e basıldığında pencere bozulmasın
  const etiketTaslagi = structuredClone(p.etiketler ?? []);

  diyalogAc(`
    <h2>${kacisla(t.ad)} ayarları</h2>
    <div class="sekmeler" role="tablist">
      <button type="button" class="sekme ${acikSekme === "icerik" ? "secili" : ""}" data-sekme="icerik">İçerik</button>
      <button type="button" class="sekme ${acikSekme === "etiket" ? "secili" : ""}" data-sekme="etiket">Etiketler</button>
    </div>

    <div class="sekme-icerik" data-sekme-icerik="icerik" ${acikSekme === "icerik" ? "" : "hidden"}>
      <p class="yardim">${kacisla(t.aciklama)}</p>
      <label class="alan">Başlık
        <input type="text" id="w-baslik" value="${kacisla(p.baslik ?? "")}"
               placeholder="${kacisla(otomatikBaslik(p, t))}"></label>
      ${p.tur === "metin" ? `
        <label class="alan">Not <textarea id="w-metin" rows="5">${kacisla(p.ayar?.metin ?? "")}</textarea></label>`
      : coklu ? `
        <p class="yardim">Değişkenler — Hesaplanmış Değerler'deki tesis göstergeleri ve
           veri sekmelerinin sütunları birlikte listelenir.</p>
        <div class="kaynak-suzgec">
         <span>Kaynak:</span>
         <button type="button" class="kaynak-btn secili" data-kaynak="hepsi">Hepsi</button>
         <button type="button" class="kaynak-btn" data-kaynak="kolon">Veri sayfası</button>
         <button type="button" class="kaynak-btn" data-kaynak="gosterge">Hesaplanmış Değerler</button>
       </div>
        <input type="text" id="w-ara" placeholder="Değişken ara…" class="arama">
        <div class="esleme-liste" id="w-liste">${degiskenListesiHtml(p.degiskenler)}</div>`
      : `
        <label class="alan">Değişken
          <select id="w-degisken">${degiskenSecenekleri(p.degiskenler[0], { bos: true })}</select></label>
        ${p.tur === "gauge" ? `
          <label class="alan">Hedef (boş bırakılırsa göstergenin hedefi — limit kullanımında yıllık limit — kullanılır)
            <input type="text" id="w-hedef" value="${p.ayar?.hedef ?? ""}"></label>` : ""}
        ${p.tur === "ongoru" ? ongoruAyarlari(p) : ""}`}
    </div>

    <div class="sekme-icerik" data-sekme-icerik="etiket" ${acikSekme === "etiket" ? "" : "hidden"}>
      ${VERI_ETIKETI_KONUMLARI[p.tur] ? `
      <h3 class="etiket-baslik">Veri etiketleri</h3>
      <p class="yardim">Serinin hangi bilgilerinin grafikte görüneceğini ve nerede duracağını seçin.
         Görünen ad ve değeri elle de yazabilirsiniz.</p>
      <div class="senaryo-satir">
        <label class="e-onay"><input type="checkbox" id="v-ad" ${veAyar.alanlar.ad ? "checked" : ""}> Seri adı</label>
        <label class="e-onay"><input type="checkbox" id="v-deger" ${veAyar.alanlar.deger ? "checked" : ""}> Değer</label>
        <label class="e-onay"><input type="checkbox" id="v-yuzde" ${veAyar.alanlar.yuzde ? "checked" : ""}> Yüzde</label>
        <label class="e-onay"><input type="checkbox" id="v-birim" ${veAyar.alanlar.birim ? "checked" : ""}> Birim</label>
        <label>Konum
          <select id="v-konum">
            ${VERI_ETIKETI_KONUMLARI[p.tur].map(([k, ad]) =>
              `<option value="${k}" ${k === veAyar.konum ? "selected" : ""}>${kacisla(ad)}</option>`).join("")}
          </select>
        </label>
        <label>Ayraç <input type="text" id="v-ayirac" value="${kacisla(veAyar.ayirac)}" size="4"></label>
      </div>
      ${p.degiskenler.length ? `
        <table class="yedek-tablo seri-tablo">
          <thead><tr><th>Seri</th><th>Görünen ad</th><th>Görünen değer</th></tr></thead>
          <tbody>${p.degiskenler.map((k) => {
            const d = degiskenAl(k);
            const elle = veAyar.seriler[k] ?? {};
            return `<tr data-seri="${kacisla(k)}">
              <td class="seri-kaynak" title="${kacisla(d?.tamAd ?? k)}">${kacisla(d?.header ?? k)}</td>
              <td><input type="text" class="v-seriAd" value="${kacisla(elle.ad ?? "")}"
                         placeholder="${kacisla(d?.header ?? k)}"></td>
              <td><input type="text" class="v-seriDeger" value="${kacisla(elle.deger ?? "")}"
                         placeholder="hesaplanan değer"></td>
            </tr>`;
          }).join("")}</tbody>
        </table>` : `<p class="pano-bos">Önce İçerik sekmesinden değişken seçin.</p>`}
      <h3 class="etiket-baslik">Serbest etiketler</h3>` : ""}
      <p class="yardim">Serbest etiketler grafiğin üzerinde durur ve <b>sürüklenerek</b> en uygun yere taşınır.
         Metin bir kalıptır; <code>{deger}</code>, <code>{birim}</code>, <code>{ad}</code> ve
         <code>{donem}</code> yerine hesaplanan değerler geçer. Dilediğiniz gibi
         değiştirebilir, "Serbest metin" seçip tamamen kendi yazınızı da koyabilirsiniz.</p>
      <div id="w-etiketler">${etiketTaslagi.map((e) => etiketSatiri(e, secenekler)).join("")
        || `<p class="pano-bos">Henüz etiket yok.</p>`}</div>
      <button type="button" id="w-etiketEkle">Etiket Ekle</button>
    </div>

    <div class="dugmeler">
      <button type="button" id="w-sil" class="ikincil">Pencereyi kaldır</button>
      <span class="dugme-bosluk"></span>
      <button type="button" id="w-iptal">İptal</button>
      <button type="button" id="w-tamam" class="birincil">Uygula</button>
    </div>`,
    (k) => {
      const dugmeler = [...k.querySelectorAll(".sekme")];
      const bolumler = [...k.querySelectorAll(".sekme-icerik")];
      for (const btn of dugmeler) {
        btn.addEventListener("click", () => {
          for (const b of dugmeler) b.classList.toggle("secili", b === btn);
          for (const bolum of bolumler) bolum.hidden = bolum.dataset.sekmeIcerik !== btn.dataset.sekme;
        });
      }

      const ara = k.querySelector("#w-ara");
      ara?.addEventListener("input", () => degiskenAramasiUygula(k, ara.value));
      for (const btn of k.querySelectorAll(".kaynak-btn")) {
        btn.addEventListener("click", () => {
          for (const b of k.querySelectorAll(".kaynak-btn")) b.classList.toggle("secili", b === btn);
          degiskenKaynakSuzgeci(k, btn.dataset.kaynak);
        });
      }

      const liste = k.querySelector("#w-etiketler");
      const listeyiCiz = () => {
        liste.innerHTML = etiketTaslagi.map((e) => etiketSatiri(e, secenekler)).join("")
          || `<p class="pano-bos">Henüz etiket yok.</p>`;
      };

      k.querySelector("#w-etiketEkle").addEventListener("click", () => {
        const kaynak = secenekler[0];
        // Sağ üst köşe grafiklerde genelde boştur; üst üste binmesinler diye
        // her yeni etiket biraz aşağıdan başlar
        etiketTaslagi.push({
          id: `e${Date.now().toString(36)}${etiketTaslagi.length}`,
          kaynak, kalip: ETIKET_KAYNAKLARI[kaynak].kalip,
          x: ETIKET_KONUMLARI.sagUst.x,
          y: ETIKET_KONUMLARI.sagUst.y + etiketTaslagi.length * 13,
          vurgu: false,
        });
        listeyiCiz();
      });

      liste.addEventListener("input", (e) => {
        const satir = e.target.closest(".etiket-satir");
        const etiket = satir && etiketTaslagi.find((x) => x.id === satir.dataset.etiket);
        if (!etiket) return;
        if (e.target.classList.contains("e-kalip")) etiket.kalip = e.target.value;
        if (e.target.classList.contains("e-vurgulu")) etiket.vurgu = e.target.checked;
      });
      liste.addEventListener("change", (e) => {
        const satir = e.target.closest(".etiket-satir");
        const etiket = satir && etiketTaslagi.find((x) => x.id === satir.dataset.etiket);
        if (!etiket) return;
        if (e.target.classList.contains("e-konum")) {
          const konum = ETIKET_KONUMLARI[e.target.value];
          if (konum) { etiket.x = konum.x; etiket.y = konum.y; }
          return;
        }
        if (!e.target.classList.contains("e-kaynak")) return;
        const eskiKalip = ETIKET_KAYNAKLARI[etiket.kaynak]?.kalip;
        etiket.kaynak = e.target.value;
        // Kalıba dokunulmamışsa yeni kaynağın kalıbı gelsin
        if (!etiket.kalip || etiket.kalip === eskiKalip) {
          etiket.kalip = ETIKET_KAYNAKLARI[etiket.kaynak].kalip;
          satir.querySelector(".e-kalip").value = etiket.kalip;
        }
        satir.querySelector(".e-kalip").placeholder = ETIKET_KAYNAKLARI[etiket.kaynak].kalip;
      });
      liste.addEventListener("click", (e) => {
        const btn = e.target.closest(".e-sil");
        if (!btn) return;
        const satir = btn.closest(".etiket-satir");
        const i = etiketTaslagi.findIndex((x) => x.id === satir.dataset.etiket);
        if (i >= 0) etiketTaslagi.splice(i, 1);
        listeyiCiz();
      });

      k.querySelector("#w-sil").addEventListener("click", () => {
        diyalogKapat();
        pencereSil(id);
      });
      const oModel = k.querySelector("#w-o-model");
      if (oModel) {
        const alan = k.querySelector("#w-o-surucu-alan");
        const carpan = k.querySelector("#w-o-carpan");
        oModel.addEventListener("change", () => {
          const surucuMu = oModel.value === "surucu";
          alan.hidden = !surucuMu;
          carpan.disabled = !surucuMu;
        });
        const ara = k.querySelector("#w-o-ara");
        ara.addEventListener("input", () => degiskenAramasiUygula(alan, ara.value));
      }

      k.querySelector("#w-iptal").addEventListener("click", diyalogKapat);
      k.querySelector("#w-tamam").addEventListener("click", () => {
        p.baslik = k.querySelector("#w-baslik").value.trim() || null;
        if (p.tur === "metin") {
          p.ayar = { ...p.ayar, metin: k.querySelector("#w-metin").value };
        } else if (coklu) {
          p.degiskenler = [...k.querySelectorAll("#w-liste input:checked")].map((c) => c.value);
        } else {
          const secim = k.querySelector("#w-degisken").value;
          p.degiskenler = secim ? [secim] : [];
          if (p.tur === "gauge") {
            const ham = k.querySelector("#w-hedef").value.trim().replace(",", ".");
            p.ayar = { ...p.ayar, hedef: ham === "" ? null : Number(ham) };
          }
          if (p.tur === "ongoru") {
            p.ayar = {
              ...p.ayar,
              model: k.querySelector("#w-o-model").value,
              ufuk: Number(k.querySelector("#w-o-ufuk").value) || 12,
              bazSonu: Number(k.querySelector("#w-o-baz").value) || null,
              carpan: Number(k.querySelector("#w-o-carpan").value) || 100,
              surucular: [...k.querySelectorAll("#w-o-liste input:checked")].map((c) => c.value),
            };
          }
        }
        p.etiketler = etiketTaslagi;

        if (VERI_ETIKETI_KONUMLARI[p.tur]) {
          const seriler = {};
          for (const tr of k.querySelectorAll(".seri-tablo tbody tr")) {
            const ad = tr.querySelector(".v-seriAd").value.trim();
            const deger = tr.querySelector(".v-seriDeger").value.trim();
            if (ad || deger) seriler[tr.dataset.seri] = { ad: ad || null, deger: deger || null };
          }
          p.veriEtiketi = {
            alanlar: {
              ad: k.querySelector("#v-ad").checked,
              deger: k.querySelector("#v-deger").checked,
              yuzde: k.querySelector("#v-yuzde").checked,
              birim: k.querySelector("#v-birim").checked,
            },
            konum: k.querySelector("#v-konum").value,
            ayirac: k.querySelector("#v-ayirac").value || " · ",
            seriler,
          };
        }
        panoKaydet();
        diyalogKapat();
        panoCiz();
      });
    },
    { genis: true }
  );
}

function pencereEkleDiyalogu() {
  diyalogAc(`
    <h2>Pencere ekle</h2>
    <p class="yardim">Eklediğiniz pencereyi sürükleyerek taşıyabilir, köşesinden boyutlandırabilirsiniz.</p>
    <div class="pencere-secim">
      ${Object.entries(PENCERE_TURLERI).map(([anahtar, t]) => `
        <button type="button" class="pencere-turu" data-tur="${anahtar}">
          <b>${kacisla(t.ad)}</b><span>${kacisla(t.aciklama)}</span>
        </button>`).join("")}
    </div>
    <div class="dugmeler"><span class="dugme-bosluk"></span>
      <button type="button" id="pe-iptal">Kapat</button></div>`,
    (k) => {
      k.querySelector("#pe-iptal").addEventListener("click", diyalogKapat);
      for (const btn of k.querySelectorAll(".pencere-turu")) {
        btn.addEventListener("click", () => {
          diyalogKapat();
          pencereEkle(btn.dataset.tur);
        });
      }
    }
  );
}

/* ================= Etkileşim ================= */

const panoIzgara = (v) => Math.round(v / PANO_IZGARA) * PANO_IZGARA;

/** Fare konumunu tuval (sahne) koordinatına çevirir. */
function panoNokta(e) {
  const t = panoTuval();
  const k = t.getBoundingClientRect();
  return {
    x: (e.clientX - k.left + t.scrollLeft) / panoAyar.zum,
    y: (e.clientY - k.top + t.scrollTop) / panoAyar.zum,
  };
}

function panoOlaylariBagla() {
  const t = panoTuval();

  t.addEventListener("mousemove", (e) => {
    if (panoKaydirma) {
      const dx = e.clientX - panoKaydirma.fareX;
      const dy = e.clientY - panoKaydirma.fareY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) panoKaydirma.tasindi = true;
      t.scrollLeft = panoKaydirma.sol - dx;
      t.scrollTop = panoKaydirma.ust - dy;
      return;
    }

    if (etiketSurukleme) {
      const { kutu, el } = etiketSurukleme;
      const x = ((e.clientX - etiketSurukleme.dx - kutu.left) / kutu.width) * 100;
      const y = ((e.clientY - etiketSurukleme.dy - kutu.top) / kutu.height) * 100;
      etiketSurukleme.x = Math.max(0, Math.min(94, x));
      etiketSurukleme.y = Math.max(0, Math.min(92, y));
      el.style.left = etiketSurukleme.x + "%";
      el.style.top = etiketSurukleme.y + "%";
      return;
    }

    const nokta = panoNokta(e);

    if (panoBoyutlandirma) {
      const p = pencereAl(panoBoyutlandirma.id);
      if (!p) return;
      p.en = Math.max(PANO_EN_KUCUK_EN, panoIzgara(panoBoyutlandirma.en + nokta.x - panoBoyutlandirma.x0));
      p.boy = Math.max(PANO_EN_KUCUK_BOY, panoIzgara(panoBoyutlandirma.boy + nokta.y - panoBoyutlandirma.y0));
      const el = panoKatman().querySelector(`.pano-pencere[data-id="${p.id}"]`);
      if (el) { el.style.width = p.en + "px"; el.style.height = p.boy + "px"; }
      panoBoyutlandirma.degisti = true;
      return;
    }

    if (panoSurukleme) {
      const p = pencereAl(panoSurukleme.id);
      if (!p) return;
      p.x = Math.max(0, panoIzgara(nokta.x - panoSurukleme.dx));
      p.y = Math.max(0, panoIzgara(nokta.y - panoSurukleme.dy));
      const el = panoKatman().querySelector(`.pano-pencere[data-id="${p.id}"]`);
      if (el) { el.style.left = p.x + "px"; el.style.top = p.y + "px"; }
      panoSurukleme.tasindi = true;
    }
  });

  t.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const el = e.target.closest(".pano-pencere");

    // Boş alana basıldıysa tuvali tutup gezdir
    if (!el) {
      panoKaydirma = {
        fareX: e.clientX, fareY: e.clientY,
        sol: t.scrollLeft, ust: t.scrollTop, tasindi: false,
      };
      t.classList.add("kaydiriliyor");
      e.preventDefault();
      return;
    }

    if (e.target.closest(".pano-dugmeler")) return;   // düğmeler tıklamayla çalışır

    const p = pencereAl(el.dataset.id);
    if (!p) return;
    const nokta = panoNokta(e);

    // Etiket pencereden bağımsız taşınır
    const etiketEl = e.target.closest(".pano-etiket");
    if (etiketEl) {
      const kutu = etiketEl.parentElement.getBoundingClientRect();
      etiketSurukleme = {
        pencereId: p.id, etiketId: etiketEl.dataset.etiket,
        kutu, el: etiketEl,
        dx: e.clientX - etiketEl.getBoundingClientRect().left,
        dy: e.clientY - etiketEl.getBoundingClientRect().top,
      };
      etiketEl.classList.add("tasiniyor");
      e.preventDefault();
      return;
    }

    if (e.target.closest(".pano-tutamac")) {
      panoBoyutlandirma = { id: p.id, x0: nokta.x, y0: nokta.y, en: p.en, boy: p.boy };
      e.preventDefault();
      return;
    }

    // İçeriğin kendi kaydırması (tablo) engellenmesin
    if (e.target.closest(".pano-tablo-sar")) return;

    panoSurukleme = { id: p.id, tasindi: false, dx: nokta.x - p.x, dy: nokta.y - p.y };
    e.preventDefault();
  });

  t.addEventListener("wheel", (e) => {
    if (!panoZBasili) return;   // Z basılı değilken normal kaydırma
    e.preventDefault();
    const k = t.getBoundingClientRect();
    const fareX = e.clientX - k.left;
    const fareY = e.clientY - k.top;
    const sahneX = (t.scrollLeft + fareX) / panoAyar.zum;
    const sahneY = (t.scrollTop + fareY) / panoAyar.zum;

    const yeni = Math.min(PANO_EN_BUYUK_ZUM, Math.max(PANO_EN_KUCUK_ZUM,
      panoAyar.zum * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    if (yeni === panoAyar.zum) return;
    panoAyar.zum = yeni;
    panoGorunumuUygula();
    t.scrollLeft = sahneX * yeni - fareX;
    t.scrollTop = sahneY * yeni - fareY;
    panoKaydet();
  }, { passive: false });

  addEventListener("mouseup", () => {
    if (etiketSurukleme) {
      const p = pencereAl(etiketSurukleme.pencereId);
      const etiket = p?.etiketler?.find((x) => x.id === etiketSurukleme.etiketId);
      if (etiket && etiketSurukleme.x !== undefined) {
        etiket.x = Number(etiketSurukleme.x.toFixed(1));
        etiket.y = Number(etiketSurukleme.y.toFixed(1));
        panoKaydet();
      }
      etiketSurukleme.el.classList.remove("tasiniyor");
      etiketSurukleme = null;
      return;
    }
    if (panoSurukleme?.tasindi || panoBoyutlandirma?.degisti) {
      panoKaydet();
      if (panoBoyutlandirma?.degisti) panoCiz();   // grafikler yeni boyuta göre yeniden çizilsin
      else panoGorunumuUygula();
    }
    panoKaydirmaOldu = !!panoKaydirma?.tasindi;
    if (panoKaydirma) t.classList.remove("kaydiriliyor");
    panoSurukleme = null;
    panoBoyutlandirma = null;
    panoKaydirma = null;
  });

  t.addEventListener("click", (e) => {
    if (panoKaydirmaOldu) { panoKaydirmaOldu = false; return; }
    const el = e.target.closest(".pano-pencere");
    if (!el) return;
    if (e.target.closest(".pano-sil")) { pencereSil(el.dataset.id); return; }
    if (e.target.closest(".pano-ayar")) pencereAyarDiyalogu(el.dataset.id);
  });

  t.addEventListener("dblclick", (e) => {
    const el = e.target.closest(".pano-pencere");
    if (el) pencereAyarDiyalogu(el.dataset.id);
  });

  addEventListener("keydown", (e) => {
    if (e.key === "z" || e.key === "Z") panoZBasili = true;
  });
  addEventListener("keyup", (e) => {
    if (e.key === "z" || e.key === "Z") panoZBasili = false;
  });
}

/* ================= Başlat ================= */

function panoKur() {
  panoYukle();
  if (panoKuruldu) { panoCiz(); return; }
  panoKuruldu = true;

  document.getElementById("panoHazirlar").addEventListener("click", (e) => {
    const btn = e.target.closest(".pano-hazir");
    if (!btn) return;
    panoAyar.hazir = btn.dataset.hazir;
    panoAyar.bas = null;
    panoAyar.son = null;
    panoKaydet();
    panoCiz();
  });

  for (const id of ["panoBas", "panoSon"]) {
    document.getElementById(id).addEventListener("change", (e) => {
      panoAyar[id === "panoBas" ? "bas" : "son"] = Number(e.target.value) || null;
      panoAyar.hazir = "elle";
      panoKaydet();
      panoCiz();
    });
  }

  document.getElementById("panoEkle").addEventListener("click", pencereEkleDiyalogu);
  document.getElementById("panoSigdir").addEventListener("click", () => {
    ekranaSigdir();
    panoTuval().scrollTo(0, 0);
  });
  // Yüzde adım adım: tekerlek kaba, düğmeler ince ayar için
  document.getElementById("panoZumAzalt").addEventListener("click", () => zumAdimla(-1));
  document.getElementById("panoZumArtir").addEventListener("click", () => zumAdimla(+1));

  panoOlaylariBagla();

  // Ekran ya da pencere boyutu değişince pano yeniden uyar
  let tazelemeZamani = null;
  addEventListener("resize", () => {
    if (panoAyar.olcek !== "sigdir") return;
    if (document.getElementById("sayfa-pano")?.hidden) return;
    clearTimeout(tazelemeZamani);
    tazelemeZamani = setTimeout(panoGorunumuUygula, 120);
  });

  for (const olay of ["veri-degisti"]) {
    document.addEventListener(olay, () => {
      if (document.getElementById("sayfa-pano")?.hidden) panoBekliyor = true;
      else panoCiz();
    });
  }

  panoCiz();
}

function panoSayfasiAcildi() {
  panoBekliyor = false;
  panoCiz();
}

/**
 * Programlı pencere ekleme — analiz robotu gibi başka modüller için.
 * pencereEkle()'den farkı ayar diyaloğunu açmaması: içerik baştan verilir.
 * @returns {{id:string, ad:string}|{hata:string}}
 */
function panoPencereEkle({ tur, baslik = null, metin = "", degiskenler = [] }) {
  const t = PENCERE_TURLERI[tur];
  if (!t) return { hata: `Bilinmeyen pencere türü: ${tur}` };
  const altSinir = panoAyar.pencereler.reduce((a, p) => Math.max(a, p.y + p.boy), 0);
  const pencere = {
    id: `p${panoAyar.sonrakiNo++}`, tur,
    x: 20, y: altSinir + 20, en: t.en, boy: t.boy,
    baslik: baslik || null,
    degiskenler: t.coklu ? [...degiskenler] : degiskenler.slice(0, 1),
    ayar: tur === "metin" ? { metin } : {},
    etiketler: [],
  };
  panoAyar.pencereler.push(pencere);
  panoKaydet();
  panoCiz();
  return { id: pencere.id, ad: t.ad };
}

/** Pano pencerelerinin özeti — robot "panoda ne var" diye sorulduğunda okur. */
function panoPencereleriAl() {
  return panoAyar.pencereler.map((p) => ({
    id: p.id, tur: p.tur, turAd: PENCERE_TURLERI[p.tur]?.ad ?? p.tur,
    baslik: p.baslik, degiskenler: [...p.degiskenler],
  }));
}
