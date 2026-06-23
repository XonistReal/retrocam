import '../src/styles/index.css';
import { getState, setState, subscribe, pushHistory, undo, redo } from './js/state.js';
import { CATEGORIES, PRESETS } from './js/presets.js';
import { applyEffects, applyJPEGCompression, applyBlur, applySharpen } from './js/effects.js';

const $ = id => document.getElementById(id);
const splash = $('splash-screen');
const shell = $('app-shell');
const emptyState = $('empty-state');
const canvasContainer = $('canvas-container');
const mainCanvas = $('main-canvas');
const ctx = mainCanvas.getContext('2d', { willReadFrequently: true });
const fileInput = $('file-input');
const cameraFileInput = $('camera-file-input');
const categoryPills = $('category-pills');
const presetGrid = $('preset-grid');
const intensityBar = $('intensity-bar');
const intensitySlider = $('intensity-slider');
const intensityValue = $('intensity-value');
const adjustSliders = $('adjust-sliders');
const toolsGrid = $('tools-grid');
const sidePanel = $('side-panel');

const STOCK_IMAGE_URL = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=256&h=256&auto=format&fit=crop';
const MOBILE_DEVICE_RE = /Android|iPhone|iPad|iPod/i;
const isMobileDevice = () => MOBILE_DEVICE_RE.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
let stockImage = null;

window.addEventListener('DOMContentLoaded', () => {
  syncViewportMetrics();
  registerServiceWorker();
  setTimeout(() => {
    splash.classList.add('fade-out');
    shell.classList.remove('hidden');
    setTimeout(() => splash.remove(), 600);
  }, 1500);
  buildCategories();
  buildPresetGrid();
  buildAdjustPanel();
  buildToolsPanel();
  bindEvents();
  loadStockImage();
});

window.addEventListener('resize', syncViewportMetrics);
window.addEventListener('orientationchange', syncViewportMetrics);
window.visualViewport?.addEventListener('resize', syncViewportMetrics);

