// Bibliothèque de panneaux, paramètres machine et devis (enregistrés dans le navigateur)

export interface Panel {
  id: string;
  name: string;
  /** dimensions en mm */
  w: number;
  h: number;
  thickness: number;
  /** prix du panneau entier, € TTC */
  price: number;
  /** sens du fil : interdit la rotation des pièces */
  grain: boolean;
}

export interface Machine {
  bedW: number;
  bedH: number;
  toolMm: number;
  /** espace entre deux pièces (≥ Ø fraise) */
  spacingMm: number;
  /** marge au bord du panneau */
  marginMm: number;
  feedMmMin: number;
  engraveFeedMmMin: number;
  passDepthMm: number;
  /** temps de plongée / remontée par contour, en s */
  contourSec: number;
  /** temps de mise en place d'un panneau, en min */
  sheetSetupMin: number;
  hourlyRate: number;
}

export interface QuoteSettings {
  /** matière comptée au panneau entier ou au prorata de la surface utilisée */
  material: 'sheets' | 'prorata';
  consumables: number;
  laborH: number;
  laborRate: number;
  marginPct: number;
  /** chutes du stock : comptées à leur valeur ou gratuites */
  offcuts: 'value' | 'free';
}

/** Chute rectangulaire en stock, réutilisable avant d'entamer un panneau neuf */
export interface Offcut {
  id: string;
  name: string;
  w: number;
  h: number;
  thickness: number;
  /** panneau d'origine dans la bibliothèque ('' = matière quelconque de cette épaisseur) */
  panelId: string;
  /** valeur de la chute, € */
  value: number;
}

export interface ManualPiece {
  id: string;
  name: string;
  w: number;
  h: number;
  thickness: number;
  qty: number;
}

export interface AtelierState {
  panels: Panel[];
  machine: Machine;
  quote: QuoteSettings;
  manual: ManualPiece[];
  /** panneau choisi pour chaque épaisseur (clé = épaisseur), vide = automatique */
  choice: Record<string, string>;
  offGroups: string[];
  /** calepinage : formes imbriquées (pièces dans les trous) ou rectangles englobants */
  nesting: 'shape' | 'rect';
  precision: 'normal' | 'fine';
  offcuts: Offcut[];
  /** placer d'abord les pièces dans les chutes du stock */
  useOffcuts: boolean;
  /** plus petit côté d'une chute qu'on garde, mm */
  minOffcut: number;
}

// Prix indicatifs (négoce bois France), à remplacer par les tiens
export const DEFAULT_PANELS: Panel[] = [
  { id: 'cpp3', name: 'CP peuplier 3 mm', w: 2500, h: 1220, thickness: 3, price: 19, grain: false },
  { id: 'cpp5', name: 'CP peuplier 5 mm', w: 2500, h: 1220, thickness: 5, price: 26, grain: false },
  { id: 'cpb3', name: 'CP bouleau 3 mm', w: 1525, h: 1525, thickness: 3, price: 24, grain: false },
  { id: 'cpb6', name: 'CP bouleau 6 mm', w: 1525, h: 1525, thickness: 6, price: 38, grain: false },
  { id: 'mdf3', name: 'MDF 3 mm', w: 2440, h: 1220, thickness: 3, price: 12, grain: false },
  { id: 'mdf6', name: 'MDF 6 mm', w: 2440, h: 1220, thickness: 6, price: 18, grain: false },
  { id: 'cpp15', name: 'CP peuplier 15 mm', w: 2500, h: 1220, thickness: 15, price: 55, grain: true },
  { id: 'cpb18', name: 'CP bouleau 18 mm', w: 2500, h: 1250, thickness: 18, price: 115, grain: true },
  { id: 'mdf18', name: 'MDF 18 mm', w: 2440, h: 1220, thickness: 18, price: 42, grain: false },
];

export const DEFAULT_MACHINE: Machine = {
  bedW: 2500, bedH: 1250, toolMm: 3, spacingMm: 6, marginMm: 10,
  feedMmMin: 1500, engraveFeedMmMin: 2000, passDepthMm: 3, contourSec: 4, sheetSetupMin: 5, hourlyRate: 30,
};

export const DEFAULT_QUOTE: QuoteSettings = { material: 'sheets', consumables: 10, laborH: 2, laborRate: 25, marginPct: 30, offcuts: 'value' };

const KEY = 'woody.atelier.v1';

export function loadAtelier(): AtelierState {
  const d: AtelierState = {
    panels: DEFAULT_PANELS.map((p) => ({ ...p })), machine: { ...DEFAULT_MACHINE }, quote: { ...DEFAULT_QUOTE },
    manual: [], choice: {}, offGroups: [], nesting: 'shape', precision: 'normal',
    offcuts: [], useOffcuts: true, minOffcut: 150,
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { ...d, ...s, machine: { ...d.machine, ...s.machine }, quote: { ...d.quote, ...s.quote } };
    }
  } catch { /* ignore */ }
  return d;
}

export function saveAtelier(s: AtelierState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export const uid = () => Math.random().toString(36).slice(2, 9);
