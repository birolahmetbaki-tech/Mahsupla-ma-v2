// Ortak metin yardımcıları.

/** Kullanıcı metnini HTML'e gömmeden önce kaçışlar. */
function kacisla(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}
