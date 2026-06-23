// Effects engine - applies all pixel-level effects via Canvas 2D

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

const clamp = value => Math.min(255, Math.max(0, value));
const mix = (a, b, t) => a * (1 - t) + b * t;
const luminance = (data, index) => data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
const smoothstep = (edge0, edge1, value) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0 || 1)));
  return t * t * (3 - 2 * t);
};

function parseHexColor(hex) {
  const value = hex.replace('#', '');
  const normalized = value.length === 3
    ? value.split('').map(char => char + char).join('')
    : value.padEnd(6, '0').slice(0, 6);

  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

function hueWeight(hue, center, width) {
  const dist = Math.abs(((hue - center + 540) % 360) - 180);
  return Math.max(0, 1 - dist / width);
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }

  return [h, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }

  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function canvasToBlob(canvas, type, quality) {
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

async function blobToDrawable(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      // WebKit can expose createImageBitmap but fail for certain encoded blobs.
    }
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image decode failed'));
    };
    image.src = url;
  });
}

export function applyEffects(imageData, fx, intensity = 100) {
  const factor = intensity / 100;
  // Use a consistent reference resolution (1200px) for spatial effects
  const referenceWidth = fx.previewReferenceWidth || imageData.width;
  const resScale = referenceWidth / 1200;
  const w = imageData.width, h = imageData.height;
  const data = new Uint8ClampedArray(imageData.data);

  // Levels and gamma are applied before tone/color work, like a base correction layer.
  if (fx.blackPoint || fx.whitePoint || fx.gamma) applyLevels(data, fx.blackPoint || 0, fx.whitePoint ?? 100, fx.gamma || 0);
  // Curves emulate Photoshop point-curve shaping with regional luminance handles.
  if (fx.toneCurve) applyToneCurve(data, fx.toneCurve, factor);
  // Brightness
  if (fx.brightness) applyBrightness(data, fx.brightness * factor);
  // Contrast
  if (fx.contrast) applyContrast(data, fx.contrast * factor);
  // Exposure
  if (fx.exposure) applyExposure(data, fx.exposure * factor);
  // Saturation
  if (fx.saturation) applySaturation(data, fx.saturation * factor);
  // Vibrance protects already-saturated colors and skin tones better than saturation.
  if (fx.vibrance) applyVibrance(data, fx.vibrance * factor);
  // Temperature
  if (fx.temperature) applyTemperature(data, fx.temperature * factor);
  // Tint
  if (fx.tint) applyTint(data, fx.tint * factor);
  // Color balance targets tonal regions like Photoshop's Color Balance adjustment.
  if (fx.colorBalance) applyColorBalance(data, fx.colorBalance, factor);
  // Highlights/Shadows
  if (fx.highlights) applyHighlights(data, fx.highlights * factor);
  if (fx.shadows) applyShadows(data, fx.shadows * factor);
  // Fade (lift blacks)
  if (fx.fade) applyFade(data, fx.fade * factor);
  // Bit depth reduction
  if (fx.bitDepth) applyBitDepth(data, fx.bitDepth);
  // Thermal
  if (fx.thermal) applyThermal(data);
  // Direct flash / low dynamic range looks
  if (fx.flash) applyFlash(data, w, h, fx.flash * factor);

  let result = new ImageData(data, w, h);

  // Local-contrast tools
  if (fx.clarity) result = applyClarity(result, fx.clarity * factor);
  if (fx.dehaze) result = applyDehaze(result, fx.dehaze * factor);
  // Targeted color work
  if (fx.hsl) result = applyHslMixer(result, fx.hsl, factor);
  if (fx.splitTone) result = applySplitTone(result, fx.splitTone, factor);
  // Print / specialty color processes
  if (fx.duotone) result = applyDuotone(result, fx.duotone, factor);
  if (fx.solarize) result = applySolarize(result, fx.solarize * factor);
  if (fx.infrared) result = applyInfrared(result, fx.infrared * factor);
  // Channel shift (RGB split) - scale with resolution
  if (fx.channelShift) result = applyChannelShift(result, Math.round(fx.channelShift * factor * resScale));
  // Scanlines
  if (fx.scanlines) result = applyScanlines(result, fx.scanlines * factor);
  // Grain
  if (fx.grain) result = applyGrain(result, fx.grain * factor, resScale);
  // Vignette
  if (fx.vignette) result = applyVignette(result, fx.vignette * factor);
  // Dust
  if (fx.dust) result = applyDust(result, fx.dust * factor);
  // Scratches
  if (fx.scratches) result = applyScratches(result, fx.scratches * factor);
  // Light leaks
  if (fx.lightleak) result = applyLightLeak(result, fx.lightleak * factor);
  // Halation (bloom on highlights) - scale with resolution
  if (fx.halation) result = applyHalation(result, fx.halation * factor * resScale);
  // Chromatic aberration - scale with resolution
  if (fx.chromatic) result = applyChromaticAberration(result, fx.chromatic * factor * resScale);
  // Lens distortion (Barrel / Fisheye)
  if (fx.barrel || fx.fisheye || fx.pincushion) {
    const strength = ((fx.barrel || 0) + (fx.fisheye || 0) - (fx.pincushion || 0)) * factor;
    result = applyLensDistortion(result, strength);
  }
  // Optical specialty effects
  if (fx.tiltshift) result = applyTiltShift(result, typeof fx.tiltshift === 'number' ? fx.tiltshift * factor : 55 * factor);
  if (fx.doubleExposure) result = applyDoubleExposure(result, fx.doubleExposure * factor);
  if (fx.anamorphic) result = applyAnamorphicFlare(result, fx.anamorphic * factor);
  // Datamosh simulation
  if (fx.datamosh) result = applyDatamosh(result, fx.datamosh * factor);
  // Pixel sorting glitch
  if (fx.pixelSort) result = applyPixelSort(result, fx.pixelSort, factor);
  // Color reduction
  if (fx.colorReduce) result = applyColorReduction(result, fx.colorReduce, fx.dither);
  if (fx.posterize) result = applyPosterize(result, fx.posterize);
  if (fx.threshold) result = applyThreshold(result, fx.threshold);
  if (fx.invert) result = applyInvert(result, factor);
  // Pixelate - scale with resolution
  if (fx.pixelate) result = applyPixelate(result, Math.round(fx.pixelate * factor * resScale));
  // Halftone/dot-matrix print texture should sit on top of the image.
  if (fx.halftone) result = applyHalftone(result, fx.halftone * factor, fx.halftoneColor);
  // Preset profile finishing adds filmic rolloff, tasteful color bias, and skin protection.
  if (fx.profile) result = applyPresetProfile(result, fx.profile, factor);

  return result;
}

