// Analiz robotu: kenar çubuğundaki logodan açılan sohbet penceresi.
//
// Bu robot bir dil modeli DEĞİLDİR; çevrimdışı çalışan, kural tabanlı bir
// yardımcıdır. Yazdığınız komutu anahtar kelimelerinden tanır, programın
// kendi mahsuplaşma hesaplarını gerçek veriniz üzerinde çalıştırır ve sonucu
// Türkçe yorumlar. Uydurma yapmaz: veri yetersizse bunu söyler.

const ROBOT_DEPO = "mahsupla-robot";
const ROBOT_EN_COK_MESAJ = 40;

/**
 * Türkçe metni karşılaştırılabilir hâle getirir: küçük harf, şapkasız.
 * Kullanıcı "İhtiyaç", "ihtiyac" ya da "IHTIYAC" yazsın, hepsi aynı anahtara düşsün.
 */
function rbSade(s) {
  return String(s ?? "")
    .toLocaleLowerCase("tr")
    .replaceAll("ı", "i").replaceAll("ş", "s").replaceAll("ğ", "g")
    .replaceAll("ü", "u").replaceAll("ö", "o").replaceAll("ç", "c")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const rbYuzde = (v, basamak = 1) =>
  v === null || !Number.isFinite(v) ? "—" : `%${v.toFixed(basamak).replace(".", ",")}`;
const rbSayi = (v) => (v === null || !Number.isFinite(v) ? "—" : kisaSayi(v));
const rbKwh = (v) => (v === null || !Number.isFinite(v) ? "—" : `${kisaSayi(Math.round(v))} kWh`);
const rbTL = (v) => (v === null || !Number.isFinite(v) ? "—" : `${kisaSayi(Math.round(v))} TL`);

/* ================= Veri yardımcıları ================= */

function rbDonemler() { return mahsupSonucu().donemler; }

/** Toplam üretimi ya da tüketimi girilmiş son dönem. */
function rbSonDolu() {
  const d = rbDonemler();
  const u = gostergeSerisi("toplam", "uretim");
  const t = gostergeSerisi("toplam", "tuketim");
  for (let i = d.length - 1; i >= 0; i--) if (u[i] || t[i]) return d[i];
  return null;
}

/** Son dolu dönemle biten en çok n dönemin numaraları. */
function rbSonDonemler(n = 12) {
  const son = rbSonDolu();
  if (!son) return [];
  return rbDonemler().filter((d) => d.no <= son.no && d.no > son.no - n).map((d) => d.no);
}

function rbAralikMetni(nolar) {
  const d = rbDonemler();
  return nolar.length ? `${d[nolar[0] - 1].etiket} – ${d[nolar[nolar.length - 1] - 1].etiket}` : "—";
}

const rbDeger = (tesisId, gId, nolar) => aralikDegeri(tesisId, gId, nolar);

/** Soruda adı geçen tesis; yoksa toplam. */
function rbTesisBul(soru) {
  const s = rbSade(soru);
  const tesisler = hesapTesisleri().filter((t) => !t.toplam)
    .sort((a, b) => b.ad.length - a.ad.length);
  return tesisler.find((t) => s.includes(rbSade(t.ad))) ?? hesapTesisi("toplam");
}

const RB_GOSTERGE_KELIMELERI = [
  ["bedelsiz", "bedelsiz"], ["satilabilir", "satilabilir"], ["ihtiyac fazlasi gelir", "ifGeliri"],
  ["gelir", "ifGeliri"], ["kacinilan", "kacinilan"], ["fayda", "fayda"], ["fatura", "fatura"],
  ["net cekis", "netCekis"], ["ihtiyac fazlasi", "ihtiyacFazlasi"], ["oz tuketim", "ozTuketim"],
  ["mahsup", "mahsup"], ["uretim", "uretim"], ["tuketim", "tuketim"], ["limit", "limitKullanimi"],
  ["kapasite", "kapasiteFaktoru"],
];

function rbGostergeBul(soru, varsayilan = "mahsup") {
  const s = rbSade(soru);
  return RB_GOSTERGE_KELIMELERI.find(([k]) => s.includes(k))?.[1] ?? varsayilan;
}

function rbVeriYok() {
  return "Henüz hesaplanacak veri yok. Veri sayfasındaki tesis sekmesine aylık **tüketim** ve **üretim** değerlerini girin; " +
    "faturada saatlik mahsuplaşma sonucu varsa **mahsuplaşan enerji** sütununa yazın.";
}

/* ================= Beceriler ================= */

function rbOzet(soru) {
  const nolar = rbSonDonemler(12);
  if (!nolar.length) return rbVeriYok();
  const t = rbTesisBul(soru ?? "");
  const g = (id) => rbDeger(t.id, id, nolar);
  const satir = [
    `**${t.ad} · ${rbAralikMetni(nolar)}** (son ${nolar.length} dönem)`, "",
    `• Üretim: **${rbKwh(g("uretim"))}** · Tüketim: **${rbKwh(g("tuketim"))}**`,
    `• Mahsuplaşan: **${rbKwh(g("mahsup"))}** — öz tüketim ${rbYuzde(g("ozTuketim"))}, tüketimin ${rbYuzde(g("karsilama"))}'i karşılandı`,
    `• İhtiyaç fazlası: **${rbKwh(g("ihtiyacFazlasi"))}** (satılabilir ${rbKwh(g("satilabilir"))}, bedelsiz ${rbKwh(g("bedelsiz"))})`,
    `• Şebekeden net çekiş: ${rbKwh(g("netCekis"))}`,
    `• İhtiyaç fazlası geliri: **${rbTL(g("ifGeliri"))}** · Kaçınılan maliyet: **${rbTL(g("kacinilan"))}** · Toplam fayda: **${rbTL(g("fayda"))}**`,
  ];
  // Varsayımla hesaplanan dönemler
  const sonuc = mahsupSonucu();
  let varsayim = 0;
  for (const ts of sonuc.tesisler.values()) {
    if (t.id !== "toplam" && ts.sayfa.id !== t.id) continue;
    for (const no of nolar) {
      const d = ts.detaylar[no - 1];
      if (d && d.Mg === null && d.M !== null) varsayim++;
    }
  }
  if (varsayim) {
    satir.push("", `⚠ ${varsayim} tesis-dönemde mahsuplaşan enerji girilmemiş; aylık varsayım (min(üretim, tüketim)) kullanıldı. ` +
      "Saatlik mahsuplaşmada gerçek değer daha düşüktür.");
  }
  if (t.id === "toplam" && sonuc.tesisler.size > 1) {
    satir.push("", "**Tesislere göre:**");
    for (const ts of sonuc.tesisler.values()) {
      const id = ts.sayfa.id;
      satir.push(`• ${ts.sayfa.ad}: mahsup ${rbKwh(rbDeger(id, "mahsup", nolar))}, öz tüketim ${
        rbYuzde(rbDeger(id, "ozTuketim", nolar))}, fayda ${rbTL(rbDeger(id, "fayda", nolar))}`);
    }
  }
  return satir.join("\n");
}

function rbLimit() {
  const son = rbSonDolu();
  if (!son) return rbVeriYok();
  const sonuc = mahsupSonucu();
  const yilNolari = rbDonemler().filter((d) => d.yil === son.yil && d.no <= son.no).map((d) => d.no);
  const satir = [`**${son.yil} yılı 2× limit durumu** (${son.etiket} itibarıyla)`, ""];
  for (const ts of sonuc.tesisler.values()) {
    const b = { ...TESIS_BILGI_VARSAYILAN, ...ts.sayfa.bilgi };
    if (!limitUygulanirMi(b)) { satir.push(`• **${ts.sayfa.ad}**: mesken — limit uygulanmaz.`); continue; }
    const limit = aralikDegeri(ts.sayfa.id, "yillikLimit", yilNolari);
    const kullanim = aralikDegeri(ts.sayfa.id, "limitKullanimi", yilNolari);
    const bedelsiz = aralikDegeri(ts.sayfa.id, "bedelsiz", yilNolari);
    if (!limit) {
      satir.push(`• **${ts.sayfa.ad}**: limit hesaplanamadı — ${son.yil - 1} yılının tüketimi yok. ` +
        "Tesis bilgilerine referans tüketim girin.");
      continue;
    }
    const ayAdedi = yilNolari.filter((no) => ts.detaylar[no - 1]?.kullanim !== null && ts.detaylar[no - 1]).length || 1;
    const tahmin = ((kullanim ?? 0) / ayAdedi) * 12;
    let yorum;
    if (bedelsiz > 0) yorum = `limit **aşıldı**; ${rbKwh(bedelsiz)} ihtiyaç fazlası bedelsiz katkı oldu`;
    else if (tahmin > limit) yorum = `bu hızla yıl sonunda limitin ${rbYuzde(tahmin / limit * 100, 0)}'ine ulaşılır — **aşım bekleniyor**`;
    else yorum = `bu hızla yıl sonunda ${rbYuzde(tahmin / limit * 100, 0)} — limit içinde kalınır`;
    satir.push(`• **${ts.sayfa.ad}**: ${rbKwh(kullanim)} / ${rbKwh(limit)} (${rbYuzde(kullanim / limit * 100)}) — ${yorum}`);
  }
  if (!sonuc.tesisler.size) return rbVeriYok();
  satir.push("", "Limit, mahsuplaşan enerji ile satılan ihtiyaç fazlasının yıllık toplamına uygulanır (önceki yıl tüketiminin 2 katı).");
  return satir.join("\n");
}

function rbSaatlik() {
  const sonuc = mahsupSonucu();
  if (!sonuc.tesisler.size) return rbVeriYok();
  const tum = sonuc.donemler.map((d) => d.no);
  const satir = ["**Saatlik mahsuplaşmanın etkisi**", ""];
  let herhangi = false;
  for (const ts of sonuc.tesisler.values()) {
    const fark = aralikDegeri(ts.sayfa.id, "saatlikFark", tum);
    // Fark yalnızca mahsuplaşan enerjisi girilen dönemlerde var; oran aynı dönemlerle kurulur
    const girilen = tum.filter((no) => gostergeDegeri(ts.sayfa.id, "saatlikFark", no) !== null);
    const mahsup = aralikDegeri(ts.sayfa.id, "mahsup", girilen);
    if (fark === null) {
      satir.push(`• ${ts.sayfa.ad}: mahsuplaşan enerji girilmemiş, fark hesaplanamıyor.`);
      continue;
    }
    herhangi = true;
    const fiyat = ts.detaylar.filter(Boolean).map((d) => d.aktifFiyat).filter((v) => v !== null);
    const ortFiyat = fiyat.length ? fiyat.reduce((a, v) => a + v, 0) / fiyat.length : null;
    satir.push(`• **${ts.sayfa.ad}**: aylık mahsuplaşma olsaydı ${rbKwh(fark)} daha fazla mahsuplaşırdı ` +
      `(${girilen.length} dönemde gerçekleşen ${rbKwh(mahsup)}, fark ${rbYuzde(mahsup ? fark / (mahsup + fark) * 100 : null)})` +
      (ortFiyat ? ` — kabaca ${rbTL(fark * ortFiyat)} kaçınılan maliyet kaybı` : ""));
  }
  if (herhangi) {
    satir.push("", "Saatlik sistemde bir saatteki fazla başka bir saatteki açığı kapatamaz; üretimi tüketim saatlerine " +
      "kaydırmak (depolama, yük kaydırma) bu farkı azaltır.");
  }
  return satir.join("\n");
}

function rbKarsilastir(soru) {
  const t = rbTesisBul(soru);
  const donemler = rbDonemler();
  let yillar = [...new Set((String(soru).match(/\b(19|20)\d{2}\b/g) ?? []).map(Number))];
  const doluYillar = [...new Set(donemler.filter((d) => gostergeDegeri(t.id, "uretim", d.no) || gostergeDegeri(t.id, "tuketim", d.no)).map((d) => d.yil))];
  if (yillar.length < 2) yillar = doluYillar.slice(-2);
  if (yillar.length < 2) return "Karşılaştırmak için en az iki yıl veri gerekiyor.";
  const [a, b] = yillar.slice(0, 2).sort();
  const nolar = (y) => donemler.filter((d) => d.yil === y).map((d) => d.no);
  const satir = [`**${t.ad} · ${a} ile ${b}**`, ""];
  for (const id of ["uretim", "tuketim", "mahsup", "ozTuketim", "ihtiyacFazlasi", "bedelsiz", "ifGeliri", "fayda"]) {
    const g = GOSTERGE[id];
    const x = rbDeger(t.id, id, nolar(a));
    const y = rbDeger(t.id, id, nolar(b));
    const degisim = x && y !== null ? ((y - x) / Math.abs(x)) * 100 : null;
    const bicim = (v) => (g.birim === "%" ? rbYuzde(v) : g.birim === "TL" ? rbTL(v) : rbKwh(v));
    satir.push(`• ${g.ad}: ${bicim(x)} → ${bicim(y)}${
      g.birim === "%" ? (x !== null && y !== null ? ` (${(y - x >= 0 ? "+" : "")}${(y - x).toFixed(1).replace(".", ",")} puan)` : "")
                      : degisim !== null ? ` (${degisim >= 0 ? "▲" : "▼"} ${rbYuzde(Math.abs(degisim))})` : ""}`);
  }
  const eksik = [a, b].filter((y) => nolar(y).filter((no) => gostergeDegeri(t.id, "uretim", no) !== null).length < 12);
  if (eksik.length) satir.push("", `⚠ ${eksik.join(", ")} tam yıl değil; karşılaştırma yanıltıcı olabilir.`);
  return satir.join("\n");
}

function rbOngoru(soru, ongoruMu) {
  const t = rbTesisBul(soru);
  const gId = rbGostergeBul(soru, "mahsup");
  const g = GOSTERGE[gId];
  const son = rbSonDolu();
  if (!son) return rbVeriYok();
  degiskenleriTazele();
  const anahtar = `g:${t.id}::${gId}`;
  const satirlar = rbDonemler().filter((d) => d.no <= son.no);

  if (!ongoruMu) {
    const son12 = satirlar.slice(-12).map((d) => d.no);
    const once12 = satirlar.slice(-24, -12).map((d) => d.no);
    const x = rbDeger(t.id, gId, once12);
    const y = rbDeger(t.id, gId, son12);
    if (x === null || y === null || !once12.length) return `${g.ad} için iki ayrı 12 aylık dönem karşılaştıracak kadar veri yok.`;
    const fark = g.birim === "%" ? y - x : ((y - x) / Math.abs(x || 1)) * 100;
    const yon = Math.abs(fark) < 1 ? "yatay seyrediyor" : fark > 0 ? "artıyor" : "azalıyor";
    return `**${t.ad} · ${g.ad} ${yon}.**\n\nSon 12 dönem (${rbAralikMetni(son12)}): ${rbSayi(y)} ${g.birim}\n` +
      `Önceki 12 dönem (${rbAralikMetni(once12)}): ${rbSayi(x)} ${g.birim}\n` +
      `Değişim: ${g.birim === "%" ? `${fark >= 0 ? "+" : ""}${fark.toFixed(1).replace(".", ",")} puan` : rbYuzde(fark)}`;
  }

  if (g.tur !== "toplam") return `Öngörü yalnızca toplanabilir göstergelerde (kWh, TL) yapılır; "${g.ad}" bir oran.`;
  // Ufuk gelecek yılın sonuna kadar: yıl toplamları tam çıksın
  const o = ongoruKur({ satirlar, hedef: anahtar, tur: "trend", ufuk: 24 - son.ayNo });
  if (!o || o.hata) return `Öngörü kurulamadı: ${o?.hata ?? "bilinmeyen sorun"}`;
  const yillar = ongoruYilToplamlari(o);
  const guc = o.r2 === null ? "hesaplanamadı" : o.r2 >= 0.7 ? "güçlü" : o.r2 >= 0.4 ? "orta" : "zayıf — referans sayın";
  return [`**${t.ad} · ${g.ad} öngörüsü** (doğrusal eğilim, ${o.doluBaz} dönemden)`, "",
    ...yillar.map((y) => `• ${y.yil}: ${rbSayi(Math.round(y.toplam))} ${g.birim}${
      y.donem < 12 ? ` (kalan ${y.donem} ay; gerçekleşen ${rbSayi(Math.round(rbDeger(t.id, gId,
        satirlar.filter((d) => d.yil === y.yil).map((d) => d.no)) ?? 0))} ${g.birim})` : ""}`),
    "", `Model gücü: R² ${o.r2 === null ? "—" : o.r2.toFixed(2)} (${guc}).`,
    "GES üretimi mevsimseldir; düz eğilim mevsim dalgasını yakalamaz, yıllık toplamlar daha anlamlıdır.",
    o.uyari ? `⚠ ${o.uyari}` : ""].filter((x) => x !== undefined).join("\n").trim();
}

function rbSirala(soru) {
  const nolar = rbSonDonemler(12);
  const tesisler = hesapTesisleri().filter((t) => !t.toplam);
  if (!nolar.length || !tesisler.length) return rbVeriYok();
  const gId = rbGostergeBul(soru, "ozTuketim");
  const g = GOSTERGE[gId];
  const sirali = tesisler.map((t) => ({ t, v: rbDeger(t.id, gId, nolar) }))
    .filter((x) => x.v !== null)
    .sort((a, b) => (g.yon === "dusuk" ? a.v - b.v : b.v - a.v));
  if (!sirali.length) return `${g.ad} için değer yok.`;
  return [`**Tesisler · ${g.ad}** (${rbAralikMetni(nolar)})`, "",
    ...sirali.map((x, i) => `${i + 1}. ${x.t.ad}: ${rbSayi(x.v)} ${g.birim}`)].join("\n");
}

function rbVeriKalitesi() {
  const liste = tutarliligiCalistir();
  if (!liste.length) return "Veri tutarlılık kontrolleri temiz — tutarsız değer bulunamadı.";
  const say = (s) => liste.filter((b) => b.seviye === s).length;
  const onemli = liste.filter((b) => b.seviye !== "bilgi").slice(0, 8);
  return [`**Veri kalitesi:** ${say("hata")} hata, ${say("uyari")} uyarı, ${say("bilgi")} bilgi.`, "",
    ...onemli.map((b) => `• ${b.seviye === "hata" ? "✖" : "⚠"} ${b.sayfaAd} · ${b.donem} · ${b.alan}: ${b.mesaj}`),
    liste.length > onemli.length ? "\nAyrıntılar **Veri Tutarlılık Kontrolü** sayfasında." : ""].join("\n");
}

function rbPanoBecerisi(soru) {
  const ham = String(soru);
  const sade = rbSade(soru);
  const not = ham.match(/[:：](.+)$/);
  if (/not/.test(sade) && not) {
    const r = panoPencereEkle({ tur: "metin", metin: not[1].trim(), baslik: "Not" });
    return r.hata ?? "Dashboard'a not penceresi eklendi.";
  }
  const t = rbTesisBul(soru);
  const gId = rbGostergeBul(soru, null);
  if (!gId) return "Hangi göstergeyi eklememi istersiniz? Örnek: *\"Dashboard'a öz tüketim kartı ekle\"* ya da *\"Dashboard'a not ekle: …\"*";
  const tur = /grafik|cizgi/.test(sade) ? "cizgi" : /gosterge|gauge/.test(sade) ? "gauge" : "kart";
  const r = panoPencereEkle({ tur, degiskenler: [`g:${t.id}::${gId}`], baslik: `${t.toplam ? "" : t.ad + " · "}${GOSTERGE[gId].ad}` });
  return r.hata ?? `Dashboard'a **${GOSTERGE[gId].ad}** için ${r.ad.toLocaleLowerCase("tr")} eklendi (${t.ad}).`;
}

const RB_SOZLUK = [
  [["mahsuplasma", "mahsup"], "**Mahsuplaşma**: Lisanssız üretimin ilişkili tüketimden düşülmesi. 1 Mayıs 2026'dan beri mesken dışı abonelerde **saatlik** yapılır: her saat min(üretim, tüketim) mahsuplaşır, bir saatin fazlası başka saatin açığını kapatamaz. Meskende aylıktır."],
  [["ihtiyac fazlasi"], "**İhtiyaç fazlası**: Mahsuplaşmadan sonra kalan, şebekeye verilmiş sayılan üretim. Görevli tedarik şirketi satın alır; ilk 10 yıl fiyatı abone grubunun tek zamanlı aktif enerji bedelidir."],
  [["bedelsiz"], "**YEKDEM'e bedelsiz katkı**: Yıllık limiti aşan ihtiyaç fazlası. Karşılığında ödeme yapılmaz, sistem kullanım bedeli de alınmaz."],
  [["limit", "2 kat", "iki kat"], "**2× limit**: Mesken dışı tesislerde, mahsuplaşan enerji + satılan ihtiyaç fazlası bir yılda ilişkili tüketimin önceki yılki toplamının 2 katını geçemez. Aşan kısım bedelsiz katkıdır."],
  [["yekdem"], "**YEKDEM**: Yenilenebilir Enerji Kaynakları Destekleme Mekanizması. İhtiyaç fazlası bedelleri bu havuzdan ödenir. 10 yılını dolduran tesislerde fiyat min(YEKDEM × %90, PTF) olur."],
  [["ptf"], "**PTF**: Gün öncesi piyasasının saatlik piyasa takas fiyatı (EPİAŞ). 10 yılını dolduran tesislerin ihtiyaç fazlası fiyatında üst sınırdır."],
  [["oz tuketim"], "**Öz tüketim oranı**: Üretimin ne kadarının tüketimle mahsuplaştığı (mahsuplaşan / üretim). Yüksek olması iyidir: mahsuplaşan enerji tüketicinin şebekeden almaktan kurtulduğu enerjidir."],
  [["kapasite faktoru"], "**Kapasite faktörü**: Üretim / (kurulu güç × saat). Türkiye'de GES için yıllık %15–20 civarıdır."],
];

function rbKilavuz(soru) {
  const s = rbSade(soru);
  const bulunan = RB_SOZLUK.filter(([k]) => k.some((x) => s.includes(x))).map(([, m]) => m);
  return bulunan.length ? bulunan.join("\n\n")
    : "Kavramlar: mahsuplaşma, ihtiyaç fazlası, bedelsiz katkı, 2× limit, YEKDEM, PTF, öz tüketim, kapasite faktörü. " +
      "Örnek: *\"bedelsiz katkı nedir\"*. Programın tamamı için **Ayarlar → Hakkında** sekmesindeki kılavuza bakın.";
}

/* ================= Komut eşleme ================= */

const ROBOT_BECERILERI = [
  { anahtar: "yardim", ad: "Yardım", kelimeler: ["yardim", "ne yapabilirsin", "komutlar", "neler yapabilirsin"],
    calistir: () => rbYardim() },
  { anahtar: "kilavuz", ad: "Kavram açıklama", kelimeler: ["nedir", "ne demek", "nasil hesaplanir", "acikla"],
    calistir: (soru) => rbKilavuz(soru) },
  { anahtar: "pano", ad: "Panoya pencere ekleme", kelimeler: ["dashboard", "pano", "panoya"],
    calistir: (soru) => rbPanoBecerisi(soru) },
  { anahtar: "limit", ad: "Yıllık limit durumu", kelimeler: ["limit", "2 kat", "iki kat", "asim", "bedelsiz"],
    calistir: () => rbLimit() },
  { anahtar: "saatlik", ad: "Saatlik mahsuplaşma etkisi", kelimeler: ["saatlik", "aylik olsaydi", "kayip"],
    calistir: () => rbSaatlik() },
  { anahtar: "karsilastir", ad: "Yıl karşılaştırma", kelimeler: ["karsilastir", "kiyasla", "ile karsi", "yil farki"],
    calistir: (soru) => rbKarsilastir(soru) },
  { anahtar: "ongoru", ad: "Öngörü", kelimeler: ["ongoru", "tahmin", "gelecek yil", "onumuzdeki"],
    calistir: (soru) => rbOngoru(soru, true) },
  { anahtar: "trend", ad: "Eğilim", kelimeler: ["trend", "egilim", "gidisat", "artiyor mu", "azaliyor mu"],
    calistir: (soru) => rbOngoru(soru, false) },
  { anahtar: "sirala", ad: "Tesis sıralama", kelimeler: ["sirala", "en iyi", "en kotu", "hangi tesis"],
    calistir: (soru) => rbSirala(soru) },
  { anahtar: "veri", ad: "Veri kalitesi", kelimeler: ["veri kalitesi", "tutarlilik", "eksik", "hatali", "kontrol"],
    calistir: () => rbVeriKalitesi() },
  { anahtar: "ozet", ad: "Durum özeti", kelimeler: ["ozet", "durum", "genel", "nasil gidiyor", "merhaba", "selam", "gelir", "fayda"],
    calistir: (soru) => rbOzet(soru) },
];

const ROBOT_ORNEKLER = [
  "Durum özeti",
  "Yıllık limit durumu",
  "Saatlik mahsuplaşma ne kadar kaybettirdi",
  "2025 ile 2026'yı karşılaştır",
  "Mahsuplaşan enerji öngörüsü",
  "Tesisleri öz tüketime göre sırala",
  "Veri kalitesi",
  "Dashboard'a öz tüketim kartı ekle",
  "Bedelsiz katkı nedir",
];

function rbYardim() {
  const ornek = {
    kilavuz: "ihtiyaç fazlası nedir", pano: "Dashboard'a not ekle: Fatura kontrol edilecek",
    limit: "yıllık limit durumu", saatlik: "saatlik mahsuplaşma ne kadar kaybettirdi",
    karsilastir: "2025 ile 2026'yı karşılaştır", ongoru: "üretim öngörüsü",
    trend: "tüketim artıyor mu", sirala: "tesisleri öz tüketime göre sırala",
    veri: "veri kalitesi", ozet: "Tesis 1 durum özeti",
  };
  return ["**Ben ne yapabilirim?**", "",
    "Bir dil modeli değilim; komutunuzu tanıyıp mahsuplaşma verinizi *gerçek hesaplarla* inceleyen bir yardımcıyım. Sonuçları uydurmam, veri yetmezse söylerim.", "",
    ...ROBOT_BECERILERI.filter((b) => b.anahtar !== "yardim").map((b) => `• **${b.ad}** — ör. "${ornek[b.anahtar]}"`),
    "", "Komutta bir tesis sekmesinin adını geçirirseniz yalnızca o tesise bakarım; geçmezse bütün tesislerin toplamına."].join("\n");
}

/** Soruyu bir beceriye eşler. Hiçbiri tutmazsa null. */
function rbBeceriSec(soru) {
  const s = rbSade(soru);
  let enIyi = null;
  for (const b of ROBOT_BECERILERI) {
    let puan = 0;
    for (const k of b.kelimeler) if (s.includes(k)) puan += k.length;
    if (!puan) continue;
    // "… nedir" soruları başka bir becerinin kelimesini içerse de açıklama ister
    if (b.anahtar === "kilavuz") puan += 50;
    if (!enIyi || puan > enIyi.puan) enIyi = { beceri: b, puan };
  }
  return enIyi?.beceri ?? null;
}

/** Dışarıdan da çağrılabilir: soruyu yanıtlar (metin döner). */
function robotaSor(soru) {
  const beceri = rbBeceriSec(soru);
  if (!beceri) {
    return `Bunu anlayamadım. Şunları sorabilirsiniz:\n\n${
      ROBOT_ORNEKLER.map((o) => `• ${o}`).join("\n")}\n\nTüm komutlar için **yardım** yazın.`;
  }
  try {
    return beceri.calistir(soru);
  } catch (e) {
    console.warn("Robot hatası:", e);
    return `**${beceri.ad}** çalışırken bir sorun çıktı: ${e.message}`;
  }
}

/* ================= Pencere ================= */

let robotGecmis = [];

function rbYukle() {
  try {
    const ham = localStorage.getItem(ROBOT_DEPO);
    if (!ham) return;
    const v = JSON.parse(ham);
    // Eski kayıtlar düz dizi, yenisi { mesajlar, buyuk } nesnesi
    if (Array.isArray(v)) robotGecmis = v.slice(-ROBOT_EN_COK_MESAJ);
    else {
      robotGecmis = (v.mesajlar ?? []).slice(-ROBOT_EN_COK_MESAJ);
      robotBuyukKip = !!v.buyuk;
    }
  } catch { /* depo kapalıysa boş başlar */ }
}

function rbKaydet() {
  try {
    localStorage.setItem(ROBOT_DEPO, JSON.stringify({
      mesajlar: robotGecmis.slice(-ROBOT_EN_COK_MESAJ), buyuk: robotBuyukKip,
    }));
  } catch { /* yok sayılır */ }
}

/**
 * Robotun metnini güvenle HTML'e çevirir: önce kaçışlanır, sonra yalnızca
 * **kalın** ve *eğik* işaretleri etikete dönüşür. Veri adları kullanıcıdan
 * geldiği için kaçışlama şart.
 */
function rbMetniBicimle(metin) {
  return kacisla(metin)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*]+)\*/g, "<i>$1</i>")
    .replace(/\n/g, "<br>");
}

