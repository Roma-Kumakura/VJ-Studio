/**
 * "Director" — the slot-machine generator.
 *
 * Given the song analysis and whatever the user threw in (photos/videos, words, lyrics, icon),
 * it rolls a complete, coherent video recipe. Nothing is uniformly random:
 *  1. MOOD is inferred from the audio (tempo, loudness, dynamics, brightness, drop ratio)
 *     and sampled with weights, so a liquid DnB track tends to get water/sky worlds, a loud
 *     track gets hype worlds, etc. Every other reel draws from that mood's taste tables.
 *  2. MEDIA decides how photos/videos are shown and how fast they cut (in beats, tuned so a
 *     cut lasts a musically sensible number of seconds for this BPM and energy).
 *  3. LAYOUT picks an archetype for the aspect ratio, jitters it, then runs a small
 *     constraint solver (box repulsion inside a safe area, with per-element mobility) so
 *     nothing collides.
 *  4. TELOPS are choreographed onto the song structure: words land on section changes and
 *     phrase boundaries, never overlap in time, and are placed into free screen space.
 * Locked reels keep what is currently on screen.
 */
import type { Analysis } from '../analysis/analyze';
import type { FontId } from '../core/fonts';
import type { MediaBlend, MediaMode } from '../core/media';
import { mulberry32, type RNG } from '../core/rng';
import type { LyricsStyle } from '../core/lyrics';
import type {
  HudElement, HudElementId, IconFilter, IconFrame, IconFx, SpectrumStyle, TextAnim, TextItem, TextStyle,
} from '../core/template';
import { newTextItem } from '../core/template';

export type MoodId = 'liquid' | 'night' | 'dream' | 'hype' | 'retro' | 'cosmic' | 'japan';
export type ReelId = 'mood' | 'theme' | 'color' | 'media' | 'layout' | 'font' | 'meter' | 'fx' | 'telop';
export type Aspect = '16:9' | '1:1' | '9:16';

type W<T extends string> = Partial<Record<T, number>>;
interface Mood {
  name: string; emoji: string;
  templates: W<string>;
  palettes: [string, string, string][];
  titleFonts: FontId[]; userFonts: FontId[]; lyricFonts: FontId[]; telopFonts: FontId[];
  spectrum: W<SpectrumStyle>;
  iconFilter: W<IconFilter>;
  iconFrame: W<IconFrame>;
  telopStyle: W<TextStyle>;
  telopAnim: W<TextAnim>;
  blend: W<MediaBlend>;
  lyrics: W<LyricsStyle>;
  energy: number; // 0 calm .. 1 wild : scales effect strength
}