// Apply JPEG compression via canvas (async because toBlob is async)
export async function applyJPEGCompression(canvas, quality, passes = 1) {
  let c = canvas;
  for (let i = 0; i < passes; i++) {
    const blob = await canvasToBlob(c, 'image/jpeg', quality / 100);
    const img = await blobToDrawable(blob);
    const oc = createWorkCanvas(canvas.width, canvas.height);
    const ctx = oc.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.close?.();
    c = oc;
  }
  const ctx = c.getContext('2d');
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// Blur helper using box blur
export function applyBlur(imageData, radius) {
  if (radius <= 0) return imageData;
  const w = imageData.width, h = imageData.height;
  const oc = createWorkCanvas(w, h);
  const ctx = oc.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  // Use canvas filter for blur
  const oc2 = createWorkCanvas(w, h);
  const ctx2 = oc2.getContext('2d');
  if (!('filter' in ctx2)) return applyBoxBlur(imageData, radius);
  ctx2.filter = `blur(${radius}px)`;
  ctx2.drawImage(oc, 0, 0);
  return ctx2.getImageData(0, 0, w, h);
}

function applyBoxBlur(imageData, radius) {
  const w = imageData.width, h = imageData.height;
  const r = Math.max(1, Math.min(8, Math.round(radius)));
  const src = imageData.data;
  const tmp = new Uint8ClampedArray(src.length);
  const out = new Uint8ClampedArray(src.length);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let red = 0, green = 0, blue = 0, alpha = 0, count = 0;
      for (let dx = -r; dx <= r; dx++) {
        const sx = Math.min(w - 1, Math.max(0, x + dx));
        const i = (y * w + sx) * 4;
        red += src[i]; green += src[i + 1]; blue += src[i + 2]; alpha += src[i + 3];
        count++;
      }
      const o = (y * w + x) * 4;
      tmp[o] = red / count; tmp[o + 1] = green / count; tmp[o + 2] = blue / count; tmp[o + 3] = alpha / count;
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let red = 0, green = 0, blue = 0, alpha = 0, count = 0;
      for (let dy = -r; dy <= r; dy++) {
        const sy = Math.min(h - 1, Math.max(0, y + dy));
        const i = (sy * w + x) * 4;
        red += tmp[i]; green += tmp[i + 1]; blue += tmp[i + 2]; alpha += tmp[i + 3];
        count++;
      }
      const o = (y * w + x) * 4;
      out[o] = red / count; out[o + 1] = green / count; out[o + 2] = blue / count; out[o + 3] = alpha / count;
    }
  }

  return new ImageData(out, w, h);
}

// Sharpen using unsharp mask approximation
export function applySharpen(imageData, amount) {
  if (amount <= 0) return imageData;
  const blurred = applyBlur(imageData, 1);
  const d = new Uint8ClampedArray(imageData.data);
  const bd = blurred.data;
  const str = amount / 50;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.min(255, Math.max(0, d[i] + (d[i] - bd[i]) * str));
    d[i+1] = Math.min(255, Math.max(0, d[i+1] + (d[i+1] - bd[i+1]) * str));
    d[i+2] = Math.min(255, Math.max(0, d[i+2] + (d[i+2] - bd[i+2]) * str));
  }
  return new ImageData(d, imageData.width, imageData.height);
}

// --- Per-pixel effects ---
function applyBrightness(data, val) {
  const v = val * 2.55;
  for (let i = 0; i < data.length; i += 4) {
    data[i] += v; data[i+1] += v; data[i+2] += v;
  }
}

function applyLevels(data, blackPoint, whitePoint, gammaValue) {
  const black = Math.min(0.95, Math.max(0, blackPoint / 100));
  const white = Math.max(black + 0.02, Math.min(1.5, whitePoint / 100));
  const gamma = Math.pow(2, -gammaValue / 100);

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let v = (data[i + c] / 255 - black) / (white - black);
      v = Math.min(1, Math.max(0, v));
      data[i + c] = 255 * Math.pow(v, gamma);
    }
  }
}

function applyToneCurve(data, curve, intensity = 1) {
  const controls = {
    shadows: curve.shadows || 0,
    darks: curve.darks || 0,
    lights: curve.lights || 0,
    highlights: curve.highlights || 0,
  };

  for (let i = 0; i < data.length; i += 4) {
    const lum = luminance(data, i) / 255;
    const delta =
      controls.shadows * bell(lum, 0.12, 0.18) +
      controls.darks * bell(lum, 0.35, 0.22) +
      controls.lights * bell(lum, 0.65, 0.22) +
      controls.highlights * bell(lum, 0.88, 0.18);
    const lift = delta * 1.85 * intensity;

    data[i] = clamp(data[i] + lift);
    data[i + 1] = clamp(data[i + 1] + lift);
    data[i + 2] = clamp(data[i + 2] + lift);
  }
}

function bell(value, center, width) {
  const d = (value - center) / width;
  return Math.exp(-d * d);
}

