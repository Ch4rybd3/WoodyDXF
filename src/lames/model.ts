// Module Lames : une forme (meuble ou panneau mural) tranchée en lames de bois
// Repère d'une lame : u = profondeur (0 = dos, P = face avant), v = hauteur (0 = sol), en mm.
// Les lames se succèdent le long de l'axe x (longueur L).
import polylabel from 'polylabel';
import {
  circlePolygon, difference, polygonArea, ringLength, simplifyRing,
  type MultiPolygon, type Polygon, type Polyline, type Pt, type Ring,
} from '../core/geometry';
import { strokeText, textUnits } from '../core/font';
import polygonClipping from 'polygon-clipping';

export type Motif = 'aucun' | 'vague' | 'diagonale' | 'damier' | 'galbe' | 'galbeVague' | 'bosse';

export interface Cutout {
  type: 'rect' | 'circle';
  /** étendue le long de la longueur (mm) */
  x0: number;
  x1: number;
  /** rectangle dans le plan de la lame */
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  /** cercle : centre (u, v) = (u0, v0), rayon r */
  r: number;
}

export interface Rod { u: number; v: number }

export interface LamesParams {
  preset: string;
  L: number;
  P: number;
  H: number;
  thickness: number;
  gap: number;
  /** face déformée : avant (comptoir) ou dessus (banc, panneau mural) */
  face: 'front' | 'top';
  motif: Motif;
  amplitude: number;
  /** ondulations sur la longueur */
  kx: number;
  /** ondulations sur la face (hauteur ou profondeur) */
  kz: number;
  phase: number;
  /** matière minimale conservée derrière la face déformée */
  minMaterial: number;
  cutouts: Cutout[];
  rodD: number;
  rods: Rod[];
  rodCount: number;
  numbers: boolean;
  dogbones: boolean;
  toolMm: number;
  spacerD: number;
  density: number;
}

export interface Slice {
  index: number;
  /** position de la face gauche de la lame le long de x */
  x0: number;
  pieces: Polygon[];
  /** numéros gravés, un jeu par pièce */
  labels: Polyline[][];
  /** identifiant gravé de chaque pièce */
  ids: string[];
  /** trous de tiges présents (indices des tiges) */
  rodHoles: number[];
}

export interface RodRun { first: number; last: number; length: number }
/** une position de tige ; elle se coupe en tronçons là où des lames ne sont pas percées (vide d'une découpe) */
export interface RodInfo { u: number; v: number; holes: number; runs: RodRun[]; length: number }

export interface LamesResult {
  slices: Slice[];
  rods: RodInfo[];
  spacers: number;
  spacerShape: Polygon | null;
  pieceCount: number;
  areaMm2: number;
  cutLengthMm: number;
  weightKg: number;
  warnings: string[];
}

export const PRESETS: Record<string, { label: string; p: Partial<LamesParams> }> = {
  comptoir: {
    label: 'Comptoir',
    p: { L: 1800, P: 550, H: 1050, thickness: 18, gap: 0, face: 'front', motif: 'vague', amplitude: 120, kx: 1.5, kz: 1, phase: 0, cutouts: [{ type: 'rect', x0: 0, x1: 1800, u0: 60, u1: 370, v0: 80, v1: 970, r: 0 }], rodCount: 3, rodD: 8, minMaterial: 40 },
  },
  banc: {
    label: 'Banc',
    p: { L: 1600, P: 420, H: 450, thickness: 18, gap: 12, face: 'top', motif: 'galbeVague', amplitude: 60, kx: 1, kz: 1, phase: 0,
      cutouts: [{ type: 'rect', x0: 0, x1: 1600, u0: 80, u1: 340, v0: -1, v1: 260, r: 0 }], rodCount: 3, rodD: 8, minMaterial: 40 },
  },
  bureau: {
    label: 'Bureau',
    p: { L: 1400, P: 700, H: 750, thickness: 18, gap: 0, face: 'front', motif: 'diagonale', amplitude: 80, kx: 1, kz: 0.5, phase: 0,
      cutouts: [{ type: 'rect', x0: 280, x1: 1120, u0: -1, u1: 701, v0: -1, v1: 680, r: 0 }, { type: 'rect', x0: 0, x1: 1400, u0: 60, u1: 560, v0: 80, v1: 620, r: 0 }], rodCount: 3, rodD: 8, minMaterial: 40 },
  },
  mural: {
    label: 'Panneau mural',
    p: { L: 900, P: 600, H: 70, thickness: 6, gap: 6, face: 'top', motif: 'diagonale', amplitude: 45, kx: 1.5, kz: 1, phase: 0, cutouts: [], rodCount: 2, rodD: 6, minMaterial: 25 },
  },
};

