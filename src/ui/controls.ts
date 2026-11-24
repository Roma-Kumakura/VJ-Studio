/** Tiny DOM helpers for the editor panels. Every control re-reads its value via sync(). */
let notify: () => void = () => {};
const syncs = new Map<() => void, HTMLElement>();
export const setNotify = (fn: () => void) => { notify = fn; };
/** refresh every control from state (after drag on the preview, load, reset…) */
export const refreshAll = () => {
  for (const [sync, el] of syncs) {
    if (!el.isConnected && el.dataset.keep !== '1') { syncs.delete(sync); continue; }
    sync();
  }
};

export const h = <T extends HTMLElement = HTMLElement>(html: string): T => {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as T;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function reg(el: HTMLElement, sync: () => void) {
  el.dataset.keep = '1'; // kept until first attached
  syncs.set(sync, el);
  sync();
  queueMicrotask(() => { delete el.dataset.keep; });
  return el;
}

export function sec(title: string, right?: HTMLElement) {
  const e = h(`<div class="sec">${esc(title)}</div>`);
  if (right) { right.classList.add('right'); e.append(right); }
  return e;
}

export function hint(text: string) { return h(`<p class="hint">${text}</p>`); }

export function slider(label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, fmt?: (v: number) => string) {
  const row = h(`<div class="row"><span>${esc(label)}</span><input type="range" min="${min}" max="${max}" step="${step}"><output></output></div>`);
  const inp = row.querySelector('input')!, out = row.querySelector('output')!;
  const show = (v: number) => {
    out.textContent = fmt ? fmt(v) : v.toFixed(step < 1 ? (step < 0.1 ? 2 : 1) : 0);
    inp.style.setProperty('--p', `${((v - min) / (max - min)) * 100}%`);
  };
  inp.oninput = () => { set(+inp.value); show(+inp.value); notify(); };
  return reg(row, () => { inp.value = String(get()); show(get()); });
}

export function select(label: string, options: [string, string][], get: () => string, set: (v: string) => void) {
  const f = h(`<div class="field"><span>${esc(label)}</span><select>${options.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></div>`);
  const se = f.querySelector('select')!;
  se.onchange = () => { set(se.value); notify(); };
  return reg(f, () => { se.value = get(); });
}

export function seg(label: string | null, options: [string, string][], get: () => string, set: (v: string) => void) {
  const wrap = h(`<div class="${label ? 'field' : ''}">${label ? `<span>${esc(label)}</span>` : ''}<div class="seg"></div></div>`);
  const box = wrap.querySelector('.seg')!;
  const btns = options.map(([v, l]) => {
    const b = h<HTMLButtonElement>(`<button type="button">${esc(l)}</button>`);
    b.onclick = () => { set(v); notify(); refreshAll(); };
    box.append(b);
    return [v, b] as const;
  });
  return reg(wrap, () => { const cur = get(); btns.forEach(([v, b]) => b.classList.toggle('on', v === cur)); });
}

export function toggle(label: string, get: () => boolean, set: (v: boolean) => void) {
  const l = h(`<label class="toggle"><input type="checkbox"><span class="sw"></span><span>${esc(label)}</span></label>`);
  const inp = l.querySelector('input')!;
  inp.onchange = () => { set(inp.checked); notify(); refreshAll(); };
  return reg(l, () => { inp.checked = get(); });
}

export function text(label: string, get: () => string, set: (v: string) => void, placeholder = '') {
  const f = h(`<div class="field"><span>${esc(label)}</span><input type="text" placeholder="${esc(placeholder)}"></div>`);
  const inp = f.querySelector('input')!;
  inp.oninput = () => { set(inp.value); notify(); };
  return reg(f, () => { if (document.activeElement !== inp) inp.value = get(); });
}

export function color(label: string, get: () => string, set: (v: string) => void) {
  const l = h(`<label>${esc(label)}<input type="color"></label>`);
  const inp = l.querySelector('input')!;
  inp.oninput = () => { set(inp.value); notify(); };
  return reg(l, () => { inp.value = get(); });
}

/** drag a dot inside a mini 16:9 screen to place an element; snaps near the 3×3 grid */
export function posPad(label: string, get: () => [number, number], set: (x: number, y: number) => void) {
  const w = h(`<div class="pospad-wrap"><span>${esc(label)}</span><div class="pospad"><div class="dot"></div></div></div>`);
  const pad = w.querySelector<HTMLElement>('.pospad')!, dot = w.querySelector<HTMLElement>('.dot')!;
  const snap = (v: number) => { for (const s of [0.12, 0.5, 0.88]) if (Math.abs(v - s) < 0.03) return s; return Math.round(v * 100) / 100; };
  const move = (ev: PointerEvent) => {
    const r = pad.getBoundingClientRect();
    const x = snap(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)));
    const y = snap(Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)));
    set(x, y); place(); notify();
  };
  const place = () => { const [x, y] = get(); dot.style.left = `${x * 100}%`; dot.style.top = `${y * 100}%`; };
  pad.onpointerdown = (ev) => { pad.setPointerCapture(ev.pointerId); move(ev); pad.onpointermove = move; };
  pad.onpointerup = () => { pad.onpointermove = null; };
  return reg(w, place);
}

export function fileDrop(label: string, accept: string, multiple: boolean, onFiles: (files: File[]) => void) {
  const z = h(`<label class="dropzone"><input type="file" accept="${accept}" ${multiple ? 'multiple' : ''} hidden>${label}</label>`);
  const inp = z.querySelector('input')!;
  inp.onchange = () => { if (inp.files?.length) onFiles([...inp.files]); inp.value = ''; };
  z.ondragover = (e) => { e.preventDefault(); z.classList.add('over'); };
  z.ondragleave = () => z.classList.remove('over');
  z.ondrop = (e) => { e.preventDefault(); z.classList.remove('over'); if (e.dataTransfer?.files.length) onFiles([...e.dataTransfer.files]); };
  return z;
}

export function toast(msg: string) {
  const t = h(`<div class="toast">${esc(msg)}</div>`);
  document.body.append(t);
  setTimeout(() => t.remove(), 2200);
}

/** register a custom element's sync so refreshAll() updates it too */
export const bind = <T extends HTMLElement>(el: T, sync: () => void): T => reg(el, sync) as T;

/** in-app confirm dialog (native confirm() is blocked in some embedded browsers) */
export function confirmModal(message: string, okLabel = 'OK', cancelLabel = 'キャンセル'): Promise<boolean> {
  return new Promise((resolve) => {
    const m = h(`<div class="modal"><div class="modal-card"><p>${esc(message)}</p><div class="modal-actions"><button class="btn">${esc(cancelLabel)}</button><button class="btn btn-pink">${esc(okLabel)}</button></div></div></div>`);
    const [no, yes] = [...m.querySelectorAll('button')];
    const done = (v: boolean) => { m.remove(); resolve(v); };
    no.onclick = () => done(false);
    yes.onclick = () => done(true);
    m.onclick = (e) => { if (e.target === m) done(false); };
    document.body.append(m);
    yes.focus();
  });
}

export { esc };
