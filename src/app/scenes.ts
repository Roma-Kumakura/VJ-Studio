/**
 * Scene planning: the video switches themes along the song structure.
 * One scene per section; long sections are split every 8–16 bars. Boundaries sit on
 * downbeats of the tracked beat grid. Drops get energetic themes, intros/breaks calm ones,
 * adjacent scenes never repeat a theme, and every drop start is a switch point.
 */
import { beatToTime, timeToBeat, type Analysis } from '../analysis/analyze';
import { mulberry32, type RNG } from '../core/rng';

export type TransitionType = 'cut' | 'fade' | 'flash' | 'zoom' | 'glitch' | 'wipe';
export const TRANSITIONS: Record<TransitionType, string> = { cut: 'カット', fade: 'クロスフェード', flash: 'フラッシュ', zoom: 'ズーム', glitch: 'グリッチ', wipe: 'ワイプ' };
export const TRANSITION_IDS: Record<TransitionType, number> = { cut: 0, fade: 1, flash: 2, zoom: 3, glitch: 4, wipe: 5 };

export interface Scene {
  id: number;
  start: number; end: number;
  tpl: string; seed: number;
  trans: TransitionType; // transition INTO this scene
  lock?: boolean;
}
export interface SceneOptions { enabled: boolean; scenes: Scene[]; seed: number }
export const defaultSceneOptions = (): SceneOptions => ({ enabled: true, scenes: [], seed: 1 });

/** 0 = calm, 1 = wild. Unknown themes count as 0.5. */
export const THEME_ENERGY: Record<string, number> = {
  caustics: 0.2, aurora: 0.35, sky: 0.15, train: 0.25, y2k: 0.55, jacket: 0.5, highway: 0.8, nebula: 0.85,
  puddle: 0.45, goldfish: 0.25, crt: 0.6, danchi: 0.3, classroom: 0.15, jellyfish: 0.25, sakura: 0.75, wirecity: 0.8,
  constellation: 0.3, lcd: 0.85, kaleido: 0.8, ink: 0.45, rainglass: 0.2, elevator: 0.75, torii: 0.85, holoterrain: 0.8,
  prism: 0.75, dawnsea: 0.2, fireworks: 0.9, film: 0.4, yatai: 0.55, ukiyowave: 0.7, reiho: 0.2, bamboo: 0.2,
  karesansui: 0.15, shinkansen: 0.85, sumi: 0.45, momiji: 0.3, denkigai: 0.8, yukiguni: 0.2,
  warp: 0.95, orbital: 0.3, dyson: 0.6, twinsun: 0.25, cockpit: 0.75, blackhole: 0.55, megacity: 0.7, circuit: 0.7, planet: 0.3, portal: 0.85,
  lofiwindow: 0.1, vaporgrid: 0.6, citypop: 0.4, watercolor: 0.15, lavalamp: 0.3, stainedglass: 0.4, opart: 0.85, neontube: 0.6, ascii: 0.65, polyhedra: 0.7,
  bubbles: 0.15, speaker: 0.9, cassette: 0.35, vinyl: 0.4, discoball: 0.85, marble: 0.35, godrays: 0.2, ferris: 0.45, ecg: 0.6, pixeltown: 0.3,
};

/** transition timing window around a boundary (seconds before / after) */
export function transWindow(type: TransitionType, bar: number): [number, number] {
  switch (type) {
    case 'cut': return [0, 0];
    case 'fade': return [bar, 0];
    case 'flash': return [0.1, 0.35];
    case 'zoom': return [0.35, 0.2];
    case 'glitch': return [0.3, 0.25];
    case 'wipe': return [Math.min(0.6, bar / 2), 0];
  }
}

let sceneId = 1;

