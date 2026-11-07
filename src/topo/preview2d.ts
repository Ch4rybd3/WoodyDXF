import type { MultiPolygon, Polyline } from '../core/geometry';
import type { TopoResult } from './layers';

const mpPath = (mp: MultiPolygon, H: number) =>
  mp.map((poly) => poly.map((r) => 'M' + r.map(([x, y]) => `${x.toFixed(2)},${(H - y).toFixed(2)}`).join('L') + 'Z').join('')).join('');

const linesPath = (ls: Polyline[], H: number) =>
  ls.map((l) => 'M' + l.map(([x, y]) => `${x.toFixed(2)},${(H - y).toFixed(2)}`).join('L')).join('');

/** Teinte bois de la couche i sur n (clair en bas → plus foncé en haut) */
export function woodColor(i: number, n: number, water = false): string {
  if (water && i === 0) return '#5f9ea0';
  const t = n > 1 ? i / (n - 1) : 0;
  const l = 82 - t * 30;
  return `hsl(32, ${45 + t * 15}%, ${l}%)`;
}

/** Vue d'ensemble : toutes les couches empilées, vues de dessus */
export function svgStack(r: TopoResult, water: boolean, margin = 2): string {
  const n = r.layers.length;
  const body = r.layers
    .map((L, i) => `<path d="${mpPath(L.pieces, r.H)}" fill="${woodColor(i, n, water)}" fill-rule="evenodd" stroke="rgba(60,35,15,.55)" stroke-width="0.25"/>`)
    .join('');
  return `<svg viewBox="${-margin} ${-margin} ${r.W + 2 * margin} ${r.H + 2 * margin}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

/** Une seule couche avec ses opérations (rouge = découpe, sombre = gravure) */
export function svgLayer(r: TopoResult, index: number): string {
  const L = r.layers[index];
  if (!L) return '';
  const below = r.layers[index - 1];
  return `<svg viewBox="-2 -2 ${r.W + 4} ${r.H + 4}" xmlns="http://www.w3.org/2000/svg">
    <path d="${mpPath(r.layers[0].pieces, r.H)}" fill="none" stroke="var(--line-faint)" stroke-width="0.3" stroke-dasharray="2 2"/>
    ${below ? `<path d="${mpPath(below.pieces, r.H)}" fill="var(--ghost)" fill-rule="evenodd" stroke="none"/>` : ''}
    <path d="${mpPath(L.pieces, r.H)}" fill="var(--wood)" fill-rule="evenodd" stroke="#d62828" stroke-width="0.45"/>
    <path d="${linesPath(L.engrave, r.H)}" fill="none" stroke="#3b2a1a" stroke-width="0.25"/>
    <path d="${linesPath(L.labels, r.H)}" fill="none" stroke="#1d4ed8" stroke-width="0.35"/>
  </svg>`;
}