function syncViewportMetrics() {
  const height = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${Math.round(height)}px`);
}

function createWorkCanvas(width, height) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  if (typeof OffscreenCanvas === 'function') {
    return new OffscreenCanvas(w, h);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime });
}

function canvasToBlob(canvas, type = 'image/png', quality) {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type, quality });
  }

  if (typeof canvas.toBlob === 'function') {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas export failed'));
      }, type, quality);
    });
  }

  return Promise.resolve(dataUrlToBlob(canvas.toDataURL(type, quality)));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function canvasToDataUrl(canvas, type, quality) {
  if (typeof canvas.toDataURL === 'function') {
    return canvas.toDataURL(type, quality);
  }

  return blobToDataUrl(await canvasToBlob(canvas, type, quality));
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('Service worker registration failed', err);
    });
  });
}

async function loadStockImage() {
  const img = new Image();
  img.crossOrigin = 'Anonymous';
  img.onload = () => {
    stockImage = img;
    if (!getState().imageLoaded) generateThumbnails(PRESETS);
  };
  img.src = STOCK_IMAGE_URL;
}

function loadImageFromFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      setState({ originalImage: img, imageLoaded: true });
      initCanvas(img);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function initCanvas(img) {
  const maxDim = 1200;
  let w = img.width, h = img.height;
  if (w > maxDim || h > maxDim) {
    const ratio = Math.min(maxDim / w, maxDim / h);
    w = Math.round(w * ratio); h = Math.round(h * ratio);
  }
  mainCanvas.width = w; mainCanvas.height = h;
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  setState({ currentImageData: imageData });
  pushHistory(imageData);
  emptyState.classList.add('hidden');
  canvasContainer.classList.remove('hidden');
  showToast('Photo loaded!');
}

function renderCanvas(imageData) {
  if (!imageData) return;
  ctx.putImageData(imageData, 0, 0);
}

let applyTimeout = null;
function scheduleApply() {
  clearTimeout(applyTimeout);
  applyTimeout = setTimeout(() => applyAll(), 50);
}

async function applyAll() {
  const state = getState();
  if (!state.imageLoaded || !state.history[0]) return;
  const original = state.history[0];
  let data = new ImageData(new Uint8ClampedArray(original.data), original.width, original.height);
  const preset = state.activePreset ? PRESETS.find(p => p.id === state.activePreset) : null;
  const fx = { ...state.adjustments };
  if (preset) {
    for (const [k, v] of Object.entries(preset.fx)) {
      fx[k] = (fx[k] || 0) + v * (state.presetIntensity / 100);
    }
  }
  if (fx.sharpness > 0) data = applySharpen(data, fx.sharpness);
  if (fx.sharpness < 0 || fx.blur > 0) data = applyBlur(data, Math.abs(fx.sharpness || 0) / 5 + (fx.blur || 0) / 3);
  data = applyEffects(data, fx, 100);
  if (fx.jpegQ) {
    ctx.putImageData(data, 0, 0);
    data = await applyJPEGCompression(mainCanvas, fx.jpegQ, fx.jpegPasses || 1);
  }
  setState({ currentImageData: data });
  renderCanvas(data);
}

function buildCategories() {
  categoryPills.innerHTML = CATEGORIES.map(c =>
    `<button class="cat-pill${c.id === 'all' ? ' active' : ''}" data-cat="${c.id}">${c.icon} ${c.label}</button>`
  ).join('');

  // Drag to scroll logic
  let isDown = false;
  let startX;
  let scrollLeft;

  categoryPills.addEventListener('mousedown', (e) => {
    isDown = true;
    categoryPills.classList.add('active');
    startX = e.pageX - categoryPills.offsetLeft;
    scrollLeft = categoryPills.scrollLeft;
  });
  categoryPills.addEventListener('mouseleave', () => {
    isDown = false;
  });
  categoryPills.addEventListener('mouseup', () => {
    isDown = false;
  });
  categoryPills.addEventListener('mousemove', (e) => {
    if(!isDown) return;
    e.preventDefault();
    const x = e.pageX - categoryPills.offsetLeft;
    const walk = (x - startX) * 2; // scroll-fast
    categoryPills.scrollLeft = scrollLeft - walk;
  });

  categoryPills.addEventListener('click', e => {
    const pill = e.target.closest('.cat-pill');
    if (!pill) return;
    categoryPills.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    setState({ activeCategory: pill.dataset.cat });
    filterPresets();
  });
}

function buildPresetGrid() { renderPresets(PRESETS); }

function renderPresets(list) {
  presetGrid.querySelectorAll('[data-thumb-url]').forEach(card => URL.revokeObjectURL(card.dataset.thumbUrl));
  presetGrid.innerHTML = list.map(p => {
    const cat = CATEGORIES.find(c => c.id === p.cat);
    return `<div class="preset-card" data-id="${p.id}" title="${p.name}">
      <div class="preset-card-label">${p.name}</div>
      <div class="preset-card-icon">${cat ? cat.icon : '✨'}</div>
    </div>`;
  }).join('');
  if (getState().imageLoaded) generateThumbnails(list);
}

function generateThumbnails(list) {
  const state = getState();
  const original = state.imageLoaded ? state.history[0] : stockImage;
  if (!original) return;

  const thumbSize = 80;
  let tw, th;
  
  if (state.imageLoaded) {
    const ratio = Math.min(thumbSize / original.width, thumbSize / original.height);
    tw = Math.round(original.width * ratio);
    th = Math.round(original.height * ratio);
  } else {
    tw = thumbSize; th = thumbSize;
  }

  list.forEach(async preset => {
    const card = presetGrid.querySelector(`[data-id="${preset.id}"]`);
    if (!card) return;
    try {
      const smallData = downscaleImageData(original, tw, th);
      const result = applyEffects(smallData, preset.fx, 100);
      const oc = createWorkCanvas(tw, th);
      oc.getContext('2d').putImageData(result, 0, 0);
      const blob = await canvasToBlob(oc, 'image/jpeg', 0.7);
      const url = URL.createObjectURL(blob);
      if (card.dataset.thumbUrl) URL.revokeObjectURL(card.dataset.thumbUrl);
      card.dataset.thumbUrl = url;
      card.style.backgroundImage = `url(${url})`;
      card.style.backgroundSize = 'cover';
      card.style.backgroundPosition = 'center';
    } catch(e) { console.warn('Thumbnail err', e); }
  });
}

function downscaleImageData(source, tw, th) {
  const oc = createWorkCanvas(tw, th);
  const ctx = oc.getContext('2d');
  
  if (source instanceof ImageData) {
    const tempOc = createWorkCanvas(source.width, source.height);
    tempOc.getContext('2d').putImageData(source, 0, 0);
    ctx.drawImage(tempOc, 0, 0, tw, th);
  } else {
    // Handle HTMLImageElement (stockImage)
    ctx.drawImage(source, 0, 0, tw, th);
  }
  
  return ctx.getImageData(0, 0, tw, th);
}

function filterPresets() {
  const state = getState();
  const search = ($('preset-search')?.value || '').toLowerCase();
  let filtered = PRESETS;
  if (state.activeCategory !== 'all') filtered = filtered.filter(p => p.cat === state.activeCategory);
  if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search));
  renderPresets(filtered);
}

let crushBase = null;

function buildAdjustPanel() {
  const items = [
    { key:'brightness', label:'Brightness', min:-100, max:100 },
    { key:'contrast', label:'Contrast', min:-100, max:100 },
    { key:'exposure', label:'Exposure', min:-100, max:100 },
    { key:'saturation', label:'Saturation', min:-100, max:100 },
    { key:'vibrance', label:'Vibrance', min:-100, max:100 },
    { key:'temperature', label:'Temperature', min:-100, max:100 },
    { key:'tint', label:'Tint', min:-100, max:100 },
    { key:'highlights', label:'Highlights', min:-100, max:100 },
    { key:'shadows', label:'Shadows', min:-100, max:100 },
    { key:'sharpness', label:'Sharpness', min:-50, max:50 },
    { key:'blur', label:'Blur', min:0, max:50 },
    { key:'vignette', label:'Vignette', min:0, max:100 },
    { key:'grain', label:'Grain', min:0, max:100 },
    { key:'fade', label:'Fade', min:0, max:100 },
    { key:'pixelCrush', label:'Pixel Crush', min:0, max:95 },
  ];
  adjustSliders.innerHTML = items.map(it => `
    <div class="adjust-item">
      <div class="adjust-item-header">
        <label>${it.label}</label>
        <span id="adj-val-${it.key}">0</span>
        <button data-reset="${it.key}" title="Reset">↺</button>
      </div>
      <input type="range" min="${it.min}" max="${it.max}" value="0" data-adj="${it.key}" />
    </div>
  `).join('');

  adjustSliders.addEventListener('mousedown', e => {
    const key = e.target.dataset.adj;
    if (key === 'pixelCrush') crushBase = getState().currentImageData;
  });
  adjustSliders.addEventListener('touchstart', e => {
    const key = e.target.dataset.adj;
    if (key === 'pixelCrush') crushBase = getState().currentImageData;
  });

  adjustSliders.addEventListener('input', e => {
    const slider = e.target.closest('[data-adj]');
    if (!slider) return;
    const key = slider.dataset.adj, val = parseInt(slider.value);
    
    if (key === 'pixelCrush') {
      if (!crushBase) crushBase = getState().currentImageData;
      performPixelCrush(val, crushBase);
      $(`adj-val-${key}`).textContent = val;
      return;
    }

    setState({ adjustments: { ...getState().adjustments, [key]: val } });
    $(`adj-val-${key}`).textContent = val;
    scheduleApply();
  });

  adjustSliders.addEventListener('change', e => {
    const key = e.target.dataset.adj;
    if (key === 'pixelCrush') {
      pushHistory(getState().currentImageData);
      crushBase = null;
    }
  });

  adjustSliders.addEventListener('click', e => {
    const btn = e.target.closest('[data-reset]');
    if (!btn) return;
    const key = btn.dataset.reset;
    adjustSliders.querySelector(`[data-adj="${key}"]`).value = 0;
    setState({ adjustments: { ...getState().adjustments, [key]: 0 } });
    $(`adj-val-${key}`).textContent = 0;
  });
}

function performPixelCrush(val, source) {
  if (!source) return;
  const w = source.width, h = source.height;
  
  if (val <= 0) {
    mainCanvas.width = w; mainCanvas.height = h;
    renderCanvas(source);
    setState({ currentImageData: source });
    return;
  }
  
  const factor = 1 - (val / 100);
  const nw = Math.max(10, Math.round(w * factor));
  const nh = Math.max(10, Math.round(h * factor));
  
  // Step 1: Downscale to tiny resolution
  const smallOc = createWorkCanvas(nw, nh);
  const smallCtx = smallOc.getContext('2d');
  const src = createWorkCanvas(w, h);
  src.getContext('2d').putImageData(source, 0, 0);
  smallCtx.drawImage(src, 0, 0, nw, nh);
  
  // Step 2: Upscale back to original resolution with nearest-neighbor
  const bigOc = createWorkCanvas(w, h);
  const bigCtx = bigOc.getContext('2d');
  bigCtx.imageSmoothingEnabled = false;
  bigCtx.msImageSmoothingEnabled = false;
  bigCtx.webkitImageSmoothingEnabled = false;
  bigCtx.drawImage(smallOc, 0, 0, nw, nh, 0, 0, w, h);
  
  const nd = bigCtx.getImageData(0, 0, w, h);
  mainCanvas.width = w; mainCanvas.height = h;
  renderCanvas(nd);
  setState({ currentImageData: nd });
  
  // Update base image for non-destructive effects
  const state_ = getState();
  const newHistory = [...state_.history];
  newHistory[0] = nd; // Set as the new base
  setState({ history: newHistory });
}

function buildToolsPanel() {
  const tools = [
    { id:'crop', label:'Crop', icon:'✂️' },
    { id:'rotate-cw', label:'Rotate →', icon:'↻' },
    { id:'rotate-ccw', label:'Rotate ←', icon:'↺' },
    { id:'flip-h', label:'Flip H', icon:'↔️' },
    { id:'flip-v', label:'Flip V', icon:'↕️' },
    { id:'timestamp', label:'Date Stamp', icon:'📅' },
    { id:'border', label:'Film Border', icon:'🖼️' },
  ];
  toolsGrid.innerHTML = tools.map(t =>
    `<button class="tool-btn" data-tool="${t.id}"><span style="font-size:20px">${t.icon}</span>${t.label}</button>`
  ).join('');
  toolsGrid.addEventListener('click', e => {
    const btn = e.target.closest('.tool-btn');
    if (btn) handleTool(btn.dataset.tool);
  });
}

function handleTool(tool) {
  const state = getState();
  if (!state.imageLoaded) { showToast('Load a photo first'); return; }
  const data = state.currentImageData;
  const w = data.width, h = data.height;

  if (tool === 'crop') {
    startCrop();
  } else if (tool === 'rotate-cw' || tool === 'rotate-ccw') {
    const oc = createWorkCanvas(h, w);
    const octx = oc.getContext('2d');
    const src = createWorkCanvas(w, h);
    src.getContext('2d').putImageData(data, 0, 0);
    octx.translate(tool === 'rotate-cw' ? h : 0, tool === 'rotate-cw' ? 0 : w);
    octx.rotate(tool === 'rotate-cw' ? Math.PI / 2 : -Math.PI / 2);
    octx.drawImage(src, 0, 0);
    mainCanvas.width = h; mainCanvas.height = w;
    const nd = octx.getImageData(0, 0, h, w);
    setState({ currentImageData: nd }); 
    const newHist = [...getState().history]; newHist[0] = nd;
    setState({ history: newHist });
    pushHistory(nd); renderCanvas(nd);
  } else if (tool === 'flip-h' || tool === 'flip-v') {
    const oc = createWorkCanvas(w, h);
    const octx = oc.getContext('2d');
    const src = createWorkCanvas(w, h);
    src.getContext('2d').putImageData(data, 0, 0);
    if (tool === 'flip-h') { octx.translate(w, 0); octx.scale(-1, 1); }
    else { octx.translate(0, h); octx.scale(1, -1); }
    octx.drawImage(src, 0, 0);
    const nd = octx.getImageData(0, 0, w, h);
    setState({ currentImageData: nd });
    const newHist_ = [...getState().history]; newHist_[0] = nd;
    setState({ history: newHist_ });
    pushHistory(nd); renderCanvas(nd);
  } else if (tool === 'timestamp') {
    const oc = createWorkCanvas(w, h);
    const octx = oc.getContext('2d');
    octx.putImageData(data, 0, 0);
    const fs = Math.max(14, Math.floor(w / 20));
    octx.font = `${fs}px "VT323", monospace`;
    octx.fillStyle = '#ff6600cc';
    octx.textAlign = 'right';
    const now = new Date();
    octx.fillText(`'${String(now.getFullYear()).slice(2)} ${String(now.getMonth()+1).padStart(2,'0')} ${String(now.getDate()).padStart(2,'0')}`, w - fs * 0.5, h - fs * 0.5);
    const nd = octx.getImageData(0, 0, w, h);
    setState({ currentImageData: nd }); pushHistory(nd); renderCanvas(nd);
    showToast('Date stamp added!');
  } else if (tool === 'border') {
    addBorder();
  } else {
    showToast(`${tool} coming soon!`);
  }
}

