// Projection Web Mercator normalisée : x, y ∈ [0, 1], y = 0 au nord
export const EARTH_CIRC = 2 * Math.PI * 6378137;

export function lonLatToWorld(lon: number, lat: number): [number, number] {
  const x = (lon + 180) / 360;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  return [x, y];
}

export function worldToLonLat(x: number, y: number): [number, number] {
  const lon = x * 360 - 180;
  const n = Math.PI - 2 * Math.PI * y;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return [lon, lat];
}

/** Cadre géographique : centre + demi-largeur/hauteur en coordonnées monde normalisées */
export interface WorldFrame {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
}

/** Cadre à partir du centre, de la largeur réelle (m) et du rapport hauteur/largeur */
export function makeFrame(lon: number, lat: number, realWidthM: number, aspectHW: number): WorldFrame {
  const [cx, cy] = lonLatToWorld(lon, lat);
  const cos = Math.cos((lat * Math.PI) / 180);
  const hw = realWidthM / 2 / cos / EARTH_CIRC;
  return { cx, cy, hw, hh: hw * aspectHW };
}

/** Bornes [sud-ouest, nord-est] en [lat, lon] (format Leaflet) */
export function frameBounds(f: WorldFrame): [[number, number], [number, number]] {
  const [w, n] = worldToLonLat(f.cx - f.hw, f.cy - f.hh);
  const [e, s] = worldToLonLat(f.cx + f.hw, f.cy + f.hh);
  return [[s, w], [n, e]];
}
