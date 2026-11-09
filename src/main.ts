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
    <a class="card" href="#/lames">
      <span class="tag ok">Disponible</span>
      <h2>Lames · Mobilier paramétrique</h2>
      <p>Transforme une forme en lames de bois assemblées : comptoirs, bancs, bureaux, panneaux muraux.</p>
    </a>
  </div>
  <p class="homehelp">Besoin d’un coup de main ? Chaque réglage est expliqué dans l’<a href="#/aide">aide</a>, et le petit <span class="hq demo">?</span> à côté d’un réglage donne son explication sans quitter le module.</p>
</div>`;

async function route() {
  if (typeof unmount === 'function') unmount();
  unmount = undefined;
  const r = location.hash.replace(/^#\/?/, '');
  const [page, ...rest] = r.split('/');
  document.querySelectorAll('.topnav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#/' + page));
  // les bulles d'aide se posent sur le module une fois monté
  const withHelp = async (id: string, u: Unmount) => {
    const { attachHelp } = await import('./help/inline');
    const off = attachHelp(app, id);
    return () => { off(); if (typeof u === 'function') u(); };
  };
  if (r === 'topo') {
    app.innerHTML = '<p class="loading">Chargement…</p>';
    const { mountTopo } = await import('./topo/view');
    unmount = await withHelp('topo', mountTopo(app));
  } else if (r === 'atelier') {
    app.innerHTML = '<p class="loading">Chargement…</p>';
    const { mountAtelier } = await import('./atelier/view');
    unmount = await withHelp('atelier', mountAtelier(app));
  } else if (r === 'lames') {
    app.innerHTML = '<p class="loading">Chargement…</p>';
    const { mountLames } = await import('./lames/view');
    unmount = await withHelp('lames', mountLames(app));
  } else if (page === 'aide') {
    const { mountHelp } = await import('./help/page');
    unmount = mountHelp(app, rest);
  } else {
    app.innerHTML = HOME;
  }
}

window.addEventListener('hashchange', route);
route();