let cropActive = false;
function startCrop() {
  if (cropActive) return;
  cropActive = true;
  showToast('Drag to select area to crop');
  
  const overlay = document.createElement('div');
  overlay.id = 'crop-overlay';
  overlay.style.cssText = 'position:absolute; inset:0; border:2px dashed var(--accent); background:rgba(0,0,0,0.3); z-index:20; cursor:crosshair; touch-action:none;';
  canvasContainer.appendChild(overlay);

  let startX, startY, currentX, currentY;
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute; border:2px solid var(--accent); background:rgba(255,149,0,0.1); display:none;';
  overlay.appendChild(box);

  const getPoint = e => {
    const point = e.touches?.[0] || e.changedTouches?.[0] || e;
    return { x: point.clientX, y: point.clientY };
  };

  const onDown = e => {
    e.preventDefault();
    const rect = overlay.getBoundingClientRect();
    const point = getPoint(e);
    startX = point.x - rect.left;
    startY = point.y - rect.top;
    currentX = startX;
    currentY = startY;
    box.style.display = 'block';
  };

  const onMove = e => {
    if (startX === undefined) return;
    e.preventDefault();
    const rect = overlay.getBoundingClientRect();
    const point = getPoint(e);
    currentX = point.x - rect.left;
    currentY = point.y - rect.top;
    
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const width = Math.abs(startX - currentX);
    const height = Math.abs(startY - currentY);
    
    box.style.left = x + 'px';
    box.style.top = y + 'px';
    box.style.width = width + 'px';
    box.style.height = height + 'px';
  };

  const onUp = () => {
    if (startX !== undefined && currentX !== undefined) {
      const rect = overlay.getBoundingClientRect();
      const scaleX = mainCanvas.width / rect.width;
      const scaleY = mainCanvas.height / rect.height;
      
      const x = Math.min(startX, currentX) * scaleX;
      const y = Math.min(startY, currentY) * scaleY;
      const width = Math.abs(startX - currentX) * scaleX;
      const height = Math.abs(startY - currentY) * scaleY;
      
      if (width > 10 && height > 10) {
        performCrop(x, y, width, height);
      }
    }
    
    overlay.remove();
    cropActive = false;
  };

  overlay.addEventListener('mousedown', onDown);
  overlay.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp, { once: true });
  overlay.addEventListener('touchstart', onDown, { passive: false });
  overlay.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onUp, { once: true });
}

