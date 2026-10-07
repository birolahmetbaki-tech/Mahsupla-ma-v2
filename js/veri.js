// Veri sayfası: Excel benzeri, sekmeli çalışma kitabı.
//
// Kitap birden çok sayfadan (sekmeden) oluşur; sekmeler ekranın altındaki
// çubukta durur. Ekranda her zaman bir sekme açıktır ve tablo işlemleri
// (hücre yazma, sütun ekleme, satır silme…) o sekmeye uygulanır. Formüller
// başka sekmelere de başvurabilir: =Fiyatlar!C aynı dönemin satırını okur.
//
// Diğer sayfalar (Hesaplanmış Değerler, Tutarlılık, Dashboard) veriye
// dosyanın sonundaki "dışa açılan erişim" fonksiyonlarıyla ulaşır.

const VERI_DEPO = "mahsupla-veri";

// Gösterilecek en fazla ondalık basamak; araç çubuğundaki düğmelerle değişir.
const EN_COK_ONDALIK = 6;
let ondalik = 2;
const bicimOnbellegi = new Map();

function bicimlendirici() {
  if (!bicimOnbellegi.has(ondalik)) {
    bicimOnbellegi.set(ondalik, new Intl.NumberFormat("tr-TR", { maximumFractionDigits: ondalik }));
  }
  return bicimOnbellegi.get(ondalik);
}

let kitap = { sayfalar: [], aktif: null };
let aktifSayfa = null;

// Açık sekmenin dizileri — tablo kodu bunlar üzerinde çalışır
let kolonlar = [];
let satirlar = [];
let kolonHaritasi = {};
let secili = null; // { satir: 0 tabanlı index, kolon: "G" }

/* ================= Depolama ================= */

// Başlık sonundaki birim ("… Tüketimi kWh") ayrı satırda gösterilir.
const BIRIM_KALIBI =
  /\s+(kWh|MWh|GWh|kW|MW|kWp|MWp|TL\/kWh|TL\/MWh|krş\/kWh|kr\/kWh|m3|m³|kg|ton|TL|₺|\$|€|%|adet|saat)\s*$/;

function basligiAyir(tam) {
  const metin = String(tam ?? "").trim();
  const e = metin.match(BIRIM_KALIBI);
  return e ? { ad: metin.slice(0, e.index).trim(), birim: e[1] } : { ad: metin, birim: "" };
}

/** Sütunun başlığı ve birimi tek metin olarak (Excel'deki hali). */
function tamBaslik(c) {
  return [c.header, c.birim].filter(Boolean).join(" ").trim();
}

function haritayiTazele() {
  kolonHaritasi = Object.fromEntries(kolonlar.map((c) => [c.col, c]));
}

/** Kayıtlı kitabın en temel yapısını doğrular; bozuk sayfaları ayıklar. */
function kitapGecerliMi(v) {
  return Array.isArray(v?.sayfalar) && v.sayfalar.length &&
    v.sayfalar.every((s) => s && s.id && Array.isArray(s.kolonlar) && s.kolonlar.length >= 2
      && Array.isArray(s.satirlar));
}

function yukle() {
  try {
    const ham = localStorage.getItem(VERI_DEPO);
    if (ham) {
      const v = JSON.parse(ham);
      if (kitapGecerliMi(v)) {
        kitap = v;
        for (const s of kitap.sayfalar) {
          s.tur = s.tur === "tesis" ? "tesis" : "genel";
          s.bilgi = s.tur === "tesis" ? { ...TESIS_BILGI_VARSAYILAN, ...(s.bilgi ?? {}) } : (s.bilgi ?? {});
          for (const c of s.kolonlar) if (c.birim === undefined) Object.assign(c, (({ ad, birim }) => ({ header: ad, birim }))(basligiAyir(c.header)));
        }
        if (Number.isInteger(v.ondalik)) ondalik = v.ondalik;
        sayfayiAktifYap(kitap.aktif);
        return;
      }
    }
  } catch (e) {
    console.warn("Kayıtlı veri okunamadı:", e);
  }
  kitap = varsayilanKitap();
  sayfayiAktifYap(kitap.aktif);
  // İlk açılışta şablon hemen saklanır: yedek ve diğer sayfalar boş kitap görmesin
  try { localStorage.setItem(VERI_DEPO, JSON.stringify(kitap)); } catch { /* depo kapalı */ }
}

/** Açık sekmeyi değiştirir (çizmeden). */
function sayfayiAktifYap(id) {
  aktifSayfa = kitap.sayfalar.find((s) => s.id === id) ?? kitap.sayfalar[0];
  kitap.aktif = aktifSayfa.id;
  kolonlar = aktifSayfa.kolonlar;
  satirlar = aktifSayfa.satirlar;
  haritayiTazele();
}

/** Açık sekmenin satırlarını değiştirir — dizi yenilendiğinde sayfa nesnesi de güncellenmeli. */
function satirlariAta(yeni) {
  aktifSayfa.satirlar = yeni;
  satirlar = yeni;
}

let kayitZamanlayici = null;

function kaydetHemen() {
  clearTimeout(kayitZamanlayici);
  kayitZamanlayici = null;
  try {
    kitap.ondalik = ondalik;
    localStorage.setItem(VERI_DEPO, JSON.stringify(kitap));
    surumArtir("veri");
    return true;
  } catch (e) {
    console.warn(e);
    return false;
  }
}

function kaydet() {
  degerOnbellegiBosalt();
  clearTimeout(kayitZamanlayici);
  kayitZamanlayici = setTimeout(() => {
    durumYaz(kaydetHemen() ? "Kaydedildi" : "Kaydedilemedi");
    document.dispatchEvent(new CustomEvent("veri-degisti"));
  }, 250);
}

addEventListener("pagehide", () => kayitZamanlayici && kaydetHemen());
addEventListener("beforeunload", () => kayitZamanlayici && kaydetHemen());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && kayitZamanlayici) kaydetHemen();
});

function durumYaz(mesaj) {
  const el = document.getElementById("durum");
  el.textContent = mesaj;
  clearTimeout(durumYaz._t);
  durumYaz._t = setTimeout(() => (el.textContent = ""), 1800);
}

/* ================= Hesaplama motoru ================= */

const bos = (v) => v === null || v === undefined || v === "";

function sayfaBul(ad) {
  if (ad === null || ad === undefined) return null;
  const aranan = String(ad).trim().toLocaleUpperCase("tr");
  return kitap.sayfalar.find((s) => s.ad.trim().toLocaleUpperCase("tr") === aranan) ?? null;
}

function kolonBul(sayfa, kolon) {
  return sayfa.kolonlar.find((c) => c.col === kolon) ?? null;
}

/**
 * Hücrenin etkin formülü:
 *  - hücreye "=" ile başlayan bir şey yazılmışsa o,
 *  - hücre boşsa ve sütunun kendi formülü varsa o,
 *  - yoksa yok.
 */
function etkinFormulS(sayfa, satirIndex, kolon) {
  const satir = sayfa.satirlar[satirIndex];
  if (!satir) return null;
  const ham = satir[kolon];
  if (formulMu(ham)) return { ifade: ham, kendi: true };
  const c = kolonBul(sayfa, kolon);
  if (bos(ham) && c?.type === "formula" && c.formula) return { ifade: "=" + c.formula, kendi: false };
  return null;
}

function etkinFormul(satirIndex, kolon) {
  return etkinFormulS(aktifSayfa, satirIndex, kolon);
}

let degerOnbellegi = new Map();
let donemDizini = new Map();   // sayfa id -> Map("yil|ay" -> satır no)
function degerOnbellegiBosalt() {
  degerOnbellegi = new Map();
  donemDizini = new Map();
}

/** Satırın dönem anahtarı ("2026|5"); YIL ya da AY yoksa null. */
function satirDonemi(satir) {
  const yil = Number(satir?.A);
  const ay = ayNumarasi(satir?.B);
  return Number.isInteger(yil) && yil > 0 && ay ? `${yil}|${ay}` : null;
}

function sayfaDonemDizini(sayfa) {
  if (!donemDizini.has(sayfa.id)) {
    const harita = new Map();
    sayfa.satirlar.forEach((s, i) => {
      const a = satirDonemi(s);
      if (a && !harita.has(a)) harita.set(a, i + 1);
    });
    donemDizini.set(sayfa.id, harita);
  }
  return donemDizini.get(sayfa.id);
}

/**
 * Başka sekmeye satırsız başvuru (Fiyatlar!C): aynı dönemin satırı.
 * Kaynak satırın dönemi yoksa aynı satır numarası kullanılır.
 */
function donemeGoreSatir(hedef, kaynak, satirNo) {
  const anahtar = satirDonemi(kaynak.satirlar[satirNo - 1]);
  if (!anahtar) return hedef.satirlar[satirNo - 1] ? satirNo : null;
  return sayfaDonemDizini(hedef).get(anahtar) ?? null;
}

/** Hücrenin hesaplanmış değeri: sayı, metin veya { hata: "#..." } */
function hucreDegeriS(sayfa, kolon, satirNo, yigin = new Set()) {
  const anahtar = sayfa.id + "|" + kolon + ":" + satirNo;
  if (degerOnbellegi.has(anahtar)) return degerOnbellegi.get(anahtar);
  if (yigin.has(anahtar)) return { hata: "#DÖNGÜ" };

  const satirIndex = satirNo - 1;
  const satir = sayfa.satirlar[satirIndex];
  if (!satir || !kolonBul(sayfa, kolon)) return null;

  const f = etkinFormulS(sayfa, satirIndex, kolon);
  let sonuc;

  if (!f) {
    const ham = satir[kolon];
    sonuc = bos(ham) ? null : ham;
  } else {
    const derlenmis = derle(f.ifade);
    if (!derlenmis) {
      sonuc = { hata: "#HATA" };
    } else {
      yigin.add(anahtar);
      const oku = (k, s, sayfaAdi) => {
        const hedef = sayfaAdi === null ? sayfa : sayfaBul(sayfaAdi);
        if (!hedef) throw { hata: "#SAYFA" };
        const no = s ?? (hedef === sayfa ? satirNo : donemeGoreSatir(hedef, sayfa, satirNo));
        if (!no) return 0;
        const v = hucreDegeriS(hedef, k, no, yigin);
        if (v && typeof v === "object") throw v;
        if (v === null || v === undefined) return 0;
        return v;
      };
      try {
        const v = derlenmis.fn(oku, FONKSIYONLAR);
        if (typeof v === "boolean") sonuc = v ? "DOĞRU" : "YANLIŞ";
        else if (typeof v === "string") sonuc = v;
        else sonuc = Number.isFinite(v) ? v : { hata: "#HATA" };
      } catch (err) {
        sonuc = err?.hata ? err : { hata: "#HATA" };
      }
      yigin.delete(anahtar);
    }
  }

  degerOnbellegi.set(anahtar, sonuc);
  return sonuc;
}

