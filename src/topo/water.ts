// Surfaces d'eau (lacs, retenues, rivières larges) depuis OpenStreetMap via l'API Overpass
import polygonClipping from 'polygon-clipping';
import { type MultiPolygon, type Polygon, type Pt, type Ring, intersect, polygonArea, simplifyRing } from '../core/geometry';
import { frameBounds, lonLatToWorld, type WorldFrame } from './mercator';

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
// Cache : chaque requête couvre une zone 2× plus grande que le cadre, réutilisée tant que le cadre reste dedans.
// Les dernières réponses sont aussi gardées dans le navigateur (localStorage) pour survivre au rechargement.
type BBox = [number, number, number, number]; // sud, ouest, nord, est
interface CacheEntry { bbox: BBox; data: Promise<OsmGeom[]> }
const cache: CacheEntry[] = [];
const LS_KEY = 'woody.water.v2';

function loadPersisted() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    for (const e of JSON.parse(raw) as { bbox: BBox; data: OsmGeom[] }[]) cache.push({ bbox: e.bbox, data: Promise.resolve(e.data) });
  } catch { /* ignore */ }
}
loadPersisted();

async function persist() {
  try {
    const done = await Promise.all(cache.slice(-2).map(async (e) => ({ bbox: e.bbox, data: await e.data })));
    const json = JSON.stringify(done);
    localStorage.setItem(LS_KEY, json);
    console.info(`[eau] cache enregistré : ${(json.length / 1024) | 0} Ko`);
  } catch (err) {
    console.warn('[eau] cache non enregistré', err); // quota dépassé ou stockage indisponible
  }
}

const contains = (a: BBox, b: BBox) => a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3];

/** Données d'eau couvrant la zone demandée, en réutilisant le cache si possible */
export function waterData(bb: BBox): Promise<OsmGeom[]> {
  const hit = cache.find((e) => contains(e.bbox, bb));
  if (hit) return hit.data;
  const dy = Math.min((bb[2] - bb[0]) * 0.5, 0.1), dx = Math.min((bb[3] - bb[1]) * 0.5, 0.15);
  const big: BBox = [bb[0] - dy, bb[1] - dx, bb[2] + dy, bb[3] + dx];
  const entry: CacheEntry = { bbox: big, data: queryOverpass(...big) };
  cache.push(entry);
  if (cache.length > 6) cache.shift();
  entry.data.then(persist, () => cache.splice(cache.indexOf(entry), 1));
  return entry.data;
}

type LL = { lat: number; lon: number };
/** anneaux compacts : [lon, lat, lon, lat, …] arrondis à 1e-6 (≈ 10 cm) */
interface OsmGeom { outers: number[][]; inners: number[][] }
const flat = (r: LL[]) => r.flatMap((p) => [Math.round(p.lon * 1e6) / 1e6, Math.round(p.lat * 1e6) / 1e6]);

async function queryOverpass(s: number, w: number, n: number, e: number): Promise<OsmGeom[]> {
  const bb = `${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)}`;
  const q = `[out:json][timeout:30];(
    way["natural"="water"](${bb});relation["natural"="water"](${bb});
    way["waterway"="riverbank"](${bb});relation["waterway"="riverbank"](${bb});
    way["landuse"="reservoir"](${bb});relation["landuse"="reservoir"](${bb});
  );out geom;`;
  let lastErr: unknown;
  for (const url of ENDPOINTS) {
    try {
      // serveur lent ou saturé : on passe au suivant au bout de 25 s
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25000);
      const res = await fetch(url, {
        method: 'POST', body: 'data=' + encodeURIComponent(q), signal: ctrl.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }).finally(() => clearTimeout(timer));
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = (await res.json()) as { elements: any[] };
      const out: OsmGeom[] = [];
      for (const el of json.elements) {
        if (el.type === 'way' && el.geometry) { if (closedLL(el.geometry)) out.push({ outers: [flat(el.geometry)], inners: [] }); }
        else if (el.type === 'relation' && el.members) {
          const ways = (role: string) => el.members.filter((m: any) => m.type === 'way' && m.geometry && (m.role || 'outer') === role).map((m: any) => m.geometry as LL[]);
          out.push({ outers: stitch(ways('outer')).map(flat), inners: stitch(ways('inner')).map(flat) });
        }
      }
      return out;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

const same = (a: LL, b: LL) => a.lat === b.lat && a.lon === b.lon;
const closedLL = (r: LL[]) => r.length > 3 && same(r[0], r[r.length - 1]);

/** Recolle les tronçons de chemins d'une relation en anneaux fermés */
function stitch(segs: LL[][]): LL[][] {
  const open = segs.map((s) => s.slice());
  const rings: LL[][] = [];
  while (open.length) {
    let cur = open.pop()!;
    let changed = true;
    while (!closedLL(cur) && changed) {
      changed = false;
      for (let i = 0; i < open.length; i++) {
        const s = open[i];
        const a = cur[0], z = cur[cur.length - 1];
        if (same(z, s[0])) cur = cur.concat(s.slice(1));
        else if (same(z, s[s.length - 1])) cur = cur.concat(s.slice(0, -1).reverse());
        else if (same(a, s[s.length - 1])) cur = s.concat(cur.slice(1));
        else if (same(a, s[0])) cur = s.slice(1).reverse().concat(cur);
        else continue;
        open.splice(i, 1);
        changed = true;
        break;
      }
    }
    if (closedLL(cur)) rings.push(cur);
  }
  return rings;
}

/**
 * Eau dans le cadre, en mm (repère du tableau), fusionnée et découpée au cadre.
 */
export async function fetchWater(frame: WorldFrame, W: number, H: number, framePoly: Polygon, minAreaMm2: number): Promise<MultiPolygon> {
  const [[s, w], [n, e]] = frameBounds(frame);
  const geoms = await waterData([s, w, n, e]);

  const x0 = frame.cx - frame.hw, y0 = frame.cy - frame.hh;
  const ringMm = (r: number[]): Ring => {
    const pts: Pt[] = [];
    for (let i = 0; i + 1 < r.length; i += 2) {
      const [x, y] = lonLatToWorld(r[i], r[i + 1]);
      pts.push([((x - x0) / (2 * frame.hw)) * W, H - ((y - y0) / (2 * frame.hh)) * H]);
    }
    const sr = simplifyRing(pts, 0.1);
    return [...sr, sr[0]];
  };
  // on limite d'abord chaque forme à une zone un peu plus grande que le cadre (plus rapide)
  const margin = Math.max(W, H) * 0.1;
  const clipBox: Polygon = [[[-margin, -margin], [W + margin, -margin], [W + margin, H + margin], [-margin, H + margin], [-margin, -margin]]];

  const outers: MultiPolygon = [];
  const inners: MultiPolygon = [];
  for (const g of geoms) {
    for (const r of g.outers) outers.push(...intersect([[ringMm(r)]], clipBox));
    for (const r of g.inners) inners.push(...intersect([[ringMm(r)]], clipBox));
  }
  if (!outers.length) return [];
  let water = polygonClipping.union(outers[0] as any, ...(outers.slice(1) as any[])) as MultiPolygon;
  if (inners.length) water = polygonClipping.difference(water as any, ...(inners as any[])) as MultiPolygon;
  return intersect(water, framePoly).filter((poly) => polygonArea(poly) >= minAreaMm2);
}
