// Açılış (ana) sayfası ve Ayarlar penceresinin "Açılış Sayfası" sekmesi.


const ACILIS_DEPO = "mahsupla-acilis";
const GORSEL_EN_BUYUK = 1000; // px — yüklenen görseller bu genişliğe küçültülür

const VARSAYILAN = {
  baslik: "Mahsupla",
  altBaslik: "Lisanssız elektrik üretimi mahsuplaşma takip programı",
  metin: "Veri sayfasında her tesis için bir sekme açın; aylık tüketim, üretim ve faturadaki " +
    "mahsuplaşma değerlerini girin.\nHesaplanmış Değerler mahsuplaşmayı, ihtiyaç fazlasını ve yıllık " +
    "2× limiti hesaplar; Dashboard sonuçları özetler.\n\nBu sayfayı Ayarlar → Açılış Sayfası'ndan değiştirebilirsiniz.",
  gorsel: null,
  gorselGenislik: 280,
  baslikPunto: 32,
  altPunto: 16,
  metinPunto: 14,
  arkaPlan: "#ffffff",
  yaziRengi: "#1f2933",
  baslikRengi: "#1f4e79",
  hizalama: "center",
};

let ayar = { ...VARSAYILAN };

function ayarlariYukle() {
  try {
    const ham = localStorage.getItem(ACILIS_DEPO);
    if (ham) ayar = { ...VARSAYILAN, ...JSON.parse(ham) };
  } catch (e) {
    console.warn("Açılış sayfası ayarları okunamadı:", e);
  }
}

function ayarlariKaydet() {
  try {
    localStorage.setItem(ACILIS_DEPO, JSON.stringify(ayar));
    return true;
  } catch (e) {
    console.warn(e);
    return false;
  }
}

/** Açılış sayfasını ayarlara göre çizer. */
function acilisiCiz() {
  const el = document.getElementById("acilis");
  el.style.background = ayar.arkaPlan;
  el.style.color = ayar.yaziRengi;
  el.style.textAlign = ayar.hizalama;

  const bos = !ayar.baslik && !ayar.altBaslik && !ayar.metin && !ayar.gorsel;
  if (bos) {
    el.innerHTML = `<p class="acilis-bos">Bu sayfa boş.
      Soldaki <b>Ayarlar</b> &rarr; <b>Açılış Sayfası</b> sekmesinden
      yazı, görsel ve renk ekleyebilirsiniz.</p>`;
    return;
  }

  const parcalar = [];
  if (ayar.gorsel) {
    parcalar.push(
      `<img class="acilis-gorsel" src="${ayar.gorsel}" alt=""
            style="width:${Number(ayar.gorselGenislik) || 280}px">`
    );
  }
  const punto = (ad, varsayilan) => `font-size:${Number(ayar[ad]) || varsayilan}px`;
  if (ayar.baslik) {
    parcalar.push(
      `<h1 class="acilis-baslik" style="color:${kacisla(ayar.baslikRengi)};${punto("baslikPunto", 32)}">` +
      `${kacisla(ayar.baslik)}</h1>`
    );
  }
  if (ayar.altBaslik) {
    parcalar.push(`<p class="acilis-alt" style="${punto("altPunto", 16)}">${kacisla(ayar.altBaslik)}</p>`);
  }
  if (ayar.metin) {
    parcalar.push(
      `<div class="acilis-metin" style="${punto("metinPunto", 14)}">` +
      `${kacisla(ayar.metin).replace(/\n/g, "<br>")}</div>`
    );
  }
  el.innerHTML = parcalar.join("\n");
}

