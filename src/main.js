import '../src/styles/index.css';
import { getState, setState, subscribe, pushHistory, undo, redo } from './js/state.js';
import { CATEGORIES, PRESETS } from './js/presets.js';
import {
  applyEffects,
  applyJPEGCompression,
  applyBlur,
  applySharpen,
  applyGradientMap,
  applyEmboss,
  applyEdgeDetect,
  applySepiaTone,
  applyHueSaturation,
  applyBlackAndWhite,
  applyAddNoise,
  applyColorOverlay,
} from './js/effects.js';

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
const HSL_COLORS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];
const PRO_TONE_CONTROLS = [
  { key: 'blackPoint', label: 'Black Point', min: 0, max: 35, value: 0 },
  { key: 'whitePoint', label: 'White Point', min: 65, max: 120, value: 100 },
  { key: 'gamma', label: 'Gamma', min: -100, max: 100, value: 0 },
  { key: 'clarity', label: 'Clarity', min: -100, max: 100, value: 0 },
  { key: 'dehaze', label: 'Dehaze', min: -100, max: 100, value: 0 },
];
const SPLIT_TONE_CONTROLS = [
  { key: 'shadowHue', label: 'Shadow Hue', min: 0, max: 360, value: 220 },
  { key: 'shadowSat', label: 'Shadow Sat', min: 0, max: 100, value: 0 },
  { key: 'highlightHue', label: 'Highlight Hue', min: 0, max: 360, value: 42 },
  { key: 'highlightSat', label: 'Highlight Sat', min: 0, max: 100, value: 0 },
  { key: 'balance', label: 'Balance', min: -100, max: 100, value: 0 },
];
const CURVE_CONTROLS = [
  { key: 'shadows', label: 'Shadows', min: -100, max: 100, value: 0 },
  { key: 'darks', label: 'Darks', min: -100, max: 100, value: 0 },
  { key: 'lights', label: 'Lights', min: -100, max: 100, value: 0 },
  { key: 'highlights', label: 'Highlights', min: -100, max: 100, value: 0 },
];
const COLOR_BALANCE_RANGES = ['shadows', 'midtones', 'highlights'];
const COLOR_BALANCE_CONTROLS = [
  { key: 'cyanRed', label: 'Cyan / Red' },
  { key: 'magentaGreen', label: 'Magenta / Green' },
  { key: 'yellowBlue', label: 'Yellow / Blue' },
];
const RETOUCH_MODES = [
  { id: 'dodge', label: 'Dodge' },
  { id: 'burn', label: 'Burn' },
  { id: 'blur', label: 'Blur' },
  { id: 'sharpen', label: 'Sharpen' },
  { id: 'saturate', label: 'Saturate' },
  { id: 'desaturate', label: 'Desaturate' },
];

const TEXT_POSITIONS = [
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-center', label: 'Top Center' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'middle-left', label: 'Mid Left' },
  { value: 'center', label: 'Center' },
  { value: 'middle-right', label: 'Mid Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-center', label: 'Bottom Center' },
  { value: 'bottom-right', label: 'Bottom Right' },
];
const TEXT_FONTS = [
  { value: '"Space Grotesk", sans-serif', label: 'Sans' },
  { value: '"JetBrains Mono", monospace', label: 'Mono' },
  { value: '"VT323", monospace', label: 'Retro LCD' },
  { value: 'Georgia, serif', label: 'Serif' },
  { value: 'Impact, sans-serif', label: 'Impact' },
];
const TIMESTAMP_FORMATS = [
  { value: 'ymd', label: "'YY MM DD" },
  { value: 'dmy', label: 'DD/MM/YYYY' },
  { value: 'mdy', label: 'MM/DD/YYYY' },
  { value: 'full', label: 'Mon DD, YYYY' },
  { value: 'datetime', label: 'YYYY-MM-DD HH:MM' },
];
const BORDER_STYLES = [
  { value: 'white', label: 'White' },
  { value: 'black', label: 'Black' },
  { value: 'color', label: 'Custom Color' },
  { value: 'film', label: 'Film' },
  { value: 'polaroid', label: 'Polaroid' },
  { value: 'rounded', label: 'Rounded' },
];