function applyContrast(data, val) {
  const f = (259 * (val * 2.55 + 255)) / (255 * (259 - val * 2.55));
  for (let i = 0; i < data.length; i += 4) {
    data[i] = f * (data[i] - 128) + 128;
    data[i+1] = f * (data[i+1] - 128) + 128;
    data[i+2] = f * (data[i+2] - 128) + 128;
  }
}

function applyExposure(data, val) {
  const m = Math.pow(2, val / 25);
  for (let i = 0; i < data.length; i += 4) {
    data[i] *= m; data[i+1] *= m; data[i+2] *= m;
  }
}

function applySaturation(data, val) {
  const s = 1 + val / 100;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.2126 * data[i] + 0.7152 * data[i+1] + 0.0722 * data[i+2];
    data[i] = gray + s * (data[i] - gray);
    data[i+1] = gray + s * (data[i+1] - gray);
    data[i+2] = gray + s * (data[i+2] - gray);
  }
}

function applyVibrance(data, val) {
  const amount = val / 100;
  for (let i = 0; i < data.length; i += 4) {
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const satGap = (max - avg) / 255;
    const adjustment = amount * (1 - satGap);
    data[i] += (max - data[i]) * adjustment;
    data[i + 1] += (max - data[i + 1]) * adjustment;
    data[i + 2] += (max - data[i + 2]) * adjustment;
  }
}

function applyTemperature(data, val) {
  const t = val * 1.5;
  for (let i = 0; i < data.length; i += 4) {
    data[i] += t; data[i+2] -= t;
  }
}

function applyTint(data, val) {
  const t = val * 1.5;
  for (let i = 0; i < data.length; i += 4) {
    data[i+1] += t;
  }
}

function applyColorBalance(data, balance, intensity = 1) {
  const shadows = balance.shadows || {};
  const midtones = balance.midtones || {};
  const highlights = balance.highlights || {};

  for (let i = 0; i < data.length; i += 4) {
    const lum = luminance(data, i) / 255;
    const weights = {
      shadows: bell(lum, 0.18, 0.24),
      midtones: bell(lum, 0.5, 0.28),
      highlights: bell(lum, 0.82, 0.24),
    };
    const cyanRed = ((shadows.cyanRed || 0) * weights.shadows + (midtones.cyanRed || 0) * weights.midtones + (highlights.cyanRed || 0) * weights.highlights) * intensity;
    const magentaGreen = ((shadows.magentaGreen || 0) * weights.shadows + (midtones.magentaGreen || 0) * weights.midtones + (highlights.magentaGreen || 0) * weights.highlights) * intensity;
    const yellowBlue = ((shadows.yellowBlue || 0) * weights.shadows + (midtones.yellowBlue || 0) * weights.midtones + (highlights.yellowBlue || 0) * weights.highlights) * intensity;

    data[i] = clamp(data[i] + cyanRed * 1.35);
    data[i + 1] = clamp(data[i + 1] + magentaGreen * 1.35);
    data[i + 2] = clamp(data[i + 2] + yellowBlue * 1.35);
  }
}

function applyHighlights(data, val) {
  const v = val * 1.5;
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] + data[i+1] + data[i+2]) / 3;
    if (lum > 170) {
      const f = (lum - 170) / 85;
      data[i] += v * f; data[i+1] += v * f; data[i+2] += v * f;
    }
  }
}

function applyShadows(data, val) {
  const v = val * 1.5;
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] + data[i+1] + data[i+2]) / 3;
    if (lum < 85) {
      const f = 1 - lum / 85;
      data[i] += v * f; data[i+1] += v * f; data[i+2] += v * f;
    }
  }
}

function applyFade(data, val) {
  const lift = val * 0.6;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i] + (lift - data[i]) * (val / 200);
    data[i+1] = data[i+1] + (lift - data[i+1]) * (val / 200);
    data[i+2] = data[i+2] + (lift - data[i+2]) * (val / 200);
  }
}

function applyBitDepth(data, bits) {
  const levels = Math.pow(2, bits);
  const step = 255 / (levels - 1);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(data[i] / step) * step;
    data[i+1] = Math.round(data[i+1] / step) * step;
    data[i+2] = Math.round(data[i+2] / step) * step;
  }
}

function applyThermal(data) {
  for (let i = 0; i < data.length; i += 4) {
    const v = (data[i] + data[i+1] + data[i+2]) / 3 / 255;
    if (v < 0.25) { data[i]=0; data[i+1]=0; data[i+2]=v*4*255; }
    else if (v < 0.5) { data[i]=0; data[i+1]=(v-0.25)*4*255; data[i+2]=255; }
    else if (v < 0.75) { data[i]=(v-0.5)*4*255; data[i+1]=255; data[i+2]=(0.75-v)*4*255; }
    else { data[i]=255; data[i+1]=(1-v)*4*255; data[i+2]=0; }
  }
}

function applyClarity(imageData, amount) {
  if (!amount) return imageData;
  const w = imageData.width, h = imageData.height;
  const blurred = applyBlur(imageData, Math.max(2, Math.min(12, Math.abs(amount) / 6)));
  const src = imageData.data;
  const bd = blurred.data;
  const out = new Uint8ClampedArray(src);
  const strength = amount / 100;

  for (let i = 0; i < src.length; i += 4) {
    const lum = luminance(src, i);
    const midtoneMask = 1 - Math.abs(lum - 128) / 128;
    for (let c = 0; c < 3; c++) {
      const detail = src[i + c] - bd[i + c];
      out[i + c] = clamp(src[i + c] + detail * strength * 1.45 * midtoneMask);
    }
  }

  return new ImageData(out, w, h);
}

