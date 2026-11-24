/**
 * Kinetic lyric typography — ten original "vocal-synth MV" style templates.
 * Each one is a pure function of the line's age (seconds since it started), its exit progress
 * and the music frame, so preview and export always match.
 */
import type { Frame } from './frame';
import { fontCss, type FontId } from './fonts';

export type KineticId = 'tate' | 'pop' | 'type' | 'glitch' | 'giant' | 'scatter' | 'ring' | 'flow' | 'box' | 'depth';
export const KINETIC: Record<KineticId, string> = {
  tate: '縦書き', pop: 'ポップ', type: 'タイプ', glitch: 'グリッチ', giant: '巨大文字',
  scatter: '散らばり', ring: '円環', flow: '流れる帯', box: '切り抜き', depth: '奥から',
};
export const KINETIC_IDS = Object.keys(KINETIC) as KineticId[];
export const isKinetic = (s: string): s is KineticId => s in KINETIC;

export interface KCtx {
  g: CanvasRenderingContext2D;
  W: number; H: number;
  cx: number; cy: number; s: number;   // anchor and scale (1 = 1080p)
  text: string;
  age: number;                          // seconds since the line started
  dur: number;                          // line length in seconds
  out: number;                          // 0..1 exit progress (0 while the line is current)
  alpha?: number;                       // extra opacity (chaos echoes)
  f: Frame;
  font: FontId;
  col: string; acc: string; acc2: string;
  seed: number;                         // per line (stable randomness)
}

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const backOut = (x: number) => { const c = 1.9; const v = clamp(x) - 1; return 1 + (c + 1) * v * v * v + c * v * v; };
/** stable hash → 0..1 */
const rnd = (seed: number, i: number) => { let h = (seed * 374761393 + i * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const GLITCH = 'アイウエオカキクケコｱｲｳｴｵ#$%&@*+=<>/\\01ﾊﾟｼﾞ█▓▒░'.split('');

/** greedy wrap by measured width (works for Japanese without spaces) */
function wrapChars(g: CanvasRenderingContext2D, text: string, maxW: number): string[][] {
  const rows: string[][] = [[]]; let w = 0;
  for (const ch of [...text]) {
    const cw = g.measureText(ch).width;
    if (w + cw > maxW && rows[rows.length - 1].length) { rows.push([]); w = 0; if (ch === ' ' || ch === '　') continue; }
    rows[rows.length - 1].push(ch); w += cw;
  }
  return rows.filter((r) => r.length);
}
/** per-character positions for horizontally centred rows around (cx, cy) */
function layout(g: CanvasRenderingContext2D, text: string, px: number, cx: number, cy: number, maxW: number, lh = 1.25) {
  const rows = wrapChars(g, text, maxW);
  const out: { ch: string; x: number; y: number; w: number; i: number }[] = [];
  let i = 0;
  rows.forEach((r, ri) => {
    const ws = r.map((c) => g.measureText(c).width), tw = ws.reduce((a, b) => a + b, 0);
    let x = cx - tw / 2;
    const y = cy + (ri - (rows.length - 1) / 2) * px * lh;
    r.forEach((ch, k) => { out.push({ ch, x: x + ws[k] / 2, y, w: ws[k], i: i++ }); x += ws[k]; });
  });
  return out;
}
function outlined(g: CanvasRenderingContext2D, ch: string, x: number, y: number, px: number, fill: string, stroke = 'rgba(0,0,10,.6)') {
  g.lineJoin = 'round'; g.strokeStyle = stroke; g.lineWidth = px * 0.12; g.strokeText(ch, x, y);
  g.fillStyle = fill; g.fillText(ch, x, y);
}

export function drawKinetic(id: KineticId, c: KCtx) {
  const { g, s, f } = c;
  if (!c.text.trim()) return;
  const A = (c.alpha ?? 1) * (1 - easeOut(c.out));
  if (A <= 0.003) return;
  g.save();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const chars = [...c.text];
  const n = chars.length;
  switch (id) {
    // ---------------------------------------------------------------- vertical, one character at a time
    case 'tate': {
      const px = 70 * s, perCol = 11;
      g.font = fontCss(c.font, px);
      const cols = Math.ceil(n / perCol);
      chars.forEach((ch, i) => {
        const col = Math.floor(i / perCol), row = i % perCol;
        const x = c.cx + ((cols - 1) / 2 - col) * px * 1.25;
        const rowsHere = Math.min(perCol, n - col * perCol);
        const y = c.cy + (row - (rowsHere - 1) / 2) * px * 1.08;
        const p = easeOut((c.age - i * 0.05) / 0.25);
        if (p <= 0) return;
        const exitP = clamp(c.out * 1.6 - (i / n) * 0.6);
        g.globalAlpha = A * p * (1 - exitP);
        const vert = '、。ー〜…'.includes(ch);
        g.save(); g.translate(x, y - (1 - p) * 16 * s - exitP * 30 * s); if (vert) g.rotate(Math.PI / 2);
        outlined(g, ch, 0, 0, px, c.col);
        g.restore();
      });
      // a thin accent rule beside the column
      g.globalAlpha = A * 0.8 * easeOut(c.age / 0.4);
      g.fillStyle = c.acc;
      g.fillRect(c.cx + (cols / 2) * px * 1.25 + 8 * s, c.cy - Math.min(n, perCol) * px * 0.54, 3 * s, Math.min(n, perCol) * px * 1.08 * easeOut(c.age / 0.6));
      break;
    }
    // ---------------------------------------------------------------- characters bounce in
    case 'pop': {
      const px = 76 * s;
      g.font = fontCss(c.font, px);
      for (const L of layout(g, c.text, px, c.cx, c.cy, 1150 * s)) {
        const p = (c.age - L.i * 0.035) / 0.32;
        if (p <= 0) continue;
        const sc = backOut(p) * (1 + f.kick * 0.06);
        const fall = clamp(c.out * 1.5 - rnd(c.seed, L.i) * 0.5);
        const r = rnd(c.seed, L.i + 50);
        g.save();
        g.globalAlpha = A * clamp(p * 3) * (1 - fall);
        g.translate(L.x, L.y + fall * 80 * s);
        g.rotate((rnd(c.seed, L.i) - 0.5) * 0.24 + fall * (r - 0.5) * 1.5);
        g.scale(sc, sc);
        outlined(g, L.ch, 0, 0, px, r < 0.18 ? c.acc : r < 0.3 ? c.acc2 : c.col, 'rgba(0,0,0,.7)');
        g.restore();
      }
      break;
    }
    // ---------------------------------------------------------------- typewriter with a block cursor
    case 'type': {
      const px = 58 * s;
      g.font = fontCss(c.font, px);
      const shown = Math.max(0, Math.min(n, Math.floor(c.age / 0.05) - Math.floor(c.out * n * 1.2)));
      const L = layout(g, c.text, px, c.cx, c.cy, 1150 * s, 1.35);
      const shake = f.kick > 0.5 ? (rnd(c.seed, Math.floor(c.age * 30)) - 0.5) * 4 * s : 0;
      g.globalAlpha = A;
      for (const l of L) {
        if (l.i >= shown) break;
        g.fillStyle = c.acc; g.globalAlpha = A * 0.45; g.fillText(l.ch, l.x + 3 * s + shake, l.y + 3 * s);
        g.globalAlpha = A; g.fillStyle = c.col; g.fillText(l.ch, l.x + shake, l.y);
      }
      const last = L[Math.min(shown, L.length) - 1] ?? { x: L[0]?.x ?? c.cx, y: L[0]?.y ?? c.cy, w: 0 };
      if (Math.floor(c.age * 3.2) % 2 === 0 || shown < n) {
        g.fillStyle = c.acc; g.globalAlpha = A;
        g.fillRect(last.x + (shown ? last.w / 2 : -px * 0.3) + 4 * s, last.y - px * 0.48, px * 0.5, px * 0.96);
      }
      break;
    }
    // ---------------------------------------------------------------- scrambled characters lock into place, RGB split
    case 'glitch': {
      const px = 72 * s;
      g.font = fontCss(c.font, px);
      const L = layout(g, c.text, px, c.cx, c.cy, 1150 * s);
      const tick = Math.floor(c.age * 24);
      const split = (6 + f.snare * 16 + c.out * 20) * s;
      const ops: [string, number][] = [['rgba(255,40,90,.85)', -split], ['rgba(40,230,255,.85)', split], [c.col, 0]];
      for (const [fill, dx] of ops) {
        g.globalCompositeOperation = dx ? 'lighter' : 'source-over';
        for (const l of L) {
          const settled = c.age > l.i * 0.03 + 0.18 && rnd(c.seed + tick, l.i) > c.out;
          const ch = settled ? l.ch : GLITCH[Math.floor(rnd(c.seed + tick, l.i + 7) * GLITCH.length)];
          const jit = rnd(c.seed + tick, l.i + 99) < 0.08 + f.snare * 0.2 ? (rnd(c.seed + tick, l.i + 3) - 0.5) * 40 * s : 0;
          g.globalAlpha = A * (dx ? 0.7 : 1) * clamp((c.age - l.i * 0.015) / 0.08);
          g.fillStyle = fill; g.fillText(ch, l.x + dx + jit, l.y);
        }
      }
      g.globalCompositeOperation = 'source-over';
      // horizontal glitch bars
      for (let k = 0; k < 3; k++) {
        if (rnd(c.seed + tick, 300 + k) > 0.35 + c.out) continue;
        g.globalAlpha = A * 0.5; g.fillStyle = k % 2 ? c.acc : c.acc2;
        g.fillRect(c.cx - 600 * s + rnd(c.seed + tick, 310 + k) * 400 * s, c.cy + (rnd(c.seed + tick, 320 + k) - 0.5) * 140 * s, (80 + rnd(c.seed + tick, 330 + k) * 300) * s, 4 * s);
      }
      break;
    }
    // ---------------------------------------------------------------- a few characters at a time, filling the screen, cut on the beat
    case 'giant': {
      const chunk = n <= 6 ? 2 : 3;
      const parts: string[] = [];
      for (let i = 0; i < n; i += chunk) parts.push(chars.slice(i, i + chunk).join(''));
      const beatLen = 60 / Math.max(60, f.bpm || 120);
      const per = Math.max(beatLen, Math.min(c.dur / parts.length, beatLen * 2));
      const k = Math.min(parts.length - 1, Math.floor(c.age / per));
      const local = c.age - k * per;
      const part = parts[k];
      const px = Math.min(c.W * 0.86 / [...part].length, c.H * 0.62);
      g.font = fontCss(c.font, px);
      const hit = 1 + 0.12 * Math.exp(-local * 10);
      g.save(); g.translate(c.W / 2, c.H / 2); g.scale(hit, hit);
      g.globalAlpha = A * 0.9;
      if (k % 2) { g.fillStyle = c.col; g.fillText(part, 0, 0); }
      else { g.lineWidth = px * 0.035; g.strokeStyle = c.col; g.strokeText(part, 0, 0); }
      g.restore();
      // the full line small, underneath
      const sm = 30 * s;
      g.font = fontCss(c.font, sm); g.globalAlpha = A * 0.85; g.fillStyle = c.acc;
      g.fillText(c.text, c.W / 2, c.H * 0.9);
      break;
    }
    // ---------------------------------------------------------------- characters fly in from all over the screen and assemble
    case 'scatter': {
      const px = 70 * s;
      g.font = fontCss(c.font, px);
      for (const l of layout(g, c.text, px, c.cx, c.cy, 1150 * s)) {
        const pin = easeOut((c.age - l.i * 0.02) / 0.55);
        const sx = rnd(c.seed, l.i) * c.W, sy = rnd(c.seed, l.i + 40) * c.H;
        const ex = rnd(c.seed, l.i + 80) * c.W, ey = rnd(c.seed, l.i + 120) * c.H;
        const po = easeOut(c.out);
        const x = (sx + (l.x - sx) * pin) * (1 - po) + ex * po, y = (sy + (l.y - sy) * pin) * (1 - po) + ey * po;
        const rot = (rnd(c.seed, l.i + 160) - 0.5) * 3 * (1 - pin + po);
        g.save(); g.translate(x, y); g.rotate(rot);
        g.globalAlpha = (c.alpha ?? 1) * clamp(pin * 2) * (1 - po * 0.9);
        outlined(g, l.ch, 0, 0, px, c.col);
        g.restore();
      }
      break;
    }
    // ---------------------------------------------------------------- characters on a rotating ring
    case 'ring': {
      const px = 56 * s;
      g.font = fontCss(c.font, px);
      const R = (210 + f.kick * 18) * s * (1 + c.out * 0.6);
      const spin = c.age * 0.5 + c.seed;
      const span = Math.min(Math.PI * 2, n * (px * 1.05) / R);
      chars.forEach((ch, i) => {
        const a = spin - span / 2 + (i + 0.5) * (span / n) - Math.PI / 2;
        const p = easeOut((c.age - i * 0.03) / 0.3);
        if (p <= 0) return;
        g.save(); g.translate(c.cx + Math.cos(a) * R, c.cy + Math.sin(a) * R); g.rotate(a + Math.PI / 2);
        g.globalAlpha = A * p;
        outlined(g, ch, 0, 0, px, i % 5 === 0 ? c.acc : c.col);
        g.restore();
      });
      g.globalAlpha = A * 0.35; g.strokeStyle = c.acc; g.lineWidth = 2 * s;
      g.beginPath(); g.arc(c.cx, c.cy, R - px * 0.75, 0, Math.PI * 2 * easeOut(c.age / 0.8)); g.stroke();
      break;
    }
    // ---------------------------------------------------------------- a band across the screen with the line scrolling through it
    case 'flow': {
      const px = 54 * s, bh = px * 1.7;
      const open = easeOut(c.age / 0.25) * (1 - easeOut(c.out));
      g.globalAlpha = (c.alpha ?? 1) * 0.9;
      g.fillStyle = 'rgba(5,6,12,.88)';
      g.fillRect(0, c.cy - (bh / 2) * open, c.W, bh * open);
      g.fillStyle = c.acc; g.fillRect(0, c.cy - (bh / 2) * open - 3 * s, c.W * open, 3 * s);
      g.fillRect(c.W * (1 - open), c.cy + (bh / 2) * open, c.W * open, 3 * s);
      if (open > 0.3) {
        g.save(); g.beginPath(); g.rect(0, c.cy - bh / 2, c.W, bh); g.clip();
        g.font = fontCss(c.font, px); g.textAlign = 'left';
        const unit = c.text + '　／　';
        const uw = Math.max(1, g.measureText(unit).width);
        const off = (c.age * 260 * s) % uw;
        g.globalAlpha = A;
        for (let x = c.W - off - uw * Math.ceil(c.W / uw + 1); x < c.W; x += uw) { g.fillStyle = c.col; g.fillText(unit, x, c.cy); }
        g.restore();
      }
      break;
    }
    // ---------------------------------------------------------------- cut-out label stickers
    case 'box': {
      const px = 58 * s;
      g.font = fontCss(c.font, px);
      const segs: string[] = [];
      const words = c.text.split(/[\s　]+/).filter(Boolean);
      for (const w of words) { const cs = [...w]; for (let i = 0; i < cs.length; i += 5) segs.push(cs.slice(i, i + 5).join('')); }
      const pad = px * 0.22, lh = px * 1.5;
      const widths = segs.map((sg) => g.measureText(sg).width + pad * 2);
      // flow the labels into rows
      const rows: number[][] = [[]]; let rw = 0;
      widths.forEach((w, i) => { if (rw + w > 1100 * s && rows[rows.length - 1].length) { rows.push([]); rw = 0; } rows[rows.length - 1].push(i); rw += w + 10 * s; });
      rows.forEach((r, ri) => {
        const tw = r.reduce((a, i) => a + widths[i] + 10 * s, -10 * s);
        let x = c.cx - tw / 2;
        const y = c.cy + (ri - (rows.length - 1) / 2) * lh;
        for (const i of r) {
          const p = easeOut((c.age - i * 0.09) / 0.2);
          if (p > 0) {
            const tilt = (rnd(c.seed, i) - 0.5) * 0.09, dy = (rnd(c.seed, i + 9) - 0.5) * 14 * s;
            const hot = rnd(c.seed, i + 20) < 0.22;
            g.save(); g.translate(x + widths[i] / 2, y + dy); g.rotate(tilt);
            g.globalAlpha = A;
            g.fillStyle = hot ? c.acc : '#ffffff';
            g.fillRect(-widths[i] / 2, -px * 0.62, widths[i] * p, px * 1.24);
            if (p > 0.6) { g.fillStyle = '#0b0b10'; g.fillText(segs[i], 0, px * 0.03); }
            g.restore();
          }
          x += widths[i] + 10 * s;
        }
      });
      break;
    }
    // ---------------------------------------------------------------- characters arrive from far away with trails
    case 'depth': {
      const px = 74 * s;
      g.font = fontCss(c.font, px);
      const vx = c.W / 2, vy = c.H * 0.42;
      for (const l of layout(g, c.text, px, c.cx, c.cy, 1150 * s)) {
        const p = easeOut((c.age - l.i * 0.03) / 0.6);
        if (p <= 0) continue;
        const z = 1 - p - c.out * 0.0; // 0 = in place
        const past = easeOut(c.out);
        for (let tr = 2; tr >= 0; tr--) {
          const zz = Math.min(1, z + tr * 0.08 * (1 - p + past));
          const sc = (1 - zz * 0.9) * (1 + past * 2.5);
          const x = vx + (l.x - vx) * (1 - zz) * (1 + past), y = vy + (l.y - vy) * (1 - zz) * (1 + past);
          g.save(); g.translate(x, y); g.scale(sc, sc);
          g.globalAlpha = (c.alpha ?? 1) * clamp(p * 2) * (1 - past) * (tr ? 0.18 : 1);
          if (tr) { g.fillStyle = c.acc; g.fillText(l.ch, 0, 0); } else outlined(g, l.ch, 0, 0, px, c.col);
          g.restore();
        }
      }
      break;
    }
  }
  g.restore();
}
