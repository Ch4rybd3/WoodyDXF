// Récupération du relief depuis les tuiles « Terrarium » (AWS Open Data, monde entier, ~30 m)
// Décodage : altitude = R × 256 + G + B / 256 − 32768
import type { WorldFrame } from './mercator';

const TILE = 256;
const MAX_Z = 15;
const MAX_TILES = 144;
const tileCache = new Map<string, Promise<Float32Array | null>>();

export interface ElevGrid {
  /** colonnes / lignes, bordure de `pad` cellules comprise */
  cols: number;
  rows: number;
  pad: number;
  /** cellules utiles (sans la bordure) */
  n: number;
  m: number;
  /** altitudes (m), ligne 0 = nord */
  data: Float32Array;
  min: number;
  max: number;
  zoom: number;
  /** taille au sol d'un pixel des données source (m) */
  sourceResM: number;
  missingTiles: number;
}

function loadTile(z: number, x: number, y: number): Promise<Float32Array | null> {
  const key = `${z}/${x}/${y}`;
  let p = tileCache.get(key);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = TILE;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        const px = ctx.getImageData(0, 0, TILE, TILE).data;
        const out = new Float32Array(TILE * TILE);
        for (let i = 0; i < out.length; i++) {
          out[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
        }
        resolve(out);
      };
      img.onerror = () => resolve(null);
      img.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
    });
    tileCache.set(key, p);
    p.then((v) => { if (!v) tileCache.delete(key); });
  }
  return p;
}

export async function fetchElevationGrid(
  frame: WorldFrame,
  n: number,
  m: number,
  pad: number,
  latDeg: number,
  onProgress?: (done: number, total: number) => void,
): Promise<ElevGrid> {
  // niveau de zoom : au moins n pixels source sur la largeur du cadre
  let z = Math.ceil(Math.log2(n / (2 * frame.hw * TILE)));
  z = Math.max(1, Math.min(MAX_Z, z));
  const range = (zz: number) => {
    const s = TILE * 2 ** zz;
    const cellW = (2 * frame.hw) / n, cellH = (2 * frame.hh) / m;
    const x0 = (frame.cx - frame.hw - pad * cellW) * s, x1 = (frame.cx + frame.hw + pad * cellW) * s;
    const y0 = (frame.cy - frame.hh - pad * cellH) * s, y1 = (frame.cy + frame.hh + pad * cellH) * s;
    return {
      tx0: Math.floor(x0 / TILE), tx1: Math.floor(x1 / TILE),
      ty0: Math.floor(y0 / TILE), ty1: Math.floor(y1 / TILE),
    };
  };
  let r = range(z);
  while (z > 1 && (r.tx1 - r.tx0 + 1) * (r.ty1 - r.ty0 + 1) > MAX_TILES) r = range(--z);

  const nT = 2 ** z;
  const jobs: { tx: number; ty: number }[] = [];
  for (let ty = r.ty0; ty <= r.ty1; ty++) for (let tx = r.tx0; tx <= r.tx1; tx++) jobs.push({ tx, ty });
  const tiles = new Map<string, Float32Array | null>();
  let done = 0, missing = 0;
  const queue = jobs.slice();
  const worker = async () => {
    while (queue.length) {
      const j = queue.shift()!;
      const ty = Math.max(0, Math.min(nT - 1, j.ty));
      const t = await loadTile(z, ((j.tx % nT) + nT) % nT, ty);
      if (!t) missing++;
      tiles.set(`${j.tx}/${j.ty}`, t);
      onProgress?.(++done, jobs.length);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));

  const sample = (px: number, py: number): number => {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    const t = tiles.get(`${tx}/${ty}`);
    if (!t) return 0;
    const lx = Math.min(TILE - 1, Math.max(0, Math.floor(px - tx * TILE)));
    const ly = Math.min(TILE - 1, Math.max(0, Math.floor(py - ty * TILE)));
    return t[ly * TILE + lx];
  };
  // interpolation bilinéaire entre centres de pixels
  const bilinear = (px: number, py: number): number => {
    const x = px - 0.5, y = py - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const a = sample(x0 + 0.5, y0 + 0.5), b = sample(x0 + 1.5, y0 + 0.5);
    const c = sample(x0 + 0.5, y0 + 1.5), d = sample(x0 + 1.5, y0 + 1.5);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };

  const cols = n + 2 * pad, rows = m + 2 * pad;
  const data = new Float32Array(cols * rows);
  const s = TILE * 2 ** z;
  const cellW = (2 * frame.hw) / n, cellH = (2 * frame.hh) / m;
  let min = Infinity, max = -Infinity;
  for (let j = 0; j < rows; j++) {
    const wy = frame.cy - frame.hh + (j - pad + 0.5) * cellH;
    for (let i = 0; i < cols; i++) {
      const wx = frame.cx - frame.hw + (i - pad + 0.5) * cellW;
      const v = bilinear(wx * s, wy * s);
      data[j * cols + i] = v;
      if (i >= pad && i < cols - pad && j >= pad && j < rows - pad) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  const sourceResM = (6378137 * 2 * Math.PI * Math.cos((latDeg * Math.PI) / 180)) / s;
  return { cols, rows, pad, n, m, data, min, max, zoom: z, sourceResM, missingTiles: missing };
}

/** Flou gaussien séparable (sigma en cellules) */
export function gaussianBlur(src: Float32Array, cols: number, rows: number, sigma: number): Float32Array {
  if (sigma < 0.3) return src.slice();
  const rad = Math.ceil(sigma * 3);
  const k = new Float32Array(rad * 2 + 1);
  let sum = 0;
  for (let i = -rad; i <= rad; i++) sum += k[i + rad] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let v = 0;
      for (let i = -rad; i <= rad; i++) {
        const xx = Math.min(cols - 1, Math.max(0, x + i));
        v += src[y * cols + xx] * k[i + rad];
      }
      tmp[y * cols + x] = v;
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let v = 0;
      for (let i = -rad; i <= rad; i++) {
        const yy = Math.min(rows - 1, Math.max(0, y + i));
        v += tmp[yy * cols + x] * k[i + rad];
      }
      out[y * cols + x] = v;
    }
  }
  return out;
}