// Customizable tool dialogs — each provides controls + a synchronous render(base, params).
// applyEffects-based renders use previewReferenceWidth:1200 so literal pixel sizes stay stable.
const TOOL_DIALOGS = {
  'brightness-contrast': {
    title: 'Brightness / Contrast', icon: '☀️', toast: 'Brightness & contrast applied',
    controls: [
      { key: 'brightness', label: 'Brightness', type: 'range', min: -100, max: 100, default: 0 },
      { key: 'contrast', label: 'Contrast', type: 'range', min: -100, max: 100, default: 0 },
    ],
    render: (base, p) => applyEffects(base, { brightness: p.brightness, contrast: p.contrast }, 100),
  },
  exposure: {
    title: 'Exposure', icon: '🌗', toast: 'Exposure applied',
    controls: [
      { key: 'exposure', label: 'Exposure', type: 'range', min: -100, max: 100, default: 0 },
      { key: 'highlights', label: 'Highlights', type: 'range', min: -100, max: 100, default: 0 },
      { key: 'shadows', label: 'Shadows', type: 'range', min: -100, max: 100, default: 0 },
    ],
    render: (base, p) => applyEffects(base, { exposure: p.exposure, highlights: p.highlights, shadows: p.shadows }, 100),
  },
  levels: {
    title: 'Levels', icon: '📊', toast: 'Levels applied',
    controls: [
      { key: 'blackPoint', label: 'Black Point', type: 'range', min: 0, max: 45, default: 0 },
      { key: 'whitePoint', label: 'White Point', type: 'range', min: 55, max: 120, default: 100 },
      { key: 'gamma', label: 'Gamma', type: 'range', min: -100, max: 100, default: 0 },
    ],
    render: (base, p) => applyEffects(base, { blackPoint: p.blackPoint, whitePoint: p.whitePoint, gamma: p.gamma }, 100),
  },
  'hue-saturation': {
    title: 'Hue / Saturation', icon: '🎨', toast: 'Hue & saturation applied',
    controls: [
      { key: 'hue', label: 'Hue', type: 'range', min: -180, max: 180, default: 0, suffix: '°' },
      { key: 'saturation', label: 'Saturation', type: 'range', min: -100, max: 100, default: 0 },
      { key: 'lightness', label: 'Lightness', type: 'range', min: -100, max: 100, default: 0 },
    ],
    render: (base, p) => applyHueSaturation(base, p.hue, p.saturation, p.lightness),
  },
  vibrance: {
    title: 'Vibrance', icon: '🌈', toast: 'Vibrance applied',
    controls: [
      { key: 'vibrance', label: 'Vibrance', type: 'range', min: -100, max: 100, default: 30 },
      { key: 'saturation', label: 'Saturation', type: 'range', min: -100, max: 100, default: 0 },
    ],
    render: (base, p) => applyEffects(base, { vibrance: p.vibrance, saturation: p.saturation }, 100),
  },
  'black-white': {
    title: 'Black & White', icon: '◐', toast: 'Black & white applied',
    controls: [
      { key: 'r', label: 'Reds', type: 'range', min: 0, max: 200, default: 30 },
      { key: 'g', label: 'Greens', type: 'range', min: 0, max: 200, default: 59 },
      { key: 'b', label: 'Blues', type: 'range', min: 0, max: 200, default: 11 },
    ],
    render: (base, p) => applyBlackAndWhite(base, { r: p.r, g: p.g, b: p.b }, 1),
  },
  'gaussian-blur': {
    title: 'Gaussian Blur', icon: '🌫️', toast: 'Blur applied',
    controls: [
      { key: 'radius', label: 'Radius', type: 'range', min: 0, max: 30, step: 0.5, default: 4, suffix: 'px' },
    ],
    render: (base, p) => applyBlur(base, p.radius),
  },
  sharpen: {
    title: 'Sharpen', icon: '◆', toast: 'Sharpen applied',
    controls: [
      { key: 'amount', label: 'Amount', type: 'range', min: 0, max: 100, default: 35 },
    ],
    render: (base, p) => applySharpen(base, p.amount),
  },
  'smart-sharpen': {
    title: 'Smart Sharpen', icon: '✦', toast: 'Smart sharpen applied',
    controls: [
      { key: 'amount', label: 'Amount', type: 'range', min: 0, max: 150, default: 40 },
      { key: 'clarity', label: 'Clarity', type: 'range', min: 0, max: 100, default: 15 },
    ],
    render: (base, p) => {
      let data = applySharpen(base, p.amount);
      if (p.clarity) data = applyEffects(data, { clarity: p.clarity }, 100);
      return data;
    },
  },
  'add-noise': {
    title: 'Add Noise', icon: '📺', toast: 'Noise added',
    controls: [
      { key: 'amount', label: 'Amount', type: 'range', min: 0, max: 100, default: 20 },
      { key: 'monochrome', label: 'Monochrome', type: 'checkbox', default: true },
    ],
    render: (base, p) => applyAddNoise(base, p.amount, p.monochrome),
  },
  pixelate: {
    title: 'Pixelate', icon: '▦', toast: 'Pixelated',
    controls: [
      { key: 'size', label: 'Cell Size', type: 'range', min: 2, max: 48, default: 8, suffix: 'px' },
    ],
    render: (base, p) => applyEffects(base, { pixelate: p.size, previewReferenceWidth: 1200 }, 100),
  },
  vignette: {
    title: 'Vignette', icon: '⬤', toast: 'Vignette applied',
    controls: [
      { key: 'vignette', label: 'Amount', type: 'range', min: 0, max: 100, default: 40 },
    ],
    render: (base, p) => applyEffects(base, { vignette: p.vignette }, 100),
  },
  threshold: {
    title: 'Threshold', icon: '◧', toast: 'Threshold applied',
    controls: [
      { key: 'level', label: 'Level', type: 'range', min: 1, max: 254, default: 128 },
    ],
    render: (base, p) => applyEffects(base, { threshold: p.level }, 100),
  },
  posterize: {
    title: 'Posterize', icon: '▤', toast: 'Posterized',
    controls: [
      { key: 'levels', label: 'Levels', type: 'range', min: 2, max: 32, default: 6 },
    ],
    render: (base, p) => applyEffects(base, { posterize: p.levels }, 100),
  },
  invert: {
    title: 'Invert', icon: '◩', toast: 'Inverted',
    controls: [
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0, max: 100, default: 100, suffix: '%' },
    ],
    render: (base, p) => {
      const s = p.opacity / 100;
      const d = base.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = d[i] + (255 - 2 * d[i]) * s;
        d[i + 1] = d[i + 1] + (255 - 2 * d[i + 1]) * s;
        d[i + 2] = d[i + 2] + (255 - 2 * d[i + 2]) * s;
      }
      return base;
    },
  },
  solarize: {
    title: 'Solarize', icon: '☀', toast: 'Solarized',
    controls: [
      { key: 'amount', label: 'Amount', type: 'range', min: 0, max: 100, default: 80 },
    ],
    render: (base, p) => applyEffects(base, { solarize: p.amount }, 100),
  },
  emboss: {
    title: 'Emboss', icon: '⛰️', toast: 'Emboss applied',
    controls: [
      { key: 'strength', label: 'Strength', type: 'range', min: 0.2, max: 5, step: 0.1, default: 1 },
    ],
    render: (base, p) => applyEmboss(base, p.strength),
  },
  'find-edges': {
    title: 'Find Edges', icon: '🔲', toast: 'Edges detected',
    controls: [
      { key: 'strength', label: 'Strength', type: 'range', min: 0.2, max: 3, step: 0.1, default: 1 },
    ],
    render: (base, p) => applyEdgeDetect(base, p.strength),
  },
  halftone: {
    title: 'Halftone', icon: '⠿', toast: 'Halftone applied',
    controls: [
      { key: 'strength', label: 'Strength', type: 'range', min: 10, max: 100, default: 75 },
      { key: 'mode', label: 'Color', type: 'select', default: 'mono', options: [
        { value: 'mono', label: 'Monochrome' },
        { value: 'color', label: 'Color' },
      ] },
    ],
    render: (base, p) => applyEffects(base, { halftone: p.strength, halftoneColor: p.mode === 'color' ? 'color' : 'mono', previewReferenceWidth: 1200 }, 100),
  },
  'gradient-map': {
    title: 'Gradient Map', icon: '🌅', toast: 'Gradient map applied',
    controls: [
      { key: 'shadow', label: 'Shadows', type: 'color', default: '#1a0e3d' },
      { key: 'mid', label: 'Midtones', type: 'color', default: '#c0426b' },
      { key: 'highlight', label: 'Highlights', type: 'color', default: '#ffd56b' },
      { key: 'useMid', label: 'Use Midtone', type: 'checkbox', default: true },
      { key: 'intensity', label: 'Intensity', type: 'range', min: 0, max: 100, default: 100, suffix: '%' },
    ],
    render: (base, p) => applyGradientMap(base, p.shadow, p.highlight, p.useMid ? p.mid : null, p.intensity / 100),
  },
  sepia: {
    title: 'Sepia', icon: '🟤', toast: 'Sepia applied',
    controls: [
      { key: 'intensity', label: 'Intensity', type: 'range', min: 0, max: 100, default: 80, suffix: '%' },
    ],
    render: (base, p) => applySepiaTone(base, p.intensity / 100),
  },
  'color-overlay': {
    title: 'Color Overlay', icon: '🎭', toast: 'Color overlay applied',
    controls: [
      { key: 'color', label: 'Color', type: 'color', default: '#ff9500' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0, max: 100, default: 40, suffix: '%' },
      { key: 'mode', label: 'Blend', type: 'select', default: 'normal', options: [
        { value: 'normal', label: 'Normal' },
        { value: 'multiply', label: 'Multiply' },
        { value: 'screen', label: 'Screen' },
        { value: 'overlay', label: 'Overlay' },
      ] },
    ],
    render: (base, p) => applyColorOverlay(base, p.color, p.opacity, p.mode),
  },
  resize: {
    title: 'Resize', icon: '⤢', toast: 'Image resized',
    controls: [
      { key: 'percent', label: 'Scale', type: 'range', min: 10, max: 200, default: 100, suffix: '%' },
    ],
    render: (base, p) => renderResize(base, p),
  },
  text: {
    title: 'Add Text', icon: '🔤', toast: 'Text added',
    controls: [
      { key: 'text', label: 'Text', type: 'text', default: 'Hello' },
      { key: 'size', label: 'Size', type: 'range', min: 1, max: 30, step: 0.5, default: 8, suffix: '%' },
      { key: 'color', label: 'Color', type: 'color', default: '#ffffff' },
      { key: 'font', label: 'Font', type: 'select', default: TEXT_FONTS[0].value, options: TEXT_FONTS },
      { key: 'position', label: 'Position', type: 'select', default: 'bottom-center', options: TEXT_POSITIONS },
      { key: 'bold', label: 'Bold', type: 'checkbox', default: false },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0, max: 100, default: 100, suffix: '%' },
    ],
    render: (base, p) => renderTextOverlay(base, p),
  },
  timestamp: {
    title: 'Date Stamp', icon: '📅', toast: 'Date stamp added',
    controls: [
      { key: 'format', label: 'Format', type: 'select', default: 'ymd', options: TIMESTAMP_FORMATS },
      { key: 'color', label: 'Color', type: 'color', default: '#ff8800' },
      { key: 'position', label: 'Position', type: 'select', default: 'bottom-right', options: TEXT_POSITIONS },
      { key: 'size', label: 'Size', type: 'range', min: 1, max: 15, step: 0.5, default: 5, suffix: '%' },
    ],
    render: (base, p) => renderTimestamp(base, p),
  },
  border: {
    title: 'Border', icon: '🖼️', toast: 'Border added',
    controls: [
      { key: 'style', label: 'Style', type: 'select', default: 'white', options: BORDER_STYLES },
      { key: 'size', label: 'Size', type: 'range', min: 1, max: 15, step: 0.5, default: 5, suffix: '%' },
      { key: 'color', label: 'Color', type: 'color', default: '#ffffff' },
    ],
    render: (base, p) => renderBorder(base, p),
  },
};

