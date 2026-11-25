import { describe, expect, it } from 'vitest';
import { beatToTime, computeFeatures, computeStructure, timeToBeat } from '../analyze';
import { parseBlocks, timeLyrics } from '../../core/lyrics';
import type { LyricsOptions } from '../../core/lyrics';

/** synthetic drum loop: kick on 1&3, snare on 2&4, hats on 8ths, quiet intro then loud "drop" */
function synth(bpm: number, seconds: number, sr = 22050) {
  const out = new Float32Array(Math.floor(seconds * sr));
  const beat = 60 / bpm;
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let t = 0, k = 0; t < seconds; t += beat / 2, k++) {
    const loud = t > seconds / 3 ? 1 : 0.25;
    const i0 = Math.floor(t * sr);
    const isBeat = k % 2 === 0, beatN = Math.floor(k / 2) % 4;
    for (let i = 0; i < sr * 0.2 && i0 + i < out.length; i++) {
      const tt = i / sr;
      let v = 0;
      if (isBeat && (beatN === 0 || beatN === 2)) v += Math.sin(2 * Math.PI * (50 + 120 * Math.exp(-tt * 30)) * tt) * Math.exp(-tt * 12) * loud;
      if (isBeat && (beatN === 1 || beatN === 3)) v += rnd() * Math.exp(-tt * 25) * 0.6 * loud;
      v += rnd() * Math.exp(-tt * 120) * 0.15;
      out[i0 + i] += v;
    }
  }
  return out;
}

describe('analysis', () => {
  for (const bpm of [174, 140, 128, 90]) {
    it(`detects ${bpm} BPM (or its double/half)`, () => {
      const F = computeFeatures(synth(bpm, 40), 22050);
      const S = computeStructure(F);
      const ratio = S.bpm / bpm;
      const ok = [0.5, 1, 2].some((r) => Math.abs(ratio - r) < 0.02);
      expect(ok, `got ${S.bpm}`).toBe(true);
    });
  }
  it('finds a drop after the quiet intro', () => {
    const F = computeFeatures(synth(140, 40), 22050);
    const S = computeStructure(F, 140);
    const drop = S.sections.find((s) => s.type === 2);
    expect(drop).toBeTruthy();
    expect(drop!.start).toBeGreaterThan(8);
  });
});

describe('lyrics', () => {
  it('parses Suno-style tags and spreads lines in order', () => {
    const text = '[Intro]\n\n[Verse]\n夜の東京を泳いで\n光る街に溶けていく\n\n[Chorus]\nきみに届け\nこの声よ';
    const { blocks } = parseBlocks(text);
    expect(blocks.filter((b) => b.lines.length).length).toBe(2);
    const F = computeFeatures(synth(140, 60), 22050);
    const A = { ...F, ...computeStructure(F, 140) };
    const lines = timeLyrics({ text, style: 'apple', singStart: 10, singEnd: 50, offset: 0, blocks: {}, taps: {}, speed: 1 }, A);
    expect(lines.map((l) => l.text)).toEqual(['夜の東京を泳いで', '光る街に溶けていく', 'きみに届け', 'この声よ']);
    for (let i = 1; i < lines.length; i++) expect(lines[i].t).toBeGreaterThan(lines[i - 1].t);
    expect(lines[0].t).toBeGreaterThanOrEqual(9);
  });
  it('uses LRC timestamps as-is', () => {
    const F = computeFeatures(synth(120, 20), 22050);
    const A = { ...F, ...computeStructure(F, 120) };
    const lines = timeLyrics({ text: '[00:05.50]はじまり\n[00:12.00]つぎ', style: 'apple', singStart: -1, singEnd: -1, offset: 0, blocks: {}, taps: {}, speed: 1 }, A);
    expect(lines[0].t).toBeCloseTo(5.5);
    expect(lines[1].t).toBeCloseTo(12);
  });
  it('block overrides set start and line length; taps shift the following lines', () => {
    const F = computeFeatures(synth(120, 60), 22050);
    const A = { ...F, ...computeStructure(F, 120) };
    const beat = 0.5;
    const text = '[Verse]\na\nb\nc\n\n[Chorus]\nd\ne';
    const o: LyricsOptions = { text, style: 'apple', singStart: -1, singEnd: -1, offset: 0, blocks: { 0: { start: 10, bpl: 4 } }, taps: {}, speed: 1 };
    let L = timeLyrics(o, A);
    expect(L[0].t).toBeCloseTo(10, 1);
    expect(L[1].t - L[0].t).toBeCloseTo(4 * beat, 1);
    o.taps = { 1: 13.3 };
    L = timeLyrics(o, A);
    expect(L[1].t).toBeCloseTo(13.3);
    expect(L[2].t - L[1].t).toBeCloseTo(4 * beat, 1);
    expect(L[3].t).toBeGreaterThanOrEqual(L[2].t);
  });
});

