import { FFT } from './fft';

/** Analysis frames per second. */
export const AFPS = 100;
export const NBANDS = 8;
export const NSPEC = 32;

export type SectionType = 0 | 1 | 2 | 3; // intro/break=0, build=1, drop=2, outro=3
export interface Section { start: number; end: number; type: SectionType }

export interface Features {
  sampleRate: number;
  duration: number;
  n: number;
  rms: Float32Array;      // 0..1 normalized loudness
  centroid: Float32Array; // 0..1
  bands: Float32Array;    // n*NBANDS 0..1
  spec: Float32Array;     // n*NSPEC 0..1
  kick: Float32Array;     // decaying envelopes 0..1
  snare: Float32Array;
  hat: Float32Array;
  onset: Float32Array;    // combined onset strength (for tempo)
}

export interface Structure {
  bpm: number;          // average tempo (from the tracked beats)
  beatOffset: number;   // time (s) of the first downbeat
  beats: Float32Array;  // tracked beat times (s) — follows tempo drift
  downbeat: number;     // index into beats of a downbeat (beat 1 of a bar)
  tempoDrift: number;   // std-dev of local tempo in BPM (0 = perfectly steady)
  sections: Section[];
  drop: Float32Array;    // smoothed 0..1 "in drop"
  dropHit: Float32Array; // decays from 1 at each drop start
  build: Float32Array;   // 0..1 progress through build sections
  travel: Float32Array;  // integral of (0.5 + energy) dt
}

export interface Analysis extends Features, Structure {}

const BAND_EDGES = [20, 60, 150, 400, 1000, 2500, 5000, 8000, 11025];

function quantile(arr: ArrayLike<number>, q: number): number {
  const a = Float32Array.from(arr).sort();
  if (a.length === 0) return 0;
  return a[Math.min(a.length - 1, Math.max(0, Math.floor(q * (a.length - 1))))];
}

function normalizeInPlace(a: Float32Array, lo: number, hi: number) {
  const d = hi - lo || 1;
  for (let i = 0; i < a.length; i++) a[i] = Math.min(1, Math.max(0, (a[i] - lo) / d));
}

/** Smooth with separate attack/release (one-pole). */
function envFollow(a: Float32Array, attack: number, release: number) {
  const out = new Float32Array(a.length);
  let y = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    y += (x > y ? attack : release) * (x - y);
    out[i] = y;
  }
  return out;
}

/** Peak-pick a flux curve into a decaying envelope. */
function onsetEnvelope(flux: Float32Array, decaySec: number, minGapSec: number) {
  const n = flux.length;
  const env = new Float32Array(n);
  const win = Math.round(0.25 * AFPS);
  const peaks: number[] = [];
  const strengths: number[] = [];
  let last = -1e9;
  for (let i = 1; i < n - 1; i++) {
    if (flux[i] <= flux[i - 1] || flux[i] < flux[i + 1]) continue;
    let s = 0, c = 0;
    for (let j = Math.max(0, i - win); j < Math.min(n, i + win); j++) { s += flux[j]; c++; }
    const mean = s / c;
    if (flux[i] > mean * 1.5 + 1e-4 && i - last >= minGapSec * AFPS) {
      peaks.push(i); strengths.push(flux[i]); last = i;
    }
  }
  const norm = quantile(strengths, 0.9) || 1;
  const k = Math.exp(-1 / (decaySec * AFPS));
  let pi = 0, y = 0;
  for (let i = 0; i < n; i++) {
    y *= k;
    while (pi < peaks.length && peaks[pi] === i) { y = Math.max(y, Math.min(1, strengths[pi] / norm)); pi++; }
    env[i] = y;
  }
  return env;
}

