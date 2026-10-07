// Temalar: programın renk düzenini değiştirir.
//
// Tüm renkler :root üzerindeki değişkenlerden gelir; tema seçmek bu
// değişkenleri değiştirmekten ibarettir. Grafiklerin seri renkleri
// temadan bağımsızdır — renk körlüğü ayrımı doğrulanmış bir palettir ve
// tema değiştikçe bozulmaması gerekir.

const TEMA_DEPO = "mahsupla-tema";

const TEMALAR = {
  acik: {
    koyu: false,
    ad: "Açık",
    aciklama: "Varsayılan; beyaz zemin, lacivert başlık",
    renkler: {
      "--bg": "#f4f6f8", "--panel": "#ffffff", "--line": "#d6dbe1",
      "--line-strong": "#9aa6b2", "--text": "#1f2933", "--muted": "#6b7885",
      "--head-bg": "#1f4e79", "--head-text": "#ffffff", "--key-bg": "#eef2f6",
      "--formula-bg": "#f2f7ec", "--formula-text": "#3f6212",
      "--accent": "#1f6feb", "--danger": "#b42318", "--row-alt": "#fafbfc",
    },
  },
  koyu: {
    koyu: true,
    ad: "Koyu",
    aciklama: "Az ışıklı ortamlar için koyu zemin",
    renkler: {
      "--bg": "#161b22", "--panel": "#1d242d", "--line": "#303a45",
      "--line-strong": "#5a6775", "--text": "#e6edf3", "--muted": "#9aa7b4",
      "--head-bg": "#2d3b4d", "--head-text": "#ffffff", "--key-bg": "#232c36",
      "--formula-bg": "#22301f", "--formula-text": "#b7d99a",
      "--accent": "#58a6ff", "--danger": "#f0736a", "--row-alt": "#1a212a",
    },
  },
  gece: {
    koyu: true,
    ad: "Gece Mavisi",
    aciklama: "Koyu lacivert; uzun süreli ekran çalışması için",
    renkler: {
      "--bg": "#0f1b2d", "--panel": "#16263d", "--line": "#27405e",
      "--line-strong": "#4d6e96", "--text": "#e3ecf7", "--muted": "#93a9c4",
      "--head-bg": "#1d3a5c", "--head-text": "#ffffff", "--key-bg": "#1a2c45",
      "--formula-bg": "#14301f", "--formula-text": "#9fd6a8",
      "--accent": "#4da3ff", "--danger": "#ff7a70", "--row-alt": "#132238",
    },
  },
  sicak: {
    koyu: false,
    ad: "Sıcak Kağıt",
    aciklama: "Kırık beyaz zemin, gözü daha az yoran kontrast",
    renkler: {
      "--bg": "#f5f1e8", "--panel": "#fdfbf6", "--line": "#ddd5c4",
      "--line-strong": "#a89b82", "--text": "#2c2519", "--muted": "#786c58",
      "--head-bg": "#6b4f2a", "--head-text": "#fdfbf6", "--key-bg": "#efe8da",
      "--formula-bg": "#eef2e2", "--formula-text": "#4a6112",
      "--accent": "#a4620d", "--danger": "#a3341f", "--row-alt": "#faf7f0",
    },
  },
  yesil: {
    koyu: false,
    ad: "Orman",
    aciklama: "Yeşil tonlu; enerji ve sürdürülebilirlik raporları için",
    renkler: {
      "--bg": "#f1f6f2", "--panel": "#ffffff", "--line": "#cfdfd3",
      "--line-strong": "#8fa896", "--text": "#1b2b21", "--muted": "#5f7468",
      "--head-bg": "#1f5c3d", "--head-text": "#ffffff", "--key-bg": "#e7f0e9",
      "--formula-bg": "#eef5e6", "--formula-text": "#39601a",
      "--accent": "#177a4d", "--danger": "#b42318", "--row-alt": "#f8fbf9",
    },
  },
  kontrast: {
    koyu: false,
    ad: "Yüksek Kontrast",
    aciklama: "Keskin siyah-beyaz; projeksiyon ve baskı için",
    renkler: {
      "--bg": "#ffffff", "--panel": "#ffffff", "--line": "#000000",
      "--line-strong": "#000000", "--text": "#000000", "--muted": "#3a3a3a",
      "--head-bg": "#000000", "--head-text": "#ffffff", "--key-bg": "#e8e8e8",
      "--formula-bg": "#f0f0f0", "--formula-text": "#00330a",
      "--accent": "#0033cc", "--danger": "#b00000", "--row-alt": "#f7f7f7",
    },
  },
};

const VARSAYILAN_TEMA = "acik";
let seciliTema = VARSAYILAN_TEMA;

function temayiYukle() {
  try {
    const ad = localStorage.getItem(TEMA_DEPO);
    if (ad && TEMALAR[ad]) seciliTema = ad;
  } catch (e) {
    console.warn("Tema okunamadı:", e);
  }
  temayiUygula(seciliTema, { kaydet: false });
  return seciliTema;
}

function aktifTema() { return seciliTema; }

/** Temayı :root değişkenlerine yazar. */
function temayiUygula(ad, { kaydet = true } = {}) {
  const tema = TEMALAR[ad] ?? TEMALAR[VARSAYILAN_TEMA];
  seciliTema = TEMALAR[ad] ? ad : VARSAYILAN_TEMA;
  const kok = document.documentElement;
  for (const [degisken, deger] of Object.entries(tema.renkler)) {
    kok.style.setProperty(degisken, deger);
  }
  kok.dataset.tema = seciliTema;
  // Kaydırma çubukları ve form alanları da temaya uysun
  kok.style.colorScheme = tema.koyu ? "dark" : "light";
  if (kaydet) {
    try { localStorage.setItem(TEMA_DEPO, seciliTema); }
    catch (e) { console.warn(e); }
  }
  document.dispatchEvent(new CustomEvent("tema-degisti", { detail: seciliTema }));
  return seciliTema;
}
