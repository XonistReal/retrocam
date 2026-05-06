const listeners = new Map();
const state = {
  imageLoaded: false,
  originalImage: null,
  currentImageData: null,
  activePreset: null,
  presetIntensity: 100,
  activeCategory: 'all',
  activePanel: 'presets',
  activeTool: null,
  panelOpen: false,
  adjustments: {
    brightness: 0, contrast: 0, exposure: 0, saturation: 0,
    vibrance: 0, temperature: 0, tint: 0, highlights: 0,
    shadows: 0, sharpness: 0, blur: 0, vignette: 0, grain: 0, fade: 0,
  },
  history: [], historyIndex: -1, compareMode: false,
};

export function getState() { return state; }

export function setState(updates) {
  const prev = { ...state };
  Object.assign(state, updates);
  for (const [key, cbs] of listeners) {
    if (key in updates) cbs.forEach(cb => cb(state[key], prev[key]));
  }
  if (listeners.has('*')) listeners.get('*').forEach(cb => cb(state, prev));
}

export function subscribe(key, callback) {
  if (!listeners.has(key)) listeners.set(key, []);
  listeners.get(key).push(callback);
  return () => {
    const arr = listeners.get(key);
    const idx = arr.indexOf(callback);
    if (idx > -1) arr.splice(idx, 1);
  };
}

export function pushHistory(imageData) {
  state.history = state.history.slice(0, state.historyIndex + 1);
  const clone = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  state.history.push(clone);
  state.historyIndex = state.history.length - 1;
  if (state.history.length > 30) { state.history.shift(); state.historyIndex--; }
  notifyHistoryButtons();
}

export function undo() {
  if (state.historyIndex > 0) {
    state.historyIndex--;
    const d = state.history[state.historyIndex];
    state.currentImageData = new ImageData(new Uint8ClampedArray(d.data), d.width, d.height);
    notifyHistoryButtons();
    return state.currentImageData;
  }
  return null;
}

export function redo() {
  if (state.historyIndex < state.history.length - 1) {
    state.historyIndex++;
    const d = state.history[state.historyIndex];
    state.currentImageData = new ImageData(new Uint8ClampedArray(d.data), d.width, d.height);
    notifyHistoryButtons();
    return state.currentImageData;
  }
  return null;
}

function notifyHistoryButtons() {
  if (listeners.has('history')) {
    listeners.get('history').forEach(cb => cb({
      canUndo: state.historyIndex > 0,
      canRedo: state.historyIndex < state.history.length - 1,
    }));
  }
}