function rbAkisiCiz() {
  const akis = document.getElementById("robotAkis");
  if (!akis) return;
  akis.innerHTML = robotGecmis.map((m, i) => {
    // Grafik robotun kendi çizim kodundan gelir; kullanıcı metni değildir.
    const grafik = m.kim === "robot" && m.grafik ? `<div class="robot-grafik">${m.grafik}</div>` : "";
    const kopyala = m.kim === "robot" && !m.gecici
      ? `<button type="button" class="robot-kopyala" data-mesaj="${i}" title="Cevabı kopyala">⧉</button>` : "";
    return `<div class="robot-mesaj ${m.kim}">${kopyala}${rbMetniBicimle(m.metin)}${grafik}</div>`;
  }).join("")
    || `<div class="robot-mesaj robot bos">Merhaba. Verinizi inceleyip yorumlayabilirim — aşağıdaki örneklerden birine dokunun ya da komutunuzu yazın.</div>`;
  akis.scrollTop = akis.scrollHeight;
}

function rbMesajEkle(kim, cevap) {
  const metin = typeof cevap === "string" ? cevap : cevap.metin;
  const grafik = typeof cevap === "string" ? null : cevap.grafik ?? null;
  robotGecmis.push({ kim, metin, ...(grafik ? { grafik } : {}) });
  if (robotGecmis.length > ROBOT_EN_COK_MESAJ) robotGecmis = robotGecmis.slice(-ROBOT_EN_COK_MESAJ);
  rbKaydet();
  rbAkisiCiz();
}

