/**
 * Synthesised demo song (174 BPM liquid-DnB-ish, 96 s): pads, two-step drums, sub bass, risers.
 * Used by the About page graphs and by the tutorial. It is only computed into memory —
 * nothing is played unless the user presses play in the editor.
 */
export const DEMO_SR = 22050;
const SR = DEMO_SR;

export function demoSong(): Float32Array {
  const bpm = 174, beat = 60 / bpm, bar = beat * 4, dur = 96;
  const out = new Float32Array(dur * SR);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const part = (t: number) => (t < 22 ? 'intro' : t < 33 ? 'build' : t < 55 ? 'drop' : t < 66 ? 'break' : t < 88 ? 'drop' : 'outro');
  const add = (t0: number, len: number, fn: (tt: number) => number) => {
    const i0 = Math.floor(t0 * SR);
    for (let i = 0; i < len * SR && i0 + i < out.length; i++) out[i0 + i] += fn(i / SR);
  };
  // pad chords (Fmaj9 → Em7 → Dm9 → Cmaj7, roots in Hz)
  const chords = [[174.6, 220, 261.6, 329.6, 392], [164.8, 196, 246.9, 293.7], [146.8, 174.6, 220, 261.6, 329.6], [130.8, 164.8, 196, 246.9]];
  for (let i = 0; i < out.length; i++) {
    const t = i / SR, p = part(t);
    const ch = chords[Math.floor(t / (bar * 2)) % 4];
    const lvl = p === 'drop' ? 0.05 : p === 'build' ? 0.07 : 0.09;
    let v = 0;
    for (const f of ch) v += Math.sin(2 * Math.PI * f * t + Math.sin(t * 0.7) * 0.3);
    out[i] += v * lvl / ch.length * (0.7 + 0.3 * Math.sin(t * 0.5));
  }
  for (let k = 0; k * beat / 4 < dur; k++) {
    const t = k * beat / 4, p = part(t), s16 = k % 16;
    const drop = p === 'drop';
    // hats (16ths in drops, 8ths elsewhere)
    if (drop || (k % 2 === 0 && p !== 'outro')) add(t, 0.05, (tt) => rnd() * Math.exp(-tt * 140) * (drop ? 0.16 : 0.07) * (s16 % 4 === 2 ? 1.4 : 1));
    if (drop) {
      // two-step DnB kick (1 and the "and" of 3), snare on 2 and 4, sub bass
      if (s16 === 0 || s16 === 10) add(t, 0.25, (tt) => Math.sin(2 * Math.PI * (48 + 140 * Math.exp(-tt * 35)) * tt) * Math.exp(-tt * 9) * 0.9);
      if (s16 === 4 || s16 === 12) add(t, 0.2, (tt) => (rnd() * 0.7 + Math.sin(2 * Math.PI * 190 * tt) * 0.5) * Math.exp(-tt * 18) * 0.55);
      if (s16 === 0) add(t, bar * 0.95, (tt) => Math.sin(2 * Math.PI * 43.65 * tt) * 0.35 * Math.min(1, tt * 40) * Math.exp(-tt * 0.6));
    }
    if (p === 'build') {
      const prog = (t - 22) / 11;
      const div = prog < 0.5 ? 4 : prog < 0.8 ? 2 : 1;
      if (k % div === 0) add(t, 0.1, (tt) => rnd() * Math.exp(-tt * 30) * (0.15 + prog * 0.45));
    }
  }
  // riser into each drop
  add(22, 11, (tt) => rnd() * 0.12 * Math.pow(tt / 11, 2));
  add(55, 11, (tt) => rnd() * 0.1 * Math.pow(tt / 11, 3));
  return out;
}

/** the demo song as a 16-bit mono WAV file, so it goes through the normal loading path */
export function demoSongFile(): File {
  const d = demoSong();
  const n = d.length;
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o: number, s: string) => { for (let j = 0; j < s.length; j++) v.setUint8(o + j, s.charCodeAt(j)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  let peak = 1e-6; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  const g = 0.89 / peak;
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i] * g)) * 32767, true);
  return new File([buf], 'VJ STUDIO demo song.wav', { type: 'audio/wav' });
}
