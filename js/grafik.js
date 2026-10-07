// Dashboard ve robotun SVG grafik yardımcıları.
// Renkler doğrulanmış kategorik paletten gelir; her grafiğin yanında
// aynı sayıları veren bir tablo bulunur (düşük kontrastlı serilerin
// okunabilirlik gereği).


/** Palet bittiğinde renkler başa döner; tur numarası çizgi desenini değiştirir. */
const SERI_DESENLERI = ["", "7 4", "2 3", "10 3 2 3"];

/** Seri sırasına göre çizgi deseni — ilk sekiz seri düz, sonrakiler kesikli. */
function seriDeseni(si) {
  return SERI_DESENLERI[Math.floor(si / SERI_RENKLERI.length) % SERI_DESENLERI.length];
}

const SERI_RENKLERI = [
  "#2a78d6", "#eb6834", "#1baf7a", "#eda100",
  "#e87ba4", "#008300", "#4a3aa7", "#e34948",
];

const KENAR = { ust: 16, sag: 18, alt: 46, sol: 72 };

/*
 * Y ekseni yazıları sabit bir sol paya sığdırılmıştı; dokuz haneli
 * tüketim değerlerinde soldan kesiliyordu. Pay, en uzun eksen yazısına
 * göre hesaplanır.
 */
function solPay(ek) {
  const enUzun = Math.max(...ek.cizgiler.map((v) => kisaSayi(v).length), 1);
  return Math.min(120, Math.max(KENAR.sol, enUzun * 6.6 + 14));
}

const nfKisa = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
const kisaSayi = (v) => (v === null || v === undefined ? "—" : nfKisa.format(v));

/**
 * Dar alanlara sığan çok kısa gösterim: 127.819.459 -> "127,8 mn".
 * Halkanın ortası gibi yeri belli olan yerlerde kullanılır.
 */
const nfKompakt = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });
function kompaktSayi(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const m = Math.abs(v);
  if (m >= 1e9) return nfKompakt.format(v / 1e9) + " mr";
  if (m >= 1e6) return nfKompakt.format(v / 1e6) + " mn";
  if (m >= 1e4) return nfKompakt.format(v / 1e3) + " bin";
  return nfKisa.format(v);
}

/** Eksen için okunabilir adımlarla min/maks ve çizgi konumları. */
function eksen(enKucuk, enBuyuk, adetHedef = 5) {
  if (enKucuk === enBuyuk) { enKucuk -= 1; enBuyuk += 1; }
  const ham = (enBuyuk - enKucuk) / adetHedef;
  const buyukluk = 10 ** Math.floor(Math.log10(Math.abs(ham) || 1));
  const adim = [1, 2, 2.5, 5, 10].map((k) => k * buyukluk).find((k) => k >= ham) ?? buyukluk * 10;
  const alt = Math.floor(enKucuk / adim) * adim;
  const ust = Math.ceil(enBuyuk / adim) * adim;
  const cizgiler = [];
  for (let v = alt; v <= ust + adim / 2; v += adim) cizgiler.push(Number(v.toFixed(10)));
  return { alt, ust, cizgiler };
}

function govde(genislik, yukseklik, ic, { oran = "none" } = {}) {
  return `<svg class="grafik" viewBox="0 0 ${genislik} ${yukseklik}" width="100%"
               height="${yukseklik}" role="img" preserveAspectRatio="${oran}">${ic}</svg>`;
}

function izgara(g, y, ek, etiketler, sol = KENAR.sol) {
  return ek.cizgiler.map((v) => {
    const py = y(v);
    return `<line class="g-izgara" x1="${sol}" y1="${py}" x2="${g - KENAR.sag}" y2="${py}"/>` +
           (etiketler ? `<text class="g-eksen" x="${sol - 8}" y="${py + 4}" text-anchor="end">${kisaSayi(v)}</text>` : "");
  }).join("");
}

/**
 * Çok serili çizgi grafiği. Seriler: [{ ad, degerler:[], renk? }]
 * Etiketler x ekseni başlıkları.
 */
