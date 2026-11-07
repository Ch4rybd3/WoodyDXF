// Calepinage par rectangles englobants (MaxRects, plusieurs panneaux, rotation 0°/90°)

export interface NestItem {
  key: number;
  w: number;
  h: number;
  /** rotation de 90° autorisée */
  rot: boolean;
}

export interface Placement {
  key: number;
  x: number;
  y: number;
  rotated: boolean;
}

export interface NestSheet {
  placements: Placement[];
  usedArea: number;
}

interface Rect { x: number; y: number; w: number; h: number }

type Heuristic = 'bssf' | 'baf' | 'bl';

class Bin {
  free: Rect[];
  placements: Placement[] = [];
  usedArea = 0;
  constructor(public W: number, public H: number) {
    this.free = [{ x: 0, y: 0, w: W, h: H }];
  }

  /** meilleure position pour un rectangle w×h ; score plus petit = meilleur */
  find(w: number, h: number, rot: boolean, heur: Heuristic): { r: Rect; rotated: boolean; s1: number; s2: number } | null {
    let best: { r: Rect; rotated: boolean; s1: number; s2: number } | null = null;
    const tryFit = (fr: Rect, ww: number, hh: number, rotated: boolean) => {
      if (ww > fr.w + 1e-9 || hh > fr.h + 1e-9) return;
      let s1: number, s2: number;
      const dw = fr.w - ww, dh = fr.h - hh;
      if (heur === 'bssf') { s1 = Math.min(dw, dh); s2 = Math.max(dw, dh); }
      else if (heur === 'baf') { s1 = fr.w * fr.h - ww * hh; s2 = Math.min(dw, dh); }
      else { s1 = fr.y + hh; s2 = fr.x; }
      if (!best || s1 < best.s1 || (s1 === best.s1 && s2 < best.s2)) best = { r: { x: fr.x, y: fr.y, w: ww, h: hh }, rotated, s1, s2 };
    };
    for (const fr of this.free) {
      tryFit(fr, w, h, false);
      if (rot && w !== h) tryFit(fr, h, w, true);
    }
    return best;
  }

  place(key: number, r: Rect, rotated: boolean, area: number) {
    const next: Rect[] = [];
    for (const f of this.free) {
      if (r.x >= f.x + f.w || r.x + r.w <= f.x || r.y >= f.y + f.h || r.y + r.h <= f.y) { next.push(f); continue; }
      if (r.x > f.x) next.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h });
      if (r.x + r.w < f.x + f.w) next.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - r.x - r.w, h: f.h });
      if (r.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y });
      if (r.y + r.h < f.y + f.h) next.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - r.y - r.h });
    }
    // on retire les rectangles libres contenus dans un autre
    this.free = next.filter((a, i) =>
      a.w > 1e-6 && a.h > 1e-6 &&
      !next.some((b, j) => j !== i && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h &&
        (a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h || j < i)));
    this.placements.push({ key, x: r.x, y: r.y, rotated });
    this.usedArea += area;
  }

  /** étendue utilisée le long du grand côté (pour laisser une chute réutilisable) */
  extent(items: Map<number, NestItem>): number {
    let e = 0;
    const long = this.W >= this.H;
    for (const p of this.placements) {
      const it = items.get(p.key)!;
      const w = p.rotated ? it.h : it.w, h = p.rotated ? it.w : it.h;
      e = Math.max(e, long ? p.x + w : p.y + h);
    }
    return e;
  }
}

function run(items: NestItem[], W: number, H: number, heur: Heuristic, byKey: Map<number, NestItem>): Bin[] {
  const bins: Bin[] = [];
  for (const it of items) {
    let best: { bin: Bin; f: NonNullable<ReturnType<Bin['find']>> } | null = null;
    for (const bin of bins) {
      const f = bin.find(it.w, it.h, it.rot, heur);
      if (f && (!best || f.s1 < best.f.s1 || (f.s1 === best.f.s1 && f.s2 < best.f.s2))) best = { bin, f };
    }
    if (!best) {
      const bin = new Bin(W, H);
      const f = bin.find(it.w, it.h, it.rot, heur);
      if (!f) continue; // trop grand : signalé par l'appelant
      bins.push(bin);
      best = { bin, f };
    }
    best.bin.place(it.key, best.f.r, best.f.rotated, it.w * it.h);
  }
  // panneaux dans l'ordre : les plus remplis d'abord
  return bins.sort((a, b) => b.usedArea - a.usedArea);
}

/**
 * Range les rectangles dans des panneaux W×H. Essaie plusieurs tris et heuristiques
 * et garde le résultat avec le moins de panneaux, puis la plus grande chute sur le dernier.
 */
export function nest(items: NestItem[], W: number, H: number): { sheets: NestSheet[]; tooBig: number[] } {
  const fits = (it: NestItem) => (it.w <= W && it.h <= H) || (it.rot && it.h <= W && it.w <= H);
  const ok = items.filter(fits);
  const tooBig = items.filter((it) => !fits(it)).map((it) => it.key);
  const byKey = new Map(ok.map((it) => [it.key, it]));
  const sorts: ((a: NestItem, b: NestItem) => number)[] = [
    (a, b) => b.w * b.h - a.w * a.h,
    (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h),
    (a, b) => b.h - a.h || b.w - a.w,
    (a, b) => b.w - a.w || b.h - a.h,
    (a, b) => b.w + b.h - (a.w + a.h),
  ];
  let best: Bin[] | null = null;
  let bestScore = Infinity;
  for (const sort of sorts) {
    const sorted = ok.slice().sort(sort);
    for (const heur of ['bssf', 'baf', 'bl'] as Heuristic[]) {
      const bins = run(sorted, W, H, heur, byKey);
      const last = bins[bins.length - 1];
      const score = bins.length * 1e9 + (last ? last.extent(byKey) : 0);
      if (score < bestScore) { bestScore = score; best = bins; }
    }
  }
  return { sheets: (best ?? []).map((b) => ({ placements: b.placements, usedArea: b.usedArea })), tooBig };
}
