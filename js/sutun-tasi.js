// Tablo sütunlarını başlığından sürükleyerek yeniden sıralama.
//
// Veri sayfası ile Hesaplanmış Değerler sayfası aynı mekanizmayı kullanır;
// aradaki fark hangi başlığın taşınabildiği ve sıranın nereye yazıldığıdır.
//
// Veri sayfasında sütun harfi (A, B, C…) sütunun kimliğidir, yeri değil:
// formüller harfe atıf yapar ve aralıklar harf aritmetiğiyle çözülür
// (SUM(H:J) her zaman H, I, J demektir). Bu yüzden sıra değişince
// formüller bozulmaz — harf sütunla birlikte taşınır.

/** Hangi başlık satırının hangi dinleyicilerle bağlı olduğu. */
const bagliSatirlar = new WeakMap();

/**
 * Bir başlık satırına sürükleyerek sıralamayı bağlar.
 *
 * @param {HTMLElement} satir      Başlıkları taşıyan <tr>
 * @param {object} ayar
 * @param {string} ayar.anahtar    Başlıktaki kimliği taşıyan data alanı ("kolon", "gosterge"…)
 * @param {(th:HTMLElement)=>boolean} [ayar.tasinabilir]  Bu başlık sürüklenebilir mi
 * @param {(kaynak:string, hedef:string, oncesine:boolean)=>void} ayar.birak  Sıralamayı uygula
 */
function sutunTasimayiBagla(satir, { anahtar, tasinabilir = () => true, birak }) {
  if (!satir) return;
  // Aynı başlık satırı iki farklı görünümde kullanılabiliyor (tesis / matris).
  // Yeniden bağlarken eski dinleyiciler sökülür, yoksa ilk görünümün
  // kuralları ikincisinde de geçerli kalırdı.
  bagliSatirlar.get(satir)?.abort();
  const durdurucu = new AbortController();
  bagliSatirlar.set(satir, durdurucu);
  const kanal = { signal: durdurucu.signal };

  const kimlik = (th) => th?.dataset?.[anahtar] ?? null;
  const basligi = (el) => el?.closest?.("th") ?? null;
  let suruklenen = null;

  const isaretiTemizle = () => {
    for (const th of satir.querySelectorAll("th")) {
      th.classList.remove("sutun-hedef-sol", "sutun-hedef-sag");
    }
  };

  satir.addEventListener("mousedown", (e) => {
    // Menü düğmesinden ya da yeniden adlandırma alanından sürükleme başlamasın
    const th = basligi(e.target);
    const serbest = e.target.closest("button, input, select, .menu-ac");
    if (!th) return;
    th.draggable = Boolean(kimlik(th)) && tasinabilir(th) && !serbest;
  }, kanal);

  satir.addEventListener("dragstart", (e) => {
    const th = basligi(e.target);
    if (!th || !kimlik(th) || !tasinabilir(th)) return e.preventDefault();
    suruklenen = kimlik(th);
    th.classList.add("sutun-suruklenen");
    e.dataTransfer.effectAllowed = "move";
    // Firefox sürüklemeyi ancak veri yazılınca başlatır
    e.dataTransfer.setData("text/plain", suruklenen);
  }, kanal);

  satir.addEventListener("dragover", (e) => {
    const th = basligi(e.target);
    if (!suruklenen || !th || !kimlik(th) || !tasinabilir(th)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    isaretiTemizle();
    if (kimlik(th) === suruklenen) return;
    const kutu = th.getBoundingClientRect();
    const solaMi = e.clientX < kutu.left + kutu.width / 2;
    th.classList.add(solaMi ? "sutun-hedef-sol" : "sutun-hedef-sag");
  }, kanal);

  satir.addEventListener("drop", (e) => {
    const th = basligi(e.target);
    if (!suruklenen || !th || !kimlik(th) || !tasinabilir(th)) return;
    e.preventDefault();
    const hedef = kimlik(th);
    const kutu = th.getBoundingClientRect();
    const oncesine = e.clientX < kutu.left + kutu.width / 2;
    isaretiTemizle();
    const kaynak = suruklenen;
    suruklenen = null;
    if (hedef !== kaynak) birak(kaynak, hedef, oncesine);
  }, kanal);

  satir.addEventListener("dragend", () => {
    suruklenen = null;
    isaretiTemizle();
    for (const th of satir.querySelectorAll("th")) {
      th.classList.remove("sutun-suruklenen");
      th.draggable = false;
    }
  }, kanal);
}

/**
 * Bir diziyi yeniden sıralar: `kaynak` öğesini `hedef` öğesinin önüne ya da
 * arkasına taşır. Dizi kopyalanmaz, yerinde değiştirilir.
 *
 * @param {any[]} dizi
 * @param {(oge:any)=>string} kimlikAl
 * @returns {boolean} sıra değiştiyse true
 */
function diziyiTasi(dizi, kimlikAl, kaynak, hedef, oncesine) {
  const kaynakSira = dizi.findIndex((x) => kimlikAl(x) === kaynak);
  if (kaynakSira < 0) return false;
  const [oge] = dizi.splice(kaynakSira, 1);
  let hedefSira = dizi.findIndex((x) => kimlikAl(x) === hedef);
  if (hedefSira < 0) { dizi.splice(kaynakSira, 0, oge); return false; }
  if (!oncesine) hedefSira += 1;
  dizi.splice(hedefSira, 0, oge);
  return hedefSira !== kaynakSira;
}
