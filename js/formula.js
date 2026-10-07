// Excel benzeri formül motoru.
//
// Referanslar:
//   G            -> aynı satırdaki G hücresi (sütun formüllerinde kullanılır)
//   G3           -> 3. satırdaki G hücresi
//   H:J          -> aynı satırda H'den J'ye sütunlar
//   C1:C12       -> C sütununun 1-12. satırları (dikdörtgen aralık)
//   Fiyatlar!C   -> "Fiyatlar" sayfasının C sütunu, aynı dönemin (YIL/AY) satırı
//   Fiyatlar!C5  -> "Fiyatlar" sayfasının C5 hücresi
//   'GES 1'!D    -> boşluk ya da noktalama içeren sayfa adı tırnakla yazılır
//
// Fonksiyonlar Türkçe ya da İngilizce adlarıyla yazılabilir:
//   TOPLA/SUM, ORTALAMA/AVERAGE, MİN/MIN, MAK/MAX, BAĞ_DEĞ_SAY/COUNT,
//   MUTLAK/ABS, YUVARLA/ROUND, EĞER/IF, VE/AND, YADA/OR, DEĞİL/NOT,
//   EĞERHATA/IFERROR
// İşleçler: + - * / ^ % & = <> < > <= >=
//
// Ondalık ayracı: iki rakam arasındaki virgül ondalık noktasıdır
// (11,8 = 11.8). Fonksiyon argümanlarını ayırmak için noktalı virgül
// kullanılır — Türkçe Excel'deki gibi: YUVARLA(G;2). Rakam arasında
// olmayan virgül de ayraç sayılır, böylece ROUND(G,2) da çalışır.

const sayilar = (a) => a.filter((v) => typeof v === "number" && Number.isFinite(v));

const FONKSIYONLAR = {
  SUM: (...a) => sayilar(a).reduce((x, y) => x + y, 0),
  AVERAGE: (...a) => {
    const s = sayilar(a);
    return s.length ? s.reduce((x, y) => x + y, 0) / s.length : 0;
  },
  MIN: (...a) => {
    const s = sayilar(a);
    return s.length ? Math.min(...s) : 0;
  },
  MAX: (...a) => {
    const s = sayilar(a);
    return s.length ? Math.max(...s) : 0;
  },
  COUNT: (...a) => sayilar(a).filter((v) => v !== 0).length,
  ABS: (a) => Math.abs(a),
  ROUND: (a, b = 0) => {
    const k = 10 ** b;
    return Math.round(a * k) / k;
  },
  IF: (kosul, evet = true, hayir = false) => (dogruMu(kosul) ? evet : hayir),
  AND: (...a) => a.every(dogruMu),
  OR: (...a) => a.some(dogruMu),
  NOT: (a) => !dogruMu(a),
  // Argümanlar tembel verilir: hata ilk argümanda kalsın, ikincisi yalnızca gerekirse çalışsın
  IFERROR: (deger, yedek) => {
    try {
      const v = deger();
      if (typeof v === "number" && !Number.isFinite(v)) return yedek();
      return v;
    } catch {
      return yedek();
    }
  },
};

/** Türkçe adlar → motorun iç adları. */
const FONKSIYON_ESLERI = {
  TOPLA: "SUM", ORTALAMA: "AVERAGE", "MİN": "MIN", MAK: "MAX", "BAĞ_DEĞ_SAY": "COUNT",
  MUTLAK: "ABS", YUVARLA: "ROUND", "EĞER": "IF", VE: "AND", YADA: "OR", "DEĞİL": "NOT",
  "EĞERHATA": "IFERROR",
};

const TEMBEL_FONKSIYONLAR = new Set(["IFERROR"]);

function dogruMu(v) {
  if (typeof v === "string") return v.trim() !== "" && v.trim().toLocaleUpperCase("tr") !== "YANLIŞ";
  return !!v;
}

/** Karşılaştırma ve birleştirme yardımcıları — derlenen koda f._esit gibi verilir. */
FONKSIYONLAR._esit = (a, b) => (typeof a === "string" || typeof b === "string")
  ? String(a ?? "").toLocaleUpperCase("tr") === String(b ?? "").toLocaleUpperCase("tr")
  : a === b;
FONKSIYONLAR._birlestir = (a, b) => String(a ?? "") + String(b ?? "");