/**
 * Çok serili çizgi grafiği.
 *
 * `etiket.konum` veri etiketlerinin nerede yazılacağını söyler:
 *   "yok" (varsayılan) | "son" (yalnızca son nokta) | "tum" (her nokta)
 * Her noktaya sayı basmak grafiği okunmaz hâle getirdiği için "tum"
 * yalnızca nokta sayısı azken uygulanır.
 */
function cizgiGrafik(etiketler, seriler, {
  yukseklik = 260, sifirCizgisi = false, genislik = 900, etiket = null,
} = {}) {
  const g = genislik;
  const y0 = KENAR.ust;
  const y1 = yukseklik - KENAR.alt;
  const x1 = g - KENAR.sag;

  const tumDegerler = seriler.flatMap((s) => s.degerler).filter((v) => v !== null);
  if (!tumDegerler.length) return `<p class="grafik-bos">Çizilecek veri yok.</p>`;
  const ek = eksen(Math.min(...tumDegerler, sifirCizgisi ? 0 : Infinity),
                   Math.max(...tumDegerler, sifirCizgisi ? 0 : -Infinity));
  const x0 = solPay(ek);

  const x = (i) => x0 + (etiketler.length <= 1 ? 0 : ((x1 - x0) * i) / (etiketler.length - 1));
  const y = (v) => y1 - ((v - ek.alt) / (ek.ust - ek.alt)) * (y1 - y0);

  const yollar = seriler.map((s, si) => {
    const renk = s.renk ?? SERI_RENKLERI[si % SERI_RENKLERI.length];
    let d = "";
    let acik = false;
    s.degerler.forEach((v, i) => {
      if (v === null) { acik = false; return; }
      d += `${acik ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      acik = true;
    });
    const noktalar = s.degerler.map((v, i) => v === null ? "" :
      `<circle class="g-nokta" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4" fill="${renk}"/>`).join("");
    const desen = s.renk ? "" : seriDeseni(si);
    return `<path class="g-cizgi" d="${d}" stroke="${renk}"${desen ? ` stroke-dasharray="${desen}"` : ""}/>` +
           `${s.degerler.length <= 30 ? noktalar : ""}`;
  }).join("");

  const enUzunEtiket = Math.max(...etiketler.map((e) => String(e).length), 1);
  const gerekenYer = enUzunEtiket * 6.2 + 10;
  const aralikBasina = (x1 - x0) / Math.max(etiketler.length - 1, 1);
  const adim = Math.max(1, Math.ceil(gerekenYer / Math.max(aralikBasina, 1)));
  // İlk ve son etiket kenardan taşmasın diye hizaları uca çekilir
  const xEtiket = etiketler.map((e, i) => {
    if (i % adim) return "";
    const hiza = i === 0 ? "start" : i === etiketler.length - 1 ? "end" : "middle";
    return `<text class="g-eksen" x="${x(i).toFixed(1)}" y="${y1 + 18}" text-anchor="${hiza}">${kacisla(e)}</text>`;
  }).join("");

  const sifir = sifirCizgisi && ek.alt < 0 && ek.ust > 0
    ? `<line class="g-sifir" x1="${x0}" y1="${y(0)}" x2="${x1}" y2="${y(0)}"/>` : "";

  // Veri etiketleri
  const eAyar = etiket ? {
    alanlar: { ad: false, deger: true, yuzde: false, birim: false, ...(etiket.alanlar ?? {}) },
    konum: etiket.konum ?? "yok", ayirac: etiket.ayirac ?? " · ",
  } : null;
  let veriEtiketleri = "";
  if (eAyar && eAyar.konum !== "yok") {
    const toplamlar = seriler.map((s) => s.degerler.reduce((a, v) => a + (v ?? 0), 0));
    veriEtiketleri = seriler.map((s, si) => {
      const noktaSayisi = s.degerler.filter((v) => v !== null).length;
      // Her noktaya sayı basmak grafiği okunmaz yapar
      const hepsi = eAyar.konum === "tum" && noktaSayisi <= 24;
      return s.degerler.map((v, i) => {
        if (v === null) return "";
        const sonMu = !s.degerler.slice(i + 1).some((x) => x !== null);
        if (!hepsi && !(eAyar.konum === "son" && sonMu)) return "";
        const yuzde = toplamlar[si] ? ((v / toplamlar[si]) * 100).toFixed(1) : null;
        const metin = veriEtiketMetni(eAyar.alanlar,
          { ad: s.ad, deger: kompaktSayi(v), yuzde, birim: s.birim ?? "" }, eAyar.ayirac);
        if (!metin) return "";
        const hiza = i === 0 ? "start" : i === etiketler.length - 1 ? "end" : "middle";
        return `<text class="g-veri-etiket" x="${x(i).toFixed(1)}" y="${(y(v) - 9).toFixed(1)}"
                      text-anchor="${hiza}">${kacisla(metin)}</text>`;
      }).join("");
    }).join("");
  }

  // İmleç izleme alanları
  const alanlar = etiketler.map((e, i) => {
    const w = (x1 - x0) / Math.max(etiketler.length - 1, 1);
    const ipucu = seriler.map((s, si) =>
      `${s.ad}: ${kisaSayi(s.degerler[i])}`).join("\n");
    return `<rect class="g-hedef" x="${(x(i) - w / 2).toFixed(1)}" y="${y0}" width="${w.toFixed(1)}"
                  height="${y1 - y0}"><title>${kacisla(e + "\n" + ipucu)}</title></rect>`;
  }).join("");

  return govde(g, yukseklik,
    izgara(g, y, ek, true, x0) + sifir + yollar + xEtiket + veriEtiketleri + alanlar +
    `<line class="g-eksen-cizgi" x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}"/>`);
}

/** Yatay çubuk grafiği — büyüklük sıralaması için. */
function yatayCubuk(ogeler, {
  yukseklik, renk = SERI_RENKLERI[0], genislik = 900, etiket = null, birim = "",
} = {}) {
  const eAyar = {
    alanlar: { ad: true, deger: true, yuzde: false, birim: false, ...(etiket?.alanlar ?? {}) },
    konum: etiket?.konum ?? "uc", ayirac: etiket?.ayirac ?? " · ",
  };
  if (!ogeler.length) return `<p class="grafik-bos">Çizilecek veri yok.</p>`;
  const satirYuksekligi = 26;
  const g = genislik;
  const y = yukseklik ?? ogeler.length * satirYuksekligi + 20;
  const sol = eAyar.alanlar.ad ? Math.min(240, Math.round(g * 0.42)) : 10;
  /*
   * Ad sütunu sabit genişliktedir; "Tesis · Doğalgazın enerji içindeki payı"
   * gibi uzun adlar soldan taşıp kesiliyordu. Önce hepsinde ortak olan
   * tesis öneki atılır, gerekirse ad sonundan kısaltılır.
   */
  const adAl = (o) => o.gorunenAd ?? o.ad;
  const ilkOnek = adAl(ogeler[0]).includes(" · ") ? adAl(ogeler[0]).split(" · ")[0] + " · " : null;
  const ortak = ilkOnek && ogeler.every((o) => adAl(o).startsWith(ilkOnek)) ? ilkOnek : null;
  const sigacakHarf = Math.max(8, Math.floor((sol - 14) / 6.2));
  const gorunenAd = (o) => {
    const ad = ortak ? adAl(o).slice(ortak.length) : adAl(o);
    return ad.length > sigacakHarf ? ad.slice(0, sigacakHarf - 1) + "…" : ad;
  };
  const enBuyuk = Math.max(...ogeler.map((o) => Math.abs(o.deger)), 1);
  const genelToplam = ogeler.reduce((a, o) => a + Math.abs(o.deger), 0);
  // Değer etiketi çubuğun sağına yazılır; en uzun metne göre yer ayır
  const etiketPayi = eAyar.konum !== "uc" ? 10
    : Math.max(...ogeler.map((o) => kisaSayi(o.deger).length)) * 7 + (eAyar.alanlar.yuzde ? 56 : 16);

  const cubuklar = ogeler.map((o, i) => {
    const py = 10 + i * satirYuksekligi;
    const w = Math.max((Math.abs(o.deger) / enBuyuk) * (g - sol - etiketPayi), 2);
    const yuzde = genelToplam ? ((o.deger / genelToplam) * 100).toFixed(1) : null;
    const ucMetni = eAyar.konum !== "uc" ? "" : veriEtiketMetni(
      { ...eAyar.alanlar, ad: false },
      { deger: o.gorunenDeger ?? kisaSayi(o.deger), yuzde, birim }, eAyar.ayirac);
    return (eAyar.alanlar.ad
        ? `<text class="g-etiket" x="${sol - 10}" y="${py + 15}" text-anchor="end">${
            kacisla(gorunenAd(o))}<title>${kacisla(adAl(o))}</title></text>` : "") +
      `<rect class="g-cubuk" x="${sol}" y="${py + 3}" width="${w.toFixed(1)}" height="${satirYuksekligi - 10}"
             rx="4" fill="${o.renk ?? renk}"><title>${kacisla(`${o.ad}: ${kisaSayi(o.deger)}`)}</title></rect>` +
      (ucMetni ? `<text class="g-deger" x="${(sol + w + 8).toFixed(1)}" y="${py + 15}">${kacisla(ucMetni)}</text>` : "");
  }).join("");

  return govde(g, y, cubuklar);
}

/** Gruplanmış dikey çubuklar — dönem/yıl karşılaştırmaları için. */
/**
 * Gruplanmış dikey çubuklar — dönem/yıl karşılaştırmaları için.
 *
 * `etiket.konum` "uc" ise her çubuğun ucuna veri etiketi yazılır. Çubuk
 * genişliği metni taşıyamayacak kadar darsa yazılmaz; kaç tanesinin
 * sığmadığı çağırana bildirilmez ama grafik yanıltıcı olmaz.
 */
function grupluCubuk(etiketler, seriler, {
  yukseklik = 280, genislik = 900, etiket = null,
} = {}) {
  const eAyar = {
    alanlar: { ad: false, deger: true, yuzde: false, birim: false, ...(etiket?.alanlar ?? {}) },
    konum: etiket?.konum ?? "yok", ayirac: etiket?.ayirac ?? " · ",
  };
  const tum = seriler.flatMap((s) => s.degerler).filter((v) => v !== null);
  if (!tum.length) return `<p class="grafik-bos">Çizilecek veri yok.</p>`;
  const g = genislik;
  const y0 = KENAR.ust;
  const y1 = yukseklik - KENAR.alt;
  const x1 = g - KENAR.sag;
  const ek = eksen(Math.min(0, ...tum), Math.max(...tum));
  const x0 = solPay(ek);
  const y = (v) => y1 - ((v - ek.alt) / (ek.ust - ek.alt)) * (y1 - y0);

  const grupGenislik = (x1 - x0) / etiketler.length;
  const cubukGenislik = Math.max((grupGenislik - 8) / seriler.length - 2, 2);

  // Yüzde, aynı grup (aynı etiket) içindeki payı gösterir
  const grupToplami = etiketler.map((_, i) =>
    seriler.reduce((a, s) => a + Math.abs(s.degerler[i] ?? 0), 0));

  const veriYazilari = [];
  const cubuklar = etiketler.map((e, i) => seriler.map((s, si) => {
    const v = s.degerler[i];
    if (v === null) return "";
    const renk = s.renk ?? SERI_RENKLERI[si % SERI_RENKLERI.length];
    const px = x0 + i * grupGenislik + 4 + si * (cubukGenislik + 2);
    const py = y(Math.max(v, 0));
    const h = Math.abs(y(v) - y(0));

    if (eAyar.konum === "uc") {
      const metin = veriEtiketMetni(eAyar.alanlar, {
        ad: s.ad,
        deger: kompaktSayi(v),
        yuzde: grupToplami[i] ? ((Math.abs(v) / grupToplami[i]) * 100).toFixed(1) : null,
        birim: s.birim ?? "",
      }, eAyar.ayirac);
      // Dar çubukta metin komşusunun üstüne taşar
      if (metin && metin.length * 5.2 <= cubukGenislik + grupGenislik / seriler.length) {
        veriYazilari.push(`<text class="g-veri-etiket" x="${(px + cubukGenislik / 2).toFixed(1)}"
          y="${(py - 5).toFixed(1)}" text-anchor="middle">${kacisla(metin)}</text>`);
      }
    }

    return `<rect class="g-cubuk" x="${px.toFixed(1)}" y="${py.toFixed(1)}"
                  width="${cubukGenislik.toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" rx="4" fill="${renk}">
              <title>${kacisla(`${e} · ${s.ad}: ${kisaSayi(v)}`)}</title></rect>`;
  }).join("")).join("");

  const enUzunEtiket = Math.max(...etiketler.map((e) => String(e).length), 1);
  const adim = Math.max(1, Math.ceil((enUzunEtiket * 6.2 + 8) / Math.max(grupGenislik, 1)));
  const xEtiket = etiketler.map((e, i) => i % adim ? "" :
    `<text class="g-eksen" x="${(x0 + i * grupGenislik + grupGenislik / 2).toFixed(1)}" y="${y1 + 18}"
           text-anchor="middle">${kacisla(e)}</text>`).join("");

  return govde(g, yukseklik,
    izgara(g, y, ek, true, x0) + cubuklar + veriYazilari.join("") + xEtiket +
    `<line class="g-eksen-cizgi" x1="${x0}" y1="${y(0)}" x2="${x1}" y2="${y(0)}"/>`);
}


/** Seri gösterimi — iki ve daha çok seride her zaman bulunur. */
function gosterge(seriler, { desenli = false } = {}) {
  if (seriler.length < 2) return "";
  return `<div class="g-gosterge">` + seriler.map((s, i) => {
    const renk = s.renk ?? SERI_RENKLERI[i % SERI_RENKLERI.length];
    const desen = desenli ? seriDeseni(i) : "";
    // Kesikli seriler göstergede de kesikli görünsün
    const kutu = desen
      ? `<i style="background:none;border-top:3px dashed ${renk};height:0;border-radius:0"></i>`
      : `<i style="background:${renk}"></i>`;
    return `<span>${kutu}${kacisla(s.ad)}</span>`;
  }).join("") + `</div>`;
}


/* ================= Pasta / halka ================= */

const PASTA_EN_COK = 6;          // altıdan fazla dilim ayırt edilemez
const PASTA_DIGER_RENGI = "#8a97a8";

/** Metni verilen harf sayısına indirir; kesilenin sonuna üç nokta konur. */
function kisaltAd(ad, sinir) {
  if (!ad || !Number.isFinite(sinir) || ad.length <= sinir) return ad;
  return ad.slice(0, Math.max(1, sinir - 1)) + "…";
}

/** Dairenin üzerindeki bir noktanın koordinatı (saat 12'den başlayarak). */
function pastaNokta(cx, cy, yaricap, aci) {
  return [cx + yaricap * Math.cos(aci - Math.PI / 2), cy + yaricap * Math.sin(aci - Math.PI / 2)];
}

/** Halka dilimi yolu. */
function pastaDilim(cx, cy, dis, ic, bas, son) {
  const [x1, y1] = pastaNokta(cx, cy, dis, bas);
  const [x2, y2] = pastaNokta(cx, cy, dis, son);
  const [x3, y3] = pastaNokta(cx, cy, ic, son);
  const [x4, y4] = pastaNokta(cx, cy, ic, bas);
  const genisMi = son - bas > Math.PI ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${dis} ${dis} 0 ${genisMi} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
       + ` L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${ic} ${ic} 0 ${genisMi} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`;
}

/**
 * Bütünün parçalarını halka (donut) olarak gösterir. Parça-bütün ilişkisi
 * bir bakışta okunsun diye kullanılır; yakın değerleri karşılaştırmak için
 * çubuk grafik daha doğrudur.
 *
 * Altıdan fazla parça ayırt edilemediği için kalanlar "Diğer"de toplanır.
 * Dilim renkleri okunaklılık için yeterli kontrasta sahip olmadığından
 * değerler her zaman yazıyla da verilir.
 *
 * @param {Array<{ad: string, deger: number}>} ogeler
 */
/**
 * Bir veri noktasının etiket metnini seçilen alanlardan kurar.
 * Excel'deki "veri etiketi" mantığı: seri adı, değer, yüzde ve birimden
 * hangileri isteniyorsa onlar yan yana yazılır.
 */
function veriEtiketMetni(alanlar, { ad, deger, yuzde, birim }, ayirac = " · ") {
  const parcalar = [];
  if (alanlar.ad && ad) parcalar.push(ad);
  if (alanlar.deger && deger !== null && deger !== undefined) {
    parcalar.push(alanlar.birim && birim ? `${deger} ${birim}` : String(deger));
  }
  if (alanlar.yuzde && yuzde !== null && yuzde !== undefined) parcalar.push(`%${yuzde}`);
  return parcalar.join(ayirac);
}

/**
 * Bütünün parçalarını halka (donut) olarak gösterir. Parça-bütün ilişkisi
 * bir bakışta okunsun diye kullanılır; yakın değerleri karşılaştırmak için
 * çubuk grafik daha doğrudur.
 *
 * Altıdan fazla parça ayırt edilemediği için kalanlar "Diğer"de toplanır.
 *
 * Veri etiketleri `etiket` ile ayarlanır:
 *   alanlar  hangi bilgiler yazılacak (ad, deger, yuzde, birim)
 *   konum    "yan" (yandaki liste) | "ic" (dilimin içi) | "dis" (dışı) | "yok"
 *   ayirac   alanların arasına konan metin
 * Dilim üzerine yazılan etiketler sığmıyorsa çizilmez; sığmayanların sayısı
 * bildirilir, çünkü sessizce eksik bir grafik yanıltıcıdır.
 *
 * @param {Array<{ad: string, deger: number, gorunenAd?: string, gorunenDeger?: string}>} ogeler
 */
function pastaGrafik(ogeler, {
  genislik = 420, yukseklik = 260, birim = "", toplamAdi = "Toplam",
  etiket = null,
} = {}) {
  const e = {
    alanlar: { ad: true, deger: true, yuzde: true, birim: true },
    konum: "yan", ayirac: " · ",
    ...(etiket ?? {}),
  };
  if (etiket?.alanlar) e.alanlar = { ...e.alanlar, ...etiket.alanlar };

  const artilar = ogeler.filter((o) => typeof o.deger === "number" && Number.isFinite(o.deger) && o.deger > 0);
  const elenen = ogeler.length - artilar.length;
  if (artilar.length < 2) {
    return `<p class="grafik-bos">Pasta grafiği için en az iki pozitif değer gerekiyor.</p>`;
  }

  const sirali = artilar.slice().sort((a, b) => b.deger - a.deger);
  const parcalar = sirali.slice(0, PASTA_EN_COK);
  const kalan = sirali.slice(PASTA_EN_COK);
  if (kalan.length) {
    parcalar.push({
      ad: `Diğer (${kalan.length})`,
      deger: kalan.reduce((a, o) => a + o.deger, 0),
      renk: PASTA_DIGER_RENGI,
    });
  }

  const toplam = parcalar.reduce((a, o) => a + o.deger, 0);

  // "Tesis · Doğalgaz" / "Tesis · Elektrik" gibi ortak önek yeri boşuna
  // doldurur; hepsinde aynıysa atılır.
  const adAl = (o) => o.gorunenAd ?? o.ad;
  const onek = adAl(parcalar[0]).includes(" · ") ? adAl(parcalar[0]).split(" · ")[0] + " · " : null;
  const ortakOnek = onek && parcalar.every((o) => adAl(o).startsWith(onek)) ? onek : null;
  const kisaAd = (o) => {
    const ad = adAl(o);
    return ortakOnek ? ad.slice(ortakOnek.length) : ad;
  };
  const degerMetni = (o) => o.gorunenDeger ?? kompaktSayi(o.deger);
  const yuzdeMetni = (o) => ((o.deger / toplam) * 100).toFixed(1);

  // Liste konumları: yanda, üstte ya da altta. Üst/alt yerleşimde halka
  // tüm genişliği kullanır, liste onun üstüne ya da altına yatay akar.
  const yanda = e.konum === "yan";
  const dikeyListe = e.konum === "ust" || e.konum === "alt";
  const listeli = yanda || dikeyListe;
  // Liste üst/alttayken halkaya kalan yükseklik azalır
  const listeBoyu = dikeyListe ? Math.min(74, 18 + Math.ceil(parcalar.length / 2) * 17) : 0;
  const boy = Math.max(90, yukseklik - listeBoyu);

  /*
   * Dilim dışına yazılan etiketler halkanın iki yanında yer kaplar. Yarıçap
   * bu yer ayrıldıktan sonra hesaplanmazsa etiketler pencerenin kenarından
   * taşıp kesilir. Metinler önce kurulur, en uzunu ölçülür, halka ona göre
   * küçülür; yine sığmıyorsa etiketler kısalır (önce ad, sonra yüzde düşer).
   */
  const HARF_EN = 5.4;
  const alanlar = { ...e.alanlar };
  let etiketPayi = 0;
  let adSiniri = Infinity;
  if (e.konum === "dis") {
    /*
     * Etiket uzunsa seri adı atılmaz, kısaltılır: kullanıcı adı açıkça
     * istediyse yerine boşluk değil, sonu üç noktalı bir ad görmeli.
     * Değer ve yüzde kısaltılamayacağı için kalan yeri ad alır.
     */
    const sinir = genislik / 2 - 40;
    const sigacakHarf = Math.floor((sinir - 22) / HARF_EN);
    const adsizUzunluk = Math.max(...parcalar.map((o) => veriEtiketMetni(
      { ...alanlar, ad: false },
      { ad: "", deger: degerMetni(o), yuzde: yuzdeMetni(o), birim }, e.ayirac).length), 0);
    if (alanlar.ad) {
      // Ayraç da yer kaplar
      const ayracPayi = adsizUzunluk ? e.ayirac.length : 0;
      adSiniri = Math.max(6, sigacakHarf - adsizUzunluk - ayracPayi);
    }
    const olculen = Math.max(...parcalar.map((o) => veriEtiketMetni(alanlar, {
      ad: kisaltAd(kisaAd(o), adSiniri), deger: degerMetni(o), yuzde: yuzdeMetni(o), birim,
    }, e.ayirac).length), 0) * HARF_EN + 22;
    etiketPayi = Math.min(olculen, sinir);
  }

  const enSiniri = listeli ? genislik / 2 - 8 : genislik / 2 - (etiketPayi || 8);
  const dis = Math.max(30, Math.min(boy / 2 - (e.konum === "dis" ? 12 : 8), enSiniri));
  const ic = dis * 0.58;
  const cx = yanda ? dis + 8 : genislik / 2;
  const cy = boy / 2;
  const svgEn = yanda ? dis * 2 + 16 : genislik;

  const boslukAcisi = toplam ? Math.min(0.03, 2 / dis) : 0;
  let aci = 0;
  const dilimler = [];
  const yazilar = [];
  let sigmayan = 0;

  for (const [i, o] of parcalar.entries()) {
    const pay = o.deger / toplam;
    const bas = aci + boslukAcisi / 2;
    const son = aci + pay * Math.PI * 2 - boslukAcisi / 2;
    const orta = aci + (pay * Math.PI * 2) / 2;
    aci += pay * Math.PI * 2;
    const renk = o.renk ?? SERI_RENKLERI[i % SERI_RENKLERI.length];
    if (son <= bas) continue;

    dilimler.push(`<path d="${pastaDilim(cx, cy, dis, ic, bas, son)}" fill="${renk}">
      <title>${kacisla(`${kisaAd(o)}: ${kisaSayi(o.deger)}${birim ? " " + birim : ""} (%${yuzdeMetni(o)})`)}</title>
    </path>`);

    if (listeli || e.konum === "yok") continue;

    const metin = veriEtiketMetni(alanlar,
      { ad: kisaltAd(kisaAd(o), adSiniri), deger: degerMetni(o), yuzde: yuzdeMetni(o), birim },
      e.ayirac);
    if (!metin) continue;

    if (e.konum === "ic") {
      // Dilim yayı metni taşıyamayacak kadar darsa yazılmaz
      const yayBoyu = (son - bas) * ((dis + ic) / 2);
      const gerekli = metin.length * 5.4;
      if (yayBoyu < 14 || gerekli > (dis - ic) * 3.4) { sigmayan++; continue; }
      const [tx, ty] = pastaNokta(cx, cy, (dis + ic) / 2, orta);
      yazilar.push(`<text class="g-pasta-ici" x="${tx.toFixed(1)}" y="${(ty + 3).toFixed(1)}"
        text-anchor="middle">${kacisla(metin)}</text>`);
    } else {
      const saga = orta < Math.PI;
      const [ux, uy] = pastaNokta(cx, cy, dis, orta);
      const [vx, vy] = pastaNokta(cx, cy, dis + 8, orta);
      const ux2 = vx + (saga ? 10 : -10);
      yazilar.push(`<polyline class="g-pasta-cizgi" points="${ux.toFixed(1)},${uy.toFixed(1)} ${
        vx.toFixed(1)},${vy.toFixed(1)} ${ux2.toFixed(1)},${vy.toFixed(1)}"/>
        <text class="g-pasta-disi" x="${(ux2 + (saga ? 3 : -3)).toFixed(1)}" y="${(vy + 3).toFixed(1)}"
          text-anchor="${saga ? "start" : "end"}">${kacisla(metin)}</text>`);
    }
  }

  /*
   * Ortadaki toplam halkanın deliğine sığmalı. Delik, dilim dışı etiketler
   * için küçüldüğünde yazı da küçülür; hiç sığmıyorsa yazılmaz — taşan bir
   * sayı, olmayan bir sayıdan daha kötüdür.
   */
  const metinEni = kompaktSayi(toplam).length;
  const sigacakPunto = Math.min(15, ((ic * 2 - 8) / Math.max(metinEni, 1)) * 1.7);
  const orta = sigacakPunto < 8 ? "" : `
    <text class="g-pasta-toplam" x="${cx}" y="${cy - 1}" text-anchor="middle"
          style="font-size:${sigacakPunto.toFixed(1)}px">${kacisla(kompaktSayi(toplam))}</text>
    ${sigacakPunto >= 12 ? `<text class="g-pasta-alt" x="${cx}" y="${cy + 14}" text-anchor="middle">${
      kacisla(birim || toplamAdi)}</text>` : ""}`;

  const lejant = listeli ? `<ul class="pasta-lejant${dikeyListe ? " yatay" : ""}">${parcalar.map((o, i) => {
    const renk = o.renk ?? SERI_RENKLERI[i % SERI_RENKLERI.length];
    return `<li><i style="background:${renk}"></i>
      ${e.alanlar.ad ? `<span class="pasta-ad" title="${kacisla(adAl(o))}">${kacisla(kisaAd(o))}</span>` : `<span class="pasta-ad"></span>`}
      ${e.alanlar.deger ? `<b title="${kacisla(kisaSayi(o.deger))}">${kacisla(degerMetni(o))}${
        e.alanlar.birim && birim ? " " + kacisla(birim) : ""}</b>` : ""}
      ${e.alanlar.yuzde ? `<em>%${yuzdeMetni(o)}</em>` : ""}</li>`;
  }).join("")}</ul>` : "";

  const notlar = [];
  if (elenen) notlar.push(`${elenen} değer sıfır ya da negatif olduğu için pastaya girmedi.`);
  if (sigmayan) notlar.push(`${sigmayan} dilim etiketi sığmadığı için yazılmadı; "Dilimin dışında" konumunu deneyin.`);
  if (e.konum === "dis" && Number.isFinite(adSiniri)
      && parcalar.some((o) => kisaAd(o).length > adSiniri)) {
    notlar.push("Seri adları pencereye sığması için kısaltıldı; tam adlar dilimin ipucunda."
      + " Daha geniş bir pencere ya da \"Yanda liste\" konumu adları tam gösterir.");
  }

  const cizim = govde(svgEn, boy, dilimler.join("") + yazilar.join("") + orta,
    { oran: "xMidYMid meet" });
  const govdeIcerigi = e.konum === "ust" ? lejant + cizim : cizim + lejant;

  return `${ortakOnek && e.alanlar.ad ? `<p class="pasta-kaynak">${kacisla(ortakOnek.replace(" · ", ""))}</p>` : ""}
  <div class="pasta-sar${yanda ? "" : dikeyListe ? " dikey" : " ortali"}">
    ${govdeIcerigi}
  </div>${notlar.length ? `<p class="grafik-not">${kacisla(notlar.join(" "))}</p>` : ""}`;
}