function performCrop(x, y, w, h) {
  x = Math.max(0, Math.floor(x));
  y = Math.max(0, Math.floor(y));
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));

  const oc = createWorkCanvas(w, h);
  const octx = oc.getContext('2d');
  octx.drawImage(mainCanvas, x, y, w, h, 0, 0, w, h);
  
  mainCanvas.width = w;
  mainCanvas.height = h;
  const nd = octx.getImageData(0, 0, w, h);
  setState({ currentImageData: nd });
  const newHist = [...getState().history]; newHist[0] = nd;
  setState({ history: newHist });
  pushHistory(nd);
  renderCanvas(nd);
  showToast('Cropped!');
}

function addBorder() {
  const state = getState();
  const data = state.currentImageData;
  const w = data.width, h = data.height;
  const borderSize = Math.max(20, Math.floor(w * 0.05));
  
  const oc = createWorkCanvas(w + borderSize * 2, h + borderSize * 2);
  const octx = oc.getContext('2d');
  
  // White film border
  octx.fillStyle = '#fff';
  octx.fillRect(0, 0, oc.width, oc.height);
  
  // Inner shadow/border
  octx.strokeStyle = '#ddd';
  octx.lineWidth = 1;
  octx.strokeRect(borderSize - 1, borderSize - 1, w + 2, h + 2);
  
  const src = createWorkCanvas(w, h);
  src.getContext('2d').putImageData(data, 0, 0);
  octx.drawImage(src, borderSize, borderSize);
  
  mainCanvas.width = oc.width;
  mainCanvas.height = oc.height;
  const nd = octx.getImageData(0, 0, oc.width, oc.height);
  setState({ currentImageData: nd });
  const newHist = [...getState().history]; newHist[0] = nd;
  setState({ history: newHist });
  pushHistory(nd);
  renderCanvas(nd);
  showToast('Film border added!');
}