const TOOL_GROUPS = [
  { label: 'Transform', tools: [
    { id: 'crop', label: 'Crop', icon: '✂️' },
    { id: 'resize', label: 'Resize', icon: '⤢' },
    { id: 'rotate-cw', label: 'Rotate →', icon: '↻' },
    { id: 'rotate-ccw', label: 'Rotate ←', icon: '↺' },
    { id: 'flip-h', label: 'Flip H', icon: '↔️' },
    { id: 'flip-v', label: 'Flip V', icon: '↕️' },
  ] },
  { label: 'Adjust', tools: [
    { id: 'brightness-contrast', label: 'Bright/Con', icon: '☀️' },
    { id: 'exposure', label: 'Exposure', icon: '🌗' },
    { id: 'levels', label: 'Levels', icon: '📊' },
    { id: 'hue-saturation', label: 'Hue/Sat', icon: '🎨' },
    { id: 'vibrance', label: 'Vibrance', icon: '🌈' },
    { id: 'auto-tone', label: 'Auto Tone', icon: '◐' },
    { id: 'auto-color', label: 'Auto Color', icon: '🖌️' },
  ] },
  { label: 'Filter', tools: [
    { id: 'gaussian-blur', label: 'Blur', icon: '🌫️' },
    { id: 'sharpen', label: 'Sharpen', icon: '◆' },
    { id: 'smart-sharpen', label: 'Smart Sharp', icon: '✦' },
    { id: 'add-noise', label: 'Add Noise', icon: '📺' },
    { id: 'pixelate', label: 'Pixelate', icon: '▦' },
    { id: 'vignette', label: 'Vignette', icon: '⬤' },
  ] },
  { label: 'Stylize', tools: [
    { id: 'black-white', label: 'B&W', icon: '◑' },
    { id: 'threshold', label: 'Threshold', icon: '◧' },
    { id: 'posterize', label: 'Posterize', icon: '▤' },
    { id: 'invert', label: 'Invert', icon: '◩' },
    { id: 'emboss', label: 'Emboss', icon: '⛰️' },
    { id: 'find-edges', label: 'Find Edges', icon: '🔲' },
    { id: 'solarize', label: 'Solarize', icon: '☀' },
    { id: 'halftone', label: 'Halftone', icon: '⠿' },
  ] },
  { label: 'Artistic', tools: [
    { id: 'gradient-map', label: 'Gradient Map', icon: '🌅' },
    { id: 'sepia', label: 'Sepia', icon: '🟤' },
    { id: 'color-overlay', label: 'Overlay', icon: '🎭' },
    { id: 'retouch', label: 'Retouch', icon: '🖌️' },
  ] },
  { label: 'Overlays', tools: [
    { id: 'text', label: 'Add Text', icon: '🔤' },
    { id: 'timestamp', label: 'Date Stamp', icon: '📅' },
    { id: 'border', label: 'Border', icon: '🖼️' },
  ] },
  { label: 'Library', tools: [
    { id: 'favorite-current', label: 'Favorite', icon: '⭐' },
    { id: 'default-current', label: 'Default Cam', icon: '●' },
    { id: 'save-preset', label: 'Save Preset', icon: '💽' },
    { id: 'gallery', label: 'Gallery', icon: '🖼️' },
  ] },
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
  buildProPanel();
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
  updateHistogram(imageData);
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
let retouchActive = false;
let retouchMode = 'dodge';
let retouchSize = 42;
let retouchStrength = 35;
let retouchPainting = false;
let retouchBase = null;

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

function buildProPanel() {
  const workspace = $('pro-workspace');
  if (!workspace) return;

  workspace.innerHTML = `
    <section class="pro-card">
      <div class="pro-card-header">
        <div>
          <h4>Histogram</h4>
          <p>RGB tonal distribution</p>
        </div>
        <button id="btn-auto-enhance" class="btn btn-secondary">Auto</button>
      </div>
      <canvas id="histogram-canvas" width="320" height="96"></canvas>
      <button id="btn-reset-pro" class="btn btn-secondary btn-full">Reset Pro Adjustments</button>
    </section>
    <section class="pro-card">
      <div class="pro-card-header"><h4>Levels & Presence</h4></div>
      <div class="pro-slider-list">
        ${PRO_TONE_CONTROLS.map(control => renderProSlider(control, 'tone')).join('')}
      </div>
    </section>
    <section class="pro-card">
      <div class="pro-card-header">
        <div>
          <h4>Curves</h4>
          <p>Regional tone shaping</p>
        </div>
      </div>
      <div class="curve-grid">
        ${CURVE_CONTROLS.map(control => renderProSlider(control, 'curve')).join('')}
      </div>
    </section>
    <section class="pro-card">
      <div class="pro-card-header">
        <div>
          <h4>Color Balance</h4>
          <p>Shift shadows, midtones, and highlights</p>
        </div>
      </div>
      <div class="color-balance-grid">
        ${COLOR_BALANCE_RANGES.map(range => `
          <div class="color-balance-range">
            <h5>${range}</h5>
            ${COLOR_BALANCE_CONTROLS.map(control => renderColorBalanceSlider(range, control)).join('')}
          </div>
        `).join('')}
      </div>
    </section>
    <section class="pro-card">
      <div class="pro-card-header">
        <div>
          <h4>HSL Color Mixer</h4>
          <p>Target individual color families</p>
        </div>
      </div>
      <div class="hsl-mixer">
        ${HSL_COLORS.map(color => renderHslGroup(color)).join('')}
      </div>
    </section>
    <section class="pro-card">
      <div class="pro-card-header"><h4>Split Toning</h4></div>
      <div class="pro-slider-list">
        ${SPLIT_TONE_CONTROLS.map(control => renderProSlider(control, 'split')).join('')}
      </div>
    </section>
  `;

  workspace.addEventListener('input', handleProInput);
  $('btn-auto-enhance')?.addEventListener('click', autoEnhance);
  $('btn-reset-pro')?.addEventListener('click', resetProAdjustments);
  updateHistogram(getState().currentImageData);
}

function renderProSlider(control, group) {
  return `
    <label class="pro-slider">
      <span>${control.label}<strong id="pro-val-${group}-${control.key}">${control.value}</strong></span>
      <input type="range" min="${control.min}" max="${control.max}" value="${control.value}" data-pro-group="${group}" data-pro-key="${control.key}" />
    </label>
  `;
}

function renderColorBalanceSlider(range, control) {
  return `
    <label class="pro-slider">
      <span>${control.label}<strong id="cb-val-${range}-${control.key}">0</strong></span>
      <input type="range" min="-100" max="100" value="0" data-color-balance-range="${range}" data-color-balance-key="${control.key}" />
    </label>
  `;
}

function renderHslGroup(color) {
  return `
    <div class="hsl-row" data-hsl-row="${color}">
      <div class="hsl-color-label"><span class="hsl-dot hsl-dot-${color}"></span>${color}</div>
      ${['h', 's', 'l'].map(channel => `
        <label>
          <span>${channel.toUpperCase()} <strong id="hsl-val-${color}-${channel}">0</strong></span>
          <input type="range" min="${channel === 'h' ? -60 : -100}" max="${channel === 'h' ? 60 : 100}" value="0" data-hsl-color="${color}" data-hsl-channel="${channel}" />
        </label>
      `).join('')}
    </div>
  `;
}

function handleProInput(e) {
  const target = e.target;
  if (target.matches('[data-pro-group="tone"]')) {
    const key = target.dataset.proKey;
    const value = parseInt(target.value, 10);
    setState({ adjustments: { ...getState().adjustments, [key]: value } });
    $(`pro-val-tone-${key}`).textContent = value;
    scheduleApply();
  } else if (target.matches('[data-pro-group="curve"]')) {
    const key = target.dataset.proKey;
    const value = parseInt(target.value, 10);
    const toneCurve = { ...(getState().adjustments.toneCurve || {}), [key]: value };
    setState({ adjustments: { ...getState().adjustments, toneCurve } });
    $(`pro-val-curve-${key}`).textContent = value;
    scheduleApply();
  } else if (target.matches('[data-color-balance-range]')) {
    const range = target.dataset.colorBalanceRange;
    const key = target.dataset.colorBalanceKey;
    const value = parseInt(target.value, 10);
    const current = getState().adjustments.colorBalance || {};
    const colorBalance = {
      ...current,
      [range]: {
        ...(current[range] || {}),
        [key]: value,
      },
    };
    setState({ adjustments: { ...getState().adjustments, colorBalance } });
    $(`cb-val-${range}-${key}`).textContent = value;
    scheduleApply();
  } else if (target.matches('[data-pro-group="split"]')) {
    const key = target.dataset.proKey;
    const value = parseInt(target.value, 10);
    const splitTone = { ...(getState().adjustments.splitTone || {}), [key]: value };
    setState({ adjustments: { ...getState().adjustments, splitTone } });
    $(`pro-val-split-${key}`).textContent = value;
    scheduleApply();
  } else if (target.matches('[data-hsl-color]')) {
    const color = target.dataset.hslColor;
    const channel = target.dataset.hslChannel;
    const value = parseInt(target.value, 10);
    const currentHsl = getState().adjustments.hsl || {};
    const hsl = {
      ...currentHsl,
      [color]: {
        ...(currentHsl[color] || {}),
        [channel]: value,
      },
    };
    setState({ adjustments: { ...getState().adjustments, hsl } });
    $(`hsl-val-${color}-${channel}`).textContent = value;
    scheduleApply();
  }
}

function autoEnhance() {
  const source = getState().currentImageData || getState().history[0];
  if (!source) { showToast('Load a photo first'); return; }
  const stats = analyzeImage(source);
  const blackPoint = Math.min(18, Math.max(0, Math.round(stats.p02 / 255 * 100) - 1));
  const whitePoint = Math.max(72, Math.min(115, Math.round(stats.p98 / 255 * 100) + 4));
  const exposure = Math.round((128 - stats.mean) / 5);
  const shadows = stats.mean < 105 ? 18 : 6;
  const highlights = stats.p98 > 238 ? -18 : -6;
  const contrast = stats.spread < 110 ? 12 : 4;
  const vibrance = stats.saturation < 0.18 ? 18 : 8;
  const clarity = stats.spread < 125 ? 12 : 6;
  const dehaze = stats.p02 > 35 ? 8 : 3;
  const gamma = Math.round((118 - stats.median) / 3);

  const adjustments = {
    ...getState().adjustments,
    blackPoint,
    whitePoint,
    gamma,
    exposure,
    shadows,
    highlights,
    contrast,
    vibrance,
    clarity,
    dehaze,
  };
  setState({ adjustments });
  syncAdjustmentControls();
  scheduleApply();
  showToast('Auto enhance applied');
}

function analyzeImage(imageData) {
  const hist = new Uint32Array(256);
  const d = imageData.data;
  let total = 0;
  let saturation = 0;
  for (let i = 0; i < d.length; i += 4) {
    const lum = Math.round(d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722);
    hist[lum]++;
    total += lum;
    const max = Math.max(d[i], d[i + 1], d[i + 2]);
    const min = Math.min(d[i], d[i + 1], d[i + 2]);
    saturation += max ? (max - min) / max : 0;
  }
  const pixels = d.length / 4;
  const percentile = pct => {
    const target = pixels * pct;
    let sum = 0;
    for (let i = 0; i < hist.length; i++) {
      sum += hist[i];
      if (sum >= target) return i;
    }
    return 255;
  };
  const p02 = percentile(0.02);
  const p50 = percentile(0.5);
  const p98 = percentile(0.98);
  return {
    p02,
    p98,
    median: p50,
    mean: total / pixels,
    spread: p98 - p02,
    saturation: saturation / pixels,
  };
}

function resetProAdjustments() {
  const adjustments = { ...getState().adjustments };
  for (const control of PRO_TONE_CONTROLS) adjustments[control.key] = control.value;
  delete adjustments.hsl;
  delete adjustments.splitTone;
  delete adjustments.toneCurve;
  delete adjustments.colorBalance;
  setState({ adjustments });
  syncAdjustmentControls();
  scheduleApply();
  showToast('Pro adjustments reset');
}

function syncAdjustmentControls() {
  const adjustments = getState().adjustments;
  document.querySelectorAll('[data-adj]').forEach(input => {
    const key = input.dataset.adj;
    const value = adjustments[key] ?? 0;
    input.value = value;
    $(`adj-val-${key}`).textContent = value;
  });
  for (const control of PRO_TONE_CONTROLS) {
    const value = adjustments[control.key] ?? control.value;
    const input = document.querySelector(`[data-pro-group="tone"][data-pro-key="${control.key}"]`);
    if (input) input.value = value;
    const label = $(`pro-val-tone-${control.key}`);
    if (label) label.textContent = value;
  }
  for (const control of SPLIT_TONE_CONTROLS) {
    const value = adjustments.splitTone?.[control.key] ?? control.value;
    const input = document.querySelector(`[data-pro-group="split"][data-pro-key="${control.key}"]`);
    if (input) input.value = value;
    const label = $(`pro-val-split-${control.key}`);
    if (label) label.textContent = value;
  }
  for (const control of CURVE_CONTROLS) {
    const value = adjustments.toneCurve?.[control.key] ?? control.value;
    const input = document.querySelector(`[data-pro-group="curve"][data-pro-key="${control.key}"]`);
    if (input) input.value = value;
    const label = $(`pro-val-curve-${control.key}`);
    if (label) label.textContent = value;
  }
  for (const range of COLOR_BALANCE_RANGES) {
    for (const control of COLOR_BALANCE_CONTROLS) {
      const value = adjustments.colorBalance?.[range]?.[control.key] ?? 0;
      const input = document.querySelector(`[data-color-balance-range="${range}"][data-color-balance-key="${control.key}"]`);
      if (input) input.value = value;
      const label = $(`cb-val-${range}-${control.key}`);
      if (label) label.textContent = value;
    }
  }
  for (const color of HSL_COLORS) {
    for (const channel of ['h', 's', 'l']) {
      const value = adjustments.hsl?.[color]?.[channel] ?? 0;
      const input = document.querySelector(`[data-hsl-color="${color}"][data-hsl-channel="${channel}"]`);
      if (input) input.value = value;
      const label = $(`hsl-val-${color}-${channel}`);
      if (label) label.textContent = value;
    }
  }
}

function updateHistogram(imageData) {
  const canvas = $('histogram-canvas');
  if (!canvas) return;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#07070b';
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (!imageData) return;

  const channels = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    channels[0][d[i]]++;
    channels[1][d[i + 1]]++;
    channels[2][d[i + 2]]++;
  }
  const max = Math.max(...channels.flatMap(channel => Array.from(channel)));
  const colors = ['rgba(255,70,82,0.65)', 'rgba(46,213,115,0.55)', 'rgba(84,160,255,0.65)'];
  channels.forEach((hist, channelIndex) => {
    context.fillStyle = colors[channelIndex];
    for (let i = 0; i < hist.length; i++) {
      const x = i / 255 * canvas.width;
      const barHeight = Math.sqrt(hist[i] / max) * canvas.height;
      context.fillRect(x, canvas.height - barHeight, Math.max(1, canvas.width / 256), barHeight);
    }
  });
}

