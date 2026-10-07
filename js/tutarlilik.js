// Veri Tutarlılık Kontrolü: bütün sekmelerdeki ham değerleri ve mahsuplaşma
// hesaplarını tarayıp şüpheli, tutarsız veya imkânsız değerleri listeler.
// Her veri değişiminde yeniden çalışır.

const SEVIYELER = { hata: "Hata", uyari: "Uyarı", bilgi: "Bilgi" };

let bulgular = [];
let suzgec = { seviye: "hepsi", tur: "hepsi", sayfa: "hepsi" };
let tutarlilikBekliyor = false;

/* ================= Yardımcılar ================= */

const sayiMi = (v) => typeof v === "number" && Number.isFinite(v);
const kwh = (v) => `${sayiBicimle(Math.round(v))} kWh`;

function ortanca(degerler) {
  const s = degerler.filter(sayiMi).slice().sort((a, b) => a - b);
  if (!s.length) return null;
  const orta = Math.floor(s.length / 2);
  return s.length % 2 ? s[orta] : (s[orta - 1] + s[orta]) / 2;
}

function bulgu(seviye, tur, sayfa, satir, alan, mesaj, ek = {}) {
  return {
    seviye, tur,
    sayfaId: sayfa?.id ?? null,
    sayfaAd: sayfa?.ad ?? "—",
    satirNo: satir?.no ?? null,
    donem: satir?.etiket ?? "—",
    alan,
    mesaj,
    deger: ek.deger ?? null,
    beklenen: ek.beklenen ?? null,
    kolon: ek.kolon ?? null,
  };
}

const kolonAdi = (c) => `${c.col} — ${c.header}`;

/* ================= Sekme kontrolleri ================= */
// Her sekmede çalışır: ortam = { sayfa, satirlar, kolonlar, sayisal }

