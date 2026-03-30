(function () {
  'use strict';

  // ─── Config cache ──────────────────────────────────────────────────────────
  var _configCache = null;

  function fetchConfig(configUrl) {
    if (_configCache) return Promise.resolve(_configCache);
    return fetch(configUrl)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        _configCache = data.config || null;
        return _configCache;
      })
      .catch(function () { return null; });
  }

  // ─── DOM helpers ──────────────────────────────────────────────────────────
  function el(tag, attrs, children) {
    var elem = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') elem.className = attrs[k];
        else if (k === 'textContent') elem.textContent = attrs[k];
        else elem.setAttribute(k, attrs[k]);
      });
    }
    if (children) {
      children.forEach(function (c) {
        if (c) elem.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return elem;
  }

  // ─── Build form from config ───────────────────────────────────────────────
  function buildForm(config, blockId) {
    var form = el('form', { className: 'pixeldock-form' });

    config.blocks.forEach(function (block) {
      var group = el('div', { className: 'pixeldock-field-group' });
      var label = el('p', { className: 'pixeldock-label', textContent: block.label });
      group.appendChild(label);

      switch (block.type) {
        case 'toggle_group': {
          var options = (block.options || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
          var hidden = el('input', { type: 'hidden', 'data-field': block.name, value: block.defaultValue || options[0] || '' });
          form.appendChild(hidden);

          var toggleGroup = el('div', { className: 'pixeldock-toggle-group', 'data-field': block.name });
          options.forEach(function (opt, i) {
            var btn = el('button', {
              type: 'button',
              className: 'pixeldock-toggle' + (i === 0 || opt === block.defaultValue ? ' is-active' : ''),
              'data-value': opt,
              textContent: opt,
            });
            toggleGroup.appendChild(btn);
          });

          if (options.length === 2) {
            toggleGroup.classList.add('pixeldock-toggle-group--half');
          }

          group.appendChild(toggleGroup);
          break;
        }

        case 'select': {
          var options = (block.options || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
          var select = el('select', { className: 'pixeldock-select', name: 'properties[' + block.label + ']' });
          options.forEach(function (opt) {
            var option = el('option', { value: opt, textContent: opt });
            if (opt === block.defaultValue) option.setAttribute('selected', 'selected');
            select.appendChild(option);
          });
          group.appendChild(select);
          break;
        }

        case 'input': {
          var input = el('input', {
            className: 'pixeldock-input',
            type: 'text',
            name: 'properties[' + block.label + ']',
            placeholder: block.placeholder || '',
          });
          if (block.required) input.setAttribute('required', 'required');
          group.appendChild(input);
          break;
        }

        case 'textarea': {
          var textarea = el('textarea', {
            className: 'pixeldock-textarea',
            name: 'properties[' + block.label + ']',
            placeholder: block.placeholder || '',
            rows: '3',
          });
          if (block.required) textarea.setAttribute('required', 'required');
          group.appendChild(textarea);
          break;
        }

        case 'file': {
          var zone = el('div', { className: 'pixeldock-upload-zone', id: 'pixeldock-drop-' + blockId });
          var fileInput = el('input', {
            className: 'pixeldock-file-input',
            type: 'file',
            accept: block.accept || '.png,.jpg,.jpeg',
            tabindex: '-1',
          });
          if (block.required) fileInput.setAttribute('required', 'required');
          fileInput.dataset.fieldName = block.name;

          var placeholder = el('div', { className: 'pixeldock-upload-placeholder' }, [
            createUploadIcon(),
            el('span', { textContent: (block.accept || '.png,.jpg').replace(/\./g, '').toUpperCase() }),
          ]);

          var preview = el('div', { className: 'pixeldock-upload-preview' });
          preview.hidden = true;
          var previewImg = el('img', { className: 'pixeldock-preview-img', src: '', alt: 'Logo önizleme' });
          var previewName = el('span', { className: 'pixeldock-preview-name' });
          preview.appendChild(previewImg);
          preview.appendChild(previewName);

          zone.appendChild(fileInput);
          zone.appendChild(placeholder);
          zone.appendChild(preview);
          group.appendChild(zone);
          break;
        }
      }

      form.appendChild(group);
    });

    // Note field separator
    var divider = el('div', { className: 'pixeldock-note-group' });

    // Footer
    var footer = el('div', { className: 'pixeldock-form-footer' });
    var cancelBtn = el('button', { type: 'button', className: 'pixeldock-btn pixeldock-btn--cancel', textContent: 'İptal' });
    var saveBtn = el('button', { type: 'submit', className: 'pixeldock-btn pixeldock-btn--save', textContent: config.submitLabel || 'Kaydet' });
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    var status = el('div', { className: 'pixeldock-status' });
    status.hidden = true;

    form.appendChild(status);
    form.appendChild(footer);

    return form;
  }

  function createUploadIcon() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '28');
    svg.setAttribute('height', '32');
    svg.setAttribute('viewBox', '0 0 28 32');
    svg.setAttribute('fill', 'none');
    svg.innerHTML = '<path d="M16 2H4C3.47 2 2.96 2.21 2.59 2.59C2.21 2.96 2 3.47 2 4V28C2 28.53 2.21 29.04 2.59 29.41C2.96 29.79 3.47 30 4 30H24C24.53 30 25.04 29.79 25.41 29.41C25.79 29.04 26 28.53 26 28V12L16 2Z" stroke="#9CA3AF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 2V12H26" stroke="#9CA3AF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 22V17M11.5 19.5H16.5" stroke="#9CA3AF" stroke-width="2" stroke-linecap="round"/>';
    return svg;
  }

  // ─── Wire up form interactions ────────────────────────────────────────────
  function wireForm(form, block, config) {
    var trigger = block.querySelector('.pixeldock-trigger');
    var modal = block.querySelector('.pixeldock-modal');
    var overlay = block.querySelector('.pixeldock-overlay');
    var closeBtn = block.querySelector('.pixeldock-dialog__close');
    var cancelBtn = form.querySelector('.pixeldock-btn--cancel');
    var saveBtn = form.querySelector('.pixeldock-btn--save');
    var statusEl = form.querySelector('.pixeldock-status');
    var proxyUrl = block.dataset.proxyUrl;
    var configBase = proxyUrl.replace('/upload', '');
    var uploadUrl = proxyUrl;
    var variantId = block.dataset.variantId;

    var selectedFile = null;

    // Toggle groups
    form.querySelectorAll('.pixeldock-toggle-group').forEach(function (group) {
      var field = group.dataset.field;
      var hidden = form.querySelector('input[data-field="' + field + '"]');

      group.querySelectorAll('.pixeldock-toggle').forEach(function (btn) {
        btn.addEventListener('click', function () {
          group.querySelectorAll('.pixeldock-toggle').forEach(function (b) { b.classList.remove('is-active'); });
          btn.classList.add('is-active');
          if (hidden) hidden.value = btn.dataset.value;
        });
      });
    });

    // File inputs
    form.querySelectorAll('.pixeldock-file-input').forEach(function (fileInput) {
      var zone = fileInput.closest('.pixeldock-upload-zone');
      var placeholder = zone.querySelector('.pixeldock-upload-placeholder');
      var preview = zone.querySelector('.pixeldock-upload-preview');
      var previewImg = zone.querySelector('.pixeldock-preview-img');
      var previewName = zone.querySelector('.pixeldock-preview-name');

      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
      });

      zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('is-dragover'); });
      zone.addEventListener('dragleave', function () { zone.classList.remove('is-dragover'); });
      zone.addEventListener('drop', function (e) {
        e.preventDefault();
        zone.classList.remove('is-dragover');
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
      });

      function handleFile(file) {
        var allowed = ['image/png', 'image/jpeg', 'image/jpg'];
        if (!allowed.includes(file.type)) { showStatus('Lütfen PNG veya JPG dosyası yükleyin.', 'error'); return; }
        if (file.size > 5 * 1024 * 1024) { showStatus('Dosya 5 MB\'ı geçemez.', 'error'); return; }
        selectedFile = file;
        hideStatus();
        var reader = new FileReader();
        reader.onload = function (e) {
          previewImg.src = e.target.result;
          previewName.textContent = file.name;
          placeholder.hidden = true;
          preview.hidden = false;
        };
        reader.readAsDataURL(file);
      }
    });

    // Modal open/close
    trigger.addEventListener('click', function () { openModal(); });

    function openModal() {
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }

    function closeModal() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      hideStatus();
    }

    overlay.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
    });

    // Status helpers
    function showStatus(msg, type) {
      statusEl.textContent = msg;
      statusEl.className = 'pixeldock-status is-' + type;
      statusEl.hidden = false;
    }
    function hideStatus() {
      statusEl.hidden = true;
      statusEl.className = 'pixeldock-status';
    }

    // Submit
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      saveBtn.disabled = true;
      saveBtn.textContent = 'Yükleniyor...';
      hideStatus();

      var uploadPromise = selectedFile
        ? (function () {
            var fd = new FormData();
            fd.append('file', selectedFile);
            return fetch(uploadUrl, { method: 'POST', body: fd })
              .then(function (r) { if (!r.ok) throw new Error('Upload failed'); return r.json(); })
              .then(function (d) { return d.fileUrl || ''; });
          })()
        : Promise.resolve('');

      uploadPromise
        .then(function (fileUrl) {
          var properties = {};

          // Collect toggle_group values
          form.querySelectorAll('input[data-field]').forEach(function (hidden) {
            var block = config.blocks.find(function (b) { return b.name === hidden.dataset.field; });
            if (block) properties[block.label] = hidden.value;
          });

          // Collect input/textarea/select values
          form.querySelectorAll('input.pixeldock-input, textarea.pixeldock-textarea, select.pixeldock-select').forEach(function (field) {
            var match = (field.getAttribute('name') || '').match(/properties\[(.+)\]/);
            if (match) properties[match[1]] = field.value;
          });

          if (fileUrl) {
            var fileBlock = config.blocks.find(function (b) { return b.type === 'file'; });
            if (fileBlock) properties[fileBlock.label] = fileUrl;
          }

          return fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: variantId, quantity: 1, properties: properties }),
          });
        })
        .then(function (r) {
          if (!r.ok) throw new Error('Cart update failed');
          showStatus('Ayarlar sepete eklendi!', 'success');
          saveBtn.textContent = config.submitLabel || 'Kaydet';
          saveBtn.disabled = false;
          document.dispatchEvent(new CustomEvent('cart:updated', { bubbles: true }));
          setTimeout(closeModal, 1800);
        })
        .catch(function (err) {
          console.error('[PixelDock]', err);
          showStatus('Bir hata oluştu. Lütfen tekrar deneyin.', 'error');
          saveBtn.textContent = config.submitLabel || 'Kaydet';
          saveBtn.disabled = false;
        });
    });
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  function initBlock(block) {
    var dialog = block.querySelector('.pixeldock-dialog');
    var formId = block.dataset.formId;
    var configUrl = block.dataset.proxyUrl.replace('/upload', '/config') + (formId ? '?form_id=' + formId : '');

    // Fetch config and build form
    fetchConfig(configUrl).then(function (config) {
      if (!config) {
        console.warn('[PixelDock] Form config alınamadı.');
        return;
      }

      // Set modal title
      var titleEl = block.querySelector('.pixeldock-dialog__title');
      if (titleEl) titleEl.textContent = config.title || 'Patch Ayarları';

      // Build and inject form
      var form = buildForm(config, block.dataset.blockId);
      dialog.appendChild(form);

      // Wire interactions
      wireForm(form, block, config);
    });
  }

  function init() {
    document.querySelectorAll('.pixeldock-block').forEach(initBlock);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
