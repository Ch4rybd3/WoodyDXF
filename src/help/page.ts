import { HELP, md, norm, type HelpItem, type HelpModule, type HelpSection } from './content';

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const itemId = (mod: string, key: string) => `h-${mod}-${key.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
const secId = (mod: string, sec: string) => `s-${mod}-${sec}`;

const shot = (file: string | undefined, alt: string) => file
  ? `<figure class="hshot"><img src="./aide/${file}" alt="${esc(alt)}" loading="lazy" onerror="this.closest('figure').remove()"/><figcaption>${esc(alt)}</figcaption></figure>`
  : '';

const itemHtml = (m: HelpModule, it: HelpItem) => `
  <div class="hitem" id="${itemId(m.id, it.key)}" data-search="${esc(norm(`${it.label} ${it.text} ${it.tip ?? ''}`))}">
    <dt>${esc(it.label)}${it.def ? ` <span class="hdef">par défaut : ${esc(it.def)}</span>` : ''}</dt>
    <dd>${md(it.text)}${it.tip ? `<p class="htip">${md(it.tip)}</p>` : ''}</dd>
  </div>`;

const sectionHtml = (m: HelpModule, s: HelpSection) => `
  <section class="hsec" id="${secId(m.id, s.id)}">
    <h3>${esc(s.title)}</h3>
    ${s.intro ? `<p>${md(s.intro)}</p>` : ''}
    ${shot(s.shot, `${m.title.split(' · ')[0]} — ${s.title}`)}
    <dl>${s.items.map((it) => itemHtml(m, it)).join('')}</dl>
  </section>`;

const moduleHtml = (m: HelpModule) => `
  <article class="hmod" id="m-${m.id}">
    <h2>${esc(m.title)}</h2>
    <p class="hlead">${md(m.intro)}</p>
    ${m.id !== 'general' ? `<p><a class="btn small" href="#/${m.id}">Ouvrir ${esc(m.title.split(' · ')[0])} →</a></p>` : ''}
    ${shot(m.shot, m.title)}
    ${m.steps ? `<h3>En bref</h3><ol class="hsteps">${m.steps.map((t) => `<li>${md(t)}</li>`).join('')}</ol>` : ''}
    ${m.sections.map((s) => sectionHtml(m, s)).join('')}
  </article>`;

export function mountHelp(root: HTMLElement, path: string[]): () => void {
  root.innerHTML = `
  <div class="helpwrap">
    <nav class="htoc">
      <input type="search" id="hq" placeholder="Rechercher un réglage (ex. marge, fraise, goutte)"/>
      ${HELP.map((m) => `<div class="htoc-mod"><a href="#/aide/${m.id}" data-go="m-${m.id}"><strong>${esc(m.title)}</strong></a>
        ${m.sections.map((s) => `<a href="#/aide/${m.id}/${s.id}" data-go="${secId(m.id, s.id)}">${esc(s.title)}</a>`).join('')}</div>`).join('')}
    </nav>
    <div class="hbody" id="hbody">
      <header class="hhead">
        <h1>Aide</h1>
        <p>Chaque réglage de l’application, ce qu’il fait et sa valeur par défaut. Dans les modules, le petit <span class="hq demo">?</span> à côté d’un réglage affiche son explication, et celui d’un titre de section ouvre la page correspondante.</p>
      </header>
      <p class="hnone" id="hnone" hidden>Aucun réglage ne correspond à cette recherche.</p>
      ${HELP.map(moduleHtml).join('')}
    </div>
  </div>`;

  const body = root.querySelector('#hbody') as HTMLElement;
  const goTo = (id: string, flash = false) => {
    const el = root.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!el) return;
    const jump = () => el.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });
    jump();
    // les captures qui se chargent décalent la page : on recale une fois chargées
    const imgs = [...root.querySelectorAll('img')].filter((i) => !i.complete);
    imgs.forEach((i) => i.addEventListener('load', jump, { once: true }));
    setTimeout(() => imgs.forEach((i) => i.removeEventListener('load', jump)), 3000);
    if (flash) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1800); }
  };

  // lien profond : #/aide/<module>[/<section ou réglage>]
  const [mod, sub] = path;
  if (mod) {
    const m = HELP.find((x) => x.id === mod);
    if (m && sub) {
      const s = m.sections.find((x) => x.id === sub);
      if (s) goTo(secId(m.id, s.id));
      else { const it = m.sections.flatMap((x) => x.items).find((x) => itemId(m.id, x.key) === itemId(m.id, decodeURIComponent(sub))); if (it) goTo(itemId(m.id, it.key), true); }
    } else if (m) goTo(`m-${m.id}`);
  }

  // la table des matières fait défiler sans changer de page
  root.querySelectorAll<HTMLAnchorElement>('[data-go]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    history.replaceState(null, '', a.getAttribute('href'));
    goTo(a.dataset.go!);
  }));

  const q = root.querySelector('#hq') as HTMLInputElement;
  q.addEventListener('input', () => {
    const words = norm(q.value).split(/\s+/).filter(Boolean);
    let any = false;
    body.classList.toggle('searching', words.length > 0);
    body.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    root.querySelectorAll<HTMLElement>('.hmod').forEach((mEl) => {
      let modHit = false;
      mEl.querySelectorAll<HTMLElement>('.hsec').forEach((sEl) => {
        let secHit = false;
        const title = norm(sEl.querySelector('h3')!.textContent ?? '');
        sEl.querySelectorAll<HTMLElement>('.hitem').forEach((it) => {
          const hit = !words.length || words.every((w) => it.dataset.search!.includes(w) || title.includes(w));
          it.hidden = !hit;
          secHit ||= hit;
        });
        sEl.hidden = !secHit;
        modHit ||= secHit;
      });
      mEl.hidden = !modHit;
      any ||= modHit;
    });
    (root.querySelector('#hnone') as HTMLElement).hidden = any;
  });
  if (!mod) q.focus();
  return () => {};
}