const SAYFA_KONTROLLERI = [
  {
    id: "metin",
    calistir: ({ sayfa, satirlar, sayisal }) => {
      const cikan = [];
      for (const s of satirlar) {
        for (const c of sayisal) {
          const ham = sayfaHamDegeri(sayfa.id, c.col, s.no);
          if (typeof ham === "string" && !ham.startsWith("=") && ham.trim() !== "") {
            cikan.push(bulgu("hata", "metin", sayfa, s, kolonAdi(c),
              "Sayısal sütunda metin var; hesaplarda boş sayılır",
              { deger: ham, kolon: c.col }));
          }
        }
      }
      return cikan;
    },
  },
  {
    // Bir sütundaki aynı formül hatası tek bulgu olarak listelenir; sütun
    // formülü bozulduğunda yüzlerce satır aynı şeyi söylemesin
    id: "formulHata",
    calistir: ({ sayfa, satirlar, kolonlar }) => {
      const cikan = [];
      const aciklama = { "#SAYFA": "Formül, kitapta olmayan bir sekmeye başvuruyor",
                         "#DÖNGÜ": "Formül kendine dolaylı olarak başvuruyor",
                         "#HATA": "Formül hesaplanamadı (sıfıra bölme, metinle işlem ya da yazım hatası)" };
      for (const c of kolonlar) {
        const gruplar = new Map();
        for (const s of satirlar) {
          const v = sayfaDegeri(sayfa.id, c.col, s.no);
          if (!v || typeof v !== "object" || !v.hata) continue;
          if (!gruplar.has(v.hata)) gruplar.set(v.hata, []);
          gruplar.get(v.hata).push(s);
        }
        for (const [hata, liste] of gruplar) {
          const ilk = liste[0];
          cikan.push(bulgu("hata", "formulHata", sayfa,
            { no: ilk.no, etiket: liste.length > 1 ? `${ilk.etiket} (+${liste.length - 1})` : ilk.etiket },
            kolonAdi(c), (aciklama[hata] ?? "Formül hatası") + (liste.length > 1 ? ` — ${liste.length} satırda` : ""),
            { deger: hata, kolon: c.col }));
        }
      }
      return cikan;
    },
  },
  {
    id: "negatif",
    calistir: ({ sayfa, satirlar, sayisal }) => {
      const cikan = [];
      for (const s of satirlar) {
        for (const c of sayisal) {
          const v = sayfaDegeri(sayfa.id, c.col, s.no);
          if (sayiMi(v) && v < 0) {
            cikan.push(bulgu("hata", "negatif", sayfa, s, kolonAdi(c),
              "Enerji, fiyat ve bedel değerleri negatif olamaz",
              { deger: sayiBicimle(v), beklenen: "≥ 0", kolon: c.col }));
          }
        }
      }
      return cikan;
    },
  },
  {
    id: "donemYok",
    calistir: ({ sayfa, satirlar, sayisal }) => {
      const cikan = [];
      for (const s of satirlar) {
        if (s.anahtar) continue;
        const dolu = sayisal.some((c) => sayiMi(sayfaDegeri(sayfa.id, c.col, s.no)));
        if (!dolu) continue;
        cikan.push(bulgu("uyari", "donemYok", sayfa, s, "YIL / AY",
          "Satırda veri var ama yılı ya da ayı tanınmıyor; hesaplara katılmaz",
          { deger: `${s.yil ?? "?"} / ${s.ay ?? "?"}`, beklenen: "2026 / Mayıs", kolon: "A" }));
      }
      return cikan;
    },
  },
  {
    id: "mukerrer",
    calistir: ({ sayfa, satirlar }) => {
      const gorulen = new Map();
      const cikan = [];
      for (const s of satirlar) {
        if (!s.anahtar) continue;
        if (gorulen.has(s.anahtar)) {
          cikan.push(bulgu("hata", "mukerrer", sayfa, s, "YIL / AY",
            `Bu dönem ${gorulen.get(s.anahtar)}. satırda da var; hesaplarda ilki kullanılır`, { kolon: "A" }));
        } else {
          gorulen.set(s.anahtar, s.no);
        }
      }
      return cikan;
    },
  },
  {
    id: "eksikAy",
    calistir: ({ sayfa, satirlar }) => {
      const yillar = new Map();
      for (const s of satirlar) {
        if (!s.anahtar) continue;
        if (!yillar.has(s.yil)) yillar.set(s.yil, new Set());
        yillar.get(s.yil).add(s.ayNo);
      }
      const cikan = [];
      for (const [yil, aylar] of yillar) {
        if (aylar.size > 0 && aylar.size < 12) {
          cikan.push(bulgu("uyari", "eksikAy", sayfa, { no: null, etiket: String(yil) }, "YIL / AY",
            `${yil} yılında 12 ay yerine ${aylar.size} ay var; yıllık limit ve toplamlar eksik kalır`,
            { deger: `${aylar.size} ay`, beklenen: "12 ay" }));
        }
      }
      return cikan;
    },
  },
  {
    id: "aykiri",
    calistir: ({ sayfa, satirlar, sayisal }) => {
      if (sayfa.tur !== "tesis") return [];
      const cikan = [];
      for (const c of sayisal) {
        if (!["tuketim", "uretim", "mahsup", "ihtiyacFazlasi"].includes(c.rol)) continue;
        const degerler = satirlar.map((s) => sayfaDegeri(sayfa.id, c.col, s.no)).filter((v) => sayiMi(v) && v > 0);
        if (degerler.length < 6) continue;
        const ort = ortanca(degerler);
        if (!ort) continue;
        for (const s of satirlar) {
          const v = sayfaDegeri(sayfa.id, c.col, s.no);
          if (!sayiMi(v) || v <= 0) continue;
          if (v > ort * 5 || v < ort / 5) {
            cikan.push(bulgu("uyari", "aykiri", sayfa, s, kolonAdi(c),
              "Değer, sütunun ortancasından çok uzak; birim (kWh / MWh) karışmış olabilir",
              { deger: sayiBicimle(v), beklenen: `~ ${sayiBicimle(ort)}`, kolon: c.col }));
          }
        }
      }
      return cikan;
    },
  },
];

/* ================= Tesis kontrolleri ================= */
// Mahsuplaşma motorunun ayrıntıları üzerinde çalışır.

