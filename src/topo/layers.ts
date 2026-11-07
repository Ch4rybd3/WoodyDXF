// Calcul des couches d'un tableau en relief à partir d'une grille d'altitudes
import { contours } from 'd3-contour';
import polylabel from 'polylabel';
import {
  type MultiPolygon, type Polygon, type Polyline, type Pt,
  circlePolygon, difference, intersect, union, polygonArea, rectPolygon, ringLength, simplifyRing, splitPolyline, openRing, ringArea,
} from '../core/geometry';
import { strokeText, textUnits } from '../core/font';
import { gaussianBlur, type ElevGrid } from './elevation';

export interface TopoParams {
  shape: 'rect' | 'circle';
  widthMm: number;
  heightMm: number;
  realWidthM: number;
  layerMm: number;
  mode: 'exag' | 'count';
  exaggeration: number;
  layerCount: number;
  baseAlt: number | null;
  smoothMm: number;
  simplifyMm: number;
  minPieceMm2: number;
  minHoleMm2: number;
  toolMm: number;
  removeThin: boolean;
  fineLines: number;
  /** profondeur de l'eau, en nombre de couches sous sa surface */
  waterDepth: number;
  guides: boolean;
  numbers: boolean;
}

export interface WaterBody {
  /** contour de l'eau (mm) */
  poly: Polygon;
  /** altitude de la surface (m) */
  surface: number;
  /** altitude du fond creusé (m) */
  bottom: number;
  /** couche sur laquelle repose l'eau */
  layerIndex: number;
}

export interface TopoLayer {
  index: number;
  /** altitude de coupe (m) */
  level: number;
  pieces: MultiPolygon;
  /** traits gravés : courbes fines, repères de pose */
  engrave: Polyline[];
  /** numéros gravés */
  labels: Polyline[];
  thinPieces: number;
}

export interface TopoResult {
  W: number;
  H: number;
  frame: Polygon;
  layers: TopoLayer[];
  scale: number;
  layerRealM: number;
  exaggeration: number;
  base: number;
  top: number;
  totalPieces: number;
  cutLengthMm: number;
  warnings: string[];
  water: WaterBody[];
}

const MAX_LAYERS = 120;

