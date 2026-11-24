import { AFPS, NBANDS, NSPEC, timeToBeat, type Analysis } from '../analysis/analyze';

/** Everything a template sees at time t. Pure function of (analysis, t). */
export interface Frame {
  t: number; dur: number; prog: number;
  bpm: number;
  beat: number;      // continuous beat count from downbeat
  beatPhase: number; // 0..1
  bar: number;       // continuous bar count
  kick: number; snare: number; hat: number;
  energy: number; centroid: number;
  bands: Float32Array; spec: Float32Array;
  drop: number; dropHit: number; build: number;
  section: number; sectionIndex: number; sectionStart: number; sectionEnd: number;
  travel: number;
}

export function createFrame(): Frame {
  return {
    t: 0, dur: 1, prog: 0, bpm: 120, beat: 0, beatPhase: 0, bar: 0,
    kick: 0, snare: 0, hat: 0, energy: 0, centroid: 0,
    bands: new Float32Array(NBANDS), spec: new Float32Array(NSPEC),
    drop: 0, dropHit: 0, build: 0, section: 0, sectionIndex: 0, sectionStart: 0, sectionEnd: 1, travel: 0,
  };
}

function lerpAt(a: Float32Array, i: number, f: number) {
  const j = Math.min(a.length - 1, i + 1);
  return a[i] * (1 - f) + a[j] * f;
}

export function sampleFrame(A: Analysis, t: number, out: Frame): Frame {
  const x = Math.max(0, Math.min(A.n - 1, t * AFPS));
  const i = Math.floor(x), f = x - i;
  const j = Math.min(A.n - 1, i + 1);
  out.t = t; out.dur = A.duration; out.prog = t / A.duration; out.bpm = A.bpm;
  out.beat = timeToBeat(A, t);
  out.beatPhase = out.beat - Math.floor(out.beat);
  out.bar = out.beat / 4;
  out.kick = lerpAt(A.kick, i, f); out.snare = lerpAt(A.snare, i, f); out.hat = lerpAt(A.hat, i, f);
  out.energy = lerpAt(A.rms, i, f); out.centroid = lerpAt(A.centroid, i, f);
  for (let b = 0; b < NBANDS; b++) out.bands[b] = A.bands[i * NBANDS + b] * (1 - f) + A.bands[j * NBANDS + b] * f;
  for (let b = 0; b < NSPEC; b++) out.spec[b] = A.spec[i * NSPEC + b] * (1 - f) + A.spec[j * NSPEC + b] * f;
  out.drop = lerpAt(A.drop, i, f); out.dropHit = lerpAt(A.dropHit, i, f); out.build = lerpAt(A.build, i, f);
  out.travel = lerpAt(A.travel, i, f);
  let si = A.sections.findIndex((s) => t >= s.start && t < s.end);
  if (si < 0) si = A.sections.length - 1;
  const s = A.sections[si];
  out.section = s?.type ?? 0; out.sectionIndex = si; out.sectionStart = s?.start ?? 0; out.sectionEnd = s?.end ?? A.duration;
  return out;
}
