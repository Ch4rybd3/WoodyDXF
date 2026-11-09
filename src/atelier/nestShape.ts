// Imbrication de formes réelles (et non de rectangles) sur une grille fine.
// Chaque pièce est « gonflée » de la moitié de l'espacement : deux masques qui ne se touchent pas
// garantissent l'espacement entre les vraies formes. Les trous des pièces restent libres :
// de petites pièces peuvent s'y loger.
import type { Polygon, Pt } from '../core/geometry';

export interface ShapeItem { key: number; shape: Polygon }
export interface ShapePlacement { key: number; rot: number; tx: number; ty: number }
export interface ShapeNestOptions { margin: number; spacing: number; allowRot: boolean; precision: 'normal' | 'fine'; /** nombre maximal de panneaux (chute du stock : 1) */ maxSheets?: number }

interface Mask {
  rot: number;
  cols: number;
  rows: number;
  /** runs[i] = intervalles verticaux [début, fin] occupés dans la colonne i */
  runs: Int32Array[];
  /** ordre de test des colonnes (les plus hautes d'abord : elles se heurtent plus vite) */
  order: number[];
  cells: number;
  /** origine de la pièce dans le repère local du masque */
  bx: number;
  by: number;
}

const rotPt = ([x, y]: Pt, deg: number): Pt =>
  deg === 90 ? [-y, x] : deg === 180 ? [-x, -y] : deg === 270 ? [y, -x] : [x, y];

function segDist(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)) : 0;
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}

/** Masque d'une pièce déjà tournée : cellules dont le centre est à moins de R de la matière */
function buildMask(poly: Polygon, rot: number, res: number, R: number): Mask {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const p = poly.map((r) => r.map(([x, y]) => [x - x0, y - y0] as Pt));
  const w = x1 - x0, h = y1 - y0;
  const cols = Math.ceil((w + 2 * R) / res), rows = Math.ceil((h + 2 * R) / res);
  const m = new Uint8Array(cols * rows);
  const cx = (i: number) => -R + (i + 0.5) * res;
  // intérieur (pair-impair, trous compris) colonne par colonne
  for (let i = 0; i < cols; i++) {
    const x = cx(i);
    const ys: number[] = [];
    for (const r of p) for (let k = 0; k < r.length - 1; k++) {
      const a = r[k], b = r[k + 1];
      if ((a[0] <= x) !== (b[0] <= x)) ys.push(a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0]));
    }
    ys.sort((a, b) => a - b);
    for (let k = 0; k + 1 < ys.length; k += 2) {
      const j0 = Math.max(0, Math.ceil((ys[k] + R) / res - 0.5)), j1 = Math.min(rows - 1, Math.floor((ys[k + 1] + R) / res - 0.5));
      for (let j = j0; j <= j1; j++) m[i * rows + j] = 1;
    }
  }
  // bande de largeur R autour de tous les bords
  for (const r of p) for (let k = 0; k < r.length - 1; k++) {
    const a = r[k], b = r[k + 1];
    const i0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) / res) - 1), i1 = Math.min(cols - 1, Math.ceil((Math.max(a[0], b[0]) + 2 * R) / res));
    const j0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) / res) - 1), j1 = Math.min(rows - 1, Math.ceil((Math.max(a[1], b[1]) + 2 * R) / res));
    for (let i = i0; i <= i1; i++) {
      const x = cx(i);
      for (let j = j0; j <= j1; j++) {
        const idx = i * rows + j;
        if (!m[idx] && segDist(x, -R + (j + 0.5) * res, a, b) < R) m[idx] = 1;
      }
    }
  }
  const runs: Int32Array[] = [];
  const height: number[] = [];
  let cells = 0;
  for (let i = 0; i < cols; i++) {
    const r: number[] = [];
    let h = 0;
    for (let j = 0; j < rows; j++) {
      if (!m[i * rows + j]) continue;
      const s = j;
      while (j + 1 < rows && m[i * rows + j + 1]) j++;
      r.push(s, j);
      h += j - s + 1;
    }
    runs.push(Int32Array.from(r));
    height.push(h);
    cells += h;
  }
  const order = [...Array(cols).keys()].filter((i) => height[i] > 0).sort((a, b) => height[b] - height[a]);
  return { rot, cols, rows, runs, order, cells, bx: x0, by: y0 };
}