function hucreDegeri(kolon, satirNo) {
  return hucreDegeriS(aktifSayfa, kolon, satirNo);
}

/** Sütun formülünden miras alan hücre, kaynakları boşsa boş görünür. */
function kaynakDoluMu(sayfa, satirIndex, kolon, gorulen = new Set()) {
  const anahtar = sayfa.id + "|" + kolon + ":" + satirIndex;
  if (gorulen.has(anahtar)) return false;
  gorulen.add(anahtar);
  const f = etkinFormulS(sayfa, satirIndex, kolon);
  if (!f) return !bos(sayfa.satirlar[satirIndex]?.[kolon]);
  return referanslar(f.ifade).some((r) => {
    const hedef = r.sayfa === null ? sayfa : sayfaBul(r.sayfa);
    if (!hedef) return false;
    const no = r.satir ?? (hedef === sayfa ? satirIndex + 1 : donemeGoreSatir(hedef, sayfa, satirIndex + 1));
    return no ? kaynakDoluMu(hedef, no - 1, r.kolon, gorulen) : false;
  });
}

function bicimle(v) {
  if (bos(v)) return "";
  const sayi = Number(v);
  if (typeof v === "string" || !Number.isFinite(sayi)) return String(v);
  return bicimlendirici().format(sayi);
}

/**
 * Metni sayıya çevirir. Nokta ve virgül şöyle ayrıştırılır:
 *   "477380,64" -> 477380.64      (virgül ondalık)
 *   "477380.64" -> 477380.64      (tek nokta da ondalık sayılır)
 *   "5.865.885" -> 5865885        (birden çok nokta: binlik ayracı)
 *   "1.234,56"  -> 1234.56        (ikisi de varsa sondaki ondalıktır)
 *   "1,234.56"  -> 1234.56
 * Sayıya benzemeyen giriş olduğu gibi metin olarak saklanır.
 */
function sayiyaCevir(metin) {
  const t = String(metin).trim();
  if (!t) return null;
  if (!/^[-+]?[\d.,\s]*\d[\d.,\s]*$/.test(t)) return t; // sayı değil: metin olarak sakla

  const isaret = t.startsWith("-") ? -1 : 1;
  const govde = t.replace(/[\s+\-]/g, "");
  const sonNokta = govde.lastIndexOf(".");
  const sonVirgul = govde.lastIndexOf(",");
  const noktaSayisi = (govde.match(/\./g) || []).length;
  const virgulSayisi = (govde.match(/,/g) || []).length;

  let ondalikKonumu = -1;
  if (sonNokta >= 0 && sonVirgul >= 0) ondalikKonumu = Math.max(sonNokta, sonVirgul);
  else if (virgulSayisi === 1) ondalikKonumu = sonVirgul;
  else if (noktaSayisi === 1) ondalikKonumu = sonNokta;

  const tamKisim = (ondalikKonumu >= 0 ? govde.slice(0, ondalikKonumu) : govde).replace(/[.,]/g, "");
  const kesirKisim = ondalikKonumu >= 0 ? govde.slice(ondalikKonumu + 1) : "";
  if (/[.,]/.test(kesirKisim)) return t;

  const sayi = Number((tamKisim || "0") + (kesirKisim ? "." + kesirKisim : ""));
  return Number.isFinite(sayi) ? isaret * sayi : t;
}

/** Hücrenin ekranda görüneceği metin ve sınıfları. */
function hucreGorunumu(satirIndex, kolon) {
  const c = kolonHaritasi[kolon];
  const ham = satirlar[satirIndex]?.[kolon];
  const f = etkinFormul(satirIndex, kolon);

  if (!f) {
    if (c?.type === "year" || c?.type === "month" || c?.type === "text") {
      return { metin: bos(ham) ? "" : String(ham), siniflar: [], metinMi: c.type !== "year" };
    }
    const metinMi = typeof ham === "string";
    return { metin: metinMi ? ham : bicimle(ham), siniflar: [], metinMi };
  }

  const v = hucreDegeri(kolon, satirIndex + 1);
  const siniflar = [f.kendi ? "kendi-formulu" : "formul"];
  if (v && typeof v === "object") return { metin: v.hata, siniflar: [...siniflar, "hata-huc"], metinMi: false };
  if (!f.kendi && !kaynakDoluMu(aktifSayfa, satirIndex, kolon)) return { metin: "", siniflar, metinMi: false };
  return { metin: bicimle(v), siniflar, metinMi: typeof v === "string" };
}

/* ================= Çizim ================= */

const thead = document.getElementById("basliklar");
const birimSatiri = document.getElementById("birimler");
const tbody = document.getElementById("satirlar");

function basliklariCiz() {
  thead.innerHTML = "";
  birimSatiri.innerHTML = "";

  const gut = document.createElement("th");
  gut.className = "gutter";
  gut.textContent = "#";
  thead.appendChild(gut);

  const gutBirim = document.createElement("th");
  gutBirim.className = "gutter";
  gutBirim.title = "Birim satırı";
  birimSatiri.appendChild(gutBirim);

  const tesisMi = aktifSayfa.tur === "tesis";

  kolonlar.forEach((c, i) => {
    const th = document.createElement("th");
    if (i === 0) th.className = "sabit-1";
    else if (i === 1) th.className = "sabit-2";
    if (c.type === "formula") th.classList.add("formul-sutun");
    th.dataset.kolon = c.col;

    const kod = document.createElement("span");
    kod.className = "kod";
    kod.textContent = c.col;

    const metin = document.createElement("span");
    metin.className = "baslik-metin";
    metin.textContent = c.header;
    metin.title = c.type === "formula" ? `Sütun formülü: =${c.formula}` : "Adı değiştirmek için çift tıklayın";

    th.append(kod);
    if (tesisMi && c.rol && ROL_ADI[c.rol]) {
      const rozet = document.createElement("span");
      rozet.className = "rol-rozet";
      rozet.textContent = "Σ";
      rozet.title = `Hesap rolü: ${ROL_ADI[c.rol].ad}`;
      th.append(rozet);
    }

    const btn = document.createElement("button");
    btn.className = "menu-ac";
    btn.type = "button";
    btn.textContent = "▾";
    btn.dataset.menuKolon = c.col;
    btn.title = "Sütun işlemleri";

    th.append(metin, btn);
    thead.appendChild(th);

    // Birim satırı
    const bth = document.createElement("th");
    bth.className = "birim-hucre";
    if (i === 0) bth.classList.add("sabit-1");
    else if (i === 1) bth.classList.add("sabit-2");
    bth.dataset.kolon = c.col;

    const birimMetin = document.createElement("span");
    birimMetin.className = "birim-metin";
    birimMetin.contentEditable = "true";
    birimMetin.spellcheck = false;
    birimMetin.textContent = c.birim || "";
    birimMetin.title = "Birim — yazarak değiştirin";
    bth.appendChild(birimMetin);
    birimSatiri.appendChild(bth);
  });

  sutunTasimayiBagla(thead, {
    anahtar: "kolon",
    // YIL ve AY solda sabit durur; sürüklenmez, araları da hedef olmaz
    tasinabilir: (th) => !th.classList.contains("sabit-1") && !th.classList.contains("sabit-2"),
    birak: sutunuTasi,
  });
}

/**
 * Sütunu yeni yerine taşır. Sütun harfi kimliktir ve sütunla birlikte gider;
 * formüller harfe atıf yaptığı için sıra değişince bozulmaz.
 */
function sutunuTasi(kaynak, hedef, oncesine) {
  if (!diziyiTasi(kolonlar, (c) => c.col, kaynak, hedef, oncesine)) return;
  kaydet();
  ciz();
  durumYaz(`${kaynak} sütunu taşındı`);
}

function satirCiz(satirIndex) {
  const satir = satirlar[satirIndex];
  const tr = document.createElement("tr");
  tr.dataset.satir = satirIndex;
  if (ayNumarasi(satir.B) === 1) tr.dataset.yilBasi = "1";

  const gut = document.createElement("td");
  gut.className = "gutter";
  if (tr.dataset.yilBasi) gut.classList.add("yil-basi");
  gut.textContent = satirIndex + 1;
  gut.dataset.menuSatir = satirIndex;
  gut.title = "Satır işlemleri";
  tr.appendChild(gut);

  kolonlar.forEach((c, i) => {
    const td = document.createElement("td");
    td.classList.add("giris");
    if (i === 0) td.classList.add("sabit-1");
    else if (i === 1) td.classList.add("sabit-2");
    if (tr.dataset.yilBasi) td.classList.add("yil-basi");

    const huc = document.createElement("div");
    huc.className = "huc";
    huc.contentEditable = "true";
    huc.tabIndex = 0;
    huc.spellcheck = false;
    huc.dataset.kolon = c.col;
    huc.dataset.satir = satirIndex;

    td.appendChild(huc);
    hucreyiTazele(td, satirIndex, c.col);
    tr.appendChild(td);
  });
  return tr;
}

function hucreyiTazele(td, satirIndex, kolon) {
  const g = hucreGorunumu(satirIndex, kolon);
  td.classList.remove("formul", "kendi-formulu", "hata-huc");
  for (const s of g.siniflar) td.classList.add(s);
  const huc = td.firstChild;
  if (huc !== document.activeElement) huc.textContent = g.metin;
  huc.classList.toggle("metin", !!g.metinMi);
  // İpucu: formül ve yuvarlanmamış tam değer
  const f = etkinFormul(satirIndex, kolon);
  const parcalar = [];
  if (f) parcalar.push(`=${f.ifade.replace(/^=/, "")}`);
  const tamDeger = f ? hucreDegeri(kolon, satirIndex + 1) : satirlar[satirIndex]?.[kolon];
  if (typeof tamDeger === "number" && !Number.isInteger(tamDeger)) {
    parcalar.push(tamDeger.toLocaleString("tr-TR", { maximumFractionDigits: 10 }));
  }
  huc.title = parcalar.join("  →  ");
}

function govdeyiCiz() {
  degerOnbellegiBosalt();
  const parca = document.createDocumentFragment();
  satirlar.forEach((_, i) => parca.appendChild(satirCiz(i)));
  tbody.innerHTML = "";
  tbody.appendChild(parca);
  seciliyiIsaretle();
}