export const MOODS: Record<MoodId, Mood> = {
  liquid: {
    name: 'リキッド', emoji: '🌊', energy: 0.35,
    templates: { caustics: 5, aurora: 3, sky: 3, train: 1, lofiwindow: 3, watercolor: 2, bubbles: 2, marble: 2, godrays: 2 },
    palettes: [['#7af0ff', '#9effc8', '#ffffff'], ['#5fd3ff', '#c9a7ff', '#f4fbff'], ['#8ff0e5', '#5fb7ff', '#ffffff'], ['#39c5bb', '#a6e3ff', '#ffffff']],
    titleFonts: ['maru', 'gothic', 'mincho'], userFonts: ['gothic', 'maru'], lyricFonts: ['gothic', 'maru', 'mincho'], telopFonts: ['maru', 'gothic', 'mincho'],
    spectrum: { wave: 5, capsule: 3, radial: 1 }, iconFilter: { none: 4, duotone: 2 }, iconFrame: { simple: 3, neon: 2, none: 1 },
    telopStyle: { plain: 3, shadow: 3, box: 2 }, telopAnim: { fade: 5, pop: 1, type: 1 }, blend: { screen: 5, normal: 2, overlay: 1 }, lyrics: { apple: 5, minimal: 2, spotify: 1, flow: 1, depth: 1 },
  },
  night: {
    name: 'ナイトシティ', emoji: '🌃', energy: 0.6,
    templates: { highway: 5, train: 3, jacket: 2, aurora: 1, megacity: 4, neontube: 3, ferris: 3, citypop: 2, vinyl: 2 },
    palettes: [['#ff5fa2', '#7af0ff', '#ffffff'], ['#ff8a3d', '#b48cff', '#fff8ec'], ['#ff7ad9', '#ffd36b', '#ffffff'], ['#5fb7ff', '#ff6f6f', '#ffffff']],
    titleFonts: ['heavy', 'sf', 'gothic'], userFonts: ['sf', 'gothic'], lyricFonts: ['gothic', 'heavy'], telopFonts: ['heavy', 'sf', 'gothic'],
    spectrum: { capsule: 4, terrain: 3, dots: 2, wave: 1 }, iconFilter: { none: 3, vhs: 2, duotone: 1 }, iconFrame: { neon: 5, simple: 1 },
    telopStyle: { neon: 5, outline: 2, box: 2 }, telopAnim: { pop: 3, beat: 3, fade: 1 }, blend: { add: 3, screen: 3, overlay: 1 }, lyrics: { apple: 3, karaoke: 3, spotify: 1, glitch: 2, type: 2, flow: 1 },
  },
  dream: {
    name: 'ドリームコア', emoji: '☁️', energy: 0.3,
    templates: { sky: 4, y2k: 3, train: 2, caustics: 2, lavalamp: 3, stainedglass: 2, godrays: 3, bubbles: 2, vaporgrid: 2 },
    palettes: [['#ff9ccf', '#ffe08a', '#fff4fa'], ['#c9a7ff', '#ffd6f0', '#ffffff'], ['#a6e3ff', '#ffb3e6', '#ffffff'], ['#ffd3e6', '#b5f0ff', '#fffafc']],
    titleFonts: ['maru', 'pop', 'marker', 'dot'], userFonts: ['maru', 'dot'], lyricFonts: ['maru', 'marker'], telopFonts: ['maru', 'pop', 'marker', 'dot'],
    spectrum: { dots: 3, wave: 3, radial: 2, capsule: 1 }, iconFilter: { vhs: 3, duotone: 2, rainbow: 1, none: 1 }, iconFrame: { simple: 3, neon: 1, none: 2 },
    telopStyle: { box: 5, plain: 2, shadow: 1 }, telopAnim: { type: 3, pop: 3, fade: 2 }, blend: { overlay: 2, normal: 3, screen: 2 }, lyrics: { minimal: 3, apple: 2, karaoke: 1, tate: 2, depth: 2, scatter: 1 },
  },
  hype: {
    name: 'ハイプ', emoji: '⚡', energy: 0.95,
    templates: { nebula: 4, highway: 3, jacket: 3, aurora: 1, warp: 4, discoball: 3, speaker: 3, opart: 2, circuit: 2, cockpit: 2 },
    palettes: [['#ff3d7f', '#ffd23f', '#ffffff'], ['#00e5ff', '#ff00aa', '#ffffff'], ['#b6ff3d', '#ff5fa2', '#ffffff'], ['#ff8a3d', '#7a5cff', '#ffffff']],
    titleFonts: ['heavy', 'sf'], userFonts: ['sf', 'heavy'], lyricFonts: ['heavy', 'gothic'], telopFonts: ['heavy', 'sf', 'pop'],
    spectrum: { radial: 4, terrain: 3, capsule: 3, dots: 1 }, iconFilter: { none: 2, rainbow: 2, duotone: 1 }, iconFrame: { neon: 6 },
    telopStyle: { neon: 3, box: 3, outline: 3 }, telopAnim: { beat: 4, pop: 4 }, blend: { add: 5, screen: 2 }, lyrics: { karaoke: 4, apple: 2, spotify: 2, pop: 3, giant: 3, glitch: 2 },
  },
  retro: {
    name: 'レトロY2K', emoji: '💾', energy: 0.55,
    templates: { y2k: 5, jacket: 2, highway: 1, sky: 1, vaporgrid: 4, cassette: 4, pixeltown: 4, ascii: 3, ecg: 2, polyhedra: 2 },
    palettes: [['#ffd23f', '#ff5fa2', '#fffaf0'], ['#39c5bb', '#ff7ad9', '#ffffff'], ['#7a8fff', '#ffe066', '#ffffff'], ['#ff6f6f', '#4ac0ff', '#ffffff']],
    titleFonts: ['dot', 'pop', 'sf'], userFonts: ['dot', 'sf'], lyricFonts: ['dot', 'gothic'], telopFonts: ['dot', 'pop'],
    spectrum: { dots: 5, capsule: 2, terrain: 1 }, iconFilter: { vhs: 5, mono: 2, none: 1 }, iconFrame: { simple: 3, neon: 2 },
    telopStyle: { box: 4, outline: 3, plain: 1 }, telopAnim: { type: 5, pop: 2 }, blend: { normal: 3, overlay: 3, screen: 1 }, lyrics: { spotify: 3, karaoke: 2, minimal: 2, type: 3, box: 3, pop: 1 },
  },
  cosmic: {
    name: 'コズミック', emoji: '✨', energy: 0.6,
    templates: { nebula: 4, aurora: 4, sky: 2, jacket: 1, orbital: 4, dyson: 3, blackhole: 3, planet: 3, portal: 3, twinsun: 3 },
    palettes: [['#c9a7ff', '#7af0ff', '#ffffff'], ['#9b7bff', '#ff9ccf', '#ffffff'], ['#5fe3ff', '#b58cff', '#fff6c9'], ['#ffe08a', '#8f7bff', '#ffffff']],
    titleFonts: ['sf', 'mincho', 'gothic'], userFonts: ['sf', 'gothic'], lyricFonts: ['mincho', 'gothic'], telopFonts: ['sf', 'mincho', 'gothic'],
    spectrum: { radial: 4, wave: 3, terrain: 2 }, iconFilter: { duotone: 3, none: 3, rainbow: 1 }, iconFrame: { neon: 3, simple: 2, none: 1 },
    telopStyle: { shadow: 3, neon: 3, plain: 2 }, telopAnim: { fade: 4, pop: 2, beat: 1 }, blend: { screen: 5, add: 2 }, lyrics: { apple: 4, minimal: 2, depth: 3, ring: 3, scatter: 1 },
  },
  japan: {
    name: '和', emoji: '⛩️', energy: 0.5,
    templates: { yatai: 4, ukiyowave: 3, reiho: 3, bamboo: 3, karesansui: 2, shinkansen: 3, sumi: 3, momiji: 3, denkigai: 3, yukiguni: 3, torii: 3, sakura: 3, goldfish: 2 },
    palettes: [['#e8383d', '#f3c15b', '#fff8ec'], ['#2b4b8c', '#d9a62e', '#fffaf0'], ['#ff8fab', '#ffe3ea', '#ffffff'], ['#c0392b', '#1b1b1b', '#fdf6e3']],
    titleFonts: ['mincho', 'heavy', 'marker'], userFonts: ['mincho', 'gothic'], lyricFonts: ['mincho', 'maru'], telopFonts: ['mincho', 'heavy', 'marker'],
    spectrum: { wave: 3, radial: 3, capsule: 2 }, iconFilter: { none: 3, duotone: 2, mono: 1 }, iconFrame: { simple: 3, neon: 2 },
    telopStyle: { shadow: 3, box: 3, outline: 2 }, telopAnim: { fade: 3, pop: 2, type: 2 }, blend: { screen: 3, normal: 2, overlay: 1 }, lyrics: { apple: 3, minimal: 3, karaoke: 1, tate: 5, box: 1, ring: 1 },
  },
};

