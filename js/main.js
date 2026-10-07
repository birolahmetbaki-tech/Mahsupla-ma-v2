// Uygulama kabuğu: kenar çubuğu, sayfa geçişleri, açılış sayfası.


const SON_SAYFA = "mahsupla-sayfa";
const KABUK_DEPO = "mahsupla-kabuk";
const VARSAYILAN_MARKA = "Mahsupla";

const yanCubuk = document.querySelector(".yan-cubuk");
const markaEl = document.getElementById("marka");
const daraltBtn = document.getElementById("daraltBtn");

let kabuk = { marka: VARSAYILAN_MARKA, kapali: false };

function kabuguYukle() {
  try {
    const ham = localStorage.getItem(KABUK_DEPO);
    if (ham) kabuk = { ...kabuk, ...JSON.parse(ham) };
  } catch (e) {
    console.warn("Kenar çubuğu ayarları okunamadı:", e);
  }
}

function kabuguKaydet() {
  try {
    localStorage.setItem(KABUK_DEPO, JSON.stringify(kabuk));
  } catch { /* depo kapalıysa önemli değil */ }
}

/* ================= Sayfa geçişleri ================= */

function sayfaGoster(ad) {
  for (const b of document.querySelectorAll(".yan-btn[data-sayfa]")) {
    b.classList.toggle("secili", b.dataset.sayfa === ad);
  }
  for (const s of document.querySelectorAll(".sayfa")) {
    s.hidden = s.id !== "sayfa-" + ad;
  }
  if (ad === "pano") panoSayfasiAcildi();
  if (ad === "hesap") hesapSayfasiAcildi();
  if (ad === "kontrol") tutarlilikSayfasiAcildi();
  try {
    localStorage.setItem(SON_SAYFA, ad);
  } catch { /* yok sayılır */ }
}

yanCubuk.addEventListener("click", (e) => {
  const btn = e.target.closest(".yan-btn[data-sayfa]");
  if (btn) sayfaGoster(btn.dataset.sayfa);
});

document.getElementById("ayarlarBtn").addEventListener("click", ayarlariAc);

/* ================= Kenar çubuğunu aç/kapat ================= */

function daraltmayiUygula() {
  yanCubuk.classList.toggle("kapali", kabuk.kapali);
  daraltBtn.textContent = kabuk.kapali ? "›" : "‹";
  const etiket = kabuk.kapali ? "Kenar çubuğunu aç" : "Kenar çubuğunu kapat";
  daraltBtn.title = etiket;
  daraltBtn.setAttribute("aria-label", etiket);
  daraltBtn.setAttribute("aria-expanded", String(!kabuk.kapali));
}

daraltBtn.addEventListener("click", () => {
  kabuk.kapali = !kabuk.kapali;
  daraltmayiUygula();
  kabuguKaydet();
});

/* ================= Kenar çubuğu başlığı ================= */

markaEl.addEventListener("dblclick", () => {
  if (kabuk.kapali) return;
  markaEl.contentEditable = "true";
  markaEl.focus();
  getSelection().selectAllChildren(markaEl);
});

markaEl.addEventListener("keydown", (e) => {
  if (markaEl.contentEditable !== "true") return;
  if (e.key === "Enter") { e.preventDefault(); markaEl.blur(); }
  if (e.key === "Escape") { markaEl.textContent = kabuk.marka; markaEl.blur(); }
});

markaEl.addEventListener("blur", () => {
  if (markaEl.contentEditable !== "true") return;
  markaEl.contentEditable = "false";
  const yeni = markaEl.textContent.trim();
  if (yeni && yeni !== kabuk.marka) {
    kabuk.marka = yeni;
    kabuguKaydet();
  }
  markaEl.textContent = kabuk.marka;
  document.title = kabuk.marka;
});

/* ================= Başlat ================= */

kabuguYukle();
markaEl.textContent = kabuk.marka;
document.title = kabuk.marka;
daraltmayiUygula();

ayarlariYukle();
acilisiCiz();
temayiYukle();   // renkler ilk çizimden önce yerine otursun
hesapKur();
tutarlilikKur();
panoKur();
robotKur();

// Program ilk açıldığında açılış sayfası gelir; sonraki açılışlarda
// en son bakılan sayfa korunur.
let baslangic = "acilis";
try {
  const kayitli = localStorage.getItem(SON_SAYFA);
  if (["veri", "hesap", "kontrol", "pano"].includes(kayitli)) baslangic = kayitli;
} catch { /* yok sayılır */ }
sayfaGoster(baslangic);
