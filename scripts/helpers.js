/* Helpers, utilities, storage, and dynamic vendor loader for Mint QR */
(function(){
  'use strict';

  // Namespaces
  window.AppUtil = window.AppUtil || {};
  window.AppStorage = window.AppStorage || {};

  // Debounce utility
  window.AppUtil.debounce = function(fn, wait){
    let t;
    return function(){
      const ctx = this; const args = arguments;
      clearTimeout(t);
      t = setTimeout(function(){ fn.apply(ctx, args); }, wait || 200);
    };
  };

  // Safe hex normalization
  window.AppUtil.normalizeHex = function(hex, fallback){
    if(!hex) return fallback || '#000000';
    let h = String(hex).trim();
    if(h[0] !== '#') h = '#' + h;
    if(h.length === 4) {
      // #rgb to #rrggbb
      h = '#' + h[1]+h[1]+h[2]+h[2]+h[3]+h[3];
    }
    const ok = /^#([0-9a-fA-F]{6})$/.test(h);
    return ok ? h.toLowerCase() : (fallback || '#000000');
  };

  // Read file to data URL
  window.AppUtil.fileToDataURL = function(file){
    return new Promise(function(resolve, reject){
      if(!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = function(){ resolve(reader.result); };
      reader.onerror = function(e){ reject(e); };
      reader.readAsDataURL(file);
    });
  };

  // Load external script dynamically once
  window.AppUtil.loadScript = function(url, id){
    return new Promise(function(resolve, reject){
      if(id && document.getElementById(id)) return resolve();
      const s = document.createElement('script');
      if(id) s.id = id;
      s.src = url;
      s.async = true;
      s.onload = function(){ resolve(); };
      s.onerror = function(){ reject(new Error('Failed to load ' + url)); };
      document.head.appendChild(s);
    });
  };

  // Compose exportable canvas with extra margin and optional logo overlay
  window.AppUtil.composeCanvas = function(srcCanvas, opts){
    opts = opts || {};
    const margin = Math.max(0, Number(opts.margin) || 0);
    const bg = window.AppUtil.normalizeHex(opts.bg || '#ffffff', '#ffffff');
    const logo = opts.logo; // dataURL
    const size = { w: srcCanvas.width, h: srcCanvas.height };
    const out = document.createElement('canvas');
    out.width = size.w + margin * 2;
    out.height = size.h + margin * 2;
    const ctx = out.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(srcCanvas, margin, margin);

    return new Promise(function(resolve){
      if(!logo){ return resolve(out); }
      const img = new Image();
      img.onload = function(){
        const scale = Math.max(0.12, Math.min(0.28, Number(opts.logoScale) || 0.2));
        const target = Math.floor(size.w * scale);
        const x = Math.floor((out.width - target) / 2);
        const y = Math.floor((out.height - target) / 2);
        // Optional white padding behind logo for contrast
        const pad = Math.max(4, Math.floor(target * 0.08));
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.roundRect(x - pad, y - pad, target + pad*2, target + pad*2, Math.min(12, pad));
        ctx.fill();
        ctx.drawImage(img, x, y, target, target);
        resolve(out);
      };
      img.onerror = function(){ resolve(out); };
      img.src = logo;
    });
  };

  // Download canvas as PNG
  window.AppUtil.downloadCanvas = function(canvas, filename, opts){
    return window.AppUtil.composeCanvas(canvas, opts).then(function(out){
      return new Promise(function(resolve){
        out.toBlob(function(blob){
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = filename || 'qr.png';
          document.body.appendChild(a);
          a.click();
          setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); resolve(true); }, 100);
        }, 'image/png');
      });
    });
  };

  // Copy canvas image to clipboard if supported
  window.AppUtil.copyCanvasToClipboard = function(canvas, opts){
    return window.AppUtil.composeCanvas(canvas, opts).then(function(out){
      if(!navigator.clipboard || !window.ClipboardItem){
        return Promise.reject(new Error('Clipboard not supported'));
      }
      return new Promise(function(resolve, reject){
        out.toBlob(function(blob){
          if(!blob) return reject(new Error('Copy failed'));
          const item = new window.ClipboardItem({ 'image/png': blob });
          navigator.clipboard.write([item]).then(resolve).catch(reject);
        }, 'image/png');
      });
    });
  };

  // Local storage helpers
  const KEY_SETTINGS = 'mintqr.settings.v1';
  const KEY_HISTORY = 'mintqr.history.v1';

  window.AppStorage.saveSettings = function(settings){
    try { localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings)); } catch(e) {}
  };
  window.AppStorage.loadSettings = function(){
    try {
      const raw = localStorage.getItem(KEY_SETTINGS);
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  };
  window.AppStorage.addHistory = function(item){
    try {
      const list = window.AppStorage.getHistory();
      list.unshift(item);
      const capped = list.slice(0, 30);
      localStorage.setItem(KEY_HISTORY, JSON.stringify(capped));
      return capped;
    } catch(e) { return []; }
  };
  window.AppStorage.getHistory = function(){
    try { return JSON.parse(localStorage.getItem(KEY_HISTORY) || '[]'); } catch(e) { return []; }
  };
  window.AppStorage.clearHistory = function(){
    try { localStorage.removeItem(KEY_HISTORY); } catch(e) {}
  };

  // Accessibility: rounded rect polyfill for older canvases
  if(CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect){
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r){
      const rr = Array.isArray(r) ? r : [r,r,r,r];
      this.beginPath();
      this.moveTo(x + rr[0], y);
      this.lineTo(x + w - rr[1], y);
      this.quadraticCurveTo(x + w, y, x + w, y + rr[1]);
      this.lineTo(x + w, y + h - rr[2]);
      this.quadraticCurveTo(x + w, y + h, x + w - rr[2], y + h);
      this.lineTo(x + rr[3], y + h);
      this.quadraticCurveTo(x, y + h, x, y + h - rr[3]);
      this.lineTo(x, y + rr[0]);
      this.quadraticCurveTo(x, y, x + rr[0], y);
      this.closePath();
      return this;
    };
  }

})();