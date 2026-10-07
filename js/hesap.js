// Hesaplanmış Değerler sayfası: mahsuplaşma motorunun ürettiği göstergeleri
// gösterir. Bu dosya yalnızca arayüzdür; hesap js/mahsup-motoru.js'tedir.
//
// İki görünüm vardır:
//   Tesis  — tek tesisin (ya da bütün tesislerin toplamının) tüm göstergeleri
//   Matris — tek gösterge, sütunlarda bütün tesisler ve toplam

let hesapBekliyor = false;

/* ================= Çizim ================= */

function gorunurGostergeler() {
  const gizli = new Set(hesapAyar.gizliGostergeler ?? []);
  const liste = gorunurGostergeListesi().filter((g) => !gizli.has(g.id));
  const sira = hesapAyar.gostergeSirasi;
  if (Array.isArray(sira) && sira.length) {
    const yeri = new Map(sira.map((id, i) => [id, i]));
    liste.sort((a, b) => (yeri.get(a.id) ?? 1e6) - (yeri.get(b.id) ?? 1e6));
  }
  return liste;
}

/** Matris sütunları: tesisler (kullanıcının sırasıyla), en sonda toplam. */
function matrisTesisleri() {
  const tesisler = hesapTesisleri().filter((t) => !t.toplam);
  const yeri = new Map((hesapAyar.tesisSirasi ?? []).map((id, i) => [id, i]));
  if (yeri.size) tesisler.sort((a, b) => (yeri.get(a.id) ?? 1e6) - (yeri.get(b.id) ?? 1e6));
  return tesisler.length > 1 ? [...tesisler, hesapTesisi("toplam")] : tesisler;
}

/** Dönem satırları ve her yılın sonunda yıl toplamı. */
function satirPlani(donemler) {
  const plan = [];
  donemler.forEach((p, i) => {
    plan.push({ tur: "donem", donem: p, yilBasi: i === 0 || donemler[i - 1].yil !== p.yil });
    if (i === donemler.length - 1 || donemler[i + 1].yil !== p.yil) {
      plan.push({ tur: "yil", yil: p.yil, nolar: donemler.filter((d) => d.yil === p.yil).map((d) => d.no) });
    }
  });
  return plan;
}

function hucre(v, basamak, veri = "") {
  return `<td class="hesap-huc${v === null ? " bos" : ""}"${veri}>${hesapBicimle(v, basamak)}</td>`;
}

function govdeyiUret(sutunlar, donemler) {
  // sutunlar: [{ tesisId, gostergeId, basamak }]
  const tumNolar = donemler.map((d) => d.no);
  const ozet = `<tr class="ozet-satir">
    <td class="gutter">Σ</td><td class="sabit-1" colspan="2">Tüm dönemler</td>` +
    sutunlar.map((s) => hucre(aralikDegeri(s.tesisId, s.gostergeId, tumNolar), s.basamak)).join("") + `</tr>`;

  const seriler = sutunlar.map((s) => gostergeSerisi(s.tesisId, s.gostergeId));
  const satirlar = satirPlani(donemler).map((p) => {
    if (p.tur === "yil") {
      return `<tr class="ozet-satir yil-ozet"><td class="gutter">Σ</td>
        <td class="sabit-1" colspan="2">${p.yil} toplamı</td>` +
        sutunlar.map((s) => hucre(aralikDegeri(s.tesisId, s.gostergeId, p.nolar), s.basamak)).join("") + `</tr>`;
    }
    const d = p.donem;
    return `<tr${p.yilBasi ? ' class="yil-basi"' : ""}><td class="gutter">${d.no}</td>
      <td class="sabit-1">${d.yil}</td><td class="sabit-2">${kacisla(d.ay)}</td>` +
      sutunlar.map((s, si) => {
        const v = seriler[si][d.no - 1] ?? null;
        return `<td class="hesap-huc${v === null ? " bos" : ""}" tabindex="0"
                    data-tesis="${kacisla(s.tesisId)}" data-gosterge="${s.gostergeId}" data-donem="${d.no}"
                    title="Hesabı görmek için tıklayın">${hesapBicimle(v, s.basamak)}</td>`;
      }).join("") + `</tr>`;
  }).join("");
  return ozet + satirlar;
}

