// « Projet à fabriquer » : liste de pièces 2D partagée entre les modules (Topo, Lames → Atelier)
import type { Polygon, Polyline } from './geometry';

export interface JobPiece {
  /** numéro court gravable (chiffres et tirets), ex. « 3-2 » = couche 3, pièce 2 */
  id: string;
  /** groupe d'affichage, ex. « Couche 03 », « Eau » */
  group: string;
  /** contour (anneau extérieur + trous), en mm */
  shape: Polygon;
  engrave: Polyline[];
  thickness: number;
}

export interface Job {
  name: string;
  source: string;
  pieces: JobPiece[];
  /** groupes exclus par défaut (ex. l'eau, souvent coulée en résine) */
  offGroups?: string[];
}

const KEY = 'woody.job.v1';
let current: Job | null = null;

export function setJob(job: Job | null) {
  current = job;
  try {
    if (job) localStorage.setItem(KEY, JSON.stringify(job));
    else localStorage.removeItem(KEY);
  } catch {
    // projet trop gros pour le stockage du navigateur : il reste disponible jusqu'au rechargement
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  }
}

export function getJob(): Job | null {
  if (current) return current;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) current = JSON.parse(raw);
  } catch { /* ignore */ }
  return current;
}
