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

const STOCK_IMAGE_URL = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=90&w=960&h=960&auto=format&fit=crop';
const PRESET_PREVIEW_RENDER_SIZE = 512;
const PRESET_PREVIEW_REFERENCE_WIDTH = 1200;
const PRESET_PREVIEW_BATCH_SIZE = 6;
const MOBILE_DEVICE_RE = /Android|iPhone|iPad|iPod/i;
const isMobileDevice = () => MOBILE_DEVICE_RE.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
const STORAGE_KEYS = {
  favorites: 'retrolens:favorites',
  customPresets: 'retrolens:customPresets',
  defaultPreset: 'retrolens:defaultPreset',
  gallery: 'retrolens:gallery',
};
const APP_CATEGORIES = [
  ...CATEGORIES,
  { id: 'favorites', label: 'Favorites', icon: '⭐' },
  { id: 'custom', label: 'Mine', icon: '💽' },
];
let stockImage = null;

window.addEventListener('DOMContentLoaded', () => {
  syncViewportMetrics();
  registerServiceWorker();
  loadPersonalization();
  setTimeout(() => {
    splash.classList.add('fade-out');
    shell.classList.remove('hidden');
    setTimeout(() => splash.remove(), 600);
  }, 1500);
  buildCategories();
  buildPresetGrid();
  buildAdjustPanel();
  buildToolsPanel();
  renderGallery();
  bindEvents();
  loadStockImage();
  applyDefaultPreset();
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

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.warn(`Could not read ${key}`, err);
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`Could not persist ${key}`, err);
    showToast('Storage is full on this device');
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function loadPersonalization() {
  const favoritePresets = readJson(STORAGE_KEYS.favorites, []);
  const customPresets = readJson(STORAGE_KEYS.customPresets, []);
  const defaultPreset = readJson(STORAGE_KEYS.defaultPreset, null);
  const galleryItems = readJson(STORAGE_KEYS.gallery, []);
  setState({ favoritePresets, customPresets, defaultPreset, galleryItems });
}

function persistPersonalization() {
  const state = getState();
  writeJson(STORAGE_KEYS.favorites, state.favoritePresets || []);
  writeJson(STORAGE_KEYS.customPresets, state.customPresets || []);
  writeJson(STORAGE_KEYS.defaultPreset, state.defaultPreset || null);
  writeJson(STORAGE_KEYS.gallery, state.galleryItems || []);
}

function getAllPresets() {
  return [...PRESETS, ...getState().customPresets];
}

function findPreset(id) {
  return getAllPresets().find(preset => preset.id === id);
}

function withPresetProfile(preset) {
  if (!preset) return null;
  return {
    ...preset,
    fx: {
      ...preset.fx,
      profile: preset.fx.profile || preset.profile || preset.cat || 'custom',
    },
  };
}

function getActivePreset() {
  const activePreset = getState().activePreset;
  return activePreset ? withPresetProfile(findPreset(activePreset)) : null;
}

function getActiveFx(extraAdjustments = {}) {
  const state = getState();
  return mergePresetEffects({ ...state.adjustments, ...extraAdjustments }, getActivePreset(), state.presetIntensity);
}

function getPreviewFx(fx) {
  const { jpegQ, jpegPasses, dust, scratches, datamosh, pixelSort, ...previewFx } = fx;
  return previewFx;
}

function getCurrentPresetName() {
  return getActivePreset()?.name || 'Clean';
}

async function loadStockImage() {
  const img = new Image();
  img.crossOrigin = 'Anonymous';
  img.onload = () => {
    stockImage = img;
    if (!getState().imageLoaded) generateThumbnails(getAllPresets());
  };
  img.src = STOCK_IMAGE_URL;
}

function loadImageFromFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    loadImageFromDataUrl(e.target.result);
  };
  reader.readAsDataURL(file);
}

function loadImageFromDataUrl(dataUrl) {
  const img = new Image();
  img.onload = () => {
    setState({ originalImage: img, imageLoaded: true });
    initCanvas(img);
  };
  img.onerror = () => showToast('Could not load photo');
  img.src = dataUrl;
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
  if (getState().activePreset) scheduleApply();
  generateThumbnails(getAllPresets());
  showToast('Photo loaded!');
}