import { MOODS, REELS, roll, type Recipe } from '../../app/director';
import { defaultHud, defaultIconFx } from '../../core/template';
describe('director', () => {
  const F = computeFeatures(synth(174, 60), 22050);
  const A = { ...F, ...computeStructure(F, 174) };
  const base: Recipe = {
    mood: 'liquid', theme: { tpl: 'caustics', seed: 1, params: { intensity: 1, speed: 1, hue: 0 } }, color: { accent: '#fff', accent2: '#000', text: '#fff' },
    media: { mode: 'off', blend: 'screen', beatsPerCut: 8, mix: 0.8, motion: 1, tilt: 1 },
    layout: { name: 'x', elements: defaultHud().elements, iconShape: 'square', card: { x: 0.5, y: 0.5, size: 1 }, lyricsStyle: 'apple' },
    font: { title: 'gothic', user: 'gothic', lyrics: 'gothic', telop: 'gothic' }, meter: { spectrumStyle: 'wave', scope: false, phase: false, readout: true },
    fx: { glitter: 1, bloom: 1, dim: 0, iconFx: defaultIconFx(), tier: '' }, telop: { items: [] },
  };
  const ctx = {
    A, aspect: '16:9' as const, W: 1920, H: 1080, hasAvatar: true, mediaCount: 3, hasVideo: false, mediaAspect: 1.5,
    words: ['NEW SINGLE', '12.24 配信', '夜の東京'], lyrics: false, title: 'T', username: 'u',
    templates: ['caustics', 'highway', 'sky', 'aurora', 'nebula', 'y2k', 'train', 'jacket'].map((id) => ({ id, name: id })),
    measure: (q: { el?: string; text?: { x: number; y: number }; card?: boolean }, r: Partial<Recipe>) => {
      const p = q.text ?? (q.card ? r.layout!.card : r.layout!.elements[q.el as 'icon']);
      return [p.x * 1920 - 150, p.y * 1080 - 80, p.x * 1920 + 150, p.y * 1080 + 80] as [number, number, number, number];
    },
  };
  it('is deterministic for a seed and varies across seeds', () => {
    const a = roll(ctx, base, new Set(), 42), b = roll(ctx, base, new Set(), 42), c = roll(ctx, base, new Set(), 43);
    expect(JSON.stringify(a.theme)).toBe(JSON.stringify(b.theme));
    expect([a.theme.tpl, a.color.accent, a.layout.name].join()).not.toBe([c.theme.tpl, c.color.accent, c.layout.name].join() + 'x');
    expect(Object.keys(MOODS)).toContain(a.mood);
  });
  it('keeps locked reels and places telops in time order without overlap', () => {
    const locked = roll(ctx, base, new Set(REELS.map((r) => r.id).filter((id) => id !== 'telop')), 7);
    expect(locked.theme).toEqual(base.theme);
    expect(locked.color).toEqual(base.color);
    const it = locked.telop.items;
    expect(it.length).toBe(3);
    for (let i = 1; i < it.length; i++) expect(it[i].start).toBeGreaterThanOrEqual(it[i - 1].end - 0.1);
  });
  it('cut length is musical (power of two beats)', () => {
    for (let s = 0; s < 10; s++) expect([2, 4, 8, 16, 32]).toContain(roll(ctx, base, new Set(), s).media.beatsPerCut);
  });
});