function autoColor() {
  const source = getState().currentImageData || getState().history[0];
  if (!source) { showToast('Load a photo first'); return; }
  const d = source.data;
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < d.length; i += 16) {
    r += d[i]; g += d[i + 1]; b += d[i + 2]; count++;
  }
  r /= count; g /= count; b /= count;
  const avg = (r + g + b) / 3;
  const temperature = Math.round((b - r) / 3);
  const tint = Math.round((avg - g) / 2.8);
  const adjustments = {
    ...getState().adjustments,
    temperature: Math.max(-45, Math.min(45, temperature)),
    tint: Math.max(-45, Math.min(45, tint)),
    vibrance: Math.max(getState().adjustments.vibrance || 0, 10),
  };
  setState({ adjustments });
  syncAdjustmentControls();
  scheduleApply();
  showToast('Auto color applied');
}

function openRetouchOptions() {
  retouchActive = true;
  const options = $('tool-options');
  options.classList.remove('hidden');
  options.innerHTML = `
    <div class="retouch-panel">
      <div class="tool-options-header">
        <strong>Retouch Brush</strong>
        <button id="btn-retouch-close" class="topbar-btn" aria-label="Close retouch">×</button>
      </div>
      <div class="retouch-modes">
        ${RETOUCH_MODES.map(mode => `<button class="retouch-mode${mode.id === retouchMode ? ' active' : ''}" data-retouch-mode="${mode.id}">${mode.label}</button>`).join('')}
      </div>
      <label class="pro-slider"><span>Size<strong id="retouch-size-value">${retouchSize}</strong></span><input id="retouch-size" type="range" min="8" max="140" value="${retouchSize}" /></label>
      <label class="pro-slider"><span>Strength<strong id="retouch-strength-value">${retouchStrength}</strong></span><input id="retouch-strength" type="range" min="5" max="100" value="${retouchStrength}" /></label>
      <p class="retouch-help">Paint directly on the image. Undo works after each stroke.</p>
    </div>
  `;
  options.querySelectorAll('[data-retouch-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      retouchMode = btn.dataset.retouchMode;
      options.querySelectorAll('.retouch-mode').forEach(item => item.classList.toggle('active', item === btn));
    });
  });
  $('retouch-size')?.addEventListener('input', e => {
    retouchSize = parseInt(e.target.value, 10);
    $('retouch-size-value').textContent = retouchSize;
  });
  $('retouch-strength')?.addEventListener('input', e => {
    retouchStrength = parseInt(e.target.value, 10);
    $('retouch-strength-value').textContent = retouchStrength;
  });
  $('btn-retouch-close')?.addEventListener('click', closeRetouchOptions);
  showToast('Paint on the photo to retouch');
}