/** Seçilen görseli küçültüp dataURL olarak döndürür. */
function gorseliOku(dosya) {
  return new Promise((coz, red) => {
    const okuyucu = new FileReader();
    okuyucu.onerror = () => red(new Error("Dosya okunamadı"));
    okuyucu.onload = () => {
      const img = new Image();
      img.onerror = () => red(new Error("Görsel çözümlenemedi"));
      img.onload = () => {
        const oran = Math.min(1, GORSEL_EN_BUYUK / img.width);
        if (oran === 1 && okuyucu.result.length < 400_000) return coz(okuyucu.result);
        const tuval = document.createElement("canvas");
        tuval.width = Math.round(img.width * oran);
        tuval.height = Math.round(img.height * oran);
        tuval.getContext("2d").drawImage(img, 0, 0, tuval.width, tuval.height);
        const saydam = /\.png$/i.test(dosya.name) || dosya.type === "image/png";
        coz(tuval.toDataURL(saydam ? "image/png" : "image/jpeg", 0.85));
      };
      img.src = okuyucu.result;
    };
    okuyucu.readAsDataURL(dosya);
  });
}

/* ================= Ayarlar penceresi ================= */

/** Sekme düğmeleri ile içerik bölümlerini eşler. */
function sekmeleriBagla(k) {
  const dugmeler = [...k.querySelectorAll(".sekme")];
  const bolumler = [...k.querySelectorAll(".sekme-icerik")];
  for (const btn of dugmeler) {
    btn.addEventListener("click", () => {
      for (const b of dugmeler) b.classList.toggle("secili", b === btn);
      for (const bolum of bolumler) {
        bolum.hidden = bolum.dataset.sekmeIcerik !== btn.dataset.sekme;
      }
      // Kaydet/Sıfırla yalnızca açılış sayfası ayarları için geçerli
      const acilisMi = btn.dataset.sekme === "acilis";
      k.querySelector("#a-sifirla").hidden = !acilisMi;
      k.querySelector("#a-tamam").hidden = !acilisMi;
      k.querySelector("#a-iptal").textContent = acilisMi ? "İptal" : "Kapat";
    });
  }
}

/** Kılavuzu Hakkında sekmesinde açılır başlıklar hâlinde gösterir. */
function kilavuzHtml() {
  const parca = (p) => {
    if (p.tur === "p") return `<p>${kacisla(p.govde)}</p>`;
    if (p.tur === "altbaslik") return `<h4>${kacisla(p.govde)}</h4>`;
    if (p.tur === "uyari") return `<p class="kilavuz-uyari">${kacisla(p.govde)}</p>`;
    if (p.tur === "liste") return `<ul>${p.govde.map((m) => `<li>${kacisla(m)}</li>`).join("")}</ul>`;
    if (p.tur === "akis") return `<ol>${p.govde.map((m) => `<li>${kacisla(m)}</li>`).join("")}</ol>`;
    if (p.tur === "sss") {
      return `<p class="kilavuz-soru">${kacisla(p.govde[0])}</p><p>${kacisla(p.govde[1])}</p>`;
    }
    return "";
  };
  return KILAVUZ_BOLUMLER.map((b, i) => `
    <details class="kilavuz-bolum" ${i === 0 ? "open" : ""}>
      <summary>${i + 1}. ${kacisla(b.baslik)}</summary>
      <div class="kilavuz-govde">${b.parcalar.map(parca).join("")}</div>
    </details>`).join("");
}

function hakkindayiBagla(k) {
  k.querySelector("#h-yazdir")?.addEventListener("click", kilavuzuYazdir);
}

/** Tema kartları — seçim anında uygulanır ki sonuç hemen görülsün. */
function temalariBagla(k) {
  for (const btn of k.querySelectorAll(".tema-kart")) {
    btn.addEventListener("click", () => {
      temayiUygula(btn.dataset.tema);
      for (const b of k.querySelectorAll(".tema-kart")) {
        b.classList.toggle("secili", b === btn);
      }
    });
  }
}

function yedekSatirlari(ozet) {
  if (!ozet.length) return `<tr><td class="yardim">Henüz saklanmış veri yok.</td></tr>`;
  return ozet.map((o) => `<tr>
      <td>${kacisla(o.ad)}</td>
      <td class="yedek-ozet">${o.ozet ? kacisla(o.ozet) : ""}</td>
      <td class="yedek-boyut">${o.boyut} KB</td>
    </tr>`).join("");
}

