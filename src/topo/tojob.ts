// Conversion d'un tableau en relief en liste de pièces pour l'Atelier
import { bbox, type Polygon, type Polyline, type Pt } from '../core/geometry';
import type { Job, JobPiece } from '../core/job';
import type { TopoResult } from './layers';

function inRing(pt: Pt, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const inPoly = (pt: Pt, poly: Polygon) => inRing(pt, poly[0]) && !poly.slice(1).some((h) => inRing(pt, h));

/** Rattache chaque trait gravé à la pièce qui le contient */
function assign(lines: Polyline[], pieces: Polygon[], boxes: number[][]): Polyline[][] {
  const out: Polyline[][] = pieces.map(() => []);
  for (const l of lines) {
    if (l.length < 2) continue;
    const a = l[Math.floor((l.length - 1) / 2)], b = l[Math.floor((l.length - 1) / 2) + 1] ?? a;
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let k = pieces.findIndex((p) => inPoly(mid, p));
    if (k < 0) k = boxes.findIndex(([x0, y0, x1, y1]) => mid[0] >= x0 && mid[0] <= x1 && mid[1] >= y0 && mid[1] <= y1);
    if (k >= 0) out[k].push(l);
  }
  return out;
}

export function topoToJob(r: TopoResult, layerMm: number, name: string): Job {
  const pieces: JobPiece[] = [];
  for (const L of r.layers) {
    const boxes = L.pieces.map((p) => bbox([p]));
    const eng = assign([...L.engrave, ...L.labels], L.pieces, boxes);
    const group = `Couche ${String(L.index).padStart(2, '0')}`;
    L.pieces.forEach((shape, k) => {
      pieces.push({ id: `${L.index}-${k + 1}`, group, shape, engrave: eng[k], thickness: layerMm });
    });
  }
  r.water.forEach((b, k) => pieces.push({ id: `00-${k + 1}`, group: 'Eau', shape: b.poly, engrave: [], thickness: layerMm }));
  return { name, source: 'Topo', pieces, offGroups: r.water.length ? ['Eau'] : [] };
}
