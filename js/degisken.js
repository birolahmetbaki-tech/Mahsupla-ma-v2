// Ortak değişken kaydı: Dashboard ve robot aynı havuzdan seçim yapar.
// İki kaynak vardır ve ikisi de tek bir anahtarla adreslenir:
//   veri sütunu       -> "k:<sekmeId>:<sütun>"
//   hesap göstergesi  -> "g:<tesisId>::<göstergeId>"   (tesisId "toplam" olabilir)
//
// Değerler dönem eksenine (donemleriAl) göre okunur: her sekmenin değeri
// dönemine (YIL + AY) göre bulunur. Böylece bir grafik farklı sekmelerden
// gelen serileri yan yana çizebilir.

let degiskenHaritasi = new Map();

const dSayi = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Havuzu güncel veri ve tesislere göre yeniden kurar. */
function degiskenleriTazele() {
  const harita = new Map();

  for (const t of hesapTesisleri()) {
    for (const g of gorunurGostergeListesi()) {
      const anahtar = `g:${t.id}::${g.id}`;
      harita.set(anahtar, {
        anahtar, tur: "gosterge", tesisId: t.id, gostergeId: g.id,
        header: t.toplam ? g.ad : `${t.ad} · ${g.ad}`, birim: g.birim, basamak: g.basamak,
        grup: t.ad, tamAd: `${t.ad} · ${g.ad}`, aciklama: g.aciklama, yon: g.yon ?? null,
      });
    }
  }

  for (const s of sayfalariAl()) {
    for (const c of sayfaKolonlari(s.id)) {
      if (c.type === "year" || c.type === "month" || c.type === "text") continue;
      const anahtar = `k:${s.id}:${c.col}`;
      harita.set(anahtar, {
        anahtar, tur: "kolon", sayfaId: s.id, kolon: c.col, col: c.col,
        header: `${s.ad} · ${c.header}`, birim: c.birim || "",
        grup: `Veri · ${s.ad}`, tamAd: `${s.ad} · ${c.col} — ${c.header}`,
      });
    }
  }

  degiskenHaritasi = harita;
  return harita;
}

function degiskenleriAl() { return degiskenHaritasi; }

function degiskenAl(anahtar) {
  return anahtar ? degiskenHaritasi.get(anahtar) ?? null : null;
}

function degiskenAdi(anahtar) {
  return degiskenAl(anahtar)?.tamAd ?? anahtar ?? "—";
}

function degiskenBirimi(anahtar) {
  return degiskenAl(anahtar)?.birim || "";
}

function kolonDonemDegeri(d, donem) {
  const satirNo = donemSatiri(d.sayfaId, donem.anahtar);
  return satirNo ? dSayi(sayfaDegeri(d.sayfaId, d.kolon, satirNo)) : null;
}

/** Tek dönemin değeri (dönem numarası). */
function degiskenDegeri(anahtar, no) {
  const d = degiskenAl(anahtar);
  if (!d) return null;
  if (d.tur === "gosterge") return gostergeDegeri(d.tesisId, d.gostergeId, no);
  const donem = mahsupSonucu().donemler[no - 1];
  return donem ? kolonDonemDegeri(d, donem) : null;
}

/** Dönem dönem değerler. */
function degiskenSerisi(anahtar, donemler) {
  const d = degiskenAl(anahtar);
  if (!d) return donemler.map(() => null);
  if (d.tur === "gosterge") return donemler.map((p) => gostergeDegeri(d.tesisId, d.gostergeId, p.no));
  return donemler.map((p) => kolonDonemDegeri(d, p));
}

/**
 * Dönem aralığının tek değeri. Sütunlarda toplam, göstergelerde motorun
 * aralık hesabı — oran göstergelerinde ortalamaların ortalaması yanlış
 * olacağı için pay ve payda ayrı ayrı toplanır.
 */
function degiskenAraligi(anahtar, nolar) {
  const d = degiskenAl(anahtar);
  if (!d) return null;
  if (d.tur === "gosterge") return aralikDegeri(d.tesisId, d.gostergeId, nolar);
  const donemler = mahsupSonucu().donemler;
  let toplam = 0;
  let varMi = false;
  for (const no of nolar) {
    const p = donemler[no - 1];
    const v = p ? kolonDonemDegeri(d, p) : null;
    if (v !== null) { toplam += v; varMi = true; }
  }
  return varMi ? toplam : null;
}

/** Göstergede "iyi" olan yön: "yuksek" | "dusuk" | null. */
function degiskenYonu(anahtar) {
  return degiskenAl(anahtar)?.yon ?? null;
}

/** Değişkenin hedefi (limit kullanımı için yıllık limit). */
function degiskenHedefi(anahtar, nolar) {
  const d = degiskenAl(anahtar);
  if (!d || d.tur !== "gosterge" || !nolar?.length) return null;
  const h = gostergeHedefi(d.tesisId, d.gostergeId, nolar);
  return h === null ? null : { deger: h, ad: GOSTERGE[GOSTERGE[d.gostergeId].hedefId]?.ad ?? "Hedef" };
}

/* ================= Arayüz yardımcıları ================= */

/** Kaynağına göre gruplar: önce hesap göstergeleri (toplam, tesisler), sonra veri sekmeleri. */
function degiskenGruplari() {
  const gruplar = new Map();
  for (const d of degiskenHaritasi.values()) {
    if (!gruplar.has(d.grup)) gruplar.set(d.grup, []);
    gruplar.get(d.grup).push(d);
  }
  return gruplar;
}