function renderCanvas(imageData) {
  if (!imageData) return;
  ctx.putImageData(imageData, 0, 0);
}

function cloneImageData(imageData) {
  return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
}

function mergePresetEffects(baseFx, preset, intensity = 100) {
  const fx = { ...baseFx };
  if (!preset) return fx;

  const amount = intensity / 100;
  for (const [key, value] of Object.entries(preset.fx)) {
    if (typeof value === 'number') {
      fx[key] = (typeof fx[key] === 'number' ? fx[key] : 0) + value * amount;
    } else if (amount > 0) {
      fx[key] = value;
    }
  }

  return fx;
}

async function renderEffectsToImageData(sourceData, fx, canvas = createWorkCanvas(sourceData.width, sourceData.height), context = null) {
  let data = cloneImageData(sourceData);
  if (fx.sharpness > 0) data = applySharpen(data, fx.sharpness);
  if (fx.sharpness < 0 || fx.blur > 0) data = applyBlur(data, Math.abs(fx.sharpness || 0) / 5 + (fx.blur || 0) / 3);
  data = applyEffects(data, fx, 100);

  if (canvas.width !== data.width) canvas.width = data.width;
  if (canvas.height !== data.height) canvas.height = data.height;
  const canvasContext = context || canvas.getContext('2d');

  if (fx.jpegQ) {
    canvasContext.putImageData(data, 0, 0);
    data = await applyJPEGCompression(canvas, fx.jpegQ, fx.jpegPasses || 1);
  }

  canvasContext.putImageData(data, 0, 0);
  return data;
}

let applyTimeout = null;
let thumbnailRunId = 0;
function scheduleApply() {
  clearTimeout(applyTimeout);
  applyTimeout = setTimeout(() => applyAll(), 50);
}

async function applyAll() {
  const state = getState();
  if (!state.imageLoaded || !state.history[0]) return;
  const original = state.history[0];
  const fx = getActiveFx();
  const data = await renderEffectsToImageData(original, fx, mainCanvas, ctx);
  setState({ currentImageData: data });
  renderCanvas(data);
}