function ciz() {
  haritayiTazele();
  basliklariCiz();
  govdeyiCiz();
  sekmeleriCiz();
}

/** Veri değişti: DOM'u yeniden kurmadan tüm hücreleri güncelle. */
function degerleriTazele() {
  degerOnbellegiBosalt();
  for (const tr of tbody.children) {
    const satirIndex = +tr.dataset.satir;
    kolonlar.forEach((c, i) => {
      const td = tr.children[i + 1];
      if (td) hucreyiTazele(td, satirIndex, c.col);
    });
  }
}

function imlecSona(el) {
  el.focus();
  const aralik = document.createRange();
  aralik.selectNodeContents(el);
  aralik.collapse(false);
  const sec = window.getSelection();
  sec.removeAllRanges();
  sec.addRange(aralik);
}

/* ================= Seçim ve formül çubuğu ================= */

const adresKutusu = document.getElementById("adres");
const formulGirisi = document.getElementById("formulGirisi");
const formulBilgi = document.getElementById("formulBilgi");

function hamMetin(satirIndex, kolon) {
  const ham = satirlar[satirIndex]?.[kolon];
  return bos(ham) ? "" : String(ham);
}

function seciliyiIsaretle() {
  tbody.querySelectorAll("td.secili").forEach((td) => td.classList.remove("secili"));
  if (!secili) return;
  const i = kolonlar.findIndex((c) => c.col === secili.kolon);
  tbody.children[secili.satir]?.children[i + 1]?.classList.add("secili");
}

function secimiGoster() {
  if (!secili) {
    adresKutusu.value = "";
    formulGirisi.value = "";
    formulGirisi.disabled = true;
    formulBilgi.textContent = "";
    return;
  }
  const { satir, kolon } = secili;
  formulGirisi.disabled = false;
  adresKutusu.value = `${kolon}${satir + 1}`;
  adresKutusu.title = `${aktifSayfa.ad} · ${kolonHaritasi[kolon]?.header ?? ""}`;

  const f = etkinFormul(satir, kolon);
  // Sütundan miras alınan formül de çubukta görünür; kullanıcı dokunmazsa hücreye yazılmaz.
  formulGirisi.value = f ? f.ifade : hamMetin(satir, kolon);
  formulGirisi.dataset.baslangic = formulGirisi.value;

  formulBilgi.classList.remove("hatali");
  if (!f) {
    formulBilgi.textContent = "";
  } else if (!derle(f.ifade)) {
    formulBilgi.textContent = "Geçersiz formül";
    formulBilgi.classList.add("hatali");
  } else {
    const v = hucreDegeri(kolon, satir + 1);
    const sonuc = v && typeof v === "object" ? v.hata : bicimle(v);
    formulBilgi.textContent = f.kendi ? `Hücre formülü → ${sonuc}` : `Sütun formülü (tüm sütun) → ${sonuc}`;
  }
}

function sec(satirIndex, kolon) {
  secili = { satir: satirIndex, kolon };
  seciliyiIsaretle();
  secimiGoster();
}

/** Bir hücreye değer/formül yazar. */
function hucreyiYaz(satirIndex, kolon, metin) {
  const tip = kolonHaritasi[kolon]?.type;
  const t = String(metin ?? "").trim();
  let deger;

  if (!t) deger = null;
  else if (t.startsWith("=")) deger = t;
  else if (tip === "month" || tip === "text") deger = t;
  else if (tip === "year") deger = Number(t) || t;
  else deger = sayiyaCevir(t);

  const satir = satirlar[satirIndex];
  if (!satir || satir[kolon] === deger) return false;
  satir[kolon] = deger;
  kaydet();
  return true;
}

function cubuguIsle() {
  if (!secili) return false;
  if (formulGirisi.value === formulGirisi.dataset.baslangic) return false;
  return hucreyiYaz(secili.satir, secili.kolon, formulGirisi.value);
}

formulGirisi.addEventListener("keydown", (e) => {
  if (!secili) return;
  if (e.key === "Enter") {
    e.preventDefault();
    cubuguIsle();
    degerleriTazele();
    const sonraki = Math.min(secili.satir + 1, satirlar.length - 1);
    sec(sonraki, secili.kolon);
    odakla(sonraki, secili.kolon);
  } else if (e.key === "Escape") {
    e.preventDefault();
    secimiGoster();
    odakla(secili.satir, secili.kolon);
  }
});

formulGirisi.addEventListener("blur", () => {
  if (cubuguIsle()) {
    degerleriTazele();
    secimiGoster();
  }
});

function odakla(satirIndex, kolon) {
  tbody.querySelector(`tr[data-satir="${satirIndex}"] .huc[data-kolon="${kolon}"]`)?.focus();
}

/* ================= Hücre düzenleme ================= */

tbody.addEventListener("focusin", (e) => {
  const huc = e.target.closest(".huc");
  if (!huc) return;
  const satirIndex = +huc.dataset.satir;
  const kolon = huc.dataset.kolon;
  sec(satirIndex, kolon);
  // Düzenlemede ham içerik görünür: formül ise formülün kendisi.
  huc.textContent = hamMetin(satirIndex, kolon);
  imlecSona(huc);
});

tbody.addEventListener("focusout", (e) => {
  const huc = e.target.closest(".huc");
  if (!huc) return;
  const satirIndex = +huc.dataset.satir;
  const kolon = huc.dataset.kolon;
  const degisti = hucreyiYaz(satirIndex, kolon, huc.textContent);
  if (degisti) degerleriTazele();
  else {
    const td = huc.parentElement;
    huc.textContent = "";           // etkin öğe kontrolünü atlat
    hucreyiTazele(td, satirIndex, kolon);
  }
  secimiGoster();
});

tbody.addEventListener("input", () => {
  if (!secili) return;
  const huc = document.activeElement;
  if (huc?.classList?.contains("huc")) {
    formulGirisi.value = huc.textContent;
    formulGirisi.dataset.baslangic = formulGirisi.value;
  }
});

tbody.addEventListener("keydown", (e) => {
  const huc = e.target.closest(".huc");
  if (!huc) return;

  if (e.key === "Delete" && !huc.textContent) {
    e.preventDefault();
    hucreyiYaz(+huc.dataset.satir, huc.dataset.kolon, "");
    degerleriTazele();
    secimiGoster();
    return;
  }

  // Ctrl + PageUp / PageDown: Excel'deki gibi önceki / sonraki sekme
  if (e.ctrlKey && (e.key === "PageUp" || e.key === "PageDown")) {
    e.preventDefault();
    sekmeKaydir(e.key === "PageUp" ? -1 : 1);
    return;
  }

  const yonler = {
    ArrowUp: [-1, 0], ArrowDown: [1, 0],
    Enter: [1, 0], Tab: [0, e.shiftKey ? -1 : 1],
  };
  const yon = yonler[e.key];
  if (!yon) return;
  if ((e.key === "ArrowUp" || e.key === "ArrowDown") && e.altKey) return;
  e.preventDefault();

  const [dy, dx] = yon;
  const hedefSatir = Math.min(Math.max(+huc.dataset.satir + dy, 0), satirlar.length - 1);
  const su = kolonlar.findIndex((c) => c.col === huc.dataset.kolon);
  const hedefKolon = kolonlar[Math.min(Math.max(su + dx, 0), kolonlar.length - 1)].col;

  huc.blur();
  odakla(hedefSatir, hedefKolon);
});

/* ================= Başlık düzenleme ================= */

thead.addEventListener("dblclick", (e) => {
  const metin = e.target.closest(".baslik-metin");
  if (!metin) return;
  metin.contentEditable = "true";
  imlecSona(metin);
});

thead.addEventListener("keydown", (e) => {
  const metin = e.target.closest(".baslik-metin");
  if (!metin || metin.contentEditable !== "true") return;
  if (e.key === "Enter") { e.preventDefault(); metin.blur(); }
  if (e.key === "Escape") {
    metin.textContent = kolonHaritasi[metin.closest("th").dataset.kolon].header;
    metin.blur();
  }
});

thead.addEventListener("focusout", (e) => {
  const metin = e.target.closest(".baslik-metin");
  if (!metin || metin.contentEditable !== "true") return;
  metin.contentEditable = "false";
  const c = kolonHaritasi[metin.closest("th").dataset.kolon];
  const yeni = metin.textContent.trim();
  if (yeni && yeni !== c.header) {
    c.header = yeni;
    kaydet();
    durumYaz("Başlık güncellendi");
  }
  metin.textContent = c.header;
});

/* ================= Birim satırı ================= */

birimSatiri.addEventListener("keydown", (e) => {
  const el = e.target.closest(".birim-metin");
  if (!el) return;
  if (e.key === "Enter") { e.preventDefault(); el.blur(); }
  if (e.key === "Escape") {
    el.textContent = kolonHaritasi[el.closest("th").dataset.kolon]?.birim || "";
    el.blur();
  }
});

birimSatiri.addEventListener("focusout", (e) => {
  const el = e.target.closest(".birim-metin");
  if (!el) return;
  const c = kolonHaritasi[el.closest("th").dataset.kolon];
  if (!c) return;
  const yeni = el.textContent.trim();
  if (yeni !== (c.birim || "")) {
    c.birim = yeni;
    kaydet();
    durumYaz("Birim güncellendi");
  }
  el.textContent = c.birim || "";
});

/* ================= Menüler ================= */

const menu = document.getElementById("menu");

function menuAc(x, y, ogeler) {
  menu.innerHTML = "";
  for (const o of ogeler) {
    if (o === "-") { menu.appendChild(document.createElement("hr")); continue; }
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = o.etiket;
    if (o.tehlike) b.className = "danger";
    if (o.pasif) b.disabled = true;
    b.addEventListener("click", () => { menuKapat(); o.calistir(); });
    menu.appendChild(b);
  }
  menu.hidden = false;
  const g = menu.getBoundingClientRect();
  menu.style.left = Math.max(4, Math.min(x, innerWidth - g.width - 8)) + "px";
  menu.style.top = Math.max(4, Math.min(y, innerHeight - g.height - 8)) + "px";
}

function menuKapat() { menu.hidden = true; }

document.addEventListener("click", (e) => {
  if (!menu.hidden && !menu.contains(e.target)) menuKapat();
});
document.addEventListener("keydown", (e) => e.key === "Escape" && menuKapat());