function closeRetouchOptions() {
  retouchActive = false;
  retouchPainting = false;
  retouchBase = null;
  const options = $('tool-options');
  if (options) {
    options.classList.add('hidden');
    options.innerHTML = '';
  }
  toolsGrid.querySelectorAll('.tool-btn.active').forEach(btn => btn.classList.remove('active'));
}

function getCanvasPoint(e) {
  const rect = mainCanvas.getBoundingClientRect();
  return {
    x: Math.round((e.clientX - rect.left) * mainCanvas.width / rect.width),
    y: Math.round((e.clientY - rect.top) * mainCanvas.height / rect.height),
  };
}

function startRetouchStroke(e) {
  if (!retouchActive || !getState().currentImageData) return;
  e.preventDefault();
  retouchPainting = true;
  retouchBase = cloneImageData(getState().currentImageData);
  mainCanvas.setPointerCapture?.(e.pointerId);
  paintRetouch(e);
}

function moveRetouchStroke(e) {
  if (!retouchActive || !retouchPainting) return;
  e.preventDefault();
  paintRetouch(e);
}

function endRetouchStroke() {
  if (!retouchPainting) return;
  retouchPainting = false;
  const data = getState().currentImageData;
  if (data) {
    pushHistory(data);
    const history = [...getState().history];
    history[0] = cloneImageData(data);
    setState({ history, activePreset: null });
  }
  retouchBase = null;
}