function kolonNo(harf) {
  let no = 0;
  for (const ch of harf) no = no * 26 + (ch.charCodeAt(0) - 64);
  return no;
}

function kolonHarfi(no) {
  let s = "";
  while (no > 0) {
    const kalan = (no - 1) % 26;
    s = String.fromCharCode(65 + kalan) + s;
    no = Math.floor((no - 1) / 26);
  }
  return s;
}

/* ================= Sözcük çözümleme ================= */

const AD_KARAKTERI = /[A-Za-z0-9_.ÇĞİÖŞÜçğıöşü$]/;
const REF_KALIBI = /^\$?([A-Za-z]{1,3})\$?(\d+)?$/;

/** İfadeyi sözcüklere ayırır; geçersiz bir karakterde hata fırlatır. */
function sozcukle(metin) {
  const t = [];
  let i = 0;
  while (i < metin.length) {
    const ch = metin[i];
    if (/\s/.test(ch)) { i++; continue; }

    // Sayı: 12, 11,8 (rakam arasında virgül ondalıktır), 11.8, 1e3
    if (/\d/.test(ch) || (ch === "." && /\d/.test(metin[i + 1] ?? ""))) {
      let j = i;
      let s = "";
      while (j < metin.length) {
        const c = metin[j];
        if (/\d/.test(c)) { s += c; j++; continue; }
        if ((c === "." || c === ",") && /\d/.test(metin[j + 1] ?? "") && !s.includes(".")) {
          s += "."; j++; continue;
        }
        break;
      }
      if (/[eE]/.test(metin[j] ?? "") && /[\d+-]/.test(metin[j + 1] ?? "")) {
        const m = metin.slice(j).match(/^[eE][+-]?\d+/);
        if (m) { s += m[0]; j += m[0].length; }
      }
      // "5G" gibi sayı ile adın bitişik yazımı geçersiz
      if (/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(metin[j] ?? "")) throw new Error("sayı");
      t.push({ tur: "sayi", deger: Number(s) });
      i = j;
      continue;
    }

    if (ch === '"') {
      let j = i + 1;
      let s = "";
      for (;;) {
        if (j >= metin.length) throw new Error("tırnak");
        if (metin[j] === '"') {
          if (metin[j + 1] === '"') { s += '"'; j += 2; continue; }
          break;
        }
        s += metin[j++];
      }
      t.push({ tur: "metin", deger: s });
      i = j + 1;
      continue;
    }

    // Tırnaklı sayfa adı: 'GES 1'!C
    if (ch === "'") {
      const kapanis = metin.indexOf("'", i + 1);
      if (kapanis < 0 || metin[kapanis + 1] !== "!") throw new Error("sayfa");
      t.push({ tur: "sayfa", deger: metin.slice(i + 1, kapanis) });
      i = kapanis + 2;
      continue;
    }

    if (AD_KARAKTERI.test(ch)) {
      let j = i;
      while (j < metin.length && AD_KARAKTERI.test(metin[j])) j++;
      const ad = metin.slice(i, j);
      if (metin[j] === "!") {
        t.push({ tur: "sayfa", deger: ad });
        i = j + 1;
        continue;
      }
      let k = j;
      while (/\s/.test(metin[k] ?? "")) k++;
      if (metin[k] === "(") {
        t.push({ tur: "fonk", deger: ad.toLocaleUpperCase("tr") });
      } else {
        t.push({ tur: "ad", deger: ad });
      }
      i = j;
      continue;
    }

    const iki = metin.slice(i, i + 2);
    if (iki === "<>" || iki === "<=" || iki === ">=") {
      t.push({ tur: "islec", deger: iki });
      i += 2;
      continue;
    }
    if ("+-*/^%&=<>():;,".includes(ch)) {
      t.push({ tur: "islec", deger: ch });
      i++;
      continue;
    }
    throw new Error("karakter");
  }
  return t;
}

/* ================= Ayrıştırma ve JS üretimi ================= */

/**
 * İfadeyi çalıştırılabilir JS metnine çevirir.
 * Dönen: { js, referanslar: [{ kolon, satir|null, sayfa|null }] }
 */
