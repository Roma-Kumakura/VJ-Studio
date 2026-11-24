import { AFPS, NSPEC, type Analysis } from '../analysis/analyze';
import type { Frame } from './frame';
import type { HudElement, HudOptions, RenderEnv, SpectrumStyle, TextItem } from './template';
import { fontCss } from './fonts';
import { currentLine, lyricsLines, type LyricLine } from './lyrics';
import { drawKinetic, isKinetic, KINETIC_IDS, type KineticId } from './kinetic';

/**
 * 2D overlay layer. Every element (icon, text, spectrum, scope, phase, readout)
 * is placed by centre position (fraction of frame) and size multiplier.
 * Pure function of time -> preview == export.
 * Glows are faked with a wide translucent pass instead of shadowBlur (much cheaper).
 */
const MONO = '"SF Mono", "Menlo", "Consolas", monospace';
const SANS = '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif';
const SECTION_NAMES = ['INTRO', 'BUILD', 'DROP', 'OUTRO'];

function specAt(A: Analysis, t: number, x: number): number {
  const i = Math.max(0, Math.min(A.n - 1, Math.round(t * AFPS)));
  const fx = Math.max(0, Math.min(NSPEC - 1, x * (NSPEC - 1)));
  const b = Math.floor(fx), f = fx - b;
  const b2 = Math.min(NSPEC - 1, b + 1);
  return A.spec[i * NSPEC + b] * (1 - f) + A.spec[i * NSPEC + b2] * f;
}

export class Hud {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;

  /** chaos mode: lyric lines take random kinetic templates and positions and overlap (null = off) */
  chaosLyrics: number | null = null;

  /** extra layer drawn under the HUD (chaos-mode collage) */
  extra: ((g: CanvasRenderingContext2D, W: number, H: number, t: number, f: Frame) => void) | null = null;