function bindEvents() {
  $('btn-upload-empty')?.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => { if (e.target.files[0]) loadImageFromFile(e.target.files[0]); });
  cameraFileInput?.addEventListener('change', e => {
    if (e.target.files[0]) {
      loadImageFromFile(e.target.files[0]);
      closeCamera();
    }
  });
  
  // Menu
  $('btn-menu')?.addEventListener('click', () => $('menu-modal').classList.remove('hidden'));
  $('btn-menu-close')?.addEventListener('click', () => $('menu-modal').classList.add('hidden'));
  $('menu-modal')?.querySelector('.modal-backdrop')?.addEventListener('click', () => $('menu-modal').classList.add('hidden'));

  $('btn-camera-empty')?.addEventListener('click', openCamera);
  $('btn-camera-nav')?.addEventListener('click', openCamera);
  $('btn-camera-close')?.addEventListener('click', closeCamera);
  $('btn-camera-flip')?.addEventListener('click', flipCamera);
  $('btn-camera-capture')?.addEventListener('click', capturePhoto);

  presetGrid.addEventListener('click', e => {
    const card = e.target.closest('.preset-card');
    if (!card) return;
    if (!getState().imageLoaded) { showToast('Load a photo first'); return; }
    const id = card.dataset.id;
    presetGrid.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));
    if (getState().activePreset === id) {
      setState({ activePreset: null }); intensityBar.classList.add('hidden');
    } else {
      card.classList.add('active');
      setState({ activePreset: id, presetIntensity: 100 });
      intensityBar.classList.remove('hidden');
      intensitySlider.value = 100; intensityValue.textContent = '100%';
    }
    scheduleApply();
  });

  intensitySlider.addEventListener('input', () => {
    const v = parseInt(intensitySlider.value);
    intensityValue.textContent = v + '%';
    setState({ presetIntensity: v }); scheduleApply();
  });

  $('preset-search')?.addEventListener('input', filterPresets);

  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => switchPanel(tab.dataset.panel));
  });

  document.querySelectorAll('.nav-btn[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.action;
      if (a === 'camera') { openCamera(); return; }
      if (a === 'export') { openExportModal(); return; }
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchPanel(a); sidePanel.classList.toggle('open', true);
    });
  });

  $('btn-undo')?.addEventListener('click', () => { const d = undo(); if (d) renderCanvas(d); });
  $('btn-redo')?.addEventListener('click', () => { const d = redo(); if (d) renderCanvas(d); });
  subscribe('history', ({ canUndo, canRedo }) => {
    $('btn-undo').disabled = !canUndo; $('btn-redo').disabled = !canRedo;
  });

  $('btn-compare')?.addEventListener('click', () => {
    const s = getState();
    if (!s.imageLoaded) return;
    if (s.compareMode) { renderCanvas(s.currentImageData); setState({ compareMode: false }); }
    else { renderCanvas(s.history[0]); setState({ compareMode: true }); showToast('Showing original'); }
  });

  $('btn-export')?.addEventListener('click', openExportModal);
  $('btn-export-close')?.addEventListener('click', () => $('export-modal').classList.add('hidden'));
  $('export-modal')?.querySelector('.modal-backdrop')?.addEventListener('click', () => $('export-modal').classList.add('hidden'));
  $('btn-download')?.addEventListener('click', showSaveModal);
  $('btn-save-close')?.addEventListener('click', () => $('save-modal').classList.add('hidden'));
  $('save-modal')?.querySelector('.modal-backdrop')?.addEventListener('click', () => $('save-modal').classList.add('hidden'));

  document.querySelectorAll('.export-radio input').forEach(r => {
    r.addEventListener('change', () => {
      document.querySelectorAll('.export-radio').forEach(l => l.classList.remove('active'));
      r.closest('.export-radio').classList.add('active');
      $('quality-group').style.display = r.value === 'png' ? 'none' : '';
    });
  });
  $('export-quality')?.addEventListener('input', () => {
    $('export-quality-value').textContent = $('export-quality').value + '%';
  });

  $('canvas-area')?.addEventListener('click', e => {
    if (e.target.closest('.empty-state') || e.target.closest('.canvas-container')) sidePanel.classList.remove('open');
  });

  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    const f = e.dataTransfer?.files[0];
    if (f && f.type.startsWith('image/')) loadImageFromFile(f);
  });
}