function hesapCiz() {
  const basliklar = document.getElementById("hBasliklar");
  const birimler = document.getElementById("hBirimler");
  const govde = document.getElementById("hSatirlar");
  if (!basliklar) return;

  const sonuc = mahsupSonucu();
  const tesisler = hesapTesisleri();
  aracCubuguTazele(tesisler);

  if (tesisler.length <= 1) {
    basliklar.innerHTML = "";
    birimler.innerHTML = "";
    govde.innerHTML = `<tr><td class="kontrol-temiz" colspan="3">
      Henüz tesis sekmesi yok. Veri sayfasında alttaki <b>+</b> düğmesiyle
      "Mahsuplaşma tesisi" şablonundan bir sekme ekleyin — göstergeler burada kendiliğinden oluşur.</td></tr>`;
    return;
  }
  if (!sonuc.donemler.length) {
    basliklar.innerHTML = "";
    birimler.innerHTML = "";
    govde.innerHTML = `<tr><td class="kontrol-temiz" colspan="3">
      Dönem bulunamadı. Veri sayfasındaki satırlara YIL ve AY yazın.</td></tr>`;
    return;
  }

  const bas = `<th class="gutter">#</th><th class="sabit-1">YIL</th><th class="sabit-2">AY</th>`;
  const birimBas = `<th class="gutter"></th><th class="sabit-1"></th><th class="sabit-2"></th>`;

  if (hesapAyar.gorunum === "matris") {
    const g = GOSTERGE[hesapAyar.seciliGosterge] ?? GOSTERGE.mahsup;
    const sutunlar = matrisTesisleri();
    basliklar.innerHTML = bas + sutunlar.map((t) =>
      `<th class="grup-${t.toplam ? "degisim" : "enerji"}" data-tesis="${kacisla(t.id)}"
           title="${kacisla(t.ad)}"><span class="kod">${t.toplam ? "Σ" : "Tesis"}</span>${kacisla(t.ad)}</th>`).join("");
    birimler.innerHTML = birimBas + sutunlar.map(() => `<th class="birim-hucre">${kacisla(g.birim)}</th>`).join("");
    govde.innerHTML = govdeyiUret(sutunlar.map((t) => ({ tesisId: t.id, gostergeId: g.id, basamak: g.basamak })),
      sonuc.donemler);
    sutunTasimayiBagla(basliklar, {
      anahtar: "tesis",
      tasinabilir: (th) => th.dataset.tesis && th.dataset.tesis !== "toplam",
      birak: (kaynak, hedef, oncesine) => {
        const sira = matrisTesisleri().filter((t) => !t.toplam).map((t) => t.id);
        if (!diziyiTasi(sira, (id) => id, kaynak, hedef, oncesine)) return;
        hesapAyar.tesisSirasi = sira;
        hesapKaydet(); denetciKapat(); hesapCiz();
      },
    });
    return;
  }

  const tesis = hesapTesisi(hesapAyar.seciliTesis) ?? tesisler[0];
  hesapAyar.seciliTesis = tesis.id;
  const gostergeler = gorunurGostergeler();
  basliklar.innerHTML = bas + gostergeler.map((g) => {
    const kaynaklar = hesapAyar.kaynakRozeti ? gostergeKaynaklari(tesis.id, g.id) : [];
    const rozet = kaynaklar.length
      ? `<span class="kaynak-rozet" title="${kacisla("Beslendiği sütunlar: " + kaynaklar.join(", "))}">${
          kacisla([...new Set(kaynaklar)].slice(0, 6).join(" · "))}</span>` : "";
    return `<th class="grup-${g.tur === "oran" ? "degisim" : "verim"}" data-gosterge="${g.id}"
                title="${kacisla(g.ad + " — " + g.aciklama)}">${kacisla(g.ad)}${rozet}</th>`;
  }).join("");
  birimler.innerHTML = birimBas + gostergeler.map((g) => `<th class="birim-hucre">${kacisla(g.birim)}</th>`).join("");
  govde.innerHTML = govdeyiUret(gostergeler.map((g) => ({ tesisId: tesis.id, gostergeId: g.id, basamak: g.basamak })),
    sonuc.donemler);

  sutunTasimayiBagla(basliklar, {
    anahtar: "gosterge",
    birak: (kaynak, hedef, oncesine) => {
      const sira = gorunurGostergeListesi().map((g) => g.id);
      const mevcut = gorunurGostergeler().map((g) => g.id);
      const tam = [...mevcut, ...sira.filter((id) => !mevcut.includes(id))];
      if (!diziyiTasi(tam, (id) => id, kaynak, hedef, oncesine)) return;
      hesapAyar.gostergeSirasi = tam;
      hesapKaydet(); denetciKapat(); hesapCiz();
    },
  });
}