export const DEFAULT_LAMES: LamesParams = {
  preset: 'comptoir', L: 1800, P: 550, H: 1050, thickness: 18, gap: 0, face: 'front', motif: 'vague',
  amplitude: 120, kx: 1.5, kz: 1, phase: 0, minMaterial: 40, cutouts: [], rodD: 8, rods: [], rodCount: 3,
  numbers: true, dogbones: false, toolMm: 6, spacerD: 30, density: 650,
};

/** Retrait de la face (0 = pas de retrait, 1 = amplitude maximale) en fonction de la position s ∈ [0,1] le long de la longueur et t ∈ [0,1] sur la face */
export function retreat(m: Motif, s: number, t: number, kx: number, kz: number, phaseDeg: number): number {
  const ph = phaseDeg / 360;
  const along = 0.5 - 0.5 * Math.cos(2 * Math.PI * (kx * s + ph));
  switch (m) {
    case 'aucun': return 0;
    case 'vague': return along;
    case 'diagonale': return 0.5 - 0.5 * Math.cos(2 * Math.PI * (kx * s + kz * t + ph));
    case 'damier': return 0.5 - 0.5 * Math.cos(2 * Math.PI * (kx * s + ph)) * Math.cos(2 * Math.PI * kz * t);
    case 'galbe': return Math.pow(Math.sin(Math.PI * t), Math.max(0.2, kz));
    case 'galbeVague': return Math.sin(Math.PI * t) * (0.35 + 0.65 * along);
    case 'bosse': {
      const sg = 0.35 / Math.max(0.2, kx);
      return 1 - Math.exp(-(((s - 0.5) ** 2) + ((t - 0.5) ** 2)) / (2 * sg * sg));
    }
  }
}

/** Profil extérieur d'une lame à la position s ∈ [0,1] */
export function profile(p: LamesParams, s: number): Ring {
  const N = 90;
  const pts: Ring = [];
  const A = Math.max(0, p.amplitude);
  if (p.face === 'front') {
    pts.push([0, 0]);
    for (let i = 0; i <= N; i++) {
      const v = (i / N) * p.H;
      const u = Math.max(p.minMaterial, p.P - A * retreat(p.motif, s, i / N, p.kx, p.kz, p.phase));
      pts.push([u, v]);
    }
    pts.push([0, p.H]);
  } else {
    pts.push([0, 0], [p.P, 0]);
    for (let i = N; i >= 0; i--) {
      const u = (i / N) * p.P;
      const v = Math.max(p.minMaterial, p.H - A * retreat(p.motif, s, i / N, p.kx, p.kz, p.phase));
      pts.push([u, v]);
    }
  }
  const r = simplifyRing(pts, 0.05);
  return [...r, r[0]];
}

const rectRing = (u0: number, v0: number, u1: number, v1: number): Ring => [[u0, v0], [u1, v0], [u1, v1], [u0, v1], [u0, v0]];

