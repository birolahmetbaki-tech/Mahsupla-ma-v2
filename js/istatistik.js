// İstatistik çekirdeği: özet istatistikler ve çok değişkenli en küçük
// kareler (OLS) regresyonu. Öngörü motoru kullanır.

const sayisal = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function ortalama(dizi) {
  const s = dizi.filter((v) => v !== null);
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
}

function standartSapma(dizi, orneklem = true) {
  const s = dizi.filter((v) => v !== null);
  if (s.length < (orneklem ? 2 : 1)) return null;
  const ort = ortalama(s);
  const kareler = s.reduce((a, v) => a + (v - ort) ** 2, 0);
  return Math.sqrt(kareler / (s.length - (orneklem ? 1 : 0)));
}

function medyan(dizi) {
  const s = dizi.filter((v) => v !== null).slice().sort((a, b) => a - b);
  if (!s.length) return null;
  const o = Math.floor(s.length / 2);
  return s.length % 2 ? s[o] : (s[o - 1] + s[o]) / 2;
}

/** Pearson korelasyon katsayısı. */
function korelasyon(x, y) {
  const ciftler = x.map((v, i) => [v, y[i]]).filter(([a, b]) => a !== null && b !== null);
  if (ciftler.length < 3) return null;
  const xs = ciftler.map((c) => c[0]);
  const ys = ciftler.map((c) => c[1]);
  const ox = ortalama(xs);
  const oy = ortalama(ys);
  let pay = 0, kx = 0, ky = 0;
  for (let i = 0; i < ciftler.length; i++) {
    const dx = xs[i] - ox;
    const dy = ys[i] - oy;
    pay += dx * dy;
    kx += dx * dx;
    ky += dy * dy;
  }
  const payda = Math.sqrt(kx * ky);
  return payda ? pay / payda : null;
}