/**
 * Soruyu işler. Model araması saniyeler sürebildiği için önce "düşünüyor"
 * satırı basılıp ekranın boyanmasına izin verilir; yoksa pencere donmuş
 * görünürdü.
 */
function rbSoruyuIsle(soru) {
  const temiz = soru.trim();
  if (!temiz) return;
  rbMesajEkle("sen", temiz);
  robotGecmis.push({ kim: "robot", metin: "…düşünüyorum", gecici: true });
  rbAkisiCiz();
  setTimeout(() => {
    const cevap = robotaSor(temiz);
    robotGecmis = robotGecmis.filter((m) => !m.gecici);
    rbMesajEkle("robot", cevap);
  }, 30);
}

/** Pencereyi kenar çubuğunun yanına, logonun hizasına yerleştirir. */
/** Pencere büyük kipte mi? Kapanıp açılsa da korunur. */
let robotBuyukKip = false;

/** Yukarı okla gezilen komut geçmişindeki yer; null = gezilmiyor. */
let robotKomutImleci = null;

/**
 * Pencereyi yerleştirir. İki kip var:
 *  - dar kip: kenar çubuğu genişliğinde, boyu onun yarısı (varsayılan)
 *  - büyük kip: kenar çubuğunun sağındaki alanın büyük kısmı; uzun
 *    cevaplar (regresyon listeleri, veri kalitesi dökümü) dar pencerede
 *    satır satır kaydırmayı gerektiriyordu.
 */
