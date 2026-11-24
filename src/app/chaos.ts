/**
 * SUPER SLOT — emergent chaos network.
 *
 * Every element is a NODE in a small recurrent network:
 *   themes · masks · whole-frame FX · user photos/videos/icon · words
 * Each node has its own random "ear" (sensitivity to kick / snare / hats / bass / mids / highs /
 * loudness / build / drop), a threshold, and fatigue (habituation). Nodes are wired to each other
 * with excitatory and inhibitory links, and the links slowly LEARN (Hebbian: nodes that fire
 * together wire together; stronger during drops). Positions follow a force layout driven by the
 * same links (friends attract, rivals repel, kicks blow everything outward).
 *
 * The whole network is simulated ahead of time against the song analysis (20 steps/s), so what
 * you see — which two themes fight for the screen, which mask cuts them, which photos and words
 * surface, where they drift, when the frame inverts or mirrors — emerges from the interaction,
 * stays in sync with the music, and is exactly reproducible for seeking and export.
 */
import type { Analysis } from '../analysis/analyze';
import { fontCss, type FontId } from '../core/fonts';
import { createFrame, sampleFrame, type Frame } from '../core/frame';
import { mulberry32, type RNG } from '../core/rng';
import { THEME_ENERGY } from './scenes';

export interface ChaosOptions {
  enabled: boolean; seed: number; level: number /* 0.3..1.6 */; evolve?: number /* 0.3..2.5 */;
  /** recorded manual re-roll moments (s): at each one the whole ecosystem is replaced at once */
  taps?: number[];
  /** snap recorded taps to the nearest beat */
  snap?: boolean;
}
export const defaultChaos = (): ChaosOptions => ({ enabled: false, seed: 1, level: 1, evolve: 1, taps: [], snap: true });

export type Comp = 'source-over' | 'screen' | 'difference' | 'multiply' | 'lighter' | 'exclusion' | 'overlay';
export type Kind = 'theme' | 'mask' | 'fx' | 'asset' | 'word';
export type FxKind = 'mirrorX' | 'mirrorY' | 'kaleido' | 'invert' | 'posterize' | 'hue' | 'strobe';
type Mode = 'big' | 'marquee' | 'vertical' | 'scatter' | 'stretch' | 'tile';

/** one organism (or a fixed "organ" for masks / fx). Its visual traits are its phenotype. */
export interface NodeMeta {
  kind: Kind;
  id: string;          // theme id / fx kind / word text / asset index
  label: string;
  comp: Comp; font: FontId; color: string; mode: Mode;
  crop: [number, number, number, number]; seed: number; mask?: number; asset?: number;
  born: number; died: number;   // seconds (died = Infinity while alive at the end)
  gen: number; parent: number;  // lineage
  pref: number;                 // themes: preferred loudness (0 calm .. 1 wild) — a gene
}
export interface EcoSample {
  t: number; theme: number; word: number; asset: number; gen: number; energy: number; species: number; births: number; deaths: number;
  /** mean ear of the living population, per feature (what the ecosystem currently "listens" to) */
  ear: number[];
}
export interface ChaosPlan {
  nodes: NodeMeta[];
  edges: [number, number, number][];
  /** the web as it was at different moments (it rewires irreversibly) */
  webs: { t: number; edges: [number, number, number][] }[];
  events: { t: number; kind: 'birth' | 'death' | 'extinction'; node: number }[];
  /** ecosystem statistics every 0.5 s */
  eco: EcoSample[];
  dt: number; steps: number;
  /** packed per-step state of the living: off[s]..off[s+1] index into idx / act / xy */
  off: Uint32Array; idx: Uint16Array; act: Float32Array; xy: Float32Array;
  aspect: number;
  /** the seed the plan was made from */
  seed: number;
  /** how loose the curator is (0 = strict and clean .. 1 = everything at once) */
  k: number;
  /** the CURATED screen per step — what is actually shown */
  screen: {
    a: Int16Array; b: Int16Array; p: Float32Array; tr: Uint8Array; // theme A, theme B, B amount, transition/mask id
    fx: Int8Array; fxAmt: Float32Array;                               // one whole-frame effect at a time
    hit: Float32Array;                                                // manual re-roll impact (1 at the tap, decays)
    voff: Uint32Array; vidx: Uint16Array; vpres: Float32Array; vslot: Int8Array; // visible photos / words, their fade and slot
  };
}

export const FEATURES = ['kick', 'snare', 'hat', 'energy', 'bass', 'mid', 'high', 'build', 'drop'] as const;
const PHRASES = [
  'ここはどこ', 'まだ夢の中', 'LOADING...', 'NO SIGNAL', '404', 'おかえり', 'いつかの夏', 'WELCOME BACK', '▶︎ PLAY', '∞',
  'ERROR', '接続中…', '夜が明けない', 'REC ●', 'またね', 'ねむれない', '記憶の外側', 'SYSTEM', '???', 'あなたはだれ',
  '巻き戻せない', 'もう戻れない', 'さっきまでの世界', 'UPDATE', '書き換え中', '昨日の続き', 'TIME LEAK', '置いていかないで',
  '消えていく', 'NEW WORLD', '遠くなる', '0:00', '再起動', 'ここから先', 'ENDLESS', 'まだ終わらない',
];
const FONT_IDS: FontId[] = ['gothic', 'maru', 'mincho', 'dot', 'heavy', 'pop', 'marker', 'sf'];
const COMPS: Comp[] = ['source-over', 'screen', 'difference', 'multiply', 'lighter', 'exclusion', 'overlay'];
const FX: FxKind[] = ['mirrorX', 'mirrorY', 'kaleido', 'invert', 'posterize', 'hue', 'strobe'];
const MODES: readonly Mode[] = ['big', 'marquee', 'vertical', 'scatter', 'stretch', 'tile'];
const pick = <T>(r: RNG, a: readonly T[]) => a[Math.floor(r() * a.length)];
const sig = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const gauss = (r: RNG) => (r() + r() + r() - 1.5) * 1.15;
/** an ear has a fixed total budget: listening hard to one thing means ignoring others (specialist vs generalist) */
const EAR_BUDGET = 6;
function budget(ear: Float32Array, i: number) {
  let s = 0;
  for (let f = 0; f < 9; f++) s += Math.abs(ear[i * 9 + f]);
  if (s > EAR_BUDGET) for (let f = 0; f < 9; f++) ear[i * 9 + f] *= EAR_BUDGET / s;
}

export interface ChaosInput {
  A: Analysis; themes: string[]; assets: number; words: string[]; colors: string[]; aspect: number;
}

const MAX_NODES = 1200;