function paintRetouch(e) {
  const state = getState();
  const current = state.currentImageData;
  if (!current) return;
  const point = getCanvasPoint(e);
  const data = cloneImageData(current);
  applyRetouchBrush(data, point.x, point.y, retouchSize, retouchStrength, retouchMode, retouchBase || current);
  setState({ currentImageData: data });
  renderCanvas(data);
}

function applyRetouchBrush(imageData, cx, cy, size, strength, mode, baseImage) {
  const d = imageData.data;
  const base = baseImage.data;
  const w = imageData.width;
  const h = imageData.height;
  const radius = Math.max(2, Math.round(size / 2));
  const amount = strength / 100;
  const x0 = Math.max(0, cx - radius), x1 = Math.min(w - 1, cx + radius);
  const y0 = Math.max(0, cy - radius), y1 = Math.min(h - 1, cy + radius);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;
      const feather = (1 - dist / radius) * amount;
      const i = (y * w + x) * 4;
      let r = d[i], g = d[i + 1], b = d[i + 2];

      if (mode === 'dodge') {
        r += 45 * feather; g += 45 * feather; b += 45 * feather;
      } else if (mode === 'burn') {
        r -= 45 * feather; g -= 45 * feather; b -= 45 * feather;
      } else if (mode === 'saturate' || mode === 'desaturate') {
        const gray = r * 0.2126 + g * 0.7152 + b * 0.0722;
        const sat = mode === 'saturate' ? 1 + feather : 1 - feather;
        r = gray + (r - gray) * sat;
        g = gray + (g - gray) * sat;
        b = gray + (b - gray) * sat;
      } else if (mode === 'blur' || mode === 'sharpen') {
        const avg = sampleLocalAverage(base, w, h, x, y, Math.max(1, Math.round(radius / 8)));
        if (mode === 'blur') {
          r = r * (1 - feather) + avg[0] * feather;
          g = g * (1 - feather) + avg[1] * feather;
          b = b * (1 - feather) + avg[2] * feather;
        } else {
          r += (r - avg[0]) * feather * 1.4;
          g += (g - avg[1]) * feather * 1.4;
          b += (b - avg[2]) * feather * 1.4;
        }
      }

      d[i] = Math.min(255, Math.max(0, r));
      d[i + 1] = Math.min(255, Math.max(0, g));
      d[i + 2] = Math.min(255, Math.max(0, b));
    }
  }
}

function sampleLocalAverage(data, w, h, cx, cy, radius) {
  let r = 0, g = 0, b = 0, count = 0;
  for (let y = Math.max(0, cy - radius); y <= Math.min(h - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(w - 1, cx + radius); x++) {
      const i = (y * w + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
    }
  }
  return [r / count, g / count, b / count];
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
  toolsGrid.innerHTML = TOOL_GROUPS.map(group => `
    <div class="tool-group-label">${group.label}</div>
    <div class="tool-group-grid">
      ${group.tools.map(t => `<button class="tool-btn" data-tool="${t.id}"><span style="font-size:20px">${t.icon}</span>${t.label}</button>`).join('')}
    </div>
  `).join('');
  toolsGrid.addEventListener('click', e => {
    const btn = e.target.closest('.tool-btn');
    if (btn) handleTool(btn.dataset.tool);
  });
}

function markToolActive(toolId) {
  toolsGrid.querySelectorAll('.tool-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === toolId);
  });
}

// ===== Customizable tool dialog framework =====
let activeDialog = null;
let dialogPreviewTimer = null;

function previewToCanvas(imageData) {
  if (!imageData) return;
  if (mainCanvas.width !== imageData.width || mainCanvas.height !== imageData.height) {
    mainCanvas.width = imageData.width;
    mainCanvas.height = imageData.height;
  }
  ctx.putImageData(imageData, 0, 0);
  updateHistogram(imageData);
}

function commitDialogResult(result, message) {
  if (mainCanvas.width !== result.width || mainCanvas.height !== result.height) {
    mainCanvas.width = result.width;
    mainCanvas.height = result.height;
  }
  setState({ currentImageData: result });
  pushHistory(result);
  const newHistory = [...getState().history];
  newHistory[0] = result;
  setState({ history: newHistory, activePreset: null });
  renderCanvas(result);
  if (message) showToast(message);
}