function rbPencereyiYerlestir() {
  const pencere = document.getElementById("robotPencere");
  const cubuk = document.querySelector(".yan-cubuk");
  if (!pencere || !cubuk) return;
  const k = cubuk.getBoundingClientRect();
  pencere.classList.toggle("genis", robotBuyukKip);
  pencere.style.left = `${Math.round(k.right + 8)}px`;
  pencere.style.bottom = "14px";
  if (robotBuyukKip) {
    const kalanEn = innerWidth - k.right - 24;
    pencere.style.width = `${Math.max(320, Math.min(760, Math.round(kalanEn)))}px`;
    pencere.style.height = `${Math.round(innerHeight * 0.82)}px`;
  } else {
    pencere.style.width = `${Math.max(196, Math.round(k.width))}px`;
    pencere.style.height = `${Math.round(k.height / 2)}px`;
  }
  const btn = document.getElementById("robotBuyut");
  if (btn) {
    btn.textContent = robotBuyukKip ? "⤡" : "⛶";
    btn.title = robotBuyukKip ? "Pencereyi küçült" : "Pencereyi büyüt";
    btn.setAttribute("aria-label", btn.title);
    btn.setAttribute("aria-pressed", String(robotBuyukKip));
  }
}

function robotAc(ac) {
  const pencere = document.getElementById("robotPencere");
  const logo = document.getElementById("robotLogo");
  if (!pencere) return;
  const acilsin = ac ?? pencere.hidden;
  pencere.hidden = !acilsin;
  logo?.classList.toggle("acik", acilsin);
  logo?.setAttribute("aria-expanded", String(acilsin));
  if (acilsin) {
    rbPencereyiYerlestir();
    rbAkisiCiz();
    document.getElementById("robotSoru")?.focus();
  }
}

