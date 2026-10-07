// Sayfadaki tek modal penceresini yöneten ortak yardımcılar.

const ortu = document.getElementById("ortu");
const kutu = document.getElementById("kutu");

function diyalogKapat() {
  ortu.hidden = true;
  kutu.innerHTML = "";
  kutu.classList.remove("genis");
}

ortu.addEventListener("click", (e) => e.target === ortu && diyalogKapat());
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !ortu.hidden) diyalogKapat();
});

/**
 * @param {string} html  kutunun içeriği
 * @param {(kutu: HTMLElement) => void} baglan  olayları bağlayan geri çağırım
 * @param {{ genis?: boolean }} secenekler
 */
function diyalogAc(html, baglan, { genis = false } = {}) {
  kutu.innerHTML = html;
  kutu.classList.toggle("genis", genis);
  ortu.hidden = false;
  baglan(kutu);
  kutu.querySelector("input, select, textarea")?.focus();
}