/** Heavy pass: expects mono samples (any rate, ideally 22050). */
export function computeFeatures(mono: Float32Array, sampleRate: number, onProgress?: (p: number) => void): Features {
  const N = 1024 * Math.max(1, Math.round(sampleRate / 22050));
  const fft = new FFT(N);
  const hop = sampleRate / AFPS;
  const n = Math.floor(mono.length / hop);
  const re = new Float32Array(N), im = new Float32Array(N);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const binHz = sampleRate / N;
  const half = N / 2;
  const nyq = Math.min(11025, sampleRate / 2);

  const bandBin = BAND_EDGES.map((f) => Math.min(half, Math.round(Math.min(f, nyq) / binHz)));
  const specBin: number[] = [];
  for (let i = 0; i <= NSPEC; i++) {
    const f = 30 * Math.pow(nyq / 30, i / NSPEC);
    specBin.push(Math.min(half, Math.max(1, Math.round(f / binHz))));
  }

  const rms = new Float32Array(n);
  const centroid = new Float32Array(n);
  const bands = new Float32Array(n * NBANDS);
  const spec = new Float32Array(n * NSPEC);
  const fKick = new Float32Array(n), fSnare = new Float32Array(n), fHat = new Float32Array(n), fAll = new Float32Array(n);
  const mag = new Float32Array(half), prev = new Float32Array(half);

  for (let f = 0; f < n; f++) {
    const c = Math.floor(f * hop);
    let sq = 0;
    for (let i = 0; i < N; i++) {
      const s = mono[c - N / 2 + i] ?? 0;
      re[i] = s * win[i]; im[i] = 0;
      sq += s * s;
    }
    rms[f] = Math.sqrt(sq / N);
    fft.transform(re, im);
    let wsum = 0, msum = 0;
    for (let k = 0; k < half; k++) {
      const m = Math.log1p(100 * Math.hypot(re[k], im[k]));
      mag[k] = m;
      wsum += m * k; msum += m;
    }
    centroid[f] = msum > 0 ? (wsum / msum) * binHz : 0;
    for (let b = 0; b < NBANDS; b++) {
      let s = 0;
      for (let k = bandBin[b]; k < Math.max(bandBin[b] + 1, bandBin[b + 1]); k++) s += mag[k];
      bands[f * NBANDS + b] = s / Math.max(1, bandBin[b + 1] - bandBin[b]);
    }
    for (let b = 0; b < NSPEC; b++) {
      let s = 0;
      const a = specBin[b], e = Math.max(a + 1, specBin[b + 1]);
      for (let k = a; k < e; k++) s += mag[k];
      spec[f * NSPEC + b] = s / (e - a);
    }
    let fk = 0, fs = 0, fh = 0, fa = 0;
    for (let k = 1; k < half; k++) {
      const d = mag[k] - prev[k];
      if (d > 0) {
        const hz = k * binHz;
        fa += d;
        if (hz < 150) fk += d;
        else if (hz < 5000 && hz > 180) fs += d;
        if (hz > 6000) fh += d;
      }
      prev[k] = mag[k];
    }
    fKick[f] = fk; fSnare[f] = fs; fHat[f] = fh; fAll[f] = fa;
    if (onProgress && f % 2000 === 0) onProgress(f / n);
  }

  normalizeInPlace(rms, quantile(rms, 0.05), quantile(rms, 0.98));
  normalizeInPlace(centroid, quantile(centroid, 0.05), quantile(centroid, 0.95));
  // per-band / per-bin normalization to 0..1
  const tmp = new Float32Array(n);
  for (const [arr, w] of [[bands, NBANDS], [spec, NSPEC]] as const) {
    for (let b = 0; b < w; b++) {
      for (let f = 0; f < n; f++) tmp[f] = arr[f * w + b];
      const lo = quantile(tmp, 0.1), hi = quantile(tmp, 0.98);
      for (let f = 0; f < n; f++) arr[f * w + b] = Math.min(1, Math.max(0, (arr[f * w + b] - lo) / (hi - lo || 1)));
    }
  }
  const energy = envFollow(rms, 0.5, 0.08);

  // onset strength: raw spectral flux + flux of the per-bin-normalised spectrum
  // (the latter stops loud bass from drowning out hats/snares), minus a local mean.
  const specFlux = new Float32Array(n);
  for (let f = 1; f < n; f++) {
    let sf = 0;
    for (let b = 0; b < NSPEC; b++) { const d = spec[f * NSPEC + b] - spec[(f - 1) * NSPEC + b]; if (d > 0) sf += d; }
    specFlux[f] = sf;
  }
  const qa = quantile(fAll, 0.95) || 1, qb = quantile(specFlux, 0.95) || 1;
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = fAll[i] / qa + specFlux[i] / qb;
  const onset = new Float32Array(n);
  const W = Math.round(0.4 * AFPS);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += raw[i]; if (i - W >= 0) acc -= raw[i - W];
    const mean = acc / Math.min(i + 1, W);
    onset[i] = Math.max(0, raw[i] - mean);
  }

  return {
    sampleRate, duration: mono.length / sampleRate, n,
    rms: energy, centroid: envFollow(centroid, 0.2, 0.05), bands, spec,
    kick: onsetEnvelope(fKick, 0.14, 0.09),
    snare: onsetEnvelope(fSnare, 0.12, 0.09),
    hat: onsetEnvelope(fHat, 0.06, 0.05),
    onset,
  };
}