class Sheet {
  occ: Uint8Array;
  next: Int32Array; // prochaine cellule occupée en montant dans la colonne (Gh = aucune)
  run: Int32Array; // nombre de cellules occupées consécutives à partir d'ici
  free: number;
  failed: { cells: number; a: number; b: number }[] = [];
  placements: ShapePlacement[] = [];
  extent = 0;
  constructor(public Gw: number, public Gh: number) {
    this.occ = new Uint8Array(Gw * Gh);
    this.next = new Int32Array(Gw * Gh).fill(Gh);
    this.run = new Int32Array(Gw * Gh);
    this.free = Gw * Gh;
  }

  /** première position libre en balayant de gauche à droite puis de bas en haut */
  find(mk: Mask, maxX: number): [number, number] | null {
    const { Gh } = this;
    const lastX = Math.min(this.Gw - mk.cols, maxX);
    for (let X = 0; X <= lastX; X++) {
      let y = 0;
      while (y <= Gh - mk.rows) {
        let skip = -1;
        for (const i of mk.order) {
          const base = (X + i) * Gh;
          const rs = mk.runs[i];
          for (let k = 0; k < rs.length; k += 2) {
            const a = rs[k];
            const n = this.next[base + y + a];
            if (n <= y + rs[k + 1]) { skip = n + this.run[base + n] - a; break; }
          }
          if (skip >= 0) break;
        }
        if (skip < 0) return [X, y];
        y = skip;
      }
    }
    return null;
  }

  place(mk: Mask, X: number, Y: number) {
    const { Gh } = this;
    for (let i = 0; i < mk.cols; i++) {
      const rs = mk.runs[i];
      if (!rs.length) continue;
      const base = (X + i) * Gh;
      for (let k = 0; k < rs.length; k += 2) for (let j = rs[k]; j <= rs[k + 1]; j++) this.occ[base + Y + j] = 1;
      let nx = Gh, rn = 0;
      for (let j = Gh - 1; j >= 0; j--) {
        if (this.occ[base + j]) { nx = j; rn++; } else rn = 0;
        this.next[base + j] = nx;
        this.run[base + j] = rn;
      }
    }
    this.free -= mk.cells;
    this.extent = Math.max(this.extent, X + mk.cols);
  }
}