function buildCategories() {
  categoryPills.innerHTML = APP_CATEGORIES.map(c =>
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

function buildPresetGrid() { renderPresets(getAllPresets()); }

function renderPresets(list) {
  const state = getState();
  presetGrid.querySelectorAll('[data-thumb-url]').forEach(card => URL.revokeObjectURL(card.dataset.thumbUrl));
  presetGrid.innerHTML = list.map(p => {
    const cat = APP_CATEGORIES.find(c => c.id === p.cat);
    const isFavorite = state.favoritePresets.includes(p.id);
    const isDefault = state.defaultPreset === p.id;
    const isActive = state.activePreset === p.id;
    const safeName = escapeHtml(p.name);
    return `<div class="preset-card${isActive ? ' active' : ''}" data-id="${p.id}" title="${safeName}">
      <div class="preset-card-actions">
        <button class="preset-action${isFavorite ? ' active' : ''}" data-preset-action="favorite" aria-label="${isFavorite ? 'Unfavorite' : 'Favorite'}">${isFavorite ? '★' : '☆'}</button>
        <button class="preset-action${isDefault ? ' active' : ''}" data-preset-action="default" aria-label="Use as default camera preset">●</button>
      </div>
      <div class="preset-card-label">${safeName}</div>
      <div class="preset-card-icon">${p.cat === 'custom' ? '💽' : (cat ? cat.icon : '✨')}</div>
    </div>`;
  }).join('');
  if (getState().imageLoaded || stockImage) generateThumbnails(list);
}

async function generateThumbnails(list) {
  const runId = ++thumbnailRunId;
  const state = getState();
  const original = state.imageLoaded ? state.history[0] : stockImage;
  if (!original) return;

  const previewSize = PRESET_PREVIEW_RENDER_SIZE;
  let tw, th;
  
  if (state.imageLoaded) {
    const ratio = Math.min(previewSize / original.width, previewSize / original.height, 1);
    tw = Math.round(original.width * ratio);
    th = Math.round(original.height * ratio);
  } else {
    tw = previewSize; th = previewSize;
  }

  const previewData = downscaleImageData(original, tw, th);
  const referenceWidth = state.imageLoaded
    ? Math.max(PRESET_PREVIEW_REFERENCE_WIDTH, original.width)
    : PRESET_PREVIEW_REFERENCE_WIDTH;

  for (let i = 0; i < list.length; i += PRESET_PREVIEW_BATCH_SIZE) {
    if (runId !== thumbnailRunId) return;
    const batch = list.slice(i, i + PRESET_PREVIEW_BATCH_SIZE);
    await Promise.all(batch.map(preset => renderPresetThumbnail(preset, previewData, referenceWidth, runId)));
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

async function renderPresetThumbnail(preset, previewData, referenceWidth, runId) {
  const card = presetGrid.querySelector(`[data-id="${preset.id}"]`);
  if (!card || runId !== thumbnailRunId) return;
  try {
    const oc = createWorkCanvas(previewData.width, previewData.height);
    const fx = {
      ...withPresetProfile(preset).fx,
      previewReferenceWidth: referenceWidth,
    };
    await renderEffectsToImageData(previewData, fx, oc);
    if (runId !== thumbnailRunId) return;
    const blob = await canvasToBlob(oc, 'image/jpeg', 0.88);
    const url = URL.createObjectURL(blob);
    if (card.dataset.thumbUrl) URL.revokeObjectURL(card.dataset.thumbUrl);
    card.dataset.thumbUrl = url;
    card.style.backgroundImage = `url(${url})`;
    card.style.backgroundSize = 'cover';
    card.style.backgroundPosition = 'center';
  } catch(e) {
    console.warn('Thumbnail err', e);
  }
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
  let filtered = getAllPresets();
  if (state.activeCategory === 'favorites') {
    filtered = filtered.filter(p => state.favoritePresets.includes(p.id));
  } else if (state.activeCategory !== 'all') {
    filtered = filtered.filter(p => p.cat === state.activeCategory);
  }
  if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search));
  renderPresets(filtered);
}

function applyDefaultPreset() {
  const defaultPreset = getState().defaultPreset;
  if (!defaultPreset || !findPreset(defaultPreset)) return;
  setState({ activePreset: defaultPreset, presetIntensity: 100 });
  intensityBar.classList.remove('hidden');
  intensitySlider.value = 100;
  intensityValue.textContent = '100%';
  filterPresets();
}

function selectPreset(id) {
  const state = getState();
  presetGrid.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));
  if (state.activePreset === id) {
    setState({ activePreset: null });
    intensityBar.classList.add('hidden');
  } else {
    presetGrid.querySelector(`[data-id="${id}"]`)?.classList.add('active');
    setState({ activePreset: id, presetIntensity: 100 });
    intensityBar.classList.remove('hidden');
    intensitySlider.value = 100;
    intensityValue.textContent = '100%';
  }
  scheduleApply();
  renderCameraPresetStrip();
}

function toggleFavoritePreset(id) {
  const state = getState();
  const favoritePresets = state.favoritePresets.includes(id)
    ? state.favoritePresets.filter(item => item !== id)
    : [...state.favoritePresets, id];
  setState({ favoritePresets });
  persistPersonalization();
  filterPresets();
  renderCameraPresetStrip();
}

function setDefaultPreset(id) {
  const defaultPreset = getState().defaultPreset === id ? null : id;
  setState({ defaultPreset });
  persistPersonalization();
  filterPresets();
  renderCameraPresetStrip();
  showToast(defaultPreset ? 'Default camera preset saved' : 'Default preset cleared');
}

function openCustomPresetModal() {
  $('custom-preset-modal')?.classList.remove('hidden');
  const nameInput = $('custom-preset-name');
  if (nameInput) {
    nameInput.value = getCurrentPresetName() === 'Clean' ? 'My preset' : `${getCurrentPresetName()} Custom`;
    nameInput.focus();
    nameInput.select();
  }
}

function closeCustomPresetModal() {
  $('custom-preset-modal')?.classList.add('hidden');
}

function saveCustomPreset() {
  const name = ($('custom-preset-name')?.value || '').trim() || 'My preset';
  const fx = getActiveFx();
  if (!fx.profile) fx.profile = 'custom';
  const customPreset = {
    id: `custom_${Date.now()}`,
    name,
    cat: 'custom',
    profile: fx.profile || 'custom',
    fx,
  };
  const customPresets = [customPreset, ...getState().customPresets].slice(0, 40);
  setState({ customPresets, activePreset: customPreset.id, presetIntensity: 100, activeCategory: 'custom' });
  persistPersonalization();
  closeCustomPresetModal();
  categoryPills.querySelectorAll('.cat-pill').forEach(p => p.classList.toggle('active', p.dataset.cat === 'custom'));
  filterPresets();
  renderCameraPresetStrip();
  showToast('Custom preset saved');
}

