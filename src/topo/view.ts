import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { downloadBlob, slug } from '../core/download';
import { fetchElevationGrid, type ElevGrid } from './elevation';
import { buildZip } from './export';
import { computeLayers, type TopoParams, type TopoResult } from './layers';
import { EARTH_CIRC, frameBounds, lonLatToWorld, makeFrame, worldToLonLat, type WorldFrame } from './mercator';
import { svgLayer, svgStack } from './preview2d';
import type { Preview3D } from './preview3d';

interface TopoState extends TopoParams {
  lat: number;
  lon: number;
  placeName: string;
  resolution: number;
  water: boolean;
}

const KEY = 'woody.topo.v1';
const DEFAULTS: TopoState = {
  lat: 45.8615,
  lon: 6.1700,
  placeName: 'Lac d’Annecy',
  shape: 'rect',
  widthMm: 300,
  heightMm: 400,
  realWidthM: 11000,
  layerMm: 3,
  mode: 'exag',
  exaggeration: 1.5,
  layerCount: 12,
  baseAlt: null,
  smoothMm: 1.2,
  simplifyMm: 0.08,
  minPieceMm2: 25,
  minHoleMm2: 25,
  toolMm: 3,
  removeThin: true,
  fineLines: 3,
  guides: true,
  numbers: true,
  resolution: 500,
  water: true,
};