export const REELS: { id: ReelId; label: string; emoji: string }[] = [
  { id: 'mood', label: 'ムード', emoji: '🎭' },
  { id: 'theme', label: 'テーマ', emoji: '🌈' },
  { id: 'color', label: 'カラー', emoji: '🎨' },
  { id: 'media', label: '素材', emoji: '🖼️' },
  { id: 'layout', label: 'レイアウト', emoji: '📐' },
  { id: 'font', label: 'フォント', emoji: '🔤' },
  { id: 'meter', label: 'メーター', emoji: '📊' },
  { id: 'fx', label: 'エフェクト', emoji: '✨' },
  { id: 'telop', label: 'テロップ', emoji: '💬' },
];

// ------------------------------------------------------------------ recipe
export interface Recipe {
  mood: MoodId;
  theme: { tpl: string; seed: number; params: { intensity: number; speed: number; hue: number } };
  color: { accent: string; accent2: string; text: string };
  media: { mode: MediaMode; blend: MediaBlend; beatsPerCut: number; mix: number; motion: number; tilt: number };
  layout: { name: string; elements: Record<HudElementId, HudElement>; iconShape: 'square' | 'circle'; card: { x: number; y: number; size: number }; lyricsStyle: LyricsStyle };
  font: { title: FontId; user: FontId; lyrics: FontId; telop: FontId };
  meter: { spectrumStyle: SpectrumStyle; scope: boolean; phase: boolean; readout: boolean };
  fx: { glitter: number; bloom: number; dim: number; iconFx: IconFx; tier: string };
  telop: { items: TextItem[] };
}

export interface DirectorContext {
  A: Analysis;
  aspect: Aspect;
  W: number; H: number;
  hasAvatar: boolean;
  mediaCount: number;
  hasVideo: boolean;
  mediaAspect: number;
  words: string[];
  lyrics: boolean;
  title: string; username: string;
  templates: { id: string; name: string }[];
  /** pixel box of a HUD element / telop for the given state (from the editor's hit-testing) */
  measure: (q: { el?: HudElementId; text?: TextItem; card?: boolean }, r: Partial<Recipe>) => [number, number, number, number] | null;
}