function robotKur() {
  rbYukle();

  const oneri = document.getElementById("robotOneri");
  if (oneri) {
    oneri.innerHTML = ROBOT_ORNEKLER.map((o) =>
      `<button type="button" class="robot-ornek">${kacisla(o)}</button>`).join("");
    oneri.addEventListener("click", (e) => {
      const b = e.target.closest(".robot-ornek");
      if (b) rbSoruyuIsle(b.textContent);
    });
  }

  document.getElementById("robotLogo")?.addEventListener("click", () => robotAc());
  document.getElementById("robotKapat")?.addEventListener("click", () => robotAc(false));
  document.getElementById("robotTemizle")?.addEventListener("click", () => {
    robotGecmis = [];
    rbKaydet();
    rbAkisiCiz();
  });
  document.getElementById("robotBuyut")?.addEventListener("click", () => {
    robotBuyukKip = !robotBuyukKip;
    rbKaydet();
    rbPencereyiYerlestir();
    document.getElementById("robotAkis")?.scrollTo(0, 1e6);
  });
  document.getElementById("robotGiris")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const kutu = document.getElementById("robotSoru");
    rbSoruyuIsle(kutu.value);
    kutu.value = "";
  });

  // Yukarı/aşağı okla önceki komutlar — terminal alışkanlığı
  const kutu = document.getElementById("robotSoru");
  kutu?.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const komutlar = robotGecmis.filter((m) => m.kim === "sen").map((m) => m.metin);
    if (!komutlar.length) return;
    e.preventDefault();
    if (robotKomutImleci === null) robotKomutImleci = komutlar.length;
    robotKomutImleci += e.key === "ArrowUp" ? -1 : 1;
    robotKomutImleci = Math.max(0, Math.min(komutlar.length, robotKomutImleci));
    kutu.value = robotKomutImleci === komutlar.length ? "" : komutlar[robotKomutImleci];
    kutu.setSelectionRange(kutu.value.length, kutu.value.length);
  });
  kutu?.addEventListener("input", () => { robotKomutImleci = null; });

  document.getElementById("robotAkis")?.addEventListener("click", async (e) => {
    const btn = e.target.closest(".robot-kopyala");
    if (!btn) return;
    const m = robotGecmis[Number(btn.dataset.mesaj)];
    if (!m) return;
    try {
      await navigator.clipboard.writeText(m.metin.replace(/\*\*/g, ""));
      btn.textContent = "✓";
      setTimeout(() => { btn.textContent = "⧉"; }, 1200);
    } catch {
      btn.textContent = "!";
      setTimeout(() => { btn.textContent = "⧉"; }, 1200);
    }
  });
  addEventListener("resize", () => {
    if (!document.getElementById("robotPencere")?.hidden) rbPencereyiYerlestir();
  });
  rbAkisiCiz();
}
