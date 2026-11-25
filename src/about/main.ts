/**
 * About page: runs the real analysis / scene planner / A-life code on a synthetic demo song
 * (or the visitor's own file) and draws the graphs. Nothing is ever played through the speakers.
 */
import { AFPS, NBANDS, computeFeatures, computeStructure, type Analysis } from '../analysis/analyze';
import { createFrame, sampleFrame } from '../core/frame';
import { defaultParams, type RenderEnv, type TemplateInstance } from '../core/template';
import { TEMPLATES } from '../templates/index';
import { planScenes, THEME_ENERGY } from '../app/scenes';
import { chaosState, chaosWeb, planChaos, type ChaosPlan } from '../app/chaos';
import { drawEcoChart } from '../ui/ecoChart';
import { demoSong } from '../core/demo';
import { decodeAudioFile } from '../core/decode';
import { applyLang, isEn, onLangChange, toggleLang } from '../ui/i18n';
import { ABOUT_EN } from './en';

const tname = (id: string) => { const d = TEMPLATES.find((x) => x.id === id); return d ? (isEn() ? d.nameEn : d.name) : id; };

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const SR = 22050;
const SEC_COL = ['#4fb3ff', '#ffd23f', '#ff5fa2', '#9b7bff'];

async function decodeFile(f: File): Promise<Float32Array> {
  const buf = await f.arrayBuffer();
  const ab = await decodeAudioFile(buf);
  const off = new OfflineAudioContext(1, Math.ceil(ab.duration * SR), SR);
  const src = off.createBufferSource(); src.buffer = ab; src.connect(off.destination); src.start();
  return (await off.startRendering()).getChannelData(0); // offline: rendered to memory, not to the speakers
}

// ------------------------------------------------------------ canvas helpers
function setup(cv: HTMLCanvasElement) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  g.font = '10px "M PLUS Rounded 1c", sans-serif';
  return { g, W, H };
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function timeAxis(g: CanvasRenderingContext2D, W: number, H: number, dur: number, x0 = 0) {
  g.fillStyle = 'rgba(255,255,255,.55)'; g.textBaseline = 'bottom';
  const step = dur > 150 ? 30 : dur > 60 ? 15 : 5;
  for (let s = 0; s < dur; s += step) g.fillText(mmss(s), x0 + (s / dur) * (W - x0) + 3, H - 2);
}
function sectionBg(g: CanvasRenderingContext2D, A: Analysis, W: number, H: number, alpha = 0.16) {
  for (const s of A.sections) {
    g.fillStyle = SEC_COL[s.type]; g.globalAlpha = alpha;
    g.fillRect((s.start / A.duration) * W, 0, ((s.end - s.start) / A.duration) * W, H);
  }
  g.globalAlpha = 1;
}

function drawBands(A: Analysis) {
  const { g, W, H } = setup($('g-bands'));
  sectionBg(g, A, W, H);
  const top = H * 0.3;
  // loudness
  g.beginPath(); g.moveTo(0, top);
  for (let x = 0; x < W; x++) { const i = Math.floor((x / W) * A.n); g.lineTo(x, top - A.rms[i] * (top - 8)); }
  g.lineTo(W, top); g.closePath(); g.fillStyle = 'rgba(46,196,182,.85)'; g.fill();
  // band heat
  const bh = (H - top - 16) / NBANDS;
  for (let x = 0; x < W; x += 2) {
    const i = Math.floor((x / W) * A.n);
    for (let b = 0; b < NBANDS; b++) {
      const v = A.bands[i * NBANDS + b];
      g.fillStyle = `hsl(${260 - v * 240}, 90%, ${8 + v * 58}%)`;
      g.fillRect(x, top + 4 + (NBANDS - 1 - b) * bh, 2, bh + 0.5);
    }
  }
  timeAxis(g, W, H, A.duration);
}