function aracCubuguTazele(tesisler) {
  const tesisSec = document.getElementById("hesapTesis");
  const gostergeSec = document.getElementById("hesapGosterge");
  const tesisModu = hesapAyar.gorunum !== "matris";

  document.getElementById("hesapTesisAlan").hidden = !tesisModu;
  document.getElementById("hesapGostergeAlan").hidden = tesisModu;
  for (const btn of document.querySelectorAll(".gorunum-btn")) {
    btn.classList.toggle("secili", btn.dataset.gorunum === hesapAyar.gorunum);
  }

  if (!tesisler.some((t) => t.id === hesapAyar.seciliTesis)) hesapAyar.seciliTesis = tesisler[0]?.id ?? "toplam";
  tesisSec.innerHTML = tesisler.map((t) =>
    `<option value="${kacisla(t.id)}" ${t.id === hesapAyar.seciliTesis ? "selected" : ""}>${kacisla(t.ad)}</option>`).join("");
  gostergeSec.innerHTML = gorunurGostergeListesi().map((g) =>
    `<option value="${g.id}" ${g.id === hesapAyar.seciliGosterge ? "selected" : ""}>${
      kacisla(g.ad)} (${kacisla(g.birim)})</option>`).join("");

  const tesisBtn = document.getElementById("hesapTesisBilgi");
  if (tesisBtn) tesisBtn.disabled = !tesisModu || hesapAyar.seciliTesis === "toplam";
  const rolBtn = document.getElementById("hesapRoller");
  if (rolBtn) rolBtn.disabled = tesisler.length <= 1;

  const bilgi = document.getElementById("hesapBilgi");
  if (bilgi) {
    const s = mahsupSonucu();
    bilgi.textContent = `${tesisler.length - 1} tesis · ${s.donemler.length} dönem`;
  }
}

/* ================= Excel dışa aktarma ================= */

function tabloSayfasi(ad, sutunlar) {
  // sutunlar: [{ baslik, birim, tesisId, gostergeId, basamak }]
  const s = mahsupSonucu();
  const tumNolar = s.donemler.map((d) => d.no);
  const baslik = ["#", "YIL", "AY", ...sutunlar.map((c) => c.baslik)];
  const birim = ["", "", "", ...sutunlar.map((c) => c.birim ?? "")];
  const toplam = ["Σ", "Tüm dönemler", "",
    ...sutunlar.map((c) => aktarimDegeri(aralikDegeri(c.tesisId, c.gostergeId, tumNolar), c.basamak))];
  const seriler = sutunlar.map((c) => gostergeSerisi(c.tesisId, c.gostergeId));
  const govde = [];
  for (const p of satirPlani(s.donemler)) {
    if (p.tur === "yil") {
      govde.push(["Σ", `${p.yil} toplamı`, "",
        ...sutunlar.map((c) => aktarimDegeri(aralikDegeri(c.tesisId, c.gostergeId, p.nolar), c.basamak))]);
    } else {
      const d = p.donem;
      govde.push([d.no, d.yil, d.ay, ...sutunlar.map((c, i) => aktarimDegeri(seriler[i][d.no - 1] ?? null, c.basamak))]);
    }
  }
  return { ad, satirlar: [baslik, birim, toplam, ...govde] };
}

function tesisSayfasi(tesis, gostergeler) {
  return tabloSayfasi(tesis.ad, gostergeler.map((g) => ({
    baslik: g.ad, birim: g.birim, tesisId: tesis.id, gostergeId: g.id, basamak: g.basamak,
  })));
}

