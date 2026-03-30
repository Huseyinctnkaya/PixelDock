(function () {
  'use strict';

  // ─── Config cache ──────────────────────────────────────────────────────────
  var _configCache = null;

  function fetchConfig(configUrl) {
    if (_configCache) return Promise.resolve(_configCache);
    console.log('[PixelDock] Fetching config from:', configUrl);
    return fetch(configUrl)
      .then(function (r) {
        console.log('[PixelDock] Config response status:', r.status);
        return r.text();
      })
      .then(function (text) {
        console.log('[PixelDock] Config raw response:', text);
        var data = JSON.parse(text);
        _configCache = data.config || null;
        console.log('[PixelDock] Parsed config:', _configCache ? 'OK' : 'NULL');
        return _configCache;
      })
      .catch(function (err) {
        console.error('[PixelDock] Config fetch error:', err);
        return null;
      });
  }

  // ─── Color helper ─────────────────────────────────────────────────────────
  function shadeColor(hex, percent) {
    var num = parseInt(hex.replace('#', ''), 16);
    var r = Math.min(255, Math.max(0, (num >> 16) + percent));
    var g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + percent));
    var b = Math.min(255, Math.max(0, (num & 0xff) + percent));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
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
    var accentColor = config.triggerColor || '#C84B11';
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

          var acceptText = (block.accept || '.png,.jpg,.jpeg').split(',').map(function(s){ return s.trim().replace('.','').toUpperCase(); }).join(', ');
          var iconWrap = el('div', { className: 'pd-upload-icon' }, [createUploadIcon()]);
          var placeholder = el('div', { className: 'pixeldock-upload-placeholder' }, [
            iconWrap,
            el('span', { className: 'pd-upload-title', textContent: 'Dosya seç veya sürükle' }),
            el('span', { className: 'pd-upload-hint', textContent: acceptText }),
          ]);

          var preview = el('div', { className: 'pixeldock-upload-preview' });
          preview.style.display = 'none';
          var previewImg = el('img', { className: 'pixeldock-preview-img', alt: '' });
          var previewName = el('span', { className: 'pixeldock-preview-name' });
          preview.appendChild(previewImg);
          preview.appendChild(previewName);

          zone.appendChild(fileInput);
          zone.appendChild(placeholder);
          zone.appendChild(preview);
          group.appendChild(zone);
          break;
        }

        case 'color': {
          var colorInput = el('input', {
            className: 'pixeldock-input pixeldock-color-input',
            type: 'color',
            name: 'properties[' + block.label + ']',
            value: block.defaultValue || '#000000',
          });
          if (block.required) colorInput.setAttribute('required', 'required');
          group.appendChild(colorInput);
          break;
        }

        case 'number': {
          var numInput = el('input', {
            className: 'pixeldock-input',
            type: 'number',
            name: 'properties[' + block.label + ']',
            placeholder: block.placeholder || '',
          });
          if (block.min) numInput.setAttribute('min', block.min);
          if (block.max) numInput.setAttribute('max', block.max);
          if (block.required) numInput.setAttribute('required', 'required');
          group.appendChild(numInput);
          break;
        }

        case 'date': {
          var dateInput = el('input', {
            className: 'pixeldock-input',
            type: 'date',
            name: 'properties[' + block.label + ']',
          });
          if (block.required) dateInput.setAttribute('required', 'required');
          group.appendChild(dateInput);
          break;
        }

        case 'email': {
          var emailInput = el('input', {
            className: 'pixeldock-input',
            type: 'email',
            name: 'properties[' + block.label + ']',
            placeholder: block.placeholder || 'ornek@mail.com',
          });
          if (block.required) emailInput.setAttribute('required', 'required');
          group.appendChild(emailInput);
          break;
        }

        case 'tel': {
          var telInput = el('input', {
            className: 'pixeldock-input',
            type: 'tel',
            name: 'properties[' + block.label + ']',
            placeholder: block.placeholder || '+90 5xx xxx xx xx',
          });
          if (block.required) telInput.setAttribute('required', 'required');
          group.appendChild(telInput);
          break;
        }

        case 'url': {
          var urlInput = el('input', {
            className: 'pixeldock-input',
            type: 'url',
            name: 'properties[' + block.label + ']',
            placeholder: block.placeholder || 'https://',
          });
          if (block.required) urlInput.setAttribute('required', 'required');
          group.appendChild(urlInput);
          break;
        }

        case 'checkbox': {
          var cbHidden = el('input', { type: 'hidden', 'data-field': block.name, value: 'Hayır' });
          form.appendChild(cbHidden);
          var cbWrapper = el('label', { className: 'pixeldock-checkbox-label' });
          var cbInput = el('input', { type: 'checkbox', className: 'pixeldock-checkbox', 'data-field-checkbox': block.name });
          cbWrapper.appendChild(cbInput);
          cbWrapper.appendChild(document.createTextNode(' ' + (block.placeholder || block.label)));
          group.appendChild(cbWrapper);
          break;
        }

        case 'checkbox_group': {
          var cgHidden = el('input', { type: 'hidden', 'data-field': block.name, value: '' });
          form.appendChild(cgHidden);
          var cgOptions = (block.options || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
          var cgWrapper = el('div', { className: 'pixeldock-checkbox-group', 'data-group': block.name });
          cgOptions.forEach(function(opt) {
            var optLabel = el('label', { className: 'pixeldock-checkbox-label' });
            var optInput = el('input', { type: 'checkbox', className: 'pixeldock-checkbox', value: opt, 'data-group-item': block.name });
            optLabel.appendChild(optInput);
            optLabel.appendChild(document.createTextNode(' ' + opt));
            cgWrapper.appendChild(optLabel);
          });
          group.appendChild(cgWrapper);
          break;
        }

        case 'divider': {
          group.removeChild(label);
          var hr = el('hr', { className: 'pixeldock-divider' });
          group.appendChild(hr);
          break;
        }

        case 'info': {
          group.removeChild(label);
          var infoBox = el('div', { className: 'pixeldock-info-box', textContent: block.label });
          group.appendChild(infoBox);
          break;
        }

        case 'rating': {
          var ratingHidden = el('input', { type: 'hidden', 'data-field': block.name, value: block.defaultValue || '0' });
          form.appendChild(ratingHidden);
          var ratingWidget = el('div', { className: 'pixeldock-rating', 'data-rating-field': block.name });
          for (var ri = 1; ri <= 5; ri++) {
            var star = el('button', {
              type: 'button',
              className: 'pixeldock-star' + (ri <= Number(block.defaultValue || 0) ? ' is-active' : ''),
              'data-value': String(ri),
              textContent: '★',
            });
            ratingWidget.appendChild(star);
          }
          group.appendChild(ratingWidget);
          break;
        }

        case 'multi_file': {
          var mfZone = el('div', { className: 'pixeldock-upload-zone pixeldock-multi-zone', id: 'pixeldock-drop-mf-' + blockId });
          var mfInput = el('input', {
            className: 'pixeldock-file-input',
            type: 'file',
            accept: block.accept || '.png,.jpg,.jpeg',
            tabindex: '-1',
            multiple: 'multiple',
          });
          if (block.required) mfInput.setAttribute('required', 'required');
          mfInput.dataset.fieldName = block.name;
          mfInput.dataset.multiFile = 'true';
          var mfAcceptText = (block.accept || '.png,.jpg,.jpeg').split(',').map(function(s){ return s.trim().replace('.','').toUpperCase(); }).join(', ');
          var mfIconWrap = el('div', { className: 'pd-upload-icon' }, [createUploadIcon()]);
          var mfPlaceholder = el('div', { className: 'pixeldock-upload-placeholder' }, [
            mfIconWrap,
            el('span', { className: 'pd-upload-title', textContent: 'Birden fazla dosya ekle' }),
            el('span', { className: 'pd-upload-hint', textContent: mfAcceptText }),
          ]);
          var mfPreview = el('div', { className: 'pixeldock-multi-preview' });
          mfPreview.hidden = true;
          mfZone.appendChild(mfInput);
          mfZone.appendChild(mfPlaceholder);
          mfZone.appendChild(mfPreview);
          group.appendChild(mfZone);
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
    saveBtn.style.backgroundColor = accentColor;
    saveBtn.style.borderColor = accentColor;
    saveBtn.style.setProperty('--pd-save-hover', shadeColor(accentColor, -20));
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
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '22');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.innerHTML = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#9CA3AF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="17 8 12 3 7 8" stroke="#9CA3AF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="3" x2="12" y2="15" stroke="#9CA3AF" stroke-width="2" stroke-linecap="round"/>';
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
          placeholder.style.display = 'none';
          preview.style.display = 'flex';
        };
        reader.readAsDataURL(file);
      }
    });

    // Checkbox (single)
    form.querySelectorAll('input[data-field-checkbox]').forEach(function(cb) {
      var field = cb.dataset.fieldCheckbox;
      var hidden = form.querySelector('input[data-field="' + field + '"]');
      cb.addEventListener('change', function() {
        if (hidden) hidden.value = cb.checked ? 'Evet' : 'Hayır';
      });
    });

    // Checkbox group
    form.querySelectorAll('.pixeldock-checkbox-group').forEach(function(group) {
      var field = group.dataset.group;
      var hidden = form.querySelector('input[data-field="' + field + '"]');
      group.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
        cb.addEventListener('change', function() {
          var checked = Array.from(group.querySelectorAll('input[type="checkbox"]:checked')).map(function(c) { return c.value; });
          if (hidden) hidden.value = checked.join(', ');
        });
      });
    });

    // Rating stars
    form.querySelectorAll('.pixeldock-rating').forEach(function(widget) {
      var field = widget.dataset.ratingField;
      var hidden = form.querySelector('input[data-field="' + field + '"]');
      var stars = widget.querySelectorAll('.pixeldock-star');
      stars.forEach(function(star) {
        star.addEventListener('click', function() {
          var val = Number(star.dataset.value);
          if (hidden) hidden.value = String(val);
          stars.forEach(function(s) {
            s.classList.toggle('is-active', Number(s.dataset.value) <= val);
          });
        });
        star.addEventListener('mouseover', function() {
          var val = Number(star.dataset.value);
          stars.forEach(function(s) {
            s.classList.toggle('is-hover', Number(s.dataset.value) <= val);
          });
        });
        star.addEventListener('mouseout', function() {
          stars.forEach(function(s) { s.classList.remove('is-hover'); });
        });
      });
    });

    // Multi-file zone
    form.querySelectorAll('.pixeldock-multi-zone').forEach(function(mfZone) {
      var mfInput = mfZone.querySelector('.pixeldock-file-input');
      var mfPlaceholder = mfZone.querySelector('.pixeldock-upload-placeholder');
      var mfPreview = mfZone.querySelector('.pixeldock-multi-preview');

      function showMultiPreview(files) {
        mfPreview.innerHTML = '';
        Array.from(files).forEach(function(file) {
          var nameEl = el('span', { className: 'pixeldock-multi-file-name', textContent: file.name });
          mfPreview.appendChild(nameEl);
        });
        mfPlaceholder.style.display = 'none';
        mfPreview.style.display = 'flex';
      }

      if (mfInput) {
        mfInput.addEventListener('change', function() {
          if (mfInput.files && mfInput.files.length) showMultiPreview(mfInput.files);
        });
        mfZone.addEventListener('dragover', function(e) { e.preventDefault(); mfZone.classList.add('is-dragover'); });
        mfZone.addEventListener('dragleave', function() { mfZone.classList.remove('is-dragover'); });
        mfZone.addEventListener('drop', function(e) {
          e.preventDefault();
          mfZone.classList.remove('is-dragover');
          if (e.dataTransfer.files.length) {
            mfInput.files = e.dataTransfer.files;
            showMultiPreview(e.dataTransfer.files);
          }
        });
      }
    });

    // Modal open/close (skipped in inline mode — handled by initInlineMode)
    var isInline = config.displayMode === 'inline';

    function openModal() {
      if (isInline) { if (block._openModal) block._openModal(); return; }
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }

    function closeModal() {
      if (isInline) { if (block._closeModal) block._closeModal(); hideStatus(); return; }
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      hideStatus();
    }

    if (!isInline) {
      trigger.addEventListener('click', function () { openModal(); });
      if (overlay) overlay.addEventListener('click', closeModal);
      if (closeBtn) closeBtn.addEventListener('click', closeModal);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal && modal.classList.contains('is-open')) closeModal();
      });
    }
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

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

      // Collect multi-file inputs
      var multiFileInputs = form.querySelectorAll('.pixeldock-file-input[data-multi-file="true"]');
      var multiFileUploads = [];
      multiFileInputs.forEach(function(mfInput) {
        if (mfInput.files && mfInput.files.length) {
          Array.from(mfInput.files).forEach(function(file) {
            multiFileUploads.push({ file: file, fieldName: mfInput.dataset.fieldName });
          });
        }
      });

      var uploadPromise = selectedFile
        ? (function () {
            var fd = new FormData();
            fd.append('file', selectedFile);
            return fetch(uploadUrl, { method: 'POST', body: fd })
              .then(function (r) { if (!r.ok) throw new Error('Upload failed'); return r.json(); })
              .then(function (d) { return d.fileUrl || ''; });
          })()
        : Promise.resolve('');

      var multiUploadPromise = multiFileUploads.length
        ? Promise.all(multiFileUploads.map(function(item) {
            var fd = new FormData();
            fd.append('file', item.file);
            return fetch(uploadUrl, { method: 'POST', body: fd })
              .then(function(r) { return r.ok ? r.json() : { fileUrl: '' }; })
              .then(function(d) { return { fieldName: item.fieldName, url: d.fileUrl || '' }; });
          }))
        : Promise.resolve([]);

      Promise.all([uploadPromise, multiUploadPromise])
        .then(function (results) {
          var fileUrl = results[0];
          var multiResults = results[1];
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

          // Multi-file results grouped by fieldName
          multiResults.forEach(function(item) {
            var mfBlock = config.blocks.find(function(b) { return b.name === item.fieldName; });
            if (mfBlock && item.url) {
              if (properties[mfBlock.label]) {
                properties[mfBlock.label] += ', ' + item.url;
              } else {
                properties[mfBlock.label] = item.url;
              }
            }
          });

          // Build metafield payload for mapped fields
          var metaFields = [];
          config.blocks.forEach(function(b) {
            if (b.metafieldKey && properties[b.label] !== undefined) {
              metaFields.push({ key: b.metafieldKey, value: String(properties[b.label]) });
            }
          });

          var cartPromise = fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: variantId, quantity: 1, properties: properties }),
          });

          var metaPromise = metaFields.length
            ? cartPromise.then(function() {
                var metaUrl = uploadUrl.replace('/upload', '/meta');
                return fetch(metaUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    variantId: 'gid://shopify/ProductVariant/' + variantId,
                    fields: metaFields,
                  }),
                }).catch(function() {}); // non-fatal
              })
            : cartPromise;

          return cartPromise;
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

  // ─── Inline mode ──────────────────────────────────────────────────────────
  function initInlineMode(block, config) {
    var trigger = block.querySelector('.pixeldock-trigger');

    // Build panel
    var panel = document.createElement('div');
    panel.className = 'pixeldock-inline-panel';

    var panelInner = document.createElement('div');

    var panelContent = document.createElement('div');
    panelContent.className = 'pixeldock-inline-content';

    // Header
    var header = document.createElement('div');
    header.className = 'pixeldock-inline-header';
    var titleSpan = document.createElement('span');
    titleSpan.className = 'pixeldock-inline-title';
    titleSpan.textContent = config.title || 'Patch Ayarları';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'pixeldock-dialog__close';
    closeBtn.setAttribute('aria-label', 'Kapat');
    closeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    header.appendChild(titleSpan);
    header.appendChild(closeBtn);

    var form = buildForm(config, block.dataset.blockId);
    panelContent.appendChild(header);
    panelContent.appendChild(form);
    panelInner.appendChild(panelContent);
    panel.appendChild(panelInner);

    trigger.parentNode.insertBefore(panel, trigger.nextSibling);

    var isOpen = false;
    function openPanel() {
      panel.style.gridTemplateRows = '1fr';
      isOpen = true;
    }
    function closePanel() {
      panel.style.gridTemplateRows = '0fr';
      isOpen = false;
    }

    trigger.addEventListener('click', function() {
      if (isOpen) closePanel(); else openPanel();
    });
    closeBtn.addEventListener('click', closePanel);
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && isOpen) closePanel();
    });

    // Override wireForm's modal open/close with inline panel equivalents
    block._openModal = openPanel;
    block._closeModal = closePanel;

    wireForm(form, block, config);
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  function initBlock(block) {
    var formId = block.dataset.formId;
    var configUrl = block.dataset.proxyUrl.replace('/upload', '/config') + (formId ? '?form_id=' + formId : '');

    fetchConfig(configUrl).then(function (config) {
      if (!config) {
        console.warn('[PixelDock] Form config alınamadı. Form ID eksik veya form taslak durumda.');
        // Still wire the trigger to show a helpful message
        var triggerEl = block.querySelector('.pixeldock-trigger');
        if (triggerEl) {
          triggerEl.addEventListener('click', function () {
            var modal = block.querySelector('.pixeldock-modal');
            var titleEl = block.querySelector('.pixeldock-dialog__title');
            var dialog = block.querySelector('.pixeldock-dialog');
            if (titleEl) titleEl.textContent = 'Yapılandırma Hatası';
            if (dialog && !dialog.querySelector('.pixeldock-config-error')) {
              var errEl = document.createElement('div');
              errEl.className = 'pixeldock-config-error pixeldock-info-box';
              errEl.style.marginTop = '16px';
              errEl.textContent = 'Form henüz yapılandırılmamış. Lütfen PixelDock uygulamasından bir form yayınlayın ve Form ID\'yi tema editörüne girin.';
              dialog.appendChild(errEl);
            }
            if (modal) {
              modal.classList.add('is-open');
              modal.setAttribute('aria-hidden', 'false');
              document.body.style.overflow = 'hidden';
              var overlay = block.querySelector('.pixeldock-overlay');
              var closeBtn = block.querySelector('.pixeldock-dialog__close');
              function closeErr() {
                modal.classList.remove('is-open');
                modal.setAttribute('aria-hidden', 'true');
                document.body.style.overflow = '';
              }
              if (overlay) overlay.addEventListener('click', closeErr, { once: true });
              if (closeBtn) closeBtn.addEventListener('click', closeErr, { once: true });
            }
          });
        }
        return;
      }

      // Set trigger button label and color
      var triggerEl = block.querySelector('.pixeldock-trigger');
      if (triggerEl) {
        if (config.triggerLabel) triggerEl.textContent = config.triggerLabel;
        if (config.triggerColor) {
          triggerEl.style.backgroundColor = config.triggerColor;
          triggerEl.style.setProperty('--pd-trigger-hover', shadeColor(config.triggerColor, -15));
        }
      }

      if (config.displayMode === 'inline') {
        // Hide the default modal structure
        var modal = block.querySelector('.pixeldock-modal');
        if (modal) modal.style.display = 'none';

        initInlineMode(block, config);
      } else {
        // Modal mode (default)
        var titleEl = block.querySelector('.pixeldock-dialog__title');
        if (titleEl) titleEl.textContent = config.title || 'Patch Ayarları';

        var dialog = block.querySelector('.pixeldock-dialog');
        var form = buildForm(config, block.dataset.blockId);
        dialog.appendChild(form);

        wireForm(form, block, config);
      }
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