// ------------------------------------------------------------------ helpers
const pickW = <T extends string>(rng: RNG, w: W<T>): T => {
  const e = Object.entries(w) as [T, number][];
  const tot = e.reduce((a, [, v]) => a + v, 0);
  let r = rng() * tot;
  for (const [k, v] of e) { r -= v; if (r <= 0) return k; }
  return e[e.length - 1][0];
};
const pick = <T>(rng: RNG, a: readonly T[]): T => a[Math.floor(rng() * a.length)];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Audio-derived taste: how much each mood fits this song. */
export function moodScores(A: Analysis): Record<MoodId, number> {
  let e = 0, e2 = 0, c = 0;
  for (let i = 0; i < A.n; i += 10) { e += A.rms[i]; e2 += A.rms[i] * A.rms[i]; c += A.centroid[i]; }
  const n = Math.ceil(A.n / 10);
  const mean = e / n, dyn = Math.sqrt(Math.max(0, e2 / n - mean * mean)), bright = c / n;
  const dropRatio = A.sections.filter((s) => s.type === 2).reduce((a, s) => a + s.end - s.start, 0) / A.duration;
  const bpm = A.bpm;
  const dnb = bpm >= 160 && bpm <= 180 ? 1 : bpm >= 80 && bpm <= 90 ? 0.7 : 0;
  return {
    liquid: 1 + dnb * 1.5 + (1 - mean) * 0.8 + (1 - dyn) * 0.4,
    night: 1 + (bpm >= 95 && bpm <= 135 ? 1 : 0.2) + mean * 0.6,
    dream: 1 + (1 - mean) * 1.2 + bright * 0.6 + (bpm < 110 ? 0.5 : 0),
    hype: 0.6 + mean * 1.6 + dropRatio * 1.5 + (bpm > 140 ? 0.4 : 0),
    retro: 1 + (bpm >= 110 && bpm <= 150 ? 0.4 : 0) + bright * 0.3,
    cosmic: 1 + (1 - bright) * 0.8 + dyn * 0.6,
    japan: 0.9 + (bpm >= 70 && bpm <= 130 ? 0.3 : 0),
  };
}

// ------------------------------------------------------------------ layout
type Slot = Partial<Record<HudElementId | 'card', [number, number, number]>>; // x, y, size
interface Archetype { name: string; when?: (f: Flags) => boolean; slots: (f: Flags, a: Aspect) => Slot; shape?: 'square' | 'circle'; lyrics?: LyricsStyle[] }
interface Flags { card: boolean; lyrics: boolean; avatar: boolean; radial: boolean }

const ARCH: Archetype[] = [
  {
    name: 'センター', slots: (f, a) => a === '9:16'
      ? { icon: [0.5, 0.3, 1.3], text: [0.5, 0.5, 1.0], lyrics: [0.5, 0.67, 0.95], spectrum: [0.5, 0.88, 0.9], readout: [0.3, 0.05, 1] }
      : f.lyrics
        ? { icon: [0.72, 0.4, 1.05], text: [0.72, 0.78, 0.85], lyrics: [0.3, 0.48, 0.95], spectrum: [0.5, 0.92, 0.8], readout: [0.14, 0.06, 1] }
        : { icon: [0.5, 0.4, 1.3], text: [0.5, 0.79, 0.9], spectrum: [0.5, 0.92, 0.8], readout: [0.14, 0.06, 1] },
  },
  {
    name: 'サイドプロフィール', when: (f) => !f.card, shape: 'circle', slots: (f, a) => a === '9:16'
      ? { icon: [0.25, 0.13, 0.6], text: [0.3, 0.24, 0.8], lyrics: [0.5, 0.55, 1.0], spectrum: [0.5, 0.9, 0.95], readout: [0.75, 0.04, 0.9] }
      : { icon: [0.18, 0.4, 0.85], text: [0.18, 0.74, 0.75], lyrics: [0.64, 0.45, 0.95], spectrum: [0.64, 0.88, 0.85], readout: [0.86, 0.06, 0.9] },
  },
  {
    name: 'コーナー', lyrics: ['apple', 'minimal', 'karaoke'], slots: (f, a) => a === '9:16'
      ? { icon: [0.16, 0.9, 0.42], text: [0.36, 0.905, 0.62], lyrics: [0.5, 0.5, 1.05], spectrum: [0.5, 0.78, 0.8], readout: [0.3, 0.04, 0.9] }
      : { icon: [0.08, 0.86, 0.42], text: [0.32, 0.87, 0.65], lyrics: [0.5, 0.46, 1.05], spectrum: [0.78, 0.9, 0.6], readout: [0.86, 0.06, 0.9] },
  },
  {
    name: 'サークル', when: (f) => f.radial, shape: 'circle', slots: (f, a) => a === '9:16'
      ? { icon: [0.5, 0.33, 1.0], spectrum: [0.5, 0.33, 1.35], text: [0.5, 0.58, 0.95], lyrics: [0.5, 0.75, 0.9], readout: [0.3, 0.04, 0.9] }
      : f.lyrics
        ? { icon: [0.72, 0.42, 0.8], spectrum: [0.72, 0.42, 1.1], text: [0.72, 0.82, 0.8], lyrics: [0.28, 0.48, 0.9], readout: [0.14, 0.06, 1] }
        : { icon: [0.5, 0.42, 0.95], spectrum: [0.5, 0.42, 1.3], text: [0.5, 0.86, 0.85], readout: [0.14, 0.06, 1] },
  },
  {
    name: 'カード主役', when: (f) => f.card, shape: 'square', lyrics: ['karaoke', 'minimal'], slots: (f, a) => a === '9:16'
      ? { card: [0.5, 0.36, 1.2], icon: [0.13, 0.07, 0.3], text: [0.5, 0.66, 0.9], lyrics: [0.5, 0.78, 0.85], spectrum: [0.5, 0.92, 0.85] }
      : { card: [0.5, 0.42, 1.15], icon: [0.07, 0.11, 0.32], text: [0.5, 0.84, 0.8], lyrics: [0.5, 0.71, 0.85], spectrum: [0.5, 0.94, 0.7], readout: [0.86, 0.06, 0.9] },
  },
  {
    name: 'ミニマル', lyrics: ['minimal', 'karaoke', 'apple'], slots: (f, a) => a === '9:16'
      ? { text: [0.5, 0.86, 0.85], spectrum: [0.5, 0.93, 0.7], lyrics: [0.5, 0.5, 1.05] }
      : { text: [0.5, 0.86, 0.8], spectrum: [0.5, 0.94, 0.6], lyrics: [0.5, 0.5, 1.1] },
  },
];