/** Bir rolün ilk sütunu — "git" düğmesi için. */
const rolKolonu = (d, rol) => d?.girdiler?.[rol]?.kolonlar?.[0]?.col ?? null;

function tesisKontrolleri(sayfa, detaylar, donemler) {
  const cikan = [];
  const b = { ...TESIS_BILGI_VARSAYILAN, ...(sayfa.bilgi ?? {}) };
  const kolonlar = sayfaKolonlari(sayfa.id);
  const roller = new Set(kolonlar.map((c) => c.rol).filter(Boolean));
  const satir = (d) => ({ no: donemSatiri(sayfa.id, d.donem.anahtar), etiket: d.donem.etiket });
  const tolerans = (a, x) => Math.abs(a - x) > Math.max(1, Math.abs(x) * 0.01);

  for (const r of MAHSUP_ROLLERI.filter((x) => x.zorunlu)) {
    if (!roller.has(r.anahtar)) {
      cikan.push(bulgu("hata", "rolYok", sayfa, null, r.ad,
        `"${r.ad}" rolünde sütun yok; Hesaplanmış Değerler eksik kalır. Sütun menüsünden ya da ` +
        `Hesaplanmış Değerler → Sütun Rolleri'nden bağlayın.`));
    }
  }

  if (b.aboneGrubu === "mesken" && b.periyot === "saatlik") {
    cikan.push(bulgu("uyari", "tesisBilgisi", sayfa, null, "Tesis bilgileri",
      "Mesken abone grubunda mahsuplaşma aylıktır (EPDK 1 No'lu Açıklama)", { deger: "Saatlik", beklenen: "Aylık" }));
  }
  if (sayiMi(b.sozlesmeGucu) && sayiMi(b.kuruluGuc) && b.sozlesmeGucu < b.kuruluGuc) {
    cikan.push(bulgu("uyari", "tesisBilgisi", sayfa, null, "Tesis bilgileri",
      "Sözleşme gücü üretim tesisinin gücünden düşük olamaz (25.11.2025 değişikliği); aykırılıkta üretim bedelsiz katkı sayılabilir",
      { deger: `${sayiBicimle(b.sozlesmeGucu)} kW`, beklenen: `≥ ${sayiBicimle(b.kuruluGuc)} kW` }));
  }
  if (/^\d{4}-\d{2}$/.test(b.isletmeTarihi ?? "")) {
    const [y, a] = b.isletmeTarihi.split("-").map(Number);
    const dolum = { yil: y + 10, ayNo: a };
    const sonDonem = donemler[donemler.length - 1];
    if (sonDonem && (sonDonem.yil > dolum.yil || (sonDonem.yil === dolum.yil && sonDonem.ayNo >= dolum.ayNo))) {
      cikan.push(bulgu("bilgi", "onYil", sayfa, { no: null, etiket: `${dolum.yil} ${AYLAR[dolum.ayNo - 1]}` }, "Tesis bilgileri",
        "Tesis 10 yıllık destek süresini dolduruyor; bu tarihten sonra ihtiyaç fazlası fiyatı min(YEKDEM × %90, PTF) " +
        "ve veriş yönünde Lisanssız Üretici-2 dağıtım bedeli uygulanır. Fiyat sütununu buna göre güncelleyin."));
    }
  }

  let limitUyarisiYili = null;
  for (const d of detaylar) {
    if (!d) continue;
    const s = satir(d);
    const { U, T, Mg, IFg } = d;

    if (Mg !== null && U !== null && T !== null && Mg > Math.min(U, T) + 1) {
      cikan.push(bulgu("hata", "mahsupSiniri", sayfa, s, "Mahsuplaşan enerji",
        "Mahsuplaşan enerji üretimden ya da tüketimden büyük olamaz",
        { deger: kwh(Mg), beklenen: `≤ ${kwh(Math.min(U, T))}`, kolon: rolKolonu(d, "mahsup") }));
    }
    if (IFg !== null && U !== null && d.M !== null && tolerans(IFg, Math.max(U - d.M, 0))) {
      cikan.push(bulgu("uyari", "ifTutarsiz", sayfa, s, "İhtiyaç fazlası",
        "Girilen ihtiyaç fazlası, üretim − mahsuplaşan enerji ile uyuşmuyor",
        { deger: kwh(IFg), beklenen: kwh(Math.max(U - d.M, 0)), kolon: rolKolonu(d, "ihtiyacFazlasi") }));
    }
    if ((U === null) !== (T === null)) {
      const eksik = U === null ? "uretim" : "tuketim";
      cikan.push(bulgu("uyari", "eksikVeri", sayfa, s, ROL_ADI[eksik].ad,
        "Dönemde tüketim ya da üretimden yalnızca biri girilmiş; mahsuplaşma hesaplanamaz",
        { deger: "boş", kolon: rolKolonu(d, eksik) }));
    }
    const saatlikDonem = d.donem.yil > 2026 || (d.donem.yil === 2026 && d.donem.ayNo >= 5);
    if (b.periyot === "saatlik" && saatlikDonem && Mg === null && U !== null && T !== null && U > 0 && T > 0) {
      cikan.push(bulgu("bilgi", "saatlikVarsayim", sayfa, s, "Mahsuplaşan enerji",
        "Saatlik mahsuplaşma döneminde mahsuplaşan enerji girilmemiş; aylık varsayım kullanılıyor ve sonuçlar " +
        "olduğundan iyimser görünür. EPİAŞ LÜM / faturadaki değeri girin.",
        { deger: "boş", beklenen: `≤ ${kwh(Math.min(U, T))}`, kolon: rolKolonu(d, "mahsup") }));
    }
    if (d.bedelsiz > 0 && limitUyarisiYili !== d.donem.yil) {
      limitUyarisiYili = d.donem.yil;
      cikan.push(bulgu("uyari", "limitAsimi", sayfa, s, "Yıllık limit",
        `${d.donem.yil} yılında 2× limit bu dönemde aşıldı; aşan ihtiyaç fazlası YEKDEM'e bedelsiz katkıdır`,
        { deger: kwh(d.kullanim + d.bedelsiz), beklenen: `≤ ${kwh(d.limit)}` }));
    } else if (d.limit && d.kullanim !== null && d.kullanim / d.limit >= 0.9 && !d.bedelsiz
               && limitUyarisiYili !== d.donem.yil) {
      limitUyarisiYili = d.donem.yil;
      cikan.push(bulgu("bilgi", "limitYakin", sayfa, s, "Yıllık limit",
        `Yıllık limitin %${(d.kullanim / d.limit * 100).toFixed(0)}'i kullanıldı; yılın kalanında ihtiyaç fazlası bedelsiz kalabilir`,
        { deger: kwh(d.kullanim), beklenen: `≤ ${kwh(d.limit)}` }));
    }

    for (const [rol, deger] of [["aktifFiyat", d.aktifFiyat], ["ifFiyat", d.ifFiyat]]) {
      if (deger === null || deger === 0) continue;
      if (deger < 0.3 || deger > 15) {
        cikan.push(bulgu("uyari", "fiyatAralik", sayfa, s, ROL_ADI[rol].ad,
          deger > 50 ? "Birim fiyat çok yüksek; krş/kWh ya da TL/MWh girilmiş olabilir (TL/kWh bekleniyor)"
                     : "Birim fiyat beklenen aralığın dışında",
          { deger: `${sayiBicimle(deger)} TL/kWh`, beklenen: "0,3 – 15 TL/kWh", kolon: rolKolonu(d, rol) }));
      }
    }
    if (d.ifBedelG !== null && d.ifFiyat !== null && d.satilabilir !== null && d.satilabilir > 0
        && tolerans(d.ifBedelG, d.satilabilir * d.ifFiyat) && Math.abs(d.ifBedelG - d.satilabilir * d.ifFiyat) / Math.max(d.ifBedelG, 1) > 0.02) {
      cikan.push(bulgu("uyari", "bedelTutarsiz", sayfa, s, "İhtiyaç fazlası bedeli",
        "Faturadaki bedel, satılabilir ihtiyaç fazlası × birim fiyat ile uyuşmuyor",
        { deger: `${sayiBicimle(d.ifBedelG)} TL`, beklenen: `~ ${sayiBicimle(Math.round(d.satilabilir * d.ifFiyat))} TL`,
          kolon: rolKolonu(d, "ifBedel") }));
    }
    if (d.teorik && U !== null) {
      const kf = (U / d.teorik) * 100;
      const ges = b.kaynak === "ges";
      if (kf > 100 || (ges && kf > 35)) {
        cikan.push(bulgu(kf > 100 ? "hata" : "uyari", "kapasite", sayfa, s, "Kapasite faktörü",
          kf > 100 ? "Üretim, kurulu gücün bu ayda üretebileceğinden fazla"
                   : "GES için aylık kapasite faktörü olağandışı yüksek; birim ya da kurulu güç hatalı olabilir",
          { deger: `%${kf.toFixed(1)}`, beklenen: ges ? "%0 – 35" : "%0 – 100", kolon: rolKolonu(d, "uretim") }));
      }
    }
  }
  return cikan;
}