function openFilterDialog(toolId) {
  const cfg = TOOL_DIALOGS[toolId];
  if (!cfg) return;
  if (!getState().currentImageData) { showToast('Load a photo first'); return; }
  if (activeDialog) cancelDialog();
  closeRetouchOptions();

  const params = {};
  cfg.controls.forEach(control => { params[control.key] = control.default; });
  activeDialog = { id: toolId, cfg, base: cloneImageData(getState().currentImageData), params, lastResult: null };
  renderDialogUI();
  markToolActive(toolId);
  scheduleDialogPreview();
}

function renderDialogControl(control, value) {
  const suffix = control.suffix || '';
  if (control.type === 'range') {
    return `<label class="pro-slider"><span>${control.label}<strong id="dlg-val-${control.key}">${value}${suffix}</strong></span>
      <input type="range" min="${control.min}" max="${control.max}" step="${control.step || 1}" value="${value}" data-dialog-key="${control.key}" data-dialog-type="range" /></label>`;
  }
  if (control.type === 'color') {
    return `<label class="dialog-row"><span>${control.label}</span>
      <input type="color" value="${value}" data-dialog-key="${control.key}" data-dialog-type="color" /></label>`;
  }
  if (control.type === 'select') {
    return `<label class="dialog-row"><span>${control.label}</span>
      <select data-dialog-key="${control.key}" data-dialog-type="select">${control.options.map(o => `<option value="${o.value}"${o.value === value ? ' selected' : ''}>${o.label}</option>`).join('')}</select></label>`;
  }
  if (control.type === 'checkbox') {
    return `<label class="dialog-row dialog-check"><span>${control.label}</span>
      <input type="checkbox"${value ? ' checked' : ''} data-dialog-key="${control.key}" data-dialog-type="checkbox" /></label>`;
  }
  if (control.type === 'text') {
    return `<label class="dialog-row dialog-text"><span>${control.label}</span>
      <input type="text" value="${escapeHtml(String(value))}" maxlength="80" data-dialog-key="${control.key}" data-dialog-type="text" /></label>`;
  }
  return '';
}

function renderDialogUI() {
  const { cfg, params } = activeDialog;
  const options = $('tool-options');
  options.classList.remove('hidden');
  options.innerHTML = `
    <div class="tool-dialog">
      <div class="tool-options-header">
        <strong>${cfg.icon || ''} ${escapeHtml(cfg.title)}</strong>
        <button data-dialog-action="cancel" class="topbar-btn" aria-label="Cancel">×</button>
      </div>
      <div class="tool-dialog-controls">
        ${cfg.controls.map(control => renderDialogControl(control, params[control.key])).join('')}
      </div>
      <div class="tool-dialog-actions">
        <button class="btn btn-secondary" data-dialog-action="reset">Reset</button>
        <button class="btn btn-secondary" data-dialog-action="cancel">Cancel</button>
        <button class="btn btn-primary" data-dialog-action="apply">Apply</button>
      </div>
    </div>`;
  options.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function findDialogControl(key) {
  return activeDialog?.cfg.controls.find(control => control.key === key);
}

function onDialogInput(e) {
  if (!activeDialog) return;
  const el = e.target.closest('[data-dialog-key]');
  if (!el) return;
  const key = el.dataset.dialogKey;
  const type = el.dataset.dialogType;
  let value;
  if (type === 'range') {
    value = parseFloat(el.value);
    const label = $(`dlg-val-${key}`);
    if (label) label.textContent = value + (findDialogControl(key)?.suffix || '');
  } else if (type === 'checkbox') {
    value = el.checked;
  } else {
    value = el.value;
  }
  activeDialog.params[key] = value;
  scheduleDialogPreview();
}

function onDialogClick(e) {
  const action = e.target.closest('[data-dialog-action]')?.dataset.dialogAction;
  if (!action || !activeDialog) return;
  if (action === 'apply') applyDialog();
  else if (action === 'cancel') cancelDialog();
  else if (action === 'reset') resetDialog();
}

function scheduleDialogPreview() {
  clearTimeout(dialogPreviewTimer);
  dialogPreviewTimer = setTimeout(renderDialogPreview, 45);
}

function renderDialogPreview() {
  if (!activeDialog) return;
  try {
    const result = activeDialog.cfg.render(cloneImageData(activeDialog.base), activeDialog.params);
    activeDialog.lastResult = result;
    previewToCanvas(result);
  } catch (err) {
    console.warn('Dialog preview failed', err);
  }
}

function applyDialog() {
  if (!activeDialog) return;
  const { cfg, base, params } = activeDialog;
  const result = cfg.render(cloneImageData(base), params);
  commitDialogResult(result, cfg.toast || `${cfg.title} applied`);
  finishDialog();
}

function cancelDialog() {
  if (!activeDialog) return;
  previewToCanvas(activeDialog.base);
  finishDialog();
}

function resetDialog() {
  if (!activeDialog) return;
  activeDialog.cfg.controls.forEach(control => { activeDialog.params[control.key] = control.default; });
  renderDialogUI();
  renderDialogPreview();
}

function finishDialog() {
  clearTimeout(dialogPreviewTimer);
  activeDialog = null;
  const options = $('tool-options');
  options.classList.add('hidden');
  options.innerHTML = '';
  toolsGrid.querySelectorAll('.tool-btn.active').forEach(btn => btn.classList.remove('active'));
}

// ===== Render helpers for size/text-changing tools =====
function renderResize(base, p) {
  const scale = p.percent / 100;
  const nw = Math.max(1, Math.round(base.width * scale));
  const nh = Math.max(1, Math.round(base.height * scale));
  const src = createWorkCanvas(base.width, base.height);
  src.getContext('2d').putImageData(base, 0, 0);
  const oc = createWorkCanvas(nw, nh);
  const c = oc.getContext('2d');
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(src, 0, 0, nw, nh);
  return c.getImageData(0, 0, nw, nh);
}

function computeTextAnchor(position, w, h, pad) {
  const [vert, horiz = 'center'] = position.split('-');
  let x, align;
  if (horiz === 'left') { x = pad; align = 'left'; }
  else if (horiz === 'right') { x = w - pad; align = 'right'; }
  else { x = w / 2; align = 'center'; }
  let y, baseline;
  if (vert === 'top') { y = pad; baseline = 'top'; }
  else if (vert === 'bottom') { y = h - pad; baseline = 'alphabetic'; }
  else { y = h / 2; baseline = 'middle'; }
  return { x, y, align, baseline };
}

function renderTextOverlay(base, p) {
  const w = base.width, h = base.height;
  const oc = createWorkCanvas(w, h);
  const c = oc.getContext('2d');
  c.putImageData(base, 0, 0);
  const fs = Math.max(8, Math.round(w * (p.size / 100)));
  c.font = `${p.bold ? 'bold ' : ''}${fs}px ${p.font}`;
  c.fillStyle = p.color;
  c.globalAlpha = Math.min(1, Math.max(0, p.opacity / 100));
  const pad = Math.max(8, Math.round(fs * 0.5));
  const anchor = computeTextAnchor(p.position, w, h, pad);
  c.textAlign = anchor.align;
  c.textBaseline = anchor.baseline;
  c.shadowColor = 'rgba(0,0,0,0.45)';
  c.shadowBlur = Math.max(2, fs * 0.08);
  c.fillText(p.text || '', anchor.x, anchor.y);
  c.globalAlpha = 1;
  return c.getImageData(0, 0, w, h);
}

function formatTimestamp(fmt) {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  switch (fmt) {
    case 'dmy': return `${dd}/${mm}/${yyyy}`;
    case 'mdy': return `${mm}/${dd}/${yyyy}`;
    case 'full': return `${months[d.getMonth()]} ${dd}, ${yyyy}`;
    case 'datetime': return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
    case 'ymd':
    default: return `'${yy} ${mm} ${dd}`;
  }
}

function renderTimestamp(base, p) {
  const w = base.width, h = base.height;
  const oc = createWorkCanvas(w, h);
  const c = oc.getContext('2d');
  c.putImageData(base, 0, 0);
  const fs = Math.max(12, Math.round(w * (p.size / 100)));
  c.font = `${fs}px "VT323", monospace`;
  c.fillStyle = p.color;
  const pad = Math.max(8, Math.round(fs * 0.5));
  const anchor = computeTextAnchor(p.position, w, h, pad);
  c.textAlign = anchor.align;
  c.textBaseline = anchor.baseline;
  c.shadowColor = 'rgba(0,0,0,0.5)';
  c.shadowBlur = Math.max(2, fs * 0.1);
  c.fillText(formatTimestamp(p.format), anchor.x, anchor.y);
  return c.getImageData(0, 0, w, h);
}

function roundRectPath(c, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + radius, y);
  c.arcTo(x + w, y, x + w, y + h, radius);
  c.arcTo(x + w, y + h, x, y + h, radius);
  c.arcTo(x, y + h, x, y, radius);
  c.arcTo(x, y, x + w, y, radius);
  c.closePath();
}