function applyDehaze(imageData, amount) {
  if (!amount) return imageData;
  const d = new Uint8ClampedArray(imageData.data);
  const strength = amount / 100;

  for (let i = 0; i < d.length; i += 4) {
    const lum = luminance(d, i);
    const hazeMask = smoothstep(70, 230, lum);
    const contrast = 1 + Math.abs(strength) * 0.35;
    const direction = Math.sign(strength);

    d[i] = clamp((d[i] - 128) * contrast + 128 - direction * hazeMask * 12);
    d[i + 1] = clamp((d[i + 1] - 128) * contrast + 128 - direction * hazeMask * 9);
    d[i + 2] = clamp((d[i + 2] - 128) * contrast + 128 - direction * hazeMask * 4);

    if (strength > 0) {
      const gray = luminance(d, i);
      d[i] = clamp(gray + (d[i] - gray) * (1 + strength * 0.12));
      d[i + 1] = clamp(gray + (d[i + 1] - gray) * (1 + strength * 0.12));
      d[i + 2] = clamp(gray + (d[i + 2] - gray) * (1 + strength * 0.12));
    }
  }

  return new ImageData(d, imageData.width, imageData.height);
}

function applyFlash(data, w, h, strength) {
  const s = strength / 100;
  const cx = w / 2;
  const cy = h * 0.44;
  const maxR = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) / maxR;
      const center = Math.max(0, 1 - dist * 1.55);
      const edge = Math.min(1, dist * 1.3);
      const pop = center * s;
      const falloff = edge * s * 0.55;

      data[i] = clamp(data[i] + 105 * pop - data[i] * falloff);
      data[i + 1] = clamp(data[i + 1] + 92 * pop - data[i + 1] * falloff);
      data[i + 2] = clamp(data[i + 2] + 72 * pop - data[i + 2] * falloff);
    }
  }
}

// --- ImageData-level effects ---
function applyDuotone(imageData, palette, intensity = 1) {
  const d = new Uint8ClampedArray(imageData.data);
  const colors = Array.isArray(palette) ? palette : ['#1d1b16', '#f5d180'];
  const shadow = parseHexColor(colors[0] || '#111111');
  const highlight = parseHexColor(colors[1] || '#f2f2f2');
  const s = Math.min(1, Math.max(0, intensity));

  for (let i = 0; i < d.length; i += 4) {
    const l = luminance(d, i) / 255;
    const curve = smoothstep(0.02, 0.98, l);
    d[i] = mix(d[i], mix(shadow[0], highlight[0], curve), s);
    d[i + 1] = mix(d[i + 1], mix(shadow[1], highlight[1], curve), s);
    d[i + 2] = mix(d[i + 2], mix(shadow[2], highlight[2], curve), s);
  }

  return new ImageData(d, imageData.width, imageData.height);
}

function applyHslMixer(imageData, mixer, intensity = 1) {
  const d = new Uint8ClampedArray(imageData.data);
  const colors = {
    red: { center: 0, width: 36 },
    orange: { center: 32, width: 34 },
    yellow: { center: 58, width: 34 },
    green: { center: 120, width: 55 },
    aqua: { center: 180, width: 42 },
    blue: { center: 225, width: 48 },
    purple: { center: 278, width: 44 },
    magenta: { center: 318, width: 42 },
  };

  for (let i = 0; i < d.length; i += 4) {
    let [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
    let hueShift = 0;
    let satShift = 0;
    let lumShift = 0;

    for (const [name, range] of Object.entries(colors)) {
      const settings = mixer[name];
      if (!settings) continue;
      const weight = hueWeight(h, range.center, range.width);
      if (!weight) continue;
      hueShift += (settings.h || 0) * weight * intensity;
      satShift += (settings.s || 0) * weight * intensity;
      lumShift += (settings.l || 0) * weight * intensity;
    }

    h = (h + hueShift + 360) % 360;
    s = Math.min(1, Math.max(0, s * (1 + satShift / 100)));
    l = Math.min(1, Math.max(0, l + lumShift / 120));
    const [r, g, b] = hslToRgb(h, s, l);
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }

  return new ImageData(d, imageData.width, imageData.height);
}

function applySplitTone(imageData, splitTone, intensity = 1) {
  const d = new Uint8ClampedArray(imageData.data);
  const shadowSat = (splitTone.shadowSat || 0) / 100 * intensity;
  const highlightSat = (splitTone.highlightSat || 0) / 100 * intensity;
  const balance = (splitTone.balance || 0) / 100;
  const shadowColor = hslToRgb(splitTone.shadowHue || 220, 1, 0.5);
  const highlightColor = hslToRgb(splitTone.highlightHue || 42, 1, 0.5);

  for (let i = 0; i < d.length; i += 4) {
    const l = luminance(d, i) / 255;
    const shadowMask = smoothstep(0.75 + balance * 0.2, 0.05, l) * shadowSat;
    const highlightMask = smoothstep(0.35 + balance * 0.2, 1, l) * highlightSat;

    d[i] = clamp(d[i] + shadowColor[0] * shadowMask * 0.22 + highlightColor[0] * highlightMask * 0.22);
    d[i + 1] = clamp(d[i + 1] + shadowColor[1] * shadowMask * 0.22 + highlightColor[1] * highlightMask * 0.22);
    d[i + 2] = clamp(d[i + 2] + shadowColor[2] * shadowMask * 0.22 + highlightColor[2] * highlightMask * 0.22);
  }

  return new ImageData(d, imageData.width, imageData.height);
}

function applySolarize(imageData, strength) {
  const d = new Uint8ClampedArray(imageData.data);
  const s = Math.min(1, Math.max(0, strength / 100));

  for (let i = 0; i < d.length; i += 4) {
    const l = luminance(d, i);
    const threshold = 120;
    const amount = smoothstep(threshold - 30, threshold + 70, l) * s;
    d[i] = mix(d[i], 255 - d[i], amount);
    d[i + 1] = mix(d[i + 1], 255 - d[i + 1], amount * 0.9);
    d[i + 2] = mix(d[i + 2], 255 - d[i + 2], amount * 0.75);
  }

  return new ImageData(d, imageData.width, imageData.height);
}

function applyInfrared(imageData, strength) {
  const d = new Uint8ClampedArray(imageData.data);
  const s = Math.min(1, Math.max(0, strength / 100));

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const foliage = Math.max(0, g - Math.max(r, b) * 0.72) / 255;
    const l = (r * 0.35 + g * 0.55 + b * 0.1);
    const ir = clamp(l + foliage * 135);
    const ig = clamp(l + foliage * 95);
    const ib = clamp(l * 0.82 - foliage * 35);

    d[i] = mix(r, ir, s);
    d[i + 1] = mix(g, ig, s);
    d[i + 2] = mix(b, ib, s);
  }

  return new ImageData(d, imageData.width, imageData.height);
}

