/**
 * Guided tutorial: dims the page, cuts a spotlight around one part of the UI at a time and explains it
 * in a small card with Back / Next. Steps can run an action first (e.g. open a page in the inspector).
 */
export interface TourStep {
  /** CSS selector of the element to highlight; omit for a centred card */
  target?: string;
  title: string;
  body: string;
  /** run before showing the step (open a page, select something…) */
  before?: () => void;
}

let active: (() => void) | null = null;

export function runTour(steps: TourStep[], onDone?: () => void) {
  active?.();
  let i = 0;
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = `<div class="tour-spot"></div><div class="tour-card" role="dialog" aria-live="polite">
    <div class="tour-count"></div><h3></h3><p></p>
    <div class="tour-actions"><button class="btn btn-ghost tour-skip">閉じる</button><span></span><button class="btn tour-back">← 戻る</button><button class="btn btn-mint tour-next">次へ →</button></div>
  </div>`;
  document.body.append(root);
  const spot = root.querySelector<HTMLElement>('.tour-spot')!, card = root.querySelector<HTMLElement>('.tour-card')!;
  const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const visible = (el: Element | null): el is HTMLElement => !!el && (el as HTMLElement).offsetParent !== null && el.getBoundingClientRect().width > 0;

  const place = () => {
    const st = steps[i];
    const el = st.target ? document.querySelector(st.target) : null;
    const pad = 6;
    if (visible(el)) {
      const r = el.getBoundingClientRect();
      Object.assign(spot.style, { display: 'block', left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
      root.classList.remove('center');
      // card next to the spotlight: below, else above, else beside, clamped to the viewport
      const cw = Math.min(340, innerWidth - 24), ch = card.offsetHeight || 180;
      let x = r.left + r.width / 2 - cw / 2, y = r.bottom + 14;
      if (y + ch > innerHeight - 12) y = r.top - ch - 14;
      if (y < 12) { y = Math.max(12, Math.min(innerHeight - ch - 12, r.top)); x = r.right + 14; if (x + cw > innerWidth - 12) x = r.left - cw - 14; }
      x = Math.max(12, Math.min(innerWidth - cw - 12, x));
      Object.assign(card.style, { left: `${x}px`, top: `${y}px`, width: `${cw}px` });
    } else {
      spot.style.display = 'none';
      root.classList.add('center');
      Object.assign(card.style, { left: '', top: '', width: '' });
    }
  };
  const show = () => {
    const st = steps[i];
    st.before?.();
    q('.tour-count').textContent = `${i + 1} / ${steps.length}`;
    q('h3').textContent = st.title;
    q('p').innerHTML = st.body;
    q<HTMLButtonElement>('.tour-back').disabled = i === 0;
    q('.tour-next').textContent = i === steps.length - 1 ? 'はじめる' : '次へ →';
    const el = st.target ? document.querySelector(st.target) : null;
    if (visible(el)) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    place(); // position right away (layout is synchronous); refine after paint and once animations settle
    requestAnimationFrame(place); setTimeout(place, 300);
  };
  const close = () => {
    removeEventListener('resize', place); removeEventListener('scroll', place, true); removeEventListener('keydown', key, true);
    root.remove(); active = null; onDone?.();
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (i > 0) { i--; show(); } }
    e.stopPropagation();
  };
  const next = () => { if (i < steps.length - 1) { i++; show(); } else close(); };
  q('.tour-next').onclick = next;
  q('.tour-back').onclick = () => { if (i > 0) { i--; show(); } };
  q('.tour-skip').onclick = close;
  addEventListener('resize', place); addEventListener('scroll', place, true); addEventListener('keydown', key, true);
  active = close;
  show();
}
