// Sürüm sayaçları: hesaplanmış değerlerin ne zaman geçersizleşeceğini belirler.
//
// Ham veri ya da hesap ayarları değiştiğinde sahibi kendi sayacını artırır.
// Hesap motoru sonuçlarını bu sayaçların birleşimi olan "damga" ile saklar;
// damga değişmediği sürece sonuçlar yeniden hesaplanmaz.

const surumler = { veri: 1, hesap: 1 };

function surumAl(ad) {
  return surumler[ad] ?? 0;
}

/** Sahibi değişiklik yaptığında çağırır. */
function surumArtir(ad) {
  surumler[ad] = (surumler[ad] ?? 0) + 1;
  return surumler[ad];
}

/** Sonuçların hangi girdi bileşimine ait olduğunu gösteren damga. */
function damga() {
  return `v${surumler.veri}.h${surumler.hesap}`;
}