function drawOnset(A: Analysis) {
  const { g, W, H } = setup($('g-onset'));
  const d0 = A.sections.find((s) => s.type === 2)?.start ?? A.duration * 0.3;
  const t0 = Math.max(0, d0 - 0.5), t1 = Math.min(A.duration, t0 + 8);
  const X = (t: number) => ((t - t0) / (t1 - t0)) * W;
  const bar = 60 / A.bpm;
  // beats
  A.beats.forEach((b, k) => {
    if (b < t0 || b > t1) return;
    const down = ((k - A.downbeat) % 4 + 4) % 4 === 0;
    g.fillStyle = down ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.18)';
    g.fillRect(X(b) - (down ? 1 : 0.5), 0, down ? 2 : 1, H);
  });
  const curve = (arr: Float32Array, col: string, fill = false, scale = 1) => {
    let mx = 1e-6; for (let i = Math.floor(t0 * AFPS); i < t1 * AFPS; i++) mx = Math.max(mx, arr[i] ?? 0);
    g.beginPath(); g.moveTo(0, H - 14);
    for (let x = 0; x <= W; x++) { const i = Math.floor((t0 + (x / W) * (t1 - t0)) * AFPS); g.lineTo(x, H - 14 - ((arr[i] ?? 0) / mx) * (H - 30) * scale); }
    if (fill) { g.lineTo(W, H - 14); g.fillStyle = col; g.fill(); } else { g.strokeStyle = col; g.lineWidth = 1.6; g.stroke(); }
  };
  curve(A.onset, 'rgba(255,255,255,.18)', true);
  curve(A.hat, '#00c8e6', false, 0.5);
  curve(A.snare, '#ffb84d', false, 0.8);
  curve(A.kick, '#ff3d7f');
  g.fillStyle = 'rgba(255,255,255,.55)'; g.textBaseline = 'bottom';
  for (let s = Math.ceil(t0); s < t1; s++) g.fillText(mmss(s), X(s) + 3, H - 2);
  g.textBaseline = 'top'; g.fillText(`${A.bpm.toFixed(1)} BPM ・ ${isEn() ? '1 beat' : '1拍'} ${(bar * 1000).toFixed(0)} ms`, 8, 6);
}

function drawTempo(A: Analysis) {
  const { g, W, H } = setup($('g-tempo'));
  // same scoring as estimateTempo: autocorrelation + harmonic reinforcement + log-normal prior
  const on = A.onset, n = on.length;
  const maxLag = Math.ceil((60 / 50) * AFPS * 4) + 2;
  const ac = new Float32Array(maxLag);
  for (let lag = 1; lag < maxLag; lag++) { let s = 0; for (let i = 0; i + lag < n; i++) s += on[i] * on[i + lag]; ac[lag] = s / (n - lag); }
  const acAt = (lag: number) => { const i = Math.floor(lag), f = lag - i; return i + 1 < maxLag ? ac[i] * (1 - f) + ac[i + 1] * f : 0; };
  const score = (bpm: number) => {
    const lag = (60 / bpm) * AFPS;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120), 2));
    return (acAt(lag) + 0.5 * acAt(lag * 2) + 0.25 * acAt(lag * 4)) * (0.35 + 0.65 * prior);
  };
  const lo = 60, hi = 200, ys: number[] = [];
  for (let x = 0; x <= W; x++) ys.push(score(lo + (x / W) * (hi - lo)));
  const mx = Math.max(...ys), mn = Math.min(...ys);
  const Y = (v: number) => H - 16 - ((v - mn) / (mx - mn || 1)) * (H - 30);
  g.beginPath(); g.moveTo(0, H - 16); ys.forEach((v, x) => g.lineTo(x, Y(v))); g.lineTo(W, H - 16);
  g.fillStyle = 'rgba(155,123,255,.35)'; g.fill();
  g.beginPath(); ys.forEach((v, x) => (x ? g.lineTo(x, Y(v)) : g.moveTo(x, Y(v)))); g.strokeStyle = '#b9a6ff'; g.lineWidth = 1.5; g.stroke();
  const bx = ((A.bpm - lo) / (hi - lo)) * W;
  g.fillStyle = '#ff5fa2'; g.fillRect(bx - 1, 0, 2, H - 14);
  g.font = '700 12px "M PLUS Rounded 1c", sans-serif'; g.textBaseline = 'top';
  g.fillText(`${A.bpm.toFixed(1)} BPM`, Math.min(W - 80, bx + 6), 6);
  const alt = A.bpm * 2 <= hi ? A.bpm * 2 : A.bpm / 2;
  const ax = ((alt - lo) / (hi - lo)) * W;
  g.strokeStyle = '#ffd23f'; g.setLineDash([4, 4]); g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(ax, 0); g.lineTo(ax, H - 14); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#ffd23f'; g.font = '700 11px "M PLUS Rounded 1c", sans-serif';
  g.fillText(`${alt > A.bpm ? '×2' : '÷2'} = ${alt.toFixed(1)}`, Math.min(W - 80, ax + 6), 24);
  g.font = '10px "M PLUS Rounded 1c", sans-serif'; g.fillStyle = 'rgba(255,255,255,.55)'; g.textBaseline = 'bottom';
  for (let b = 60; b <= 200; b += 20) g.fillText(String(b), ((b - lo) / (hi - lo)) * W + 2, H - 2);
}