interface Box { id: string; x0: number; y0: number; x1: number; y1: number; mob: number }

/** push overlapping boxes apart, keep them inside a safe area */
function solve(boxes: Box[], allow: (a: string, b: string) => boolean, margin = 0.035, iters = 40) {
  for (let it = 0; it < iters; it++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (allow(a.id, b.id)) continue;
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 0.012;
      const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + 0.012;
      if (ox <= 0 || oy <= 0) continue;
      moved = true;
      const tot = a.mob + b.mob || 1;
      const ka = a.mob / tot, kb = b.mob / tot;
      if (ox < oy) {
        const dir = (a.x0 + a.x1) < (b.x0 + b.x1) ? -1 : 1;
        shift(a, dir * ox * ka, 0); shift(b, -dir * ox * kb, 0);
      } else {
        const dir = (a.y0 + a.y1) < (b.y0 + b.y1) ? -1 : 1;
        shift(a, 0, dir * oy * ka); shift(b, 0, -dir * oy * kb);
      }
    }
    for (const b of boxes) {
      const w = b.x1 - b.x0, h = b.y1 - b.y0;
      const dx = b.x0 < margin ? margin - b.x0 : b.x1 > 1 - margin ? 1 - margin - b.x1 : 0;
      const dy = b.y0 < margin ? margin - b.y0 : b.y1 > 1 - margin ? 1 - margin - b.y1 : 0;
      if (w < 1 - 2 * margin) shift(b, dx, 0);
      if (h < 1 - 2 * margin) shift(b, 0, dy);
    }
    if (!moved) break;
  }
}
function shift(b: Box, dx: number, dy: number) { b.x0 += dx; b.x1 += dx; b.y0 += dy; b.y1 += dy; }
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