function applyChannelShift(imageData, px) {
  if (px <= 0) return imageData;
  const w = imageData.width, h = imageData.height;
  const src = imageData.data;
  const out = new Uint8ClampedArray(src);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const sx = Math.min(w - 1, x + px);
      const si = (y * w + sx) * 4;
      out[i] = src[si]; // shift red right
      const sx2 = Math.max(0, x - px);
      const si2 = (y * w + sx2) * 4;
      out[i + 2] = src[si2 + 2]; // shift blue left
    }
  }
  return new ImageData(out, w, h);
}

function applyScanlines(imageData, strength) {
  const d = new Uint8ClampedArray(imageData.data);
  const w = imageData.width, h = imageData.height;
  const s = strength / 100;
  for (let y = 0; y < h; y++) {
    if (y % 2 === 0) continue;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      d[i] *= (1 - s * 0.5); d[i+1] *= (1 - s * 0.5); d[i+2] *= (1 - s * 0.5);
    }
  }
  return new ImageData(d, w, h);
}

function applyGrain(imageData, amount, resScale = 1) {
  const d = new Uint8ClampedArray(imageData.data);
  const intensity = amount * 1.2;
  for (let i = 0; i < d.length; i += 4) {
    const noise = (Math.random() - 0.5) * intensity;
    d[i] += noise; d[i+1] += noise; d[i+2] += noise;
  }
  return new ImageData(d, imageData.width, imageData.height);
}

function applyVignette(imageData, strength) {
  const d = new Uint8ClampedArray(imageData.data);
  const w = imageData.width, h = imageData.height;
  const cx = w / 2, cy = h / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  const s = strength / 100;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) / maxR;
      const vig = 1 - dist * dist * s * 1.5;
      d[i] *= vig; d[i+1] *= vig; d[i+2] *= vig;
    }
  }
  return new ImageData(d, w, h);
}


function applyLightLeak(imageData, strength) {
  const d = new Uint8ClampedArray(imageData.data);
  const w = imageData.width, h = imageData.height;
  const s = strength / 100;
  // Random warm light leak from a side
  const side = Math.random(); // 0-0.25 = left, etc
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let factor = 0;
      if (side < 0.25) factor = 1 - x / w;
      else if (side < 0.5) factor = x / w;
      else if (side < 0.75) factor = 1 - y / h;
      else factor = y / h;
      factor = Math.pow(factor, 2) * s;
      d[i] = Math.min(255, d[i] + 255 * factor * 0.8);
      d[i+1] = Math.min(255, d[i+1] + 120 * factor * 0.6);
      d[i+2] = Math.min(255, d[i+2] + 50 * factor * 0.3);
    }
  }
  return new ImageData(d, w, h);
}

function applyHalation(imageData, strength) {
  // Simple bloom on bright areas
  const blurred = applyBlur(imageData, Math.max(3, strength / 5));
  const d = new Uint8ClampedArray(imageData.data);
  const bd = blurred.data;
  const s = strength / 100;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (bd[i] + bd[i+1] + bd[i+2]) / 3;
    if (lum > 180) {
      const f = ((lum - 180) / 75) * s;
      d[i] = Math.min(255, d[i] + bd[i] * f * 0.5);
      d[i+1] = Math.min(255, d[i+1] + bd[i+1] * f * 0.3);
      d[i+2] = Math.min(255, d[i+2] + bd[i+2] * f * 0.2);
    }
  }
  return new ImageData(d, imageData.width, imageData.height);
}

function applyColorReduction(imageData, colors, dither) {
  const d = new Uint8ClampedArray(imageData.data);
  const w = imageData.width, h = imageData.height;
  const levels = Math.round(Math.pow(colors, 1/3));
  const step = 255 / (levels - 1 || 1);

  if (!dither) {
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.round(d[i] / step) * step;
      d[i+1] = Math.round(d[i+1] / step) * step;
      d[i+2] = Math.round(d[i+2] / step) * step;
    }
  } else {
    // Floyd-Steinberg dithering
    const fd = new Float32Array(d.length);
    for (let i = 0; i < d.length; i++) fd[i] = d[i];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const old = fd[i + c];
          const nw = Math.round(old / step) * step;
          fd[i + c] = nw;
          const err = old - nw;
          if (x + 1 < w) fd[i + 4 + c] += err * 7 / 16;
          if (y + 1 < h) {
            if (x > 0) fd[((y+1)*w+(x-1))*4 + c] += err * 3 / 16;
            fd[((y+1)*w+x)*4 + c] += err * 5 / 16;
            if (x + 1 < w) fd[((y+1)*w+(x+1))*4 + c] += err / 16;
          }
        }
      }
    }
    for (let i = 0; i < d.length; i++) d[i] = Math.min(255, Math.max(0, fd[i]));
  }
  return new ImageData(d, w, h);
}

