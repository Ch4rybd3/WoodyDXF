// Bulles « ? » à côté des réglages d'un module, et liens vers la page Aide depuis les titres de section
import { HELP, md, type HelpItem } from './content';
import { itemId } from './page';

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function attachHelp(root: HTMLElement, moduleId: string): () => void {
  const mod = HELP.find((m) => m.id === moduleId);
  if (!mod) return () => {};
  const pop = document.createElement('div');
  pop.className = 'hpop';
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  document.body.appendChild(pop);
  let openFor: HTMLElement | null = null;

  const close = () => { pop.hidden = true; openFor = null; };
  const open = (btn: HTMLElement, it: HelpItem) => {
    if (openFor === btn) { close(); return; }
    openFor = btn;
    pop.innerHTML = `<strong>${esc(it.label)}</strong><p>${md(it.text)}</p>${it.tip ? `<p class="htip">${md(it.tip)}</p>` : ''}
      ${it.def ? `<p class="hdef">Par défaut : ${esc(it.def)}</p>` : ''}
      <a href="#/aide/${mod.id}/${encodeURIComponent(it.key)}" target="_blank" rel="noopener">Voir dans l’aide ↗</a>`;
    pop.hidden = false;
    const r = btn.getBoundingClientRect();
    const w = Math.min(320, window.innerWidth - 24);
    pop.style.width = `${w}px`;
    pop.style.left = `${Math.max(12, Math.min(r.left - 12, window.innerWidth - w - 12))}px`;
    const below = r.bottom + 8;
    const h = pop.offsetHeight;
    pop.style.top = `${below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 8) : below}px`;
  };

  const makeBtn = (it: HelpItem) => {
    const b = document.createElement('span');
    b.className = 'hq';
    b.textContent = '?';
    b.tabIndex = 0;
    b.setAttribute('role', 'button');
    b.setAttribute('aria-label', `Aide : ${it.label}`);
    const act = (e: Event) => { e.preventDefault(); e.stopPropagation(); open(b, it); };
    b.addEventListener('click', act);
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') act(e); });
    return b;
  };

  for (const sec of mod.sections) {
    for (const it of sec.items) {
      const el = it.key.startsWith('#')
        ? root.querySelector<HTMLElement>(it.key)
        : root.querySelector<HTMLElement>(`[data-k="${it.key}"], [data-p="${it.key}"], [data-seg="${it.key}"]`);
      if (!el) continue;
      if (el.matches('[data-seg]')) { el.appendChild(makeBtn(it)); el.classList.add('hasq'); continue; }
      const label = el.closest('label.field, label.check');
      const span = label?.querySelector(':scope > span');
      if (span) { span.appendChild(makeBtn(it)); continue; }
      if (el instanceof HTMLButtonElement) el.title = it.text;
    }
    // lien du titre de section vers la page d'aide (nouvel onglet : le travail en cours reste ouvert)
    if (sec.heading) {
      const h = [...root.querySelectorAll<HTMLElement>('aside h3, .doc h2')].find((x) => (x.textContent ?? '').trim().startsWith(sec.heading!));
      if (h && !h.querySelector('.hlink')) {
        const a = document.createElement('a');
        a.className = 'hlink';
        a.href = `#/aide/${mod.id}/${sec.id}`;
        a.target = '_blank';
        a.rel = 'noopener';
        a.title = `Aide : ${sec.title}`;
        a.textContent = '?';
        h.appendChild(a);
      }
    }
  }

  const onDoc = (e: Event) => { if (!pop.hidden && !pop.contains(e.target as Node)) close(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  document.addEventListener('click', onDoc);
  document.addEventListener('keydown', onKey);
  root.addEventListener('scroll', close, true);
  return () => {
    document.removeEventListener('click', onDoc);
    document.removeEventListener('keydown', onKey);
    root.removeEventListener('scroll', close, true);
    pop.remove();
  };
}

export { itemId };
