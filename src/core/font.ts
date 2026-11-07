// Police « monotrait » pour la gravure CNC : chaque caractère est une suite de polylignes.
// Grille de dessin : largeur 4, hauteur 6 unités.
import type { Polyline, Pt } from './geometry';

const G: Record<string, number[][][]> = {
  '0': [[[0, 0], [4, 0], [4, 6], [0, 6], [0, 0]], [[0, 0], [4, 6]]],
  '1': [[[1, 5], [2, 6], [2, 0]], [[1, 0], [3, 0]]],
  '2': [[[0, 6], [4, 6], [4, 3], [0, 3], [0, 0], [4, 0]]],
  '3': [[[0, 6], [4, 6], [4, 0], [0, 0]], [[1, 3], [4, 3]]],
  '4': [[[0, 6], [0, 3], [4, 3]], [[3, 6], [3, 0]]],
  '5': [[[4, 6], [0, 6], [0, 3], [4, 3], [4, 0], [0, 0]]],
  '6': [[[4, 6], [0, 6], [0, 0], [4, 0], [4, 3], [0, 3]]],
  '7': [[[0, 6], [4, 6], [1.5, 0]]],
  '8': [[[0, 0], [4, 0], [4, 6], [0, 6], [0, 0]], [[0, 3], [4, 3]]],
  '9': [[[0, 0], [4, 0], [4, 6], [0, 6], [0, 3], [4, 3]]],
  '-': [[[0.5, 3], [3.5, 3]]],
  '.': [[[1.8, 0], [2.2, 0], [2.2, 0.4], [1.8, 0.4], [1.8, 0]]],
  ' ': [],
};

const ADVANCE = 5.5; // largeur d'un caractère + espace

/** Largeur du texte (en unités de police, hauteur = 6) */
export function textUnits(text: string): number {
  return text.length * ADVANCE - (ADVANCE - 4);
}

/** Retourne les polylignes du texte, centré sur `center`, de hauteur `height` mm */
export function strokeText(text: string, center: Pt, height: number): Polyline[] {
  const s = height / 6;
  const w = textUnits(text) * s;
  const ox = center[0] - w / 2;
  const oy = center[1] - height / 2;
  const out: Polyline[] = [];
  [...text].forEach((ch, i) => {
    const glyph = G[ch] ?? G['-'];
    for (const stroke of glyph) {
      out.push(stroke.map(([x, y]) => [ox + (i * ADVANCE + x) * s, oy + y * s] as Pt));
    }
  });
  return out;
}