function applyPixelate(imageData, size) {
  if (size <= 1) return imageData;
  const w = imageData.width, h = imageData.height;
  const d = new Uint8ClampedArray(imageData.data);
  const src = imageData.data;
  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let dy = 0; dy < size && y + dy < h; dy++) {
        for (let dx = 0; dx < size && x + dx < w; dx++) {
          const i = ((y + dy) * w + (x + dx)) * 4;
          r += src[i]; g += src[i+1]; b += src[i+2]; count++;
        }
      }
      r = r / count; g = g / count; b = b / count;
      for (let dy = 0; dy < size && y + dy < h; dy++) {
        for (let dx = 0; dx < size && x + dx < w; dx++) {
          const i = ((y + dy) * w + (x + dx)) * 4;
          d[i] = r; d[i+1] = g; d[i+2] = b;
        }
      }
    }
  }
  return new ImageData(d, w, h);
}

function applyInvert(imageData, intensity = 1) {
  const d = new Uint8ClampedArray(imageData.data);
  const s = Math.min(1, Math.max(0, intensity));
  for (let i = 0; i < d.length; i += 4) {
    d[i] = mix(d[i], 255 - d[i], s);
    d[i + 1] = mix(d[i + 1], 255 - d[i + 1], s);
    d[i + 2] = mix(d[i + 2], 255 - d[i + 2], s);
  }
  return new ImageData(d, imageData.width, imageData.height);
}

function applyThreshold(imageData, threshold) {
  const d = new Uint8ClampedArray(imageData.data);
  const t = Math.min(255, Math.max(0, threshold));
  for (let i = 0; i < d.length; i += 4) {
    const v = luminance(d, i) >= t ? 255 : 0;
    d[i] = v; d[i + 1] = v; d[i + 2] = v;
  }
  return new ImageData(d, imageData.width, imageData.height);
}

function applyPosterize(imageData, levels) {
  const d = new Uint8ClampedArray(imageData.data);
  const count = Math.max(2, Math.min(32, Math.round(levels)));
  const step = 255 / (count - 1);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.round(d[i] / step) * step;
    d[i + 1] = Math.round(d[i + 1] / step) * step;
    d[i + 2] = Math.round(d[i + 2] / step) * step;
  }
  return new ImageData(d, imageData.width, imageData.height);
}

function applyHalftone(imageData, strength, colorMode) {
  const w = imageData.width, h = imageData.height;
  const src = imageData.data;
  const out = new Uint8ClampedArray(src);
  const s = Math.min(1, Math.max(0, strength / 100));
  const cell = Math.max(3, Math.round(Math.min(w, h) * (0.012 + s * 0.012)));
  const monochrome = colorMode !== 'color';

  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let yy = y; yy < Math.min(h, y + cell); yy++) {
        for (let xx = x; xx < Math.min(w, x + cell); xx++) {
          const i = (yy * w + xx) * 4;
          r += src[i]; g += src[i + 1]; b += src[i + 2]; count++;
        }
      }

      r /= count; g /= count; b /= count;
      const l = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
      const radius = (cell * 0.52) * (1 - l);
      const cx = x + cell / 2;
      const cy = y + cell / 2;

      for (let yy = y; yy < Math.min(h, y + cell); yy++) {
        for (let xx = x; xx < Math.min(w, x + cell); xx++) {
          const i = (yy * w + xx) * 4;
          const dist = Math.hypot(xx - cx, yy - cy);
          const ink = dist <= radius ? 1 : 0;
          const target = monochrome
            ? (ink ? [20, 20, 20] : [245, 242, 232])
            : (ink ? [r * 0.42, g * 0.42, b * 0.42] : [r + 20, g + 20, b + 20]);
          out[i] = clamp(mix(src[i], target[0], s));
          out[i + 1] = clamp(mix(src[i + 1], target[1], s));
          out[i + 2] = clamp(mix(src[i + 2], target[2], s));
        }
      }
    }
  }

  return new ImageData(out, w, h);
}

function applyPresetProfile(imageData, profile, intensity = 1) {
  const d = new Uint8ClampedArray(imageData.data);
  const s = Math.min(1, Math.max(0, intensity));
  const config = getProfileConfig(profile);
  if (!config) return imageData;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const l = luminance(d, i) / 255;
    const skin = detectSkinTone(r, g, b);
    const curve = applyProfileCurve(l, config);
    const ratio = l > 0 ? curve / l : curve;

    let nr = clamp(r * ratio);
    let ng = clamp(g * ratio);
    let nb = clamp(b * ratio);

    nr = clamp(nr + config.red * s * 18);
    ng = clamp(ng + config.green * s * 18);
    nb = clamp(nb + config.blue * s * 18);

    const saturation = 1 + config.saturation * s;
    const gray = nr * 0.2126 + ng * 0.7152 + nb * 0.0722;
    nr = gray + (nr - gray) * saturation;
    ng = gray + (ng - gray) * saturation;
    nb = gray + (nb - gray) * saturation;

    if (skin && config.skinProtect) {
      const warmth = config.skinWarmth * s;
      nr = mix(nr, r + warmth * 14, 0.45);
      ng = mix(ng, g + warmth * 6, 0.35);
      nb = mix(nb, b - warmth * 8, 0.35);
    }

    d[i] = clamp(nr);
    d[i + 1] = clamp(ng);
    d[i + 2] = clamp(nb);
  }

  return new ImageData(d, imageData.width, imageData.height);
}

