// Du projet (liste de pièces) au plan de découpe chiffré
import { bbox, polygonArea, ringLength, type Polygon, type Polyline, type Pt } from '../core/geometry';
import type { Job, JobPiece } from '../core/job';
import { nest, type NestItem } from './nest';
import type { AtelierState, Panel } from './store';

export interface PlacedPiece {
  id: string;
  group: string;
  shape: Polygon;
  engrave: Polyline[];
  /** centre de l'étiquette (mm, repère panneau) */
  center: Pt;
  rotated: boolean;
}

export interface PlanSheet {
  panel: Panel;
  thickness: number;
  /** numéro global du panneau (1, 2, …) */
  n: number;
  pieces: PlacedPiece[];
  /** surface réelle des pièces, mm² */
  pieceArea: number;
  util: number;
  /** longueur utilisée le long du grand côté (mm), pour le prorata */
  extent: number;
}

export interface PlanGroup {
  thickness: number;
  panel: Panel | null;
  auto: boolean;
  candidates: Panel[];
  sheets: PlanSheet[];
  pieceCount: number;
  tooBig: string[];
}

export interface Plan {
  groups: PlanGroup[];
  sheets: PlanSheet[];
  pieceCount: number;
  cutLengthMm: number;
  engraveLengthMm: number;
  timeMin: number;
  cost: { material: number; machine: number; consumables: number; labor: number; subtotal: number; margin: number; total: number };
  warnings: string[];
}

interface Prepared {
  id: string;
  group: string;
  shape: Polygon;
  engrave: Polyline[];
  w: number;
  h: number;
  thickness: number;
  area: number;
}

/** Ramène la pièce à l'origine (coin bas-gauche de son rectangle englobant en 0,0) */
function prepare(p: JobPiece): Prepared {
  const [x0, y0, x1, y1] = bbox([p.shape]);
  const mv = (pt: Pt): Pt => [pt[0] - x0, pt[1] - y0];
  return {
    id: p.id, group: p.group, thickness: p.thickness,
    shape: p.shape.map((r) => r.map(mv)),
    engrave: p.engrave.map((l) => l.map(mv)),
    w: x1 - x0, h: y1 - y0, area: polygonArea(p.shape),
  };
}

export function collectPieces(job: Job | null, s: AtelierState): JobPiece[] {
  const out: JobPiece[] = [];
  if (job) for (const p of job.pieces) if (!s.offGroups.includes(p.group)) out.push(p);
  s.manual.forEach((m, i) => {
    if (!(m.w > 0 && m.h > 0 && m.thickness > 0)) return;
    for (let k = 0; k < Math.max(0, Math.floor(m.qty)); k++) {
      out.push({
        id: `${101 + i}-${k + 1}`, group: m.name || `Pièce ${i + 1}`, thickness: m.thickness, engrave: [],
        shape: [[[0, 0], [m.w, 0], [m.w, m.h], [0, m.h], [0, 0]]],
      });
    }
  });
  return out;
}

const same = (a: number, b: number) => Math.abs(a - b) < 0.05;

function nestOn(panel: Panel, pcs: Prepared[], s: AtelierState) {
  const m = s.machine;
  const sp = Math.max(m.spacingMm, m.toolMm);
  const W = panel.w - 2 * m.marginMm + sp, H = panel.h - 2 * m.marginMm + sp;
  const items: NestItem[] = pcs.map((p, key) => ({ key, w: p.w + sp, h: p.h + sp, rot: !panel.grain }));
  const res = nest(items, W, H);
  const sheets = res.sheets.map((sh) => {
    let pieceArea = 0, extent = 0;
    const long = panel.w >= panel.h;
    const pieces: PlacedPiece[] = sh.placements.map((pl) => {
      const p = pcs[pl.key];
      const ox = m.marginMm + pl.x, oy = m.marginMm + pl.y;
      // rotation de 90° (sens trigo) puis translation
      const tf = (pt: Pt): Pt => (pl.rotated ? [ox + p.h - pt[1], oy + pt[0]] : [ox + pt[0], oy + pt[1]]);
      const w = pl.rotated ? p.h : p.w, h = pl.rotated ? p.w : p.h;
      pieceArea += p.area;
      extent = Math.max(extent, long ? ox + w : oy + h);
      return {
        id: p.id, group: p.group, rotated: pl.rotated,
        shape: p.shape.map((r) => r.map(tf)), engrave: p.engrave.map((l) => l.map(tf)),
        center: [ox + w / 2, oy + h / 2],
      };
    });
    return { pieces, pieceArea, extent: extent + m.marginMm };
  });
  return { sheets, tooBig: res.tooBig.map((k) => pcs[k].id) };
}