// ---- colour helpers (for per-section "climates")
function hexToHsl(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(hh * 60 + 360) % 360, s, l];
}
function hsl(h: number, s: number, l: number) {
  return `hsl(${Math.round(((h % 360) + 360) % 360)}, ${Math.round(Math.max(0, Math.min(1, s)) * 100)}%, ${Math.round(Math.max(0, Math.min(1, l)) * 100)}%)`;
}
/** composition slots (x as a fraction of the width, y of the height): four corners around the centre icon, top/bottom bands, side columns */
export const SLOTS: [number, number][] = [[0.17, 0.3], [0.83, 0.3], [0.17, 0.72], [0.83, 0.72], [0.5, 0.12], [0.5, 0.9], [0.06, 0.5], [0.94, 0.5]];
interface Climate { colors: string[]; fonts: FontId[]; comps: Comp[] }
/** a coherent look for one era: an anchor colour from the user's palette, its harmony, and two fonts */
function makeClimate(r: RNG, colors: string[], k: number, energy: number): Climate {
  const pool = colors.filter((c) => /^#/.test(c) && hexToHsl(c)[1] > 0.25);
  const [h0, s0] = hexToHsl(pool.length ? pick(r, pool) : '#00e5ff');
  const sat = Math.max(0.55, s0);
  const scheme = pick(r, ['analog', 'comp', 'triad', 'mono'] as const);
  const hues = scheme === 'analog' ? [h0, h0 + 28, h0 - 28] : scheme === 'comp' ? [h0, h0 + 180, h0 + 15] : scheme === 'triad' ? [h0, h0 + 120, h0 + 240] : [h0, h0, h0];
  const cols = [hsl(hues[0], sat, 0.62), hsl(hues[1], sat * 0.9, 0.7), hsl(hues[2], sat * 0.8, scheme === 'mono' ? 0.85 : 0.55), '#ffffff'];
  // calm eras prefer soft type, loud eras heavy / pixel / sci-fi type
  const calmF: FontId[] = ['mincho', 'maru', 'gothic', 'marker'], loudF: FontId[] = ['heavy', 'dot', 'sf', 'pop', 'gothic'];
  const fp = energy > 0.5 ? loudF : calmF;
  const f1 = pick(r, fp); let f2 = pick(r, FONT_IDS); if (f2 === f1) f2 = pick(r, FONT_IDS);
  const comps: Comp[] = k < 0.6 ? ['source-over', 'source-over', 'screen', 'lighter'] : k < 0.9 ? ['source-over', 'screen', 'lighter', 'overlay', 'difference'] : COMPS;
  return { colors: cols, fonts: [f1, f1, f2], comps };
}
const F = 9;

/**
 * Artificial-life simulation over the whole song.
 *
 * GENOME (per organism): an "ear" (9 weights over kick / snare / hat / energy / bass / mid / high /
 *   build / drop), threshold, reaction time, lifespan, fertility, and for themes a loudness
 *   preference; plus a PHENOTYPE (blend mode, font, colour, motion mode, crop) that is what you see.
 * METABOLISM: the music is food. Every feature is a resource that the organisms of one kind share
 *   in proportion to how strongly they listen to it (niche competition). Being on screen costs
 *   energy. Starved organisms die; old ones die; drops cause mass extinctions.
 * REPRODUCTION: an organism with enough energy splits — the child gets half the energy and a mutated
 *   genome; if a bonded partner of the same kind is nearby, the genomes cross over. When the niche
 *   is full the child displaces the weakest. Theme children may speciate into a different theme.
 * NETWORK: organisms excite / inhibit each other through links that are inherited, learn
 *   (Hebbian) and drift. Activation decides what is visible; positions follow a force layout.
 * Everything is irreversible: the dead never return, mutations accumulate, entropy rises, so the
 * population tracks the song and its end is a different world from its beginning. Deterministic
 * for a seed, so seeking and export match the preview.
 */
export function planChaos(o: ChaosOptions, inp: ChaosInput): ChaosPlan {
  const r = mulberry32(o.seed * 9973 + 17);
  const L = Math.max(0.2, o.level);
  const EV = Math.max(0.2, o.evolve ?? 1);
  const kC = clamp((L - 0.3) / 1.3, 0, 1);
  const A = inp.A;
  const dur = Math.max(1, A.duration);
  const nAssets = Math.min(8, inp.assets);
  const userWords = [...new Set(inp.words.filter(Boolean))].slice(0, 24);
  const wordPool = [...userWords, ...PHRASES];
  const usedWord = new Map<string, number>();
  const usedTheme = new Map<string, number>();

  // ---- genome storage (flat arrays, one slot per organism ever born)
  const nodes: NodeMeta[] = [];
  const ear = new Float32Array(MAX_NODES * F);
  const thr = new Float32Array(MAX_NODES), tau = new Float32Array(MAX_NODES), life = new Float32Array(MAX_NODES);
  const fert = new Float32Array(MAX_NODES);
  const energy = new Float32Array(MAX_NODES), age = new Float32Array(MAX_NODES), novelty = new Float32Array(MAX_NODES);
  const a = new Float32Array(MAX_NODES), hab = new Float32Array(MAX_NODES);
  const px = new Float32Array(MAX_NODES), py = new Float32Array(MAX_NODES), vx = new Float32Array(MAX_NODES), vy = new Float32Array(MAX_NODES);
  const dying = new Uint8Array(MAX_NODES);
  const links = new Map<number, number>(); // key i*MAX+j -> weight (sparse)
  const K = (i: number, j: number) => i * MAX_NODES + j;
  const getW = (i: number, j: number) => links.get(K(i, j)) ?? 0;
  const setW = (i: number, j: number, w: number) => { if (Math.abs(w) < 0.02) links.delete(K(i, j)); else links.set(K(i, j), clamp(w, -2, 2)); };
  const evolving = (k: Kind) => k === 'theme' || k === 'word' || k === 'asset';
  const rival = (i: number, j: number) => nodes[i].kind === nodes[j].kind && (nodes[i].kind === 'theme' || nodes[i].kind === 'mask');

  let live: number[] = [];
  const events: ChaosPlan['events'] = [];
  let birthsAcc = 0, deathsAcc = 0;

  // the current era's climate: newborns take its colours / fonts / blend modes
  let clim: Climate = makeClimate(r, inp.colors, kC, (A.rms[0] ?? 0.2));
  const calmModes: readonly Mode[] = kC < 0.6 ? ['big', 'marquee', 'vertical', 'stretch', 'big'] : MODES;
  const phenotype = (): Pick<NodeMeta, 'comp' | 'font' | 'color' | 'mode' | 'crop' | 'seed'> => ({
    comp: pick(r, clim.comps), font: pick(r, clim.fonts), color: pick(r, clim.colors), mode: pick(r, calmModes),
    crop: (() => { const w = 0.3 + r() * 0.7, h = 0.3 + r() * 0.7; return [r() * (1 - w), r() * (1 - h), w, h] as [number, number, number, number]; })(),
    seed: Math.floor(r() * 1e6),
  });
  const lifeOf = (k: Kind) => (k === 'theme' ? 30 + r() * 40 : k === 'word' ? 10 + r() * 20 : k === 'asset' ? 16 + r() * 28 : 1e9) / EV;
  const randomGenome = (i: number) => {
    const k = nodes[i].kind;
    for (let f = 0; f < F; f++) ear[i * F + f] = (r() < 0.5 ? (r() * 2 - 0.4) : 0) * 2.2;
    if (k === 'fx') ear[i * F + 8] += 1.2;
    if (k === 'word') ear[i * F + 1] += 0.8;
    if (k === 'asset') ear[i * F + 0] += 0.8;
    thr[i] = (k === 'fx' ? 2.6 : k === 'theme' ? 0.6 : 1.4) + r() * 0.8;
    tau[i] = 0.25 + r() * 1.2;
    life[i] = lifeOf(k);
    fert[i] = 2.2 + r() * 2;
    budget(ear, i);
  };
  /** create an organism; with parents it inherits (crossover + mutation), otherwise random */
  const spawn = (meta: Omit<NodeMeta, 'born' | 'died' | 'gen' | 'parent'>, t: number, p1 = -1, p2 = -1, e0 = 1.2) => {
    if (nodes.length >= MAX_NODES) return -1;
    const i = nodes.length;
    nodes.push({ ...meta, born: t, died: Infinity, gen: p1 >= 0 ? nodes[p1].gen + 1 : 0, parent: p1 });
    if (p1 < 0) randomGenome(i);
    else {
      const mu = 0.35 * EV; // mutation scale
      for (let f = 0; f < F; f++) {
        const g = p2 >= 0 && r() < 0.5 ? ear[p2 * F + f] : ear[p1 * F + f];
        ear[i * F + f] = clamp(g + (r() < 0.4 ? gauss(r) * mu * 1.5 : 0), -2.5, 4);
      }
      budget(ear, i);
      const mix = (arr: Float32Array, s: number, lo: number, hi: number) => { arr[i] = clamp((p2 >= 0 ? (arr[p1] + arr[p2]) / 2 : arr[p1]) + gauss(r) * s * mu, lo, hi); };
      mix(thr, 0.4, 0.2, 3.5); mix(tau, 0.3, 0.15, 2); mix(fert, 0.6, 1.2, 5);
      life[i] = clamp(life[p1] * (1 + gauss(r) * 0.2 * mu), 4, 1e9);
      // links: inherit the parent's social ties (mutated)
      for (const j of live) {
        if (j === p1) continue;
        if (rival(i, j)) { setW(i, j, -1.1); setW(j, i, -1.1); continue; }
        setW(i, j, getW(p1, j) * 0.8 + (r() < 0.08 ? gauss(r) * 1.2 : 0));
        setW(j, i, getW(j, p1) * 0.8 + (r() < 0.08 ? gauss(r) * 1.2 : 0));
      }
      if (!rival(i, p1)) { setW(i, p1, 0.9); setW(p1, i, 0.9); }
      px[i] = clamp(px[p1] + gauss(r) * 0.12, 0, inp.aspect); py[i] = clamp(py[p1] + gauss(r) * 0.12, 0, 1);
    }
    if (p1 < 0) {
      for (const j of live) {
        if (rival(i, j)) { setW(i, j, -1.1); setW(j, i, -1.1); continue; }
        if (r() < 0.12 * (0.6 + L * 0.5)) setW(i, j, (r() < 0.62 ? 1 : -1) * (0.5 + r() * 1.3));
        if (r() < 0.12 * (0.6 + L * 0.5)) setW(j, i, (r() < 0.62 ? 1 : -1) * (0.5 + r() * 1.3));
      }
      px[i] = r() * inp.aspect; py[i] = r();
    }
    vx[i] = (r() - 0.5) * 0.6; vy[i] = (r() - 0.5) * 0.6;
    energy[i] = e0; novelty[i] = t > 0 ? 1 : 0; a[i] = 0; hab[i] = 0; age[i] = 0;
    live.push(i);
    if (t > 0) { events.push({ t, kind: 'birth', node: i }); birthsAcc++; }
    return i;
  };
  const kill = (i: number, t: number) => { if (dying[i]) return; dying[i] = 1; events.push({ t, kind: 'death', node: i }); deathsAcc++; };

  // ---- offspring phenotypes
  const childTheme = (p: number): Omit<NodeMeta, 'born' | 'died' | 'gen' | 'parent'> => {
    const pref = clamp(nodes[p].pref + gauss(r) * 0.18 * EV, 0, 1);
    let id = nodes[p].id;
    if (r() < 0.65) { // speciation: jump to the theme whose character fits the mutated preference
      const alive = new Set(live.filter((j) => nodes[j].kind === 'theme' && !dying[j]).map((j) => nodes[j].id));
      let best = id, bs = Infinity;
      for (const th of inp.themes) {
        if (alive.has(th)) continue;
        const sc = Math.abs((THEME_ENERGY[th] ?? 0.5) - pref) + (usedTheme.get(th) ?? 0) * 0.25 + r() * 0.3;
        if (sc < bs) { bs = sc; best = th; }
      }
      id = best;
    }
    usedTheme.set(id, (usedTheme.get(id) ?? 0) + 1);
    return { ...nodes[p], ...phenotype(), kind: 'theme', id, label: id, pref };
  };
  const childWord = (p: number): Omit<NodeMeta, 'born' | 'died' | 'gen' | 'parent'> => {
    const n = nodes[p];
    let label = n.label;
    if (r() < 0.5) { // a new word enters the language (least used first)
      let best = label, bs = Infinity;
      for (const w of wordPool) { const sc = (usedWord.get(w) ?? 0) + r() * 0.9 + (userWords.includes(w) ? -0.5 : 0); if (sc < bs) { bs = sc; best = w; } }
      label = best;
    }
    usedWord.set(label, (usedWord.get(label) ?? 0) + 1);
    const ph = phenotype();
    return { ...n, id: label, label, comp: r() < 0.7 ? ph.comp : n.comp, font: r() < 0.7 ? ph.font : n.font, color: r() < 0.7 ? ph.color : n.color, mode: r() < 0.4 ? ph.mode : n.mode, seed: ph.seed };
  };
  const childAsset = (p: number): Omit<NodeMeta, 'born' | 'died' | 'gen' | 'parent'> => {
    const n = nodes[p];
    const asset = r() < 0.3 ? Math.floor(r() * nAssets) : n.asset!;
    const c = n.crop.map((v, k) => clamp(v + gauss(r) * 0.08, k < 2 ? 0 : 0.2, k < 2 ? 0.7 : 1)) as [number, number, number, number];
    const ph = phenotype();
    return { ...n, id: String(asset), label: `asset${asset}`, asset, crop: c, comp: r() < 0.7 ? ph.comp : n.comp, mode: r() < 0.4 ? ph.mode : n.mode, seed: ph.seed };
  };
  const capOf = (k: Kind) => (k === 'theme' ? Math.round(3 + L) : k === 'word' ? 0 /* words are not part of the chaos mode (kept for future use) */ : k === 'asset' ? Math.min(nAssets * 2, 10) : 0);

  // ---- genesis: fixed organs (masks, fx) + a random first population
  for (let m = 6; m <= 10; m++) spawn({ kind: 'mask', id: String(m), label: `mask${m}`, ...phenotype(), mask: m, pref: 0.5 }, 0);
  FX.forEach((f) => spawn({ kind: 'fx', id: f, label: f, ...phenotype(), pref: 0.5 }, 0));
  const e0 = (A.rms[0] ?? 0.2) * 0.6;
  const firstThemes = [...inp.themes].sort((x, y) => Math.abs((THEME_ENERGY[x] ?? 0.5) - e0) - Math.abs((THEME_ENERGY[y] ?? 0.5) - e0) + (r() - 0.5) * 0.6).slice(0, capOf('theme'));
  firstThemes.forEach((th) => { usedTheme.set(th, 1); const i = spawn({ kind: 'theme', id: th, label: th, ...phenotype(), pref: THEME_ENERGY[th] ?? 0.5 }, 0); a[i] = r() * 0.5; });
  for (let c = 0; c < Math.min(nAssets, capOf('asset')); c++) spawn({ kind: 'asset', id: String(c), label: `asset${c}`, ...phenotype(), asset: c, pref: 0.5 }, 0);
  for (let c = 0; c < capOf('word'); c++) {
    const w = c < userWords.length ? userWords[c] : PHRASES[Math.floor(r() * PHRASES.length)];
    usedWord.set(w, (usedWord.get(w) ?? 0) + 1);
    spawn({ kind: 'word', id: w, label: w, ...phenotype(), pref: 0.5 }, 0);
  }

  // ---- simulate
  const dt = 0.05;
  const steps = Math.ceil(dur / dt) + 1;
  const off = new Uint32Array(steps + 1);
  let cap = steps * 48, idxB = new Uint16Array(cap), actB = new Float32Array(cap), xyB = new Float32Array(cap * 2), nPacked = 0;
  const fr: Frame = createFrame();
  const feat = new Float32Array(F);
  const xin = new Float32Array(MAX_NODES);
  const webs: ChaosPlan['webs'] = [];
  const eco: EcoSample[] = [];
  const snapWeb = (t: number) => {
    const edges: [number, number, number][] = [];
    for (let x = 0; x < live.length; x++) for (let y = x + 1; y < live.length; y++) {
      const i = live[x], j = live[y]; const w = getW(i, j) + getW(j, i);
      if (Math.abs(w) > 0.9) edges.push([i, j, w]);
    }
    webs.push({ t, edges });
  };
  const demand = new Float32Array(3 * F); // per kind (theme/word/asset) total appetite per feature
  const KI: Record<string, number> = { theme: 0, word: 1, asset: 2 };
  let lastExtinct = -99;
  let climSection = 0;

  // ---- CURATOR: the network is the subconscious; the curator decides what reaches the screen.
  // Few things at once, changes on the beat, theme mixing and frame effects only at key moments.
  const maxAssets = 1 + (kC > 0.6 ? 1 : 0) + (kC > 0.9 ? 1 : 0);
  const maxWords = 1 + Math.round(kC * 2.5);
  const holdBars = Math.max(1, 4 - Math.round(kC * 3));
  const SA = new Int16Array(steps).fill(-1), SB = new Int16Array(steps).fill(-1), SP = new Float32Array(steps), ST = new Uint8Array(steps);
  const SFX = new Int8Array(steps).fill(-1), SFA = new Float32Array(steps);
  const voff = new Uint32Array(steps + 1);
  let vcap = steps * 4, vidx = new Uint16Array(vcap), vpres = new Float32Array(vcap), vslot = new Int8Array(vcap), nV = 0;
  const slotOf = new Map<number, number>(), keptSlot = new Map<number, number>();
  let cur = -1, prev = -1, transP = 1, transLen = 0, transType = 1, curSinceBar = -99;
  let mixB = -1, mixP = 0;
  let fxK = -1, fxAmt = 0, fxEndBeat = -1, fxReadyBeat = -1;
  const pres = new Float32Array(MAX_NODES);
  const shown = new Map<number, number>(); // node -> beat it appeared
  let dens = 0.5;
  let lastBeat = -9999;
  const fxIdx = (k: FxKind) => nodes.findIndex((n) => n.kind === 'fx' && n.id === k);
  // ---- manual re-roll (recorded taps): wipe the living, new climate, rewired organs, a fresh population
  const taps = [...(o.taps ?? [])].filter((x) => x >= 0 && x < dur).sort((x, y) => x - y);
  let tapI = 0, forceCut = false, hitEnv = 0;
  const SHIT = new Float32Array(steps);
  const reroll = (t: number) => {
    events.push({ t, kind: 'extinction', node: -1 });
    const gone = new Set<string>();
    for (const i of live) if (evolving(nodes[i].kind) && !dying[i]) { kill(i, t); a[i] = 0; if (nodes[i].kind === 'theme') gone.add(nodes[i].id); }
    clim = makeClimate(r, inp.colors, kC, r());
    for (const i of live) if (!evolving(nodes[i].kind)) {
      for (let f = 0; f < F; f++) ear[i * F + f] = (r() < 0.5 ? (r() * 2 - 0.4) : 0) * 2.2;
      if (nodes[i].kind === 'fx') ear[i * F + 8] += 1.2;
      budget(ear, i);
      for (const j of live) if (j !== i && !rival(i, j)) setW(i, j, r() < 0.15 ? (r() < 0.6 ? 1 : -1) * (0.5 + r()) : 0);
    }
    const fresh = [...inp.themes].filter((x) => !gone.has(x)).sort(() => r() - 0.5).slice(0, capOf('theme'));
    fresh.forEach((th, q) => { usedTheme.set(th, (usedTheme.get(th) ?? 0) + 1); const i = spawn({ kind: 'theme', id: th, label: th, ...phenotype(), pref: THEME_ENERGY[th] ?? 0.5 }, t, -1, -1, 2); if (i >= 0) a[i] = q === 0 ? 0.9 : 0.3; });
    for (let q = 0; q < Math.min(nAssets, capOf('asset')); q++) { const ai = Math.floor(r() * nAssets); spawn({ kind: 'asset', id: String(ai), label: `asset${ai}`, ...phenotype(), asset: ai, pref: 0.5 }, t, -1, -1, 2); }
    forceCut = true; hitEnv = 1;
  };
  for (let s = 0; s < steps; s++) {
    const t = s * dt;
    sampleFrame(A, Math.min(t, dur - 0.01), fr);
    while (tapI < taps.length && taps[tapI] <= t) { tapI++; reroll(t); }
    SHIT[s] = hitEnv; hitEnv *= Math.exp(-dt / 0.32);
    if (fr.sectionIndex !== climSection) {
      climSection = fr.sectionIndex;
      const sec = A.sections[fr.sectionIndex];
      clim = makeClimate(r, inp.colors, kC, sec?.type === 2 ? 0.9 : sec?.type === 1 ? 0.55 : 0.2);
    }
    const ent = t / dur; // entropy only rises
    feat[0] = fr.kick; feat[1] = fr.snare; feat[2] = fr.hat; feat[3] = fr.energy;
    feat[4] = (fr.bands[0] + fr.bands[1]) / 2; feat[5] = (fr.bands[3] + fr.bands[4]) / 2; feat[6] = (fr.bands[6] + fr.bands[7]) / 2;
    feat[7] = fr.build; feat[8] = fr.drop + fr.dropHit;
    const temp = (0.15 + 0.5 * fr.energy + 0.6 * fr.dropHit) * L * (1 + ent * 0.9);

    // --- metabolism: the music is food, shared among the organisms of a kind that listen to it
    demand.fill(0);
    for (const i of live) { const k = KI[nodes[i].kind]; if (k === undefined || dying[i]) continue; for (let f = 0; f < F; f++) demand[k * F + f] += Math.max(0, ear[i * F + f]); }
    for (const i of live) {
      const n = nodes[i]; const k = KI[n.kind];
      if (k === undefined || dying[i]) continue;
      let food = 0;
      for (let f = 0; f < F; f++) { const e = Math.max(0, ear[i * F + f]); if (e) food += feat[f] * e / (0.6 + demand[k * F + f]); }
      if (n.kind === 'theme') food += (1 - Math.abs(n.pref - (fr.energy * 0.7 + fr.drop * 0.3))) * 0.25; // a theme thrives in music that suits it
      energy[i] += (food * 1.6 * EV - (0.22 + a[i] * 0.35) * EV) * dt;
      age[i] += dt;
      if (energy[i] <= 0 || age[i] > life[i]) kill(i, t);
    }
    // --- catastrophe: each drop wipes out the reigning theme and part of everything else
    if (fr.dropHit > 0.9 && t - lastExtinct > 6) {
      lastExtinct = t;
      events.push({ t, kind: 'extinction', node: -1 });
      let king = -1;
      for (const i of live) if (nodes[i].kind === 'theme' && !dying[i] && (king < 0 || a[i] > a[king])) king = i;
      if (king >= 0) kill(king, t);
      for (const i of live) if ((nodes[i].kind === 'word' || nodes[i].kind === 'asset') && !dying[i] && r() < 0.45) kill(i, t);
      // survivors get a windfall: the drop feeds whoever is left
      for (const i of live) if (!dying[i]) energy[i] += 1.5;
    }
    // --- reproduction
    const pop = (k: Kind) => live.filter((j) => nodes[j].kind === k && !dying[j]);
    for (const k of ['theme', 'asset'] as Kind[]) {
      if (k === 'asset' && nAssets === 0) continue;
      const P = pop(k);
      // nobody left: a spore lands (random genome)
      if (P.length < (k === 'theme' ? 2 : 1)) {
        const parent = live.filter((j) => nodes[j].kind === k).sort((x, y) => energy[y] - energy[x])[0] ?? -1;
        if (parent >= 0) spawn(k === 'theme' ? childTheme(parent) : k === 'word' ? childWord(parent) : childAsset(parent), t, -1, -1, 1.5);
        continue;
      }
      for (const i of P) {
        if (energy[i] < fert[i] || r() > dt * 2) continue;
        // full niche: displace the weakest if it is weaker than the would-be child
        let cur = pop(k);
        if (cur.length >= capOf(k)) {
          const weak = cur.filter((j) => j !== i).sort((x, y) => energy[x] - energy[y])[0];
          if (weak === undefined || energy[weak] > energy[i] / 2) continue;
          kill(weak, t);
        }
        // mate: the most strongly bonded living partner of the same kind (if any)
        let mate = -1, mw = 0.4;
        for (const j of P) if (j !== i) { const w = getW(i, j) + getW(j, i); if (w > mw) { mw = w; mate = j; } }
        const half = energy[i] / 2; energy[i] = half;
        const c = spawn(k === 'theme' ? childTheme(i) : k === 'word' ? childWord(i) : childAsset(i), t, i, mate, half);
        if (c < 0) break;
        cur = pop(k);
      }
    }
    // the fixed organs drift (their ears mutate slowly) and the web rewires — faster as entropy grows
    if (r() < dt * 0.6 * EV * (0.5 + ent) && live.length > 2) {
      const i = live[Math.floor(r() * live.length)], j = live[Math.floor(r() * live.length)];
      if (i !== j && !rival(i, j)) setW(i, j, getW(i, j) + (r() < 0.6 ? 1 : -1) * (0.4 + r()));
      const q = live[Math.floor(r() * live.length)];
      ear[q * F + Math.floor(r() * F)] += gauss(r) * 0.4 * EV;
      budget(ear, q);
    }

    // --- neural dynamics
    for (const i of live) {
      let x = 0;
      for (const j of live) { const w = getW(j, i); if (w) x += w * a[j]; }
      for (let f = 0; f < F; f++) x += ear[i * F + f] * feat[f];
      x += (r() - 0.5) * 2 * temp + novelty[i] * 3 - (dying[i] ? 8 : 0);
      xin[i] = x - thr[i] - hab[i] * 2.2;
    }
    for (const i of live) {
      if (dying[i]) a[i] *= Math.exp(-dt / 0.45);   // fading out
      else a[i] += (sig(xin[i] * 3) - a[i]) * Math.min(1, dt / tau[i]);
      hab[i] += (a[i] - hab[i]) * dt / (2 + tau[i] * 3);
      novelty[i] *= Math.exp(-dt / 2.5);
    }
    // Hebbian learning
    const eta = 0.02 * L * (1 + fr.drop * 2);
    for (const i of live) for (const j of live) {
      if (i === j || rival(i, j)) continue;
      const w = getW(i, j);
      if (w) setW(i, j, w + eta * dt * (a[i] * a[j] * 4 - 0.15 * w));
    }
    // force layout
    const cx = inp.aspect / 2, cy = 0.5;
    for (const i of live) {
      let fx = (cx - px[i]) * 0.6, fy = (cy - py[i]) * 0.6;
      for (const j of live) {
        if (i === j) continue;
        const dx = px[j] - px[i], dy = py[j] - py[i];
        const d2 = dx * dx + dy * dy + 0.002, d = Math.sqrt(d2);
        const w = getW(i, j) + getW(j, i);
        const f_ = w * 0.25 * a[i] * a[j] - Math.min(0.5, 0.0035 / d2);
        fx += (dx / d) * f_; fy += (dy / d) * f_;
      }
      fx += (px[i] - cx) * fr.kick * 0.5 * L; fy += (py[i] - cy) * fr.kick * 0.5 * L;
      // soft walls
      const m = 0.08;
      if (px[i] < m) fx += (m - px[i]) * 6; else if (px[i] > inp.aspect - m) fx -= (px[i] - inp.aspect + m) * 6;
      if (py[i] < m) fy += (m - py[i]) * 6; else if (py[i] > 1 - m) fy -= (py[i] - 1 + m) * 6;
      fx += Math.sin(t * 0.7 + i) * 0.05 * temp; fy += Math.cos(t * 0.5 + i * 2) * 0.05 * temp;
      vx[i] = (vx[i] + fx * dt) * 0.92; vy[i] = (vy[i] + fy * dt) * 0.92;
      px[i] += vx[i] * dt; py[i] += vy[i] * dt;
      if (px[i] < 0 || px[i] > inp.aspect) { vx[i] *= -0.8; px[i] = clamp(px[i], 0, inp.aspect); }
      if (py[i] < 0 || py[i] > 1) { vy[i] *= -0.8; py[i] = clamp(py[i], 0, 1); }
    }
    // --- remove the dead (faded out) — they never come back
    let changed = false;
    live = live.filter((i) => {
      if (dying[i] && a[i] < 0.03) { nodes[i].died = t; a[i] = 0; for (const j of live) { links.delete(K(i, j)); links.delete(K(j, i)); } changed = true; return false; }
      return true;
    });
    // --- record
    off[s] = nPacked;
    if (nPacked + live.length > cap) {
      cap = Math.max(cap * 2, nPacked + live.length + 1024);
      const i2 = new Uint16Array(cap); i2.set(idxB); idxB = i2;
      const a2 = new Float32Array(cap); a2.set(actB); actB = a2;
      const x2 = new Float32Array(cap * 2); x2.set(xyB); xyB = x2;
    }
    for (const i of live) { idxB[nPacked] = i; actB[nPacked] = a[i]; xyB[nPacked * 2] = px[i]; xyB[nPacked * 2 + 1] = py[i]; nPacked++; }
    // ---- curator step
    {
      const bi = Math.floor(fr.beat), newBeat = bi !== lastBeat, barStart = newBeat && ((bi % 4) + 4) % 4 === 0;
      const bar = Math.floor(bi / 4);
      const spb = 60 / Math.max(40, A.bpm);
      lastBeat = bi;
      const alive = (i: number) => i >= 0 && live.includes(i) && !dying[i];
      const themes = live.filter((i) => nodes[i].kind === 'theme' && !dying[i]).sort((x, y) => a[y] - a[x]);
      // theme on screen: changes only on a bar line (or at once if the current one is dying)
      if (cur < 0 && themes.length) { cur = themes[0]; curSinceBar = bar; }
      if (forceCut) {
        // a manual re-roll cuts straight to the new world with a flash or glitch and one burst effect
        forceCut = false;
        const nb = themes[0] ?? -1;
        if (nb >= 0) { prev = cur >= 0 && cur !== nb ? cur : -1; cur = nb; curSinceBar = bar; transType = r() < 0.5 ? 2 : 4; transLen = spb * 0.75; transP = prev >= 0 ? 0 : 1; mixB = -1; mixP = 0; }
        const loud: FxKind[] = ['invert', 'kaleido', 'mirrorX', 'strobe', 'hue', 'posterize'];
        fxK = FX.indexOf(loud[Math.floor(r() * loud.length)]); fxEndBeat = bi + 2; fxReadyBeat = bi + 2;
        shown.clear(); slotOf.clear();
      }
      const best = themes[0] ?? -1;
      const mustGo = !alive(cur);
      if (best >= 0 && best !== cur && ((barStart && bar - curSinceBar >= holdBars * (fr.drop > 0.5 ? 1 : 2) && a[best] > a[cur] + 0.12) || (mustGo && newBeat))) {
        prev = cur; cur = best; curSinceBar = bar; transP = 0;
        const dropIn = fr.dropHit > 0.8;
        transType = dropIn ? (r() < 0.5 ? 2 : 4) : fr.drop > 0.5 ? (r() < 0.6 ? 0 : 3) : (r() < 0.75 ? 1 : 5);
        transLen = transType === 1 ? spb * 2 : transType === 5 ? spb : transType === 0 ? 0 : spb * 0.5;
        if (transLen === 0) transP = 1;
        if (mixB === cur) { mixB = -1; mixP = 0; }
      }
      if (transP < 1) transP = Math.min(1, transP + dt / Math.max(dt, transLen));
      // mixing: only at the turn of a phrase, the tail of a build, or the impact of a drop
      const phraseTail = ((bi % 16) + 16) % 16 >= 15;
      const window_ = phraseTail || fr.dropHit > 0.5 || fr.build > 0.75 || kC > 0.85;
      const second = themes.find((i) => i !== cur) ?? -1;
      if (transP >= 1 && window_ && second >= 0 && mixB < 0 && newBeat) mixB = second;
      const mixT = transP >= 1 && window_ && mixB >= 0 && alive(mixB) ? (0.35 + 0.4 * kC) * Math.min(1, a[mixB] / Math.max(0.05, a[cur] || 0.05) + 0.3) : 0;
      mixP += (mixT - mixP) * Math.min(1, dt / 0.12);
      if (mixP < 0.01 && mixT === 0) { mixP = 0; mixB = -1; }
      let maskI = -1; for (const i of live) if (nodes[i].kind === 'mask' && (maskI < 0 || a[i] > a[maskI])) maskI = i;
      if (transP < 1 && prev >= 0) { SA[s] = prev; SB[s] = cur; SP[s] = transP; ST[s] = transType; }
      else if (mixB >= 0 && mixP > 0.01) { SA[s] = cur; SB[s] = mixB; SP[s] = mixP; ST[s] = maskI >= 0 ? nodes[maskI].mask! : 8; }
      else { SA[s] = cur; SB[s] = -1; SP[s] = 0; ST[s] = 0; }
      // one frame effect at a time, a beat or two long, on the beat, mostly in drops
      if (fxK >= 0 && bi >= fxEndBeat) { fxK = -1; fxReadyBeat = bi + Math.max(2, 8 - Math.round(kC * 6)); }
      if (fxK < 0 && newBeat && bi >= fxReadyBeat && (fr.drop > 0.5 || fr.build > 0.8 || kC > 0.85)) {
        let bestFx = -1, bv = 0.6;
        FX.forEach((k, q) => { const i = fxIdx(k); if (i >= 0 && a[i] > bv) { bv = a[i]; bestFx = q; } });
        if (bestFx >= 0) { fxK = bestFx; fxEndBeat = bi + 1 + (kC > 0.5 && r() < 0.5 ? 1 : 0); }
      }
      fxAmt += ((fxK >= 0 ? 1 : 0) - fxAmt) * Math.min(1, dt / (fxK >= 0 ? 0.02 : 0.1));
      SFX[s] = fxAmt > 0.02 ? (fxK >= 0 ? fxK : SFX[Math.max(0, s - 1)]) : -1; SFA[s] = fxAmt;
      // photos and words: a few at a time, they arrive and leave on the beat and stay at least a bar
      // density follows the music: sparse when quiet, full in drops
      dens += (Math.min(1.15, 0.2 + fr.energy * 0.55 + fr.drop * 0.45 + fr.build * 0.2) - dens) * Math.min(1, dt / 1.5);
      const capW = Math.max(1, Math.round(maxWords * dens)), capA = dens < 0.3 ? 0 : Math.max(1, Math.round(maxAssets * dens));
      if (newBeat) {
        for (const [i, since] of [...shown]) {
          const better = live.some((j) => nodes[j].kind === nodes[i].kind && !shown.has(j) && !dying[j] && a[j] > a[i] + 0.25);
          if (!alive(i) || a[i] < 0.18 || (bi - since >= 4 && better)) { shown.delete(i); slotOf.delete(i); }
        }
        for (const kind of ['asset', 'word'] as Kind[]) {
          const cap = kind === 'asset' ? capA : capW;
          let mine = [...shown.keys()].filter((i) => nodes[i].kind === kind).sort((x, y) => a[x] - a[y]);
          // too many for this moment: the weakest leave (after at least a bar on screen)
          while (mine.length > cap && bi - shown.get(mine[0])! >= 4) { shown.delete(mine[0]); slotOf.delete(mine[0]); mine = mine.slice(1); }
          let n = mine.length;
          const cands = live.filter((i) => nodes[i].kind === kind && !dying[i] && !shown.has(i) && a[i] > 0.4).sort((x, y) => a[y] - a[x]);
          for (const i of cands) {
            if (n >= cap) break;
            // composition: each element takes a free slot that suits its shape
            const used = new Set(slotOf.values());
            const md = nodes[i].mode;
            const pref = kind === 'asset' ? [0, 1, 3, 2] : md === 'marquee' ? [4, 5] : md === 'vertical' ? [6, 7] : [4, 0, 1, 5];
            const free = pref.filter((q) => !used.has(q));
            if (!free.length && kC < 0.85) continue;
            { const sl = free.length ? free[Math.floor(r() * Math.min(2, free.length))] : -1; slotOf.set(i, sl); keptSlot.set(i, sl); }
            shown.set(i, bi); n++;
          }
        }
      }
      voff[s] = nV;
      for (const i of live) {
        pres[i] += ((shown.has(i) ? 1 : 0) - pres[i]) * Math.min(1, dt / 0.25);
        if (pres[i] > 0.01) {
          if (nV >= vcap) { vcap *= 2; const i2 = new Uint16Array(vcap); i2.set(vidx); vidx = i2; const p2 = new Float32Array(vcap); p2.set(vpres); vpres = p2; const s2 = new Int8Array(vcap); s2.set(vslot); vslot = s2; }
          vidx[nV] = i; vpres[nV] = pres[i]; vslot[nV] = keptSlot.get(i) ?? -1; nV++;
        }
      }
    }
    if (s % 20 === 0 || changed) snapWeb(t);
    if (s % 10 === 0) {
      const ev = live.filter((i) => evolving(nodes[i].kind));
      const mean = (fn: (i: number) => number) => ev.length ? ev.reduce((q, i) => q + fn(i), 0) / ev.length : 0;
      eco.push({
        t, theme: ev.filter((i) => nodes[i].kind === 'theme').length, word: ev.filter((i) => nodes[i].kind === 'word').length,
        asset: ev.filter((i) => nodes[i].kind === 'asset').length, gen: mean((i) => nodes[i].gen), energy: mean((i) => energy[i]),
        species: new Set(ev.map((i) => nodes[i].id)).size, births: birthsAcc, deaths: deathsAcc,
        ear: Array.from({ length: F }, (_, f) => mean((i) => Math.max(0, ear[i * F + f]))),
      });
      birthsAcc = 0; deathsAcc = 0;
    }
  }
  off[steps] = nPacked;
  voff[steps] = nV;
  return {
    seed: o.seed, k: kC,
    screen: { a: SA, b: SB, p: SP, tr: ST, fx: SFX, fxAmt: SFA, hit: SHIT, voff, vidx: vidx.slice(0, nV), vpres: vpres.slice(0, nV), vslot: vslot.slice(0, nV) },
    nodes, edges: webs.length ? webs[webs.length - 1].edges : [], webs, events, eco, dt, steps,
    off, idx: idxB.slice(0, nPacked), act: actB.slice(0, nPacked), xy: xyB.slice(0, nPacked * 2), aspect: inp.aspect,
  };
}

/** themes the curator will put on screen within the next `ahead` seconds (for prefetching) */
export function chaosUpcoming(p: ChaosPlan, t: number, ahead = 4): NodeMeta[] {
  const out = new Set<number>();
  const s0 = Math.max(0, Math.floor(t / p.dt)), s1 = Math.min(p.steps - 1, Math.floor((t + ahead) / p.dt));
  for (let s = s0; s <= s1; s += 2) { if (p.screen.a[s] >= 0) out.add(p.screen.a[s]); if (p.screen.b[s] >= 0) out.add(p.screen.b[s]); }
  return [...out].map((i) => p.nodes[i]);
}

/** the web as it is at time t */
export function chaosWeb(p: ChaosPlan, t: number) {
  const w = p.webs;
  if (!w?.length) return p.edges;
  let lo = 0, hi = w.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (w[m].t <= t) lo = m; else hi = m - 1; }
  return w[lo].edges;
}

