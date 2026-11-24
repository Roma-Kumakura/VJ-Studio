/**
 * UI language switch (日本語 / English).
 * The UI is written in Japanese; in English mode every text node and title / placeholder / aria-label
 * is translated from a dictionary — exact phrases first, then known fragments inside longer strings
 * (dynamic messages such as "3個"). New DOM (panels, toasts, dialogs, the tour) is translated as it
 * appears. Switching back restores the original Japanese exactly.
 */
import { EN, EN_PATTERNS } from './en';

export type Lang = 'ja' | 'en';
const KEY = 'vj-lang';
const JP = /[ぁ-んァ-ヶ一-龯々〜、。「」（）！？]/;

let lang: Lang = (() => { try { return (localStorage.getItem(KEY) as Lang) || (navigator.language?.startsWith('ja') ? 'ja' : 'en'); } catch { return 'ja'; } })();
export const getLang = () => lang;
export const isEn = () => lang === 'en';

const extra: Record<string, string> = {};
/** add translations known only at runtime (theme names, taglines…) */
export function addTranslations(map: Record<string, string>) { Object.assign(extra, map); fragments = null; }

let fragments: [string, string][] | null = null;
const frags = () => fragments ??= Object.entries({ ...EN, ...extra }).filter(([k]) => k.length >= 3).sort((a, b) => b[0].length - a[0].length);

/** translate one Japanese string (returns it unchanged when there is nothing to do) */
export function tr(s: string): string {
  if (lang !== 'en' || !JP.test(s)) return s;
  const lead = s.match(/^\s*/)![0], tail = s.match(/\s*$/)![0], core = s.trim();
  const exact = EN[core] ?? extra[core];
  if (exact !== undefined) return lead + exact + tail;
  let out = core;
  for (const [re, rep] of EN_PATTERNS) out = out.replace(re, rep as string);
  if (JP.test(out)) for (const [k, v] of frags()) if (out.includes(k)) { out = out.split(k).join(v); if (!JP.test(out)) break; }
  out = out.replace(/\s*・\s*/g, ' · '); // Japanese middle dots between translated words
  return lead + out + tail;
}

// ---- DOM
const origText = new WeakMap<Text, string>();
const origAttr = new WeakMap<Element, Record<string, string>>();
const ATTRS = ['title', 'placeholder', 'aria-label'];
let busy = false;

function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { translateText(root as Text); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (el.closest('[data-no-i18n]')) return;
  translateAttrs(el);
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) translateText(n as Text);
    else { const e = n as Element; if (e.tagName === 'SCRIPT' || e.tagName === 'STYLE') continue; translateAttrs(e); }
  }
}
function translateText(t: Text) {
  const p = t.parentElement;
  if (!p || p.closest('[data-no-i18n], textarea, script, style')) return;
  const cur = t.data;
  if (!JP.test(cur)) return;
  const out = tr(cur);
  if (out !== cur) { origText.set(t, cur); t.data = out; }
}
function translateAttrs(e: Element) {
  for (const a of ATTRS) {
    const v = e.getAttribute(a);
    if (!v || !JP.test(v)) continue;
    const out = tr(v);
    if (out !== v) { const o = origAttr.get(e) ?? {}; o[a] ??= v; origAttr.set(e, o); e.setAttribute(a, out); }
  }
}
function restoreTree(root: Element) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n: Node | null = root; n; n = w.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) { const o = origText.get(n as Text); if (o !== undefined) { (n as Text).data = o; origText.delete(n as Text); } }
    else { const o = origAttr.get(n as Element); if (o) { for (const [a, v] of Object.entries(o)) (n as Element).setAttribute(a, v); origAttr.delete(n as Element); } }
  }
}

const observer = new MutationObserver((muts) => {
  if (lang !== 'en' || busy) return;
  busy = true;
  try {
    for (const m of muts) {
      if (m.type === 'characterData') translateText(m.target as Text);
      else if (m.type === 'attributes') translateAttrs(m.target as Element);
      else m.addedNodes.forEach((n) => translateTree(n));
    }
  } finally { busy = false; }
});

const listeners: (() => void)[] = [];
/** called after the language changes (redraw canvases, theme names…) */
export function onLangChange(fn: () => void) { listeners.push(fn); }

export function applyLang() {
  document.documentElement.lang = lang;
  busy = true;
  try { if (lang === 'en') translateTree(document.body); else restoreTree(document.body); } finally { busy = false; }
  observer.disconnect();
  if (lang === 'en') observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  document.querySelectorAll<HTMLElement>('[data-lang-toggle]').forEach((b) => { b.textContent = lang === 'en' ? '日本語' : 'English'; b.title = lang === 'en' ? '日本語に切り替え' : 'Switch to English'; });
  listeners.forEach((f) => f());
}

export function setLang(l: Lang) {
  lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* storage blocked */ }
  applyLang();
}
export const toggleLang = () => setLang(lang === 'en' ? 'ja' : 'en');