function renderBorder(base, p) {
  const w = base.width, h = base.height;
  const bs = Math.max(4, Math.round(Math.min(w, h) * (p.size / 100)));
  let bg = p.color;
  let extraBottom = 0;
  if (p.style === 'white') bg = '#ffffff';
  else if (p.style === 'black' || p.style === 'film') bg = '#0d0d0d';
  else if (p.style === 'polaroid') { bg = '#f7f4ec'; extraBottom = Math.round(bs * 2.4); }

  const ow = w + bs * 2;
  const oh = h + bs * 2 + extraBottom;
  const oc = createWorkCanvas(ow, oh);
  const c = oc.getContext('2d');
  c.fillStyle = bg;
  c.fillRect(0, 0, ow, oh);

  const src = createWorkCanvas(w, h);
  src.getContext('2d').putImageData(base, 0, 0);

  if (p.style === 'rounded') {
    c.save();
    roundRectPath(c, bs, bs, w, h, bs);
    c.clip();
    c.drawImage(src, bs, bs);
    c.restore();
  } else {
    c.drawImage(src, bs, bs);
  }

  if (p.style === 'film') {
    const lw = Math.max(1, Math.round(bs * 0.08));
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = lw;
    c.strokeRect(bs - lw, bs - lw, w + lw * 2, h + lw * 2);
  }

  return c.getImageData(0, 0, ow, oh);
}

function handleTool(tool) {
  const state = getState();

  // Library / preset actions don't require a loaded image.
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

  // Switching tools cancels any in-progress dialog or retouch session.
  if (activeDialog && tool !== activeDialog.id) cancelDialog();
  if (retouchActive && tool !== 'retouch') closeRetouchOptions();

  if (tool === 'crop') { startCrop(); return; }
  if (tool === 'retouch') { openRetouchOptions(); markToolActive('retouch'); return; }
  if (tool === 'auto-tone') { autoEnhance(); return; }
  if (tool === 'auto-color') { autoColor(); return; }
  if (tool === 'rotate-cw' || tool === 'rotate-ccw') { rotateImage(tool === 'rotate-cw'); return; }
  if (tool === 'flip-h' || tool === 'flip-v') { flipImage(tool === 'flip-h'); return; }

  if (TOOL_DIALOGS[tool]) { openFilterDialog(tool); return; }

  showToast(`${tool} coming soon!`);
}

function rotateImage(clockwise) {
  const data = getState().currentImageData;
  const w = data.width, h = data.height;
  const oc = createWorkCanvas(h, w);
  const octx = oc.getContext('2d');
  const src = createWorkCanvas(w, h);
  src.getContext('2d').putImageData(data, 0, 0);
  octx.translate(clockwise ? h : 0, clockwise ? 0 : w);
  octx.rotate(clockwise ? Math.PI / 2 : -Math.PI / 2);
  octx.drawImage(src, 0, 0);
  mainCanvas.width = h; mainCanvas.height = w;
  const nd = octx.getImageData(0, 0, h, w);
  commitDialogResult(nd, clockwise ? 'Rotated right' : 'Rotated left');
}

function flipImage(horizontal) {
  const data = getState().currentImageData;
  const w = data.width, h = data.height;
  const oc = createWorkCanvas(w, h);
  const octx = oc.getContext('2d');
  const src = createWorkCanvas(w, h);
  src.getContext('2d').putImageData(data, 0, 0);
  if (horizontal) { octx.translate(w, 0); octx.scale(-1, 1); }
  else { octx.translate(0, h); octx.scale(1, -1); }
  octx.drawImage(src, 0, 0);
  const nd = octx.getImageData(0, 0, w, h);
  commitDialogResult(nd, horizontal ? 'Flipped horizontally' : 'Flipped vertically');
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
  mainCanvas.addEventListener('pointerdown', startRetouchStroke);
  mainCanvas.addEventListener('pointermove', moveRetouchStroke);
  window.addEventListener('pointerup', endRetouchStroke);

  const toolOptions = $('tool-options');
  toolOptions?.addEventListener('input', onDialogInput);
  toolOptions?.addEventListener('change', onDialogInput);
  toolOptions?.addEventListener('click', onDialogClick);

  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    const f = e.dataTransfer?.files[0];
    if (f && f.type.startsWith('image/')) loadImageFromFile(f);
  });
}

function switchPanel(panel) {
  if (panel !== 'tools') {
    if (activeDialog) cancelDialog();
    if (retouchActive) closeRetouchOptions();
  }
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
