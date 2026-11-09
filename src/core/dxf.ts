// Écrivain DXF minimal, format R12 (AC1009) : lu par toutes les FAO (VCarve, Fusion, Estlcam, LightBurn…)
import type { Pt, Ring, Polyline } from './geometry';
import { openRing } from './geometry';

/** Calques normalisés WoodyDXF : un calque = une opération d'usinage */
export const DXF_LAYERS = {
  CUT_OUTSIDE: { color: 1, label: 'Découpe extérieure' }, // rouge
  CUT_INSIDE: { color: 5, label: 'Découpe intérieure' }, // bleu
  POCKET: { color: 3, label: 'Poche' }, // vert
  ENGRAVE: { color: 7, label: 'Gravure' }, // noir/blanc
  DRILL: { color: 6, label: 'Perçage' }, // magenta
  INFO: { color: 8, label: 'Information (non usiné)' }, // gris
  CUT_OFFCUT: { color: 4, label: 'Recoupe de la chute à garder' }, // cyan
} as const;

export type DxfLayer = keyof typeof DXF_LAYERS;

type Entity =
  | { kind: 'poly'; layer: DxfLayer; pts: Pt[]; closed: boolean }
  | { kind: 'circle'; layer: DxfLayer; c: Pt; r: number };

const f = (n: number) => (Math.round(n * 10000) / 10000).toString();

export class DxfWriter {
  private ents: Entity[] = [];

  addRing(layer: DxfLayer, ring: Ring) {
    const pts = openRing(ring);
    if (pts.length >= 3) this.ents.push({ kind: 'poly', layer, pts, closed: true });
  }

  addPolyline(layer: DxfLayer, pts: Polyline) {
    if (pts.length >= 2) this.ents.push({ kind: 'poly', layer, pts, closed: false });
  }

  addCircle(layer: DxfLayer, c: Pt, r: number) {
    this.ents.push({ kind: 'circle', layer, c, r });
  }

  get count() {
    return this.ents.length;
  }

  toString(): string {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x: number, y: number) => {
      if (x < x0) x0 = x; if (y < y0) y0 = y;
      if (x > x1) x1 = x; if (y > y1) y1 = y;
    };
    for (const e of this.ents) {
      if (e.kind === 'poly') e.pts.forEach(([x, y]) => grow(x, y));
      else { grow(e.c[0] - e.r, e.c[1] - e.r); grow(e.c[0] + e.r, e.c[1] + e.r); }
    }
    if (!isFinite(x0)) { x0 = y0 = 0; x1 = y1 = 1; }

    const o: string[] = [];
    const g = (code: number, val: string | number) => o.push(String(code), typeof val === 'number' ? f(val) : val);

    // HEADER
    g(0, 'SECTION'); g(2, 'HEADER');
    g(9, '$ACADVER'); g(1, 'AC1009');
    g(9, '$INSUNITS'); g(70, '4'); // millimètres
    g(9, '$MEASUREMENT'); g(70, '1'); // métrique
    g(9, '$EXTMIN'); g(10, x0); g(20, y0); g(30, 0);
    g(9, '$EXTMAX'); g(10, x1); g(20, y1); g(30, 0);
    g(0, 'ENDSEC');

    // TABLES
    g(0, 'SECTION'); g(2, 'TABLES');
    g(0, 'TABLE'); g(2, 'LTYPE'); g(70, '1');
    g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, '0'); g(3, 'Solid line'); g(72, '65'); g(73, '0'); g(40, 0);
    g(0, 'ENDTAB');
    const names = Object.keys(DXF_LAYERS) as DxfLayer[];
    g(0, 'TABLE'); g(2, 'LAYER'); g(70, String(names.length + 1));
    g(0, 'LAYER'); g(2, '0'); g(70, '0'); g(62, '7'); g(6, 'CONTINUOUS');
    for (const n of names) {
      g(0, 'LAYER'); g(2, n); g(70, '0'); g(62, String(DXF_LAYERS[n].color)); g(6, 'CONTINUOUS');
    }
    g(0, 'ENDTAB');
    g(0, 'ENDSEC');

    // ENTITIES
    g(0, 'SECTION'); g(2, 'ENTITIES');
    for (const e of this.ents) {
      if (e.kind === 'circle') {
        g(0, 'CIRCLE'); g(8, e.layer); g(10, e.c[0]); g(20, e.c[1]); g(30, 0); g(40, e.r);
        continue;
      }
      g(0, 'POLYLINE'); g(8, e.layer); g(66, '1'); g(10, 0); g(20, 0); g(30, 0); g(70, e.closed ? '1' : '0');
      for (const [x, y] of e.pts) {
        g(0, 'VERTEX'); g(8, e.layer); g(10, x); g(20, y); g(30, 0);
      }
      g(0, 'SEQEND'); g(8, e.layer);
    }
    g(0, 'ENDSEC');
    g(0, 'EOF');
    return o.join('\r\n') + '\r\n';
  }
}
