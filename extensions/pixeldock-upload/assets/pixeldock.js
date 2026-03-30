(function () {
  'use strict';

  function initBlock(block) {
    var trigger = block.querySelector('.pixeldock-trigger');
    var modal = block.querySelector('.pixeldock-modal');
    var overlay = block.querySelector('.pixeldock-overlay');
    var closeBtn = block.querySelector('.pixeldock-dialog__close');
    var cancelBtn = block.querySelector('.pixeldock-btn--cancel');
    var saveBtn = block.querySelector('.pixeldock-btn--save');
    var form = block.querySelector('.pixeldock-form');
    var uploadZone = block.querySelector('.pixeldock-upload-zone');
    var fileInput = block.querySelector('.pixeldock-file-input');
    var placeholder = block.querySelector('.pixeldock-upload-placeholder');
    var preview = block.querySelector('.pixeldock-upload-preview');
    var previewImg = block.querySelector('.pixeldock-preview-img');
    var previewName = block.querySelector('.pixeldock-preview-name');
    var statusEl = block.querySelector('.pixeldock-status');

    var proxyUrl = block.dataset.proxyUrl;
    var variantId = block.dataset.variantId;

    var selectedFile = null;

    // --- Toggle groups ---
    block.querySelectorAll('.pixeldock-toggle-group').forEach(function (group) {
      var field = group.dataset.field;
      var hiddenInput = form.querySelector('.pd-field-' + field);

      group.querySelectorAll('.pixeldock-toggle').forEach(function (btn) {
        btn.addEventListener('click', function () {
          group.querySelectorAll('.pixeldock-toggle').forEach(function (b) {
            b.classList.remove('is-active');
          });
          btn.classList.add('is-active');
          if (hiddenInput) hiddenInput.value = btn.dataset.value;

          // Hide "YAN" field when region is "Sırt"
          if (field === 'region') {
            updateYanVisibility(btn.dataset.value);
          }
        });
      });
    });

    function updateYanVisibility(region) {
      block.querySelectorAll('[data-show-for-regions]').forEach(function (el) {
        var allowed = el.dataset.showForRegions.split(',');
        el.style.display = allowed.includes(region) ? '' : 'none';
      });
    }

    // --- Modal open / close ---
    trigger.addEventListener('click', function () {
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    });

    function closeModal() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      hideStatus();
    }

    overlay.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) {
        closeModal();
      }
    });

    // --- File input ---
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) {
        handleFile(fileInput.files[0]);
      }
    });

    uploadZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      uploadZone.classList.add('is-dragover');
    });

    uploadZone.addEventListener('dragleave', function () {
      uploadZone.classList.remove('is-dragover');
    });

    uploadZone.addEventListener('drop', function (e) {
      e.preventDefault();
      uploadZone.classList.remove('is-dragover');
      var files = e.dataTransfer.files;
      if (files && files[0]) handleFile(files[0]);
    });

    function handleFile(file) {
      var allowed = ['image/png', 'image/jpeg', 'image/jpg'];
      if (!allowed.includes(file.type)) {
        showStatus('Lütfen PNG veya JPG dosyası yükleyin.', 'error');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showStatus('Dosya boyutu 5 MB\'ı geçemez.', 'error');
        return;
      }

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

    // --- Status helpers ---
    function showStatus(message, type) {
      statusEl.textContent = message;
      statusEl.className = 'pixeldock-status is-' + type;
      statusEl.hidden = false;
    }

    function hideStatus() {
      statusEl.hidden = true;
      statusEl.className = 'pixeldock-status';
    }

    // --- Form submit ---
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      if (!selectedFile) {
        showStatus('Lütfen bir logo dosyası seçin.', 'error');
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Yükleniyor...';
      hideStatus();

      var formData = new FormData();
      formData.append('file', selectedFile);

      fetch(proxyUrl, { method: 'POST', body: formData })
        .then(function (res) {
          if (!res.ok) throw new Error('Upload failed: ' + res.status);
          return res.json();
        })
        .then(function (data) {
          if (!data.ok) throw new Error(data.error || 'Upload failed');

          var region = form.querySelector('.pd-field-region').value;
          var yan = form.querySelector('.pd-field-yan').value;
          var sekil = form.querySelector('.pd-field-sekil').value;
          var note = form.querySelector('.pixeldock-note').value;

          var properties = {
            'Bölge': region,
            'Yan': yan,
            'Şekil': sekil,
            'Logo': data.fileUrl,
          };

          if (note) properties['Not'] = note;

          return fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: variantId,
              quantity: 1,
              properties: properties,
            }),
          });
        })
        .then(function (res) {
          if (!res.ok) throw new Error('Cart update failed');
          showStatus('Patch ayarları sepete eklendi!', 'success');
          saveBtn.textContent = 'Kaydet';
          saveBtn.disabled = false;

          // Notify theme of cart update
          document.dispatchEvent(new CustomEvent('cart:updated', { bubbles: true }));

          // Auto-close after short delay
          setTimeout(closeModal, 1800);
        })
        .catch(function (err) {
          console.error('[PixelDock]', err);
          showStatus('Bir hata oluştu. Lütfen tekrar deneyin.', 'error');
          saveBtn.textContent = 'Kaydet';
          saveBtn.disabled = false;
        });
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