// ------------------------------------------------------------------ the roll
export function roll(ctx: DirectorContext, current: Recipe, locks: Set<ReelId>, seed: number, forceMood?: MoodId): Recipe {
  const rng = mulberry32(seed);
  const keep = <K extends ReelId>(id: K) => locks.has(id);
  const A = ctx.A;
  const r: Recipe = structuredClone(current);

  // 1. mood
  if (!keep('mood')) {
    if (forceMood) r.mood = forceMood;
    else {
      const sc = moodScores(A);
      r.mood = pickW(rng, Object.fromEntries(Object.entries(sc).map(([k, v]) => [k, Math.pow(v, 2.2)])) as W<MoodId>);
    }
  }
  const M = MOODS[r.mood];
  const energyAudio = Math.min(1, moodScores(A).hype / 3);
  const E = clamp(lerp(M.energy, energyAudio, 0.35) + (rng() - 0.5) * 0.2, 0.1, 1);

  // 2. theme
  if (!keep('theme')) {
    let avail = Object.fromEntries(Object.entries(M.templates).filter(([k]) => ctx.templates.some((t) => t.id === k)));
    if (!Object.keys(avail).length) avail = Object.fromEntries(ctx.templates.map((t) => [t.id, 1]));
    r.theme = {
      tpl: pickW(rng, avail as W<string>),
      seed: Math.floor(rng() * 1e6),
      params: { intensity: r2(lerp(0.75, 1.5, E) + (rng() - 0.5) * 0.15), speed: r2(lerp(0.7, 1.3, rng())), hue: Math.round((rng() - 0.5) * 50) },
    };
  }

  // 3. color
  if (!keep('color')) {
    const p = pick(rng, M.palettes);
    const swap = rng() < 0.3;
    r.color = { accent: swap ? p[1] : p[0], accent2: swap ? p[0] : p[1], text: p[2] };
  }

  // 4. media presentation
  if (!keep('media')) {
    const n = ctx.mediaCount;
    let mode: MediaMode = 'off';
    if (n > 0) {
      const cardBias = (n <= 2 ? 0.55 : 0.25) + (ctx.hasVideo ? -0.15 : 0) + (r.mood === 'dream' || r.mood === 'retro' ? 0.15 : 0);
      mode = rng() < cardBias ? 'card' : 'background';
    }
    // aim for a cut every ~2.5–6s (faster for energetic songs), quantised to musical lengths
    const beat = 60 / A.bpm;
    const target = lerp(6, 2.2, E) * (n > 3 ? 0.85 : 1);
    const choices = [2, 4, 8, 16, 32];
    const bpc = choices.reduce((best, c) => Math.abs(c * beat - target) < Math.abs(best * beat - target) ? c : best, 8);
    r.media = {
      mode, blend: pickW(rng, M.blend), beatsPerCut: bpc,
      mix: r2(mode === 'background' ? lerp(0.6, 0.95, rng()) : 0.85), motion: r2(lerp(0.5, 1.6, E)), tilt: r2(lerp(0.3, 1.3, rng())),
    };
  }

  // 5. layout (+ meter style, since a circular analyser changes the composition)
  const radialWanted = !keep('meter') ? pickW(rng, M.spectrum) : r.meter.spectrumStyle;
  if (!keep('meter')) {
    r.meter = { spectrumStyle: radialWanted, scope: rng() < 0.18 * (1 + E), phase: rng() < 0.12 * (1 + E), readout: rng() < 0.55 };
  }
  if (!keep('layout')) {
    const flags: Flags = { card: r.media.mode === 'card', lyrics: ctx.lyrics, avatar: ctx.hasAvatar, radial: r.meter.spectrumStyle === 'radial' };
    const cands = ARCH.filter((a) => !a.when || a.when(flags));
    const weights = Object.fromEntries(cands.map((a) => [a.name, (a.name === 'カード主役' ? 4 : a.name === 'サークル' ? 3 : 1) * (a.name === 'ミニマル' && !ctx.lyrics ? 0.4 : 1)]));
    const chosen = pickW(rng, weights as W<string>);
    const arch = cands.find((a) => a.name === chosen) ?? cands[0];
    const slots = arch.slots(flags, ctx.aspect);
    const els = structuredClone(current.layout.elements);
    for (const id of Object.keys(els) as HudElementId[]) els[id].on = false;
    const jit = () => (rng() - 0.5) * 0.04;
    for (const [id, v] of Object.entries(slots) as [HudElementId | 'card', [number, number, number]][]) {
      if (id === 'card') continue;
      if (id === 'icon' && !ctx.hasAvatar) continue;
      if (id === 'lyrics' && !ctx.lyrics) continue;
      els[id] = { on: true, x: r2(v[0] + jit()), y: r2(v[1] + jit() * 0.6), size: r2(v[2] * lerp(0.92, 1.08, rng())) };
    }
    if (!slots.text) els.text.on = false;
    els.readout.on = !!slots.readout && r.meter.readout;
    if (r.meter.scope) els.scope = { on: true, x: 0.5, y: ctx.aspect === '9:16' ? 0.12 : 0.15, size: 0.8 };
    if (r.meter.phase) els.phase = { on: true, x: ctx.aspect === '9:16' ? 0.82 : 0.9, y: ctx.aspect === '9:16' ? 0.12 : 0.2, size: 0.7 };
    if (!slots.spectrum) els.spectrum.on = false;
    const c = slots.card ?? [0.5, 0.42, 1.1];
    const lyricsStyle = pickW(rng, Object.fromEntries(Object.entries(M.lyrics).filter(([k]) => !arch.lyrics || arch.lyrics.includes(k as LyricsStyle))) as W<LyricsStyle>);
    r.layout = {
      name: arch.name, elements: els, iconShape: arch.shape ?? (rng() < 0.6 ? 'square' : 'circle'),
      card: { x: c[0], y: c[1], size: c[2] }, lyricsStyle,
    };
    resolveLayout(ctx, r, arch.name === 'サークル');
  }

  // 6. fonts
  if (!keep('font')) r.font = { title: pick(rng, M.titleFonts), user: pick(rng, M.userFonts), lyrics: pick(rng, M.lyricFonts), telop: pick(rng, M.telopFonts) };

  // 7. effects
  if (!keep('fx')) {
    const tier = E > 0.72 ? 'ド派手' : E > 0.42 ? 'ふつう' : '控えめ';
    r.fx = {
      tier,
      glitter: r2(lerp(0.4, 1.7, E) * lerp(0.8, 1.2, rng())), bloom: r2(lerp(0.6, 1.5, E)), dim: r2(r.media.mode === 'background' ? lerp(0.28, 0.45, rng()) : lerp(0, 0.2, rng())),
      iconFx: {
        filter: pickW(rng, M.iconFilter), frame: pickW(rng, M.iconFrame),
        pulse: r2(lerp(0.2, 1.1, E)), tilt: r2(lerp(0.1, 0.9, rng())), rgb: r2(lerp(0, 0.9, E * rng() + E * 0.3)),
        glitch: r2(lerp(0, 1.2, E) * (r.mood === 'retro' || r.mood === 'hype' ? 1.2 : 0.6)), glow: r2(lerp(0.2, 1.0, rng())),
      },
    };
  }

  // 8. telops
  if (!keep('telop')) r.telop = { items: choreograph(ctx, r, rng) };
  else r.telop = { items: current.telop.items };
  return r;
}