/** network state at time t (interpolated between simulation steps; the unborn and the dead are 0) */
export function chaosState(p: ChaosPlan, t: number) {
  const N = p.nodes.length;
  const x = Math.max(0, Math.min(p.steps - 1.001, t / p.dt));
  const s = Math.floor(x), f = x - s;
  const a = new Float32Array(N), xy = new Float32Array(N * 2), seen = new Uint8Array(N);
  for (let q = p.off[s]; q < p.off[s + 1]; q++) {
    const i = p.idx[q]; a[i] = p.act[q] * (1 - f); xy[i * 2] = p.xy[q * 2]; xy[i * 2 + 1] = p.xy[q * 2 + 1]; seen[i] = 1;
  }
  for (let q = p.off[s + 1]; q < p.off[s + 2]; q++) {
    const i = p.idx[q]; a[i] += p.act[q] * f;
    if (seen[i]) { xy[i * 2] += (p.xy[q * 2] - xy[i * 2]) * f; xy[i * 2 + 1] += (p.xy[q * 2 + 1] - xy[i * 2 + 1]) * f; }
    else { xy[i * 2] = p.xy[q * 2]; xy[i * 2 + 1] = p.xy[q * 2 + 1]; }
  }
  return { a, xy, s: Math.min(p.steps - 1, Math.round(x)) };
}

