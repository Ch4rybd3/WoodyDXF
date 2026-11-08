import JSZip from 'jszip';
import { DxfWriter } from '../core/dxf';
import { bbox, translateMP, type Polygon, type Polyline, type Pt } from '../core/geometry';
import type { Job, JobPiece } from '../core/job';
import type { LamesParams, LamesResult, Slice } from './model';

const pad3 = (i: number) => String(i).padStart(3, '0');
const fmt = (n: number, d = 0) => n.toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d });

function addPieces(d: DxfWriter, pieces: Polygon[], engrave: Polyline[]) {
  for (const poly of pieces) {
    d.addRing('CUT_OUTSIDE', poly[0]);
    for (const h of poly.slice(1)) d.addRing('CUT_INSIDE', h);
  }
  for (const l of engrave) d.addPolyline('ENGRAVE', l);
}

export function sliceDxf(s: Slice): string {
  const d = new DxfWriter();
  addPieces(d, s.pieces, s.labels.flat());
  return d.toString();
}

/** Toutes les lames côte à côte (contrôle visuel, avant calepinage) */
export function allSlicesDxf(r: LamesResult, gap = 20): string {
  const d = new DxfWriter();
  const all = r.slices.flatMap((s) => s.pieces);
  if (!all.length) return d.toString();
  const [, , x1, y1] = bbox(all);
  const cols = Math.ceil(Math.sqrt(r.slices.length * (y1 / Math.max(1, x1))));
  r.slices.forEach((s, i) => {
    const dx = (i % cols) * (x1 + gap), dy = -Math.floor(i / cols) * (y1 + gap);
    const mv = (l: Polyline) => l.map(([x, y]) => [x + dx, y + dy] as Pt);
    addPieces(d, translateMP(s.pieces, dx, dy), s.labels.flat().map(mv));
  });
  return d.toString();
}

export function lamesToJob(r: LamesResult, p: LamesParams, name: string): Job {
  const pieces: JobPiece[] = [];
  for (const s of r.slices) s.pieces.forEach((shape, k) => pieces.push({ id: s.ids[k], group: 'Lames', shape, engrave: s.labels[k], thickness: p.thickness }));
  if (r.spacerShape) for (let i = 0; i < r.spacers; i++) pieces.push({ id: `0-${i + 1}`, group: 'Entretoises', shape: r.spacerShape, engrave: [], thickness: p.gap });
  return { name, source: 'Lames', pieces };
}

export function lamesReport(r: LamesResult, p: LamesParams, name: string): string[] {
  return [
    `WoodyDXF — ${name}`,
    '='.repeat(12 + name.length),
    '',
    `Dimensions      : ${p.L} × ${p.P} × ${p.H} mm (longueur × profondeur × hauteur)`,
    `Lames           : ${r.slices.length} de ${p.thickness} mm, espacement ${p.gap} mm`,
    `Pièces          : ${r.pieceCount}`,
    `Longueur coupe  : ${fmt(r.cutLengthMm / 1000, 1)} m`,
    `Poids estimé    : ${fmt(r.weightKg, 1)} kg (densité ${p.density} kg/m³)`,
    '',
    'Assemblage',
    ...r.rods.flatMap((t, i) => t.runs.map((x, j) => `  Tige ${i + 1}${t.runs.length > 1 ? String.fromCharCode(97 + j) : ''} : Ø ${p.rodD} mm, position u ${t.u} / v ${t.v} mm, lames ${x.first} à ${x.last}, longueur ≈ ${Math.ceil(x.length / 10) * 10} mm`)),
    ...(r.spacers ? [`  Entretoises : ${r.spacers} rondelles de ${p.gap} mm (Ø ${Math.max(p.spacerD, p.rodD + 8)} / Ø ${p.rodD}), fichier entretoises.dxf`] : []),
    '',
    'Montage : enfiler les lames dans l’ordre des numéros gravés (1 = côté gauche, vue de face),',
    'intercaler les entretoises, encoller si besoin, puis serrer les écrous.',
    '',
    'Calques : CUT_OUTSIDE (découpe ext.), CUT_INSIDE (trous, découpes), ENGRAVE (numéros).',
    '',
    ...r.warnings.map((w) => `Attention : ${w}`),
  ];
}

export async function buildLamesZip(r: LamesResult, p: LamesParams, name: string): Promise<Blob> {
  const zip = new JSZip();
  const f = zip.folder('lames')!;
  for (const s of r.slices) f.file(`lame-${pad3(s.index)}.dxf`, sliceDxf(s));
  zip.file('toutes-les-lames.dxf', allSlicesDxf(r));
  if (r.spacerShape && r.spacers) {
    const d = new DxfWriter();
    const D = Math.max(p.spacerD, p.rodD + 8) + 6;
    const cols = Math.ceil(Math.sqrt(r.spacers));
    for (let i = 0; i < r.spacers; i++) addPieces(d, translateMP([r.spacerShape], (i % cols) * D, Math.floor(i / cols) * D), []);
    zip.file('entretoises.dxf', d.toString());
  }
  zip.file('LISEZ-MOI.txt', lamesReport(r, p, name).join('\r\n'));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
