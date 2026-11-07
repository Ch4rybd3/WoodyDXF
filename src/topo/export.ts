import JSZip from 'jszip';
import { DxfWriter } from '../core/dxf';
import { translateLines, translateMP, type MultiPolygon, type Polyline } from '../core/geometry';
import type { TopoLayer, TopoParams, TopoResult } from './layers';

function writeLayer(dxf: DxfWriter, pieces: MultiPolygon, engrave: Polyline[], labels: Polyline[]) {
  for (const poly of pieces) {
    dxf.addRing('CUT_OUTSIDE', poly[0]);
    for (const hole of poly.slice(1)) dxf.addRing('CUT_INSIDE', hole);
  }
  for (const l of engrave) dxf.addPolyline('ENGRAVE', l);
  for (const l of labels) dxf.addPolyline('ENGRAVE', l);
}

export function layerDxf(L: TopoLayer): string {
  const d = new DxfWriter();
  writeLayer(d, L.pieces, L.engrave, L.labels);
  return d.toString();
}

/** Toutes les couches côte à côte dans un seul DXF (avant calepinage) */
export function allLayersDxf(r: TopoResult, gap = 10): string {
  const d = new DxfWriter();
  const cols = Math.ceil(Math.sqrt(r.layers.length));
  r.layers.forEach((L, i) => {
    const dx = (i % cols) * (r.W + gap);
    const dy = -Math.floor(i / cols) * (r.H + gap);
    writeLayer(d, translateMP(L.pieces, dx, dy), translateLines(L.engrave, dx, dy), translateLines(L.labels, dx, dy));
    d.addRing('INFO', [[dx, dy], [dx + r.W, dy], [dx + r.W, dy + r.H], [dx, dy + r.H]]);
  });
  return d.toString();
}

export async function buildZip(r: TopoResult, p: TopoParams, placeName: string, lat: number, lon: number): Promise<Blob> {
  const zip = new JSZip();
  const pad = (i: number) => String(i).padStart(2, '0');
  const folder = zip.folder('couches')!;
  for (const L of r.layers) folder.file(`couche-${pad(L.index)}.dxf`, layerDxf(L));
  zip.file('toutes-les-couches.dxf', allLayersDxf(r));
  const lines = [
    'WoodyDXF — Tableau en relief',
    '============================',
    '',
    `Lieu            : ${placeName || '—'}`,
    `Centre          : ${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    `Format          : ${r.W} × ${r.H} mm (${p.shape === 'circle' ? 'cercle' : 'rectangle'})`,
    `Échelle         : 1:${Math.round(r.scale).toLocaleString('fr-FR')}`,
    `Épaisseur couche: ${p.layerMm} mm`,
    `Équidistance    : ${r.layerRealM.toFixed(1)} m par couche`,
    `Exagération     : ×${r.exaggeration.toFixed(2)}`,
    `Altitudes       : ${Math.round(r.base)} m → ${Math.round(r.top)} m`,
    `Couches         : ${r.layers.length} (couche 00 = fond), épaisseur totale ${(r.layers.length * p.layerMm).toFixed(1)} mm`,
    `Pièces          : ${r.totalPieces}`,
    `Longueur coupe  : ${(r.cutLengthMm / 1000).toFixed(2)} m`,
    '',
    'Calques DXF (unités : mm)',
    '  CUT_OUTSIDE  découpe extérieure (fraise à l’extérieur du trait)',
    '  CUT_INSIDE   découpe intérieure (trous)',
    '  ENGRAVE      gravure sur le trait : courbes fines, repères de pose, numéros',
    '  INFO         cadre indicatif (non usiné)',
    '',
    'Montage : coller chaque couche N sur la couche N-1 en suivant le repère gravé.',
    '',
    ...r.warnings.map((w) => `Attention : ${w}`),
    '',
    'Données : relief © Mapzen / AWS Terrain Tiles (SRTM, NASA, EU-DEM, etc.) ;',
    'fond de carte © contributeurs OpenStreetMap.',
  ];
  zip.file('LISEZ-MOI.txt', lines.join('\r\n'));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