function hazirla(ifade) {
  const metin = String(ifade ?? "").trim().replace(/^=/, "").trim();
  if (!metin) return null;

  let t;
  try { t = sozcukle(metin); } catch { return null; }

  let i = 0;
  const referanslar = [];
  const bak = () => t[i];
  const islecMi = (d) => t[i]?.tur === "islec" && t[i].deger === d;
  const al = () => t[i++];
  const bekle = (d) => {
    if (!islecMi(d)) throw new Error(`"${d}" bekleniyor`);
    i++;
  };

  const refKodu = (r) => {
    referanslar.push(r);
    return `d(${JSON.stringify(r.kolon)},${r.satir ?? "null"},${r.sayfa === null ? "null" : JSON.stringify(r.sayfa)})`;
  };

  /** Bir referans okur: [sayfa!]KOLON[SATIR]. */
  function refOku() {
    let sayfa = null;
    if (bak()?.tur === "sayfa") sayfa = al().deger;
    const s = al();
    if (s?.tur !== "ad") throw new Error("referans");
    const m = s.deger.match(REF_KALIBI);
    if (!m) throw new Error("referans");
    return { kolon: m[1].toUpperCase(), satir: m[2] ? Number(m[2]) : null, sayfa };
  }

  /** Aralığı tek tek referanslara açar. */
  function araligiAc(a, b) {
    if (b.sayfa !== null && b.sayfa !== a.sayfa) throw new Error("aralık");
    const kBas = Math.min(kolonNo(a.kolon), kolonNo(b.kolon));
    const kSon = Math.max(kolonNo(a.kolon), kolonNo(b.kolon));
    if ((a.satir === null) !== (b.satir === null)) throw new Error("yarım aralık");
    if (kSon - kBas > 500) throw new Error("aralık büyük");
    const cikti = [];
    if (a.satir === null) {
      for (let k = kBas; k <= kSon; k++) cikti.push({ kolon: kolonHarfi(k), satir: null, sayfa: a.sayfa });
      return cikti;
    }
    const sBas = Math.min(a.satir, b.satir);
    const sSon = Math.max(a.satir, b.satir);
    if (sSon - sBas > 5000) throw new Error("aralık büyük");
    for (let k = kBas; k <= kSon; k++) {
      for (let s = sBas; s <= sSon; s++) cikti.push({ kolon: kolonHarfi(k), satir: s, sayfa: a.sayfa });
    }
    return cikti;
  }

  function birincil(aralikSerbest) {
    const s = bak();
    if (!s) throw new Error("eksik");
    if (s.tur === "sayi") { i++; return String(s.deger); }
    if (s.tur === "metin") { i++; return JSON.stringify(s.deger); }
    if (s.tur === "fonk") {
      i++;
      const ad = FONKSIYON_ESLERI[s.deger] ?? s.deger;
      if (!FONKSIYONLAR[ad] || ad.startsWith("_")) throw new Error("fonksiyon");
      bekle("(");
      const argumanlar = [];
      if (!islecMi(")")) {
        for (;;) {
          argumanlar.push(ifadeOku(true));
          if (islecMi(";") || islecMi(",")) { i++; continue; }
          break;
        }
      }
      bekle(")");
      const liste = TEMBEL_FONKSIYONLAR.has(ad)
        ? argumanlar.map((a) => `()=>(${a})`)
        : argumanlar;
      return `f.${ad}(${liste.join(",")})`;
    }
    if (s.tur === "ad" && /^(TRUE|FALSE|DOĞRU|YANLIŞ)$/i.test(s.deger.toLocaleUpperCase("tr"))) {
      i++;
      return /^(TRUE|DOĞRU)$/.test(s.deger.toLocaleUpperCase("tr")) ? "true" : "false";
    }
    if (s.tur === "ad" || s.tur === "sayfa") {
      const a = refOku();
      if (islecMi(":")) {
        i++;
        const b = refOku();
        if (b.sayfa === null) b.sayfa = a.sayfa;
        const acik = araligiAc(a, b);
        if (!aralikSerbest) throw new Error("aralık yalnızca fonksiyon içinde");
        // Aralık bir işlemin parçası olamaz: TOPLA(C1:C3*2) geçersiz
        const sonraki = bak();
        if (sonraki && !(sonraki.tur === "islec" && [";", ",", ")"].includes(sonraki.deger))) {
          throw new Error("aralık işlemde");
        }
        return acik.map(refKodu).join(",");
      }
      return refKodu(a);
    }
    if (islecMi("(")) {
      i++;
      const ic = ifadeOku(false);
      bekle(")");
      return `(${ic})`;
    }
    throw new Error("beklenmeyen");
  }

  function sonek(aralikSerbest) {
    let x = birincil(aralikSerbest);
    while (islecMi("%")) { i++; x = `((${x})/100)`; }
    return x;
  }

  function tekli(aralikSerbest) {
    if (islecMi("-")) { i++; return `(-(${tekli(false)}))`; }
    if (islecMi("+")) { i++; return `(+(${tekli(false)}))`; }
    return sonek(aralikSerbest);
  }

  function us(aralikSerbest) {
    let x = tekli(aralikSerbest);
    while (islecMi("^")) { i++; x = `((${x})**(${tekli(false)}))`; }
    return x;
  }

  function carpim(aralikSerbest) {
    let x = us(aralikSerbest);
    while (islecMi("*") || islecMi("/")) {
      const op = al().deger;
      x = `((${x})${op}(${us(false)}))`;
    }
    return x;
  }

  function toplam(aralikSerbest) {
    let x = carpim(aralikSerbest);
    while (islecMi("+") || islecMi("-")) {
      const op = al().deger;
      x = `((${x})${op}(${carpim(false)}))`;
    }
    return x;
  }

  function birlestirme(aralikSerbest) {
    let x = toplam(aralikSerbest);
    while (islecMi("&")) { i++; x = `f._birlestir(${x},${toplam(false)})`; }
    return x;
  }

  function karsilastirma(aralikSerbest) {
    let x = birlestirme(aralikSerbest);
    while (["=", "<>", "<", ">", "<=", ">="].some(islecMi)) {
      const op = al().deger;
      const y = birlestirme(false);
      if (op === "=") x = `f._esit(${x},${y})`;
      else if (op === "<>") x = `(!f._esit(${x},${y}))`;
      else x = `((${x})${op}(${y}))`;
    }
    return x;
  }

  // Fonksiyon argümanında tek başına bir aralık (C1:C12) yazılabilir
  function ifadeOku(aralikSerbest) { return karsilastirma(aralikSerbest); }

  let js;
  try {
    js = ifadeOku(false);
    if (i < t.length) throw new Error("fazla");
  } catch {
    return null;
  }
  return { js, referanslar };
}