/** place elements with the box solver using real measured sizes */
function resolveLayout(ctx: DirectorContext, r: Recipe, allowIconSpectrum: boolean) {
  const boxes: Box[] = [];
  const mob: Record<string, number> = { icon: 0.35, card: 0.2, text: 1, spectrum: 0.8, lyrics: 0.7, readout: 1, scope: 1, phase: 1 };
  const toN = (b: [number, number, number, number]): [number, number, number, number] => [b[0] / ctx.W, b[1] / ctx.H, b[2] / ctx.W, b[3] / ctx.H];
  for (const id of Object.keys(r.layout.elements) as HudElementId[]) {
    if (!r.layout.elements[id].on) continue;
    const b = ctx.measure({ el: id }, r);
    if (!b) continue;
    const [x0, y0, x1, y1] = toN(b);
    boxes.push({ id, x0, y0, x1, y1, mob: mob[id] ?? 1 });
  }
  if (r.media.mode === 'card') {
    const b = ctx.measure({ card: true }, r);
    if (b) { const [x0, y0, x1, y1] = toN(b); boxes.push({ id: 'card', x0, y0, x1, y1, mob: mob.card }); }
  }
  solve(boxes, (a, b) => allowIconSpectrum && ((a === 'icon' && b === 'spectrum') || (a === 'spectrum' && b === 'icon')));
  for (const b of boxes) {
    const before = b.id === 'card' ? null : r.layout.elements[b.id as HudElementId];
    const orig = ctx.measure(b.id === 'card' ? { card: true } : { el: b.id as HudElementId }, r)!;
    const [ox0, oy0] = toN(orig);
    const dx = b.x0 - ox0, dy = b.y0 - oy0;
    if (before) { before.x = r2(clamp(before.x + dx, 0, 1)); before.y = r2(clamp(before.y + dy, 0, 1)); }
    else { r.layout.card.x = r2(clamp(r.layout.card.x + dx, 0, 1)); r.layout.card.y = r2(clamp(r.layout.card.y + dy, 0, 1)); }
  }
}