function drawStruct(A: Analysis) {
  const { g, W, H } = setup($('g-struct'));
  for (const s of A.sections) {
    g.fillStyle = SEC_COL[s.type]; g.globalAlpha = 0.85;
    g.fillRect((s.start / A.duration) * W + 1, H - 30, ((s.end - s.start) / A.duration) * W - 2, 14);
  }
  g.globalAlpha = 1;
  const lineOf = (arr: Float32Array, col: string, smooth = 0) => {
    g.beginPath();
    for (let x = 0; x <= W; x++) {
      const c = Math.floor((x / W) * A.n);
      let v = 0, k = 0; for (let i = Math.max(0, c - smooth); i <= Math.min(A.n - 1, c + smooth); i++) { v += arr[i]; k++; }
      const y = H - 36 - (v / k) * (H - 46);
      x ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.strokeStyle = col; g.lineWidth = 2; g.stroke();
  };
  lineOf(A.rms, '#2ec4b6', 60);
  lineOf(A.build, '#ffb84d');
  lineOf(A.drop, '#ff3d7f');
  timeAxis(g, W, H, A.duration);
}

function drawScenes(A: Analysis) {
  const { g, W, H } = setup($('g-scenes'));
  const pool: Record<string, number> = {}; TEMPLATES.forEach((d) => (pool[d.id] = 1));
  const sc = planScenes(A, pool, 3);
  for (const s of sc) {
    const x = (s.start / A.duration) * W, w = ((s.end - s.start) / A.duration) * W;
    const e = THEME_ENERGY[s.tpl] ?? 0.5;
    g.fillStyle = `hsl(${220 - e * 220}, 80%, ${42 + e * 10}%)`;
    g.fillRect(x + 1, 10, w - 2, H - 38);
    g.save(); g.beginPath(); g.rect(x + 1, 10, w - 2, H - 38); g.clip();
    g.fillStyle = '#fff'; g.font = '700 11px "M PLUS Rounded 1c", sans-serif'; g.textBaseline = 'top';
    g.fillText(tname(s.tpl), x + 5, 15);
    g.font = '10px "M PLUS Rounded 1c", sans-serif'; g.globalAlpha = 0.75; g.fillText(s.trans, x + 5, 31);
    g.restore();
  }
  g.globalAlpha = 1;
  timeAxis(g, W, H, A.duration);
}

function drawTree(p: ChaosPlan, dur: number) {
  const { g, W, H } = setup($('g-tree'));
  const ev = p.nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.kind === 'theme' || n.kind === 'asset' || n.kind === 'word');
  // order rows by lineage (depth-first from the roots) so families stay together
  const kids = new Map<number, number[]>();
  ev.forEach(({ n, i }) => { const k = kids.get(n.parent) ?? []; k.push(i); kids.set(n.parent, k); });
  const order: number[] = [];
  const kindRank = { theme: 0, asset: 1, word: 2 } as Record<string, number>;
  const roots = (kids.get(-1) ?? []).filter((i) => kindRank[p.nodes[i].kind] !== undefined).sort((a, b) => kindRank[p.nodes[a].kind] - kindRank[p.nodes[b].kind]);
  const visit = (i: number) => { order.push(i); (kids.get(i) ?? []).forEach(visit); };
  roots.forEach(visit);
  const row = new Map<number, number>(); order.forEach((i, r) => row.set(i, r));
  const rh = (H - 22) / Math.max(1, order.length);
  const X = (t: number) => 4 + (Math.min(t, dur) / dur) * (W - 8);
  const col = { theme: '#ff3d7f', asset: '#ffb84d', word: '#00c8e6' } as Record<string, string>;
  for (const e of p.events) if (e.kind === 'extinction') { g.fillStyle = 'rgba(255,42,42,.35)'; g.fillRect(X(e.t) - 0.75, 0, 1.5, H - 16); }
  g.lineWidth = Math.max(1, Math.min(3, rh * 0.7));
  for (const i of order) {
    const n = p.nodes[i], y = 4 + row.get(i)! * rh + rh / 2;
    if (n.parent >= 0 && row.has(n.parent)) {
      const py = 4 + row.get(n.parent)! * rh + rh / 2;
      g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(X(n.born), py); g.lineTo(X(n.born), y); g.stroke();
      g.lineWidth = Math.max(1, Math.min(3, rh * 0.7));
    }
    g.strokeStyle = col[n.kind];
    g.beginPath(); g.moveTo(X(n.born), y); g.lineTo(X(Number.isFinite(n.died) ? n.died : dur), y); g.stroke();
  }
  timeAxis(g, W, H, dur);
}

