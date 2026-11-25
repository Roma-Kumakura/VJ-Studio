import { beatToTime, timeToBeat, type Analysis } from '../analysis/analyze';

/**
 * Lyrics: paste plain text (Suno style [Verse]/[Chorus] tags are understood) or LRC.
 * Timing is estimated without AI: lines are spread over the sung part of the song,
 * proportional to their length, section tags start on phrase boundaries, and every
 * line start snaps to the beat grid. LRC timestamps, when present, are used as-is.
 */
import { KINETIC, type KineticId } from './kinetic';
export type LyricsStyle = 'apple' | 'spotify' | 'karaoke' | 'minimal' | KineticId;
/** classic scrolling styles */
export const LYRICS_CLASSIC: Record<'apple' | 'spotify' | 'karaoke' | 'minimal', string> = { apple: 'Apple Music風', spotify: 'Spotify風', karaoke: 'カラオケ', minimal: 'ミニマル' };
export const LYRICS_STYLES: Record<LyricsStyle, string> = { ...LYRICS_CLASSIC, ...KINETIC };

/** per-block manual adjustments (keys = block index) */
export interface BlockAdj { start?: number; bpl?: number }
export interface LyricsOptions {
  text: string;
  style: LyricsStyle;
  singStart: number; // -1 = auto
  singEnd: number;   // -1 = auto
  offset: number;    // seconds, applied to auto-timed lines
  blocks: Record<string, BlockAdj>;
  taps: Record<string, number>; // global line index -> absolute time (tap sync)
  speed: number; // global multiplier for how fast lines advance (1 = as set)
}
export const defaultLyrics = (): LyricsOptions => ({ text: '', style: 'apple', singStart: -1, singEnd: -1, offset: 0, blocks: {}, taps: {}, speed: 1 });

export interface LyricLine { t: number; end: number; text: string; section?: string; block: number; tapped?: boolean; gi?: number }
export interface TimedBlock {
  index: number; tag: string;
  start: number; bpl: number;          // effective
  autoStart: number; autoBpl: number;  // what the algorithm suggests
  manualStart: boolean; manualBpl: boolean;
  lines: { gi: number; t: number; text: string; tapped: boolean; endT: number }[];
}

const TAG = /^\s*\[([^\]]+)\]\s*$/;
const LRC = /^\s*\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]\s*(.*)$/;
const INSTRUMENTAL = /instrumental|inst\b|solo|break|interlude|drop|間奏|intro|outro/i;
/** line-length choices, in beats */
export const BPL_CHOICES = [2, 4, 8, 16];

interface Block { tag: string; lines: string[] }

export function parseBlocks(text: string): { blocks: Block[]; lrc: LyricLine[] | null } {
  const raw = text.replace(/\r/g, '').split('\n');
  const lrc: LyricLine[] = [];
  for (const l of raw) { const m = l.match(LRC); if (m) lrc.push({ t: +m[1] * 60 + +m[2], end: 0, text: m[3].trim(), block: 0 }); }
  if (lrc.length >= 2) {
    lrc.sort((a, b) => a.t - b.t);
    const lines = lrc.filter((l) => l.text);
    lines.forEach((l, i) => (l.end = lines[i + 1]?.t ?? l.t + 4));
    return { blocks: [], lrc: lines };
  }
  const blocks: Block[] = [];
  let cur: Block = { tag: '', lines: [] };
  for (const l of raw) {
    const m = l.match(TAG);
    if (m) { if (cur.lines.length || cur.tag) blocks.push(cur); cur = { tag: m[1], lines: [] }; continue; }
    const s = l.trim();
    if (!s) { if (cur.lines.length) { blocks.push(cur); cur = { tag: '', lines: [] }; } continue; }
    // Suno stage directions such as "(Emotional piano arpeggio)" are not sung — skip them (Japanese backing vocals in parentheses stay)
    if (/^[(（][^)）]*[)）]$/.test(s) && !/[ぁ-んァ-ヶ一-龯]/.test(s)) continue;
    cur.lines.push(s);
  }
  if (cur.lines.length || cur.tag) blocks.push(cur);
  return { blocks, lrc: null };
}