function getProfileConfig(profile) {
  const key = Array.isArray(profile) ? profile[0] : profile;
  const profiles = {
    film: { toe: 0.025, shoulder: 0.075, contrast: 0.04, red: 0.16, green: 0.04, blue: -0.08, saturation: 0.03, skinProtect: true, skinWarmth: 0.45 },
    '90s': { toe: 0.04, shoulder: 0.08, contrast: 0.02, red: 0.12, green: 0.02, blue: -0.04, saturation: -0.01, skinProtect: true, skinWarmth: 0.32 },
    '2000s': { toe: -0.01, shoulder: -0.035, contrast: 0.08, red: -0.04, green: 0.06, blue: 0.12, saturation: 0.04, skinProtect: true, skinWarmth: 0.12 },
    disposable: { toe: 0.05, shoulder: 0.045, contrast: 0.03, red: 0.14, green: 0.03, blue: -0.06, saturation: 0.02, skinProtect: true, skinWarmth: 0.38 },
    compression: { toe: -0.015, shoulder: -0.025, contrast: 0.07, red: 0.02, green: 0.02, blue: 0.02, saturation: -0.01, skinProtect: false, skinWarmth: 0 },
    glitch: { toe: -0.02, shoulder: -0.02, contrast: 0.1, red: 0.04, green: -0.02, blue: 0.08, saturation: 0.06, skinProtect: false, skinWarmth: 0 },
    color: { toe: 0.015, shoulder: 0.035, contrast: 0.03, red: 0.04, green: 0.02, blue: 0.02, saturation: 0.02, skinProtect: true, skinWarmth: 0.18 },
    lens: { toe: 0.02, shoulder: 0.05, contrast: 0.025, red: 0.03, green: 0.02, blue: 0.01, saturation: 0.01, skinProtect: true, skinWarmth: 0.15 },
    texture: { toe: 0.035, shoulder: 0.02, contrast: 0.05, red: 0.05, green: 0.02, blue: -0.03, saturation: -0.03, skinProtect: false, skinWarmth: 0 },
    custom: { toe: 0.02, shoulder: 0.04, contrast: 0.025, red: 0.03, green: 0.02, blue: 0, saturation: 0.01, skinProtect: true, skinWarmth: 0.22 },
  };
  return profiles[key] || null;
}

function applyProfileCurve(l, config) {
  const lifted = l + (1 - l) * config.toe;
  const rolled = lifted - Math.pow(Math.max(0, lifted - 0.72), 2) * config.shoulder * 2.6;
  const contrasted = 0.5 + (rolled - 0.5) * (1 + config.contrast);
  return Math.min(1, Math.max(0, contrasted));
}

function detectSkinTone(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return r > 70 && g > 35 && b > 20 && r > g * 0.95 && g > b * 0.8 && max - min > 18;
}

function applyChromaticAberration(imageData, amount) {
  const w = imageData.width, h = imageData.height;
  const src = imageData.data;
  const out = new Uint8ClampedArray(src);
  const offset = Math.round(amount / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // Offset red and blue channels slightly from center
      const rx = Math.min(w - 1, Math.max(0, x + offset));
      const bx = Math.min(w - 1, Math.max(0, x - offset));
      out[i] = src[(y * w + rx) * 4];
      out[i + 2] = src[(y * w + bx) * 4 + 2];
    }
  }
  return new ImageData(out, w, h);
}

function applyLensDistortion(imageData, strength) {
  const w = imageData.width, h = imageData.height;
  const src = imageData.data;
  const out = new Uint8ClampedArray(src).fill(0);
  const cx = w / 2, cy = h / 2;
  const k = strength / 1000;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx), dy = (y - cy);
      const r2 = dx * dx + dy * dy;
      const f = 1 + k * r2 / (cx * cx);
      const sx = Math.round(cx + dx * f);
      const sy = Math.round(cy + dy * f);
      if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
        const i = (y * w + x) * 4;
        const si = (sy * w + sx) * 4;
        out[i] = src[si]; out[i+1] = src[si+1]; out[i+2] = src[si+2]; out[i+3] = src[si+3];
      }
    }
  }
  return new ImageData(out, w, h);
}

function applyTiltShift(imageData, strength) {
  const w = imageData.width, h = imageData.height;
  const blurred = applyBlur(imageData, Math.max(3, strength / 8));
  const src = imageData.data;
  const bd = blurred.data;
  const out = new Uint8ClampedArray(src.length);
  const focusCenter = h * 0.5;
  const focusHalf = h * (0.12 + (100 - Math.min(100, strength)) * 0.001);
  const feather = h * 0.2;

  for (let y = 0; y < h; y++) {
    const dist = Math.max(0, Math.abs(y - focusCenter) - focusHalf);
    const amount = smoothstep(0, feather, dist);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      out[i] = mix(src[i], bd[i], amount);
      out[i + 1] = mix(src[i + 1], bd[i + 1], amount);
      out[i + 2] = mix(src[i + 2], bd[i + 2], amount);
      out[i + 3] = src[i + 3];
    }
  }

  return new ImageData(out, w, h);
}

function applyDoubleExposure(imageData, strength) {
  const w = imageData.width, h = imageData.height;
  const src = imageData.data;
  const out = new Uint8ClampedArray(src);
  const s = Math.min(0.75, Math.max(0.05, strength / 140));
  const offsetX = Math.round(w * 0.08);
  const offsetY = Math.round(h * -0.04);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(w - 1, Math.max(0, w - 1 - x + offsetX));
      const sy = Math.min(h - 1, Math.max(0, y + offsetY));
      const i = (y * w + x) * 4;
      const si = (sy * w + sx) * 4;
      const mask = smoothstep(20, 210, luminance(src, si));
      const amount = s * mask;
      out[i] = clamp(mix(out[i], Math.max(out[i], src[si]), amount));
      out[i + 1] = clamp(mix(out[i + 1], Math.max(out[i + 1], src[si + 1]), amount));
      out[i + 2] = clamp(mix(out[i + 2], Math.max(out[i + 2], src[si + 2]), amount));
    }
  }

  return new ImageData(out, w, h);
}