function sampleLinear(a: Float32Array, x: number) {
  const i = Math.floor(x);
  if (i < 0 || i + 1 >= a.length) return 0;
  const f = x - i;
  return a[i] * (1 - f) + a[i + 1] * f;
}

/**
 * Tempo estimate: autocorrelation of the onset envelope, harmonically reinforced
 * (a true beat period also correlates at 2x and 4x), with a log-normal prior around 120 BPM.
 */
export function estimateTempo(onset: Float32Array): { bpm: number; candidates: { bpm: number; score: number }[] } {
  const n = onset.length;
  const maxLag = Math.ceil((60 / 50) * AFPS * 4) + 2;
  const ac = new Float32Array(maxLag);
  for (let lag = 1; lag < maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += onset[i] * onset[i + lag];
    ac[lag] = s / (n - lag);
  }
  const acAt = (lag: number) => { const i = Math.floor(lag), f = lag - i; return i + 1 < maxLag ? ac[i] * (1 - f) + ac[i + 1] * f : 0; };
  const score = (bpm: number) => {
    const lag = (60 / bpm) * AFPS;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120), 2));
    return (acAt(lag) + 0.5 * acAt(lag * 2) + 0.25 * acAt(lag * 4)) * (0.35 + 0.65 * prior);
  };
  const cands: { bpm: number; score: number }[] = [];
  let prev = -1, rising = false;
  for (let b = 60; b <= 200; b += 0.1) {
    const sc = score(b);
    if (prev >= 0 && sc < prev && rising) cands.push({ bpm: b - 0.1, score: prev });
    rising = sc > prev; prev = sc;
  }
  cands.sort((x, y) => y.score - x.score);
  let best = cands[0]?.bpm ?? 120;
  for (let b = best - 0.15; b <= best + 0.15; b += 0.005) if (score(b) > score(best)) best = b;
  return { bpm: best, candidates: cands.slice(0, 5) };
}

/**
 * Dynamic-programming beat tracker (Ellis 2007, as used by librosa): finds the beat sequence
 * that maximises onset strength at the beats while keeping inter-beat intervals close to the
 * tempo period. Unlike a fixed grid it follows tempo drift (e.g. AI-generated or live audio).
 */