/** what the compositor needs at this moment (read from the curated screen track) */
export function chaosDeal(p: ChaosPlan, st: ReturnType<typeof chaosState>) {
  const sc = p.screen, s = st.s;
  const A = p.nodes[sc.a[s]], B = sc.b[s] >= 0 ? p.nodes[sc.b[s]] : null;
  const fxk = sc.fx[s] >= 0 ? FX[sc.fx[s]] : null, amt = sc.fxAmt[s];
  const on = amt > 0.5;
  return {
    themeA: A?.id, seedA: A?.seed ?? 1, themeB: B?.id, seedB: B?.seed ?? 2,
    /** amount of B (transition progress or mix strength) and the transition / mask id for the compositor */
    p: B ? sc.p[s] : 0, trans: sc.tr[s],
    /** manual re-roll impact 0..1 */
    hit: sc.hit?.[s] ?? 0,
    fx: {
      mirror: on && fxk === 'kaleido' ? 4 : on && fxk === 'mirrorX' ? 1 : on && fxk === 'mirrorY' ? 2 : 0,
      invert: on && fxk === 'invert' ? 1 : 0, posterize: on && fxk === 'posterize' ? 4 : 0,
      hue: fxk === 'hue' ? amt * 3.1 : 0, strobe: fxk === 'strobe' ? amt : 0,
    },
  };
}

