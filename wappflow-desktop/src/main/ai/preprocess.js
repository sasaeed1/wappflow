'use strict';

// Image → tensor helpers for ONNX vision models. Pure jimp (already a dep), so no
// extra native modules. All helpers return { data: Float32Array, dims:[...] } ready
// for new ort.Tensor('float32', data, dims).

let Jimp = null, tried = false;
function jimp() { if (tried) return Jimp; tried = true; try { Jimp = require('jimp'); } catch { Jimp = null; } return Jimp; }

async function read(buffer) {
  const J = jimp();
  if (!J) throw new Error('jimp not available');
  return J.read(buffer);
}

// Resize (stretch) to WxH and pack as NCHW float RGB with (px - mean)/scale.
// channelOrder: 'rgb' (default) or 'bgr'. mean/scale are scalars or [r,g,b].
function toCHW(img, W, H, { mean = 0, scale = 1, channelOrder = 'rgb' } = {}) {
  const J = jimp();
  const im = img.clone().resize(W, H, J.RESIZE_BILINEAR);
  const { data } = im.bitmap; // RGBA
  const out = new Float32Array(3 * W * H);
  const m = Array.isArray(mean) ? mean : [mean, mean, mean];
  const s = Array.isArray(scale) ? scale : [scale, scale, scale];
  const plane = W * H;
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const c0 = channelOrder === 'bgr' ? b : r;
    const c2 = channelOrder === 'bgr' ? r : b;
    out[i] = (c0 - m[0]) / s[0];
    out[plane + i] = (g - m[1]) / s[1];
    out[2 * plane + i] = (c2 - m[2]) / s[2];
  }
  return { data: out, dims: [1, 3, H, W] };
}

// Crop a (normalized or pixel) box, greyscale, resize to SxS, pack as [1,1,S,S]
// with raw 0..255 values (FER+ convention). box = {x1,y1,x2,y2} in pixels.
function cropGray(img, box, S) {
  const J = jimp();
  const w = img.bitmap.width, h = img.bitmap.height;
  const x1 = Math.max(0, Math.round(box.x1)), y1 = Math.max(0, Math.round(box.y1));
  const x2 = Math.min(w, Math.round(box.x2)), y2 = Math.min(h, Math.round(box.y2));
  const cw = Math.max(1, x2 - x1), ch = Math.max(1, y2 - y1);
  const im = img.clone().crop(x1, y1, cw, ch).greyscale().resize(S, S, J.RESIZE_BILINEAR);
  const { data } = im.bitmap;
  const out = new Float32Array(S * S);
  for (let i = 0, p = 0; i < S * S; i++, p += 4) out[i] = data[p]; // R channel == grey
  return { data: out, dims: [1, 1, S, S] };
}

function softmax(arr) {
  let max = -Infinity; for (const v of arr) if (v > max) max = v;
  let sum = 0; const e = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) { e[i] = Math.exp(arr[i] - max); sum += e[i]; }
  for (let i = 0; i < e.length; i++) e[i] /= sum;
  return e;
}

// IoU non-max suppression. dets: [{x1,y1,x2,y2,score}]. Returns kept dets.
function nms(dets, iouThresh = 0.4) {
  const out = [];
  const sorted = dets.slice().sort((a, b) => b.score - a.score);
  const area = (d) => Math.max(0, d.x2 - d.x1) * Math.max(0, d.y2 - d.y1);
  while (sorted.length) {
    const a = sorted.shift(); out.push(a);
    for (let i = sorted.length - 1; i >= 0; i--) {
      const b = sorted[i];
      const ix = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
      const iy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
      const inter = ix * iy;
      const iou = inter / (area(a) + area(b) - inter + 1e-6);
      if (iou > iouThresh) sorted.splice(i, 1);
    }
  }
  return out;
}

module.exports = { read, toCHW, cropGray, softmax, nms };
