// Types et outils géométriques 2D communs (unités : millimètres, axe Y vers le haut)
import polygonClipping from 'polygon-clipping';

export type Pt = [number, number];
/** Anneau fermé (le dernier point peut répéter le premier) */
export type Ring = Pt[];
/** Polygone : anneau extérieur puis trous */
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];
/** Polyligne ouverte */
export type Polyline = Pt[];

export function ringArea(r: Ring): number {
  let a = 0;
  for (let i = 0, n = r.length; i < n; i++) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export function polygonArea(p: Polygon): number {
  if (!p.length) return 0;
  let a = Math.abs(ringArea(p[0]));
  for (let i = 1; i < p.length; i++) a -= Math.abs(ringArea(p[i]));
  return a;
}

export function ringLength(r: Ring, closed = true): number {
  let l = 0;
  const n = r.length;
  for (let i = 0; i < n - 1; i++) l += Math.hypot(r[i + 1][0] - r[i][0], r[i + 1][1] - r[i][1]);
  if (closed && n > 1) l += Math.hypot(r[0][0] - r[n - 1][0], r[0][1] - r[n - 1][1]);
  return l;
}

/** Retire le point de fermeture dupliqué */
export function openRing(r: Ring): Ring {
  if (r.length > 1) {
    const a = r[0], b = r[r.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) return r.slice(0, -1);
  }
  return r;
}

function perpDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas-Peucker itératif sur une polyligne ouverte */
export function simplifyLine(pts: Polyline, tol: number): Polyline {
  if (pts.length < 3 || tol <= 0) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(pts[i], pts[s], pts[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Simplifie un anneau fermé (coupé en deux moitiés pour garder sa forme) */
export function simplifyRing(r: Ring, tol: number): Ring {
  const o = openRing(r);
  if (o.length < 8 || tol <= 0) return o;
  const half = Math.floor(o.length / 2);
  const a = simplifyLine(o.slice(0, half + 1), tol);
  const b = simplifyLine([...o.slice(half), o[0]], tol);
  const res = [...a.slice(0, -1), ...b.slice(0, -1)];
  return res.length >= 3 ? res : o;
}

export function rectPolygon(w: number, h: number): Polygon {
  return [[[0, 0], [w, 0], [w, h], [0, h], [0, 0]]];
}

export function circlePolygon(cx: number, cy: number, r: number, seg = 360): Polygon {
  const ring: Ring = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  ring.push(ring[0]);
  return [ring];
}

export function intersect(a: MultiPolygon, b: MultiPolygon | Polygon): MultiPolygon {
  if (!a.length) return [];
  return polygonClipping.intersection(a as any, b as any) as MultiPolygon;
}

export function union(...parts: MultiPolygon[]): MultiPolygon {
  const nonEmpty = parts.filter((p) => p.length);
  if (!nonEmpty.length) return [];
  return polygonClipping.union(nonEmpty[0] as any, ...(nonEmpty.slice(1) as any[])) as MultiPolygon;
}

export function bbox(mp: MultiPolygon): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of mp) for (const [x, y] of p[0] ?? []) {
    if (x < x0) x0 = x; if (y < y0) y0 = y;
    if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

export function translateMP(mp: MultiPolygon, dx: number, dy: number): MultiPolygon {
  return mp.map((p) => p.map((r) => r.map(([x, y]) => [x + dx, y + dy] as Pt)));
}

export function translateLines(ls: Polyline[], dx: number, dy: number): Polyline[] {
  return ls.map((l) => l.map(([x, y]) => [x + dx, y + dy] as Pt));
}

/**
 * Coupe une polyligne en morceaux selon un prédicat sur chaque segment :
 * les segments rejetés sont supprimés.
 */
export function splitPolyline(pts: Polyline, keepSegment: (a: Pt, b: Pt) => boolean): Polyline[] {
  const out: Polyline[] = [];
  let cur: Polyline = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (keepSegment(a, b)) {
      if (!cur.length) cur.push(a);
      cur.push(b);
    } else if (cur.length) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) out.push(cur);
  // recolle le premier et le dernier morceau d'un anneau s'ils se touchent
  if (out.length > 1) {
    const f = out[0], l = out[out.length - 1];
    const lf = l[l.length - 1];
    if (lf[0] === f[0][0] && lf[1] === f[0][1]) {
      out[0] = [...l, ...f.slice(1)];
      out.pop();
    }
  }
  return out;
}