// ---------------------------------------------------------------- overlay (2D, drawn into the HUD canvas)
export function drawChaos(g: CanvasRenderingContext2D, W: number, H: number, t: number, f: Frame, p: ChaosPlan, st: ReturnType<typeof chaosState>, assets: CanvasImageSource[]) {
  const k = H / 1080;
  const N = p.nodes.length;
  const sc = p.screen, s = st.s;
  const pres = new Float32Array(N);
  for (let q = sc.voff[s]; q < sc.voff[s + 1]; q++) pres[sc.vidx[q]] = sc.vpres[q];
  g.save();
  // the network itself: only between what is on screen, and only when the music is up (or the curator is loose)
  g.lineWidth = 1.2 * k;
  const webAmt = Math.max(p.k > 0.7 ? 1 : 0, f.drop) * (0.35 + 0.65 * p.k);
  for (const [i, j, w] of webAmt > 0.05 ? chaosWeb(p, t) : []) {
    const v = Math.min(pres[i], pres[j]) * Math.min(st.a[i], st.a[j]);
    if (v < 0.15) continue;
    g.globalAlpha = v * 0.6 * webAmt;
    g.strokeStyle = w > 0 ? p.nodes[i].color : '#ffffff';
    g.setLineDash(w > 0 ? [] : [4 * k, 6 * k]);
    g.beginPath(); g.moveTo(st.xy[i * 2] * H, st.xy[i * 2 + 1] * H); g.lineTo(st.xy[j * 2] * H, st.xy[j * 2 + 1] * H); g.stroke();
  }
  g.setLineDash([]);
  // births ripple out from where a newborn appears; extinctions flash the whole frame edge
  for (const e of p.events) {
    if (e.t > t) break;
    const age = t - e.t;
    if (age > 1.2) continue;
    if (e.kind === 'extinction') {
      g.globalAlpha = (1 - age / 1.2) * 0.8; g.strokeStyle = '#ffffff'; g.lineWidth = 18 * k * (1 - age / 1.2);
      g.strokeRect(0, 0, W, H);
    } else if (e.kind === 'birth') {
      if (pres[e.node] < 0.05) continue;
      const n = p.nodes[e.node];
      const X = st.xy[e.node * 2] * H, Y = st.xy[e.node * 2 + 1] * H;
      g.globalAlpha = (1 - age / 1.2) * 0.9; g.strokeStyle = n.color; g.lineWidth = 3 * k;
      g.beginPath(); g.arc(X, Y, (20 + age * 420) * k, 0, Math.PI * 2); g.stroke();
    }
  }
  const strict = p.k < 0.6;
  for (let q = sc.voff[s]; q < sc.voff[s + 1]; q++) {
    const i = sc.vidx[q], n = p.nodes[i], a = st.a[i], pr = sc.vpres[q], sl = sc.vslot[q];
    if (n.kind !== 'word') continue; // photos / videos are drawn by drawChaosMedia (melted into the scene)
    // composed position: the slot, nudged a little by where the network pulls the node
    const pull = sl >= 0 ? 0.08 + 0.25 * p.k : 1;
    const X = sl >= 0 ? (SLOTS[sl][0] * W) * (1 - pull) + st.xy[i * 2] * H * pull : st.xy[i * 2] * H;
    const Y = sl >= 0 ? (SLOTS[sl][1] * H) * (1 - pull) + st.xy[i * 2 + 1] * H * pull : st.xy[i * 2 + 1] * H;
    const vis = 0.35 + 0.65 * Math.min(1, a);
    const framed = sl >= 0 && p.k < 0.85;
    g.save();
    g.globalCompositeOperation = n.comp;
    g.globalAlpha = pr * Math.min(1, 0.4 + vis * 0.6);
    const mode = strict && (n.mode === 'scatter' || n.mode === 'tile') ? 'big' : n.mode;
    {
      const px = (framed ? (mode === 'vertical' ? 34 + vis * 30 : mode === 'marquee' ? 44 + vis * 30 : 60 + vis * 70) : mode === 'big' ? 90 + vis * 220 : mode === 'scatter' ? 26 + vis * 30 : 40 + vis * 90) * k * (1 + f.snare * 0.1);
      g.font = fontCss(n.font, px);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.fillStyle = n.color;
      const paint = (s: string, x: number, y: number) => {
        if (n.comp === 'source-over') { g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = px * 0.08; g.strokeText(s, x, y); }
        g.fillText(s, x, y);
      };
      if (!strict && f.hat > 0.3 && Math.sin(t * 90 + i) > 0.6) { g.restore(); continue; } // flicker
      if (mode === 'marquee') {
        const unit = n.label + '　';
        const uw = Math.max(1, g.measureText(unit).width);
        const off = ((t * 120 * k * (n.seed % 2 ? 1 : -1)) % uw + uw) % uw;
        g.textAlign = 'left';
        for (let x = -2 * uw + off; x < W + uw; x += uw) paint(unit, x, Y);
      } else if (mode === 'vertical') {
        [...n.label].forEach((ch, j, arr) => paint(ch, X, Y + (j - arr.length / 2) * px * 1.05));
      } else if (mode === 'scatter') {
        for (let j = 0; j < 6; j++) paint(n.label, ((Math.sin(n.seed + j * 7.1) * 0.5 + 0.5) * W + t * 30 * k) % W, (Math.cos(n.seed * 1.3 + j * 3.7) * 0.5 + 0.5) * H);
      } else if (framed && sl >= 0 && sl <= 3) {
        // corner words hug the outer edge so they never reach the centre icon
        const left = SLOTS[sl][0] < 0.5;
        g.textAlign = left ? 'left' : 'right';
        g.translate(left ? W * 0.05 : W * 0.95, Y);
        if (mode === 'stretch') g.scale(1.5, 0.75);
        paint(n.label, 0, 0);
      } else {
        g.translate(X, Y);
        g.rotate(framed ? 0 : Math.sin(n.seed) * 0.25);
        if (mode === 'stretch') g.scale(framed ? 1.8 : 2.4, framed ? 0.7 : 0.6);
        paint(n.label, 0, 0);
      }
    }
    g.restore();
  }
  g.restore();
}