function switchPanel(panel) {
  document.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t.dataset.panel === panel));
  document.querySelectorAll('.panel-content').forEach(p => p.classList.remove('active'));
  $(panel + '-panel')?.classList.add('active');
}

let cameraStream = null, facingMode = 'environment';
async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    openCameraFileFallback();
    return;
  }

  $('camera-modal').classList.remove('hidden');
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    const video = $('camera-video');
    video.srcObject = cameraStream;
    await video.play().catch(() => {});
  } catch (err) {
    console.warn('Camera unavailable', err);
    closeCamera();
    openCameraFileFallback('Use your device camera picker');
  }
}
function closeCamera() {
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  $('camera-modal').classList.add('hidden');
}
function flipCamera() { facingMode = facingMode === 'environment' ? 'user' : 'environment'; closeCamera(); openCamera(); }
function openCameraFileFallback(message = 'Take or choose a photo') {
  showToast(message);
  if (cameraFileInput) {
    cameraFileInput.value = '';
    cameraFileInput.click();
  } else {
    fileInput.click();
  }
}
async function capturePhoto() {
  const v = $('camera-video');
  if (!v.videoWidth || !v.videoHeight) {
    showToast('Camera is still starting');
    return;
  }

  try {
    const oc = createWorkCanvas(v.videoWidth, v.videoHeight);
    oc.getContext('2d').drawImage(v, 0, 0, v.videoWidth, v.videoHeight);
    const blob = await canvasToBlob(oc, 'image/jpeg', 0.95);
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      setState({ originalImage: img, imageLoaded: true });
      initCanvas(img);
      closeCamera();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      showToast('Could not load captured photo');
    };
    img.src = url;
  } catch (err) {
    console.warn('Capture failed', err);
    showToast('Could not capture photo');
  }
}