/** Indices des cellules de la grille dont le centre est dans le polygone (remplissage pair-impair) */
function rasterize(poly: Polygon, grid: ElevGrid, cellX: number, cellY: number, H: number): number[] {
  const rings = poly.map((r) => r.map(([x, y]) => [x / cellX + grid.pad, (H - y) / cellY + grid.pad] as Pt));
  const out: number[] = [];
  let y0 = Infinity, y1 = -Infinity;
  for (const r of rings) for (const [, y] of r) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
  for (let j = Math.max(0, Math.floor(y0)); j < Math.min(grid.rows, Math.ceil(y1)); j++) {
    const yc = j + 0.5;
    const xs: number[] = [];
    for (const r of rings) for (let k = 0; k < r.length - 1; k++) {
      const [ax, ay] = r[k], [bx, by] = r[k + 1];
      if ((ay <= yc) !== (by <= yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let i = Math.max(0, Math.ceil(xs[k] - 0.5)); i <= Math.min(grid.cols - 1, Math.floor(xs[k + 1] - 0.5)); i++) out.push(j * grid.cols + i);
    }
  }
  return out;
}

export function computeLayers(grid: ElevGrid, p: TopoParams, water: MultiPolygon = []): TopoResult {
  const W = p.widthMm;
  const H = p.shape === 'circle' ? p.widthMm : p.heightMm;
  const cellX = W / grid.n, cellY = H / grid.m;
  const warnings: string[] = [];
  const frame = p.shape === 'circle' ? circlePolygon(W / 2, H / 2, W / 2) : rectPolygon(W, H);

  const values = gaussianBlur(grid.data, grid.cols, grid.rows, p.smoothMm / ((cellX + cellY) / 2));
  const gen = contours().size([grid.cols, grid.rows]).smooth(true);

  const scale = (p.realWidthM * 1000) / W;
  const top = grid.max;
  const nTot = Math.max(2, Math.round(p.layerCount));
  const stepFor = (b: number) => (p.mode === 'count' ? (top - b) / nTot : (p.layerMm * scale) / p.exaggeration / 1000);

  // --- eau : surface plane à son altitude réelle, éventuellement creusée de N couches ---
  const bodies: WaterBody[] = [];
  const step0 = stepFor(p.baseAlt ?? grid.min);
  for (const poly of water) {
    const cells = rasterize(poly, grid, cellX, cellY, H);
    if (cells.length < 3) continue;
    const alts = cells.map((i) => grid.data[i]).sort((a, b) => a - b);
    const surface = alts[Math.floor(alts.length * 0.25)]; // le relief est bruité sur l'eau : 1er quartile
    const bottom = surface - p.waterDepth * step0;
    for (const i of cells) values[i] = bottom - 1e-3;
    bodies.push({ poly, surface, bottom, layerIndex: 0 });
  }

  const base = p.baseAlt ?? Math.min(grid.min, ...bodies.map((b) => b.bottom));
  if (top <= base) {
    return { W, H, frame, layers: [], water: [], scale, layerRealM: 0, exaggeration: 0, base, top, totalPieces: 0, cutLengthMm: 0,
      warnings: ['Aucun relief au-dessus de l’altitude de base : rien à découper.'] };
  }
  const layerRealM = stepFor(base);
  const exaggeration = (p.layerMm * scale) / (layerRealM * 1000);

  const inFrame = (pt: Pt) => {
    const eps = 0.05;
    if (p.shape === 'circle') return Math.abs(Math.hypot(pt[0] - W / 2, pt[1] - H / 2) - W / 2) < eps;
    return Math.abs(pt[0]) < eps || Math.abs(pt[0] - W) < eps || Math.abs(pt[1]) < eps || Math.abs(pt[1] - H) < eps;
  };
  const notOnFrame = (a: Pt, b: Pt) => {
    if (!(inFrame(a) && inFrame(b))) return true;
    // segment le long du bord rectangulaire : même côté
    if (p.shape === 'rect') {
      const eps = 0.05;
      const same = (Math.abs(a[0] - b[0]) < eps && (Math.abs(a[0]) < eps || Math.abs(a[0] - W) < eps)) ||
        (Math.abs(a[1] - b[1]) < eps && (Math.abs(a[1]) < eps || Math.abs(a[1] - H) < eps));
      return !same;
    }
    return false;
  };

  /** Région « altitude ≥ niveau », en mm, simplifiée et découpée au cadre */
  const regionAt = (level: number): MultiPolygon => {
    const raw = gen.contour(values as unknown as number[], level).coordinates as unknown as number[][][][];
    const mp: MultiPolygon = raw.map((poly) =>
      poly.map((ring) => {
        const r = ring.map(([x, y]) => [(x - grid.pad) * cellX, H - (y - grid.pad) * cellY] as Pt);
        const s = simplifyRing(r, p.simplifyMm);
        return [...s, s[0]];
      }).filter((r) => r.length >= 4),
    ).filter((poly) => poly.length);
    let region = intersect(mp, frame);
    // rivage exact : on retire le contour vectoriel de l'eau située sous ce niveau
    const wet = bodies.filter((b) => b.bottom < level).map((b) => [b.poly] as MultiPolygon);
    if (wet.length && region.length) region = difference(region, union(...wet));
    return region;
  };

  const cleanPieces = (mp: MultiPolygon): MultiPolygon =>
    mp
      .map((poly) => [poly[0], ...poly.slice(1).filter((h) => Math.abs(ringArea(h)) >= p.minHoleMm2)])
      .filter((poly) => polygonArea(poly) >= p.minPieceMm2);

  /** Contours d'une région, sans les tronçons qui longent le cadre */
  const outlines = (mp: MultiPolygon, minLen = 2): Polyline[] => {
    const out: Polyline[] = [];
    for (const poly of mp) for (const ring of poly) {
      const closed = [...openRing(ring), ring[0]];
      for (const l of splitPolyline(closed, notOnFrame)) if (ringLength(l, false) >= minLen) out.push(l);
    }
    return out;
  };

  // --- couches ---
  const levels: number[] = [];
  for (let k = 1; base + k * layerRealM < top && k < MAX_LAYERS; k++) levels.push(base + k * layerRealM);
  if (levels.length + 1 >= MAX_LAYERS) warnings.push(`Nombre de couches limité à ${MAX_LAYERS}. Réduis l’exagération ou augmente l’épaisseur.`);

  const layers: TopoLayer[] = [{ index: 0, level: base, pieces: [frame], engrave: [], labels: [], thinPieces: 0 }];
  for (let k = 0; k < levels.length; k++) {
    let pieces = cleanPieces(regionAt(levels[k]));
    let thin = 0;
    const r = p.toolMm / 2;
    pieces = pieces.filter((poly) => {
      const d = (polylabel(poly, 0.2) as unknown as { distance: number }).distance;
      if (d < r) { thin++; return !p.removeThin; }
      return true;
    });
    if (!pieces.length) break;
    layers.push({ index: k + 1, level: levels[k], pieces, engrave: [], labels: [], thinPieces: thin });
  }

  // --- eau : couche sur laquelle repose chaque plan d'eau + gravure du rivage ---
  for (const b of bodies) {
    let li = 0;
    for (const L of layers) if (L.level <= b.bottom) li = L.index;
    b.layerIndex = li;
    layers[li].engrave.push(...outlines(intersect([b.poly], layers[li].pieces), 3));
  }

  // --- gravures ---
  for (let i = 0; i < layers.length; i++) {
    const L = layers[i];
    const next = layers[i + 1];
    if (p.guides && next) L.engrave.push(...outlines(next.pieces, 3));
    if (p.fineLines > 1) {
      for (let j = 1; j < p.fineLines; j++) {
        const lvl = L.level + (j * layerRealM) / p.fineLines;
        if (lvl >= top) break;
        const sub = intersect(regionAt(lvl), L.pieces);
        L.engrave.push(...outlines(sub, 4));
      }
    }
    if (p.numbers) {
      for (const piece of L.pieces) {
        // on place le numéro sous la couche du dessus (caché une fois collé) si possible
        let target: Polygon = piece;
        if (next) {
          const under = intersect([piece], next.pieces);
          let best = 0;
          for (const u of under) { const a = polygonArea(u); if (a > best) { best = a; target = u; } }
        }
        const lab = polylabel(target, 0.3) as unknown as number[] & { distance: number };
        const label = String(L.index);
        const h = Math.min(6, (0.8 * lab.distance) / Math.hypot(textUnits(label) / 12, 0.5));
        if (h >= 2) L.labels.push(...strokeText(label, [lab[0], lab[1]], h));
      }
    }
  }

  let totalPieces = 0, cutLengthMm = 0, thinTotal = 0;
  for (const L of layers) {
    totalPieces += L.pieces.length;
    thinTotal += L.thinPieces;
    for (const poly of L.pieces) for (const ring of poly) cutLengthMm += ringLength(openRing(ring));
  }
  if (thinTotal) {
    warnings.push(p.removeThin
      ? `${thinTotal} pièce(s) plus fine(s) que la fraise (Ø ${p.toolMm} mm) supprimée(s).`
      : `${thinTotal} pièce(s) plus fine(s) que la fraise (Ø ${p.toolMm} mm) : découpe difficile.`);
  }
  if (grid.missingTiles) warnings.push(`${grid.missingTiles} tuile(s) de relief indisponible(s) : zones à 0 m.`);
  const mmPerCellReal = (grid.sourceResM * 1000) / scale;
  if (mmPerCellReal > 1.5) {
    warnings.push(`Les données de relief (≈ ${Math.round(grid.sourceResM)} m/pixel) donnent ≈ ${mmPerCellReal.toFixed(1)} mm par pixel sur le tableau : détails lissés.`);
  }
  return { W, H, frame, layers, water: bodies, scale, layerRealM, exaggeration, base, top, totalPieces, cutLengthMm, warnings };
}
