import { downloadBlob, slug } from '../core/download';
import { setJob } from '../core/job';
import type { Polygon, Polyline } from '../core/geometry';
import { buildLamesZip, lamesToJob } from './export';
import { autoRods, computeLames, DEFAULT_LAMES, PRESETS, sliceLayout, type LamesParams, type LamesResult } from './model';
import type { LamesPreview3D } from './preview3d';

interface LamesState extends LamesParams { name: string }

const KEY = 'woody.lames.v1';
function loadState(): LamesState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_LAMES, name: 'Comptoir', ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_LAMES, ...PRESETS.comptoir.p, name: 'Comptoir', rods: [] } as LamesState;
}

const num = (label: string, key: keyof LamesState, unit = '', step = 'any', extra = '') =>
  `<label class="field"><span>${label}</span><div class="inp"><input type="number" data-k="${key}" step="${step}" ${extra}/>${unit ? `<em>${unit}</em>` : ''}</div></label>`;
const check = (label: string, key: keyof LamesState) =>
  `<label class="check"><input type="checkbox" data-k="${key}"/> <span>${label}</span></label>`;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmt = (n: number, d = 0) => n.toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d });

export function mountLames(root: HTMLElement): () => void {
  const s = loadState();
  root.innerHTML = `
  <div class="workspace">
    <aside class="panel">
      <section>
        <h3>1 · Modèle</h3>
        <div class="presets" id="presets">${Object.entries(PRESETS).map(([k, v]) => `<button type="button" data-preset="${k}">${v.label}</button>`).join('')}</div>
        <label class="field"><span>Nom du projet</span><div class="inp"><input type="text" id="name"/></div></label>
      </section>
      <section>
        <h3>2 · Dimensions</h3>
        ${num('Longueur (sens d’empilement des lames)', 'L', 'mm', '1', 'min="10"')}
        <div class="row2">${num('Profondeur', 'P', 'mm', '1', 'min="10"')}${num('Hauteur', 'H', 'mm', '1', 'min="10"')}</div>
        <p class="hint" id="dimHint"></p>
      </section>
      <section>
        <h3>3 · Lames</h3>
        <div class="row2">${num('Épaisseur', 'thickness', 'mm', '0.5', 'min="1"')}${num('Espacement', 'gap', 'mm', '0.5', 'min="0"')}</div>
        <p class="hint" id="sliceHint"></p>
      </section>
      <section>
        <h3>4 · Forme</h3>
        <div class="seg" data-seg="face"><button data-v="front">Face avant</button><button data-v="top">Dessus</button></div>
        <label class="field"><span>Motif</span>
          <select data-k="motif">
            <option value="aucun">Aucun (forme droite)</option>
            <option value="vague">Vague le long</option>
            <option value="diagonale">Vagues en diagonale</option>
            <option value="damier">Bosses en damier</option>
            <option value="galbe">Galbe (creux au milieu)</option>
            <option value="galbeVague">Galbe ondulé</option>
            <option value="bosse">Creux central</option>
            <option value="goutte">Goutte d’eau (ondes concentriques)</option>
          </select>
        </label>
        <div class="row2">${num('Amplitude', 'amplitude', 'mm', '1', 'min="0"')}${num('Matière mini', 'minMaterial', 'mm', '1', 'min="5"')}</div>
        <div class="row2">${num('Ondulations (longueur)', 'kx', '', '0.25', 'min="0"')}<div data-hide-motif="goutte">${num('Ondulations (face)', 'kz', '', '0.25', 'min="0"')}</div></div>
        <div data-show-motif="goutte">
          <div class="row2">${num('Impact : position en longueur', 'dropX', '%', '1')}${num('Impact : position sur la face', 'dropY', '%', '1')}</div>
          ${num('Atténuation des ondes', 'dropDamp', '', '0.25', 'min="0"')}
          <p class="hint">50 % / 50 % = goutte au centre. « Ondulations (longueur) » = nombre d’ondes sur la plus grande dimension ; plus l’atténuation est forte, plus les ondes s’effacent loin du centre.</p>
        </div>
        ${num('Décalage de la vague', 'phase', '°', '15')}
      </section>
      <section>
        <h3>5 · Découpes</h3>
        <p class="hint">Volumes retirés à toutes les lames traversées : niche, passage de jambes, poignée, passe-câble. u = profondeur depuis le dos, v = hauteur depuis le sol, x = position le long de la longueur.</p>
        <div id="cuts"></div>
        <div class="btnrow"><button class="btn small" id="addRect" type="button">+ Rectangle</button><button class="btn small" id="addCircle" type="button">+ Trou rond</button></div>
        ${check('Os de chien aux angles intérieurs (pour emboîter une pièce carrée)', 'dogbones')}
      </section>
      <section>
        <h3>6 · Assemblage</h3>
        <div class="row2">${num('Ø tige filetée', 'rodD', 'mm', '1', 'min="3"')}${num('Tiges par zone', 'rodCount', '', '1', 'min="1" max="8"')}</div>
        <div class="btnrow"><button class="btn small" id="autoRods" type="button">Placer les tiges automatiquement</button><button class="btn ghost small" id="addRod" type="button">+ Tige</button></div>
        <div id="rods"></div>
        <div class="row2">${num('Ø entretoises', 'spacerD', 'mm', '1', 'min="5"')}${num('Ø fraise', 'toolMm', 'mm', '0.5', 'min="0.5"')}</div>
        ${num('Densité du bois', 'density', 'kg/m³', '10', 'min="100"')}
        ${check('Numéros gravés sur chaque lame', 'numbers')}
      </section>
      <div class="actions">
        <button class="btn primary" id="dl" type="button">Télécharger les DXF (.zip)</button>
        <button class="btn" id="toAtelier" type="button">Calepiner et chiffrer dans l’Atelier →</button>
      </div>
      <div class="status" id="status"></div>
      <div class="summary" id="summary"></div>
    </aside>
    <main class="stage">
      <nav class="tabs">
        <button data-tab="3d" class="on">3D</button>
        <button data-tab="slice">Lames</button>
      </nav>
      <div class="view on" data-view="3d"><div id="three"></div></div>
      <div class="view" data-view="slice">
        <div class="layerbar">
          <label class="check"><input type="checkbox" id="overlayAll"/> <span>Superposer toutes les lames</span></label>
          <input type="range" id="sel" min="1" max="1" value="1"/>
          <span id="selLbl"></span>
        </div>
        <div class="svgbox" id="svg"></div>
        <div class="legend"><i class="lg cut"></i>Découpe <i class="lg num"></i>Numéro <i class="lg ghost"></i>Lames voisines</div>
      </div>
    </main>
  </div>`;

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...root.querySelectorAll(sel)] as T[];

  let result: LamesResult | null = null;
  let p3d: LamesPreview3D | null = null;
  let timer = 0;

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } };

  // ---------- champs ----------
  const syncInputs = () => {
    $$<HTMLInputElement | HTMLSelectElement>('[data-k]').forEach((el) => {
      const v = s[el.dataset.k as keyof LamesState];
      if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = Boolean(v);
      else el.value = String(v);
    });
    $$('[data-seg]').forEach((seg) => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(s[seg.dataset.seg as keyof LamesState]))));
    ($('#name') as HTMLInputElement).value = s.name;
    $$('[data-show-motif]').forEach((el) => { el.style.display = el.dataset.showMotif === s.motif ? '' : 'none'; });
    $$('[data-hide-motif]').forEach((el) => { el.style.display = el.dataset.hideMotif === s.motif ? 'none' : ''; });
    $$('[data-preset]').forEach((b) => b.classList.toggle('on', b.dataset.preset === s.preset));
  };
  $$<HTMLInputElement | HTMLSelectElement>('[data-k]').forEach((el) => {
    el.addEventListener(el instanceof HTMLSelectElement || (el as HTMLInputElement).type === 'checkbox' ? 'change' : 'input', () => {
      const k = el.dataset.k as keyof LamesState;
      if (el instanceof HTMLInputElement && el.type === 'checkbox') (s as any)[k] = el.checked;
      else if (el instanceof HTMLSelectElement) { (s as any)[k] = el.value; if (k === 'motif') syncInputs(); }
      else { const v = parseFloat(el.value); if (!Number.isFinite(v)) return; (s as any)[k] = v; }
      changed();
    });
  });
  $$('[data-seg]').forEach((seg) => seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    (s as any)[seg.dataset.seg!] = b.dataset.v;
    syncInputs(); changed();
  })));
  $('#name').addEventListener('input', () => { s.name = ($('#name') as HTMLInputElement).value; save(); });

  $$('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    const pr = PRESETS[b.dataset.preset!];
    Object.assign(s, DEFAULT_LAMES, pr.p, { preset: b.dataset.preset, name: pr.label });
    s.cutouts = (pr.p.cutouts ?? []).map((c) => ({ ...c }));
    s.rods = autoRods(s);
    syncInputs(); renderCuts(); renderRods(); changed(true);
  }));

  // ---------- découpes ----------
  const cutField = (i: number, key: string, label: string, v: number) =>
    `<label class="mini"><span>${label}</span><input type="number" step="1" data-ci="${i}" data-ck="${key}" value="${Math.round(v * 10) / 10}"/></label>`;
  const renderCuts = () => {
    $('#cuts').innerHTML = s.cutouts.map((c, i) => `
      <div class="cut">
        <div class="cuthead"><strong>${c.type === 'rect' ? 'Rectangle' : 'Trou rond'} ${i + 1}</strong><button class="btn ghost small" data-cdel="${i}" type="button" title="Supprimer">✕</button></div>
        <div class="minis">
          ${cutField(i, 'x0', 'x de', c.x0)}${cutField(i, 'x1', 'x à', c.x1)}
          ${c.type === 'rect'
            ? cutField(i, 'u0', 'u de', c.u0) + cutField(i, 'u1', 'u à', c.u1) + cutField(i, 'v0', 'v de', c.v0) + cutField(i, 'v1', 'v à', c.v1)
            : cutField(i, 'u0', 'u centre', c.u0) + cutField(i, 'v0', 'v centre', c.v0) + cutField(i, 'r', 'rayon', c.r)}
        </div>
      </div>`).join('') || '<p class="hint">Aucune découpe.</p>';
    $$<HTMLInputElement>('[data-ci]').forEach((inp) => inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      if (!Number.isFinite(v)) return;
      (s.cutouts[Number(inp.dataset.ci)] as any)[inp.dataset.ck!] = v;
      changed();
    }));
    $$('[data-cdel]').forEach((b) => b.addEventListener('click', () => { s.cutouts.splice(Number(b.dataset.cdel), 1); renderCuts(); changed(); }));
  };
  $('#addRect').addEventListener('click', () => {
    s.cutouts.push({ type: 'rect', x0: s.L * 0.3, x1: s.L * 0.7, u0: -1, u1: s.P + 1, v0: -1, v1: s.H * 0.4, r: 0 });
    renderCuts(); changed();
  });
  $('#addCircle').addEventListener('click', () => {
    s.cutouts.push({ type: 'circle', x0: 0, x1: s.L, u0: s.P * 0.25, v0: s.H * 0.15, r: 25, u1: 0, v1: 0 });
    renderCuts(); changed();
  });

  // ---------- tiges ----------
  const renderRods = () => {
    $('#rods').innerHTML = s.rods.map((r, i) => `
      <div class="minis rod"><span class="rodn">Tige ${i + 1}</span>
        <label class="mini"><span>u</span><input type="number" step="1" data-ri="${i}" data-rk="u" value="${r.u}"/></label>
        <label class="mini"><span>v</span><input type="number" step="1" data-ri="${i}" data-rk="v" value="${r.v}"/></label>
        <span class="rodinfo" data-rinfo="${i}"></span>
        <button class="btn ghost small" data-rdel="${i}" type="button" title="Supprimer">✕</button></div>`).join('');
    $$<HTMLInputElement>('[data-ri]').forEach((inp) => inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      if (!Number.isFinite(v)) return;
      (s.rods[Number(inp.dataset.ri)] as any)[inp.dataset.rk!] = v;
      changed();
    }));
    $$('[data-rdel]').forEach((b) => b.addEventListener('click', () => { s.rods.splice(Number(b.dataset.rdel), 1); renderRods(); changed(); }));
  };
  $('#autoRods').addEventListener('click', () => { s.rods = autoRods(s); renderRods(); changed(); });
  $('#addRod').addEventListener('click', () => { s.rods.push({ u: Math.round(s.P / 2), v: Math.round(s.H / 2) }); renderRods(); changed(); });

  // ---------- rendu ----------
  const svgSlice = (): string => {
    if (!result || !result.slices.length) return '<p class="empty">Aucune lame.</p>';
    const all = ($('#overlayAll') as HTMLInputElement).checked;
    const i = Math.min(result.slices.length, Math.max(1, Number(($('#sel') as HTMLInputElement).value))) - 1;
    const W = s.P, H = s.H, m = Math.max(W, H) * 0.04;
    const y = (v: number) => (H - v).toFixed(1);
    const path = (ps: Polygon[]) => ps.map((poly) => poly.map((r) => 'M' + r.map(([a, b]) => `${a.toFixed(1)},${y(b)}`).join('L') + 'Z').join('')).join('');
    const lines = (ls: Polyline[]) => ls.map((l) => 'M' + l.map(([a, b]) => `${a.toFixed(1)},${y(b)}`).join('L')).join('');
    const sw = Math.max(W, H) / 400;
    let body = '';
    if (all) {
      body = result.slices.map((sl, k) => `<path d="${path(sl.pieces)}" fill="none" stroke="hsl(${(k * 300) / result!.slices.length},55%,45%)" stroke-width="${sw}" stroke-opacity=".7"/>`).join('');
    } else {
      const sl = result.slices[i];
      const nb = [result.slices[i - 1], result.slices[i + 1]].filter(Boolean);
      body = nb.map((n) => `<path d="${path(n.pieces)}" fill="var(--ghost)" fill-rule="evenodd" stroke="none"/>`).join('') +
        `<path d="${path(sl.pieces)}" fill="var(--wood)" fill-rule="evenodd" stroke="#d62828" stroke-width="${sw * 1.4}"/>` +
        `<path d="${lines(sl.labels.flat())}" fill="none" stroke="#1d4ed8" stroke-width="${sw}"/>`;
    }
    const cotes = `<g font-size="${m * 0.6}" fill="var(--muted)"><text x="${W / 2}" y="${H + m * 0.9}" text-anchor="middle">${fmt(W)} mm</text>
      <text x="${-m * 0.4}" y="${H / 2}" text-anchor="middle" transform="rotate(-90 ${-m * 0.4} ${H / 2})">${fmt(H)} mm</text></g>`;
    return `<svg viewBox="${-m} ${-m} ${W + 2 * m} ${H + 2 * m}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="var(--line-faint)" stroke-width="${sw}" stroke-dasharray="${sw * 6} ${sw * 6}"/>
      ${body}${cotes}</svg>`;
  };

  const renderSlice = () => {
    if (!result) return;
    const sel = $('#sel') as HTMLInputElement;
    sel.max = String(Math.max(1, result.slices.length));
    sel.disabled = ($('#overlayAll') as HTMLInputElement).checked;
    const i = Math.min(result.slices.length, Number(sel.value));
    const sl = result.slices[i - 1];
    $('#selLbl').textContent = sel.disabled ? `${result.slices.length} lames` : sl ? `Lame ${i} / ${result.slices.length} · x = ${fmt(sl.x0)} mm · ${sl.pieces.length} pièce(s)` : '';
    $('#svg').innerHTML = svgSlice();
  };
  $('#sel').addEventListener('input', renderSlice);
  $('#overlayAll').addEventListener('change', renderSlice);

  const render3d = async () => {
    if (!result || !$('[data-view="3d"]').classList.contains('on')) return;
    if (!p3d) {
      const { LamesPreview3D } = await import('./preview3d');
      p3d = new LamesPreview3D($('#three'));
    }
    p3d.show(result, s);
  };

  const renderSummary = () => {
    const r = result!;
    const lay = sliceLayout(s);
    $('#sliceHint').textContent = `${lay.n} lames · pas de ${fmt(lay.t + lay.g, 1)} mm · ${fmt(lay.start, 1)} mm de jeu à chaque bout`;
    $('#dimHint').textContent = s.face === 'front'
      ? 'Face avant déformée (comptoir, bureau) : chaque lame est un profil vu de côté.'
      : 'Dessus déformé (banc, assise, panneau mural posé à plat) : la hauteur porte le relief.';
    r.rods.forEach((t, i) => { const el = root.querySelector(`[data-rinfo="${i}"]`); if (el) el.textContent = t.holes ? `${t.holes} lames · ${t.runs.map((x) => fmt(Math.ceil(x.length / 10) * 10)).join(' + ')} mm` : 'hors matière'; });
    $('#summary').innerHTML = `
      <dl>
        <dt>Lames</dt><dd>${r.slices.length} × ${fmt(s.thickness, 1)} mm</dd>
        <dt>Pièces à découper</dt><dd>${r.pieceCount}${r.spacers ? ` + ${r.spacers} entretoises` : ''}</dd>
        <dt>Surface de bois</dt><dd>${fmt(r.areaMm2 / 1e6, 2)} m²</dd>
        <dt>Longueur de coupe</dt><dd>${fmt(r.cutLengthMm / 1000, 1)} m</dd>
        <dt>Poids estimé</dt><dd>${fmt(r.weightKg, 1)} kg</dd>
        <dt>Tiges Ø ${s.rodD}</dt><dd>${r.rods.reduce((a, t) => a + t.runs.length, 0)} · ${fmt(r.rods.reduce((a, t) => a + (t.holes ? t.length : 0), 0) / 1000, 2)} m</dd>
      </dl>
      ${r.warnings.map((w) => `<p class="warn">${esc(w)}</p>`).join('')}`;
  };

  const compute = () => {
    const t0 = performance.now();
    try {
      result = computeLames(s);
      renderSummary();
      renderSlice();
      render3d();
      $('#status').textContent = `Calculé en ${fmt(performance.now() - t0)} ms.`;
      $('#status').className = 'status';
    } catch (err) {
      console.error(err);
      $('#status').textContent = 'Erreur : ' + (err as Error).message;
      $('#status').className = 'status err';
    }
  };
  const changed = (now = false) => {
    save();
    clearTimeout(timer);
    if (now) compute(); else timer = window.setTimeout(compute, 200);
  };

  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
    $$('[data-view]').forEach((v) => v.classList.toggle('on', v.dataset.view === b.dataset.tab));
    if (b.dataset.tab === '3d') render3d(); else renderSlice();
  }));

  $('#dl').addEventListener('click', async () => {
    if (!result) return;
    $('#status').textContent = 'Création du fichier ZIP…';
    const blob = await buildLamesZip(result, s, s.name);
    downloadBlob(blob, `woodydxf-lames-${slug(s.name)}.zip`);
    $('#status').textContent = 'ZIP téléchargé.';
    $('#status').className = 'status ok';
  });
  $('#toAtelier').addEventListener('click', () => {
    if (!result) return;
    setJob(lamesToJob(result, s, s.name || 'Lames'));
    location.hash = '#/atelier';
  });

  if (!s.rods.length) s.rods = autoRods(s);
  syncInputs();
  renderCuts();
  renderRods();
  compute();

  return () => {
    clearTimeout(timer);
    p3d?.dispose();
  };
}