/* ================= Çalıştırma ================= */

function tutarliligiCalistir() {
  bulgular = [];
  for (const sayfa of sayfalariAl()) {
    const kolonlar = sayfaKolonlari(sayfa.id);
    const ortam = {
      sayfa,
      kolonlar,
      satirlar: sayfaSatirlari(sayfa.id),
      sayisal: kolonlar.filter((c) => c.type === "input" || c.type === "formula"),
    };
    for (const kontrol of SAYFA_KONTROLLERI) {
      try {
        bulgular.push(...kontrol.calistir(ortam));
      } catch (e) {
        console.warn(`${kontrol.id} kontrolü çalışmadı:`, e);
      }
    }
  }

  try {
    const sonuc = mahsupSonucu();
    for (const t of sonuc.tesisler.values()) bulgular.push(...tesisKontrolleri(t.sayfa, t.detaylar, sonuc.donemler));
  } catch (e) {
    console.warn("Mahsuplaşma kontrolleri çalışmadı:", e);
  }

  const sira = { hata: 0, uyari: 1, bilgi: 2 };
  bulgular.sort((a, b) => sira[a.seviye] - sira[b.seviye] || a.sayfaAd.localeCompare(b.sayfaAd, "tr")
    || (a.satirNo ?? 0) - (b.satirNo ?? 0));
  tutarliligiCiz();
  return bulgular;
}