function ekrandakiniAktar() {
  if (hesapAyar.gorunum === "matris") {
    const g = GOSTERGE[hesapAyar.seciliGosterge] ?? GOSTERGE.mahsup;
    const sayfa = tabloSayfasi(g.ad, matrisTesisleri().map((t) => ({
      baslik: t.ad, birim: g.birim, tesisId: t.id, gostergeId: g.id, basamak: g.basamak,
    })));
    const ad = calismaKitabiIndir(`hesaplanmis-${dosyaAdiTemizle(g.ad)}`, [sayfa]);
    return hesapDurumu(ad ? `"${g.ad}" aktarıldı` : "Aktarılamadı");
  }
  const tesis = hesapTesisi(hesapAyar.seciliTesis);
  if (!tesis) return hesapDurumu("Aktarılacak tesis yok");
  const ad = calismaKitabiIndir(`hesaplanmis-${dosyaAdiTemizle(tesis.ad)}`,
    [tesisSayfasi(tesis, gorunurGostergeler())]);
  hesapDurumu(ad ? `"${tesis.ad}" aktarıldı` : "Aktarılamadı");
}

/** Her tesis (ve toplam) ayrı sayfa; gizlenen göstergeler de yazılır. */
function tumunuAktar() {
  const tesisler = hesapTesisleri();
  if (tesisler.length <= 1) return hesapDurumu("Aktarılacak tesis yok");
  const sayfalar = tesisler.map((t) => tesisSayfasi(t, gorunurGostergeListesi()));
  const ad = calismaKitabiIndir("hesaplanmis-tum-tesisler", sayfalar);
  hesapDurumu(ad ? `${sayfalar.length} sayfa aktarıldı` : "Aktarılamadı");
}

function hesapDurumu(mesaj) {
  const el = document.getElementById("hesapBilgi");
  if (!el) return;
  const onceki = el.textContent;
  el.textContent = mesaj;
  clearTimeout(hesapDurumu._t);
  hesapDurumu._t = setTimeout(() => (el.textContent = onceki), 2500);
}

/* ================= Hücre denetçisi ================= */

function denetciKapat() {
  document.getElementById("hesapDenetci")?.setAttribute("hidden", "");
  for (const td of document.querySelectorAll(".hesap-huc.incelenen")) td.classList.remove("incelenen");
}

function girdiSatirlari(g) {
  const ad = g.tanim?.ad ?? g.rol;
  const birim = g.tanim?.birim ? ` ${g.tanim.birim}` : "";
  if (!g.kolonlar.length) {
    const zorunlu = g.tanim?.zorunlu;
    return `<tr class="${zorunlu ? "sorunlu" : "supheli"}">
      <td>${kacisla(ad)}</td><td class="kolon-hucre">—</td><td class="sayi">—</td>
      <td class="durum-hucre">${zorunlu ? "Sütun yok (gerekli)" : "Sütun yok"}</td></tr>`;
  }
  return g.kolonlar.map((k, i) => {
    let durum = "";
    let sinif = "";
    if (k.deger === null) { durum = typeof k.ham === "string" && k.ham ? `Sayı değil: ${k.ham}` : "Boş"; sinif = g.tanim?.zorunlu ? "sorunlu" : "supheli"; }
    else if (k.deger < 0) { durum = "Negatif"; sinif = "sorunlu"; }
    return `<tr class="${sinif}">
      <td>${i === 0 ? kacisla(ad) : ""}</td>
      <td class="kolon-hucre">${kacisla(`${k.col} — ${k.header}`)}</td>
      <td class="sayi">${k.deger === null ? "—" : hesapBicimle(k.deger, 2) + kacisla(birim)}</td>
      <td class="durum-hucre">${kacisla(durum)}<button type="button" class="git-btn"
          data-kolon="${k.col}" data-satir="${k.satirNo}" title="Veri sayfasında bu hücreye git">↗</button></td>
    </tr>`;
  }).join("");
}

