import { downloadBlob, slug } from '../core/download';
import { getJob, setJob, type Job } from '../core/job';
import { buildAtelierZip, duration, eur, fmt, quoteLines } from './export';
import { makePlan, type Plan, type PlanSheet } from './plan';
import { DEFAULT_PANELS, loadAtelier, saveAtelier, uid, type AtelierState } from './store';

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const num = (label: string, path: string, unit = '', step = 'any') =>
  `<label class="field"><span>${label}</span><div class="inp"><input type="number" data-p="${path}" step="${step}" min="0"/>${unit ? `<em>${unit}</em>` : ''}</div></label>`;

const GROUP_HUES = [32, 200, 140, 280, 0, 60, 170, 320];

function sheetSvg(sh: PlanSheet, hueOf: (g: string) => number, marginMm: number): string {
  const { w: W, h: H } = sh.panel;
  const y = (v: number) => (H - v).toFixed(1);
  const path = (rings: number[][][]) => rings.map((r) => 'M' + r.map(([a, b]) => `${a.toFixed(1)},${y(b)}`).join('L') + 'Z').join('');
  const lines = (ls: number[][][]) => ls.map((l) => 'M' + l.map(([a, b]) => `${a.toFixed(1)},${y(b)}`).join('L')).join('');
  const font = Math.max(10, Math.min(W, H) / 45);
  const body = sh.pieces.map((p) => {
    const hue = hueOf(p.group);
    return `<path d="${path(p.shape)}" fill="hsl(${hue},45%,78%)" fill-rule="evenodd" stroke="#d62828" stroke-width="${font / 8}"/>` +
      (p.engrave.length ? `<path d="${lines(p.engrave)}" fill="none" stroke="rgba(59,42,26,.55)" stroke-width="${font / 14}"/>` : '') +
      `<text x="${p.center[0].toFixed(1)}" y="${y(p.center[1])}" font-size="${font}" text-anchor="middle" dominant-baseline="central">${p.id}</text>`;
  }).join('');
  return `<svg viewBox="${-font} ${-font} ${W + 2 * font} ${H + 2 * font}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${W}" height="${H}" fill="#f3e6d1" stroke="#8a7560" stroke-width="${font / 6}"/>
    <rect x="${marginMm}" y="${marginMm}" width="${W - 2 * marginMm}" height="${H - 2 * marginMm}" fill="none" stroke="#b8a68e" stroke-width="${font / 10}" stroke-dasharray="${font / 2} ${font / 2}"/>
    ${body}</svg>`;
}