const weight = (s: string) => 4 + [...s].reduce((a, c) => a + (/[　-鿿＀-￯]/.test(c) ? 1.6 : c === ' ' ? 0.4 : 0.8), 0);

/**
 * v2 timing: every sung block gets a start time and a musical "line length" (beats per line).
 * Auto values come from spreading the text over the sung range; the user can override a block's
 * start / line length, or tap individual lines while listening (later lines follow the tap).
 */
export function timeBlocks(o: LyricsOptions, A: Analysis): TimedBlock[] {
  const { blocks } = parseBlocks(o.text);
  const beat = 60 / A.bpm, bar = beat * 4;
  const secs = A.sections;
  let s0 = o.singStart >= 0 ? o.singStart : secs[0]?.type === 0 && secs.length > 1 ? secs[0].end : beatToTime(A, 8);
  let s1 = o.singEnd >= 0 ? o.singEnd : (secs[secs.length - 1]?.type === 3 ? secs[secs.length - 1].start : A.duration - bar * 2);
  if (s1 - s0 < bar * 4) { s0 = 0; s1 = A.duration; }
  // proportional layout of block starts
  type U = { w: number; block?: number };
  const units: U[] = [];
  const sung: { b: Block; idx: number }[] = [];
  blocks.forEach((b, idx) => {
    if (!b.lines.length) { if (b.tag && INSTRUMENTAL.test(b.tag) && units.length) units.push({ w: 28 }); return; }
    if (units.length) units.push({ w: 6 });
    units.push({ w: b.lines.reduce((a, l) => a + weight(l), 0), block: idx });
    sung.push({ b, idx });
  });
  const total = units.reduce((a, u) => a + u.w, 0) || 1;
  const startOf = new Map<number, number>();
  const endOf = new Map<number, number>();
  let acc = 0;
  for (const u of units) {
    const st = s0 + (acc / total) * (s1 - s0);
    acc += u.w;
    if (u.block !== undefined) { startOf.set(u.block, st); endOf.set(u.block, s0 + (acc / total) * (s1 - s0)); }
  }
  const snapHalfBar = (x: number) => beatToTime(A, Math.round(timeToBeat(A, x) / 2) * 2);
  const speed = Math.max(0.2, o.speed ?? 1);
  const out: TimedBlock[] = [];
  let gi = 0;
  let prevEnd = -Infinity;
  for (const { b, idx } of sung) {
    const adj = o.blocks?.[idx] ?? {};
    const autoStart0 = snapHalfBar(startOf.get(idx)! + o.offset);
    const span = endOf.get(idx)! - startOf.get(idx)!;
    const perLine = span / b.lines.length / beat;
    // largest musical length that still fits (fallback to the smallest)
    const autoBpl = [...BPL_CHOICES].reverse().find((c) => c <= perLine * speed * 1.15) ?? BPL_CHOICES[0];
    const autoStart = Math.max(autoStart0, prevEnd);
    const start = adj.start ?? autoStart;
    const bpl = adj.bpl ?? autoBpl;
    // advance in BEATS along the tracked beat grid, so lines follow tempo drift
    const step = bpl / speed;
    let cb = timeToBeat(A, start);
    const lines = b.lines.map((text) => {
      const tap = o.taps?.[gi];
      if (tap !== undefined) cb = timeToBeat(A, tap);
      const ln = { gi, t: tap !== undefined ? tap : beatToTime(A, cb), text, tapped: tap !== undefined, endT: beatToTime(A, cb + step) };
      cb += step;
      gi++;
      return ln;
    });
    prevEnd = beatToTime(A, cb);
    out.push({ index: idx, tag: b.tag, start, bpl, autoStart, autoBpl, manualStart: adj.start !== undefined, manualBpl: adj.bpl !== undefined, lines });
  }
  return out;
}