  constructor(private env: RenderEnv) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = env.width; this.canvas.height = env.height;
    this.g = this.canvas.getContext('2d')!;
  }

  get opts(): HudOptions | undefined { return this.env.hud; }
  get accent() { return this.opts?.colors.accent ?? '#7af0ff'; }
  get accent2() { return this.opts?.colors.accent2 ?? '#ff7ad9'; }
  get textColor() { return this.opts?.colors.text ?? '#ffffff'; }

  /** returns false when nothing was drawn (lets the compositor skip the upload) */
  render(t: number, f: Frame): boolean {
    const o = this.opts;
    const { g } = this;
    const W = this.canvas.width, H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    let extraDrew = false;
    if (this.extra) { this.extra(g, W, H, t, f); extraDrew = true; }
    if (!o) return extraDrew;
    const k = Math.min(W, H) / 1080;
    const E = o.elements;
    let drew = false;
    const at = (e: HudElement) => ({ cx: e.x * W, cy: e.y * H, s: k * e.size });
    if (E.scope.on) { const p = at(E.scope); this.drawScope(t, p.cx, p.cy, p.s, W); drew = true; }
    if (E.spectrum.on) {
      const p = at(E.spectrum);
      this.drawSpectrum(o.spectrumStyle, t, p.cx, p.cy, p.s);
      drew = true;
    }
    if (E.phase.on) { const p = at(E.phase); this.drawPhase(t, p.cx, p.cy, p.s); drew = true; }
    if (E.icon.on) { const p = at(E.icon); this.drawIcon(t, f, p.cx, p.cy, p.s, o.iconShape); drew = true; }
    if (E.text.on) { const p = at(E.text); this.drawText(f, p.cx, p.cy, p.s, E.text.x); drew = true; }
    if (E.readout.on) { const p = at(E.readout); this.drawReadout(f, p.cx, p.cy, p.s); drew = true; }
    if (E.lyrics?.on && o.lyrics?.text) { const p = at(E.lyrics); if (this.drawLyrics(t, f, p.cx, p.cy, p.s)) drew = true; }
    for (const it of o.texts) if (this.drawTelop(it, t, f, W, H, k)) drew = true;
    return drew || extraDrew;
  }

  /** stroke the current path twice: wide translucent halo + crisp line */
  private glowStroke(color: string, width: number, halo = 4) {
    const { g } = this;
    g.strokeStyle = color;
    g.globalAlpha = 0.22; g.lineWidth = width * halo; g.stroke();
    g.globalAlpha = 1; g.lineWidth = width; g.stroke();
  }

  /** pre-processed versions of the avatar (filters + per-channel copies for RGB split) */
  private variantCache = new WeakMap<HTMLCanvasElement, Map<string, { img: HTMLCanvasElement; ch: HTMLCanvasElement[] }>>();
  private variants(src: HTMLCanvasElement, filter: string) {
    const key = `${filter}|${this.accent}|${this.accent2}`;
    let m = this.variantCache.get(src);
    if (!m) { m = new Map(); this.variantCache.set(src, m); }
    const hit = m.get(key);
    if (hit) return hit;
    const N = 384;
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c; };
    const img = mk();
    const ig = img.getContext('2d', { willReadFrequently: true })!;
    ig.drawImage(src, 0, 0, N, N);
    const d = ig.getImageData(0, 0, N, N);
    const hx = (h: string) => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
    const c1 = hx(this.accent2), c0 = [12, 10, 40], c2 = hx(this.accent);
    for (let i = 0; i < d.data.length; i += 4) {
      const y = (d.data[i] * 0.299 + d.data[i + 1] * 0.587 + d.data[i + 2] * 0.114) / 255;
      if (filter === 'mono') { const v = Math.min(255, Math.pow(y, 0.9) * 270); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; }
      else if (filter === 'duotone') {
        const [a, b, w] = y < 0.5 ? [c0, c1, y * 2] : [c1, c2, (y - 0.5) * 2];
        for (let k = 0; k < 3; k++) d.data[i + k] = a[k] + (b[k] - a[k]) * w;
      } else if (filter === 'vhs') {
        d.data[i] = Math.min(255, d.data[i] * 1.1 + 10); d.data[i + 2] = Math.min(255, d.data[i + 2] * 1.15 + 14); d.data[i + 1] *= 0.95;
      }
    }
    ig.putImageData(d, 0, 0);
    const ch = [0, 1, 2].map((k) => {
      const c = mk(); const g2 = c.getContext('2d')!;
      const e = new ImageData(new Uint8ClampedArray(d.data), N, N);
      for (let i = 0; i < e.data.length; i += 4) for (let j = 0; j < 3; j++) if (j !== k) e.data[i + j] = 0;
      g2.putImageData(e, 0, 0);
      return c;
    });
    const v = { img, ch };
    m.set(key, v);
    return v;
  }

  private drawIcon(t: number, f: Frame, cx: number, cy: number, s: number, shape: 'square' | 'circle') {
    const { g } = this;
    const meta = this.env.meta;
    const fx = this.opts!.iconFx;
    const half = 150 * s;
    const pulse = 1 + f.kick * 0.05 + f.dropHit * 0.08;
    const A = this.env.analysis;

    if (fx.frame === 'neon') {
      // spectrum ticks around the perimeter
      const n = 72;
      g.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const u = i / n;
        const v = specAt(A, t, Math.abs(u * 2 - 1));
        let px: number, py: number, nx: number, ny: number;
        const r0 = half + 22 * s;
        if (shape === 'circle') {
          const a = u * Math.PI * 2 - Math.PI / 2;
          nx = Math.cos(a); ny = Math.sin(a); px = cx + nx * r0; py = cy + ny * r0;
        } else {
          const side = Math.floor(u * 4), q = (u * 4) % 1, L = r0;
          const p = [[-L + 2 * L * q, -L, 0, -1], [L, -L + 2 * L * q, 1, 0], [L - 2 * L * q, L, 0, 1], [-L, L - 2 * L * q, -1, 0]][side];
          px = cx + p[0]; py = cy + p[1]; nx = p[2]; ny = p[3];
        }
        const len = (5 + v * 46) * s * pulse;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + nx * len, py + ny * len);
        this.glowStroke(i % 2 ? this.accent2 : this.accent, 4 * s, 2.5);
      }
      g.lineCap = 'butt';
      const fr = (half + 10 * s) * pulse;
      g.beginPath();
      if (shape === 'circle') g.arc(cx, cy, fr, 0, Math.PI * 2);
      else g.rect(cx - fr, cy - fr, fr * 2, fr * 2);
      this.glowStroke(this.accent, 2.5 * s, 5);
      if (shape === 'square') {
        const br = half + 76 * s + f.kick * 8 * s, bl = 34 * s;
        g.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          g.moveTo(cx + sx * br, cy + sy * (br - bl)); g.lineTo(cx + sx * br, cy + sy * br); g.lineTo(cx + sx * (br - bl), cy + sy * br);
        }
        this.glowStroke(this.textColor, 3 * s, 3);
      } else {
        g.save(); g.translate(cx, cy); g.rotate(t * 0.6);
        g.setLineDash([12 * s, 10 * s]);
        g.beginPath(); g.arc(0, 0, half + 76 * s, 0, Math.PI * 2);
        this.glowStroke(this.textColor, 2.5 * s, 3);
        g.setLineDash([]); g.restore();
      }
    }

    // ---- the image itself, with its own effects
    const shapePath = () => {
      g.beginPath();
      if (shape === 'circle') g.arc(0, 0, half, 0, Math.PI * 2);
      else g.roundRect(-half, -half, half * 2, half * 2, 10 * s);
    };
    g.save();
    g.translate(cx, cy);
    // beat pulse + pseudo-3D wobble (rotateY / rotateX approximated with an affine transform)
    const sc = 1 + (f.kick * 0.09 + f.dropHit * 0.12) * fx.pulse * 1.6;
    const ay = (Math.sin(t * 0.9) * 0.45 + f.snare * 0.25) * fx.tilt;
    const ax = (Math.cos(t * 0.7) * 0.3 - f.kick * 0.2) * fx.tilt;
    g.transform(Math.cos(ay) * sc, Math.sin(ay) * 0.22 * fx.tilt, Math.sin(ax) * 0.12, Math.cos(ax) * sc, 0, 0);
    if (fx.glow > 0.01) {
      g.save();
      g.shadowColor = this.accent; g.shadowBlur = (24 + 60 * f.kick + 40 * f.dropHit) * fx.glow * s;
      g.fillStyle = this.accent; shapePath(); g.fill();
      g.restore();
    }
    g.save();
    shapePath(); g.clip();
    if (!meta.avatar) { g.fillStyle = '#334'; g.fillRect(-half, -half, half * 2, half * 2); }
    else {
      const V = this.variants(meta.avatar, fx.filter === 'rainbow' ? 'none' : fx.filter);
      const anyG = g as CanvasRenderingContext2D & { filter: string };
      if (fx.filter === 'rainbow' && 'filter' in g) anyG.filter = `hue-rotate(${Math.round((t * 50 + f.beat * 25) % 360)}deg) saturate(1.5)`;
      const glitchOn = fx.glitch > 0.01 && (f.snare * fx.glitch * 2 > 0.45 || f.dropHit * fx.glitch * 2 > 0.6);
      const rgbOff = (1.5 + f.kick * 14 + f.snare * 8 + f.dropHit * 20) * fx.rgb * s;
      const drawImg = (dx: number, img: HTMLCanvasElement) => {
        if (!glitchOn) { g.drawImage(img, -half + dx, -half, half * 2, half * 2); return; }
        const seed = Math.floor(t * 24);
        const rows = 9;
        for (let r = 0; r < rows; r++) {
          const h0 = Math.sin(seed * 12.9898 + r * 78.233) * 43758.5453;
          const rnd = h0 - Math.floor(h0);
          const off = (rnd - 0.5) * 60 * s * fx.glitch * (rnd > 0.55 ? 1 : 0.15);
          const sy = (r / rows) * img.height, sh = img.height / rows;
          g.drawImage(img, 0, sy, img.width, sh, -half + dx + off, -half + (r / rows) * half * 2, half * 2, (half * 2) / rows + 0.5);
        }
      };
      if (rgbOff > 0.6) {
        g.fillStyle = '#000'; g.fillRect(-half, -half, half * 2, half * 2);
        g.globalCompositeOperation = 'lighter';
        drawImg(-rgbOff, V.ch[0]); drawImg(0, V.ch[1]); drawImg(rgbOff, V.ch[2]);
        g.globalCompositeOperation = 'source-over';
      } else drawImg(0, V.img);
      if ('filter' in g) anyG.filter = 'none';
      if (fx.filter === 'vhs') {
        g.fillStyle = 'rgba(0,0,0,.18)';
        for (let y = -half; y < half; y += 4 * s) g.fillRect(-half, y, half * 2, 1.5 * s);
        const by = -half + (((t * 0.35) % 1) * 2.4 - 0.2) * half * 2;
        g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(-half, by, half * 2, 26 * s);
        g.fillStyle = `rgba(255,255,255,${0.04 + f.hat * 0.08})`; g.fillRect(-half, -half, half * 2, half * 2);
      }
    }
    if (f.kick > 0.05) { g.fillStyle = `rgba(255,255,255,${f.kick * 0.15 * (0.5 + fx.pulse)})`; g.fillRect(-half, -half, half * 2, half * 2); }
    g.restore();
    if (fx.frame !== 'none') { shapePath(); g.strokeStyle = this.textColor; g.lineWidth = 3 * s; g.stroke(); }
    g.restore();
  }

  private drawText(f: Frame, cx: number, cy: number, s: number, xFrac: number) {
    const { g } = this;
    const meta = this.env.meta;
    const align: CanvasTextAlign = xFrac < 0.35 ? 'left' : xFrac > 0.65 ? 'right' : 'center';
    const w = 560 * s;
    const x = align === 'left' ? cx - w / 2 : align === 'right' ? cx + w / 2 : cx;
    g.textAlign = align; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
    const outlined = (txt: string, y: number) => {
      g.strokeStyle = 'rgba(0,0,10,.55)'; g.lineWidth = 8 * s; g.strokeText(txt, x, y);
      g.fillText(txt, x, y);
    };
    g.font = fontCss(this.opts!.titleFont, 64 * s);
    (g as any).letterSpacing = `${6 * s}px`;
    g.fillStyle = this.textColor;
    outlined(meta.title || 'untitled', cy - 4 * s);
    (g as any).letterSpacing = '0px';
    const handle = meta.username ? (meta.username.startsWith('@') ? meta.username : '@' + meta.username) : '';
    g.font = fontCss(this.opts!.userFont, 34 * s);
    g.fillStyle = this.accent;
    outlined([handle, meta.artist].filter(Boolean).join('  ·  '), cy + 46 * s);
    const lw = 420 * s;
    const lx = align === 'left' ? x : align === 'right' ? x - lw : x - lw / 2;
    g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(lx, cy + 68 * s, lw, 3 * s);
    const grd = g.createLinearGradient(lx, 0, lx + lw, 0);
    grd.addColorStop(0, this.accent); grd.addColorStop(1, this.accent2);
    g.fillStyle = grd; g.fillRect(lx, cy + 67 * s, lw * f.prog, 5 * s);
  }

  /** Instagram-style free text ("telop") with style, animation and a visible time range */
  private drawTelop(it: TextItem, t: number, f: Frame, W: number, H: number, k: number): boolean {
    const end = it.end > it.start ? it.end : Infinity;
    if (t < it.start || t > end || !it.text) return false;
    const { g } = this;
    const age = t - it.start, left = end - t;
    let alpha = 1, scale = 1, text = it.text;
    switch (it.anim) {
      case 'fade': alpha = Math.min(1, age / 0.4, left / 0.4); break;
      case 'pop': {
        const p = Math.min(1, age / 0.35);
        scale = p < 1 ? 1 + 0.25 * Math.sin(p * Math.PI) * (1 - p) * 2 - (1 - p) * 0.6 : 1;
        scale *= 1 + f.kick * 0.05;
        alpha = Math.min(1, age / 0.12, left / 0.2);
        break;
      }
      case 'type': text = it.text.slice(0, Math.floor(age * 14)); alpha = Math.min(1, left / 0.3); break;
      case 'beat': scale = 1 + 0.08 * Math.exp(-f.beatPhase * 6); break;
    }
    if (!text || alpha <= 0 || scale <= 0) return false;
    const px = it.size * k;
    g.save();
    g.globalAlpha = alpha;
    g.translate(it.x * W, it.y * H);
    g.rotate((it.rotate * Math.PI) / 180);
    g.scale(scale, scale);
    g.font = fontCss(it.font, px);
    g.textAlign = it.align; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const lines = text.split('\n');
    const lh = px * 1.3;
    const y0 = -((lines.length - 1) * lh) / 2;
    lines.forEach((line, i) => {
      const y = y0 + i * lh;
      const w = g.measureText(line).width;
      const xl = it.align === 'left' ? 0 : it.align === 'right' ? -w : -w / 2;
      if (it.style === 'box' && line) {
        const pad = px * 0.32;
        g.fillStyle = it.boxColor;
        g.beginPath(); g.roundRect(xl - pad, y - lh / 2 + px * 0.05, w + pad * 2, lh - px * 0.1, px * 0.22); g.fill();
      }
      if (it.style === 'shadow') {
        g.fillStyle = 'rgba(0,0,0,.55)'; g.fillText(line, px * 0.06, y + px * 0.08);
      }
      if (it.style === 'outline') {
        g.strokeStyle = it.boxColor; g.lineWidth = px * 0.18; g.strokeText(line, 0, y);
      }
      if (it.style === 'neon') {
        g.strokeStyle = it.boxColor;
        const a0 = g.globalAlpha;
        g.globalAlpha = a0 * 0.18; g.lineWidth = px * 0.45; g.strokeText(line, 0, y);
        g.globalAlpha = a0 * 0.35; g.lineWidth = px * 0.2; g.strokeText(line, 0, y);
        g.globalAlpha = a0; g.lineWidth = px * 0.06; g.strokeText(line, 0, y);
      }
      g.fillStyle = it.color;
      g.fillText(line, 0, y);
    });
    g.restore();
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    return true;
  }

  /** wrap a line to maxW (word-aware for spaces, per-character for CJK) */
  private wrap(text: string, maxW: number): string[] {
    const { g } = this;
    const rows: string[] = [];
    let cur = '';
    const tokens = text.match(/[　-鿿＀-￯]|[^\s　-鿿＀-￯]+\s*|\s+/g) ?? [text];
    for (const tk of tokens) {
      if (g.measureText(cur + tk).width > maxW && cur) { rows.push(cur.trimEnd()); cur = tk.trimStart(); }
      else cur += tk;
    }
    if (cur) rows.push(cur.trimEnd());
    return rows;
  }

  /** Apple Music / Spotify style scrolling lyrics, karaoke, or minimal */
  private drawLyrics(t: number, f: Frame, cx: number, cy: number, s: number): boolean {
    const o = this.opts!;
    const lines = lyricsLines(o.lyrics, this.env.analysis);
    if (!lines.length) return false;
    const { g } = this;
    const LEAD = 0.06; // light the line a hair early so it never feels late
    const i = currentLine(lines, t + LEAD);
    const active = i >= 0 && t + LEAD < lines[i].end;
    const style = o.lyrics.style;
    if (this.chaosLyrics !== null) return this.drawChaosLyrics(lines, i, t, f, this.chaosLyrics);
    if (isKinetic(style)) return this.drawKineticLines(style, lines, i, t, f, cx, cy, s);
    const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    g.save();
    g.textBaseline = 'top';
    if (style === 'karaoke' || style === 'minimal') {
      const px = (style === 'karaoke' ? 64 : 58) * s;
      g.font = fontCss(o.lyricsFont, px); g.textAlign = 'center'; g.lineJoin = 'round';
      const cur = lines[i];
      if (cur && t < cur.end + 0.3) {
        const age = t + LEAD - cur.t, left = cur.end - t;
        const a = Math.min(1, age / 0.12, Math.max(0, left + 0.3) / 0.3);
        const rows = this.wrap(cur.text, 1100 * s);
        rows.forEach((row, r) => {
          const y = cy - (rows.length * px * 1.25) / 2 + r * px * 1.25 + (1 - ease(age / 0.3)) * 14 * s;
          g.globalAlpha = a;
          g.strokeStyle = 'rgba(0,0,12,.55)'; g.lineWidth = px * 0.14; g.strokeText(row, cx, y);
          g.fillStyle = style === 'karaoke' ? 'rgba(255,255,255,.55)' : this.textColor; g.fillText(row, cx, y);
          if (style === 'karaoke') {
            const w = g.measureText(row).width;
            const prog = Math.min(1, Math.max(0, (t - cur.t) / Math.max(0.5, (cur.end - cur.t) * 0.85)));
            const rp = Math.min(1, Math.max(0, prog * rows.length - r));
            g.save(); g.beginPath(); g.rect(cx - w / 2, y - px * 0.2, w * rp, px * 1.4); g.clip();
            g.fillStyle = this.accent; g.fillText(row, cx, y);
            g.restore();
          }
        });
      }
      const nx = lines[i + 1];
      if (nx) {
        g.font = fontCss(o.lyricsFont, px * 0.55); g.globalAlpha = 0.6;
        g.fillStyle = this.textColor; g.fillText(nx.text, cx, cy + px * 1.1);
      }
      g.restore();
      return true;
    }
    // ---- scrolling list (apple / spotify)
    const px = (style === 'apple' ? 62 : 54) * s, lh = px * 1.22, gap = px * 0.55, w = 900 * s;
    const left = cx - w / 2;
    g.font = fontCss(o.lyricsFont, px); g.textAlign = 'left';
    const lo = Math.max(0, i - 2), hi = Math.min(lines.length - 1, Math.max(i, 0) + 4);
    const blocks = new Map<number, string[]>();
    for (let k = lo; k <= hi; k++) blocks.set(k, this.wrap(lines[k].text, w));
    const hOf = (k: number) => (blocks.get(k)?.length ?? 1) * lh + gap;
    const e = i >= 0 ? ease((t + LEAD - lines[i].t) / 0.28) : 1;
    // y of the current line's top, animating upward when a new line becomes current
    let yCur = cy - lh / 2 + (i > 0 ? (1 - e) * hOf(i - 1) : 0);
    if (style === 'spotify') {
      const pad = 34 * s;
      g.globalAlpha = 0.92; g.fillStyle = this.accent2;
      g.beginPath(); g.roundRect(left - pad, cy - 3.1 * lh - pad * 0.4, w + pad * 2, 6.6 * lh + pad * 0.8, 28 * s); g.fill();
      g.save(); g.beginPath(); g.rect(left - pad, cy - 3.1 * lh - pad * 0.4, w + pad * 2, 6.6 * lh + pad * 0.8); g.clip();
    } else {
      g.save();
    }
    const yOf = new Map<number, number>();
    const base = Math.max(i, 0);
    yOf.set(base, i < 0 ? yCur + hOf(0) : yCur);
    for (let k = base - 1; k >= lo; k--) yOf.set(k, yOf.get(k + 1)! - hOf(k));
    for (let k = base + 1; k <= hi; k++) yOf.set(k, yOf.get(k - 1)! + hOf(k - 1));
    for (let k = lo; k <= hi; k++) {
      const rows = blocks.get(k)!;
      const y = yOf.get(k)!;
      const d = k - i;
      const isCur = d === 0;
      if (style === 'apple' && (d < -1 || d > 2)) continue;
      let alpha: number, col: string;
      if (style === 'spotify') {
        col = d < 0 || (isCur && active) ? '#ffffff' : 'rgba(10,10,20,.72)';
        alpha = d < 0 ? 0.7 : 1;
      } else {
        col = this.textColor;
        alpha = isCur ? (active ? 0.35 + 0.65 * e : 0.45) : d < 0 ? 0.28 : Math.max(0.12, 0.42 - (d - 1) * 0.1);
      }
      const sc = style === 'apple' ? (isCur ? 0.94 + 0.06 * e : 0.94) : 1;
      g.save();
      g.translate(left, y);
      g.scale(sc, sc);
      rows.forEach((row, r) => {
        if (style === 'apple') { g.globalAlpha = alpha * 0.35; g.fillStyle = 'rgba(0,0,10,1)'; g.fillText(row, 2 * s, r * lh + 3 * s); }
        g.globalAlpha = alpha; g.fillStyle = col; g.fillText(row, 0, r * lh);
      });
      g.restore();
    }
    g.restore();
    g.restore();
    void f;
    return true;
  }

  private kctx(line: LyricLine, k: number, t: number, f: Frame, cx: number, cy: number, s: number, outDur = 0.35) {
    const o = this.opts!;
    const LEAD = 0.06;
    return {
      g: this.g, W: this.canvas.width, H: this.canvas.height, cx, cy, s, text: line.text,
      age: t + LEAD - line.t, dur: Math.max(0.3, line.end - line.t), out: Math.max(0, (t - line.end) / outDur),
      f, font: o.lyricsFont, col: this.textColor, acc: this.accent, acc2: this.accent2, seed: (k + 1) * 7919,
    };
  }

  /** one kinetic template: the current line, plus the previous one finishing its exit */
  private drawKineticLines(style: KineticId, lines: LyricLine[], i: number, t: number, f: Frame, cx: number, cy: number, s: number) {
    for (const k of [i - 1, i]) {
      const line = lines[k];
      if (!line) continue;
      const c = this.kctx(line, k, t, f, cx, cy, s);
      if (c.age < 0 || c.out >= 1) continue;
      drawKinetic(style, c);
    }
    return true;
  }

  /**
   * Chaos mode: every line gets its own template, position and size (stable per line), and the last
   * few lines linger and fade instead of leaving at once, so different templates cross each other.
   * In drops the current line is doubled in a second template.
   */
  private drawChaosLyrics(lines: LyricLine[], i: number, t: number, f: Frame, seed: number) {
    const W = this.canvas.width, H = this.canvas.height, k0 = Math.min(W, H) / 1080;
    const h = (a: number, b: number) => { let x = (a * 374761393 + b * 668265263 + seed * 2246822519) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
    const SPOTS: [number, number][] = [[0.5, 0.5], [0.5, 0.2], [0.5, 0.8], [0.27, 0.45], [0.73, 0.55], [0.3, 0.75], [0.7, 0.25]];
    const LINGER = 2.4;
    for (let k = Math.max(0, i - 2); k <= i; k++) {
      const line = lines[k];
      if (!line) continue;
      const style = KINETIC_IDS[Math.floor(h(k, 1) * KINETIC_IDS.length)];
      const [sx, sy] = SPOTS[Math.floor(h(k, 2) * SPOTS.length)];
      const sz = k0 * (0.75 + h(k, 3) * 0.6);
      const c = this.kctx(line, k, t, f, sx * W, sy * H, sz, LINGER);
      if (c.age < 0 || c.out >= 1) continue;
      drawKinetic(style, { ...c, alpha: k === i ? 1 : 0.55 });
      if (k === i && f.drop > 0.5 && h(k, 4) < 0.6) {
        const style2 = KINETIC_IDS[(KINETIC_IDS.indexOf(style) + 1 + Math.floor(h(k, 5) * (KINETIC_IDS.length - 1))) % KINETIC_IDS.length];
        drawKinetic(style2, { ...c, cx: (1 - sx) * W, cy: (1 - sy) * H, s: sz * 0.8, alpha: 0.7, seed: c.seed + 17 });
      }
    }
    return true;
  }

  private drawReadout(f: Frame, cx: number, cy: number, s: number) {
    const { g } = this;
    const x = cx - 210 * s, y = cy - 22 * s;
    const mm = Math.floor(f.t / 60), ss = (f.t % 60).toFixed(2).padStart(5, '0');
    g.font = `600 ${22 * s}px ${MONO}`; g.textBaseline = 'top'; g.textAlign = 'left';
    g.fillStyle = this.textColor; g.globalAlpha = 0.9;
    g.fillText(`${f.bpm.toFixed(1)} BPM   ${String(mm).padStart(2, '0')}:${ss}   ${SECTION_NAMES[f.section] ?? ''}`, x, y);
    g.globalAlpha = 1;
    const bi = ((Math.floor(f.beat) % 4) + 4) % 4;
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i === bi ? (i === 0 ? this.accent2 : this.accent) : 'rgba(255,255,255,.2)';
      g.fillRect(x + i * 26 * s, y + 34 * s, 18 * s, 6 * s);
    }
    g.textBaseline = 'alphabetic';
  }

  /** spectrum value with a little temporal smoothing (less jitter, more "liquid") */
  private sv(t: number, x: number) {
    const A = this.env.analysis;
    return (specAt(A, t, x) * 0.5 + specAt(A, t - 0.02, x) * 0.3 + specAt(A, t - 0.04, x) * 0.2);
  }

  private drawSpectrum(style: SpectrumStyle, t: number, cx: number, cy: number, s: number) {
    switch (style) {
      case 'wave': return this.specWave(t, cx, cy, s);
      case 'capsule': return this.specCapsule(t, cx, cy, s);
      case 'dots': return this.specDots(t, cx, cy, s);
      case 'radial': return this.specRadial(t, cx, cy, s);
      case 'terrain': return this.specTerrain(t, cx, cy, s);
    }
  }

  /** smooth path through points using midpoint quadratic curves */
  private smoothPath(pts: [number, number][], move = true) {
    const { g } = this;
    if (move) g.moveTo(pts[0][0], pts[0][1]); else g.lineTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const l = pts[pts.length - 1];
    g.lineTo(l[0], l[1]);
  }

  /** 1. WAVE — mirrored liquid curve with a delayed ghost layer */
  private specWave(t: number, cx: number, cy: number, s: number) {
    const { g } = this;
    const w = 900 * s, h = 170 * s, x0 = cx - w / 2;
    const N = 72;
    const layer = (tt: number, color: string, alpha: number, lineW: number) => {
      const top: [number, number][] = [], bot: [number, number][] = [];
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        const xi = Math.abs(u * 2 - 1);                       // centre = lows
        const env = Math.pow(Math.sin(Math.PI * u), 0.6);     // taper at the edges
        const v = Math.pow(this.sv(tt, xi), 2.0) * env * 0.95;
        top.push([x0 + u * w, cy - v * h * 0.5]);
        bot.push([x0 + u * w, cy + v * h * 0.32]);
      }
      const grd = g.createLinearGradient(x0, 0, x0 + w, 0);
      grd.addColorStop(0, this.accent2); grd.addColorStop(0.5, this.accent); grd.addColorStop(1, this.accent2);
      g.beginPath(); this.smoothPath(top); this.smoothPath(bot.slice().reverse(), false); g.closePath();
      g.globalAlpha = alpha * 0.28; g.fillStyle = grd; g.fill();
      g.globalAlpha = 1;
      g.beginPath(); this.smoothPath(top);
      g.globalAlpha = alpha * 0.25; g.strokeStyle = color; g.lineWidth = lineW * 5; g.stroke();
      g.globalAlpha = alpha; g.lineWidth = lineW; g.stroke();
      g.beginPath(); this.smoothPath(bot);
      g.globalAlpha = alpha * 0.45; g.lineWidth = lineW * 0.7; g.stroke();
      g.globalAlpha = 1;
    };
    layer(t - 0.14, this.accent2, 0.45, 1.5 * s);
    layer(t, this.textColor, 1, 2.2 * s);
    // centre hairline
    const lg = g.createLinearGradient(x0, 0, x0 + w, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,.5)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg; g.fillRect(x0, cy - 0.5 * s, w, 1 * s);
  }

  /** 2. CAPSULE — thin rounded bars mirrored around a centre line */
  private specCapsule(t: number, cx: number, cy: number, s: number) {
    const { g } = this;
    const w = 900 * s, h = 160 * s, x0 = cx - w / 2;
    const n = 44, step = w / n, bw = Math.max(2 * s, step * 0.38);
    const grd = g.createLinearGradient(x0, 0, x0 + w, 0);
    grd.addColorStop(0, this.accent); grd.addColorStop(0.5, this.accent2); grd.addColorStop(1, this.accent);
    g.lineCap = 'round';
    g.strokeStyle = grd;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const v = Math.pow(this.sv(t, Math.abs(u * 2 - 1)), 1.5);
      const hh = (3 * s + v * h * 0.5);
      const x = x0 + u * w;
      g.beginPath(); g.moveTo(x, cy - hh); g.lineTo(x, cy + hh);
      g.globalAlpha = 0.18 + 0.15 * v; g.lineWidth = bw * 2.6; g.stroke();
      g.globalAlpha = 0.55 + 0.45 * v; g.lineWidth = bw; g.stroke();
    }
    g.globalAlpha = 1; g.lineCap = 'butt';
  }

  /** 3. DOTS — LED matrix with peak dots */
  private specDots(t: number, cx: number, cy: number, s: number) {
    const { g } = this;
    const cols = 36, rows = 9;
    const cell = 25 * s, r = cell * 0.3;
    const w = cols * cell, h = rows * cell;
    const x0 = cx - w / 2, yb = cy + h / 2;
    for (let i = 0; i < cols; i++) {
      const u = (i + 0.5) / cols;
      const xi = Math.abs(u * 2 - 1);
      const v = Math.pow(this.sv(t, xi), 1.3);
      const lit = v * rows;
      let peak = 0;
      for (let j = 0; j < 12; j += 2) peak = Math.max(peak, Math.pow(specAt(this.env.analysis, t - j * 0.04, xi), 1.3) - j * j * 0.003);
      const pr = Math.min(rows - 1, Math.floor(peak * rows));
      for (let k = 0; k < rows; k++) {
        const x = x0 + (i + 0.5) * cell, y = yb - (k + 0.5) * cell;
        const on = k < lit;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
        if (on) {
          g.fillStyle = k / rows > 0.6 ? this.accent2 : this.accent;
          g.globalAlpha = 0.95; g.fill();
          g.globalAlpha = 0.2; g.beginPath(); g.arc(x, y, r * 2, 0, Math.PI * 2); g.fill();
        } else if (k === pr && pr > 0) {
          g.fillStyle = this.textColor; g.globalAlpha = 0.9; g.fill();
        } else {
          g.fillStyle = this.textColor; g.globalAlpha = 0.07; g.fill();
        }
      }
    }
    g.globalAlpha = 1;
  }

  /** 4. RADIAL — circular burst with rotating arcs (place it anywhere, e.g. around the icon) */
  private specRadial(t: number, cx: number, cy: number, s: number) {
    const { g } = this;
    const R = 120 * s, n = 120;
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const a = u * Math.PI * 2 - Math.PI / 2;
      const v = Math.pow(this.sv(t, Math.abs(u * 2 - 1)), 1.4);
      const len = (4 + v * 95) * s;
      const ca = Math.cos(a), sa = Math.sin(a);
      g.beginPath(); g.moveTo(cx + ca * R, cy + sa * R); g.lineTo(cx + ca * (R + len), cy + sa * (R + len));
      g.strokeStyle = i % 3 === 0 ? this.accent2 : this.accent;
      g.globalAlpha = 0.25; g.lineWidth = 6 * s; g.stroke();
      g.globalAlpha = 0.95; g.lineWidth = 2.2 * s; g.stroke();
    }
    g.globalAlpha = 1; g.lineCap = 'butt';
    g.strokeStyle = this.textColor; g.lineWidth = 1.5 * s;
    g.beginPath(); g.arc(cx, cy, R - 8 * s, 0, Math.PI * 2); g.stroke();
    // rotating segmented arcs
    for (let k = 0; k < 3; k++) {
      const rr = R - (22 + k * 14) * s;
      const rot = t * (0.4 + k * 0.25) * (k % 2 ? -1 : 1);
      g.strokeStyle = k === 1 ? this.accent2 : this.accent; g.lineWidth = (3 - k * 0.6) * s; g.globalAlpha = 0.8 - k * 0.2;
      for (let j = 0; j < 4; j++) {
        g.beginPath(); g.arc(cx, cy, rr, rot + j * Math.PI / 2, rot + j * Math.PI / 2 + Math.PI / 4); g.stroke();
      }
    }
    g.globalAlpha = 1;
  }

  /** 5. TERRAIN — 3D neon landscape of recent spectra over a perspective grid */
  private specTerrain(t: number, cx: number, cy: number, s: number) {
    const { g } = this;
    const w = 1000 * s, h = 260 * s, yb = cy + h / 2;
    const rows = 22, pts = 56, dt = 0.07;
    const proj = (u: number, depth: number) => {
      const p = 1 / (1 + depth * 2.2);
      return [cx + (u - 0.5) * w * p, yb - h * 0.95 * (1 - p), p] as const;
    };
    // floor grid
    g.strokeStyle = this.accent; g.lineWidth = 1 * s;
    for (let k = 0; k <= 10; k++) {
      const [x1, y1] = proj(k / 10, 0), [x2, y2] = proj(k / 10, 1);
      g.globalAlpha = 0.12; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }
    for (let r = rows - 1; r >= 0; r--) {
      const depth = r / rows;
      const line: [number, number][] = [];
      let p0 = 1;
      for (let i = 0; i < pts; i++) {
        const u = i / (pts - 1);
        const v = Math.pow(this.sv(t - r * dt, 1 - Math.abs(u * 2 - 1)), 1.7) * Math.pow(Math.sin(Math.PI * u), 0.8);
        const [x, y, p] = proj(u, depth);
        p0 = p;
        line.push([x, y - v * h * 0.75 * p]);
      }
      // occlude lines behind with a faint fill
      g.beginPath(); this.smoothPath(line);
      const [xr, yr] = proj(1, depth), [xl, yl] = proj(0, depth);
      g.lineTo(xr, yr + 2 * s); g.lineTo(xl, yl + 2 * s); g.closePath();
      g.globalAlpha = 0.5; g.fillStyle = 'rgba(3,3,12,1)'; g.fill();
      g.beginPath(); this.smoothPath(line);
      const a = 1 - depth;
      g.strokeStyle = r === 0 ? this.textColor : depth < 0.5 ? this.accent : this.accent2;
      g.globalAlpha = 0.15 + 0.85 * a * a;
      g.lineWidth = (r === 0 ? 2.6 : 1.4) * s * (0.6 + p0 * 0.4);
      g.stroke();
      if (r === 0) { g.globalAlpha = 0.25; g.lineWidth = 10 * s; g.strokeStyle = this.accent; g.stroke(); }
    }
    g.globalAlpha = 1;
  }

  private drawScope(t: number, cx: number, cy: number, s: number, W: number) {
    const a = this.env.audio;
    if (!a) return;
    const { g } = this;
    const w = Math.min(W * 0.96, 1500 * s), h = 120 * s, x = cx - w / 2;
    const win = Math.floor(a.sampleRate * 0.05);
    const s0 = Math.max(0, Math.floor(t * a.sampleRate) - win);
    let start = s0;
    for (let i = s0; i < s0 + win / 2; i++) {
      if (a.L[i] + a.R[i] <= 0 && a.L[i + 1] + a.R[i + 1] > 0) { start = i; break; }
    }
    const N = 360, step = win / N;
    g.beginPath();
    for (let i = 0; i < N; i++) {
      const si = start + Math.floor(i * step);
      const v = ((a.L[si] ?? 0) + (a.R[si] ?? 0)) * 0.5;
      const px = x + (i / (N - 1)) * w, py = cy - v * h * 0.9;
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.lineJoin = 'round';
    this.glowStroke(this.accent, 2 * s, 4);
  }

  private drawPhase(t: number, cx: number, cy: number, s: number) {
    const a = this.env.audio;
    if (!a) return;
    const { g } = this;
    const R = 110 * s;
    g.fillStyle = 'rgba(2,2,10,.6)';
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1.2 * s;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2);
    g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.stroke();
    const sr = a.sampleRate;
    const end = Math.floor(t * sr);
    const n = Math.floor(sr * 0.04);
    let sLR = 0, sLL = 0, sRR = 0;
    g.fillStyle = this.accent; g.globalAlpha = 0.5;
    const d = 1.8 * s;
    for (let i = 0; i < n; i += 3) {
      const L = a.L[end - n + i] ?? 0, Rr = a.R[end - n + i] ?? 0;
      sLR += L * Rr; sLL += L * L; sRR += Rr * Rr;
      const px = cx + Math.max(-1, Math.min(1, (Rr - L) * 0.7071)) * R * 0.95;
      const py = cy - Math.max(-1, Math.min(1, (L + Rr) * 0.7071)) * R * 0.95;
      g.fillRect(px, py, d, d);
    }
    g.globalAlpha = 1;
    const corr = sLL > 0 && sRR > 0 ? sLR / Math.sqrt(sLL * sRR) : 0;
    const by = cy + R + 18 * s;
    g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(cx - R, by, R * 2, 4 * s);
    g.fillStyle = corr < 0 ? '#ff5a5a' : this.accent;
    g.fillRect(cx + corr * R - 3 * s, by - 5 * s, 6 * s, 14 * s);
    g.font = `600 ${14 * s}px ${MONO}`; g.fillStyle = 'rgba(255,255,255,.7)'; g.textAlign = 'center';
    g.fillText(`PHASE ${corr >= 0 ? '+' : ''}${corr.toFixed(2)}`, cx, by + 30 * s);
    g.textAlign = 'left';
  }
}