thead.addEventListener("click", (e) => {
  const btn = e.target.closest(".menu-ac");
  if (!btn) return;
  e.stopPropagation();
  const c = kolonHaritasi[btn.dataset.menuKolon];
  const index = kolonlar.indexOf(c);
  const g = btn.getBoundingClientRect();
  const sabit = c.type === "year" || c.type === "month";

  menuAc(g.left, g.bottom + 4, [
    { etiket: "Yeniden adlandır", calistir: () => {
        const m = thead.querySelector(`th[data-kolon="${c.col}"] .baslik-metin`);
        m.contentEditable = "true"; imlecSona(m);
      } },
    ...(sabit ? [] : [
      { etiket: c.type === "formula" ? "Sütun formülünü düzenle" : "Sütuna formül ver",
        calistir: () => sutunFormulDiyalogu(c) },
      ...(c.type === "formula"
        ? [{ etiket: "Sütun formülünü kaldır", calistir: () => {
              delete c.formula; c.type = "input";
              kaydet(); ciz(); durumYaz("Sütun formülü kaldırıldı");
            } }]
        : []),
      ...(c.type !== "formula"
        ? [{ etiket: c.type === "text" ? "Sayı sütununa çevir" : "Metin sütununa çevir", calistir: () => {
              c.type = c.type === "text" ? "input" : "text";
              if (c.type === "text") delete c.rol;
              kaydet(); ciz(); durumYaz("Sütun türü değişti");
            } }]
        : []),
      ...(aktifSayfa.tur === "tesis" && c.type !== "text"
        ? [{ etiket: `Hesap rolü: ${c.rol ? ROL_ADI[c.rol]?.ad ?? c.rol : "yok"}…`,
             calistir: () => rolDiyalogu(c) }]
        : []),
    ]),
    "-",
    { etiket: "Sola sütun ekle", calistir: () => sutunEkleDiyalogu(Math.max(index, 2)) },
    { etiket: "Sağa sütun ekle", calistir: () => sutunEkleDiyalogu(Math.max(index + 1, 2)) },
    "-",
    { etiket: sabit ? "YIL/AY silinemez" : "Sütunu sil", tehlike: !sabit, pasif: sabit, calistir: () => {
        if (sabit) return;
        if (!confirm(`"${c.header}" sütunu ve içindeki veriler silinecek. Onaylıyor musunuz?`)) return;
        kolonlar.splice(index, 1);
        for (const s of satirlar) delete s[c.col];
        if (secili?.kolon === c.col) secili = null;
        kaydet(); ciz(); secimiGoster(); durumYaz("Sütun silindi");
      } },
  ]);
});

tbody.addEventListener("click", (e) => {
  const gut = e.target.closest("td.gutter");
  if (!gut) return;
  e.stopPropagation();
  const i = +gut.dataset.menuSatir;
  const g = gut.getBoundingClientRect();
  menuAc(g.right + 4, g.top, [
    { etiket: "Üste satır ekle", calistir: () => satirEkle(i) },
    { etiket: "Alta satır ekle", calistir: () => satirEkle(i + 1) },
    "-",
    { etiket: "Satırı sil", tehlike: true, calistir: () => {
        if (satirlar.length <= 1) return durumYaz("Son satır silinemez");
        satirlar.splice(i, 1);
        secili = null;
        kaydet(); govdeyiCiz(); secimiGoster(); durumYaz("Satır silindi");
      } },
  ]);
});

/* ================= Diyaloglar ================= */

const FORMUL_YARDIM =
  `<p class="yardim">Sütun formülünde harf tek başına yazılır ve <b>aynı satırı</b> gösterir:
   <code>MİN(C;D)</code>, <code>TOPLA(H:J)</code>, <code>D-E</code>.
   Belirli bir satır için <code>G3</code>, aralık için <code>TOPLA(C1:C12)</code> yazın.
   Başka sekme: <code>Fiyatlar!C</code> aynı dönemin satırını okur.</p>`;

function rolSecenekleri(secili) {
  return `<option value="">— rol yok (hesapta kullanılmaz) —</option>` +
    MAHSUP_ROLLERI.map((r) => `<option value="${r.anahtar}" ${r.anahtar === secili ? "selected" : ""}>${
      kacisla(r.ad)} (${kacisla(r.birim)})</option>`).join("");
}

function sutunEkleDiyalogu(konum) {
  const tesisMi = aktifSayfa.tur === "tesis";
  diyalogAc(
    `<h2>Yeni sütun — ${kacisla(aktifSayfa.ad)}</h2>
     <label><span>Başlık</span><input type="text" id="d-ad" placeholder="Örn. Depo tüketimi kWh"></label>
     <div class="alan-ikili">
       <label><span>Tür</span>
         <select id="d-tur">
           <option value="input">Sayı</option>
           <option value="text">Metin (açıklama, not)</option>
         </select></label>
       ${tesisMi ? `<label><span>Hesap rolü</span><select id="d-rol">${rolSecenekleri("")}</select></label>` : ""}
     </div>
     <label><span>Sütun formülü (isteğe bağlı)</span>
       <input type="text" id="d-formul" placeholder="Boş bırakırsanız veri sütunu olur"></label>
     ${FORMUL_YARDIM}
     <p class="hata" id="d-hata"></p>
     <div class="dugmeler">
       <button type="button" id="d-iptal">İptal</button>
       <button type="button" id="d-tamam" class="birincil">Ekle</button>
     </div>`,
    (k) => {
      const rolSec = k.querySelector("#d-rol");
      let rolElle = false;
      rolSec?.addEventListener("change", () => { rolElle = true; });
      k.querySelector("#d-ad").addEventListener("input", (e) => {
        if (!rolSec || rolElle) return;
        const { ad, birim } = basligiAyir(e.target.value);
        rolSec.value = rolTahmin(ad, birim) ?? "";
      });
      k.querySelector("#d-iptal").addEventListener("click", diyalogKapat);
      k.querySelector("#d-tamam").addEventListener("click", () => {
        const ad = k.querySelector("#d-ad").value.trim();
        const hata = k.querySelector("#d-hata");
        if (!ad) return (hata.textContent = "Başlık boş olamaz.");
        const f = k.querySelector("#d-formul").value.trim().replace(/^=/, "");
        const tur = k.querySelector("#d-tur").value;
        const { ad: sutunAdi, birim } = basligiAyir(ad);
        const yeni = { col: yeniKolonHarfi(), header: sutunAdi, birim,
                       type: f ? "formula" : tur };
        if (f) {
          if (!formulGecerliMi(f)) return (hata.textContent = "Formül geçersiz. Örnek: MİN(C;D), D-E, Fiyatlar!C");
          yeni.formula = f;
        } else {
          for (const s of satirlar) s[yeni.col] = null;
        }
        if (rolSec?.value && yeni.type !== "text") yeni.rol = rolSec.value;
        kolonlar.splice(konum, 0, yeni);
        kaydet(); ciz(); diyalogKapat(); durumYaz(`${yeni.col} sütunu eklendi`);
      });
    }
  );
}

function sutunFormulDiyalogu(c) {
  diyalogAc(
    `<h2>Sütun formülü — ${kacisla(c.header)}</h2>
     <label><span>${c.col} sütunundaki boş hücreler için formül</span>
       <input type="text" id="d-formul" value="${kacisla(c.formula || "")}"
              placeholder="Örn. MİN(C;D)"></label>
     ${FORMUL_YARDIM}
     <p class="yardim">Boş bırakırsanız sütun formülü kaldırılır.
        Tek bir hücreye farklı değer ya da formül yazmak için doğrudan o hücreye yazın.</p>
     <p class="hata" id="d-hata"></p>
     <div class="dugmeler">
       <button type="button" id="d-iptal">İptal</button>
       <button type="button" id="d-tamam" class="birincil">Kaydet</button>
     </div>`,
    (k) => {
      k.querySelector("#d-iptal").addEventListener("click", diyalogKapat);
      k.querySelector("#d-tamam").addEventListener("click", () => {
        const f = k.querySelector("#d-formul").value.trim().replace(/^=/, "");
        if (!f) {
          delete c.formula; c.type = "input";
        } else {
          if (!formulGecerliMi(f)) {
            k.querySelector("#d-hata").textContent = "Formül geçersiz. Örnek: MİN(C;D), D-E, Fiyatlar!C";
            return;
          }
          if (referanslar(f).some((r) => r.kolon === c.col && r.satir === null && r.sayfa === null)) {
            k.querySelector("#d-hata").textContent = "Sütun formülü kendi sütununa referans veremez.";
            return;
          }
          c.type = "formula"; c.formula = f;
        }
        kaydet(); ciz(); secimiGoster(); diyalogKapat(); durumYaz("Sütun formülü güncellendi");
      });
    }
  );
}

function rolDiyalogu(c) {
  const rolBilgisi = (anahtar) => ROL_ADI[anahtar]?.aciklama ?? "Bu sütun hesaplarda kullanılmaz.";
  diyalogAc(
    `<h2>Hesap rolü — ${kacisla(c.header)}</h2>
     <p class="yardim">Hesaplanmış Değerler sayfası sütunları adlarından değil rollerinden tanır.
        Aynı role birden çok sütun verirseniz (örneğin iki tüketim sayacı) değerleri toplanır.</p>
     <label><span>Rol</span><select id="r-rol">${rolSecenekleri(c.rol ?? "")}</select></label>
     <p class="yardim" id="r-aciklama">${kacisla(rolBilgisi(c.rol))}</p>
     <div class="dugmeler">
       <button type="button" id="r-iptal">İptal</button>
       <button type="button" id="r-tamam" class="birincil">Kaydet</button>
     </div>`,
    (k) => {
      const sec = k.querySelector("#r-rol");
      sec.addEventListener("change", () => {
        k.querySelector("#r-aciklama").textContent = rolBilgisi(sec.value);
      });
      k.querySelector("#r-iptal").addEventListener("click", diyalogKapat);
      k.querySelector("#r-tamam").addEventListener("click", () => {
        if (sec.value) c.rol = sec.value; else delete c.rol;
        kaydet(); ciz(); diyalogKapat(); durumYaz("Hesap rolü güncellendi");
      });
    }
  );
}

/* ================= Satır / sütun ekleme ================= */

function yeniKolonHarfiS(liste) {
  const kullanilan = new Set(liste.map((c) => c.col));
  let no = 1;
  while (kullanilan.has(kolonHarfi(no))) no++;
  const enBuyuk = Math.max(...liste.map((c) => kolonNo(c.col)));
  return kolonHarfi(Math.max(no, enBuyuk + 1));
}

function yeniKolonHarfi() { return yeniKolonHarfiS(kolonlar); }