/** Gauss eliminasyonu ile doğrusal denklem sistemi çözümü. */
function cozumle(A, b) {
  const n = b.length;
  const M = A.map((satir, i) => [...satir, b[i]]);
  for (let s = 0; s < n; s++) {
    let enBuyuk = s;
    for (let i = s + 1; i < n; i++) if (Math.abs(M[i][s]) > Math.abs(M[enBuyuk][s])) enBuyuk = i;
    if (Math.abs(M[enBuyuk][s]) < 1e-12) return null;   // tekil matris
    [M[s], M[enBuyuk]] = [M[enBuyuk], M[s]];
    for (let i = s + 1; i < n; i++) {
      const oran = M[i][s] / M[s][s];
      for (let j = s; j <= n; j++) M[i][j] -= oran * M[s][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let toplam = M[i][n];
    for (let j = i + 1; j < n; j++) toplam -= M[i][j] * x[j];
    x[i] = toplam / M[i][i];
  }
  return x;
}

/**
 * Çok değişkenli doğrusal regresyon (sabit terimli).
 * @param {number[][]} X  her satır bir gözlemin bağımsız değişkenleri
 * @param {number[]} y    bağımlı değişken
 * @returns {{katsayilar, sabit, r2, duzeltilmisR2, standartHata, n, tahmin, artiklar}|null}
 */
function regresyon(X, y) {
  const gecerli = y.map((v, i) => i).filter((i) =>
    y[i] !== null && X[i].every((v) => v !== null));
  if (gecerli.length < X[0].length + 2) return null;

  const Xg = gecerli.map((i) => [1, ...X[i]]);
  const yg = gecerli.map((i) => y[i]);
  const p = Xg[0].length;
  const n = Xg.length;

  // Normal denklemler: (X'X) b = X'y
  const XtX = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) => Xg.reduce((a, satir) => a + satir[i] * satir[j], 0)));
  const Xty = Array.from({ length: p }, (_, i) =>
    Xg.reduce((a, satir, k) => a + satir[i] * yg[k], 0));

  const b = cozumle(XtX, Xty);
  if (!b) return null;

  const tahminler = Xg.map((satir) => satir.reduce((a, v, i) => a + v * b[i], 0));
  const oy = ortalama(yg);
  const sst = yg.reduce((a, v) => a + (v - oy) ** 2, 0);
  const sse = yg.reduce((a, v, i) => a + (v - tahminler[i]) ** 2, 0);
  const r2 = sst ? 1 - sse / sst : null;
  const serbestlik = n - p;

  // Tahminleri ve artıkları özgün satır sırasına yerleştir
  const tahmin = y.map(() => null);
  const artiklar = y.map(() => null);
  gecerli.forEach((satirIndex, k) => {
    tahmin[satirIndex] = tahminler[k];
    artiklar[satirIndex] = yg[k] - tahminler[k];
  });

  /*
   * Katsayı standart hataları ve t değerleri. Çok değişkenli bir modelde
   * R² tek başına yanıltır: hangi değişkenin gerçekten katkı verdiğini
   * ancak katsayının kendi belirsizliğiyle karşılaştırarak görebiliriz.
   * |t| ~ 2 ve üstü, katsayının sıfırdan ayırt edilebildiğini gösterir.
   */
  const artikVaryans = serbestlik > 0 ? sse / serbestlik : null;
  const ters = artikVaryans === null ? null : tersMatris(XtX);
  const katsayiHatalari = ters
    ? ters.map((satir, i) => Math.sqrt(Math.max(0, artikVaryans * satir[i])))
    : null;

  return {
    sabit: b[0],
    katsayilar: b.slice(1),
    sabitHatasi: katsayiHatalari?.[0] ?? null,
    katsayiHatalari: katsayiHatalari?.slice(1) ?? null,
    tDegerleri: katsayiHatalari
      ? b.slice(1).map((k, i) => (katsayiHatalari[i + 1] ? k / katsayiHatalari[i + 1] : null))
      : null,
    r2,
    duzeltilmisR2: serbestlik > 0 && sst ? 1 - ((1 - r2) * (n - 1)) / serbestlik : null,
    standartHata: serbestlik > 0 ? Math.sqrt(sse / serbestlik) : null,
    n,
    serbestlik,
    tahmin,
    artiklar,
  };
}

/**
 * Kare matrisin tersi (Gauss-Jordan). Çoklu regresyonda katsayı standart
 * hataları (X'X)⁻¹ köşegeninden gelir; tekil matriste null döner.
 */
function tersMatris(A) {
  const n = A.length;
  const M = A.map((satir, i) => [...satir, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let s = 0; s < n; s++) {
    let enBuyuk = s;
    for (let i = s + 1; i < n; i++) if (Math.abs(M[i][s]) > Math.abs(M[enBuyuk][s])) enBuyuk = i;
    if (Math.abs(M[enBuyuk][s]) < 1e-12) return null;
    [M[s], M[enBuyuk]] = [M[enBuyuk], M[s]];
    const pivot = M[s][s];
    for (let j = 0; j < 2 * n; j++) M[s][j] /= pivot;
    for (let i = 0; i < n; i++) {
      if (i === s) continue;
      const oran = M[i][s];
      if (!oran) continue;
      for (let j = 0; j < 2 * n; j++) M[i][j] -= oran * M[s][j];
    }
  }
  return M.map((satir) => satir.slice(n));
}

/** Bir regresyon modelinden tek bir tahmin. */
function modelTahmini(model, degerler) {
  if (!model || degerler.some((v) => v === null || v === undefined)) return null;
  return model.katsayilar.reduce((a, k, i) => a + k * degerler[i], model.sabit);
}

/** Zaman serisine doğrusal eğilim: y = a + b·t */
function egilim(seri) {
  const X = seri.map((_, i) => [i]);
  return regresyon(X, seri);
}

/** Kümülatif toplam (CUSUM). */
function kumulatif(seri) {
  let toplam = 0;
  return seri.map((v) => (v === null ? null : (toplam += v)));
}
