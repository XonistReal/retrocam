// Effects engine - applies all pixel-level effects via Canvas 2D
// Uses offscreen canvas for JPEG compression simulation

export function applyEffects(imageData, fx, intensity = 100) {
  const scale = intensity / 100;
  const w = imageData.width, h = imageData.height;
  const data = new Uint8ClampedArray(imageData.data);

  // Brightness
  if (fx.brightness) applyBrightness(data, fx.brightness * scale);
  // Contrast
  if (fx.contrast) applyContrast(data, fx.contrast * scale);
  // Exposure
  if (fx.exposure) applyExposure(data, fx.exposure * scale);
  // Saturation
  if (fx.saturation) applySaturation(data, fx.saturation * scale);
  // Temperature
  if (fx.temperature) applyTemperature(data, fx.temperature * scale);
  // Tint
  if (fx.tint) applyTint(data, fx.tint * scale);
  // Highlights/Shadows
  if (fx.highlights) applyHighlights(data, fx.highlights * scale);
  if (fx.shadows) applyShadows(data, fx.shadows * scale);
  // Fade (lift blacks)
  if (fx.fade) applyFade(data, fx.fade * scale);
  // Bit depth reduction
  if (fx.bitDepth) applyBitDepth(data, fx.bitDepth);
  // Thermal
  if (fx.thermal) applyThermal(data);

  let result = new ImageData(data, w, h);

  // Channel shift (RGB split)
  if (fx.channelShift) result = applyChannelShift(result, Math.round(fx.channelShift * scale));
  // Scanlines
  if (fx.scanlines) result = applyScanlines(result, fx.scanlines * scale);
  // Grain
  if (fx.grain) result = applyGrain(result, fx.grain * scale);
  // Vignette
  if (fx.vignette) result = applyVignette(result, fx.vignette * scale);
  // Dust
  if (fx.dust) result = applyDust(result, fx.dust * scale);
  // Scratches
  if (fx.scratches) result = applyScratches(result, fx.scratches * scale);
  // Light leaks
  if (fx.lightleak) result = applyLightLeak(result, fx.lightleak * scale);
  // Halation (bloom on highlights)
  if (fx.halation) result = applyHalation(result, fx.halation * scale);
  // Chromatic aberration
  if (fx.chromatic) result = applyChromaticAberration(result, fx.chromatic * scale);
  // Lens distortion (Barrel / Fisheye)
  if (fx.barrel || fx.fisheye) result = applyLensDistortion(result, (fx.barrel || 0) + (fx.fisheye || 0) * scale);
  // Datamosh simulation
  if (fx.datamosh) result = applyDatamosh(result, fx.datamosh * scale);
  // Color reduction
  if (fx.colorReduce) result = applyColorReduction(result, fx.colorReduce, fx.dither);
  // Pixelate
  if (fx.pixelate) result = applyPixelate(result, Math.round(fx.pixelate * scale));

  return result;
}

// Apply JPEG compression via canvas (async because toBlob is async)
export async function applyJPEGCompression(canvas, quality, passes = 1) {
  let c = canvas;
  for (let i = 0; i < passes; i++) {
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', quality / 100));
    const img = await createImageBitmap(blob);
    const oc = new OffscreenCanvas(canvas.width, canvas.height);
    const ctx = oc.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    c = oc;
  }
  const ctx = c.getContext('2d');
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// Blur helper using box blur
export function applyBlur(imageData, radius) {
  if (radius <= 0) return imageData;
  const w = imageData.width, h = imageData.height;
  const oc = new OffscreenCanvas(w, h);
  const ctx = oc.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  // Use canvas filter for blur
  const oc2 = new OffscreenCanvas(w, h);
  const ctx2 = oc2.getContext('2d');
  ctx2.filter = `blur(${radius}px)`;
  ctx2.drawImage(oc, 0, 0);
  return ctx2.getImageData(0, 0, w, h);
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

// --- ImageData-level effects ---
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

function applyGrain(imageData, amount) {
  const d = new Uint8ClampedArray(imageData.data);
  const a = amount * 1.2;
  for (let i = 0; i < d.length; i += 4) {
    const noise = (Math.random() - 0.5) * a;
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

function applyDust(imageData, amount) {
  const d = new Uint8ClampedArray(imageData.data);
  const w = imageData.width, h = imageData.height;
  const count = Math.floor(amount * 3);
  for (let n = 0; n < count; n++) {
    const x = Math.floor(Math.random() * w);
    const y = Math.floor(Math.random() * h);
    const r = Math.floor(Math.random() * 3) + 1;
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
  const count = Math.floor(amount / 10) + 1;
  for (let n = 0; n < count; n++) {
    const x = Math.floor(Math.random() * w);
    const len = Math.floor(Math.random() * h * 0.6) + h * 0.2;
    const startY = Math.floor(Math.random() * (h - len));
    const brightness = 180 + Math.random() * 75;
    for (let y = startY; y < startY + len; y++) {
      const cx = x + Math.floor(Math.sin(y * 0.05) * 2);
      if (cx >= 0 && cx < w) {
        const i = (y * w + cx) * 4;
        const a = 0.3 + Math.random() * 0.4;
        d[i] = d[i] * (1 - a) + brightness * a;
        d[i+1] = d[i+1] * (1 - a) + brightness * a;
        d[i+2] = d[i+2] * (1 - a) + brightness * a;
      }
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

function applyDatamosh(imageData, strength) {
  const w = imageData.width, h = imageData.height;
  const d = new Uint8ClampedArray(imageData.data);
  const blockSize = 16;
  const count = Math.floor(strength / 10) + 2;
  for (let n = 0; n < count; n++) {
    const bx = Math.floor(Math.random() * (w / blockSize)) * blockSize;
    const by = Math.floor(Math.random() * (h / blockSize)) * blockSize;
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