/** Put the words onto the song structure and into free screen space. */
function choreograph(ctx: DirectorContext, r: Recipe, rng: RNG): TextItem[] {
  const M = MOODS[r.mood];
  const A = ctx.A;
  let words = ctx.words.filter((w) => w.trim());
  if (!words.length) {
    // nothing given: a few tasteful defaults from the track info
    const pool = [ctx.title && `「${ctx.title}」`, 'NEW TRACK', ctx.username && (ctx.username.startsWith('@') ? ctx.username : '@' + ctx.username), 'OUT NOW'].filter(Boolean) as string[];
    words = pool.slice(0, 1 + Math.floor(rng() * Math.min(3, pool.length)));
  }
  const bar = (60 / A.bpm) * 4;
  // anchor points: section starts (drops first), then every 8 bars
  const anchors: { t: number; w: number }[] = [];
  for (const s of A.sections) anchors.push({ t: s.start, w: s.type === 2 ? 5 : s.type === 1 ? 3 : 2 });
  for (let t = A.beatOffset + bar * 8; t < A.duration - bar * 4; t += bar * 8) anchors.push({ t, w: 1 });
  anchors.push({ t: Math.max(0, A.beatOffset), w: 4 });
  // choose distinct anchors in time order (weighted, spread out)
  const chosen: number[] = [];
  const minGap = bar * 4;
  const pool = anchors.filter((a) => a.t >= 0 && a.t < A.duration - bar * 2);
  while (chosen.length < words.length && pool.length) {
    const wsum = pool.reduce((s, a) => s + a.w, 0);
    let x = rng() * wsum, k = 0;
    for (; k < pool.length; k++) { x -= pool[k].w; if (x <= 0) break; }
    const a = pool.splice(Math.min(k, pool.length - 1), 1)[0];
    if (chosen.every((c) => Math.abs(c - a.t) >= minGap)) chosen.push(a.t);
  }
  chosen.sort((a, b) => a - b);

  // free screen spots: grid candidates scored by distance from occupied boxes
  const occupied: [number, number, number, number][] = [];
  for (const id of Object.keys(r.layout.elements) as HudElementId[]) {
    if (!r.layout.elements[id].on) continue;
    const b = ctx.measure({ el: id }, r);
    if (b) occupied.push([b[0] / ctx.W, b[1] / ctx.H, b[2] / ctx.W, b[3] / ctx.H]);
  }
  if (r.media.mode === 'card') { const b = ctx.measure({ card: true }, r); if (b) occupied.push([b[0] / ctx.W, b[1] / ctx.H, b[2] / ctx.W, b[3] / ctx.H]); }
  const spots: [number, number][] = [];
  for (const y of [0.14, 0.24, 0.5, 0.66, 0.76]) for (const x of ctx.aspect === '9:16' ? [0.5, 0.3, 0.7] : [0.22, 0.5, 0.78]) spots.push([x, y]);

  const items: TextItem[] = [];
  const style = pickW(rng, M.telopStyle), anim = pickW(rng, M.telopAnim);
  const font = r.font.telop;
  words.slice(0, chosen.length).forEach((text, i) => {
    const len = [...text].length;
    const size = Math.round(clamp(150 - len * 6, 44, ctx.aspect === '9:16' ? 96 : 120) * lerp(0.9, 1.1, rng()));
    const bars = len > 14 ? 4 : 2 + Math.floor(rng() * 2) * 2;
    const start = Math.max(0, chosen[i] - 0.05);
    const end = Math.min(A.duration, chosen[i] + bars * bar);
    const it = newTextItem({
      text, font, size, style: rng() < 0.75 ? style : pickW(rng, M.telopStyle), anim: rng() < 0.75 ? anim : pickW(rng, M.telopAnim),
      color: style === 'box' ? (rng() < 0.5 ? '#ffffff' : '#1b1040') : r.color.text,
      boxColor: rng() < 0.6 ? r.color.accent2 : r.color.accent,
      rotate: style === 'box' || anim === 'pop' ? Math.round((rng() - 0.5) * 10) : 0, align: 'center', start: +start.toFixed(2), end: +end.toFixed(2),
    });
    // best free spot for this telop's real size
    let best: [number, number] = [0.5, 0.25], bestScore = -Infinity;
    for (const [x, y] of spots) {
      it.x = x; it.y = y;
      const b = ctx.measure({ text: it }, r);
      if (!b) continue;
      const tb = { id: 't', x0: b[0] / ctx.W, y0: b[1] / ctx.H, x1: b[2] / ctx.W, y1: b[3] / ctx.H, mob: 1 };
      if (tb.x0 < 0.02 || tb.x1 > 0.98 || tb.y0 < 0.02 || tb.y1 > 0.98) continue;
      const ov = occupied.reduce((s, o) => s + overlap(tb, { id: 'o', x0: o[0], y0: o[1], x1: o[2], y1: o[3], mob: 1 }), 0);
      const prev = items[items.length - 1];
      const samePlace = prev && Math.abs(prev.x - x) < 0.01 && Math.abs(prev.y - y) < 0.01 ? 0.02 : 0;
      const score = -ov * 50 - samePlace + rng() * 0.01 - Math.abs(y - 0.3) * 0.005;
      if (score > bestScore) { bestScore = score; best = [x, y]; }
    }
    it.x = best[0]; it.y = best[1];
    items.push(it);
  });
  return items;
}

// ------------------------------------------------------------------ labels for the reels
export function reelLabel(id: ReelId, r: Recipe, ctx: { templates: { id: string; name: string }[]; spectrumNames: Record<string, string>; fontNames: Record<string, string>; filterNames: Record<string, string> }): string {
  switch (id) {
    case 'mood': return `${MOODS[r.mood].emoji} ${MOODS[r.mood].name}`;
    case 'theme': return ctx.templates.find((t) => t.id === r.theme.tpl)?.name ?? r.theme.tpl;
    case 'color': return `${r.color.accent} ${r.color.accent2}`;
    case 'media': return r.media.mode === 'off' ? '素材なし' : `${r.media.mode === 'card' ? '3Dカード' : '背景'} · ${r.media.beatsPerCut}拍で切替`;
    case 'layout': return r.layout.name;
    case 'font': return `${ctx.fontNames[r.font.title]} × ${ctx.fontNames[r.font.telop]}`;
    case 'meter': return ctx.spectrumNames[r.meter.spectrumStyle] + (r.meter.scope ? '+波形' : '') + (r.meter.phase ? '+位相' : '');
    case 'fx': return `${r.fx.tier} · ${ctx.filterNames[r.fx.iconFx.filter]}`;
    case 'telop': return r.telop.items.length ? `${r.telop.items.length}個 · ${r.telop.items.map((x) => x.text).slice(0, 2).join(' / ')}` : 'なし';
  }
}