function satirEkle(konum) {
  const komsu = satirlar[Math.min(konum, satirlar.length - 1)] ?? {};
  const ayNo = ayNumarasi(komsu.B);
  satirlar.splice(konum, 0, bosSatirOlustur(kolonlar,
    komsu.A ?? new Date().getFullYear(),
    ayNo ? AYLAR[ayNo % 12] : AYLAR[0]
  ));
  kaydet(); govdeyiCiz(); durumYaz("Satır eklendi");
  tbody.children[konum]?.scrollIntoView({ block: "nearest" });
}

function ondaligiGoster() {
  const el = document.getElementById("ondalikDeger");
  if (el) el.textContent = ondalik;
  document.getElementById("ondalikAzalt").disabled = ondalik <= 0;
  document.getElementById("ondalikArtir").disabled = ondalik >= EN_COK_ONDALIK;
}

function ondaligiDegistir(fark) {
  const yeni = Math.min(EN_COK_ONDALIK, Math.max(0, ondalik + fark));
  if (yeni === ondalik) return;
  ondalik = yeni;
  ondaligiGoster();
  kaydet();
  degerleriTazele();
  secimiGoster();
  durumYaz(`Ondalık basamak: ${ondalik}`);
}

document.getElementById("ondalikAzalt").addEventListener("click", () => ondaligiDegistir(-1));
document.getElementById("ondalikArtir").addEventListener("click", () => ondaligiDegistir(+1));

document.getElementById("satirEkle").addEventListener("click", () => satirEkle(satirlar.length));
document.getElementById("sutunEkle").addEventListener("click", () => sutunEkleDiyalogu(kolonlar.length));

document.getElementById("yilEkle").addEventListener("click", () => {
  const yil = Math.max(...satirlar.map((s) => Number(s.A) || 0), ILK_YIL - 1) + 1;
  for (const ay of AYLAR) satirlar.push(bosSatirOlustur(kolonlar, yil, ay));
  kaydet(); govdeyiCiz(); durumYaz(`${yil} eklendi`);
});

/**
 * Bütün sekmeleri Excel'e yazar — her sekme ayrı bir Excel sayfası olur.
 * Başlık satırı birimi de içerir ("Tüketim kWh"); içe aktarma da bu biçimi
 * okuduğu için dosya geri yüklenebilir. Formül sütunları hesaplanmış
 * değerleriyle gider.
 */
function veriyiDisaAktar() {
  const sayfalar = kitap.sayfalar.map((sayfa) => {
    const baslik = sayfa.kolonlar.map(tamBaslik);
    const govde = sayfa.satirlar.map((_, i) =>
      sayfa.kolonlar.map((c) => aktarimDegeri(hucreDegeriS(sayfa, c.col, i + 1))));
    return { ad: sayfa.ad, satirlar: [baslik, ...govde] };
  });
  const ad = calismaKitabiIndir("mahsupla-veri", sayfalar);
  durumYaz(ad ? `${sayfalar.length} sekme aktarıldı` : "Aktarılamadı");
}

document.getElementById("veriDisaAktar").addEventListener("click", veriyiDisaAktar);

document.getElementById("sablonaDon").addEventListener("click", () => {
  const sablonAdi = aktifSayfa.sablon && SAYFA_SABLONLARI[aktifSayfa.sablon]
    ? aktifSayfa.sablon : aktifSayfa.tur === "tesis" ? "tesis" : "bos";
  if (!confirm(`"${aktifSayfa.ad}" sekmesinin sütun düzeni ve verileri silinip ` +
      `"${SAYFA_SABLONLARI[sablonAdi].ad}" şablonuna dönülecek. Onaylıyor musunuz?`)) return;
  const yeni = sablondanSayfa(sablonAdi, aktifSayfa.ad);
  fiyatBaglantisiniUyarla(yeni);
  aktifSayfa.kolonlar = yeni.kolonlar;
  aktifSayfa.tur = yeni.tur;
  aktifSayfa.sablon = sablonAdi;
  if (yeni.tur === "tesis") aktifSayfa.bilgi = { ...TESIS_BILGI_VARSAYILAN, ...aktifSayfa.bilgi };
  aktifSayfa.satirlar = yeni.satirlar;
  sayfayiAktifYap(aktifSayfa.id);
  secili = null;
  kaydet(); ciz(); secimiGoster(); durumYaz("Şablona dönüldü");
});

document.getElementById("temizle").addEventListener("click", () => {
  if (!confirm(`"${aktifSayfa.ad}" sekmesine girilen veriler silinecek (YIL, AY ve sütun düzeni korunur). Onaylıyor musunuz?`)) return;
  for (const s of satirlar) {
    for (const c of kolonlar) if (c.type !== "year" && c.type !== "month") s[c.col] = null;
  }
  secili = null;
  kaydet(); govdeyiCiz(); secimiGoster(); durumYaz("Veriler temizlendi");
});

/* ================= Sekmeler ================= */

const sekmeCubugu = document.getElementById("sekmeler");
let surukelenenSekme = null;

const SEKME_RENKLERI = ["#2f7d32", "#1f6feb", "#b45309", "#7c3aed", "#be123c", "#0e7490", "#4b5563"];