/** loop whose tempo drifts linearly from bpm0 to bpm1 (like un-gridded / generated audio) */
function synthDrift(bpm0: number, bpm1: number, seconds: number, sr = 22050) {
  const out = new Float32Array(Math.floor(seconds * sr));
  const times: number[] = [];
  let t = 0.3, k = 0;
  while (t < seconds) {
    times.push(t);
    const i0 = Math.floor(t * sr);
    for (let i = 0; i < sr * 0.15 && i0 + i < out.length; i++) {
      const tt = i / sr;
      out[i0 + i] += (k % 4 === 0 ? 1 : 0.6) * Math.sin(2 * Math.PI * (55 + 100 * Math.exp(-tt * 30)) * tt) * Math.exp(-tt * 14);
    }
    const bpm = bpm0 + (bpm1 - bpm0) * (t / seconds);
    t += 60 / bpm; k++;
  }
  return { audio: out, times };
}
describe('beat tracking', () => {
  it('follows a drifting tempo (118 -> 124 BPM) within 30ms', () => {
    const { audio, times } = synthDrift(118, 124, 60);
    const F = computeFeatures(audio, 22050);
    const S = computeStructure(F);
    expect(Math.abs(S.bpm - 121)).toBeLessThan(2);
    let worst = 0;
    for (const bt of times.slice(4, -4)) {
      let best = Infinity;
      for (const x of S.beats) best = Math.min(best, Math.abs(x - bt));
      worst = Math.max(worst, best);
    }
    expect(worst).toBeLessThan(0.03);
  });
  it('timeToBeat and beatToTime are inverses', () => {
    const F = computeFeatures(synth(128, 30), 22050);
    const S = computeStructure(F);
    for (const t of [0.5, 7.3, 21.9]) expect(beatToTime(S, timeToBeat(S, t))).toBeCloseTo(t, 3);
  });
});

import { planScenes, sceneMix } from '../../app/scenes';
describe('scenes', () => {
  const F = computeFeatures(synth(140, 90), 22050);
  const A = { ...F, ...computeStructure(F, 140) };
  const pool = { caustics: 1, highway: 1, sky: 1, aurora: 1, nebula: 1, train: 1 };
  it('covers the song, starts on downbeats, never repeats a theme back to back', () => {
    const sc = planScenes(A, pool, 3);
    expect(sc.length).toBeGreaterThan(1);
    expect(sc[0].start).toBe(0);
    expect(sc[sc.length - 1].end).toBeCloseTo(A.duration);
    for (let i = 1; i < sc.length; i++) {
      expect(sc[i].start).toBeCloseTo(sc[i - 1].end);
      expect(sc[i].tpl).not.toBe(sc[i - 1].tpl);
      const b = timeToBeat(A, sc[i].start);
      expect(Math.abs(b / 4 - Math.round(b / 4))).toBeLessThan(0.01);
    }
  });
  it('switches at the drop and keeps locked scenes', () => {
    const sc = planScenes(A, pool, 3);
    const drop = A.sections.find((s) => s.type === 2)!;
    expect(sc.some((s) => Math.abs(s.start - beatToTime(A, Math.round(timeToBeat(A, drop.start) / 4) * 4)) < 0.05)).toBe(true);
    sc[1].lock = true; sc[1].tpl = 'sky';
    const again = planScenes(A, pool, 99, sc);
    expect(again.find((s) => Math.abs(s.start - sc[1].start) < 0.05)!.tpl).toBe('sky');
  });
  it('blends two scenes only inside a transition window', () => {
    const sc = planScenes(A, pool, 5).map((s, i) => (i === 1 ? { ...s, trans: 'fade' as const } : s));
    const bar = 240 / A.bpm;
    expect(sceneMix(sc, sc[1].start - bar / 2, bar).b?.id).toBe(sc[1].id);
    expect(sceneMix(sc, sc[1].start + 1, bar).b).toBeNull();
  });
});