/** Bulguları başka sayfalar (robot) için döndürür. */
function tutarlilikBulgulari() { return bulgular; }

/* ================= Çizim ================= */

const TUR_ADLARI = {
  metin: "Sayısal sütunda metin",
  formulHata: "Formül hatası",
  negatif: "Negatif değer",
  donemYok: "Dönemi tanınmayan satır",
  mukerrer: "Mükerrer dönem",
  eksikAy: "Yılda eksik ay",
  aykiri: "Aykırı değer",
  rolYok: "Bağlanmamış rol",
  tesisBilgisi: "Tesis bilgisi",
  onYil: "10 yıllık destek süresi",
  mahsupSiniri: "Mahsuplaşan enerji sınırı",
  ifTutarsiz: "İhtiyaç fazlası tutarsız",
  eksikVeri: "Eksik tüketim / üretim",
  saatlikVarsayim: "Saatlik dönemde aylık varsayım",
  limitAsimi: "Yıllık limit aşımı",
  limitYakin: "Limite yaklaşma",
  fiyatAralik: "Birim fiyat aralık dışı",
  bedelTutarsiz: "Bedel tutarsız",
  kapasite: "Kapasite faktörü",
};

function suzulmus() {
  return bulgular.filter((b) =>
    (suzgec.seviye === "hepsi" || b.seviye === suzgec.seviye) &&
    (suzgec.tur === "hepsi" || b.tur === suzgec.tur) &&
    (suzgec.sayfa === "hepsi" || b.sayfaId === suzgec.sayfa));
}

function secimiDoldur(el, secenekler, tumuEtiketi, deger) {
  el.innerHTML = `<option value="hepsi">${tumuEtiketi}</option>` +
    secenekler.map(([k, ad]) => `<option value="${kacisla(k)}">${kacisla(ad)}</option>`).join("");
  el.value = secenekler.some(([k]) => k === deger) ? deger : "hepsi";
  return el.value;
}

