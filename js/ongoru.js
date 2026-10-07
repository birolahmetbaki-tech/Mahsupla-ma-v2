// Öngörü motoru. Panodaki öngörü penceresi ve analiz robotu buradan
// beslenir; ikisinin aynı sayıyı göstermesi için hesap tek yerde durur.


/** Kurulabilecek model türleri. */
const ONGORU_MODELLERI = {
  trend: { ad: "Düz trend", aciklama: "Geçmişteki doğrusal eğilimi ileriye uzatır" },
  surucu: { ad: "Sürücü değişkenle", aciklama: "Tüketimi üretim gibi bir değişkene bağlayıp o değişkenin gidişinden tahmin eder" },
};

/**
 * Seçilen dönemden sonraki ay adlarını üretir. Ay sütunu ad ("Ocak") ya da
 * sayı olabildiği için ikisi de okunur.
 */
const AY_ADLARI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
                   "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function gelecekDonemleri(sonSatir, adet) {
  const etiketler = [];
  let yil = sonSatir?.yil ?? new Date().getFullYear();
  const hamAy = sonSatir?.ay;
  let ay = Number(hamAy);
  if (!Number.isFinite(ay) || ay < 1 || ay > 12) {
    const sira = AY_ADLARI.findIndex((a) =>
      String(hamAy ?? "").trim().toLocaleLowerCase("tr") === a.toLocaleLowerCase("tr"));
    ay = sira >= 0 ? sira + 1 : 12;
  }
  for (let i = 0; i < adet; i++) {
    ay += 1;
    if (ay > 12) { ay = 1; yil += 1; }
    etiketler.push({ yil, ay, etiket: `${yil} ${AY_ADLARI[ay - 1]}` });
  }
  return etiketler;
}

/** Baz sonu yılına göre modele girecek dönem sayısı. Boşsa tüm seri. */
function bazDonemSayisi(satirlar, bazSonu) {
  if (!bazSonu) return satirlar.length;
  return satirlar.reduce((a, satir, i) => (satir.yil && satir.yil <= bazSonu ? i + 1 : a), 0);
}

/** Bir seriyi kendi doğrusal eğilimiyle ileri taşır. */
function trendUzat(seri, bazAdet, ufuk) {
  const model = regresyon(seri.slice(0, bazAdet).map((_, i) => [i]), seri.slice(0, bazAdet));
  if (!model) return null;
  const f = (i) => model.sabit + model.katsayilar[0] * i;
  return {
    model,
    uydurma: seri.map((_, i) => f(i)),
    ileri: Array.from({ length: ufuk }, (_, i) => f(seri.length + i)),
  };
}

/**
 * Öngörüyü hesaplar.
 *
 * @param {object} ayar
 * @param {{no:number,yil:number,ay:any,etiket:string}[]} ayar.satirlar  Dönem satırları
 * @param {string} ayar.hedef      Öngörüsü yapılacak değişken
 * @param {string} ayar.tur        "trend" | "surucu"
 * @param {string[]} ayar.surucular Sürücü değişkenler ("surucu" türünde)
 * @param {number|null} ayar.bazSonu Modelin kurulacağı son yıl
 * @param {number} ayar.ufuk       Kaç dönem ileri
 * @param {number} ayar.carpan     Sürücülere uygulanacak varsayım çarpanı (1 = değişmez)
 * @returns {object|null} Hesaplanamıyorsa { hata } taşıyan nesne.
 */