function sekmeleriCiz() {
  if (!sekmeCubugu) return;
  sekmeCubugu.innerHTML = kitap.sayfalar.map((s) => `
    <button type="button" class="sekme-dugme${s.id === aktifSayfa.id ? " secili" : ""}${
      s.tur === "tesis" ? " tesis" : ""}"
            data-sayfa="${s.id}" draggable="true"
            title="${kacisla(s.tur === "tesis" ? "Mahsuplaşma tesisi" : "Genel sayfa")} — çift tıkla: adlandır · sağ tık: işlemler"
            ${s.renk ? `style="--sekme-renk:${kacisla(s.renk)}"` : ""}>
      ${s.tur === "tesis" ? `<span class="sekme-simge" aria-hidden="true">⚡</span>` : ""}
      <span class="sekme-ad">${kacisla(s.ad)}</span>
    </button>`).join("");
  sekmeCubugu.querySelector(".sekme-dugme.secili")?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/** Sekmeye geçer. */
function sayfaSec(id) {
  if (id === aktifSayfa.id) return;
  // Düzenlenmekte olan hücre önce yazılsın
  if (document.activeElement?.classList?.contains("huc")) document.activeElement.blur();
  sayfayiAktifYap(id);
  secili = null;
  ciz();
  secimiGoster();
  kitap.aktif = id;
  try { localStorage.setItem(VERI_DEPO, JSON.stringify(kitap)); } catch { /* önemli değil */ }
  document.getElementById("grid")?.closest(".grid-wrap")?.scrollTo(0, 0);
}

function sekmeKaydir(fark) {
  const i = kitap.sayfalar.findIndex((s) => s.id === aktifSayfa.id);
  const hedef = kitap.sayfalar[(i + fark + kitap.sayfalar.length) % kitap.sayfalar.length];
  sayfaSec(hedef.id);
  requestAnimationFrame(() => odakla(0, kolonlar[2]?.col ?? "A"));
}

/** Kitap içinde eşsiz bir sekme adı üretir: "Tesis 2", "Tesis 2 (2)"… */
function essizAd(temel, haric = null) {
  const kullanilan = new Set(kitap.sayfalar.filter((s) => s.id !== haric)
    .map((s) => s.ad.trim().toLocaleUpperCase("tr")));
  let ad = temel.trim() || "Sayfa";
  let n = 2;
  const kok = ad;
  while (kullanilan.has(ad.toLocaleUpperCase("tr"))) ad = `${kok} (${n++})`;
  return ad;
}

function sayfaAdiGecerliMi(ad) {
  return !!ad && !/[!'\[\]*?/\\:]/.test(ad) && ad.length <= 40;
}

/**
 * Sekme adı değişince formüllerdeki başvurular da değişir — Excel'deki gibi.
 * "Eski!C" ve "'Eski ad'!C" yazımları yeni adla değiştirilir.
 */
function formullerdeSayfaAdiniDegistir(eski, yeni) {
  const kacir = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const desen = new RegExp(`(^|[^A-Za-z0-9_.ÇĞİÖŞÜçğıöşü'])(?:'${kacir(eski)}'|${kacir(eski)})!`, "gi");
  const yaz = sayfaAdiFormulde(yeni);
  const degistir = (f) => f.replace(desen, (_, on) => `${on}${yaz}!`);
  let sayac = 0;
  for (const sayfa of kitap.sayfalar) {
    for (const c of sayfa.kolonlar) {
      if (c.formula) {
        const y = degistir(c.formula);
        if (y !== c.formula) { c.formula = y; sayac++; }
      }
    }
    for (const satir of sayfa.satirlar) {
      for (const [k, v] of Object.entries(satir)) {
        if (!formulMu(v)) continue;
        const y = degistir(v);
        if (y !== v) { satir[k] = y; sayac++; }
      }
    }
  }
  return sayac;
}

function sayfayiAdlandir(sayfa, yeniAd) {
  const ad = String(yeniAd ?? "").trim();
  if (!ad || ad === sayfa.ad) return false;
  if (!sayfaAdiGecerliMi(ad)) {
    alert("Sekme adı boş olamaz, 40 karakteri geçemez ve ! ' [ ] * ? / \\ : içeremez.");
    return false;
  }
  if (sayfaBul(ad) && sayfaBul(ad) !== sayfa) {
    alert(`"${ad}" adında bir sekme zaten var.`);
    return false;
  }
  const eski = sayfa.ad;
  sayfa.ad = ad;
  const n = formullerdeSayfaAdiniDegistir(eski, ad);
  kaydet();
  ciz();
  durumYaz(n ? `Sekme adlandırıldı · ${n} formül güncellendi` : "Sekme adlandırıldı");
  return true;
}

function sekmeAdlandirmayiBaslat(id) {
  const btn = sekmeCubugu.querySelector(`.sekme-dugme[data-sayfa="${id}"]`);
  const sayfa = kitap.sayfalar.find((s) => s.id === id);
  if (!btn || !sayfa) return;
  const etiket = btn.querySelector(".sekme-ad");
  btn.draggable = false;
  etiket.contentEditable = "true";
  imlecSona(etiket);
  const bitir = (kaydedilsin) => {
    etiket.removeEventListener("keydown", tus);
    etiket.contentEditable = "false";
    btn.draggable = true;
    if (!kaydedilsin || !sayfayiAdlandir(sayfa, etiket.textContent)) etiket.textContent = sayfa.ad;
  };
  const tus = (e) => {
    if (e.key === "Enter") { e.preventDefault(); etiket.blur(); }
    if (e.key === "Escape") { e.preventDefault(); bitir(false); }
    e.stopPropagation();
  };
  etiket.addEventListener("keydown", tus);
  etiket.addEventListener("blur", () => { if (etiket.contentEditable === "true") bitir(true); }, { once: true });
}

function yeniSayfaDiyalogu() {
  const yillar = satirlar.map((s) => Number(s.A)).filter((y) => Number.isInteger(y) && y > 1900);
  const ilk = yillar.length ? Math.min(...yillar) : ILK_YIL;
  const son = yillar.length ? Math.max(...yillar) : SON_YIL;
  diyalogAc(
    `<h2>Yeni sekme</h2>
     <label><span>Sekme adı</span><input type="text" id="n-ad" value="${kacisla(essizAd(`Tesis ${
       kitap.sayfalar.filter((s) => s.tur === "tesis").length + 1}`))}"></label>
     <div class="pencere-secim">
       ${Object.entries(SAYFA_SABLONLARI).map(([anahtar, s], i) => `
         <label class="pencere-turu sablon-secim">
           <input type="radio" name="n-sablon" value="${anahtar}" ${i === 0 ? "checked" : ""}>
           <b>${kacisla(s.ad)}</b><span>${kacisla(s.aciklama)}</span>
         </label>`).join("")}
     </div>
     <div class="alan-ikili">
       <label><span>İlk yıl</span><input type="number" id="n-ilk" value="${ilk}" min="2000" max="2100"></label>
       <label><span>Son yıl</span><input type="number" id="n-son" value="${son}" min="2000" max="2100"></label>
     </div>
     <p class="hata" id="n-hata"></p>
     <div class="dugmeler">
       <button type="button" id="n-iptal">İptal</button>
       <button type="button" id="n-tamam" class="birincil">Ekle</button>
     </div>`,
    (k) => {
      const adKutusu = k.querySelector("#n-ad");
      let adElle = false;
      adKutusu.addEventListener("input", () => { adElle = true; });
      for (const r of k.querySelectorAll('input[name="n-sablon"]')) {
        r.addEventListener("change", () => {
          if (adElle) return;
          adKutusu.value = essizAd(r.value === "tesis"
            ? `Tesis ${kitap.sayfalar.filter((s) => s.tur === "tesis").length + 1}`
            : r.value === "fiyat" ? "Fiyatlar" : `Sayfa ${kitap.sayfalar.length + 1}`);
        });
      }
      k.querySelector("#n-iptal").addEventListener("click", diyalogKapat);
      k.querySelector("#n-tamam").addEventListener("click", () => {
        const hata = k.querySelector("#n-hata");
        const ad = adKutusu.value.trim();
        if (!sayfaAdiGecerliMi(ad)) return (hata.textContent = "Ad boş olamaz ve ! ' [ ] * ? / \\ : içeremez.");
        if (sayfaBul(ad)) return (hata.textContent = `"${ad}" adında bir sekme zaten var.`);
        const ilkYil = Number(k.querySelector("#n-ilk").value);
        const sonYil = Number(k.querySelector("#n-son").value);
        if (!Number.isInteger(ilkYil) || !Number.isInteger(sonYil) || sonYil < ilkYil || sonYil - ilkYil > 50) {
          return (hata.textContent = "Yıl aralığı geçersiz.");
        }
        const sablon = k.querySelector('input[name="n-sablon"]:checked').value;
        const yeni = sablondanSayfa(sablon, ad, { ilk: ilkYil, son: sonYil });
        fiyatBaglantisiniUyarla(yeni);
        const i = kitap.sayfalar.findIndex((s) => s.id === aktifSayfa.id);
        kitap.sayfalar.splice(i + 1, 0, yeni);
        diyalogKapat();
        sayfayiAktifYap(yeni.id);
        secili = null;
        kaydet(); ciz(); secimiGoster();
        durumYaz(`"${ad}" sekmesi eklendi`);
        if (yeni.tur === "tesis") tesisBilgileriDiyalogu(yeni.id);
      });
    },
    { genis: true }
  );
}

/**
 * Şablondan gelen tesis sekmesinin fiyat formülünü (=Fiyatlar!C) kitaptaki
 * fiyat sekmesine bağlar. Fiyat sekmesi yeniden adlandırılmışsa yeni adı
 * kullanılır; hiç yoksa sütun elle girilen veri sütunu olur.
 */
function fiyatBaglantisiniUyarla(sayfa) {
  const fiyat = kitap.sayfalar.find((s) => s.sablon === "fiyat") ?? sayfaBul("Fiyatlar");
  for (const c of sayfa.kolonlar) {
    if (c.type !== "formula" || !/^Fiyatlar!/.test(c.formula ?? "")) continue;
    if (fiyat) c.formula = c.formula.replace(/^Fiyatlar!/, `${sayfaAdiFormulde(fiyat.ad)}!`);
    else { c.type = "input"; delete c.formula; for (const r of sayfa.satirlar) r[c.col] ??= null; }
  }
}

function sayfayiCogalt(sayfa) {
  const kopya = structuredClone(sayfa);
  kopya.id = yeniSayfaKimligi();
  kopya.ad = essizAd(`${sayfa.ad} (kopya)`);
  const i = kitap.sayfalar.indexOf(sayfa);
  kitap.sayfalar.splice(i + 1, 0, kopya);
  sayfayiAktifYap(kopya.id);
  secili = null;
  kaydet(); ciz(); secimiGoster();
  durumYaz(`"${kopya.ad}" oluşturuldu`);
}

function sayfayiSil(sayfa) {
  if (kitap.sayfalar.length <= 1) return alert("Kitapta en az bir sekme kalmalı.");
  if (!confirm(`"${sayfa.ad}" sekmesi ve içindeki tüm veriler silinecek. ` +
      `Bu sekmeye başvuran formüller #SAYFA hatası verir. Onaylıyor musunuz?`)) return;
  const i = kitap.sayfalar.indexOf(sayfa);
  kitap.sayfalar.splice(i, 1);
  sayfayiAktifYap(kitap.sayfalar[Math.max(0, i - 1)].id);
  secili = null;
  kaydet(); ciz(); secimiGoster();
  durumYaz("Sekme silindi");
}

function sayfayiTasi(sayfa, fark) {
  const i = kitap.sayfalar.indexOf(sayfa);
  const j = i + fark;
  if (j < 0 || j >= kitap.sayfalar.length) return;
  kitap.sayfalar.splice(i, 1);
  kitap.sayfalar.splice(j, 0, sayfa);
  kaydet(); sekmeleriCiz();
}

function sekmeRengiDiyalogu(sayfa) {
  diyalogAc(
    `<h2>Sekme rengi — ${kacisla(sayfa.ad)}</h2>
     <div class="renk-secim">
       <button type="button" class="renk-kutu yok" data-renk="" title="Renk yok">∅</button>
       ${SEKME_RENKLERI.map((r) => `<button type="button" class="renk-kutu" data-renk="${r}"
          style="background:${r}" title="${r}"></button>`).join("")}
     </div>
     <div class="dugmeler"><span class="dugme-bosluk"></span>
       <button type="button" id="rk-kapat">Kapat</button></div>`,
    (k) => {
      k.querySelector("#rk-kapat").addEventListener("click", diyalogKapat);
      for (const b of k.querySelectorAll(".renk-kutu")) {
        b.addEventListener("click", () => {
          sayfa.renk = b.dataset.renk || null;
          kaydet(); sekmeleriCiz(); diyalogKapat();
        });
      }
    }
  );
}

function sekmeMenusu(sayfa, x, y) {
  const i = kitap.sayfalar.indexOf(sayfa);
  menuAc(x, y, [
    { etiket: "Yeniden adlandır", calistir: () => sekmeAdlandirmayiBaslat(sayfa.id) },
    ...(sayfa.tur === "tesis"
      ? [{ etiket: "Tesis bilgileri…", calistir: () => tesisBilgileriDiyalogu(sayfa.id) },
         { etiket: "Genel sayfaya çevir (hesaplara katılmasın)", calistir: () => {
             sayfa.tur = "genel"; kaydet(); ciz(); durumYaz("Sekme genel sayfa oldu");
           } }]
      : [{ etiket: "Tesis sayfasına çevir (hesaplara katılsın)", calistir: () => {
             sayfa.tur = "tesis";
             sayfa.bilgi = { ...TESIS_BILGI_VARSAYILAN, ...(sayfa.bilgi ?? {}) };
             for (const c of sayfa.kolonlar) {
               if (!c.rol && c.type !== "year" && c.type !== "month" && c.type !== "text") {
                 const r = rolTahmin(c.header, c.birim);
                 if (r) c.rol = r;
               }
             }
             kaydet(); ciz(); tesisBilgileriDiyalogu(sayfa.id);
           } }]),
    { etiket: "Sekme rengi…", calistir: () => sekmeRengiDiyalogu(sayfa) },
    "-",
    { etiket: "Çoğalt", calistir: () => sayfayiCogalt(sayfa) },
    { etiket: "Sola taşı", pasif: i === 0, calistir: () => sayfayiTasi(sayfa, -1) },
    { etiket: "Sağa taşı", pasif: i === kitap.sayfalar.length - 1, calistir: () => sayfayiTasi(sayfa, +1) },
    "-",
    { etiket: "Sekmeyi sil", tehlike: true, pasif: kitap.sayfalar.length <= 1, calistir: () => sayfayiSil(sayfa) },
  ]);
}

if (sekmeCubugu) {
  sekmeCubugu.addEventListener("click", (e) => {
    const btn = e.target.closest(".sekme-dugme");
    if (!btn || btn.querySelector('[contenteditable="true"]')) return;
    sayfaSec(btn.dataset.sayfa);
  });
  sekmeCubugu.addEventListener("dblclick", (e) => {
    const btn = e.target.closest(".sekme-dugme");
    if (btn) sekmeAdlandirmayiBaslat(btn.dataset.sayfa);
  });
  sekmeCubugu.addEventListener("contextmenu", (e) => {
    const btn = e.target.closest(".sekme-dugme");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const sayfa = kitap.sayfalar.find((s) => s.id === btn.dataset.sayfa);
    if (sayfa) sekmeMenusu(sayfa, e.clientX, e.clientY - 4);
  });

  // Sürükleyerek sıralama
  sekmeCubugu.addEventListener("dragstart", (e) => {
    const btn = e.target.closest(".sekme-dugme");
    if (!btn) return;
    surukelenenSekme = btn.dataset.sayfa;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", surukelenenSekme);
    btn.classList.add("surukleniyor");
  });
  sekmeCubugu.addEventListener("dragover", (e) => {
    if (!surukelenenSekme) return;
    const btn = e.target.closest(".sekme-dugme");
    e.preventDefault();
    for (const b of sekmeCubugu.querySelectorAll(".birak-sol, .birak-sag")) b.classList.remove("birak-sol", "birak-sag");
    if (!btn || btn.dataset.sayfa === surukelenenSekme) return;
    const k = btn.getBoundingClientRect();
    btn.classList.add(e.clientX < k.left + k.width / 2 ? "birak-sol" : "birak-sag");
  });
  sekmeCubugu.addEventListener("drop", (e) => {
    e.preventDefault();
    const btn = e.target.closest(".sekme-dugme");
    const kaynak = kitap.sayfalar.find((s) => s.id === surukelenenSekme);
    if (btn && kaynak && btn.dataset.sayfa !== kaynak.id) {
      const oncesine = btn.classList.contains("birak-sol");
      if (diziyiTasi(kitap.sayfalar, (s) => s.id, kaynak.id, btn.dataset.sayfa, oncesine)) kaydet();
    }
    surukelenenSekme = null;
    sekmeleriCiz();
  });
  sekmeCubugu.addEventListener("dragend", () => {
    surukelenenSekme = null;
    sekmeleriCiz();
  });
}

document.getElementById("sekmeEkle")?.addEventListener("click", yeniSayfaDiyalogu);
document.getElementById("sekmeOnceki")?.addEventListener("click", () => sekmeKaydir(-1));
document.getElementById("sekmeSonraki")?.addEventListener("click", () => sekmeKaydir(+1));
document.getElementById("sekmeListesi")?.addEventListener("click", (e) => {
  const g = e.currentTarget.getBoundingClientRect();
  menuAc(g.left, g.top - 8 - Math.min(kitap.sayfalar.length, 14) * 30,
    kitap.sayfalar.map((s) => ({
      etiket: `${s.id === aktifSayfa.id ? "● " : ""}${s.ad}${s.tur === "tesis" ? "  ⚡" : ""}`,
      calistir: () => sayfaSec(s.id),
    })));
});

/* ================= Tesis bilgileri ================= */

function tesisBilgileriDiyalogu(id) {
  const sayfa = kitap.sayfalar.find((s) => s.id === id);
  if (!sayfa || sayfa.tur !== "tesis") return;
  const b = { ...TESIS_BILGI_VARSAYILAN, ...(sayfa.bilgi ?? {}) };
  const secim = (harita, deger) => Object.entries(harita).map(([k, ad]) =>
    `<option value="${k}" ${k === deger ? "selected" : ""}>${kacisla(ad)}</option>`).join("");
  const sayi = (v) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

  diyalogAc(
    `<h2>Tesis bilgileri — ${kacisla(sayfa.ad)}</h2>
     <p class="yardim">Bu bilgiler hesaplarda kullanılır: yıllık 2× limit, kapasite faktörü ve
        10 yıllık destek süresi. Aylık değerler sekmedeki tabloya girilir.</p>
     <div class="alan-ikili">
       <label><span>Kaynak türü</span><select id="t-kaynak">${secim(KAYNAK_TURLERI, b.kaynak)}</select></label>
       <label><span>Kurulu güç (kWp / kWe)</span><input type="text" id="t-guc" value="${sayi(b.kuruluGuc)}"></label>
     </div>
     <div class="alan-ikili">
       <label><span>Tüketim abone grubu</span><select id="t-abone">${secim(ABONE_GRUPLARI, b.aboneGrubu)}</select></label>
       <label><span>Sözleşme gücü (kW)</span><input type="text" id="t-sozlesme" value="${sayi(b.sozlesmeGucu)}"></label>
     </div>
     <div class="alan-ikili">
       <label><span>Mahsuplaşma periyodu</span>
         <select id="t-periyot">
           <option value="saatlik" ${b.periyot === "saatlik" ? "selected" : ""}>Saatlik (1 Mayıs 2026 sonrası, mesken dışı)</option>
           <option value="aylik" ${b.periyot === "aylik" ? "selected" : ""}>Aylık (mesken ve önceki dönem)</option>
         </select></label>
       <label><span>Ölçüm noktası</span>
         <select id="t-olcum">
           <option value="ayni" ${b.olcumNoktasi === "ayni" ? "selected" : ""}>Aynı ölçüm noktası</option>
           <option value="farkli" ${b.olcumNoktasi === "farkli" ? "selected" : ""}>Farklı ölçüm noktası</option>
         </select></label>
     </div>
     <div class="alan-uclu">
       <label><span>İşletmeye giriş (YYYY-AA)</span><input type="month" id="t-isletme" value="${kacisla(b.isletmeTarihi ?? "")}"></label>
       <label><span>Limit referans tüketimi (kWh/yıl)</span>
         <input type="text" id="t-referans" value="${sayi(b.referansTuketim)}" placeholder="Boş: önceki yılın tüketimi"></label>
       <label><span>Limit katsayısı</span><input type="text" id="t-katsayi" value="${sayi(b.limitKatsayi)}"></label>
     </div>
     <label><span>Not</span><textarea id="t-not" rows="2">${kacisla(b.not ?? "")}</textarea></label>
     <p class="yardim">Mesken abone grubunda yıllık limit uygulanmaz ve mahsuplaşma aylıktır.
        Limit, takvim yılı içinde mahsuplaşan enerji ile satılan ihtiyaç fazlasının toplamına uygulanır;
        aşan ihtiyaç fazlası YEKDEM'e bedelsiz katkı sayılır.</p>
     <p class="hata" id="t-hata"></p>
     <div class="dugmeler">
       <button type="button" id="t-iptal">İptal</button>
       <button type="button" id="t-tamam" class="birincil">Kaydet</button>
     </div>`,
    (k) => {
      const abone = k.querySelector("#t-abone");
      abone.addEventListener("change", () => {
        if (abone.value === "mesken") k.querySelector("#t-periyot").value = "aylik";
      });
      k.querySelector("#t-iptal").addEventListener("click", diyalogKapat);
      k.querySelector("#t-tamam").addEventListener("click", () => {
        const hata = k.querySelector("#t-hata");
        const oku = (sec) => {
          const t = k.querySelector(sec).value.trim();
          if (!t) return null;
          const v = sayiyaCevir(t);
          return typeof v === "number" ? v : NaN;
        };
        const yeni = {
          kaynak: k.querySelector("#t-kaynak").value,
          kuruluGuc: oku("#t-guc"),
          sozlesmeGucu: oku("#t-sozlesme"),
          aboneGrubu: abone.value,
          periyot: k.querySelector("#t-periyot").value,
          olcumNoktasi: k.querySelector("#t-olcum").value,
          isletmeTarihi: k.querySelector("#t-isletme").value,
          referansTuketim: oku("#t-referans"),
          limitKatsayi: oku("#t-katsayi") ?? 2,
          not: k.querySelector("#t-not").value,
        };
        for (const a of ["kuruluGuc", "sozlesmeGucu", "referansTuketim", "limitKatsayi"]) {
          if (Number.isNaN(yeni[a]) || (yeni[a] !== null && yeni[a] < 0)) {
            return (hata.textContent = "Güç, tüketim ve katsayı alanları pozitif sayı olmalı.");
          }
        }
        sayfa.bilgi = yeni;
        kaydet();
        diyalogKapat();
        durumYaz("Tesis bilgileri kaydedildi");
      });
    },
    { genis: true }
  );
}

/* ================= Excel içe aktarma ================= */

const normalize = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");

document.getElementById("dosya").addEventListener("change", async (e) => {
  const dosya = e.target.files?.[0];
  e.target.value = "";
  if (!dosya) return;
  try {
    durumYaz("Okunuyor…");
    const wb = XLSX.read(await dosya.arrayBuffer(), { type: "array" });
    const tablolar = wb.SheetNames.map((ad) => ({
      ad,
      tablo: XLSX.utils.sheet_to_json(wb.Sheets[ad], { header: 1, raw: true, defval: null, blankrows: false }),
    })).filter((t) => t.tablo.length >= 2);
    if (!tablolar.length) return durumYaz("Dosyada veri yok");
    iceAktarDiyalogu(dosya.name, tablolar);
  } catch (err) {
    console.error(err);
    alert("Dosya okunamadı: " + err.message);
  }
});

function iceAktarDiyalogu(dosyaAdi, tablolar) {
  const coklu = tablolar.length > 1;
  diyalogAc(
    `<h2>Excel içe aktar</h2>
     <p><b>${kacisla(dosyaAdi)}</b> · ${tablolar.length} sayfa:
        ${tablolar.map((t) => `${kacisla(t.ad)} (${t.tablo.length - 1} satır)`).join(", ")}</p>
     <label><span>Hangi Excel sayfası?</span>
       <select id="d-kaynak">
         ${coklu ? `<option value="__hepsi">Tümü — her Excel sayfası yeni bir sekme olsun</option>` : ""}
         ${tablolar.map((t, i) => `<option value="${i}">${kacisla(t.ad)}</option>`).join("")}
       </select></label>
     <label id="d-hedefAlan"><span>Nereye?</span>
       <select id="d-hedef">
         <option value="aktif">Açık sekmeye (${kacisla(aktifSayfa.ad)})</option>
         <option value="yeni">Yeni sekmeye</option>
       </select></label>
     <div id="d-aktifAyar">
       <label><span>Mevcut satırlar ne olsun?</span>
         <select id="d-mod">
           <option value="degistir">Silinsin, dosyadaki satırlar yüklensin</option>
           <option value="ekle">Korunsun, dosyadaki satırlar sona eklensin</option>
         </select>
       </label>
       <label><span>Eşleşmeyen başlıklar</span>
         <select id="d-yeni">
           <option value="ekle">Yeni sütun olarak eklensin</option>
           <option value="atla">Yok sayılsın</option>
         </select>
       </label>
     </div>
     <p class="yardim">İlk satır başlık sayılır; YIL ve AY başlıklı sütunlar dönemi belirler.
        Sütun formülü olan sütunlar dosyadan okunmaz; formülleri burada yeniden hesaplanır.
        Yeni sütunların hesap rolü başlığından tahmin edilir.</p>
     <div class="dugmeler">
       <button type="button" id="d-iptal">İptal</button>
       <button type="button" id="d-tamam" class="birincil">İçe Aktar</button>
     </div>`,
    (k) => {
      const kaynak = k.querySelector("#d-kaynak");
      const hedef = k.querySelector("#d-hedef");
      const uyumla = () => {
        const hepsi = kaynak.value === "__hepsi";
        k.querySelector("#d-hedefAlan").hidden = hepsi;
        k.querySelector("#d-aktifAyar").hidden = hepsi || hedef.value !== "aktif";
      };
      kaynak.addEventListener("change", uyumla);
      hedef.addEventListener("change", uyumla);
      uyumla();
      k.querySelector("#d-iptal").addEventListener("click", diyalogKapat);
      k.querySelector("#d-tamam").addEventListener("click", () => {
        const secim = kaynak.value;
        const mod = k.querySelector("#d-mod").value;
        const yeniMod = k.querySelector("#d-yeni").value;
        diyalogKapat();
        if (secim === "__hepsi") {
          for (const t of tablolar) yeniSekmeyeAktar(t.ad, t.tablo);
          ciz(); secimiGoster();
          durumYaz(`${tablolar.length} sekme eklendi`);
        } else if (hedef.value === "yeni") {
          const t = tablolar[Number(secim)];
          const n = yeniSekmeyeAktar(t.ad, t.tablo);
          ciz(); secimiGoster();
          durumYaz(`${n} satır yeni sekmeye aktarıldı`);
        } else {
          iceAktar(tablolar[Number(secim)].tablo, mod, yeniMod);
        }
      });
    }
  );
}

/** Başlık satırını açık sekmenin sütunlarına eşler; eksikleri ekler. */
function basliklariEsle(basliklar, yeniMod, tesisMi) {
  const mevcut = new Map();
  for (const c of kolonlar) {
    mevcut.set(normalize(tamBaslik(c)), c);
    if (!mevcut.has(normalize(c.header))) mevcut.set(normalize(c.header), c);
  }
  return basliklar.map((h) => {
    if (!h) return null;
    const c = mevcut.get(normalize(h));
    if (c) return c;
    if (yeniMod === "atla") return null;
    const { ad, birim } = basligiAyir(h);
    const eklenen = { col: yeniKolonHarfi(), header: ad, birim, type: "input" };
    const rol = tesisMi ? rolTahmin(ad, birim) : null;
    if (rol) eklenen.rol = rol;
    kolonlar.push(eklenen);
    mevcut.set(normalize(h), eklenen);
    for (const s of satirlar) s[eklenen.col] = null;
    return eklenen;
  });
}

function tablodanSatirlar(tablo, hedefler) {
  const gelen = [];
  for (let i = 1; i < tablo.length; i++) {
    const kaynak = tablo[i];
    if (!kaynak || kaynak.every(bos)) continue;
    const s = {};
    for (const c of kolonlar) if (c.type !== "formula") s[c.col] = null;
    hedefler.forEach((c, j) => {
      if (!c || c.type === "formula") return;
      const v = kaynak[j];
      if (bos(v)) return;
      if (c.type === "month") s[c.col] = typeof v === "number" && ayNumarasi(v) ? AYLAR[v - 1] : String(v).trim();
      else if (c.type === "text") s[c.col] = String(v).trim();
      else if (c.type === "year") s[c.col] = Number(v) || String(v).trim();
      else s[c.col] = typeof v === "number" ? v : sayiyaCevir(v);
    });
    gelen.push(s);
  }
  return gelen;
}

const basliklarinTemizi = (tablo) => tablo[0].map((h) => String(h ?? "").replace(/\s+/g, " ").trim());

function iceAktar(tablo, mod, yeniMod) {
  const hedefler = basliklariEsle(basliklarinTemizi(tablo), yeniMod, aktifSayfa.tur === "tesis");
  haritayiTazele();
  const gelen = tablodanSatirlar(tablo, hedefler);
  if (!gelen.length) return durumYaz("Aktarılacak satır bulunamadı");
  satirlariAta(mod === "degistir" ? gelen : satirlar.concat(gelen));
  secili = null;
  kaydet(); ciz(); secimiGoster();
  durumYaz(`${gelen.length} satır aktarıldı`);
}

/**
 * Excel sayfasını yeni bir sekmeye aktarır. Sekme YIL ve AY ile başlar;
 * başlığında tüketim ya da üretim geçen bir sütun varsa tesis sekmesi olur.
 */
function yeniSekmeyeAktar(ad, tablo) {
  const basliklar = basliklarinTemizi(tablo);
  const tesisMi = basliklar.some((h) => ["tuketim", "uretim"].includes(rolTahmin(...Object.values(basligiAyir(h)))));
  const sayfa = {
    id: yeniSayfaKimligi(),
    ad: essizAd(String(ad).replace(/[!'\[\]*?/\\:]/g, " ").trim().slice(0, 40) || "Sayfa"),
    tur: tesisMi ? "tesis" : "genel",
    sablon: tesisMi ? "tesis" : "bos",
    renk: null,
    kolonlar: [{ col: "A", header: "YIL", type: "year" }, { col: "B", header: "AY", type: "month" }],
    satirlar: [],
    bilgi: tesisMi ? { ...TESIS_BILGI_VARSAYILAN } : {},
  };
  kitap.sayfalar.push(sayfa);
  sayfayiAktifYap(sayfa.id);
  const hedefler = basliklariEsle(basliklar, "ekle", tesisMi);
  haritayiTazele();
  satirlariAta(tablodanSatirlar(tablo, hedefler));
  if (!satirlar.length) satirlariAta([bosSatirOlustur(kolonlar, new Date().getFullYear(), AYLAR[0])]);
  secili = null;
  kaydet();
  return satirlar.length;
}

/* ================= Dışa açılan erişim ================= */
// Hesaplanmış Değerler, Tutarlılık ve Dashboard veriye buradan ulaşır.

/** [{ id, ad, tur, bilgi }] — kitaptaki sekmeler, sırasıyla */
function sayfalariAl() {
  return kitap.sayfalar.map((s) => ({ id: s.id, ad: s.ad, tur: s.tur, bilgi: s.bilgi ?? {} }));
}

function tesisSayfalariAl() {
  return sayfalariAl().filter((s) => s.tur === "tesis");
}

function sayfaAl(id) {
  const s = kitap.sayfalar.find((x) => x.id === id);
  return s ? { id: s.id, ad: s.ad, tur: s.tur, bilgi: s.bilgi ?? {} } : null;
}

/** [{ col, header, birim, type, rol }] — sekmenin sütunları */
function sayfaKolonlari(id) {
  const s = kitap.sayfalar.find((x) => x.id === id);
  return s ? s.kolonlar.map((c) => ({ col: c.col, header: c.header, birim: c.birim || "",
                                       type: c.type, rol: c.rol ?? null })) : [];
}

/** [{ no, yil, ay, ayNo, anahtar, etiket }] — sekmenin satırları (no 1 tabanlı) */
function sayfaSatirlari(id) {
  const s = kitap.sayfalar.find((x) => x.id === id);
  if (!s) return [];
  return s.satirlar.map((r, i) => {
    const yil = Number(r.A) || null;
    const ayNo = ayNumarasi(r.B);
    return {
      no: i + 1, yil, ay: r.B ?? null, ayNo,
      anahtar: yil && ayNo ? `${yil}|${ayNo}` : null,
      etiket: [r.A, r.B].filter((v) => !bos(v)).join(" ") || `Satır ${i + 1}`,
    };
  });
}

/**
 * Bütün sekmelerdeki dönemlerin birleşimi, takvim sırasıyla. Hesaplanmış
 * Değerler ve Dashboard bu ortak eksen üzerinde çalışır; her sekmenin değeri
 * dönemine göre bulunur.
 */
function donemleriAl() {
  const kume = new Map();
  for (const s of kitap.sayfalar) {
    for (const r of s.satirlar) {
      const a = satirDonemi(r);
      if (a && !kume.has(a)) {
        const [yil, ayNo] = a.split("|").map(Number);
        kume.set(a, { yil, ayNo });
      }
    }
  }
  return [...kume.entries()]
    .sort((x, y) => x[1].yil - y[1].yil || x[1].ayNo - y[1].ayNo)
    .map(([anahtar, d], i) => ({
      no: i + 1, anahtar, yil: d.yil, ayNo: d.ayNo, ay: AYLAR[d.ayNo - 1],
      etiket: `${d.yil} ${AYLAR[d.ayNo - 1]}`,
    }));
}

/** Dönemin sekmedeki satır numarası (yoksa null). */
function donemSatiri(id, anahtar) {
  const s = kitap.sayfalar.find((x) => x.id === id);
  return s && anahtar ? sayfaDonemDizini(s).get(anahtar) ?? null : null;
}

/** Sekmedeki bir hücrenin hesaplanmış değeri: sayı, metin, null veya { hata } */
function sayfaDegeri(id, kolon, satirNo) {
  const s = kitap.sayfalar.find((x) => x.id === id);
  if (!s || satirNo < 1 || satirNo > s.satirlar.length) return null;
  return hucreDegeriS(s, kolon, satirNo);
}

/** Hücrenin ham (hesaplanmamış) içeriği: sayı, metin, formül veya null. */
function sayfaHamDegeri(id, kolon, satirNo) {
  return kitap.sayfalar.find((x) => x.id === id)?.satirlar[satirNo - 1]?.[kolon] ?? null;
}

function sayiBicimle(v) {
  return bicimle(v);
}

/** Veri sayfasını açıp ilgili sekmeye geçer, hücreyi seçer ve görünür yapar. */
function hucreyeGit(id, kolon, satirNo) {
  const s = kitap.sayfalar.find((x) => x.id === id);
  if (!s) return false;
  if (s.id !== aktifSayfa.id) sayfaSec(s.id);
  const satirIndex = satirNo - 1;
  if (!kolonHaritasi[kolon] || !satirlar[satirIndex]) return false;
  sec(satirIndex, kolon);
  const huc = tbody.querySelector(`tr[data-satir="${satirIndex}"] .huc[data-kolon="${kolon}"]`);
  huc?.scrollIntoView({ block: "center", inline: "center" });
  huc?.focus();
  return true;
}

/** Sekmenin sütunlarına rol yazar: { "C": "tuketim", "K": null } */
function sayfaRolleriniYaz(id, roller) {
  const s = kitap.sayfalar.find((x) => x.id === id);
  if (!s) return;
  for (const c of s.kolonlar) {
    if (!(c.col in roller)) continue;
    if (roller[c.col]) c.rol = roller[c.col]; else delete c.rol;
  }
  kaydet();
  if (s.id === aktifSayfa.id) ciz();
}

/** Açık sekme — robot ve diğer sayfalar için. */
function aktifSayfaAl() {
  return sayfaAl(aktifSayfa.id);
}

/* ================= Başlat ================= */

yukle();
ondaligiGoster();
ciz();
secimiGoster();