export function trackBeats(onset: Float32Array, bpm: number, duration: number, tightness = 120): Float32Array {
  const n = onset.length;
  const P = (60 / bpm) * AFPS; // period in frames
  // local score: onset smoothed with a small gaussian (std = P/16)
  const sd = Math.max(1, P / 16), K = Math.ceil(sd * 3);
  const local = new Float32Array(n);
  const kern = Array.from({ length: 2 * K + 1 }, (_, j) => Math.exp(-0.5 * ((j - K) / sd) ** 2));
  let mx = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = -K; j <= K; j++) { const k = i + j; if (k >= 0 && k < n) s += onset[k] * kern[j + K]; }
    local[i] = s; if (s > mx) mx = s;
  }
  for (let i = 0; i < n; i++) local[i] /= mx || 1;
  const cum = new Float32Array(n), back = new Int32Array(n).fill(-1);
  const lo = Math.round(P / 2), hi = Math.round(P * 2);
  for (let i = 0; i < n; i++) {
    let best = -Infinity, arg = -1;
    for (let tau = i - hi; tau <= i - lo; tau++) {
      if (tau < 0) continue;
      const c = cum[tau] - tightness * Math.log((i - tau) / P) ** 2;
      if (c > best) { best = c; arg = tau; }
    }
    cum[i] = local[i] + (arg >= 0 ? best : 0);
    back[i] = arg;
  }
  // end on the best-scoring frame in the last period
  let end = n - 1, bs = -Infinity;
  for (let i = Math.max(0, n - Math.ceil(P)); i < n; i++) if (cum[i] > bs) { bs = cum[i]; end = i; }
  const idx: number[] = [];
  for (let i = end; i >= 0; i = back[i]) { idx.push(i); if (back[i] < 0) break; }
  idx.reverse();
  // drop weak leading beats (silence/intro noise), then sub-frame refine on the onset curve
  const thr = 0.08;
  let first = 0;
  while (first < idx.length - 8 && local[idx[first]] < thr) first++;
  const times = idx.slice(first).map((i) => {
    const a = local[i - 1] ?? local[i], b = local[i], c = local[i + 1] ?? local[i];
    const den = a - 2 * b + c;
    const off = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
    return (i + off) / AFPS;
  });
  if (times.length < 2) { const per = 60 / bpm; return Float32Array.from({ length: Math.ceil(duration / per) + 1 }, (_, k) => k * per); }
  // extend the grid to cover the whole song using the local period at each edge
  const head: number[] = [], tail: number[] = [];
  const p0 = (times[Math.min(8, times.length - 1)] - times[0]) / Math.min(8, times.length - 1);
  for (let t = times[0] - p0; t > -p0; t -= p0) head.unshift(t);
  const m = times.length - 1, k1 = Math.min(8, m);
  const p1 = (times[m] - times[m - k1]) / k1;
  for (let t = times[m] + p1; t < duration + p1; t += p1) tail.push(t);
  return Float32Array.from([...head, ...times, ...tail]);
}

/** continuous beat position (beats since the chosen downbeat) at time t */
export function timeToBeat(A: { beats: Float32Array; downbeat: number }, t: number): number {
  const B = A.beats, n = B.length;
  if (n < 2) return 0;
  let lo = 0, hi = n - 1;
  if (t <= B[0]) return (t - B[0]) / (B[1] - B[0]) - A.downbeat;
  if (t >= B[hi]) return hi + (t - B[hi]) / (B[hi] - B[hi - 1]) - A.downbeat;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (B[mid] <= t) lo = mid; else hi = mid; }
  return lo + (t - B[lo]) / (B[hi] - B[lo]) - A.downbeat;
}
/** time (s) of a (fractional) beat position */
export function beatToTime(A: { beats: Float32Array; downbeat: number }, beat: number): number {
  const B = A.beats, n = B.length;
  const x = beat + A.downbeat;
  if (n < 2) return 0;
  if (x <= 0) return B[0] + x * (B[1] - B[0]);
  if (x >= n - 1) return B[n - 1] + (x - (n - 1)) * (B[n - 1] - B[n - 2]);
  const i = Math.floor(x), f = x - i;
  return B[i] + f * (B[i + 1] - B[i]);
}