function yedeklemeyiBagla(k) {
  const durum = k.querySelector("#y-durum");
  const icerik = k.querySelector("#y-icerik");
  const hata = k.querySelector("#y-hata");
  const secim = k.querySelector("#y-secim");
  const onizleme = k.querySelector("#y-onizleme");
  let yuklenecek = null;

  function mevcuduGoster() {
    const paket = yedekUret();
    const ozet = yedekOzeti(paket);
    const toplam = ozet.reduce((a, o) => a + o.boyut, 0);
    durum.textContent = `${ozet.length} bölüm · yaklaşık ${toplam} KB · dosya adı ${yedekDosyaAdi()}`;
    icerik.innerHTML = yedekSatirlari(ozet);
  }
  mevcuduGoster();

  k.querySelector("#y-indir").addEventListener("click", () => {
    hata.textContent = "";
    try {
      const { boyut } = yedegiIndir();
      durum.textContent = `Yedek indirildi (${boyut} KB).`;
    } catch (e) {
      hata.textContent = "Yedek alınamadı: " + e.message;
    }
  });

  k.querySelector("#y-dosya").addEventListener("change", async (e) => {
    const dosya = e.target.files?.[0];
    e.target.value = "";
    hata.textContent = "";
    onizleme.hidden = true;
    yuklenecek = null;
    if (!dosya) return;
    try {
      const paket = await yedegiOku(dosya);
      yuklenecek = paket;
      const ozet = yedekOzeti(paket);
      secim.textContent = `${dosya.name} · ${yedekZamani(paket)}`;
      k.querySelector("#y-yeniIcerik").innerHTML = yedekSatirlari(ozet);
      onizleme.hidden = false;
    } catch (err) {
      secim.textContent = "";
      hata.textContent = err.message;
    }
  });

  k.querySelector("#y-yukle").addEventListener("click", () => {
    if (!yuklenecek) return;
    if (!confirm("Şu anda kayıtlı olan her şey bu yedekle değiştirilecek ve sayfa yeniden yüklenecek. Devam edilsin mi?")) return;
    try {
      yedegiYukle(yuklenecek);
      // Her modül depodan baştan okusun
      location.reload();
    } catch (e) {
      hata.textContent = "Yedek yüklenemedi: " + e.message;
    }
  });
}