function loadState(): TopoState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* stockage indisponible */ }
  return { ...DEFAULTS };
}
function saveState(s: TopoState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

const num = (label: string, key: keyof TopoState, step = 'any', unit = '', extra = '') =>
  `<label class="field"><span>${label}</span><div class="inp"><input type="number" data-k="${key}" step="${step}" ${extra}/>${unit ? `<em>${unit}</em>` : ''}</div></label>`;
const check = (label: string, key: keyof TopoState) =>
  `<label class="check"><input type="checkbox" data-k="${key}"/> <span>${label}</span></label>`;

export function mountTopo(root: HTMLElement): () => void {
  const s = loadState();
  root.innerHTML = `
  <div class="workspace">
    <aside class="panel">
      <section>
        <h3>1 · Lieu</h3>
        <form class="search" id="search">
          <input type="search" id="q" placeholder="Rechercher un lieu (ex. Lac de Serre-Ponçon)"/>
          <button class="btn" type="submit">Chercher</button>
        </form>
        <ul class="results" id="results"></ul>
        <p class="hint">Fais glisser le cadre pour le déplacer. Poignées des coins : agrandir en gardant les proportions. Poignées des côtés : changer la hauteur du format.</p>
        <p class="hint" id="center"></p>
        <div class="btnrow">
          <button class="btn ghost small" id="fitView" type="button">Cadre au centre de la vue</button>
          <button class="btn ghost small" id="showFrame" type="button">Voir le cadre</button>
        </div>
      </section>
      <section>
        <h3>2 · Cadre et format</h3>
        <div class="seg" data-seg="shape">
          <button data-v="rect">Rectangle</button><button data-v="circle">Cercle</button>
        </div>
        <div class="row2">
          ${num('Largeur', 'widthMm', '1', 'mm', 'min="50"')}
          <div data-show="rect">${num('Hauteur', 'heightMm', '1', 'mm', 'min="50"')}</div>
        </div>
        <div class="presets" id="presets"></div>
        <div class="row2">
          <label class="field"><span>Largeur réelle</span><div class="inp"><input type="number" id="realKm" step="0.1" min="0.1"/><em>km</em></div></label>
          <label class="field"><span>Échelle 1:</span><div class="inp"><input type="number" id="scale" step="500" min="100"/></div></label>
        </div>
      </section>
      <section>
        <h3>3 · Couches</h3>
        ${num('Épaisseur d’une couche', 'layerMm', '0.1', 'mm', 'min="0.5"')}
        <div class="seg" data-seg="mode">
          <button data-v="exag">Exagération</button><button data-v="count">Nb de couches</button>
        </div>
        <div data-show-mode="exag">${num('Exagération verticale', 'exaggeration', '0.1', '×', 'min="0.1"')}</div>
        <div data-show-mode="count">${num('Nombre de couches (fond compris)', 'layerCount', '1', '', 'min="2" max="120"')}</div>
        <label class="field"><span>Altitude de base (vide = auto)</span><div class="inp"><input type="number" id="baseAlt" step="1" placeholder="auto"/><em>m</em></div></label>
      </section>
      <section>
        <h3>4 · Fabrication</h3>
        <div class="row2">
          ${num('Ø fraise', 'toolMm', '0.1', 'mm', 'min="0.1"')}
          ${num('Lissage', 'smoothMm', '0.1', 'mm', 'min="0"')}
        </div>
        <div class="row2">
          ${num('Pièce mini', 'minPieceMm2', '1', 'mm²', 'min="0"')}
          ${num('Trou mini', 'minHoleMm2', '1', 'mm²', 'min="0"')}
        </div>
        <label class="field"><span>Précision du relief</span>
          <select data-k="resolution">
            <option value="300">Rapide (300 px)</option>
            <option value="500">Normale (500 px)</option>
            <option value="800">Fine (800 px)</option>
            <option value="1200">Très fine (1200 px)</option>
          </select>
        </label>
        ${check('Supprimer les pièces plus fines que la fraise', 'removeThin')}
      </section>
      <section>
        <h3>5 · Gravures</h3>
        <label class="field"><span>Courbes fines gravées par couche</span>
          <select data-k="fineLines">
            <option value="0">Aucune</option><option value="2">1 courbe</option><option value="3">2 courbes</option>
            <option value="4">3 courbes</option><option value="5">4 courbes</option>
          </select>
        </label>
        ${check('Repères de pose (contour de la couche du dessus)', 'guides')}
        ${check('Numéros de couche (cachés sous la couche suivante)', 'numbers')}
        ${check('Couche de fond en bleu (eau / résine) dans l’aperçu', 'water')}
        <label class="check"><input type="checkbox" id="overlay" checked/> <span>Superposer le résultat sur la carte</span></label>
      </section>
      <div class="actions">
        <button class="btn primary" id="go" type="button">Calculer les couches</button>
        <button class="btn" id="dl" type="button" disabled>Télécharger les DXF (.zip)</button>
      </div>
      <div class="status" id="status"></div>
      <div class="summary" id="summary"></div>
    </aside>
    <main class="stage">
      <nav class="tabs">
        <button data-tab="map" class="on">Carte</button>
        <button data-tab="layers">Couches</button>
        <button data-tab="3d">3D</button>
      </nav>
      <div class="view on" data-view="map"><div id="map"></div></div>
      <div class="view" data-view="layers">
        <div class="layerbar">
          <label class="check"><input type="checkbox" id="stack" checked/> <span>Vue empilée</span></label>
          <input type="range" id="layerSel" min="0" max="0" value="0"/>
          <span id="layerLbl"></span>
        </div>
        <div class="svgbox" id="svg"><p class="empty">Lance « Calculer les couches » pour voir le résultat.</p></div>
        <div class="legend"><i class="lg cut"></i>Découpe <i class="lg eng"></i>Gravure <i class="lg num"></i>Numéro <i class="lg ghost"></i>Couche du dessous</div>
      </div>
      <div class="view" data-view="3d"><div id="three"><p class="empty">Lance « Calculer les couches » pour voir le résultat.</p></div></div>
    </main>
  </div>`;

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...root.querySelectorAll(sel)] as T[];
  const status = (msg: string, kind: '' | 'err' | 'ok' = '') => {
    const el = $('#status');
    el.textContent = msg;
    el.className = 'status ' + kind;
  };

  // ---------- Carte ----------
  const map = L.map($('#map'), { zoomControl: true }).setView([s.lat, s.lon], 11);
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });
  const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17, attribution: '© OpenStreetMap, SRTM | style © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
  });
  topo.addTo(map);
  L.control.layers({ 'Relief (OpenTopoMap)': topo, 'Plan (OpenStreetMap)': osm }).addTo(map);
  map.attributionControl.addAttribution('Relief : Mapzen / AWS Terrain Tiles');

  // la carte doit connaître sa vraie taille, sinon le cadre est mal placé à l'écran
  let fitted = false;
  const mapRO = new ResizeObserver(() => {
    // onglet masqué (taille nulle) : on ignore, sinon Leaflet décale la vue au retour
    if ($('#map').clientWidth < 10 || $('#map').clientHeight < 10) return;
    map.invalidateSize({ pan: false });
    // premier affichage : on cadre la carte sur le cadre dès que la carte a une vraie taille
    if (!fitted && $('#map').clientHeight > 100) {
      fitted = true;
      map.fitBounds(frameBounds(curFrame()), { padding: [40, 40], animate: false });
    }
  });
  mapRO.observe($('#map'));

  // ---------- Cadre déplaçable / redimensionnable ----------
  // Le cadre est un objet géographique indépendant de la vue : on le manipule en coordonnées monde (Web Mercator).
  const H = () => (s.shape === 'circle' ? s.widthMm : s.heightMm);
  const curFrame = (): WorldFrame => makeFrame(s.lon, s.lat, s.realWidthM, H() / s.widthMm);
  const toLL = (x: number, y: number) => { const [lon, lat] = worldToLonLat(x, y); return L.latLng(lat, lon); };
  const toW = (ll: L.LatLng) => lonLatToWorld(ll.lng, ll.lat);

  /** Applique un cadre exprimé en coordonnées monde ; `aspect` = la proportion du format change */
  const setFrameWorld = (cx: number, cy: number, hw: number, hh: number, aspect: boolean) => {
    const [lon, lat] = worldToLonLat(cx, cy);
    s.lat = lat;
    s.lon = lon;
    s.realWidthM = Math.max(50, 2 * hw * EARTH_CIRC * Math.cos((lat * Math.PI) / 180));
    if (aspect && s.shape === 'rect') s.heightMm = Math.max(50, Math.min(3000, Math.round((s.widthMm * hh) / hw)));
  };

  let framePoly: L.Polygon | null = null;
  const handles = new Map<string, L.Marker>();
  let activeHandle = '';
  let dragStart: WorldFrame | null = null;

  const handlePositions = (f: WorldFrame): Record<string, [number, number]> =>
    s.shape === 'circle'
      ? { c: [f.cx, f.cy], e: [f.cx + f.hw, f.cy] }
      : {
          c: [f.cx, f.cy],
          nw: [f.cx - f.hw, f.cy - f.hh], ne: [f.cx + f.hw, f.cy - f.hh],
          se: [f.cx + f.hw, f.cy + f.hh], sw: [f.cx - f.hw, f.cy + f.hh],
          n: [f.cx, f.cy - f.hh], s: [f.cx, f.cy + f.hh], e: [f.cx + f.hw, f.cy], w: [f.cx - f.hw, f.cy],
        };

  const CURSORS: Record<string, string> = { c: 'move', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

  /** Nouveau cadre quand la poignée `key` est amenée au point monde (px, py) */
  const resizeFrame = (key: string, px: number, py: number, f0: WorldFrame) => {
    const minW = f0.hw * 0.05, minH = f0.hh * 0.05;
    if (key === 'c') return setFrameWorld(px, py, f0.hw, f0.hh, false);
    if (s.shape === 'circle') {
      const r = Math.max(minW, Math.hypot(px - f0.cx, py - f0.cy));
      return setFrameWorld(f0.cx, f0.cy, r, r, false);
    }
    const sx = key.includes('e') ? 1 : key.includes('w') ? -1 : 0;
    const sy = key.includes('s') ? 1 : key.includes('n') ? -1 : 0;
    if (sx && sy) {
      // coin : le coin opposé reste fixe, la proportion est conservée
      const ax = f0.cx - sx * f0.hw, ay = f0.cy - sy * f0.hh;
      const ratio = f0.hh / f0.hw;
      const w = Math.max(2 * minW, sx * (px - ax)), h = Math.max(2 * minH, sy * (py - ay));
      const size = (w + h / ratio) / 2;
      return setFrameWorld(ax + (sx * size) / 2, ay + (sy * size * ratio) / 2, size / 2, (size * ratio) / 2, false);
    }
    if (sx) {
      // côté gauche/droit : le côté opposé reste fixe, la proportion du format change
      const ax = f0.cx - sx * f0.hw;
      const w = Math.max(2 * minW, sx * (px - ax));
      return setFrameWorld(ax + (sx * w) / 2, f0.cy, w / 2, f0.hh, true);
    }
    const ay = f0.cy - sy * f0.hh;
    const h = Math.max(2 * minH, sy * (py - ay));
    setFrameWorld(f0.cx, ay + (sy * h) / 2, f0.hw, h / 2, true);
  };

  const drawFrame = () => {
    const f = curFrame();
    const ring = s.shape === 'circle'
      ? Array.from({ length: 128 }, (_, i) => {
          const a = (i / 128) * Math.PI * 2;
          return toLL(f.cx + f.hw * Math.cos(a), f.cy + f.hh * Math.sin(a));
        })
      : [toLL(f.cx - f.hw, f.cy - f.hh), toLL(f.cx + f.hw, f.cy - f.hh), toLL(f.cx + f.hw, f.cy + f.hh), toLL(f.cx - f.hw, f.cy + f.hh)];
    if (!framePoly) {
      framePoly = L.polygon(ring, { color: '#b45309', weight: 2, fillOpacity: 0.08, className: 'frame-body' }).addTo(map);
      framePoly.on('mousedown', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stop(e);
        map.dragging.disable();
        const start = toW(e.latlng);
        const f0 = curFrame();
        const move = (ev: L.LeafletMouseEvent) => {
          const p = toW(ev.latlng);
          setFrameWorld(f0.cx + p[0] - start[0], f0.cy + p[1] - start[1], f0.hw, f0.hh, false);
          drawFrame();
        };
        const up = () => {
          map.off('mousemove', move);
          document.removeEventListener('mouseup', up);
          map.dragging.enable();
          commitFrame();
        };
        map.on('mousemove', move);
        document.addEventListener('mouseup', up);
      });
    } else framePoly.setLatLngs(ring);

    const pos = handlePositions(f);
    for (const [k, m] of handles) if (!(k in pos)) { m.remove(); handles.delete(k); }
    for (const [k, [x, y]] of Object.entries(pos)) {
      let m = handles.get(k);
      if (!m) {
        m = L.marker(toLL(x, y), {
          draggable: true,
          keyboard: false,
          icon: L.divIcon({ className: `fh ${k === 'c' ? 'fh-c' : ''}`, iconSize: k === 'c' ? [22, 22] : [14, 14], html: k === 'c' ? '✥' : '' }),
        }).addTo(map);
        const el = m.getElement();
        if (el) el.style.cursor = CURSORS[k];
        m.on('dragstart', () => { activeHandle = k; dragStart = curFrame(); });
        m.on('drag', () => {
          const [px, py] = toW(m!.getLatLng());
          resizeFrame(k, px, py, dragStart!);
          drawFrame();
          syncDerived();
        });
        m.on('dragend', () => { activeHandle = ''; dragStart = null; drawFrame(); commitFrame(); });
        handles.set(k, m);
      } else if (k !== activeHandle) m.setLatLng(toLL(x, y));
    }
    $('#center').textContent = `Centre : ${s.lat.toFixed(5)}, ${s.lon.toFixed(5)} · ${fmt(s.realWidthM / 1000, 2)} × ${fmt((s.realWidthM * H()) / s.widthMm / 1000, 2)} km`;
  };
  const commitFrame = () => { saveState(s); syncDerived(); markDirty(); };

  // ---------- Superposition du résultat ----------
  let resultOverlay: L.ImageOverlay | null = null;
  let overlayUrl = '';
  const showOverlay = (frame: WorldFrame | null) => {
    resultOverlay?.remove();
    resultOverlay = null;
    if (overlayUrl) URL.revokeObjectURL(overlayUrl);
    overlayUrl = '';
    if (!frame || !result || !($('#overlay') as HTMLInputElement).checked) return;
    overlayUrl = URL.createObjectURL(new Blob([svgStack(result, s.water, 0)],{ type: 'image/svg+xml' }));
    resultOverlay = L.imageOverlay(overlayUrl, frameBounds(frame), { opacity: 0.65, interactive: false }).addTo(map);
    framePoly?.bringToFront();
  };
  let resultFrame: WorldFrame | null = null;

  // ---------- Champs ----------
  const syncDerived = () => {
    ($('[data-k="widthMm"]') as HTMLInputElement).value = String(s.widthMm);
    ($('[data-k="heightMm"]') as HTMLInputElement).value = String(s.heightMm);
    ($('#realKm') as HTMLInputElement).value = String(+(s.realWidthM / 1000).toFixed(3));
    ($('#scale') as HTMLInputElement).value = String(Math.round((s.realWidthM * 1000) / s.widthMm));
    $$('[data-show="rect"]').forEach((e) => (e.style.display = s.shape === 'rect' ? '' : 'none'));
    $$('[data-show-mode]').forEach((e) => (e.style.display = e.dataset.showMode === s.mode ? '' : 'none'));
    $$('[data-seg]').forEach((g) => g.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('on', (s as any)[g.dataset.seg!] === b.dataset.v);
    }));
    ($('#baseAlt') as HTMLInputElement).value = s.baseAlt == null ? '' : String(s.baseAlt);
  };
  $$<HTMLInputElement>('[data-k]').forEach((el) => {
    const k = el.dataset.k as keyof TopoState;
    if (el.type === 'checkbox') el.checked = !!s[k];
    else el.value = String(s[k]);
    el.addEventListener('change', () => {
      const v = el.type === 'checkbox' ? el.checked : Number(el.value);
      if (typeof v === 'number' && !isFinite(v)) return;
      (s as any)[k] = v;
      saveState(s);
      syncDerived();
      drawFrame();
      if (k === 'water' && result) { renderLayers(); render3d(); showOverlay(resultFrame); } else markDirty();
    });
  });
  $$('[data-seg]').forEach((g) => g.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    (s as any)[g.dataset.seg!] = b.dataset.v;
    saveState(s); syncDerived(); drawFrame(); markDirty();
  }));
  $('#realKm').addEventListener('change', (e) => {
    const v = Number((e.target as HTMLInputElement).value);
    if (v > 0) { s.realWidthM = v * 1000; saveState(s); syncDerived(); drawFrame(); markDirty(); }
  });
  $('#scale').addEventListener('change', (e) => {
    const v = Number((e.target as HTMLInputElement).value);
    if (v > 0) { s.realWidthM = (v * s.widthMm) / 1000; saveState(s); syncDerived(); drawFrame(); markDirty(); }
  });
  $('#baseAlt').addEventListener('change', (e) => {
    const raw = (e.target as HTMLInputElement).value.trim();
    s.baseAlt = raw === '' ? null : Number(raw);
    saveState(s); markDirty();
  });
  $('#fitView').addEventListener('click', () => {
    // cadre centré dans la vue actuelle, occupant 70 % de la place disponible
    const b = map.getBounds();
    const [x0, y0] = toW(b.getNorthWest());
    const [x1, y1] = toW(b.getSouthEast());
    const ratio = H() / s.widthMm;
    const hw = Math.min((x1 - x0) / 2, (y1 - y0) / 2 / ratio) * 0.7;
    setFrameWorld((x0 + x1) / 2, (y0 + y1) / 2, hw, hw * ratio, false);
    drawFrame(); commitFrame();
  });
  $('#showFrame').addEventListener('click', () => map.fitBounds(frameBounds(curFrame()), { padding: [40, 40] }));
  $('#overlay').addEventListener('change', () => showOverlay(resultFrame));

  const PRESETS: [string, 'rect' | 'circle', number, number][] = [
    ['20×20', 'rect', 200, 200], ['30×40', 'rect', 300, 400], ['40×30', 'rect', 400, 300],
    ['40×50', 'rect', 400, 500], ['50×70', 'rect', 500, 700], ['Ø 30', 'circle', 300, 300], ['Ø 40', 'circle', 400, 400],
  ];
  $('#presets').innerHTML = PRESETS.map(([n], i) => `<button type="button" data-i="${i}">${n}</button>`).join('');
  $('#presets').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    const [, shape, w, h] = PRESETS[Number(b.dataset.i)];
    const scale = (s.realWidthM * 1000) / s.widthMm;
    Object.assign(s, { shape, widthMm: w, heightMm: h, realWidthM: (scale * w) / 1000 });
    ($('[data-k="widthMm"]') as HTMLInputElement).value = String(w);
    ($('[data-k="heightMm"]') as HTMLInputElement).value = String(h);
    saveState(s); syncDerived(); drawFrame(); markDirty();
  });

  // ---------- Recherche (Nominatim) ----------
  $('#search').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = ($('#q') as HTMLInputElement).value.trim();
    if (!q) return;
    const ul = $('#results');
    ul.innerHTML = '<li class="muted">Recherche…</li>';
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&accept-language=fr&q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { display_name: string; lat: string; lon: string; boundingbox: string[] }[];
      if (!data.length) { ul.innerHTML = '<li class="muted">Aucun résultat.</li>'; return; }
      ul.innerHTML = data.map((d, i) => `<li><button type="button" data-i="${i}">${d.display_name}</button></li>`).join('');
      ul.onclick = (ev) => {
        const b = (ev.target as HTMLElement).closest('button');
        if (!b) return;
        const d = data[Number(b.dataset.i)];
        s.placeName = d.display_name.split(',')[0];
        // le cadre englobe le lieu trouvé (marge de 15 %), en gardant le format
        const [south, north, west, east] = d.boundingbox.map(Number);
        const [x0, y0] = lonLatToWorld(west, north);
        const [x1, y1] = lonLatToWorld(east, south);
        const ratio = H() / s.widthMm;
        const hw = Math.max((x1 - x0) / 2, (y1 - y0) / 2 / ratio, 1e-6) * 1.15;
        const [plon, plat] = [Number(d.lon), Number(d.lat)];
        const big = x1 - x0 > 1e-5;
        const [cx, cy] = big ? [(x0 + x1) / 2, (y0 + y1) / 2] : lonLatToWorld(plon, plat);
        setFrameWorld(cx, cy, big ? hw : curFrame().hw, big ? hw * ratio : curFrame().hh, false);
        drawFrame(); commitFrame();
        map.fitBounds(frameBounds(curFrame()), { padding: [40, 40] });
        ul.innerHTML = '';
      };
    } catch {
      ul.innerHTML = '<li class="muted">Recherche indisponible (réseau ?).</li>';
    }
  });

  // ---------- Calcul ----------
  let grid: ElevGrid | null = null;
  let gridKey = '';
  let result: TopoResult | null = null;
  let p3d: Preview3D | null = null;

  const markDirty = () => {
    if (result) status('Paramètres modifiés : relance le calcul.', '');
  };

  const fmt = (n: number, d = 0) => n.toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d });

  const renderSummary = () => {
    const r = result!;
    $('#summary').innerHTML = `
      <dl>
        <dt>Échelle</dt><dd>1:${fmt(r.scale)}</dd>
        <dt>Altitudes</dt><dd>${fmt(r.base)} → ${fmt(r.top)} m</dd>
        <dt>Équidistance</dt><dd>${fmt(r.layerRealM, 1)} m / couche</dd>
        <dt>Exagération</dt><dd>×${fmt(r.exaggeration, 2)}</dd>
        <dt>Couches</dt><dd>${r.layers.length} (fond compris)</dd>
        <dt>Épaisseur totale</dt><dd>${fmt(r.layers.length * s.layerMm, 1)} mm</dd>
        <dt>Pièces</dt><dd>${r.totalPieces}</dd>
        <dt>Longueur de coupe</dt><dd>${fmt(r.cutLengthMm / 1000, 1)} m</dd>
      </dl>
      ${r.warnings.map((w) => `<p class="warn">${w}</p>`).join('')}`;
  };

  const renderLayers = () => {
    if (!result) return;
    const sel = $('#layerSel') as HTMLInputElement;
    const stack = ($('#stack') as HTMLInputElement).checked;
    sel.max = String(result.layers.length - 1);
    sel.disabled = stack;
    const i = Math.min(Number(sel.value), result.layers.length - 1);
    const L = result.layers[i];
    $('#layerLbl').textContent = stack
      ? `${result.layers.length} couches`
      : `Couche ${String(i).padStart(2, '0')} · ${fmt(L.level)} m · ${L.pieces.length} pièce(s)`;
    $('#svg').innerHTML = stack ? svgStack(result, s.water) : svgLayer(result, i);
  };

  const render3d = async () => {
    if (!result || !$('[data-view="3d"]').classList.contains('on')) return;
    if (!p3d) {
      const { Preview3D } = await import('./preview3d');
      $('#three').innerHTML = '';
      p3d = new Preview3D($('#three'));
    }
    p3d.show(result, s.layerMm, s.water);
  };

  $('#layerSel').addEventListener('input', renderLayers);
  $('#stack').addEventListener('change', renderLayers);

  const showTab = (t: string) => {
    $$('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    $$('[data-view]').forEach((v) => v.classList.toggle('on', v.dataset.view === t));
    if (t === 'map') map.invalidateSize({ pan: false });
    if (t === '3d') render3d();
  };
  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab!)));

  $('#go').addEventListener('click', async () => {
    const go = $('#go') as HTMLButtonElement;
    go.disabled = true;
    try {
      const aspect = H() / s.widthMm;
      const n = aspect <= 1 ? s.resolution : Math.round(s.resolution / aspect);
      const m = Math.max(10, Math.round(n * aspect));
      const key = [s.lat.toFixed(6), s.lon.toFixed(6), s.realWidthM, aspect, n].join('|');
      if (!grid || key !== gridKey) {
        const frame = makeFrame(s.lon, s.lat, s.realWidthM, aspect);
        status('Téléchargement du relief…');
        grid = await fetchElevationGrid(frame, n, m, 2, s.lat, (d, t) => status(`Téléchargement du relief… ${d}/${t} tuiles`));
        gridKey = key;
      }
      status('Calcul des courbes de niveau…');
      await new Promise((r) => setTimeout(r, 30));
      const t0 = performance.now();
      result = computeLayers(grid, s);
      resultFrame = makeFrame(s.lon, s.lat, s.realWidthM, aspect);
      showOverlay(resultFrame);
      status(`Terminé en ${((performance.now() - t0) / 1000).toFixed(1)} s.`, 'ok');
      ($('#layerSel') as HTMLInputElement).value = '1';
      renderSummary();
      renderLayers();
      ($('#dl') as HTMLButtonElement).disabled = !result.layers.length;
      const cur = $('[data-tab].on')?.dataset.tab;
      if (cur === 'map') showTab('layers'); else if (cur === '3d') render3d();
    } catch (err) {
      console.error(err);
      status('Erreur : ' + (err as Error).message, 'err');
    } finally {
      go.disabled = false;
    }
  });

  $('#dl').addEventListener('click', async () => {
    if (!result) return;
    status('Création du fichier ZIP…');
    const blob = await buildZip(result, s, s.placeName, s.lat, s.lon);
    downloadBlob(blob, `woodydxf-${slug(s.placeName)}-${s.widthMm}x${Math.round(H())}.zip`);
    status('ZIP téléchargé.', 'ok');
  });

  syncDerived();
  drawFrame();

  return () => {
    mapRO.disconnect();
    if (overlayUrl) URL.revokeObjectURL(overlayUrl);
    p3d?.dispose();
    map.remove();
  };
}