export function computeStructure(F: Features, bpmOverride?: number): Structure {
  const est = bpmOverride ?? estimateTempo(F.onset).bpm;
  const beats = trackBeats(F.onset, est, F.duration);
  // average tempo from a least-squares fit of beat time vs index (robust to local wobble)
  const inner = Array.from(beats).filter((t) => t >= 0 && t <= F.duration);
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  inner.forEach((t, i) => { sx += i; sy += t; sxx += i * i; sxy += i * t; });
  const m = inner.length;
  const slope = m > 2 ? (m * sxy - sx * sy) / (m * sxx - sx * sx) : 60 / est;
  let bpm = 60 / slope;
  if (Math.abs(bpm - Math.round(bpm)) < 0.12) bpm = Math.round(bpm);
  bpm = Math.round(bpm * 100) / 100;
  const local: number[] = [];
  for (let i = 4; i < inner.length; i += 4) local.push(240 / (inner[i] - inner[i - 4]));
  const meanL = local.reduce((a, b) => a + b, 0) / (local.length || 1);
  const tempoDrift = Math.round(Math.sqrt(local.reduce((a, b) => a + (b - meanL) ** 2, 0) / (local.length || 1)) * 100) / 100;

  // downbeat: phase (mod 4) with the strongest kick + loudness at the beat
  let downbeat = 0, bestK = -1;
  for (let k = 0; k < 4; k++) {
    let sc = 0;
    for (let i = k; i < beats.length; i += 4) { const x = beats[i] * AFPS; sc += sampleLinear(F.kick, x) + 0.5 * sampleLinear(F.rms, x); }
    if (sc > bestK) { bestK = sc; downbeat = k; }
  }
  const G = { beats, downbeat };
  const beatOffset = beatToTime(G, 0);
  const period = 60 / bpm;

  // per-phrase (4 bars) energy
  void period;
  const phrases: { start: number; end: number; e: number; low: number }[] = [];
  const firstPhrase = Math.floor(timeToBeat(G, 0) / 16);
  for (let pi = firstPhrase; beatToTime(G, pi * 16) < F.duration; pi++) {
    const ps = beatToTime(G, pi * 16), phraseLen = beatToTime(G, (pi + 1) * 16) - ps;
    const a = Math.max(0, Math.floor(ps * AFPS)), b = Math.min(F.n, Math.floor((ps + phraseLen) * AFPS));
    if (b <= a) continue;
    let e = 0, low = 0;
    for (let i = a; i < b; i++) { e += F.rms[i]; low += F.bands[i * NBANDS] + F.bands[i * NBANDS + 1]; }
    phrases.push({ start: Math.max(0, ps), end: Math.min(F.duration, ps + phraseLen), e: e / (b - a), low: low / (b - a) / 2 });
  }
  const es = phrases.map((p) => p.e * 0.7 + p.low * 0.3);
  const lo = quantile(es, 0.1), hi = quantile(es, 0.9);
  const lv = es.map((e) => (e - lo) / (hi - lo || 1));
  const types: SectionType[] = lv.map((l) => (l >= 0.62 ? 2 : l <= 0.3 ? 0 : 1));
  // a "build" must lead into a drop; otherwise treat as low/groove(0) or drop-lite
  for (let i = 0; i < types.length; i++) {
    if (types[i] === 1) {
      let j = i; while (j < types.length && types[j] === 1) j++;
      const leadsToDrop = j < types.length && types[j] === 2;
      if (!leadsToDrop) for (let k = i; k < j; k++) types[k] = lv[k] > 0.5 ? 2 : 0;
      i = j - 1;
    }
  }
  const lastDrop = types.lastIndexOf(2);
  for (let i = lastDrop + 1; i < types.length; i++) if (types[i] === 0) types[i] = 3;
  const sections: Section[] = [];
  phrases.forEach((p, i) => {
    const last = sections[sections.length - 1];
    if (last && last.type === types[i]) last.end = p.end;
    else sections.push({ start: p.start, end: p.end, type: types[i] });
  });

  const n = F.n;
  const dropRaw = new Float32Array(n), dropHit = new Float32Array(n), build = new Float32Array(n), travel = new Float32Array(n);
  for (const s of sections) {
    const a = Math.floor(s.start * AFPS), b = Math.min(n, Math.floor(s.end * AFPS));
    for (let i = a; i < b; i++) {
      if (s.type === 2) dropRaw[i] = 1;
      if (s.type === 1) build[i] = (i - a) / Math.max(1, b - a);
    }
    if (s.type === 2) {
      for (let i = a; i < n; i++) {
        const v = Math.exp(-(i - a) / (2.0 * AFPS));
        if (v < 0.001) break;
        dropHit[i] = Math.max(dropHit[i], v);
      }
    }
  }
  const drop = envFollow(dropRaw, 0.08, 0.01);
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += (0.5 + F.rms[i]) / AFPS; travel[i] = acc; }
  return { bpm, beatOffset, beats, downbeat, tempoDrift, sections, drop, dropHit, build, travel };
}