/*
 * Açılır listede iç içe optgroup olmadığı için kaynak, grup adının başına
 * konan Σ ile belirtilir: Σ işareti Hesaplanmış Değerler sayfasının
 * simgesidir, o gruplar oradan gelir.
 */
function degiskenSecenekleri(secili, { bos = false } = {}) {
  const secenek = (d) => {
    const etiket = d.tur === "gosterge"
      ? `${GOSTERGE[d.gostergeId]?.ad ?? d.header}${d.birim ? ` (${d.birim})` : ""}`
      : `${d.col} — ${d.header.split(" · ").slice(1).join(" · ")}${d.birim ? ` (${d.birim})` : ""}`;
    return `<option value="${kacisla(d.anahtar)}" ${d.anahtar === secili ? "selected" : ""}>${kacisla(etiket)}</option>`;
  };
  return (bos ? `<option value="">— yok —</option>` : "") +
    [...degiskenGruplari().entries()].map(([grup, liste]) => {
      const hesaplanan = liste[0]?.tur === "gosterge";
      return `<optgroup label="${kacisla(hesaplanan ? `Σ ${grup}` : grup)}">${
        liste.map(secenek).join("")}</optgroup>`;
    }).join("");
}

/**
 * Çoklu seçim listesi. Değişkenler iki kaynaktan gelir ve hangisinden
 * geldiği listede açıkça yazar: Hesaplanmış Değerler'in göstergeleri ve
 * veri sekmelerinin sütunları.
 */
function degiskenListesiHtml(secili) {
  const kume = new Set(secili ?? []);
  const gruplar = [...degiskenGruplari().entries()];
  const say = (tur) => gruplar.filter(([, l]) => l[0]?.tur === tur).reduce((a, [, l]) => a + l.length, 0);
  let gostergeBasligi = false;
  let kolonBasligi = false;

  return gruplar.map(([grup, liste]) => {
    const hesaplanan = liste[0]?.tur === "gosterge";
    let baslik = "";
    if (hesaplanan && !gostergeBasligi) {
      gostergeBasligi = true;
      baslik = `<div class="secim-kaynak" data-kaynak="gosterge">Hesaplanmış Değerler
        <em>${say("gosterge")} gösterge · her tesis ve tüm tesislerin toplamı için</em></div>`;
    }
    if (!hesaplanan && !kolonBasligi) {
      kolonBasligi = true;
      baslik = `<div class="secim-kaynak" data-kaynak="kolon">Veri sayfası
        <em>${say("kolon")} sütun · sekmelere elle girilen ya da formülle hesaplanan değerler</em></div>`;
    }
    const kaynak = hesaplanan ? "gosterge" : "kolon";
    return baslik + `
      <div class="secim-grup" data-kaynak="${kaynak}"
           data-metin="${kacisla(grup.toLocaleLowerCase("tr"))}">${kacisla(grup)}</div>
      ${liste.map((d) => `
        <label class="secim-satir" data-kaynak="${kaynak}"
               data-metin="${kacisla((grup + " " + d.tamAd).toLocaleLowerCase("tr"))}">
          <input type="checkbox" value="${kacisla(d.anahtar)}" ${kume.has(d.anahtar) ? "checked" : ""}>
          <span>${kacisla(hesaplanan ? GOSTERGE[d.gostergeId]?.ad ?? d.header
                                     : d.col + " — " + d.header.split(" · ").slice(1).join(" · "))}${
            d.birim ? ` <em>${kacisla(d.birim)}</em>` : ""}</span>
        </label>`).join("")}`;
  }).join("");
}

/** Kaynak süzgeci: "hepsi" | "kolon" | "gosterge". */
function degiskenKaynakSuzgeci(kok, kaynak) {
  for (const el of kok.querySelectorAll("[data-kaynak]")) {
    if (el.classList.contains("kaynak-btn")) continue;
    el.dataset.kaynakGizli = kaynak !== "hepsi" && el.dataset.kaynak !== kaynak ? "1" : "";
  }
  degiskenAramasiUygula(kok, kok.querySelector(".arama")?.value ?? "");
}

/** Arama kutusu süzgeci: grup başlığı, altında görünen satır kalmazsa gizlenir. */
function degiskenAramasiUygula(kok, sorgu) {
  const q = sorgu.trim().toLocaleLowerCase("tr");
  for (const satir of kok.querySelectorAll(".secim-satir")) {
    satir.hidden = satir.dataset.kaynakGizli === "1" || (!!q && !satir.dataset.metin.includes(q));
  }
  for (const baslik of kok.querySelectorAll(".secim-grup")) {
    let gorunen = false;
    let el = baslik.nextElementSibling;
    while (el && !el.classList.contains("secim-grup") && !el.classList.contains("secim-kaynak")) {
      if (el.classList.contains("secim-satir") && !el.hidden) { gorunen = true; break; }
      el = el.nextElementSibling;
    }
    baslik.hidden = !gorunen;
  }
  for (const baslik of kok.querySelectorAll(".secim-kaynak")) {
    let gorunen = false;
    let el = baslik.nextElementSibling;
    while (el && !el.classList.contains("secim-kaynak")) {
      if (el.classList.contains("secim-satir") && !el.hidden) { gorunen = true; break; }
      el = el.nextElementSibling;
    }
    baslik.hidden = !gorunen;
  }
}
