// Captures d'écran de la page Aide (public/aide/*.webp).
// Usage : lancer `npm run dev`, puis `node scripts/captures.mjs [url]` (Edge ou Chrome installé).
// Pilote un navigateur sans fenêtre par le protocole DevTools, sans dépendance supplémentaire.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5173/';
const OUT = new URL('../public/aide/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const W = 1400, H = 860, PORT = 9333;

const browsers = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const exe = browsers.find((b) => existsSync(b));
if (!exe) throw new Error('Aucun navigateur Edge/Chrome trouvé');
const profile = mkdtempSync(join(tmpdir(), 'woody-cap-'));
const proc = spawn(exe, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  '--hide-scrollbars', '--no-first-run', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch { /* démarrage */ }
  await sleep(200);
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const js = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const waitFor = async (cond, ms = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await js(`return !!(${cond})`).catch(() => false)) return; await sleep(300); }
  throw new Error(`Délai dépassé : ${cond}`);
};
const go = async (hash) => { await cdp('Page.navigate', { url: BASE + hash }); await sleep(600); await waitFor(`document.readyState === 'complete' && !document.querySelector('.loading')`); };
const shot = async (name, selector) => {
  let clip;
  if (selector) {
    clip = await js(`const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({ block: 'start' });
      await new Promise((r) => setTimeout(r, 150)); const b = el.getBoundingClientRect();
      return { x: Math.max(0, b.x - 4), y: Math.max(0, b.y - 4), width: b.width + 8, height: Math.min(b.height + 8, ${H}), scale: 1 }`);
  }
  const r = await cdp('Page.captureScreenshot', { format: 'webp', quality: 80, ...(clip ? { clip } : {}) });
  writeFileSync(new URL(name, OUT), Buffer.from(r.data, 'base64'));
  console.log('✓', name);
};
const click = (sel) => js(`document.querySelector(${JSON.stringify(sel)}).click()`);

try {
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  // état de départ propre et reproductible
  await go('#/');
  await js(`localStorage.clear();
    localStorage.setItem('woody.topo.v1', JSON.stringify({ water: false }));
    localStorage.setItem('woody.atelier.v1', JSON.stringify({ offcuts: [{ id: 'cap1', name: 'CP peuplier 3 mm · étagère du haut', w: 700, h: 500, thickness: 3, panelId: 'cpp3', value: 2.18 }] }));`);
  await go('#/');
  await shot('accueil.webp');

  // Lames
  await go('#/lames');
  await sleep(2500);
  await shot('lames-3d.webp');
  await click('[data-preset="goutte"]');
  await sleep(2500);
  await shot('lames-goutte.webp');
  await click('[data-preset="bureau"]');
  await sleep(1500);
  await click('[data-tab="slice"]');
  await js(`const s = document.querySelector('#sel'); s.value = 20; s.dispatchEvent(new Event('input'));`);
  await sleep(800);
  await shot('lames-lame.webp');

  // Topo
  await go('#/topo');
  await sleep(5000); // fonds de carte
  await shot('topo-carte.webp');
  await shot('topo-lieu.webp', 'aside.panel section:nth-of-type(1)');
  await shot('topo-format.webp', 'aside.panel section:nth-of-type(2)');
  await js(`document.querySelector('aside.panel').scrollTop = 0`);
  await click('#go');
  await waitFor(`!document.querySelector('#toAtelier').disabled`, 120000);
  await click('[data-tab="layers"]');
  await sleep(1200);
  await shot('topo-couches.webp');
  await click('#toAtelier');
  await sleep(800);

  // Atelier
  await go('#/atelier');
  await waitFor(`/calculé/.test(document.querySelector('#status').textContent)`, 120000);
  await sleep(500);
  await shot('atelier-calepinage.webp');
  await click('[data-tab="quote"]');
  await sleep(400);
  await shot('atelier-devis.webp');
  await click('[data-tab="stock"]');
  await sleep(400);
  await shot('atelier-chutes.webp');

  await go('#/');
  await js(`localStorage.clear()`);
} finally {
  ws.close();
  proc.kill();
}
