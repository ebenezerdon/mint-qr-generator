(function(){
  'use strict';
  window.App = window.App || {};

  // App state
  const state = {
    vendorReady: false,
    qrcode: null,
    settings: {
      text: 'https://example.com',
      size: 320,
      margin: 16,
      ecLevel: 'M',
      colorDark: '#0f172a',
      colorLight: '#ffffff',
      logoDataURL: null
    }
  };

  function setStatus(msg){
    $('#statusText').text(msg || '');
  }

  function applyControlsFromSettings(){
    const s = state.settings;
    $('#qrText').val(s.text);
    $('#size').val(s.size); $('#sizeValue').text(String(s.size));
    $('#margin').val(s.margin); $('#marginValue').text(String(s.margin));
    $('#ecLevel').val(s.ecLevel);
    $('#colorDark').val(s.colorDark);
    $('#colorLight').val(s.colorLight);
    if(s.logoDataURL){ $('#logoOverlay').attr('src', s.logoDataURL).show(); } else { $('#logoOverlay').hide().attr('src', ''); }
    // preview card background follows colorLight
    const previewCard = document.getElementById('qrPreviewCard'); if (previewCard) previewCard.style.setProperty('--qr-bg', s.colorLight);
  }

  function getCanvas(){
    const $c = $('#qrContainer canvas');
    if($c.length) return $c.get(0);
    return null;
  }

  function ensureVendor(){
    return !!window.QRCode;
  }

  function makeQRCode(){
    if(!ensureVendor()) return;
    const s = state.settings;
    const container = document.getElementById('qrContainer');
    // Clear
    $(container).empty();
    try {
      state.qrcode = new window.QRCode(container, {
        text: s.text || ' ',
        width: s.size,
        height: s.size,
        colorDark: s.colorDark,
        colorLight: s.colorLight,
        correctLevel: window.QRCode.CorrectLevel[s.ecLevel] || window.QRCode.CorrectLevel.M
      });
      // Toggle logo overlay visibility in preview only
      if(s.logoDataURL){
        $('#logoOverlay').attr('src', s.logoDataURL).show();
      } else {
        $('#logoOverlay').hide().attr('src','');
      }
    } catch (e){
      console.error('QR generation failed', e);
      setStatus('Could not generate QR. Try shorter content.');
    }
  }

  function generateIfReady(){
    if(!ensureVendor()) return;
    if(!state.settings.text){
      setStatus('Enter content to generate');
      $('#qrContainer').empty();
      $('#logoOverlay').hide();
      return;
    }
    setStatus('');
    makeQRCode();
  }

  function validateAndUpdateSettings(partial){
    const prev = Object.assign({}, state.settings);
    Object.assign(state.settings, partial || {});
    // Clamp values
    state.settings.size = Math.max(128, Math.min(1024, Number(state.settings.size) || 320));
    state.settings.margin = Math.max(0, Math.min(64, Number(state.settings.margin) || 16));
    state.settings.colorDark = window.AppUtil.normalizeHex(state.settings.colorDark, '#0f172a');
    state.settings.colorLight = window.AppUtil.normalizeHex(state.settings.colorLight, '#ffffff');

    // Contrast hint
    try {
      const cd = state.settings.colorDark.replace('#','');
      const cl = state.settings.colorLight.replace('#','');
      const r1 = parseInt(cd.substr(0,2),16), g1 = parseInt(cd.substr(2,2),16), b1 = parseInt(cd.substr(4,2),16);
      const r2 = parseInt(cl.substr(0,2),16), g2 = parseInt(cl.substr(2,2),16), b2 = parseInt(cl.substr(4,2),16);
      const lum = function(r,g,b){ r/=255; g/=255; b/=255; const a=[r,g,b].map(v=> v<=0.03928? v/12.92: Math.pow((v+0.055)/1.055,2.4)); return 0.2126*a[0] + 0.7152*a[1] + 0.0722*a[2]; };
      const L1 = lum(r1,g1,b1)+0.05; const L2 = lum(r2,g2,b2)+0.05; const ratio = L1>L2? (L1/L2):(L2/L1);
      if(ratio < 4.5){ setStatus('Low contrast. Consider darker foreground or lighter background.'); } else { setStatus(''); }
    } catch(e) {}

    // Persist settings only when something changed
    if(JSON.stringify(prev) !== JSON.stringify(state.settings)){
      window.AppStorage.saveSettings(state.settings);
    }
  }

  function bindEvents(){
    const debouncedGenerate = window.AppUtil.debounce(function(){ generateIfReady(); }, 180);

    $('#qrText').on('input', function(){
      validateAndUpdateSettings({ text: $(this).val().trim() });
      debouncedGenerate();
    });
    $('#size').on('input change', function(){
      const v = Number($(this).val());
      $('#sizeValue').text(String(v));
      validateAndUpdateSettings({ size: v });
      debouncedGenerate();
    });
    $('#margin').on('input change', function(){
      const v = Number($(this).val());
      $('#marginValue').text(String(v));
      validateAndUpdateSettings({ margin: v });
    });
    $('#ecLevel').on('change', function(){
      validateAndUpdateSettings({ ecLevel: $(this).val() });
      debouncedGenerate();
    });
    $('#colorDark').on('input change', function(){
      validateAndUpdateSettings({ colorDark: $(this).val() });
      debouncedGenerate();
    });
    $('#colorLight').on('input change', function(){
      const v = $(this).val();
      validateAndUpdateSettings({ colorLight: v });
      // Update preview card immediately
      const _pc = document.getElementById('qrPreviewCard'); if (_pc) _pc.style.setProperty('--qr-bg', v);
      debouncedGenerate();
    });

    $('#logoInput').on('change', function(e){
      const file = e.target.files && e.target.files[0];
      if(!file){ validateAndUpdateSettings({ logoDataURL: null }); $('#logoOverlay').hide(); return; }
      window.AppUtil.fileToDataURL(file).then(function(url){
        validateAndUpdateSettings({ logoDataURL: url });
        $('#logoOverlay').attr('src', url).show();
        generateIfReady();
      }).catch(function(){ setStatus('Could not read logo file'); });
    });

    $('#removeLogo').on('click', function(){
      $('#logoInput').val('');
      validateAndUpdateSettings({ logoDataURL: null });
      $('#logoOverlay').hide();
      generateIfReady();
    });

    $('#btnGenerate').on('click', function(){ generateIfReady(); });

    $('#btnDownload').on('click', function(){
      const canvas = getCanvas();
      if(!canvas) { setStatus('Nothing to download yet'); return; }
      const s = state.settings;
      window.AppUtil.downloadCanvas(canvas, 'mint-qr.png', { margin: s.margin, bg: s.colorLight, logo: s.logoDataURL, logoScale: 0.2 }).catch(function(){ setStatus('Download failed'); });
    });

    $('#btnCopy').on('click', function(){
      const canvas = getCanvas();
      if(!canvas) { setStatus('Nothing to copy yet'); return; }
      const s = state.settings;
      window.AppUtil.copyCanvasToClipboard(canvas, { margin: s.margin, bg: s.colorLight, logo: s.logoDataURL, logoScale: 0.2 }).then(function(){ setStatus('Copied to clipboard'); setTimeout(function(){ setStatus(''); }, 1200); }).catch(function(){ setStatus('Clipboard not available'); });
    });

    $('#btnSave').on('click', function(){
      const canvas = getCanvas();
      if(!canvas) { setStatus('Nothing to save yet'); return; }
      const s = state.settings;
      // Create a small thumbnail
      window.AppUtil.composeCanvas(canvas, { margin: s.margin, bg: s.colorLight, logo: s.logoDataURL, logoScale: 0.2 }).then(function(full){
        const thumbSide = 160;
        const thumb = document.createElement('canvas');
        thumb.width = thumbSide; thumb.height = thumbSide;
        const ctx = thumb.getContext('2d');
        ctx.fillStyle = s.colorLight; ctx.fillRect(0,0,thumbSide,thumbSide);
        ctx.drawImage(full, 0,0, thumbSide, thumbSide);
        const data = thumb.toDataURL('image/png');
        const item = { id: Date.now(), preview: data, settings: Object.assign({}, s), label: (s.text || '').slice(0, 60) };
        const list = window.AppStorage.addHistory(item);
        renderHistory(list);
        setStatus('Saved'); setTimeout(function(){ setStatus(''); }, 800);
      });
    });

    $('#clearHistory').on('click', function(){
      window.AppStorage.clearHistory();
      renderHistory([]);
    });

    $('#btnShare').on('click', function(){
      const s = btoa(unescape(encodeURIComponent(JSON.stringify(state.settings))));
      const link = location.origin + location.pathname.replace(/[^\/]+$/, '') + 'app.html?s=' + s;
      if(navigator.clipboard){ navigator.clipboard.writeText(link).then(function(){ setStatus('Share link copied'); setTimeout(function(){ setStatus(''); }, 1200); }).catch(function(){ setStatus('Could not copy link'); }); }
      else { window.prompt('Copy this link:', link); }
    });
  }

  function renderHistory(list){
    const $list = $('#historyList').empty();
    if(!list || !list.length){
      $list.append($('<div class="col-span-2 sm:col-span-3 text-xs text-neutral-500">No items yet</div>'));
      return;
    }
    list.forEach(function(item, idx){
      const el = $(`
        <div class="group relative">
          <div class="thumb">
            <img alt="QR preview ${idx+1}" src="${item.preview}"/>
          </div>
          <div class="mt-2 flex items-center justify-between">
            <div class="truncate text-xs text-neutral-600 max-w-[9rem]" title="${$('<div>').text(item.label).html()}">${$('<div>').text(item.label || 'Saved').html()}</div>
            <div class="flex items-center gap-2">
              <button type="button" class="text-xs text-neutral-600 hover:text-neutral-900 underline action-load">Load</button>
              <button type="button" class="text-xs text-neutral-600 hover:text-neutral-900 underline action-del">Delete</button>
            </div>
          </div>
        </div>
      `);
      el.find('.action-load').on('click', function(){
        state.settings = Object.assign({}, item.settings);
        applyControlsFromSettings();
        generateIfReady();
      });
      el.find('.action-del').on('click', function(){
        const all = window.AppStorage.getHistory().filter(h => h.id !== item.id);
        localStorage.setItem('mintqr.history.v1', JSON.stringify(all));
        renderHistory(all);
      });
      $list.append(el);
    });
  }

  function readSettingsFromQuery(){
    const params = new URLSearchParams(location.search);
    const s = params.get('s');
    if(!s) return null;
    try {
      const json = decodeURIComponent(escape(atob(s)));
      const parsed = JSON.parse(json);
      return parsed;
    } catch(e){ return null; }
  }

  // Public API
  window.App.init = function(){
    // Load vendor QR library dynamically
    window.AppUtil.loadScript('https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js', 'vendor-qrcode')
      .then(function(){ state.vendorReady = true; generateIfReady(); })
      .catch(function(){ console.error('QR vendor failed to load'); setStatus('QR engine failed to load'); });

    // Load settings priority: query -> storage -> defaults
    const fromQuery = readSettingsFromQuery();
    const fromStore = window.AppStorage.loadSettings();
    if(fromQuery){ state.settings = Object.assign(state.settings, fromQuery); }
    else if(fromStore){ state.settings = Object.assign(state.settings, fromStore); }

    applyControlsFromSettings();

    bindEvents();

    // Render history
    renderHistory(window.AppStorage.getHistory());
  };

  window.App.render = function(){
    // Initial generate if text exists once vendor is ready
    generateIfReady();
  };

})();