function sheetCost(panel: Panel, sheets: { extent: number }[], mode: 'sheets' | 'prorata') {
  if (!sheets.length) return 0;
  if (mode === 'sheets') return sheets.length * panel.price;
  const long = Math.max(panel.w, panel.h);
  // le dernier panneau n'est compté qu'à la longueur utilisée : la chute reste en stock
  return (sheets.length - 1) * panel.price + panel.price * Math.min(1, sheets[sheets.length - 1].extent / long);
}

export function makePlan(job: Job | null, s: AtelierState): Plan {
  const pieces = collectPieces(job, s).map(prepare);
  const warnings: string[] = [];
  const thicknesses: number[] = [];
  for (const p of pieces) if (!thicknesses.some((t) => same(t, p.thickness))) thicknesses.push(p.thickness);
  thicknesses.sort((a, b) => a - b);

  const groups: PlanGroup[] = [];
  const sheets: PlanSheet[] = [];
  let material = 0;
  for (const t of thicknesses) {
    const pcs = pieces.filter((p) => same(p.thickness, t));
    const candidates = s.panels.filter((p) => same(p.thickness, t) && p.w > 0 && p.h > 0);
    const chosenId = s.choice[String(t)];
    const chosen = candidates.find((p) => p.id === chosenId);
    let best: { panel: Panel; r: ReturnType<typeof nestOn>; cost: number } | null = null;
    for (const panel of chosen ? [chosen] : candidates) {
      const r = nestOn(panel, pcs, s);
      // un panneau qui laisse des pièces de côté passe après ceux qui prennent tout
      const cost = sheetCost(panel, r.sheets, s.quote.material) + r.tooBig.length * 1e6;
      if (!best || cost < best.cost || (cost === best.cost && r.sheets.length < best.r.sheets.length)) best = { panel, r, cost };
    }
    const named = (ids: string[]) => ids.map((id) => { const p = pcs.find((x) => x.id === id); return p && !p.group.startsWith('Couche') ? `${p.group} (${id})` : id; });
    const g: PlanGroup = { thickness: t, panel: best?.panel ?? null, auto: !chosen, candidates, sheets: [], pieceCount: pcs.length, tooBig: [] };
    if (!best) {
      warnings.push(`Aucun panneau de ${t} mm dans la bibliothèque : ajoute-en un pour placer ${pcs.length} pièce(s).`);
    } else {
      g.tooBig = best.r.tooBig;
      if (g.tooBig.length) warnings.push(`${g.tooBig.length} pièce(s) de ${t} mm ne rentrent pas dans « ${best.panel.name} » (${named(g.tooBig.slice(0, 6)).join(', ')}${g.tooBig.length > 6 ? '…' : ''}).`);
      const pArea = best.panel.w * best.panel.h;
      for (const sh of best.r.sheets) {
        const ps: PlanSheet = { panel: best.panel, thickness: t, n: sheets.length + 1, pieces: sh.pieces, pieceArea: sh.pieceArea, util: sh.pieceArea / pArea, extent: sh.extent };
        g.sheets.push(ps);
        sheets.push(ps);
      }
      material += sheetCost(best.panel, g.sheets, s.quote.material);
      const m = s.machine;
      const fitsBed = (best.panel.w <= m.bedW && best.panel.h <= m.bedH) || (best.panel.h <= m.bedW && best.panel.w <= m.bedH);
      if (!fitsBed && g.sheets.length) warnings.push(`« ${best.panel.name} » (${best.panel.w} × ${best.panel.h}) est plus grand que la table (${m.bedW} × ${m.bedH}) : il faudra le recouper avant usinage.`);
    }
    groups.push(g);
  }

  // temps d'usinage
  const m = s.machine;
  let cut = 0, eng = 0, timeMin = 0;
  for (const sh of sheets) {
    const passes = Math.max(1, Math.ceil(sh.thickness / Math.max(0.1, m.passDepthMm)));
    for (const p of sh.pieces) {
      const len = p.shape.reduce((a, r) => a + ringLength(r), 0);
      const e = p.engrave.reduce((a, l) => a + ringLength(l, false), 0);
      cut += len;
      eng += e;
      timeMin += (len * passes) / Math.max(1, m.feedMmMin) + e / Math.max(1, m.engraveFeedMmMin);
      timeMin += ((p.shape.length * passes + p.engrave.length) * m.contourSec) / 60;
    }
    timeMin += m.sheetSetupMin;
  }

  const q = s.quote;
  const machine = (timeMin / 60) * m.hourlyRate;
  const labor = q.laborH * q.laborRate;
  const subtotal = material + machine + q.consumables + labor;
  const margin = subtotal * (q.marginPct / 100);
  return {
    groups, sheets, pieceCount: pieces.length, cutLengthMm: cut, engraveLengthMm: eng, timeMin, warnings,
    cost: { material, machine, consumables: q.consumables, labor, subtotal, margin, total: subtotal + margin },
  };
}