export function nestShapes(items: ShapeItem[], panelW: number, panelH: number, o: ShapeNestOptions): { sheets: ShapePlacement[][]; tooBig: number[] } {
  const transposed = panelH > panelW;
  const Wl = Math.max(panelW, panelH), Hs = Math.min(panelW, panelH);
  // la grille déborde de la zone utile d'un demi-espacement : le masque gonflé peut s'y loger, la pièce non
  const ext = o.spacing / 2;
  const uw = Wl - 2 * o.margin + 2 * ext, uh = Hs - 2 * o.margin + 2 * ext;
  if (uw <= 0 || uh <= 0) return { sheets: [], tooBig: items.map((it) => it.key) };
  const target = o.precision === 'fine' ? 1_200_000 : 350_000;
  const res = Math.min(6, Math.max(0.8, Math.sqrt((uw * uh) / target)));
  const Gw = Math.floor(uw / res), Gh = Math.floor(uh / res);
  // R : demi-espacement + demi-diagonale d'une cellule (garantit l'espacement réel)
  const R = o.spacing / 2 + res * Math.SQRT1_2 + 1e-6;
  const rots = o.allowRot ? [0, 90, 180, 270] : [0, 180];

  const prepared = items.map((it) => {
    const masks: Mask[] = [];
    const seen = new Set<string>();
    for (const rot of rots) {
      // rotation dans le repère du panneau, puis passage au repère de travail (grand côté horizontal)
      const poly = it.shape.map((r) => r.map((p) => { const q = rotPt(p, rot); return transposed ? ([q[1], -q[0]] as Pt) : q; }));
      const mk = buildMask(poly, rot, res, R);
      const sig = `${mk.cols}x${mk.rows}:${mk.runs.map((r) => r.join(',')).join('|')}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      masks.push(mk);
    }
    return {
      key: it.key, masks, cells: Math.min(...masks.map((m) => m.cells)),
      span: Math.max(...masks.map((m) => Math.max(m.cols, m.rows))),
      thick: Math.max(...masks.map((m) => Math.min(m.cols, m.rows))),
    };
  });
  const toPlacement = (key: number, mk: Mask, X: number, Y: number): ShapePlacement => {
    // position (repère de travail) de l'origine de la pièce, puis retour au repère du panneau
    const wx = o.margin - ext + X * res + R - mk.bx, wy = o.margin - ext + Y * res + R - mk.by;
    const [tx, ty] = transposed ? [Hs - wy, wx] : [wx, wy];
    return { key, rot: mk.rot, tx, ty };
  };
  type Best = { mk: Mask; X: number; Y: number };
  const tryOn = (sh: Sheet, it: (typeof prepared)[number]): Best | null => {
    if (sh.free < it.cells) return null;
    const a = Math.min(...it.masks.map((m) => Math.min(m.cols, m.rows))), b = Math.min(...it.masks.map((m) => Math.max(m.cols, m.rows)));
    if (sh.failed.some((f) => it.cells >= f.cells && a >= f.a && b >= f.b)) return null;
    let best = null as Best | null;
    for (const mk of it.masks) {
      const pos = sh.find(mk, best ? best.X : Infinity);
      if (pos && (!best || pos[0] < best.X || (pos[0] === best.X && pos[1] < best.Y))) best = { mk, X: pos[0], Y: pos[1] };
    }
    if (!best) sh.failed.push({ cells: it.cells, a, b });
    return best;
  };

  const run = (order: typeof prepared) => {
    const sheets: Sheet[] = [];
    const tooBig: number[] = [];
    for (const it of order) {
      let done = false;
      for (const sh of sheets) {
        const b = tryOn(sh, it);
        if (b) { sh.place(b.mk, b.X, b.Y); sh.placements.push(toPlacement(it.key, b.mk, b.X, b.Y)); done = true; break; }
      }
      if (done) continue;
      if (sheets.length >= (o.maxSheets ?? Infinity)) { tooBig.push(it.key); continue; }
      const sh = new Sheet(Gw, Gh);
      const b = tryOn(sh, it);
      if (!b) { tooBig.push(it.key); continue; }
      sh.place(b.mk, b.X, b.Y);
      sh.placements.push(toPlacement(it.key, b.mk, b.X, b.Y));
      sheets.push(sh);
    }
    return { sheets, tooBig };
  };

  // plusieurs ordres de placement : on garde celui qui use le moins de panneaux, puis la plus grande chute
  const orders = [
    (a: (typeof prepared)[number], b: (typeof prepared)[number]) => b.cells - a.cells,
    (a: (typeof prepared)[number], b: (typeof prepared)[number]) => b.span - a.span || b.cells - a.cells,
    (a: (typeof prepared)[number], b: (typeof prepared)[number]) => b.thick - a.thick || b.cells - a.cells,
  ];
  let best: ReturnType<typeof run> | null = null;
  let bestScore = Infinity;
  for (const ord of orders.slice(0, o.precision === 'fine' ? 3 : 2)) {
    const r = run(prepared.slice().sort(ord));
    const last = r.sheets[r.sheets.length - 1];
    // panneau unique (chute) : on maximise la surface placée ; sinon le moins de panneaux possible
    const left = o.maxSheets ? r.tooBig.reduce((a, k) => a + prepared.find((p) => p.key === k)!.cells, 0) : r.tooBig.length;
    const score = left * 1e12 + r.sheets.length * 1e6 + (last ? last.extent : 0);
    if (score < bestScore) { bestScore = score; best = r; }
  }
  const { sheets, tooBig } = best!;
  return { sheets: sheets.map((s) => s.placements), tooBig };
}

/** Applique une position calculée à un point de la pièce (repère normalisé) */
export const applyPlacement = (p: Pt, pl: ShapePlacement): Pt => { const q = rotPt(p, pl.rot); return [q[0] + pl.tx, q[1] + pl.ty]; };
