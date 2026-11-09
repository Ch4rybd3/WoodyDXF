import JSZip from 'jszip';
import { DxfWriter } from '../core/dxf';
import { strokeText, textUnits } from '../core/font';
import { bbox, type Polyline } from '../core/geometry';
import type { Plan, PlanSheet, PlacedPiece } from './plan';
import type { AtelierState } from './store';

const pad = (i: number) => String(i).padStart(2, '0');
export const eur = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
export const fmt = (n: number, d = 0) => n.toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d });
export const duration = (min: number) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
};

/** Numéro de pièce en traits (repère, calque INFO : non usiné) */
export function pieceLabel(p: PlacedPiece): Polyline[] {
  const [x0, y0, x1, y1] = bbox([p.shape]);
  // hauteur limitée par la pièce : texte ≤ 60 % de la largeur, ≤ 1/4 de la hauteur
  const h = Math.max(2, Math.min(10, (y1 - y0) / 4, (0.6 * (x1 - x0) * 6) / textUnits(p.id)));
  return strokeText(p.id, p.center, h);
}

export function sheetDxf(sh: PlanSheet): string {
  const d = new DxfWriter();
  d.addRing('INFO', [[0, 0], [sh.panel.w, 0], [sh.panel.w, sh.panel.h], [0, sh.panel.h]]);
  for (const p of sh.pieces) {
    d.addRing('CUT_OUTSIDE', p.shape[0]);
    for (const hole of p.shape.slice(1)) d.addRing('CUT_INSIDE', hole);
    for (const l of p.engrave) d.addPolyline('ENGRAVE', l);
    for (const l of pieceLabel(p)) d.addPolyline('INFO', l);
  }
  // recoupe de la chute à garder : une ligne droite de bord à bord
  const lo = sh.leftover;
  if (lo) d.addPolyline('CUT_OFFCUT', lo.x > 0 ? [[lo.x, 0], [lo.x, sh.panel.h]] : [[0, lo.y], [sh.panel.w, lo.y]]);
  return d.toString();
}

export const sheetFile = (sh: PlanSheet) => `panneau-${pad(sh.n)}${sh.stock ? '-chute' : ''}-${String(sh.thickness).replace('.', ',')}mm.dxf`;

export function quoteLines(plan: Plan, s: AtelierState, projectName: string): string[] {
  const c = plan.cost, q = s.quote, m = s.machine;
  const L = [
    'WoodyDXF — Devis simulé',
    '=======================',
    '',
    `Projet          : ${projectName || '—'}`,
    `Pièces          : ${plan.pieceCount}`,
    `Panneaux        : ${plan.sheets.filter((sh) => !sh.stock).length} neuf(s)${plan.sheets.some((sh) => sh.stock) ? ` + ${plan.sheets.filter((sh) => sh.stock).length} chute(s) du stock` : ''}`,
    '',
    'Panneaux utilisés',
  ];
  for (const g of plan.groups) {
    if (!g.panel) continue;
    const news = g.sheets.filter((sh) => !sh.stock);
    if (news.length) {
      const u = news.reduce((a, sh) => a + sh.pieceArea, 0) / (news.length * g.panel.w * g.panel.h);
      L.push(`  ${news.length} × ${g.panel.name} (${g.panel.w} × ${g.panel.h} mm, ${eur(g.panel.price)}) · utilisation ${fmt(u * 100)} %`);
    }
    for (const sh of g.sheets.filter((x) => x.stock)) L.push(`  Chute du stock : ${sh.panel.name} (${sh.panel.w} × ${sh.panel.h} mm, ${eur(sh.cost)}) · ${sh.pieces.length} pièces`);
  }
  const kept = plan.sheets.filter((sh) => sh.leftover);
  if (kept.length) {
    L.push('', 'Chutes à garder après découpe');
    for (const sh of kept) L.push(`  Panneau ${sh.n} : ${fmt(sh.leftover!.w)} × ${fmt(sh.leftover!.h)} mm (valeur ${eur(sh.leftover!.value)})`);
  }
  L.push(
    '',
    `Longueur de coupe : ${fmt(plan.cutLengthMm / 1000, 1)} m · gravure ${fmt(plan.engraveLengthMm / 1000, 1)} m`,
    `Temps machine     : ${duration(plan.timeMin)} (avance ${m.feedMmMin} mm/min, passes de ${m.passDepthMm} mm)`,
    '',
    `Matière         : ${eur(c.material)}${q.material === 'prorata' ? ' (dernier panneau au prorata)' : ' (panneaux entiers)'}${plan.sheets.some((sh) => sh.stock) ? (q.offcuts === 'free' ? ', chutes offertes' : ', chutes à leur valeur') : ''}`,
    `Machine         : ${eur(c.machine)} (${m.hourlyRate} €/h)`,
    `Consommables    : ${eur(c.consumables)}`,
    `Main d’œuvre    : ${eur(c.labor)} (${q.laborH} h × ${q.laborRate} €/h)`,
    `Sous-total      : ${eur(c.subtotal)}`,
    `${`Marge ${q.marginPct} %`.padEnd(16)}: ${eur(c.margin)}`,
    `PRIX CONSEILLÉ  : ${eur(c.total)}`,
    '',
    ...plan.warnings.map((w) => `Attention : ${w}`),
  );
  return L;
}

export async function buildAtelierZip(plan: Plan, s: AtelierState, projectName: string): Promise<Blob> {
  const zip = new JSZip();
  const f = zip.folder('panneaux')!;
  for (const sh of plan.sheets) f.file(sheetFile(sh), sheetDxf(sh));
  zip.file('devis.txt', quoteLines(plan, s, projectName).join('\r\n'));
  zip.file('LISEZ-MOI.txt', [
    'WoodyDXF — Fichiers de découpe par panneau',
    '',
    'Un fichier DXF par panneau, pièces déjà placées (unités : mm, origine en bas à gauche du panneau).',
    '  CUT_OUTSIDE  découpe extérieure (fraise à l’extérieur du trait)',
    '  CUT_INSIDE   découpe intérieure (trous)',
    '  ENGRAVE      gravure : courbes fines, repères de pose, numéros',
    '  INFO         contour du panneau et numéro des pièces (non usinés)',
    '  CUT_OFFCUT   recoupe de la chute à garder (à faire en dernier, ou à la scie)',
    '',
    `Espacement entre pièces : ${Math.max(s.machine.spacingMm, s.machine.toolMm)} mm, marge au bord : ${s.machine.marginMm} mm.`,
    'Pense à ajouter des ponts de maintien (tabs) dans ta FAO pour que les pièces ne bougent pas.',
    '',
    'Liste des pièces par panneau',
    ...plan.sheets.map((sh) => `  ${sheetFile(sh)} : ${sh.pieces.map((p) => p.id).join(', ')}`),
  ].join('\r\n'));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