/** Formülün başvurduğu hücreler: [{ kolon, satir|null, sayfa|null }] */
function referanslar(ifade) {
  return hazirla(ifade)?.referanslar ?? [];
}

const onbellek = new Map();

/**
 * Formülü çalıştırılabilir hale getirir.
 * Dönen: { fn(d, f), referanslar } veya geçersizse null.
 * d(kolon, satir|null, sayfa|null) hücrenin değerini verir.
 */
function derle(ifade) {
  const anahtar = String(ifade || "");
  if (onbellek.has(anahtar)) return onbellek.get(anahtar);

  let sonuc = null;
  const hazir = hazirla(anahtar);
  if (hazir) {
    try {
      const fn = new Function("d", "f", `"use strict"; return (${hazir.js});`);
      fn(() => 0, FONKSIYONLAR); // deneme çalıştırması
      sonuc = { fn, referanslar: hazir.referanslar };
    } catch {
      sonuc = null;
    }
  }
  onbellek.set(anahtar, sonuc);
  return sonuc;
}

function formulGecerliMi(ifade) {
  return derle(ifade) !== null;
}

/** Metin bir formül mü? ("=" ile başlıyorsa) */
function formulMu(v) {
  return typeof v === "string" && v.trim().startsWith("=");
}

/** Sayfa adının formülde nasıl yazılacağı: gerekiyorsa tırnaklı. */
function sayfaAdiFormulde(ad) {
  return /^[A-Za-z0-9_ÇĞİÖŞÜçğıöşü]+$/.test(ad) && !REF_KALIBI.test(ad) ? ad : `'${ad.replace(/'/g, "")}'`;
}

if (typeof module !== "undefined") {
  module.exports = { derle, referanslar, formulGecerliMi, formulMu, kolonNo, kolonHarfi,
                     FONKSIYONLAR, sayfaAdiFormulde };
}