export function mountAtelier(root: HTMLElement): () => void {
  const s = loadAtelier();
  let job: Job | null = getJob();
  // nouveaux projets : on applique les groupes désactivés par défaut (ex. l'eau)
  const syncJobDefaults = () => {
    if (!job) return;
    const key = `woody.atelier.jobseen`;
    let seen = '';
    try { seen = localStorage.getItem(key) ?? ''; } catch { /* ignore */ }
    const sig = `${job.name}|${job.pieces.length}`;
    if (seen !== sig) {
      s.offGroups = [...(job.offGroups ?? [])];
      try { localStorage.setItem(key, sig); } catch { /* ignore */ }
    }
  };
  syncJobDefaults();

  root.innerHTML = `
  <div class="workspace">
    <aside class="panel">
      <section>
        <h3>1 · Projet</h3>
        <div id="job"></div>
      </section>
      <section>
        <h3>2 · Panneaux à utiliser</h3>
        <div id="choice"></div>
        <p class="hint">Bibliothèque modifiable dans l’onglet « Bibliothèque ». « Automatique » choisit le panneau le moins cher pour chaque épaisseur.</p>
        <label class="field"><span>Calepinage</span></label>
        <div class="seg" data-seg="nesting">
          <button data-v="shape">Formes imbriquées</button><button data-v="rect">Rectangles (rapide)</button>
        </div>
        <div class="seg" data-seg="precision" id="precSeg">
          <button data-v="normal">Précision normale</button><button data-v="fine">Fine (plus lent)</button>
        </div>
        <p class="hint">« Formes imbriquées » suit le vrai contour des pièces et loge les petites pièces dans les trous des grandes.</p>
      </section>
      <section>
        <h3>3 · Machine</h3>
        <div class="row2">${num('Table : longueur', 'machine.bedW', 'mm', '1')}${num('Table : largeur', 'machine.bedH', 'mm', '1')}</div>
        <div class="row2">${num('Ø fraise', 'machine.toolMm', 'mm', '0.1')}${num('Espace entre pièces', 'machine.spacingMm', 'mm', '0.5')}</div>
        <div class="row2">${num('Marge au bord', 'machine.marginMm', 'mm', '1')}${num('Profondeur de passe', 'machine.passDepthMm', 'mm', '0.1')}</div>
        <div class="row2">${num('Avance découpe', 'machine.feedMmMin', 'mm/min', '50')}${num('Avance gravure', 'machine.engraveFeedMmMin', 'mm/min', '50')}</div>
        <div class="row2">${num('Plongée par contour', 'machine.contourSec', 's', '0.5')}${num('Mise en place / panneau', 'machine.sheetSetupMin', 'min', '1')}</div>
        ${num('Coût horaire machine', 'machine.hourlyRate', '€/h', '1')}
      </section>
      <section>
        <h3>4 · Devis</h3>
        <div class="seg" data-seg="quote.material">
          <button data-v="sheets">Panneaux entiers</button><button data-v="prorata">Chute déduite</button>
        </div>
        <div class="row2">${num('Consommables', 'quote.consumables', '€', '1')}${num('Marge', 'quote.marginPct', '%', '1')}</div>
        <div class="row2">${num('Main d’œuvre', 'quote.laborH', 'h', '0.25')}${num('Taux horaire', 'quote.laborRate', '€/h', '1')}</div>
        <p class="hint">« Chute déduite » : le dernier panneau n’est compté qu’à la longueur utilisée, le reste repart en stock.</p>
      </section>
      <div class="actions">
        <button class="btn primary" id="dl" type="button" disabled>Télécharger les DXF par panneau (.zip)</button>
      </div>
      <div class="status" id="status"></div>
      <div class="summary" id="summary"></div>
    </aside>
    <main class="stage">
      <nav class="tabs">
        <button data-tab="sheets" class="on">Calepinage</button>
        <button data-tab="quote">Devis</button>
        <button data-tab="lib">Bibliothèque</button>
        <button data-tab="manual">Pièces à la main</button>
      </nav>
      <div class="view on" data-view="sheets"><div class="sheets" id="sheets"></div></div>
      <div class="view" data-view="quote"><div class="doc" id="quote"></div></div>
      <div class="view" data-view="lib"><div class="doc">
        <h2>Bibliothèque de panneaux</h2>
        <p class="hint">Prix indicatifs : remplace-les par ceux de ton fournisseur. « Fil » interdit de tourner les pièces (sens du bois).</p>
        <div class="tablewrap"><table class="grid" id="libT"></table></div>
        <div class="btnrow"><button class="btn small" id="addPanel" type="button">+ Ajouter un panneau</button>
        <button class="btn ghost small" id="resetPanels" type="button">Remettre les panneaux par défaut</button></div>
      </div></div>
      <div class="view" data-view="manual"><div class="doc">
        <h2>Pièces rectangulaires</h2>
        <p class="hint">Plateaux, étagères, fonds, cales… Elles sont calepinées avec les pièces du projet.</p>
        <div class="tablewrap"><table class="grid" id="manT"></table></div>
        <div class="btnrow"><button class="btn small" id="addPiece" type="button">+ Ajouter une pièce</button></div>
      </div></div>
    </main>
  </div>`;

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...root.querySelectorAll(sel)] as T[];

  let plan: Plan | null = null;
  const groupNames = () => [...new Set([...(job?.pieces.map((p) => p.group) ?? []), ...s.manual.map((m, i) => m.name || `Pièce ${i + 1}`)])];
  const hueOf = (g: string) => GROUP_HUES[Math.max(0, groupNames().indexOf(g)) % GROUP_HUES.length];
  // les couches d'un tableau gardent la même teinte (bois), l'eau en bleu
  const hue = (g: string) => (g.startsWith('Couche') ? 32 : g === 'Eau' ? 200 : hueOf(g));

  // ---------- Projet ----------
  const renderJob = () => {
    const el = $('#job');
    if (!job) {
      el.innerHTML = `<p class="hint">Aucun projet reçu. Calcule un tableau dans <a href="#/topo">Topo</a> puis clique « Calepiner et chiffrer dans l’Atelier », ou ajoute des pièces dans l’onglet « Pièces à la main ».</p>`;
      return;
    }
    const groups = new Map<string, number>();
    for (const p of job.pieces) groups.set(p.group, (groups.get(p.group) ?? 0) + 1);
    el.innerHTML = `
      <p class="jobname"><strong>${esc(job.name)}</strong> <span class="tag">${esc(job.source)}</span></p>
      <p class="hint">${job.pieces.length} pièces. Décoche ce que tu ne veux pas découper :</p>
      <div class="chips">${[...groups].map(([g, n]) => `<label class="chip"><input type="checkbox" data-g="${esc(g)}" ${s.offGroups.includes(g) ? '' : 'checked'}/> ${esc(g)} <em>${n}</em></label>`).join('')}</div>
      <div class="btnrow"><button class="btn ghost small" id="dropJob" type="button">Retirer le projet</button></div>`;
    $$<HTMLInputElement>('[data-g]').forEach((c) => c.addEventListener('change', () => {
      const g = c.dataset.g!;
      s.offGroups = c.checked ? s.offGroups.filter((x) => x !== g) : [...s.offGroups, g];
      changed();
    }));
    $('#dropJob').addEventListener('click', () => { job = null; setJob(null); renderJob(); changed(); });
  };

  // ---------- Champs simples (machine, devis) ----------
  const getP = (path: string) => path.split('.').reduce((o: any, k) => o[k], s);
  const setP = (path: string, v: unknown) => {
    const ks = path.split('.');
    const last = ks.pop()!;
    (ks.reduce((o: any, k) => o[k], s) as any)[last] = v;
  };
  $$<HTMLInputElement>('[data-p]').forEach((el) => {
    el.value = String(getP(el.dataset.p!));
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      if (Number.isFinite(v) && v >= 0) { setP(el.dataset.p!, v); changed(); }
    });
  });
  $$('[data-seg]').forEach((seg) => {
    const path = seg.dataset.seg!;
    const sync = () => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === getP(path)));
    seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { setP(path, b.dataset.v); sync(); changed(); }));
    sync();
  });

  // ---------- Tableaux éditables ----------
  const cell = (kind: 'text' | 'number', key: string, v: string | number, extra = '') =>
    `<td><input type="${kind}" data-c="${key}" value="${esc(String(v))}" ${kind === 'number' ? 'min="0" step="any"' : ''} ${extra}/></td>`;

  const renderLib = () => {
    $('#libT').innerHTML = `<thead><tr><th>Nom</th><th>Longueur (mm)</th><th>Largeur (mm)</th><th>Épaisseur (mm)</th><th>Prix (€)</th><th>Fil</th><th>€/m²</th><th></th></tr></thead><tbody>${
      s.panels.map((p, i) => `<tr data-i="${i}">${cell('text', 'name', p.name)}${cell('number', 'w', p.w)}${cell('number', 'h', p.h)}${cell('number', 'thickness', p.thickness)}${cell('number', 'price', p.price)}
        <td class="c"><input type="checkbox" data-c="grain" ${p.grain ? 'checked' : ''}/></td><td class="r" data-m2>${p.w && p.h ? fmt(p.price / (p.w * p.h / 1e6), 2) : '—'}</td>
        <td><button class="btn ghost small" data-del type="button" title="Supprimer">✕</button></td></tr>`).join('')}</tbody>`;
    $$('#libT tbody tr').forEach((tr) => {
      const p = s.panels[Number(tr.dataset.i)];
      tr.querySelectorAll<HTMLInputElement>('[data-c]').forEach((inp) => inp.addEventListener('input', () => {
        const k = inp.dataset.c as keyof typeof p;
        if (k === 'grain') p.grain = inp.checked;
        else if (k === 'name') p.name = inp.value;
        else { const v = parseFloat(inp.value); if (!(Number.isFinite(v) && v >= 0)) return; (p as any)[k] = v; }
        tr.querySelector('[data-m2]')!.textContent = p.w && p.h ? fmt(p.price / (p.w * p.h / 1e6), 2) : '—';
        changed();
      }));
      tr.querySelector('[data-del]')!.addEventListener('click', () => { s.panels.splice(Number(tr.dataset.i), 1); renderLib(); changed(); });
    });
  };
  $('#addPanel').addEventListener('click', () => {
    s.panels.push({ id: uid(), name: 'Nouveau panneau', w: 2500, h: 1220, thickness: 3, price: 20, grain: false });
    renderLib(); changed();
  });
  $('#resetPanels').addEventListener('click', () => {
    if (!confirm('Remplacer ta bibliothèque par les panneaux par défaut ?')) return;
    s.panels = DEFAULT_PANELS.map((p) => ({ ...p }));
    s.choice = {};
    renderLib(); changed();
  });

  const renderManual = () => {
    $('#manT').innerHTML = `<thead><tr><th>Nom</th><th>Longueur (mm)</th><th>Largeur (mm)</th><th>Épaisseur (mm)</th><th>Quantité</th><th></th></tr></thead><tbody>${
      s.manual.length ? s.manual.map((m, i) => `<tr data-i="${i}">${cell('text', 'name', m.name)}${cell('number', 'w', m.w)}${cell('number', 'h', m.h)}${cell('number', 'thickness', m.thickness)}${cell('number', 'qty', m.qty, 'step="1"')}
        <td><button class="btn ghost small" data-del type="button" title="Supprimer">✕</button></td></tr>`).join('')
      : '<tr><td colspan="6" class="muted">Aucune pièce.</td></tr>'}</tbody>`;
    $$('#manT tbody tr[data-i]').forEach((tr) => {
      const m = s.manual[Number(tr.dataset.i)];
      tr.querySelectorAll<HTMLInputElement>('[data-c]').forEach((inp) => inp.addEventListener('input', () => {
        const k = inp.dataset.c!;
        if (k === 'name') m.name = inp.value;
        else { const v = parseFloat(inp.value); if (!(Number.isFinite(v) && v >= 0)) return; (m as any)[k] = v; }
        changed();
      }));
      tr.querySelector('[data-del]')!.addEventListener('click', () => { s.manual.splice(Number(tr.dataset.i), 1); renderManual(); changed(); });
    });
  };
  $('#addPiece').addEventListener('click', () => {
    s.manual.push({ id: uid(), name: `Pièce ${s.manual.length + 1}`, w: 600, h: 300, thickness: 18, qty: 1 });
    renderManual(); changed();
  });

  // ---------- Choix du panneau par épaisseur ----------
  const renderChoice = () => {
    const el = $('#choice');
    if (!plan || !plan.groups.length) { el.innerHTML = '<p class="hint">Pas encore de pièces.</p>'; return; }
    el.innerHTML = plan.groups.map((g) => `
      <label class="field"><span>${fmt(g.thickness, 1)} mm · ${g.pieceCount} pièce(s)${g.panel && g.sheets.length ? ` → <strong>${g.sheets.length} × ${esc(g.panel.name)}</strong>` : ''}</span>
        <select data-t="${g.thickness}">
          <option value="">Automatique (le moins cher)</option>
          ${g.candidates.map((p) => `<option value="${p.id}" ${!g.auto && g.panel?.id === p.id ? 'selected' : ''}>${esc(p.name)} · ${p.w}×${p.h} · ${eur(p.price)}</option>`).join('')}
        </select></label>`).join('');
    $$<HTMLSelectElement>('[data-t]').forEach((sel) => sel.addEventListener('change', () => {
      if (sel.value) s.choice[sel.dataset.t!] = sel.value; else delete s.choice[sel.dataset.t!];
      changed();
    }));
  };

  // ---------- Résultats ----------
  const renderSheets = () => {
    const el = $('#sheets');
    if (!plan || !plan.sheets.length) {
      el.innerHTML = '<p class="empty">Rien à calepiner pour l’instant.</p>';
      return;
    }
    el.innerHTML = plan.sheets.map((sh) => `
      <figure class="sheet">
        ${sheetSvg(sh, hue, s.machine.marginMm)}
        <figcaption><strong>Panneau ${sh.n}</strong> · ${esc(sh.panel.name)} · ${sh.pieces.length} pièce(s) · utilisation ${fmt(sh.util * 100)} % · ${fmt(Math.min(sh.extent, Math.max(sh.panel.w, sh.panel.h)))} mm de longueur utilisés sur ${fmt(Math.max(sh.panel.w, sh.panel.h))}</figcaption>
      </figure>`).join('');
  };

  const renderQuote = () => {
    const el = $('#quote');
    if (!plan) return;
    const c = plan.cost, q = s.quote;
    el.innerHTML = `
      <h2>Devis simulé</h2>
      <p class="hint">${esc(job?.name ?? 'Projet')} · ${plan.pieceCount} pièce(s) · ${plan.sheets.length} panneau(x)</p>
      <table class="grid ro">
        <thead><tr><th>Panneau</th><th>Qté</th><th>Pièces</th><th>Utilisation</th><th class="r">Prix des panneaux</th></tr></thead>
        <tbody>${plan.groups.filter((g) => g.panel && g.sheets.length).map((g) => {
          const u = g.sheets.reduce((a, sh) => a + sh.pieceArea, 0) / (g.sheets.length * g.panel!.w * g.panel!.h);
          return `<tr><td>${esc(g.panel!.name)} (${g.panel!.w} × ${g.panel!.h})</td><td>${g.sheets.length}</td><td>${g.pieceCount}</td><td>${fmt(u * 100)} %</td><td class="r">${eur(g.sheets.length * g.panel!.price)}</td></tr>`;
        }).join('')}</tbody>
      </table>
      <table class="grid ro totals">
        <tr><td>Matière${q.material === 'prorata' ? ' (chute du dernier panneau déduite)' : ''}</td><td class="r">${eur(c.material)}</td></tr>
        <tr><td>Machine : ${duration(plan.timeMin)} à ${eur(s.machine.hourlyRate)}/h <span class="muted">(${fmt(plan.cutLengthMm / 1000, 1)} m de coupe, ${fmt(plan.engraveLengthMm / 1000, 1)} m de gravure)</span></td><td class="r">${eur(c.machine)}</td></tr>
        <tr><td>Consommables (colle, vernis, résine…)</td><td class="r">${eur(c.consumables)}</td></tr>
        <tr><td>Main d’œuvre : ${fmt(q.laborH, 2)} h à ${eur(q.laborRate)}/h</td><td class="r">${eur(c.labor)}</td></tr>
        <tr class="sub"><td>Prix de revient</td><td class="r">${eur(c.subtotal)}</td></tr>
        <tr><td>Marge ${fmt(q.marginPct)} %</td><td class="r">${eur(c.margin)}</td></tr>
        <tr class="total"><td>Prix de vente conseillé</td><td class="r">${eur(c.total)}</td></tr>
      </table>
      ${plan.warnings.map((w) => `<p class="warn">${esc(w)}</p>`).join('')}
      <div class="btnrow noprint"><button class="btn small" id="print" type="button">Imprimer / PDF</button>
      <button class="btn ghost small" id="copyQuote" type="button">Copier le texte</button></div>`;
    $('#print').addEventListener('click', () => window.print());
    $('#copyQuote').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(quoteLines(plan!, s, job?.name ?? '').join('\n')); $('#copyQuote').textContent = 'Copié ✓'; }
      catch { $('#copyQuote').textContent = 'Copie impossible'; }
    });
  };

  const renderSummary = () => {
    if (!plan) return;
    const c = plan.cost;
    const util = plan.sheets.length ? plan.sheets.reduce((a, sh) => a + sh.pieceArea, 0) / plan.sheets.reduce((a, sh) => a + sh.panel.w * sh.panel.h, 0) : 0;
    $('#summary').innerHTML = plan.pieceCount ? `
      <dl>
        <dt>Pièces</dt><dd>${plan.pieceCount}</dd>
        <dt>Panneaux</dt><dd>${plan.sheets.length}</dd>
        <dt>Utilisation</dt><dd>${fmt(util * 100)} %</dd>
        <dt>Temps machine</dt><dd>${duration(plan.timeMin)}</dd>
        <dt>Matière</dt><dd>${eur(c.material)}</dd>
        <dt>Prix de revient</dt><dd>${eur(c.subtotal)}</dd>
        <dt>Prix conseillé</dt><dd>${eur(c.total)}</dd>
      </dl>
      ${plan.warnings.map((w) => `<p class="warn">${esc(w)}</p>`).join('')}` : '';
    ($('#dl') as HTMLButtonElement).disabled = !plan.sheets.length;
  };

  let timer = 0;
  let worker: Worker | null = null;
  let busy = false;
  let seq = 0;
  const compute = () => {
    // un calcul en cours devient inutile : on l'arrête
    if (worker && busy) { worker.terminate(); worker = null; }
    if (!worker) {
      worker = new Worker(new URL('./planWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent) => {
        if (e.data.id !== seq) return;
        busy = false;
        if (e.data.error) {
          $('#status').textContent = 'Erreur : ' + e.data.error;
          $('#status').className = 'status err';
          return;
        }
        plan = e.data.plan as Plan;
        renderChoice();
        renderSheets();
        renderQuote();
        renderSummary();
        $('#status').textContent = plan.pieceCount ? `Calepinage calculé en ${fmt((performance.now() - t0) / 1000, 1)} s.` : '';
        $('#status').className = 'status';
      };
    }
    const t0 = performance.now();
    busy = true;
    seq++;
    $('#status').textContent = 'Optimisation du calepinage…';
    $('#status').className = 'status';
    worker.postMessage({ id: seq, job, state: s });
  };
  const changed = () => {
    saveAtelier(s);
    clearTimeout(timer);
    timer = window.setTimeout(compute, 250);
  };

  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
    $$('[data-view]').forEach((v) => v.classList.toggle('on', v.dataset.view === b.dataset.tab));
  }));

  $('#dl').addEventListener('click', async () => {
    if (!plan) return;
    $('#status').textContent = 'Création du fichier ZIP…';
    const blob = await buildAtelierZip(plan, s, job?.name ?? '');
    downloadBlob(blob, `woodydxf-atelier-${slug(job?.name ?? 'projet')}.zip`);
    $('#status').textContent = 'ZIP téléchargé.';
    $('#status').className = 'status ok';
  });

  renderJob();
  renderLib();
  renderManual();
  compute();

  return () => { clearTimeout(timer); worker?.terminate(); };
}
