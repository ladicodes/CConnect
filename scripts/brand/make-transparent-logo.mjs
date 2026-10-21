// Produces a transparent, margin-trimmed copy of the official logo.
//
// The supplied logo.png is fully opaque on an off-white background. This
// script removes only that background: every pixel is modelled as
// alpha * artwork + (1 - alpha) * background, and the artwork colour is taken
// from the most saturated nearby pixel that explains it. Solid artwork pixels
// keep their exact colour and become fully opaque, anti-aliased edges get
// partial alpha, and pure background becomes transparent. The empty canvas
// margin is trimmed so the logo can be sized by its artwork. The source file
// is never modified.
//
// Usage: node scripts/brand/make-transparent-logo.mjs <input.png> <output.png>
import { readFileSync, writeFileSync } from "node:fs";
import zlib from "node:zlib";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("Usage: make-transparent-logo.mjs <input.png> <output.png>");
  process.exit(1);
}

function decodePng(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error("Only 8-bit non-interlaced PNGs are supported");
      colorType = data[9];
    }
    if (type === "IDAT") idat.push(data);
    offset += 12 + length;
  }
  const channels = { 2: 3, 6: 4 }[colorType];
  if (!channels) throw new Error("Only RGB/RGBA PNGs are supported");
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = x >= channels && y ? pixels[(y - 1) * stride + x - channels] : 0;
      let out;
      switch (filter) {
        case 0: out = value; break;
        case 1: out = value + left; break;
        case 2: out = value + up; break;
        case 3: out = value + ((left + up) >> 1); break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          out = value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default: throw new Error(`Unknown PNG filter ${filter}`);
      }
      pixels[y * stride + x] = out & 255;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = pixels[i * channels];
    rgba[i * 4 + 1] = pixels[i * channels + 1];
    rgba[i * 4 + 2] = pixels[i * channels + 2];
    rgba[i * 4 + 3] = channels === 4 ? pixels[i * channels + 3] : 255;
  }
  return { width, height, rgba };
}

function encodePng(width, height, rgba) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const { width, height, rgba } = decodePng(readFileSync(input));
const at = (x, y) => (y * width + x) * 4;

// Background colour: median of the four corners.
const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
const background = [0, 1, 2].map((c) => corners.map((i) => rgba[i + c]).sort((a, b) => a - b)[2]);
const ink = (i) => Math.hypot(background[0] - rgba[i], background[1] - rgba[i + 1], background[2] - rgba[i + 2]);

// The source is slightly soft: edges fade into the background over up to ~10px.
const LOCAL = 3; // neighbourhood used to decide whether a pixel is solid artwork
const SOLID_RATIO = 0.92; // a solid pixel has nearly the strongest ink around it
const SOLID_MIN_INK = 40;
const REACH = 12; // how far an edge pixel may be from the solid artwork it belongs to
const RESIDUAL = 14; // max colour error for "P is F blended with the background"
const NOISE = 8; // pixels this close to the background are background
const OPAQUE = 0.97; // edge estimates above this are treated as fully opaque

const inkMap = new Float32Array(width * height);
for (let p = 0; p < width * height; p++) inkMap[p] = ink(p * 4);

// 1. Solid artwork: pixels whose ink is (nearly) the local maximum.
const solid = new Uint8Array(width * height);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const own = inkMap[y * width + x];
    if (own < SOLID_MIN_INK) continue;
    let localMax = 0;
    for (let dy = -LOCAL; dy <= LOCAL; dy++) {
      for (let dx = -LOCAL; dx <= LOCAL; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height) localMax = Math.max(localMax, inkMap[ny * width + nx]);
      }
    }
    if (own >= SOLID_RATIO * localMax) solid[y * width + x] = 1;
  }
}

// 2. Nearest solid pixel for every other pixel (multi-source BFS, bounded by REACH).
const nearest = new Int32Array(width * height).fill(-1);
const distance = new Uint8Array(width * height).fill(255);
let queue = [];
for (let p = 0; p < width * height; p++) {
  if (solid[p]) { nearest[p] = p; distance[p] = 0; queue.push(p); }
}
for (let step = 1; step <= REACH && queue.length; step++) {
  const next = [];
  for (const p of queue) {
    const x = p % width, y = (p - x) / width;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const q = ny * width + nx;
      if (distance[q] !== 255) continue;
      distance[q] = step;
      nearest[q] = nearest[p];
      next.push(q);
    }
  }
  queue = next;
}

// 3. Alpha: solid pixels stay exactly as drawn; edge pixels are unmixed from the background.
const out = Buffer.alloc(rgba.length);
let minX = width, minY = height, maxX = -1, maxY = -1;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const p = y * width + x;
    const i = p * 4;
    let alpha = 0;
    let colour = [rgba[i], rgba[i + 1], rgba[i + 2]];
    if (solid[p]) {
      alpha = 1;
    } else if (inkMap[p] > NOISE && nearest[p] >= 0) {
      const j = nearest[p] * 4;
      const wf = [0, 1, 2].map((c) => background[c] - rgba[j + c]);
      const wp = [0, 1, 2].map((c) => background[c] - rgba[i + c]);
      const strength = inkMap[nearest[p]];
      const a = Math.min(1, Math.max(0, (wf[0] * wp[0] + wf[1] * wp[1] + wf[2] * wp[2]) / (strength * strength)));
      const residual = Math.hypot(...[0, 1, 2].map((c) => background[c] - a * wf[c] - rgba[i + c]));
      if (residual <= RESIDUAL) {
        alpha = a >= OPAQUE ? 1 : a;
        colour = alpha === 1 ? colour : [rgba[j], rgba[j + 1], rgba[j + 2]];
      } else {
        // Not a blend with the background (e.g. two rays touching): keep the pixel as drawn.
        alpha = 1;
      }
    }
    const value = Math.round(alpha * 255);
    if (value < 6) continue;
    out[i] = colour[0];
    out[i + 1] = colour[1];
    out[i + 2] = colour[2];
    out[i + 3] = value;
    if (value > 8) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
}

// Trim the empty margin, keeping a small safety border so no edge pixel is cut.
const PAD = 6;
minX = Math.max(0, minX - PAD); minY = Math.max(0, minY - PAD);
maxX = Math.min(width - 1, maxX + PAD); maxY = Math.min(height - 1, maxY + PAD);
const cropWidth = maxX - minX + 1;
const cropHeight = maxY - minY + 1;
const cropped = Buffer.alloc(cropWidth * cropHeight * 4);
for (let y = 0; y < cropHeight; y++) {
  out.copy(cropped, y * cropWidth * 4, at(minX, minY + y), at(minX, minY + y) + cropWidth * 4);
}
writeFileSync(output, encodePng(cropWidth, cropHeight, cropped));
console.log(JSON.stringify({ input, output, background, source: [width, height], trimmed: [cropWidth, cropHeight], offset: [minX, minY] }));