function ongoruKur({ satirlar, hedef, tur = "trend", surucular = [],
                            bazSonu = null, ufuk = 12, carpan = 1 }) {
  if (!hedef) return { hata: "Öngörüsü yapılacak değişkeni seçin." };
  if (!satirlar?.length) return { hata: "Dönem verisi yok." };

  const seri = degiskenSerisi(hedef, satirlar);
  const bazAdet = bazDonemSayisi(satirlar, bazSonu);
  if (bazSonu && bazAdet === 0) {
    return { hata: `${bazSonu} ve öncesinde dönem yok. Baz sonunu ileri alın.` };
  }
  if (seri.slice(0, bazAdet).filter((v) => v !== null).length < 3) {
    return { hata: "Model için en az üç dolu dönem gerekir; baz sonunu ileri alın." };
  }

  const gelecek = gelecekDonemleri(satirlar[satirlar.length - 1], ufuk);
  // Kısa bir bazdan uzağa uzatmak, R² yüksek çıksa bile saçma sonuç verir:
  // doğru uyarı burada, modelin açıklama gücünden ayrı durmalı.
  const doluBaz = seri.slice(0, bazAdet).filter((v) => v !== null).length;
  const uyari = doluBaz < ufuk
    ? `Model ${doluBaz} dönemle kuruldu ama ${ufuk} dönem ileri gidiliyor; bu kadar uzağa uzatma güvenilir değil.`
    : null;
  const ortak = { seri, bazAdet, doluBaz, gelecek, ufuk, bazSonu, hedef, tur, uyari };

  if (tur !== "surucu") {
    const t = trendUzat(seri, bazAdet, ufuk);
    if (!t) return { hata: "Öngörü için yeterli dolu dönem yok." };
    return {
      ...ortak,
      model: t.model, uydurma: t.uydurma, tahmin: t.ileri,
      r2: t.model.r2, hata: null, standartHata: t.model.standartHata ?? null,
      surucuTahminleri: [],
    };
  }

  const kullanilan = surucular.filter(Boolean);
  if (!kullanilan.length) return { hata: "En az bir sürücü değişken seçin." };

  const surucuSerileri = kullanilan.map((k) => degiskenSerisi(k, satirlar));
  const X = satirlar.map((_, i) => surucuSerileri.map((s) => s[i]));
  const model = regresyon(X.slice(0, bazAdet), seri.slice(0, bazAdet));
  if (!model) return { hata: "Sürücülerle model kurulamadı; daha uzun bir baz dönemi ya da daha az sürücü seçin." };

  // Sürücüler gelecekte bilinmediği için her biri kendi eğilimiyle taşınır,
  // sonra kullanıcının varsayım çarpanı uygulanır.
  const ileriSurucu = surucuSerileri.map((s) => trendUzat(s, bazAdet, ufuk));
  if (ileriSurucu.some((x) => !x)) {
    return { hata: "Sürücü değişkenlerden biri ileri taşınamadı; dolu dönem sayısı yetersiz." };
  }

  const uygula = (degerler) =>
    model.katsayilar.reduce((a, k, j) => a + k * degerler[j], model.sabit);

  const uydurma = satirlar.map((_, i) => {
    const d = surucuSerileri.map((s) => s[i]);
    return d.every((v) => v !== null) ? uygula(d) : null;
  });
  const tahmin = Array.from({ length: ufuk }, (_, i) =>
    uygula(ileriSurucu.map((x) => x.ileri[i] * carpan)));

  return {
    ...ortak,
    model, uydurma, tahmin,
    r2: model.r2, hata: null, standartHata: model.standartHata ?? null,
    carpan,
    surucuTahminleri: kullanilan.map((k, j) => ({
      anahtar: k,
      ad: degiskenAdi(k),
      katsayi: model.katsayilar[j],
      tDegeri: model.tDegerleri?.[j] ?? null,
      ileri: ileriSurucu[j].ileri.map((v) => v * carpan),
    })),
  };
}

/**
 * Baz sonundan sonraki dolu dönemlerde öngörü ile gerçekleşeni karşılaştırır.
 * Baz sonu seçilmemişse karşılaştırılacak bağımsız dönem yoktur.
 */
function ongoruSapmalari(o, satirlar) {
  if (!o || o.hata || !o.bazSonu) return [];
  const cikti = [];
  for (let i = o.bazAdet; i < o.seri.length; i++) {
    const beklenen = o.uydurma[i];
    if (o.seri[i] === null || beklenen === null || beklenen === undefined) continue;
    cikti.push({
      etiket: satirlar[i].etiket,
      gercek: o.seri[i],
      beklenen,
      sapma: o.seri[i] - beklenen,
    });
  }
  return cikti;
}

/** Öngörülen dönemleri yıl yıl toplar — "gelecek yılın toplamı" için. */
function ongoruYilToplamlari(o) {
  if (!o || o.hata) return [];
  const toplam = new Map();
  o.gelecek.forEach((g, i) => {
    const v = o.tahmin[i];
    if (!Number.isFinite(v)) return;
    const kayit = toplam.get(g.yil) ?? { yil: g.yil, toplam: 0, donem: 0 };
    kayit.toplam += v;
    kayit.donem += 1;
    toplam.set(g.yil, kayit);
  });
  return [...toplam.values()].sort((a, b) => a.yil - b.yil);
}