function openExportModal() {
  if (!getState().imageLoaded) { showToast('Load a photo first'); return; }
  $('export-modal').classList.remove('hidden');
}

async function showSaveModal() {
  const state = getState();
  const format = document.querySelector('input[name="format"]:checked')?.value || 'jpeg';
  const quality = parseInt($('export-quality')?.value || 92) / 100;
  const res = $('export-resolution')?.value || 'original';
  const orig = state.originalImage;
  
  if (!state.imageLoaded) return;
  
  $('export-modal').classList.add('hidden');
  showToast('Processing high-res export...');

  let w = orig.width, h = orig.height;
  const mm = { '4k':3840, '2k':2560, '1080':1920, '720':1280, '480':640 };
  if (res !== 'original' && mm[res]) { const r = Math.min(mm[res]/w, mm[res]/h); if (r<1) { w=Math.round(w*r); h=Math.round(h*r); } }

  const exportOc = document.createElement('canvas');
  exportOc.width = w; exportOc.height = h;
  const eCtx = exportOc.getContext('2d');
  
  // Start from the original high-res but scaled to the requested export resolution
  eCtx.drawImage(orig, 0, 0, w, h);
  let data = eCtx.getImageData(0, 0, w, h);
  
  const preset = state.activePreset ? PRESETS.find(p => p.id === state.activePreset) : null;
  const fx = { ...state.adjustments };
  if (preset) { for (const [k,v] of Object.entries(preset.fx)) fx[k] = (fx[k]||0) + v*(state.presetIntensity/100); }
  
  data = applyEffects(data, fx, 100);
  eCtx.putImageData(data, 0, 0);

  let outputBlob;
  const requestedType = `image/${format}`;
  try {
    outputBlob = await canvasToBlob(exportOc, requestedType, quality);
  } catch {
    outputBlob = await canvasToBlob(exportOc, 'image/png');
  }

  const outputType = outputBlob.type || requestedType;
  const extension = outputType === 'image/jpeg' ? 'jpg' : (outputType.split('/')[1] || format);
  const filename = `retrolens_${Date.now()}.${extension}`;
  const dataUrl = await blobToDataUrl(outputBlob);
  const shareFile = typeof File === 'function' ? new File([outputBlob], filename, { type: outputType }) : null;

  const modal = $('save-modal');
  const imgPreview = $('save-preview');
  const shareBtn = $('btn-share-save');
  const instructions = $('save-instructions');
  imgPreview.src = dataUrl;
  modal.classList.remove('hidden');

  const canShareFile = !!(shareFile && navigator.canShare?.({ files: [shareFile] }) && navigator.share);
  if (shareBtn) {
    shareBtn.style.display = canShareFile ? '' : 'none';
    shareBtn.onclick = canShareFile ? async () => {
      try {
        await navigator.share({ files: [shareFile], title: 'RetroLens photo' });
      } catch (err) {
        if (err?.name !== 'AbortError') console.warn('Share failed', err);
      }
    } : null;
  }
  if (instructions) {
    instructions.textContent = canShareFile
      ? 'Use Share / Save for the native sheet, or long press the image below to save it to your photos.'
      : 'Long press the image below to save it to your photos.';
  }

  if (!isMobileDevice()) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(outputBlob);
    link.download = filename;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else {
    showToast(canShareFile ? 'Tap Share / Save or long press image' : 'Long press image to save to Photos');
  }
}
function showToast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove('show'), 2500);
}

// PWA Install logic
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const installBtn = $('btn-install-pwa');
  if (installBtn) installBtn.style.display = 'block';
});

$('btn-install-pwa')?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    $('btn-install-pwa').style.display = 'none';
  }
  deferredPrompt = null;
});