function openGalleryModal() {
  renderGallery();
  $('gallery-modal')?.classList.remove('hidden');
}

function closeGalleryModal() {
  $('gallery-modal')?.classList.add('hidden');
}

async function compactDataUrl(dataUrl, maxDim = 1200) {
  const img = await loadImageElement(dataUrl);
  const ratio = Math.min(1, maxDim / img.width, maxDim / img.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * ratio));
  canvas.height = Math.max(1, Math.round(img.height * ratio));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.86);
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function addGalleryItem(dataUrl, meta = {}) {
  const compactUrl = await compactDataUrl(dataUrl);
  const item = {
    id: `shot_${Date.now()}`,
    url: compactUrl,
    title: meta.title || getCurrentPresetName(),
    preset: meta.preset || getCurrentPresetName(),
    createdAt: Date.now(),
  };
  const galleryItems = [item, ...getState().galleryItems].slice(0, 30);
  setState({ galleryItems });
  persistPersonalization();
  renderGallery();
  return item;
}

function renderGallery() {
  const grid = $('gallery-grid');
  if (!grid) return;
  const items = getState().galleryItems || [];
  if (!items.length) {
    grid.innerHTML = '<div class="gallery-empty">No photos yet. Capture or export a shot to build your private camera roll.</div>';
    return;
  }
  grid.innerHTML = items.map(item => {
    const safeTitle = escapeHtml(item.title);
    return `
    <article class="gallery-card" data-gallery-id="${item.id}">
      <img src="${item.url}" alt="${safeTitle}" loading="lazy" />
      <div class="gallery-card-body">
        <div class="gallery-card-title">${safeTitle}</div>
        <div class="gallery-card-actions">
          <button class="btn btn-secondary" data-gallery-action="open">Open</button>
          <button class="btn btn-secondary" data-gallery-action="share">Share</button>
          <button class="btn btn-secondary" data-gallery-action="delete">Delete</button>
          <button class="btn btn-primary" data-gallery-action="download">Save</button>
        </div>
      </div>
    </article>
  `;
  }).join('');
}