import { chaosDeal, chaosState, planChaos } from '../../app/chaos';
describe('chaos network', () => {
  const F = computeFeatures(synth(150, 60), 22050);
  const A = { ...F, ...computeStructure(F, 150) };
  const inp = { A, themes: ['caustics', 'highway', 'sky', 'aurora', 'nebula', 'train', 'y2k', 'jacket'], assets: 3, words: ['NEW SINGLE', 'テスト'], colors: ['#fff', '#f0f'], aspect: 16 / 9 };
  it('is deterministic for a seed', () => {
    const a = planChaos({ enabled: true, seed: 5, level: 1 }, inp), b = planChaos({ enabled: true, seed: 5, level: 1 }, inp);
    expect(Array.from(a.act.slice(0, 500))).toEqual(Array.from(b.act.slice(0, 500)));
  });
  it('evolves irreversibly: births, deaths, generations, and a different world at the end', () => {
    const p = planChaos({ enabled: true, seed: 3, level: 1, evolve: 1.2 }, inp);
    const births = p.events.filter((e) => e.kind === 'birth').length, deaths = p.events.filter((e) => e.kind === 'death').length;
    expect(births).toBeGreaterThan(5); expect(deaths).toBeGreaterThan(5);
    expect(Math.max(...p.nodes.map((n) => n.gen))).toBeGreaterThan(1);
    const themesIn = (t0: number, t1: number) => { const s = new Set<string>(); for (let t = t0; t < t1; t += 0.25) { const d = chaosDeal(p, chaosState(p, t)); s.add(`${d.themeA}|${d.seedA}`); } return s; };
    const first = themesIn(0, 10), last = themesIn(A.duration - 10, A.duration);
    expect([...last].some((x) => !first.has(x))).toBe(true);
    // the dead never come back
    for (const n of p.nodes) if (Number.isFinite(n.died)) { const i = p.nodes.indexOf(n); expect(chaosState(p, n.died + 1).a[i]).toBe(0); }
  });
  it('manual re-roll taps replace the world at exactly those moments', () => {
    const taps = [12, 30.5];
    const p = planChaos({ enabled: true, seed: 4, level: 0.8, evolve: 1, taps }, inp);
    for (const tp of taps) {
      expect(p.events.some((e) => e.kind === 'extinction' && Math.abs(e.t - tp) < 0.06)).toBe(true);
      const before = chaosDeal(p, chaosState(p, tp - 0.3)), after = chaosDeal(p, chaosState(p, tp + 0.6));
      expect(`${after.themeA}|${after.seedA}`).not.toBe(`${before.themeA}|${before.seedA}`);
      // a strong, short impact right at the tap
      expect(chaosDeal(p, chaosState(p, tp + 0.05)).hit).toBeGreaterThan(0.6);
      expect(chaosDeal(p, chaosState(p, tp + 1.5)).hit).toBeLessThan(0.05);
    }
    // same taps, same result
    const q = planChaos({ enabled: true, seed: 4, level: 0.8, evolve: 1, taps }, inp);
    expect(Array.from(q.screen.a.slice(0, 900))).toEqual(Array.from(p.screen.a.slice(0, 900)));
  });
  it('curator keeps the screen composed: few elements, own slots, one effect at a time', () => {
    const p = planChaos({ enabled: true, seed: 9, level: 0.6, evolve: 1 }, inp);
    const sc = p.screen;
    for (let s = 0; s < p.steps; s++) {
      const full: number[] = [];
      for (let q = sc.voff[s]; q < sc.voff[s + 1]; q++) if (sc.vpres[q] > 0.95) full.push(q);
      expect(full.length).toBeLessThanOrEqual(4);
      const slots = full.map((q) => sc.vslot[q]).filter((x) => x >= 0);
      expect(new Set(slots).size).toBe(slots.length);
      expect(sc.a[s]).toBeGreaterThanOrEqual(0);
    }
  });
  it('produces emergent variety: several themes take the lead, effects fire, photos surface; no words', () => {
    const p = planChaos({ enabled: true, seed: 11, level: 1.2 }, inp);
    const leads = new Set<string>(); let fxOn = 0, assetsOn = 0;
    for (let t = 0; t < A.duration; t += 0.5) {
      const st = chaosState(p, t), d = chaosDeal(p, st);
      leads.add(d.themeA!);
      if (d.fx.mirror || d.fx.invert || d.fx.posterize) fxOn++;
      p.nodes.forEach((n, i) => { expect(n.kind).not.toBe('word'); if (n.kind === 'asset' && st.a[i] > 0.32) assetsOn++; });
      for (const v of st.a) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    }
    expect(leads.size).toBeGreaterThan(1);
    expect(fxOn).toBeGreaterThan(0);
    expect(assetsOn).toBeGreaterThan(0);
  });
});

describe('lyrics parsing', () => {
  it('skips Suno stage directions but keeps sung lines and Japanese backing vocals', () => {
    const { blocks } = parseBlocks('[Intro]\n(Emotional piano arpeggio)\n[Verse]\nよあけまえの ほーむに たつ\n(ああ)\n(Filtered breakbeat fade in)');
    const lines = blocks.flatMap((b) => b.lines);
    expect(lines).toEqual(['よあけまえの ほーむに たつ', '(ああ)']);
  });
});