export function planScenes(A: Analysis, pool: Record<string, number>, seed: number, keep: Scene[] = [], barsPerSplit = 0): Scene[] {
  const rng: RNG = mulberry32(seed);
  const snapBar = (t: number) => beatToTime(A, Math.round(timeToBeat(A, t) / 4) * 4);
  const barLen = (60 / A.bpm) * 4;
  // 1. boundaries
  type Seg = { start: number; end: number; type: number; first: boolean };
  const segs: Seg[] = [];
  for (const s of A.sections) {
    const st = s === A.sections[0] ? 0 : snapBar(s.start);
    const en = s === A.sections[A.sections.length - 1] ? A.duration : snapBar(s.end);
    if (en - st < barLen * 2) { if (segs.length) segs[segs.length - 1].end = en; continue; }
    const bars = (en - st) / barLen;
    const chunk = barsPerSplit > 0 ? barsPerSplit : bars >= 32 ? 16 : bars > 16 ? 8 : 0;
    if (!chunk) { segs.push({ start: st, end: en, type: s.type, first: true }); continue; }
    let c = st, first = true;
    while (en - c > barLen * chunk * 1.4) {
      const nx = snapBar(c + barLen * chunk);
      segs.push({ start: c, end: nx, type: s.type, first }); c = nx; first = false;
    }
    segs.push({ start: c, end: en, type: s.type, first });
  }
  if (!segs.length) segs.push({ start: 0, end: A.duration, type: 0, first: true });

  // 2. themes: weight by mood pool x energy fit, avoid repeats
  const ids = Object.keys(pool);
  const target = (type: number) => (type === 2 ? 0.85 : type === 1 ? 0.55 : 0.2);
  const out: Scene[] = [];
  const recent: string[] = [];
  for (let i = 0; i < segs.length; i++) {
    const sg = segs[i];
    const locked = keep.find((k) => k.lock && Math.abs(k.start - sg.start) < 0.08);
    if (locked) { out.push({ ...locked, start: sg.start, end: sg.end }); recent.unshift(locked.tpl); continue; }
    const tgt = target(sg.type);
    const w: [string, number][] = ids.map((id) => {
      const e = THEME_ENERGY[id] ?? 0.5;
      let wt = pool[id] * Math.exp(-((e - tgt) ** 2) / 0.08);
      if (recent[0] === id) wt = 0;
      else if (recent.slice(1, 3).includes(id)) wt *= 0.25;
      return [id, wt];
    });
    const tot = w.reduce((a, [, v]) => a + v, 0);
    let r = rng() * tot, tpl = ids[0];
    for (const [id, v] of w) { r -= v; if (r <= 0) { tpl = id; break; } }
    if (tot <= 0) tpl = ids.find((x) => x !== recent[0]) ?? ids[0];
    // 3. transition into this scene
    const prevType = segs[i - 1]?.type;
    let trans: TransitionType;
    if (i === 0) trans = 'cut';
    else if (sg.type === 2 && sg.first) trans = rng() < 0.6 ? 'flash' : 'zoom';
    else if (sg.type === 1 && sg.first) trans = rng() < 0.5 ? 'glitch' : 'wipe';
    else if (!sg.first) trans = sg.type === 2 ? (rng() < 0.6 ? 'cut' : 'glitch') : (rng() < 0.5 ? 'wipe' : 'fade');
    else trans = prevType === 2 ? 'fade' : rng() < 0.5 ? 'fade' : 'wipe';
    out.push({ id: sceneId++, start: sg.start, end: sg.end, tpl, seed: Math.floor(rng() * 1e6), trans });
    recent.unshift(tpl);
  }
  return out;
}

/** which scenes are visible at t and how far the transition is (0 = only a, 1 = only b) */
export function sceneMix(scenes: Scene[], t: number, bar: number): { a: Scene; b: Scene | null; p: number; type: TransitionType } {
  let i = scenes.findIndex((s) => t >= s.start && t < s.end);
  if (i < 0) i = t < (scenes[0]?.start ?? 0) ? 0 : scenes.length - 1;
  const cur = scenes[i];
  // transition into the current scene (post part)
  if (i > 0) {
    const [pre, post] = transWindow(cur.trans, bar);
    if (post > 0 && t < cur.start + post) return { a: scenes[i - 1], b: cur, p: (t - (cur.start - pre)) / (pre + post), type: cur.trans };
  }
  // transition into the next scene (pre part)
  const nx = scenes[i + 1];
  if (nx) {
    const [pre, post] = transWindow(nx.trans, bar);
    if (pre > 0 && t >= nx.start - pre) return { a: cur, b: nx, p: (t - (nx.start - pre)) / (pre + post), type: nx.trans };
  }
  return { a: cur, b: null, p: 0, type: 'cut' };
}