function tutarliligiCiz() {
  const govde = document.getElementById("kontrolSatirlar");
  if (!govde) return;

  const sayilar = { hata: 0, uyari: 0, bilgi: 0 };
  for (const b of bulgular) sayilar[b.seviye]++;

  document.getElementById("kontrolHata").textContent = sayilar.hata;
  document.getElementById("kontrolUyari").textContent = sayilar.uyari;
  document.getElementById("kontrolBilgi").textContent = sayilar.bilgi;
  document.getElementById("kontrolOzet").textContent =
    bulgular.length === 0
      ? "Tüm kontroller temiz — tutarsız değer bulunamadı."
      : `${bulgular.length} bulgu · ${sayfalariAl().length} sekme tarandı`;

  const turler = [...new Set(bulgular.map((b) => b.tur))].map((t) => [t, TUR_ADLARI[t] ?? t]);
  suzgec.tur = secimiDoldur(document.getElementById("kontrolTur"), turler, "Tüm kontroller", suzgec.tur);
  const sayfalar = sayfalariAl().map((s) => [s.id, s.ad]);
  suzgec.sayfa = secimiDoldur(document.getElementById("kontrolSayfa"), sayfalar, "Tüm sekmeler", suzgec.sayfa);

  const liste = suzulmus();
  if (!liste.length) {
    govde.innerHTML =
      `<tr><td colspan="7" class="kontrol-temiz">Bu süzgeçle gösterilecek bulgu yok.</td></tr>`;
    return;
  }

  govde.innerHTML = liste.map((b) => `
    <tr class="seviye-${b.seviye}">
      <td class="kontrol-seviye"><span class="rozet ${b.seviye}">${SEVIYELER[b.seviye]}</span></td>
      <td class="kontrol-sayfa">${kacisla(b.sayfaAd)}</td>
      <td class="kontrol-donem">${kacisla(b.donem)}</td>
      <td class="kontrol-alan">${kacisla(b.alan)}</td>
      <td class="kontrol-mesaj">${kacisla(b.mesaj)}</td>
      <td class="kontrol-deger">${kacisla(b.deger ?? "")}</td>
      <td class="kontrol-beklenen">${kacisla(b.beklenen ?? "")}${
        b.kolon && b.satirNo && b.sayfaId
          ? ` <button type="button" class="git-btn" data-sayfa="${kacisla(b.sayfaId)}" data-kolon="${b.kolon}"
                      data-satir="${b.satirNo}" title="Veri sayfasında bu hücreye git">↗</button>`
          : ""}</td>
    </tr>`).join("");
}

/* ================= Başlat ================= */

function tutarlilikKur() {
  const seviye = document.getElementById("kontrolSeviye");
  seviye.addEventListener("change", () => {
    suzgec.seviye = seviye.value;
    tutarliligiCiz();
  });
  document.getElementById("kontrolTur").addEventListener("change", (e) => {
    suzgec.tur = e.target.value;
    tutarliligiCiz();
  });
  document.getElementById("kontrolSayfa").addEventListener("change", (e) => {
    suzgec.sayfa = e.target.value;
    tutarliligiCiz();
  });
  document.getElementById("kontrolYenile").addEventListener("click", tutarliligiCalistir);

  document.getElementById("kontrolSatirlar").addEventListener("click", (e) => {
    const btn = e.target.closest(".git-btn");
    if (!btn) return;
    sayfaGoster("veri");
    requestAnimationFrame(() => hucreyeGit(btn.dataset.sayfa, btn.dataset.kolon, Number(btn.dataset.satir)));
  });

  document.addEventListener("veri-degisti", () => {
    if (document.getElementById("sayfa-kontrol")?.hidden) tutarlilikBekliyor = true;
    else tutarliligiCalistir();
  });

  tutarliligiCalistir();
}

function tutarlilikSayfasiAcildi() {
  if (tutarlilikBekliyor) {
    tutarlilikBekliyor = false;
    tutarliligiCalistir();
  } else {
    tutarliligiCiz();
  }
}
