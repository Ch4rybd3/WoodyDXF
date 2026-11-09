// Du projet (liste de pièces) au plan de découpe chiffré
import { bbox, polygonArea, ringLength, type Polygon, type Polyline, type Pt } from '../core/geometry';
import type { Job, JobPiece } from '../core/job';
import { nest, type NestItem } from './nest';
import { applyPlacement, nestShapes } from './nestShape';
import polylabel from 'polylabel';
import type { AtelierState, Offcut, Panel } from './store';

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
  /** chute du stock utilisée comme panneau (sinon panneau neuf) */
  stock: Offcut | null;
  /** coût matière de ce panneau dans le devis */
  cost: number;
  /** chute rectangulaire récupérable après découpe (repère panneau), avec sa valeur */
  leftover: { x: number; y: number; w: number; h: number; value: number } | null;
}

export interface PlanGroup {
  thickness: number;
  panel: Panel | null;
  auto: boolean;
  candidates: Panel[];
  sheets: PlanSheet[];
  pieceCount: number;
  tooBig: string[];
  /** panneaux neufs (sans les chutes du stock) */
  newSheets: number;
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

function nestOn(panel: Panel, pcs: Prepared[], s: AtelierState, maxSheets?: number) {
  const m = s.machine;
  const sp = Math.max(m.spacingMm, m.toolMm);
  const W = panel.w - 2 * m.marginMm + sp, H = panel.h - 2 * m.marginMm + sp;
  const long = panel.w >= panel.h;
  const finish = (placed: { p: Prepared; tf: (pt: Pt) => Pt; rotated: boolean }[]) => {
    let pieceArea = 0, extent = 0, mx = 0, my = 0;
    const pieces: PlacedPiece[] = placed.map(({ p, tf, rotated }) => {
      const shape = p.shape.map((r) => r.map(tf));
      const [x0, y0, x1, y1] = bbox([shape]);
      pieceArea += p.area;
      extent = Math.max(extent, long ? x1 : y1);
      mx = Math.max(mx, x1);
      my = Math.max(my, y1);
      // étiquette au « pôle d'inaccessibilité » : toujours dans la matière, même pour un cadre
      const lab = polylabel(shape, 1) as unknown as number[];
      const center: Pt = Number.isFinite(lab[0]) ? [lab[0], lab[1]] : [(x0 + x1) / 2, (y0 + y1) / 2];
      return { id: p.id, group: p.group, rotated, shape, engrave: p.engrave.map((l) => l.map(tf)), center };
    });
    return { pieces, pieceArea, extent: extent + m.marginMm, used: placed.map((x) => x.p), mx, my };
  };

  if (s.nesting === 'shape') {
    const res = nestShapes(pcs.map((p, key) => ({ key, shape: p.shape })), panel.w, panel.h,
      { margin: m.marginMm, spacing: sp, allowRot: !panel.grain, precision: s.precision, maxSheets });
    return {
      sheets: res.sheets.map((pls) => finish(pls.map((pl) => ({ p: pcs[pl.key], tf: (pt: Pt) => applyPlacement(pt, pl), rotated: pl.rot !== 0 })))),
      tooBig: res.tooBig.map((k) => pcs[k].id),
    };
  }

  const items: NestItem[] = pcs.map((p, key) => ({ key, w: p.w + sp, h: p.h + sp, rot: !panel.grain }));
  const res = nest(items, W, H);
  if (maxSheets !== undefined) {
    for (const sh of res.sheets.slice(maxSheets)) res.tooBig.push(...sh.placements.map((pl) => pl.key));
    res.sheets = res.sheets.slice(0, maxSheets);
  }
  const sheets = res.sheets.map((sh) => finish(sh.placements.map((pl) => {
    const p = pcs[pl.key];
    const ox = m.marginMm + pl.x, oy = m.marginMm + pl.y;
    // rotation de 90° (sens trigo) puis translation
    const tf = (pt: Pt): Pt => (pl.rotated ? [ox + p.h - pt[1], oy + pt[0]] : [ox + pt[0], oy + pt[1]]);
    return { p, tf, rotated: pl.rotated };
  })));
  return { sheets, tooBig: res.tooBig.map((k) => pcs[k].id) };
}

function sheetCost(panel: Panel, sheets: { extent: number }[], mode: 'sheets' | 'prorata') {
  if (!sheets.length) return 0;
  if (mode === 'sheets') return sheets.length * panel.price;
  const long = Math.max(panel.w, panel.h);
  // le dernier panneau n'est compté qu'à la longueur utilisée : la chute reste en stock
  return (sheets.length - 1) * panel.price + panel.price * Math.min(1, sheets[sheets.length - 1].extent / long);
}

type Nested = ReturnType<typeof nestOn>['sheets'][number];

/** La chute du stock vue comme un panneau (même sens du fil que le panneau neuf) */
const stockPanel = (o: Offcut, like: Panel): Panel => ({ id: `chute:${o.id}`, name: o.name, w: o.w, h: o.h, thickness: o.thickness, price: o.value, grain: like.grain });

/**
 * Remplit des chutes du stock, puis des panneaux neufs. Plusieurs variantes (sans stock, grandes chutes d'abord,
 * petites d'abord) : on garde celle qui consomme le moins de matière, chutes à garder déduites
 */
function nestWithStock(panel: Panel, stock: Offcut[], pcs: Prepared[], s: AtelierState) {
  const variant = (order: Offcut[]) => {
    let rest = pcs;
    const fromStock: { offcut: Offcut; panel: Panel; sheet: Nested }[] = [];
    for (const o of order) {
      if (!rest.length) break;
      const op = stockPanel(o, panel);
      const sh = nestOn(op, rest, s, 1).sheets[0];
      if (!sh || !sh.pieces.length) continue;
      fromStock.push({ offcut: o, panel: op, sheet: sh });
      const used = new Set(sh.used);
      rest = rest.filter((p) => !used.has(p));
    }
    const r = nestOn(panel, rest, s);
    // matière réellement consommée : chutes entamées + panneaux neufs − chutes qu'on garde
    const kept = (pn: Panel, sh: Nested, v: number) => leftoverOf(pn, sh, s, v)?.value ?? 0;
    const net = fromStock.reduce((a, f) => a + f.offcut.value - kept(f.panel, f.sheet, f.offcut.value), 0)
      + r.sheets.reduce((a, sh) => a + panel.price - kept(panel, sh, panel.price), 0);
    const stockCost = s.quote.offcuts === 'free' ? 0 : fromStock.reduce((a, f) => a + f.offcut.value, 0);
    return { fromStock, sheets: r.sheets, tooBig: r.tooBig, net, cost: stockCost + sheetCost(panel, r.sheets, s.quote.material) };
  };
  const byArea = stock.slice().sort((a, b) => b.w * b.h - a.w * a.h);
  const orders = stock.length ? [[], byArea, byArea.slice().reverse()] : [[]];
  let best: ReturnType<typeof variant> | null = null;
  for (const ord of orders) {
    const v = variant(ord);
    if (!best || v.tooBig.length < best.tooBig.length || (v.tooBig.length === best.tooBig.length
      && (v.sheets.length < best.sheets.length || (v.sheets.length === best.sheets.length && v.net < best.net - 0.005)))) best = v;
  }
  return best!;
}

/** Plus grande bande rectangulaire libre au-delà des pièces, si elle vaut la peine d'être gardée */
function leftoverOf(panel: Panel, sh: Nested, s: AtelierState, value: number): PlanSheet['leftover'] {
  if (!sh.pieces.length) return null;
  const sp = Math.max(s.machine.spacingMm, s.machine.toolMm);
  // la recoupe passe à un espacement des pièces
  const cx = sh.mx + sp, cy = sh.my + sp;
  const opts = [{ x: cx, y: 0, w: panel.w - cx, h: panel.h }, { x: 0, y: cy, w: panel.w, h: panel.h - cy }]
    .filter((r) => Math.min(r.w, r.h) >= Math.max(1, s.minOffcut))
    .sort((p, q) => q.w * q.h - p.w * p.h);
  const c = opts[0];
  if (!c) return null;
  return { ...c, value: Math.round(((value * c.w * c.h) / (panel.w * panel.h)) * 100) / 100 };
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
    const known = new Set(s.panels.map((p) => p.id));
    // chutes de cette matière, ou de matière non précisée de la même épaisseur
    const stockFor = (panel: Panel) => (s.useOffcuts
      ? s.offcuts.filter((o) => same(o.thickness, t) && o.w > 0 && o.h > 0 && (o.panelId === panel.id || !known.has(o.panelId)))
      : []);
    let best: { panel: Panel; r: ReturnType<typeof nestWithStock>; cost: number } | null = null;
    for (const panel of chosen ? [chosen] : candidates) {
      const r = nestWithStock(panel, stockFor(panel), pcs, s);
      // un panneau qui laisse des pièces de côté passe après ceux qui prennent tout
      const cost = r.cost + r.tooBig.length * 1e6;
      if (!best || cost < best.cost || (cost === best.cost && r.sheets.length < best.r.sheets.length)) best = { panel, r, cost };
    }
    const named = (ids: string[]) => ids.map((id) => { const p = pcs.find((x) => x.id === id); return p && !p.group.startsWith('Couche') ? `${p.group} (${id})` : id; });
    const g: PlanGroup = { thickness: t, panel: best?.panel ?? null, auto: !chosen, candidates, sheets: [], pieceCount: pcs.length, tooBig: [], newSheets: 0 };
    if (!best) {
      warnings.push(`Aucun panneau de ${t} mm dans la bibliothèque : ajoute-en un pour placer ${pcs.length} pièce(s).`);
    } else {
      const { r, panel } = best;
      g.tooBig = r.tooBig;
      g.newSheets = r.sheets.length;
      if (g.tooBig.length) warnings.push(`${g.tooBig.length} pièce(s) de ${t} mm ne rentrent pas dans « ${panel.name} » (${named(g.tooBig.slice(0, 6)).join(', ')}${g.tooBig.length > 6 ? '…' : ''}).`);
      const push = (pn: Panel, sh: Nested, stock: Offcut | null, cost: number) => {
        const ps: PlanSheet = {
          panel: pn, thickness: t, n: sheets.length + 1, pieces: sh.pieces, pieceArea: sh.pieceArea, util: sh.pieceArea / (pn.w * pn.h),
          extent: sh.extent, stock, cost, leftover: leftoverOf(pn, sh, s, stock ? stock.value : pn.price),
        };
        g.sheets.push(ps);
        sheets.push(ps);
      };
      for (const f of r.fromStock) push(f.panel, f.sheet, f.offcut, s.quote.offcuts === 'free' ? 0 : f.offcut.value);
      const newCost = sheetCost(panel, r.sheets, s.quote.material);
      r.sheets.forEach((sh, i) => push(panel, sh, null, i < r.sheets.length - 1 ? panel.price : newCost - (r.sheets.length - 1) * panel.price));
      material += r.cost;
      const m = s.machine;
      const fitsBed = (panel.w <= m.bedW && panel.h <= m.bedH) || (panel.h <= m.bedW && panel.w <= m.bedH);
      if (!fitsBed && r.sheets.length) warnings.push(`« ${panel.name} » (${panel.w} × ${panel.h}) est plus grand que la table (${m.bedW} × ${m.bedH}) : il faudra le recouper avant usinage.`);
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