function ayarlariAc() {
  const taslak = { ...ayar };

  diyalogAc(
    `<div class="sekmeler" role="tablist">
       <button type="button" class="sekme secili" data-sekme="acilis">Açılış Sayfası</button>
       <button type="button" class="sekme" data-sekme="tema">Temalar</button>
       <button type="button" class="sekme" data-sekme="yedek">Yedekleme</button>
       <button type="button" class="sekme" data-sekme="hakkinda">Hakkında</button>
     </div>

     <div class="sekme-icerik" data-sekme-icerik="acilis">
       <div class="alan-ikili">
         <label><span>Başlık</span><input type="text" id="a-baslik"></label>
         <label><span>Alt başlık</span><input type="text" id="a-alt"></label>
       </div>

       <label><span>Metin</span>
         <textarea id="a-metin" rows="4" placeholder="Açılış sayfasında görünecek yazı"></textarea></label>

       <div class="alan-uclu">
         <label><span>Başlık puntosu</span>
           <input type="number" id="a-baslikPunto" min="8" max="96" step="1"></label>
         <label><span>Alt başlık puntosu</span>
           <input type="number" id="a-altPunto" min="8" max="72" step="1"></label>
         <label><span>Metin puntosu</span>
           <input type="number" id="a-metinPunto" min="8" max="48" step="1"></label>
       </div>

       <label><span>Görsel</span>
         <span class="gorsel-satir">
           <label class="dosya-btn kucuk">Görsel Seç<input type="file" id="a-gorsel" accept="image/*"></label>
           <button type="button" id="a-gorselSil" class="ikincil">Görseli Kaldır</button>
           <img id="a-onizleme" class="gorsel-onizleme" alt="" hidden>
         </span>
       </label>

       <label><span>Görsel genişliği: <b id="a-genislikDeger"></b> px</span>
         <input type="range" id="a-genislik" min="80" max="900" step="10"></label>

       <div class="alan-uclu">
         <label><span>Arka plan</span><input type="color" id="a-arka"></label>
         <label><span>Yazı rengi</span><input type="color" id="a-yazi"></label>
         <label><span>Başlık rengi</span><input type="color" id="a-baslikRenk"></label>
       </div>

       <label><span>Hizalama</span>
         <select id="a-hizalama">
           <option value="center">Ortalı</option>
           <option value="left">Sola yaslı</option>
           <option value="right">Sağa yaslı</option>
         </select>
       </label>

       <p class="hata" id="a-hata"></p>
     </div>

     <div class="sekme-icerik" data-sekme-icerik="tema" hidden>
       <p class="yardim">Tema, programın tamamının renklerini değiştirir. Seçtiğiniz tema
          kaydedilir ve bir dahaki açılışta da geçerli olur. Grafiklerin seri renkleri
          temadan etkilenmez — renk körlüğü ayrımı doğrulanmış bir palettir.</p>
       <div class="tema-listesi">
         ${Object.entries(TEMALAR).map(([anahtar, t]) => `
           <button type="button" class="tema-kart ${anahtar === aktifTema() ? "secili" : ""}" data-tema="${anahtar}">
             <span class="tema-onizleme" style="background:${t.renkler["--bg"]}; border-color:${t.renkler["--line"]}">
               <i style="background:${t.renkler["--head-bg"]}"></i>
               <b style="background:${t.renkler["--panel"]}; border-color:${t.renkler["--line"]}">
                 <u style="background:${t.renkler["--accent"]}"></u>
                 <s style="background:${t.renkler["--muted"]}"></s>
               </b>
             </span>
             <strong>${kacisla(t.ad)}</strong>
             <span class="tema-aciklama">${kacisla(t.aciklama)}</span>
           </button>`).join("")}
       </div>
     </div>

     <div class="sekme-icerik" data-sekme-icerik="yedek" hidden>
       <p class="yardim">Veriler tarayıcının yerel deposunda tutulur; başka bir bilgisayara
          ya da tarayıcıya kendiliğinden taşınmaz. Yedek dosyası veri sekmelerini, tesis
          bilgilerini, hesap ayarlarını, dashboard yerleşimini ve açılış sayfası düzenini
          bir arada taşır.</p>

       <div class="yedek-bolum">
         <h3>Yedek al</h3>
         <p class="yardim" id="y-durum"></p>
         <table class="yedek-tablo"><tbody id="y-icerik"></tbody></table>
         <button type="button" id="y-indir" class="birincil">Yedeği İndir</button>
       </div>

       <div class="yedek-bolum">
         <h3>Yedekten yükle</h3>
         <p class="yardim">Yükleme, şu anda kayıtlı olan her şeyin yerine geçer.
            Önce mevcut durumun yedeğini almanız önerilir.</p>
         <span class="gorsel-satir">
           <label class="dosya-btn kucuk">Yedek Dosyası Seç<input type="file" id="y-dosya" accept=".json,application/json"></label>
           <span id="y-secim" class="yardim"></span>
         </span>
         <div id="y-onizleme" hidden>
           <table class="yedek-tablo"><tbody id="y-yeniIcerik"></tbody></table>
           <button type="button" id="y-yukle" class="birincil">Bu Yedeği Yükle</button>
         </div>
         <p class="hata" id="y-hata"></p>
       </div>
     </div>

     <div class="sekme-icerik" data-sekme-icerik="hakkinda" hidden>
       <div class="hakkinda-ust">
         <div>
           <h3>${kacisla(KILAVUZ_BASLIK)}</h3>
           <p class="yardim">${kacisla(KILAVUZ_ALT_BASLIK)}</p>
         </div>
         <button type="button" id="h-yazdir" class="birincil">Kılavuzu Yazdır / PDF</button>
       </div>
       <p class="yardim">Kılavuz programın tamamını bölüm bölüm anlatır; başlıklara tıklayarak açın.
          "Yazdır" penceresinde "PDF olarak kaydet" seçerek PDF'e çevirebilirsiniz.</p>
       <div class="kilavuz" id="h-kilavuz">${kilavuzHtml()}</div>
     </div>

     <div class="dugmeler">
       <button type="button" id="a-sifirla" class="ikincil">Sıfırla</button>
       <span class="dugme-bosluk"></span>
       <button type="button" id="a-iptal">İptal</button>
       <button type="button" id="a-tamam" class="birincil">Kaydet</button>
     </div>`,
    (k) => {
      const alanlar = {
        baslik: k.querySelector("#a-baslik"),
        altBaslik: k.querySelector("#a-alt"),
        metin: k.querySelector("#a-metin"),
        baslikPunto: k.querySelector("#a-baslikPunto"),
        altPunto: k.querySelector("#a-altPunto"),
        metinPunto: k.querySelector("#a-metinPunto"),
        gorselGenislik: k.querySelector("#a-genislik"),
        arkaPlan: k.querySelector("#a-arka"),
        yaziRengi: k.querySelector("#a-yazi"),
        baslikRengi: k.querySelector("#a-baslikRenk"),
        hizalama: k.querySelector("#a-hizalama"),
      };
      sekmeleriBagla(k);
      hakkindayiBagla(k);
      temalariBagla(k);
      yedeklemeyiBagla(k);

      const onizleme = k.querySelector("#a-onizleme");
      const genislikDeger = k.querySelector("#a-genislikDeger");
      const hata = k.querySelector("#a-hata");

      function formuDoldur() {
        for (const [ad, el] of Object.entries(alanlar)) el.value = taslak[ad];
        genislikDeger.textContent = taslak.gorselGenislik;
        onizleme.hidden = !taslak.gorsel;
        if (taslak.gorsel) onizleme.src = taslak.gorsel;
      }
      formuDoldur();

      for (const [ad, el] of Object.entries(alanlar)) {
        el.addEventListener("input", () => {
          taslak[ad] = el.type === "number" || el.type === "range" ? Number(el.value) : el.value;
          if (ad === "gorselGenislik") genislikDeger.textContent = el.value;
        });
      }

      k.querySelector("#a-gorsel").addEventListener("change", async (e) => {
        const dosya = e.target.files?.[0];
        e.target.value = "";
        if (!dosya) return;
        hata.textContent = "";
        try {
          taslak.gorsel = await gorseliOku(dosya);
          onizleme.src = taslak.gorsel;
          onizleme.hidden = false;
        } catch (err) {
          hata.textContent = "Görsel yüklenemedi: " + err.message;
        }
      });

      k.querySelector("#a-gorselSil").addEventListener("click", () => {
        taslak.gorsel = null;
        onizleme.hidden = true;
      });

      k.querySelector("#a-sifirla").addEventListener("click", () => {
        if (!confirm("Açılış sayfası ayarları varsayılana dönecek. Onaylıyor musunuz?")) return;
        Object.assign(taslak, VARSAYILAN);
        formuDoldur();
      });

      k.querySelector("#a-iptal").addEventListener("click", diyalogKapat);

      k.querySelector("#a-tamam").addEventListener("click", () => {
        ayar = { ...taslak };
        if (!ayarlariKaydet()) {
          hata.textContent = "Kaydedilemedi — görsel tarayıcı deposu için fazla büyük olabilir.";
          return;
        }
        acilisiCiz();
        diyalogKapat();
      });
    },
    { genis: true }
  );
}