export function timeLyrics(o: LyricsOptions, A: Analysis): LyricLine[] {
  const { lrc } = parseBlocks(o.text);
  if (lrc) return lrc.map((l) => ({ ...l, t: l.t + o.offset, end: l.end + o.offset }));
  const beat = 60 / A.bpm;
  const lines: LyricLine[] = [];
  for (const b of timeBlocks(o, A)) {
    for (const l of b.lines) lines.push({ t: l.t, end: l.endT, text: l.text, section: b.tag, block: b.index, tapped: l.tapped, gi: l.gi });
  }
  lines.sort((a, b) => a.t - b.t);
  // a line stays lit until the next one starts, but not longer than one line length past its slot
  for (let i = 0; i < lines.length; i++) {
    const next = lines[i + 1]?.t ?? Infinity;
    lines[i].end = Math.min(next, lines[i].end + (lines[i].end - lines[i].t) * 0.5);
    if (lines[i].end <= lines[i].t) lines[i].end = lines[i].t + 0.5;
  }
  return lines;
}

/** cache so we only re-time when inputs change */
let cacheKey = '', cacheVal: LyricLine[] = [];
export function lyricsLines(o: LyricsOptions, A: Analysis) {
  const key = JSON.stringify([o.text, o.singStart, o.singEnd, o.offset, o.blocks, o.taps, o.speed, A.bpm, A.beatOffset, A.beats.length, A.duration]);
  if (key !== cacheKey) { cacheKey = key; cacheVal = timeLyrics(o, A); }
  return cacheVal;
}

/** index of the current line at time t (-1 before the first) */
export function currentLine(lines: LyricLine[], t: number) {
  let i = -1;
  for (let k = 0; k < lines.length; k++) if (lines[k].t <= t) i = k; else break;
  return i;
}

/** Minimal ID3v2 reader for MP3s (Suno exports): title, artist, cover art, unsynced lyrics. */
export interface Tags { title?: string; artist?: string; lyrics?: string; cover?: Blob }
export function readId3(buf: ArrayBuffer): Tags {
  const b = new Uint8Array(buf);
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return {};
  const ver = b[3];
  const syncsafe = (i: number) => (b[i] << 21) | (b[i + 1] << 14) | (b[i + 2] << 7) | b[i + 3];
  const size = syncsafe(6);
  let p = 10;
  if (b[5] & 0x40) p += ver === 4 ? syncsafe(10) : ((b[10] << 24) | (b[11] << 16) | (b[12] << 8) | b[13]) + 4;
  const end = Math.min(b.length, 10 + size);
  const dec = (enc: number, a: number, z: number) => {
    const slice = b.subarray(a, z);
    const label = enc === 1 ? 'utf-16' : enc === 2 ? 'utf-16be' : enc === 3 ? 'utf-8' : 'latin1';
    return new TextDecoder(label).decode(slice).replace(/\0+$/g, '').replace(/^﻿/, '');
  };
  const skipStr = (enc: number, a: number) => {
    if (enc === 1 || enc === 2) { while (a + 1 < end && !(b[a] === 0 && b[a + 1] === 0)) a += 2; return a + 2; }
    while (a < end && b[a] !== 0) a++;
    return a + 1;
  };
  const tags: Tags = {};
  while (p + 10 < end) {
    const id = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const fs = ver === 4 ? syncsafe(p + 4) : (b[p + 4] << 24) | (b[p + 5] << 16) | (b[p + 6] << 8) | b[p + 7];
    const a = p + 10, z = Math.min(end, a + fs);
    try {
      if (id === 'TIT2') tags.title = dec(b[a], a + 1, z);
      else if (id === 'TPE1') tags.artist = dec(b[a], a + 1, z);
      else if (id === 'USLT') { const enc = b[a]; const s = skipStr(enc, a + 4); tags.lyrics = dec(enc, s, z); }
      else if (id === 'APIC') {
        const enc = b[a];
        let q = a + 1; const ms = q; while (q < z && b[q] !== 0) q++;
        const mime = new TextDecoder('latin1').decode(b.subarray(ms, q)) || 'image/jpeg';
        q = skipStr(enc, q + 2);
        tags.cover = new Blob([b.slice(q, z)], { type: mime.includes('/') ? mime : 'image/jpeg' });
      }
    } catch { /* ignore broken frame */ }
    p = z;
  }
  return tags;
}