// ------------------------------------------------------------ live network view
let netRAF = 0;
function playNet(p: ChaosPlan, A: Analysis) {
  cancelAnimationFrame(netRAF);
  const cv = $<HTMLCanvasElement>('g-net');
  const label = $('nettime');
  const t0 = performance.now();
  const col = { theme: '#ff3d7f', asset: '#ffb84d', word: '#00e5ff', mask: '#9b7bff', fx: '#ffffff' } as Record<string, string>;
  const fr = createFrame();
  const frame = () => {
    netRAF = requestAnimationFrame(frame);
    const r = cv.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    const { g, W, H } = setup(cv);
    const t = ((performance.now() - t0) / 1000) % A.duration;
    sampleFrame(A, t, fr);
    const st = chaosState(p, t);
    const sx = W / p.aspect;
    g.fillStyle = '#0b0d18'; g.fillRect(0, 0, W, H);
    for (const [i, j, w] of chaosWeb(p, t)) {
      const v = Math.min(st.a[i], st.a[j]) * 0.8 + 0.1;
      if (!st.a[i] && !st.a[j]) continue;
      g.globalAlpha = Math.min(0.9, v); g.strokeStyle = w > 0 ? 'rgba(143,240,229,1)' : 'rgba(255,120,160,1)';
      g.lineWidth = Math.min(3, Math.abs(w)); g.setLineDash(w > 0 ? [] : [3, 4]);
      g.beginPath(); g.moveTo(st.xy[i * 2] * sx, st.xy[i * 2 + 1] * H); g.lineTo(st.xy[j * 2] * sx, st.xy[j * 2 + 1] * H); g.stroke();
    }
    g.setLineDash([]); g.globalAlpha = 1;
    // births / extinctions
    for (const e of p.events) {
      if (e.t > t) break;
      const age = t - e.t; if (age > 1.2) continue;
      if (e.kind === 'extinction') { g.strokeStyle = `rgba(255,42,42,${1 - age / 1.2})`; g.lineWidth = 10; g.strokeRect(0, 0, W, H); }
      else if (e.kind === 'birth') {
        g.strokeStyle = col[p.nodes[e.node].kind]; g.globalAlpha = 1 - age / 1.2; g.lineWidth = 2;
        g.beginPath(); g.arc(st.xy[e.node * 2] * sx, st.xy[e.node * 2 + 1] * H, 6 + age * 60, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
      }
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    p.nodes.forEach((n, i) => {
      if (n.born > t || n.died < t) return;
      const a = st.a[i], x = st.xy[i * 2] * sx, y = st.xy[i * 2 + 1] * H;
      const rad = 2.5 + a * (n.kind === 'theme' ? 22 : 12);
      g.fillStyle = col[n.kind]; g.globalAlpha = 0.25 + a * 0.75;
      g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
      if (n.kind === 'theme' || (n.kind === 'word' && a > 0.4)) {
        g.globalAlpha = 0.5 + a * 0.5; g.fillStyle = '#fff';
        g.font = `${n.kind === 'theme' ? 700 : 500} ${n.kind === 'theme' ? 11 : 10}px "M PLUS Rounded 1c", sans-serif`;
        g.fillText(n.kind === 'theme' ? `${tname(n.id)}${n.gen ? ` ·G${n.gen}` : ''}` : n.label, x, y + rad + 8);
      }
    });
    g.globalAlpha = 1; g.textAlign = 'left';
    const alive = p.nodes.filter((n) => n.born <= t && n.died > t && (n.kind === 'theme' || n.kind === 'word' || n.kind === 'asset')).length;
    label.textContent = `${mmss(t)} / ${mmss(A.duration)}　${isEn() ? 'alive' : '個体'} ${alive}　${['INTRO', 'BUILD', 'DROP', 'OUTRO'][A.sections[fr.sectionIndex]?.type ?? 0]}`;
  };
  frame();
}

// ------------------------------------------------------------ theme stills + hero
const META = { title: 'DEMO', artist: '', username: '', cover: null, avatar: null };
async function gallery(A: Analysis) {
  const el = $('gallery'); el.innerHTML = '';
  const at = (A.sections.find((s) => s.type === 2)?.start ?? A.duration * 0.3) + 1.2;
  const fr = sampleFrame(A, at, createFrame());
  for (const d of TEMPLATES) {
    const cell = document.createElement('div'); cell.className = 'shot';
    cell.innerHTML = `<span data-tpl="${d.id}">${tname(d.id)}</span>`;
    el.append(cell);
  }
  for (const [k, d] of TEMPLATES.entries()) {
    await new Promise((r) => setTimeout(r, 30));
    try {
      const env: RenderEnv = { width: 384, height: 216, seed: 1234 + k, params: defaultParams(d), meta: META, analysis: A };
      const ti = d.create(env);
      ti.render(at, fr);
      const c = document.createElement('canvas'); c.width = 384; c.height = 216;
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = !ti.pixelated;
      g.drawImage(ti.canvas, 0, 0, 384, 216);
      ti.dispose();
      const img = new Image(); img.alt = d.name; img.src = c.toDataURL('image/jpeg', 0.82);
      el.children[k].prepend(img);
    } catch (e) { console.warn('still', d.id, e); }
  }
}

let heroRAF = 0;
function hero(A: Analysis) {
  cancelAnimationFrame(heroRAF);
  const cv = $<HTMLCanvasElement>('hero');
  const W = 960, H = 540;
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  const pool: Record<string, number> = {}; TEMPLATES.forEach((d) => (pool[d.id] = 1));
  const scenes = planScenes(A, pool, 11);
  let cur: { id: string; inst: TemplateInstance } | null = null;
  const fr = createFrame();
  const t0 = performance.now();
  const frame = () => {
    heroRAF = requestAnimationFrame(frame);
    if (cv.getBoundingClientRect().bottom < 0) return;
    const t = ((performance.now() - t0) / 1000) % A.duration;
    const s = scenes.find((x) => t >= x.start && t < x.end) ?? scenes[0];
    const key = `${s.tpl}|${s.seed}`;
    if (!cur || cur.id !== key) {
      cur?.inst.dispose();
      const d = TEMPLATES.find((x) => x.id === s.tpl) ?? TEMPLATES[0];
      cur = { id: key, inst: d.create({ width: W, height: H, seed: s.seed, params: defaultParams(d), meta: META, analysis: A }) };
    }
    sampleFrame(A, t, fr);
    cur.inst.render(t, fr);
    g.imageSmoothingEnabled = !cur.inst.pixelated;
    g.drawImage(cur.inst.canvas, 0, 0, W, H);
  };
  frame();
}

// ------------------------------------------------------------ run
async function run(mono: Float32Array) {
  const loading = $('loading');
  loading.classList.remove('done'); loading.textContent = isEn() ? 'Analyzing…' : '解析中…';
  await new Promise((r) => setTimeout(r, 30));
  const F = computeFeatures(mono, SR);
  const A: Analysis = { ...F, ...computeStructure(F) };
  drawBands(A); drawOnset(A); drawTempo(A); drawStruct(A); drawScenes(A);
  const plan = planChaos({ enabled: true, seed: 20261124, level: 1.1, evolve: 1.2 }, {
    A, themes: TEMPLATES.map((d) => d.id), assets: 3, words: ['NEW SINGLE', '夜の東京を泳ぐ', '12.24 配信'],
    colors: ['#ff3d7f', '#00e5ff', '#ffe066', '#ffffff'], aspect: 16 / 9,
  });
  drawEcoChart($<HTMLCanvasElement>('g-eco'), plan, { dark: true, labels: true });
  drawTree(plan, A.duration);
  playNet(plan, A);
  hero(A);
  loading.classList.add('done');
  void gallery(A);
  let rt = 0;
  redraw = () => { drawOnset(A); drawScenes(A); drawEcoChart($<HTMLCanvasElement>('g-eco'), plan, { dark: true, labels: true }); };
  window.onresize = () => { clearTimeout(rt); rt = window.setTimeout(() => {
    drawBands(A); drawOnset(A); drawTempo(A); drawStruct(A); drawScenes(A); drawTree(plan, A.duration);
    drawEcoChart($<HTMLCanvasElement>('g-eco'), plan, { dark: true, labels: true });
  }, 200); };
}

$<HTMLInputElement>('tryfile').onchange = async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  $('demo-note').textContent = isEn() ? `Redrawn with “${f.name}” (no sound is played; the file is not uploaded anywhere).` : `「${f.name}」で描き直しました（音は鳴りません。ファイルはどこにも送信されません）。`;
  try { await run(await decodeFile(f)); } catch (err) { $('loading').textContent = (isEn() ? 'Could not read the file: ' : '読み込めませんでした: ') + (err as Error).message; }
};

// ---- language: every text block has an English version (data-t → ABOUT_EN); canvases are redrawn
let redraw: (() => void) | null = null;
function swapLang() {
  document.title = isEn() ? 'How VJ STUDIO works' : 'VJ STUDIO のしくみ';
  document.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => {
    const en = ABOUT_EN[el.dataset.t!];
    if (en === undefined) return;
    if (el.dataset.ja === undefined) el.dataset.ja = el.innerHTML;
    el.innerHTML = isEn() ? en : el.dataset.ja;
  });
  document.querySelectorAll<HTMLElement>('.gallery span[data-tpl]').forEach((sp) => (sp.textContent = tname(sp.dataset.tpl!)));
  redraw?.();
}
document.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => el.setAttribute('data-no-i18n', ''));
onLangChange(swapLang);
document.querySelectorAll<HTMLElement>('[data-lang-toggle]').forEach((b) => (b.onclick = () => toggleLang()));
applyLang();

document.fonts?.ready.then(() => run(demoSong()));
