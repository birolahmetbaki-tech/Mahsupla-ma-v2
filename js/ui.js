/* Ortak arayüz parçaları: modal form, onay, bildirim. */
(function (root) {
  'use strict';
  var U = root.App.util;

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function toast(msg, kind) {
    var box = document.getElementById('toasts');
    var t = el('div', { class: 'toast ' + (kind || '') }, U.escapeHtml(msg));
    box.appendChild(t);
    setTimeout(function () { t.classList.add('hide'); }, 3200);
    setTimeout(function () { t.remove(); }, 3700);
  }

  function closeModal() {
    var m = document.getElementById('modal');
    m.classList.remove('open');
    m.innerHTML = '';
  }

  function openModal(title, bodyEl, buttons) {
    var m = document.getElementById('modal');
    m.innerHTML = '';
    var box = el('div', { class: 'modal-box', role: 'dialog', 'aria-modal': 'true' });
    box.appendChild(el('div', { class: 'modal-head' }, '<h3>' + U.escapeHtml(title) + '</h3>'));
    var x = el('button', { class: 'icon-btn modal-x', title: 'Kapat', onclick: closeModal }, '&times;');
    box.firstChild.appendChild(x);
    var body = el('div', { class: 'modal-body' });
    body.appendChild(bodyEl);
    box.appendChild(body);
    var foot = el('div', { class: 'modal-foot' });
    (buttons || []).forEach(function (b) {
      foot.appendChild(el('button', { class: 'btn ' + (b.class || ''), onclick: b.onclick }, b.label));
    });
    box.appendChild(foot);
    m.appendChild(box);
    m.classList.add('open');
    m.onclick = function (e) { if (e.target === m) closeModal(); };
    var first = box.querySelector('input,select,textarea');
    if (first) first.focus();
  }

  /* Form tanımı: [{key,label,type:'text'|'number'|'date'|'select'|'textarea', options:[], required, help, half}] */
  function formModal(title, def, values, onSave) {
    values = values || {};
    var form = el('form', { class: 'form-grid' });
    def.forEach(function (f) {
      if (f.type === 'section') { form.appendChild(el('div', { class: 'form-section' }, U.escapeHtml(f.label))); return; }
      var wrap = el('label', { class: 'field' + (f.full ? ' full' : '') });
      wrap.appendChild(el('span', { class: 'field-label' }, U.escapeHtml(f.label) + (f.required ? ' <b class="req">*</b>' : '') + (f.unit ? ' <i>(' + U.escapeHtml(f.unit) + ')</i>' : '')));
      var input;
      var v = values[f.key];
      if (f.type === 'select') {
        input = el('select', { name: f.key });
        input.appendChild(el('option', { value: '' }, '— Seçiniz —'));
        f.options.forEach(function (o) {
          var opt = el('option', { value: o }, U.escapeHtml(o));
          if (v === o) opt.selected = true;
          input.appendChild(opt);
        });
      } else if (f.type === 'textarea') {
        input = el('textarea', { name: f.key, rows: 2 });
        input.value = v || '';
      } else {
        input = el('input', { name: f.key, type: f.type === 'number' ? 'text' : (f.type || 'text') });
        if (f.type === 'number') { input.inputMode = 'decimal'; input.value = v === null || v === undefined ? '' : U.formatTRNumber(v, f.dec === undefined ? 3 : f.dec).replace(/,(\d*?)0+$/, ',$1').replace(/,$/, ''); }
        else input.value = v || '';
      }
      if (f.required) input.required = true;
      wrap.appendChild(input);
      if (f.help) wrap.appendChild(el('small', { class: 'help' }, f.help));
      form.appendChild(wrap);
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
    function submit() {
      if (!form.reportValidity()) return;
      var out = Object.assign({}, values);
      def.forEach(function (f) {
        if (f.type === 'section') return;
        var raw = form.elements[f.key].value.trim();
        out[f.key] = f.type === 'number' ? (raw === '' ? null : U.parseTRNumber(raw)) : raw;
      });
      if (onSave(out) !== false) closeModal();
    }
    openModal(title, form, [
      { label: 'Vazgeç', onclick: closeModal },
      { label: 'Kaydet', class: 'primary', onclick: submit }
    ]);
  }

  function confirmModal(title, msg, okLabel, onOk) {
    openModal(title, el('p', null, msg), [
      { label: 'Vazgeç', onclick: closeModal },
      { label: okLabel || 'Tamam', class: 'danger', onclick: function () { closeModal(); onOk(); } }
    ]);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.getElementById('modal').classList.contains('open')) closeModal();
  });

  root.App.ui = { el: el, toast: toast, openModal: openModal, closeModal: closeModal, formModal: formModal, confirmModal: confirmModal };
})(this);