function applyAnamorphicFlare(imageData, strength) {
  const w = imageData.width, h = imageData.height;
  const src = imageData.data;
  const out = new Uint8ClampedArray(src);
  const s = Math.min(1, Math.max(0, strength / 100));
  const rows = [];

  for (let y = 0; y < h; y++) {
    let maxLum = 0;
    for (let x = 0; x < w; x++) {
      maxLum = Math.max(maxLum, luminance(src, (y * w + x) * 4));
    }
    if (maxLum > 185) rows.push({ y, weight: smoothstep(185, 255, maxLum) });
  }

  for (const row of rows) {
    const radius = Math.max(1, Math.round(h * 0.012));
    for (let yy = Math.max(0, row.y - radius); yy <= Math.min(h - 1, row.y + radius); yy++) {
      const verticalFalloff = 1 - Math.abs(yy - row.y) / (radius + 1);
      for (let x = 0; x < w; x++) {
        const i = (yy * w + x) * 4;
        const amount = row.weight * verticalFalloff * s * 0.55;
        out[i] = clamp(out[i] + 70 * amount);
        out[i + 1] = clamp(out[i + 1] + 115 * amount);
        out[i + 2] = clamp(out[i + 2] + 255 * amount);
      }
    }
  }

  return new ImageData(out, w, h);
}

function applyDatamosh(imageData, strength) {
  const w = imageData.width, h = imageData.height;
  const d = new Uint8ClampedArray(imageData.data);
  // Use percentage of image width for block size so it matches thumbnail appearance
  const blockSize = Math.round(w * 0.05); // 5% of width
  const count = Math.floor(strength / 10 + 2);
  for (let n = 0; n < count; n++) {
    const bx = Math.floor(Math.random() * (w - blockSize));
    const by = Math.floor(Math.random() * (h - blockSize));
    const ox = (Math.random() - 0.5) * blockSize * 2;
    const oy = (Math.random() - 0.5) * blockSize * 2;
    for (let y = 0; y < blockSize && by + y < h; y++) {
      for (let x = 0; x < blockSize && bx + x < w; x++) {
        const i = ((by + y) * w + (bx + x)) * 4;
        const sy = Math.floor(by + y + oy), sx = Math.floor(bx + x + ox);
        if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
          const si = (sy * w + sx) * 4;
          d[i] = d[si]; d[i+1] = d[si+1]; d[i+2] = d[si+2];
        }
      }
    }
  }
  return new ImageData(d, w, h);
}

function applyPixelSort(imageData, mode, intensity = 1) {
  const w = imageData.width, h = imageData.height;
  const src = imageData.data;
  const out = new Uint8ClampedArray(src);
  const direction = mode === 'vertical' ? 'vertical' : 'horizontal';
  const threshold = 255 * (0.66 - Math.min(1, intensity) * 0.24);
  const minRun = Math.max(6, Math.round((direction === 'horizontal' ? w : h) * 0.035));

  if (direction === 'horizontal') {
    for (let y = 0; y < h; y++) {
      sortLine(out, src, w, h, 0, y, 1, 0, w, threshold, minRun);
    }
  } else {
    for (let x = 0; x < w; x++) {
      sortLine(out, src, w, h, x, 0, 0, 1, h, threshold, minRun);
    }
  }

  return new ImageData(out, w, h);
}

function sortLine(out, src, w, h, startX, startY, stepX, stepY, length, threshold, minRun) {
  let run = [];
  let positions = [];
  const flush = () => {
    if (run.length >= minRun) {
      run.sort((a, b) => a.l - b.l);
      for (let n = 0; n < run.length; n++) {
        const target = positions[n];
        const source = run[n].source;
        out[target] = src[source];
        out[target + 1] = src[source + 1];
        out[target + 2] = src[source + 2];
        out[target + 3] = src[source + 3];
      }
    }
    run = [];
    positions = [];
  };

  for (let n = 0; n < length; n++) {
    const x = startX + stepX * n;
    const y = startY + stepY * n;
    if (x < 0 || x >= w || y < 0 || y >= h) {
      flush();
      continue;
    }

    const i = (y * w + x) * 4;
    const l = luminance(src, i);
    if (l >= threshold) {
      positions.push(i);
      run.push({ source: i, l });
    } else {
      flush();
    }
  }

  flush();
}

function applyDust(imageData, amount) {
  const d = new Uint8ClampedArray(imageData.data);
  const w = imageData.width, h = imageData.height;
  // Scale radius to image width (approx 1% of width for a 'dead pixel' look)
  const baseR = Math.max(1, Math.round(w * 0.012)); 
  const count = Math.floor(amount * 4);
  for (let n = 0; n < count; n++) {
    const x = Math.floor(Math.random() * w);
    const y = Math.floor(Math.random() * h);
    const r = Math.max(1, Math.floor(Math.random() * baseR + 1));
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const px = x + dx, py = y + dy;
        if (px >= 0 && px < w && py >= 0 && py < h) {
          const i = (py * w + px) * 4;
          const v = 200 + Math.random() * 55;
          d[i] = v; d[i+1] = v; d[i+2] = v;
        }
      }
    }
  }
  return new ImageData(d, w, h);
}

function applyScratches(imageData, amount) {
  const d = new Uint8ClampedArray(imageData.data);
  const w = imageData.width, h = imageData.height;
  const count = Math.floor(amount / 8 + 1);
  const thickness = Math.max(1, Math.round(w * 0.002));
  for (let n = 0; n < count; n++) {
    const x = Math.floor(Math.random() * w);
    const len = Math.floor(Math.random() * h * 0.6) + h * 0.2;
    const startY = Math.floor(Math.random() * (h - len));
    const brightness = 180 + Math.random() * 75;
    for (let y = startY; y < startY + len; y++) {
      const cx = x + Math.floor(Math.sin(y * 0.05) * thickness * 2);
      for (let tx = -thickness; tx <= thickness; tx++) {
        const finalX = cx + tx;
        if (finalX >= 0 && finalX < w) {
          const i = (y * w + finalX) * 4;
          const a = (0.3 + Math.random() * 0.4) / (Math.abs(tx) + 1);
          d[i] = d[i] * (1 - a) + brightness * a;
          d[i+1] = d[i+1] * (1 - a) + brightness * a;
          d[i+2] = d[i+2] * (1 - a) + brightness * a;
        }
      }
    }
  }
  return new ImageData(d, w, h);
}