function denetciAc(tesisId, gostergeId, donemNo) {
  const iz = izleriAl(tesisId, gostergeId, donemNo);
  const panel = document.getElementById("hesapDenetci");
  if (!iz || !panel) return;
  const g = iz.gosterge;
  const sonucHtml = `<div class="denetci-sonuc ${iz.sonuc === null ? "yok" : ""}">
      <span>Sonuç</span>
      <b>${iz.sonuc === null ? "—" : hesapBicimle(iz.sonuc, g.basamak) + " " + kacisla(g.birim)}</b>
    </div>`;
  const oranMetni = g.tur === "oran"
    ? `<p class="denetci-not">Oran: ${kacisla(GOSTERGE[g.pay].ad)} / ${kacisla(GOSTERGE[g.payda].ad)}${
        g.carpan === 100 ? " × 100" : ""}</p>` : "";

  let govde;
  if (iz.toplam) {
    govde = `<h4>Tesislere göre döküm</h4>
      <table class="denetci-tablo"><tbody>${iz.dokum.map((x) => `<tr>
        <td>${kacisla(x.tesis.ad)}</td><td></td>
        <td class="sayi">${x.deger === null ? "—" : hesapBicimle(x.deger, g.basamak) + " " + kacisla(g.birim)}</td>
        <td></td></tr>`).join("")}</tbody></table>`;
  } else {
    govde = `<h4>Kullanılan veriler · ${kacisla(iz.tesis.ad)}</h4>
      ${iz.satirVar ? (iz.girdiler.length
        ? `<table class="denetci-tablo" data-sayfa="${kacisla(iz.tesis.id)}">
             <thead><tr><th>Rol</th><th>Veri sütunu</th><th>Değer</th><th></th></tr></thead>
             <tbody>${iz.girdiler.map(girdiSatirlari).join("")}</tbody></table>`
        : `<p class="denetci-not">Bu gösterge tesis bilgilerinden hesaplanır (kurulu güç).</p>`)
        : `<p class="denetci-uyari">Bu sekmede ${kacisla(iz.donem.etiket)} dönemine ait satır yok.</p>`}
      ${iz.ara.some(([, v]) => v !== null) ? `<h4>Ara sonuçlar</h4>
        <table class="denetci-tablo"><tbody>${iz.ara.filter(([, v]) => v !== null).map(([ad, v, b]) => `<tr>
          <td>${kacisla(ad)}</td><td></td><td class="sayi">${hesapBicimle(v, 0)} ${b}</td><td></td></tr>`).join("")}
        </tbody></table>` : ""}
      ${iz.notlar.length ? iz.notlar.map((n) => `<p class="denetci-not">${kacisla(n)}</p>`).join("") : ""}`;
  }

  panel.innerHTML = `
    <div class="denetci-bas">
      <div>
        <span class="denetci-grup">${kacisla(iz.toplam ? "Tüm tesisler" : iz.tesis.ad)}</span>
        <h3>${kacisla(g.ad)}</h3>
        <p class="denetci-donem">${kacisla(iz.donem.etiket)}</p>
      </div>
      <button type="button" id="denetciKapat" title="Kapat">✕</button>
    </div>
    <p class="denetci-aciklama">${kacisla(g.aciklama)}</p>
    ${oranMetni}
    ${govde}
    ${sonucHtml}`;
  panel.removeAttribute("hidden");
  panel.querySelector("#denetciKapat").addEventListener("click", denetciKapat);
}

/* ================= Diyaloglar ================= */