async function handleGalleryAction(action, id) {
  const item = getState().galleryItems.find(entry => entry.id === id);
  if (!item) return;

  if (action === 'open') {
    loadImageFromDataUrl(item.url);
    closeGalleryModal();
  } else if (action === 'delete') {
    const galleryItems = getState().galleryItems.filter(entry => entry.id !== id);
    setState({ galleryItems });
    persistPersonalization();
    renderGallery();
  } else if (action === 'download') {
    const link = document.createElement('a');
    link.href = item.url;
    link.download = `${item.title.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_${item.id}.jpg`;
    link.click();
  } else if (action === 'share') {
    const blob = dataUrlToBlob(item.url);
    const file = typeof File === 'function' ? new File([blob], `${item.title}.jpg`, { type: blob.type || 'image/jpeg' }) : null;
    if (file && navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: item.title }).catch(err => {
        if (err?.name !== 'AbortError') console.warn('Gallery share failed', err);
      });
    } else {
      showToast('Use Save to download this photo');
    }
  }
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
    { id:'favorite-current', label:'Favorite', icon:'⭐' },
    { id:'default-current', label:'Default Cam', icon:'●' },
    { id:'save-preset', label:'Save Preset', icon:'💽' },
    { id:'gallery', label:'Gallery', icon:'🖼️' },
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
  if (tool === 'save-preset') { openCustomPresetModal(); return; }
  if (tool === 'gallery') { openGalleryModal(); return; }
  if (tool === 'favorite-current') {
    if (!state.activePreset) { showToast('Select a preset first'); return; }
    toggleFavoritePreset(state.activePreset);
    showToast('Favorite updated');
    return;
  }
  if (tool === 'default-current') {
    if (!state.activePreset) { showToast('Select a preset first'); return; }
    setDefaultPreset(state.activePreset);
    return;
  }
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
  $('btn-gallery')?.addEventListener('click', openGalleryModal);
  $('btn-gallery-close')?.addEventListener('click', closeGalleryModal);
  $('gallery-modal')?.querySelector('.modal-backdrop')?.addEventListener('click', closeGalleryModal);
  $('gallery-grid')?.addEventListener('click', e => {
    const action = e.target.closest('[data-gallery-action]')?.dataset.galleryAction;
    const card = e.target.closest('[data-gallery-id]');
    if (action && card) handleGalleryAction(action, card.dataset.galleryId);
  });
  $('btn-custom-preset-close')?.addEventListener('click', closeCustomPresetModal);
  $('custom-preset-modal')?.querySelector('.modal-backdrop')?.addEventListener('click', closeCustomPresetModal);
  $('btn-custom-preset-save')?.addEventListener('click', saveCustomPreset);
  $('custom-preset-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveCustomPreset();
  });

  $('btn-camera-empty')?.addEventListener('click', openCamera);
  $('btn-camera-nav')?.addEventListener('click', openCamera);
  $('btn-camera-close')?.addEventListener('click', closeCamera);
  $('btn-camera-flip')?.addEventListener('click', flipCamera);
  $('btn-camera-capture')?.addEventListener('click', capturePhoto);
  $('camera-preset-strip')?.addEventListener('click', e => {
    const chip = e.target.closest('[data-camera-preset]');
    if (!chip) return;
    const id = chip.dataset.cameraPreset || null;
    setState({ activePreset: id, presetIntensity: 100 });
    renderCameraPresetStrip();
    filterPresets();
  });
  $('camera-exposure')?.addEventListener('input', e => {
    cameraExposure = parseInt(e.target.value, 10) || 0;
  });
  $('camera-zoom')?.addEventListener('input', e => {
    cameraZoom = Math.max(1, (parseInt(e.target.value, 10) || 100) / 100);
    const track = cameraStream?.getVideoTracks?.()[0];
    const caps = track?.getCapabilities?.();
    if (caps?.zoom) {
      const zoom = Math.min(caps.zoom.max, Math.max(caps.zoom.min, cameraZoom));
      track.applyConstraints({ advanced: [{ zoom }] }).catch(() => {});
    }
  });
  document.querySelector('.camera-preview')?.addEventListener('click', handleCameraTapToFocus);

  presetGrid.addEventListener('click', e => {
    const card = e.target.closest('.preset-card');
    if (!card) return;
    const id = card.dataset.id;
    const action = e.target.closest('[data-preset-action]')?.dataset.presetAction;
    if (action === 'favorite') {
      toggleFavoritePreset(id);
      return;
    }
    if (action === 'default') {
      setDefaultPreset(id);
      return;
    }
    if (!getState().imageLoaded) showToast('Preset ready for camera');
    selectPreset(id);
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
      if (a === 'gallery') { openGalleryModal(); return; }
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
let cameraPreviewRaf = 0;
let cameraPreviewBusy = false;
let lastCameraPreviewAt = 0;
let cameraExposure = 0;
let cameraZoom = 1;

function renderCameraPresetStrip() {
  const strip = $('camera-preset-strip');
  if (!strip) return;
  const state = getState();
  const recommended = ['kodak_portra_400', 'kodak_gold_200', 'kodak_funsaver_flash', 'sony_cybershot', 'cinestill_800t', 'ilford_hp5'];
  const ids = [state.defaultPreset, state.activePreset, ...state.favoritePresets, ...recommended].filter(Boolean);
  const presets = [...new Set(ids)].map(findPreset).filter(Boolean).slice(0, 18);
  if (!presets.length) {
    strip.innerHTML = '<button class="camera-preset-chip active" data-camera-preset="">Clean</button>';
    return;
  }
  strip.innerHTML = [
    `<button class="camera-preset-chip${state.activePreset ? '' : ' active'}" data-camera-preset="">Clean</button>`,
    ...presets.map(preset => `<button class="camera-preset-chip${state.activePreset === preset.id ? ' active' : ''}" data-camera-preset="${preset.id}">${escapeHtml(preset.name)}</button>`),
  ].join('');
}

function drawVideoFrameToCanvas(video, canvas, zoom = 1) {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const srcW = width / zoom;
  const srcH = height / zoom;
  const sx = (width - srcW) / 2;
  const sy = (height - srcH) / 2;
  context.drawImage(video, sx, sy, srcW, srcH, 0, 0, width, height);
  return context;
}

function handleCameraTapToFocus(e) {
  if (!cameraStream) return;
  const preview = e.currentTarget;
  const rect = preview.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const ring = document.createElement('div');
  ring.className = 'focus-ring';
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  preview.appendChild(ring);
  setTimeout(() => ring.remove(), 850);

  const track = cameraStream.getVideoTracks?.()[0];
  const caps = track?.getCapabilities?.();
  if (caps?.focusMode?.includes('continuous')) {
    track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
  }

  showToast('Focus locked');
}

async function renderCameraPreviewFrame(timestamp = 0) {
  cameraPreviewRaf = requestAnimationFrame(renderCameraPreviewFrame);
  if (cameraPreviewBusy || timestamp - lastCameraPreviewAt < 140) return;
  lastCameraPreviewAt = timestamp;

  const video = $('camera-video');
  const preview = $('camera-preview-canvas');
  if (!video?.videoWidth || !preview) return;

  const hasLook = !!getState().activePreset || cameraExposure !== 0;
  preview.style.opacity = hasLook ? '1' : '0';
  if (!hasLook) return;

  cameraPreviewBusy = true;
  try {
    const maxWidth = 480;
    const ratio = Math.min(1, maxWidth / video.videoWidth);
    preview.width = Math.max(1, Math.round(video.videoWidth * ratio));
    preview.height = Math.max(1, Math.round(video.videoHeight * ratio));
    const previewCtx = preview.getContext('2d', { willReadFrequently: true });
    const srcW = video.videoWidth / cameraZoom;
    const srcH = video.videoHeight / cameraZoom;
    previewCtx.drawImage(video, (video.videoWidth - srcW) / 2, (video.videoHeight - srcH) / 2, srcW, srcH, 0, 0, preview.width, preview.height);
    const data = previewCtx.getImageData(0, 0, preview.width, preview.height);
    await renderEffectsToImageData(data, getPreviewFx(getActiveFx({ exposure: cameraExposure })), preview, previewCtx);
  } catch (err) {
    console.warn('Camera preview failed', err);
  } finally {
    cameraPreviewBusy = false;
  }
}

async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    openCameraFileFallback();
    return;
  }

  $('camera-modal').classList.remove('hidden');
  if (!getState().activePreset && getState().defaultPreset) {
    setState({ activePreset: getState().defaultPreset, presetIntensity: 100 });
  }
  renderCameraPresetStrip();
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
    startCameraPreview();
  } catch (err) {
    console.warn('Camera unavailable', err);
    closeCamera();
    openCameraFileFallback('Use your device camera picker');
  }
}
function startCameraPreview() {
  cancelAnimationFrame(cameraPreviewRaf);
  lastCameraPreviewAt = 0;
  cameraPreviewRaf = requestAnimationFrame(renderCameraPreviewFrame);
}
function closeCamera() {
  cancelAnimationFrame(cameraPreviewRaf);
  cameraPreviewRaf = 0;
  cameraPreviewBusy = false;
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
    const captureCtx = drawVideoFrameToCanvas(v, oc, cameraZoom);
    const rawData = captureCtx.getImageData(0, 0, oc.width, oc.height);
    await renderEffectsToImageData(rawData, getActiveFx({ exposure: cameraExposure }), oc, captureCtx);
    const blob = await canvasToBlob(oc, 'image/jpeg', 0.95);
    const dataUrl = await blobToDataUrl(blob);
    await addGalleryItem(dataUrl, { title: getCurrentPresetName(), preset: getCurrentPresetName() });
    navigator.vibrate?.(12);
    const img = new Image();
    img.onload = () => {
      setState({ originalImage: img, imageLoaded: true, activePreset: null });
      initCanvas(img);
      closeCamera();
    };
    img.onerror = () => {
      showToast('Could not load captured photo');
    };
    img.src = dataUrl;
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
  
  const fx = getActiveFx();
  
  data = await renderEffectsToImageData(data, fx, exportOc, eCtx);

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
  await addGalleryItem(dataUrl, { title: getCurrentPresetName(), preset: getCurrentPresetName() });

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