// ---------------------------------------------------------------- photos / videos, melted into the scene
/** soft masks give each picture an organic outline instead of a pasted rectangle */
type Feather = 'oval' | 'soft' | 'side' | 'band';
const FEATHERS: Feather[] = ['oval', 'soft', 'side', 'band'];
let scratch: HTMLCanvasElement | null = null;

/** where a visible node sits on screen (slot nudged by the network), shared by text and pictures */
function placeOf(p: ChaosPlan, st: ReturnType<typeof chaosState>, i: number, sl: number, W: number, H: number) {
  const pull = sl >= 0 ? 0.08 + 0.25 * p.k : 1;
  return {
    X: sl >= 0 ? (SLOTS[sl][0] * W) * (1 - pull) + st.xy[i * 2] * H * pull : st.xy[i * 2] * H,
    Y: sl >= 0 ? (SLOTS[sl][1] * H) * (1 - pull) + st.xy[i * 2 + 1] * H * pull : st.xy[i * 2 + 1] * H,
  };
}

/**
 * Draws the visible photos / videos into the compositor's blend layer. The GPU then mixes this layer
 * with the scene (picking up its colours and light), so pictures look like part of the image.
 * Each picture gets a feathered outline, a slow Ken Burns drift and breathes with the kick.
 */
export function drawChaosMedia(g: CanvasRenderingContext2D, W: number, H: number, t: number, f: Frame, p: ChaosPlan, st: ReturnType<typeof chaosState>, assets: CanvasImageSource[]) {
  if (!assets.length) return;
  const sc = p.screen, s = st.s;
  scratch ??= document.createElement('canvas');
  const sg = scratch.getContext('2d')!;
  for (let q = sc.voff[s]; q < sc.voff[s + 1]; q++) {
    const i = sc.vidx[q], n = p.nodes[i];
    if (n.kind !== 'asset') continue;
    const src = assets[n.asset! % assets.length];
    if (!src) continue;
    const sw = (src as HTMLCanvasElement).width || (src as HTMLVideoElement).videoWidth || 0;
    const sh = (src as HTMLCanvasElement).height || (src as HTMLVideoElement).videoHeight || 0;
    if (!sw || !sh) continue;
    const a = st.a[i], pr = sc.vpres[q], sl = sc.vslot[q];
    const { X, Y } = placeOf(p, st, i, sl, W, H);
    const vis = 0.35 + 0.65 * Math.min(1, a);
    const framed = sl >= 0 && p.k < 0.85;
    // pictures are larger than before: their soft edges dissolve into the scene
    const size = (framed ? 0.34 + vis * 0.16 : 0.3 + vis * 0.7) * H * (1 + f.kick * 0.04);
    const c = n.crop, ar = Math.min(2.2, Math.max(0.6, (c[2] * sw) / (c[3] * sh)));
    const dw = Math.round(Math.min(W * 1.1, size * ar)), dh = Math.round(size);
    if (scratch.width < dw || scratch.height < dh) { scratch.width = Math.max(scratch.width, dw); scratch.height = Math.max(scratch.height, dh); }
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.globalCompositeOperation = 'source-over';
    sg.clearRect(0, 0, dw, dh);
    // slow Ken Burns: zoom and pan inside the crop
    const z = 1.08 + 0.06 * Math.sin(t * 0.11 + n.seed);
    const cw = (c[2] * sw) / z, ch = (c[3] * sh) / z;
    const cx = c[0] * sw + (c[2] * sw - cw) * (0.5 + 0.5 * Math.sin(t * 0.07 + n.seed * 1.3));
    const cy = c[1] * sh + (c[3] * sh - ch) * (0.5 + 0.5 * Math.cos(t * 0.06 + n.seed * 0.7));
    try { sg.drawImage(src, cx, cy, cw, ch, 0, 0, dw, dh); } catch { continue; }
    // feathered outline
    sg.globalCompositeOperation = 'destination-in';
    const kind = FEATHERS[n.seed % FEATHERS.length];
    const soft = (lo: number, hi: number, horizontal: boolean) => {
      const gr = horizontal ? sg.createLinearGradient(0, 0, dw, 0) : sg.createLinearGradient(0, 0, 0, dh);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(lo, '#000'); gr.addColorStop(hi, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      sg.fillStyle = gr; sg.fillRect(0, 0, dw, dh);
    };
    if (kind === 'oval') {
      sg.save(); sg.translate(dw / 2, dh / 2); sg.scale(dw / 2, dh / 2);
      const gr = sg.createRadialGradient(0, 0, 0.25, 0, 0, 1);
      gr.addColorStop(0, '#000'); gr.addColorStop(0.55, 'rgba(0,0,0,.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      sg.fillStyle = gr; sg.fillRect(-1, -1, 2, 2); sg.restore();
    } else if (kind === 'soft') { soft(0.18, 0.82, true); soft(0.18, 0.82, false); }
    else if (kind === 'side') {
      // fades out toward one side, like a double exposure
      const left = n.seed % 2 === 0;
      const gr = sg.createLinearGradient(left ? 0 : dw, 0, left ? dw : 0, 0);
      gr.addColorStop(0, '#000'); gr.addColorStop(0.45, 'rgba(0,0,0,.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      sg.fillStyle = gr; sg.fillRect(0, 0, dw, dh); soft(0.2, 0.8, false);
    } else { soft(0.3, 0.7, false); soft(0.08, 0.92, true); }
    g.save();
    g.globalAlpha = pr * Math.min(1, 0.45 + vis * 0.55);
    g.translate(X, Y);
    g.rotate(framed ? (n.seed % 5 - 2) * 0.012 + Math.sin(t * 0.3 + n.seed) * 0.01 : (n.seed % 7 - 3) * 0.04);
    g.drawImage(scratch, 0, 0, dw, dh, -dw / 2, -dh / 2, dw, dh);
    g.restore();
  }
}