function inRing(pt: Pt, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPoly = (pt: Pt, poly: Polygon) => inRing(pt, poly[0]) && !poly.slice(1).some((h) => inRing(pt, h));

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
/** distance du point au bord du polygone (positive à l'intérieur, -1 dehors) */
function depth(pt: Pt, poly: Polygon): number {
  if (!inPoly(pt, poly)) return -1;
  let d = Infinity;
  for (const r of poly) for (let i = 0; i < r.length - 1; i++) d = Math.min(d, segDist(pt, r[i], r[i + 1]));
  return d;
}

export function sliceLayout(p: LamesParams) {
  const t = Math.max(0.5, p.thickness), g = Math.max(0, p.gap);
  const n = Math.max(1, Math.floor((p.L + g) / (t + g)));
  const used = n * t + (n - 1) * g;
  const start = (p.L - used) / 2;
  return { n, t, g, start, x0: (i: number) => start + i * (t + g) };
}

function cutoutsFor(p: LamesParams, x0: number, x1: number): number[] {
  return p.cutouts.map((c, i) => (Math.min(c.x0, c.x1) < x1 && Math.max(c.x0, c.x1) > x0 ? i : -1)).filter((i) => i >= 0);
}

/** Profils (sans trous de tiges) de toutes les lames */
function baseSlices(p: LamesParams): { x0: number; pieces: Polygon[]; cuts: number[] }[] {
  const lay = sliceLayout(p);
  const out = [];
  const tool = Math.max(0.1, p.toolMm) / 2;
  for (let i = 0; i < lay.n; i++) {
    const x0 = lay.x0(i);
    const s = p.L > 0 ? (x0 + lay.t / 2) / p.L : 0.5;
    let mp: MultiPolygon = [[profile(p, s)]];
    const cuts = cutoutsFor(p, x0, x0 + lay.t);
    const holes: MultiPolygon = [];
    for (const ci of cuts) {
      const c = p.cutouts[ci];
      if (c.type === 'circle') { if (c.r > 0) holes.push(circlePolygon(c.u0, c.v0, c.r, 72)); continue; }
      const u0 = Math.min(c.u0, c.u1), u1 = Math.max(c.u0, c.u1), v0 = Math.min(c.v0, c.v1), v1 = Math.max(c.v0, c.v1);
      holes.push([rectRing(u0, v0, u1, v1)]);
      // os de chien : la fraise ronde ne fait pas d'angle intérieur vif
      if (p.dogbones) {
        for (const [cu, cv, du, dv] of [[u0, v0, 1, 1], [u1, v0, -1, 1], [u1, v1, -1, -1], [u0, v1, 1, -1]] as const) {
          if (depth([cu, cv], [profile(p, s)]) > tool) holes.push(circlePolygon(cu + (du * tool) / Math.SQRT2, cv + (dv * tool) / Math.SQRT2, tool * 1.02, 24));
        }
      }
    }
    if (holes.length) mp = difference(mp, holes);
    out.push({ x0, pieces: mp.filter((poly) => polygonArea(poly) > 50), cuts });
  }
  return out;
}

/** Place des tiges filetées dans la matière commune à chaque groupe de lames identiques (même jeu de découpes) */
export function autoRods(p: LamesParams): Rod[] {
  const base = baseSlices(p);
  const groups = new Map<string, Polygon[][]>();
  for (const sl of base) {
    const k = sl.cuts.join(',');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(sl.pieces);
  }
  const clear = p.rodD / 2 + Math.max(4, p.rodD * 0.6) + 2;
  const rods: Rod[] = [];
  for (const slices of groups.values()) {
    // matière commune à toutes les lames du groupe
    let common: MultiPolygon = slices[0];
    for (let i = 1; i < slices.length && common.length; i++) {
      common = polygonClipping.intersection(common as any, slices[i] as any) as MultiPolygon;
    }
    if (!common.length) continue;
    // points candidats sur une grille, assez loin des bords
    const step = Math.max(5, Math.min(p.P, p.H) / 60);
    const cand: Pt[] = [];
    for (const poly of common) {
      let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
      for (const [u, v] of poly[0]) { u0 = Math.min(u0, u); v0 = Math.min(v0, v); u1 = Math.max(u1, u); v1 = Math.max(v1, v); }
      for (let u = u0 + step / 2; u < u1; u += step) for (let v = v0 + step / 2; v < v1; v += step) {
        if (depth([u, v], poly) >= clear) cand.push([u, v]);
      }
    }
    if (!cand.length) continue;
    // on s'éloigne des bords autant que la matière le permet
    const deep = cand.map((c) => Math.min(...common.map((poly) => { const d = depth(c, poly); return d < 0 ? Infinity : d; })));
    const want = Math.max(clear, Math.min(40, 0.5 * Math.max(...deep)));
    const kept = cand.filter((_, i) => deep[i] >= want);
    if (kept.length) cand.splice(0, cand.length, ...kept);
    // tirage du point le plus éloigné : tiges bien réparties
    const chosen: Pt[] = [];
    const cx = cand.reduce((a, c) => a + c[0], 0) / cand.length, cy = cand.reduce((a, c) => a + c[1], 0) / cand.length;
    let first = cand[0], bd = -1;
    for (const c of cand) { const d = Math.hypot(c[0] - cx, c[1] - cy); if (d > bd) { bd = d; first = c; } }
    chosen.push(first);
    while (chosen.length < Math.max(1, p.rodCount)) {
      let best: Pt | null = null, bdist = -1;
      for (const c of cand) {
        const d = Math.min(...chosen.map((q) => Math.hypot(c[0] - q[0], c[1] - q[1])));
        if (d > bdist) { bdist = d; best = c; }
      }
      if (!best || bdist < clear * 2) break;
      chosen.push(best);
    }
    for (const c of chosen) {
      if (!rods.some((r) => Math.hypot(r.u - c[0], r.v - c[1]) < Math.max(clear * 2, 0.12 * Math.max(p.P, p.H)))) rods.push({ u: Math.round(c[0]), v: Math.round(c[1]) });
    }
  }
  return rods;
}

export function computeLames(p: LamesParams): LamesResult {
  const warnings: string[] = [];
  const lay = sliceLayout(p);
  const base = baseSlices(p);
  const rodR = p.rodD / 2;
  const wall = Math.max(4, p.rodD * 0.6);
  const slices: Slice[] = base.map((b, i) => {
    const rodHoles: number[] = [];
    const pieces = b.pieces.map((poly) => {
      const holes: MultiPolygon = [];
      p.rods.forEach((r, ri) => {
        if (depth([r.u, r.v], poly) >= rodR + wall) { holes.push(circlePolygon(r.u, r.v, rodR, 48)); rodHoles.push(ri); }
      });
      return holes.length ? difference([poly], holes) : [poly];
    }).flat();
    const ids = pieces.map((_, k) => (pieces.length > 1 ? `${i + 1}-${k + 1}` : String(i + 1)));
    const labels: Polyline[][] = pieces.map((poly, k) => {
      if (!p.numbers) return [];
      const lab = polylabel(poly, 0.5) as unknown as number[] & { distance: number };
      const h = Math.min(20, (0.7 * lab.distance) / Math.hypot(textUnits(ids[k]) / 12, 0.5));
      return h >= 3 ? strokeText(ids[k], [lab[0], lab[1]], h) : [];
    });
    return { index: i + 1, x0: b.x0, pieces, labels, ids, rodHoles };
  });

  // tiges : lames traversées, longueur à prévoir (+ 2 × 15 mm pour écrous et rondelles)
  const rods: RodInfo[] = p.rods.map((r, ri) => {
    const idx = slices.filter((s) => s.rodHoles.includes(ri)).map((s) => s.index);
    const runs: RodRun[] = [];
    for (const k of idx) {
      const last = runs[runs.length - 1];
      if (last && last.last === k - 1) last.last = k; else runs.push({ first: k, last: k, length: 0 });
    }
    for (const run of runs) run.length = (run.last - run.first) * (lay.t + lay.g) + lay.t + 30;
    return { u: r.u, v: r.v, holes: idx.length, runs, length: runs.reduce((a, x) => a + x.length, 0) };
  });
  rods.forEach((r, i) => {
    if (!r.holes) warnings.push(`La tige ${i + 1} (u ${r.u}, v ${r.v}) ne traverse aucune lame : déplace-la dans la matière.`);
    else if (r.runs.some((x) => x.first === x.last)) warnings.push(`La tige ${i + 1} a un tronçon qui ne traverse qu’une lame.`);
  });
  if (!p.rods.length && slices.length > 1) warnings.push('Aucune tige d’assemblage : clique « Placer les tiges automatiquement ».');

  // pièces isolées : une lame coupée en morceaux doit être tenue par une tige
  let floating = 0;
  for (const s of slices) for (const poly of s.pieces) {
    if (slices.length > 1 && poly.length === 1) floating++;
  }
  if (p.rods.length && floating) warnings.push(`${floating} morceau(x) de lame sans trou de tige : ils ne seront tenus que par la colle.`);

  // entretoises entre lames voisines percées par la même tige
  let spacers = 0;
  if (lay.g > 0) {
    p.rods.forEach((_, ri) => {
      for (let i = 0; i + 1 < slices.length; i++) if (slices[i].rodHoles.includes(ri) && slices[i + 1].rodHoles.includes(ri)) spacers++;
    });
  }
  const spacerShape = lay.g > 0 && spacers
    ? difference([circlePolygon(0, 0, Math.max(p.spacerD, p.rodD + 8) / 2, 72)], [circlePolygon(0, 0, rodR, 48)])[0]
    : null;

  let area = 0, cut = 0, pieceCount = 0;
  for (const s of slices) for (const poly of s.pieces) {
    pieceCount++;
    area += polygonArea(poly);
    for (const r of poly) cut += ringLength(r);
  }
  if (p.amplitude > (p.face === 'front' ? p.P : p.H) - p.minMaterial) {
    warnings.push(`Amplitude trop forte : la face est limitée à ${p.minMaterial} mm de matière minimale.`);
  }
  if (lay.n > 300) warnings.push(`${lay.n} lames : c’est beaucoup, vérifie l’épaisseur et la longueur.`);
  const weightKg = (area * lay.t + (spacerShape ? spacers * polygonArea(spacerShape) * lay.g : 0)) * 1e-9 * p.density;
  return { slices, rods, spacers, spacerShape, pieceCount, areaMm2: area, cutLengthMm: cut, weightKg, warnings };
}
