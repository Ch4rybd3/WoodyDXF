import './style.css';

type Unmount = (() => void) | void;

const app = document.getElementById('app')!;
let unmount: Unmount;

const HOME = `
<div class="home">
  <section class="hero">
    <h1>Concevoir pour la CNC bois</h1>
    <p>Des fichiers DXF prêts à usiner, directement dans le navigateur. Rien à installer, rien n'est envoyé sur un serveur.</p>
  </section>
  <div class="cards">
    <a class="card" href="#/topo">
      <span class="tag ok">Disponible</span>
      <h2>Topo · Tableaux en relief</h2>
      <p>Choisis un lieu, un format et une épaisseur de couche : le relief réel est découpé en couches DXF à empiler.</p>
    </a>
    <a class="card" href="#/atelier">
      <span class="tag ok">Disponible</span>
      <h2>Atelier · Calepinage et devis</h2>
      <p>Range les pièces dans tes panneaux, réduit les chutes et calcule le prix de revient.</p>
    </a>
    <a class="card soon" href="#/lames">
      <span class="tag">Bientôt</span>
      <h2>Lames · Mobilier paramétrique</h2>
      <p>Transforme une forme en lames de bois assemblées : comptoirs, bancs, bureaux, panneaux muraux.</p>
    </a>
  </div>
</div>`;

const SOON = (title: string, text: string) => `
<div class="home"><section class="hero"><h1>${title}</h1><p>${text}</p><p><a class="btn" href="#/">← Retour</a></p></section></div>`;

async function route() {
  if (typeof unmount === 'function') unmount();
  unmount = undefined;
  const r = location.hash.replace(/^#\/?/, '');
  document.querySelectorAll('.topnav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#/' + r));
  if (r === 'topo') {
    app.innerHTML = '<p class="loading">Chargement…</p>';
    const { mountTopo } = await import('./topo/view');
    unmount = mountTopo(app);
  } else if (r === 'atelier') {
    app.innerHTML = '<p class="loading">Chargement…</p>';
    const { mountAtelier } = await import('./atelier/view');
    unmount = mountAtelier(app);
  } else if (r === 'lames') {
    app.innerHTML = SOON('Lames', 'Mobilier et panneaux en lames de bois : en cours de développement.');
  } else {
    app.innerHTML = HOME;
  }
}

window.addEventListener('hashchange', route);
route();