/** Seçili tesis sekmesinin sütunlarına rol verdirir. */
function rollerDiyalogu() {
  const tesisler = hesapTesisleri().filter((t) => !t.toplam);
  if (!tesisler.length) return;
  let tesisId = tesisler.some((t) => t.id === hesapAyar.seciliTesis) ? hesapAyar.seciliTesis : tesisler[0].id;

  const ciz = () => {
    const kolonlar = sayfaKolonlari(tesisId).filter((c) => c.type !== "year" && c.type !== "month");
    const satirlar = sayfaSatirlari(tesisId);
    const doluluk = (col) => satirlar.filter((s) => {
      const v = sayfaDegeri(tesisId, col, s.no);
      return typeof v === "number" && v !== 0;
    }).length;
    const bagli = new Set(kolonlar.map((c) => c.rol).filter(Boolean));
    const eksik = MAHSUP_ROLLERI.filter((r) => r.zorunlu && !bagli.has(r.anahtar));

    diyalogAc(
      `<h2>Sütun rolleri</h2>
       <label><span>Tesis sekmesi</span>
         <select id="sr-tesis">${tesisler.map((t) => `<option value="${kacisla(t.id)}" ${
           t.id === tesisId ? "selected" : ""}>${kacisla(t.ad)}</option>`).join("")}</select></label>
       <p class="yardim">Hesaplar sütunları rollerinden tanır. Aynı rolü birden çok sütuna verirseniz
          değerleri toplanır (örneğin iki tüketim sayacı). Metin sütunları hesaba katılmaz.</p>
       ${eksik.length ? `<p class="denetci-uyari">Gerekli rol bağlanmamış: ${eksik.map((r) => kacisla(r.ad)).join(", ")}</p>` : ""}
       <div class="esleme-liste">
         ${kolonlar.map((c) => `
           <label class="esleme-satir">
             <span><b>${c.col}</b> — ${kacisla(c.header)}${c.birim ? ` <em>${kacisla(c.birim)}</em>` : ""}
               <small class="yardim">${doluluk(c.col)}/${satirlar.length} dönem dolu</small></span>
             ${c.type === "text" ? `<span class="yardim">metin sütunu</span>` :
               `<select data-kolon="${c.col}">${rolSecenekleri(c.rol ?? "")}</select>`}
           </label>`).join("")}
       </div>
       <div class="dugmeler">
         <button type="button" id="sr-tahmin" class="ikincil">Başlıklardan tahmin et</button>
         <span class="dugme-bosluk"></span>
         <button type="button" id="sr-iptal">İptal</button>
         <button type="button" id="sr-tamam" class="birincil">Kaydet</button>
       </div>`,
      (k) => {
        k.querySelector("#sr-tesis").addEventListener("change", (e) => { tesisId = e.target.value; ciz(); });
        k.querySelector("#sr-tahmin").addEventListener("click", () => {
          for (const sec of k.querySelectorAll("select[data-kolon]")) {
            if (sec.value) continue;
            const c = kolonlar.find((x) => x.col === sec.dataset.kolon);
            sec.value = rolTahmin(c.header, c.birim) ?? "";
          }
        });
        k.querySelector("#sr-iptal").addEventListener("click", diyalogKapat);
        k.querySelector("#sr-tamam").addEventListener("click", () => {
          const roller = Object.fromEntries([...k.querySelectorAll("select[data-kolon]")]
            .map((s) => [s.dataset.kolon, s.value || null]));
          sayfaRolleriniYaz(tesisId, roller);
          diyalogKapat();
        });
      },
      { genis: true }
    );
  };
  ciz();
}

/** Hangi göstergelerin tabloda görüneceğini seçtirir. */
function gostergeSecimDiyalogu() {
  const hepsi = gorunurGostergeListesi();
  const gizli = new Set(hesapAyar.gizliGostergeler ?? []);
  const ozet = new Set(["uretim", "tuketim", "mahsup", "ihtiyacFazlasi", "ozTuketim", "limitOrani", "ifGeliri", "fayda"]);
  diyalogAc(`
    <h2>Göstergeler</h2>
    <p class="yardim">Tesis görünümünde hangi göstergelerin sütun olarak görüneceğini seçin.
       Sütunları başlıklarından sürükleyerek de sıralayabilirsiniz.</p>
    <div class="esleme-liste">
      ${hepsi.map((g) => `
        <label class="secim-satir">
          <input type="checkbox" value="${g.id}" ${gizli.has(g.id) ? "" : "checked"}>
          <span>${kacisla(g.ad)} <em>${kacisla(g.birim)}</em></span>
        </label>`).join("")}
    </div>
    <div class="dugmeler">
      <button type="button" id="g-hepsi" class="ikincil">Hepsini seç</button>
      <button type="button" id="g-ozet" class="ikincil">Özet</button>
      <span class="dugme-bosluk"></span>
      <button type="button" id="g-iptal">İptal</button>
      <button type="button" id="g-tamam" class="birincil">Uygula</button>
    </div>`,
    (k) => {
      const kutular = [...k.querySelectorAll("input[type=checkbox]")];
      k.querySelector("#g-hepsi").addEventListener("click", () => { for (const c of kutular) c.checked = true; });
      k.querySelector("#g-ozet").addEventListener("click", () => { for (const c of kutular) c.checked = ozet.has(c.value); });
      k.querySelector("#g-iptal").addEventListener("click", diyalogKapat);
      k.querySelector("#g-tamam").addEventListener("click", () => {
        hesapAyar.gizliGostergeler = kutular.filter((c) => !c.checked).map((c) => c.value);
        hesapKaydet();
        diyalogKapat();
        hesapCiz();
      });
    },
    { genis: true }
  );
}

/* ================= Başlat ================= */

function hesapKur() {
  motorKur();

  for (const btn of document.querySelectorAll(".gorunum-btn")) {
    btn.addEventListener("click", () => {
      hesapAyar.gorunum = btn.dataset.gorunum;
      hesapKaydet(); denetciKapat(); hesapCiz();
    });
  }
  document.getElementById("hesapTesis").addEventListener("change", (e) => {
    hesapAyar.seciliTesis = e.target.value;
    hesapKaydet(); denetciKapat(); hesapCiz();
  });
  document.getElementById("hesapGosterge").addEventListener("change", (e) => {
    hesapAyar.seciliGosterge = e.target.value;
    hesapKaydet(); denetciKapat(); hesapCiz();
  });

  document.getElementById("hesapDisaAktar").addEventListener("click", ekrandakiniAktar);
  document.getElementById("hesapTumunuAktar").addEventListener("click", tumunuAktar);
  document.getElementById("hesapGostergeSec").addEventListener("click", gostergeSecimDiyalogu);
  document.getElementById("hesapRoller").addEventListener("click", rollerDiyalogu);
  document.getElementById("hesapTesisBilgi").addEventListener("click", () => {
    if (hesapAyar.seciliTesis !== "toplam") tesisBilgileriDiyalogu(hesapAyar.seciliTesis);
  });

  const rozetDugmesi = document.getElementById("hesapRozet");
  const rozetiGoster = () => {
    rozetDugmesi.classList.toggle("etkin", hesapAyar.kaynakRozeti);
    rozetDugmesi.textContent = hesapAyar.kaynakRozeti ? "Kaynakları Gizle" : "Kaynakları Göster";
  };
  rozetDugmesi.addEventListener("click", () => {
    hesapAyar.kaynakRozeti = !hesapAyar.kaynakRozeti;
    rozetiGoster(); hesapKaydet(); hesapCiz();
  });
  rozetiGoster();

  const govde = document.getElementById("hSatirlar");
  govde.addEventListener("click", (e) => {
    const td = e.target.closest(".hesap-huc");
    if (!td || !td.dataset.gosterge) return;
    for (const d of document.querySelectorAll(".hesap-huc.incelenen")) d.classList.remove("incelenen");
    td.classList.add("incelenen");
    denetciAc(td.dataset.tesis, td.dataset.gosterge, Number(td.dataset.donem));
  });
  govde.addEventListener("keydown", (e) => {
    const td = e.target.closest(".hesap-huc");
    if (td && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); td.click(); }
  });

  document.getElementById("hesapDenetci").addEventListener("click", (e) => {
    const btn = e.target.closest(".git-btn");
    if (!btn) return;
    const sayfaId = btn.closest("[data-sayfa]")?.dataset.sayfa;
    if (!sayfaId) return;
    sayfaGoster("veri");
    requestAnimationFrame(() => hucreyeGit(sayfaId, btn.dataset.kolon, Number(btn.dataset.satir)));
  });

  document.addEventListener("keydown", (e) => { if (e.key === "Escape") denetciKapat(); });
  document.addEventListener("veri-degisti", () => {
    if (document.getElementById("sayfa-hesap")?.hidden) hesapBekliyor = true;
    else hesapCiz();
  });

  hesapCiz();
}

function hesapSayfasiAcildi() {
  hesapBekliyor = false;
  hesapCiz();
}
