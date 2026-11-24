import { beatToTime, timeToBeat, type Analysis } from '../analysis/analyze';
import type { StereoPCM, TextItem } from '../core/template';
import type { Scene } from '../app/scenes';

interface Data {
  A: Analysis; pcm: StereoPCM; texts: TextItem[]; accent: string; range?: [number, number] | null;
  /** chaos re-roll taps (drawn as marks on the waveform) */
  marks?: number[] | null;
  scenes?: Scene[] | null; selScene?: number; themeName?: (id: string) => string;
}
export interface TimelineEvents { onScene?: (id: number) => void; onBoundary?: (index: number, t: number, done: boolean) => void }
/** stable pastel colour per theme id */
const themeColor = (id: string) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h},45%,34%)`; };

const SEC_BG = ['#141925', '#1f1c12', '#241320', '#1a1728'];
const SEC_FG = ['#6f87a8', '#e0b23c', '#ff5c93', '#9b8cff'];
const SEC_NAME = ['INTRO', 'BUILD', 'DROP', 'OUTRO'];

/** Song overview: waveform tinted by section, bar grid, telop lane and a draggable playhead. */
export class Timeline {
  private cache = document.createElement('canvas');
  private valid = false;
  private w = 0; private hgt = 0; private dpr = 1;

  constructor(private cv: HTMLCanvasElement, private data: () => Data, onSeek: (t: number) => void, ev: TimelineEvents = {}) {
    const toT = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * this.data().A.duration;
    };
    const inSceneLane = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect(), y = e.clientY - r.top;
      return !!this.data().scenes?.length && y >= this.hgt - 44 && y <= this.hgt - 23;
    };
    cv.onpointerdown = (e) => {
      cv.setPointerCapture(e.pointerId);
      const sc = this.data().scenes;
      if (sc?.length && inSceneLane(e)) {
        const r = cv.getBoundingClientRect(), x = e.clientX - r.left, dur = this.data().A.duration;
        // grab a boundary (scene start) within 7px
        const bi = sc.findIndex((s, i) => i > 0 && Math.abs((s.start / dur) * r.width - x) < 7);
        if (bi > 0 && ev.onBoundary) {
          cv.onpointermove = (m) => ev.onBoundary!(bi, toT(m), false);
          cv.onpointerup = (m) => { ev.onBoundary!(bi, toT(m), true); cv.onpointermove = null; };
          return;
        }
        const t = toT(e);
        const hit = sc.find((s) => t >= s.start && t < s.end);
        if (hit && ev.onScene) ev.onScene(hit.id);
        cv.onpointermove = null;
        cv.onpointerup = () => {};
        return;
      }
      onSeek(toT(e));
      cv.onpointermove = (m) => onSeek(toT(m));
      cv.onpointerup = () => { cv.onpointermove = null; };
    };
    cv.addEventListener('pointermove', (e) => {
      if (e.buttons) return;
      const sc = this.data().scenes;
      if (!sc?.length || !inSceneLane(e)) { cv.style.cursor = 'pointer'; return; }
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, dur = this.data().A.duration;
      cv.style.cursor = sc.some((s, i) => i > 0 && Math.abs((s.start / dur) * r.width - x) < 7) ? 'ew-resize' : 'pointer';
    });
  }

  invalidate() { this.valid = false; }

  private build() {
    const r = this.cv.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(10, Math.round(r.width)); this.hgt = Math.max(10, Math.round(r.height));
    this.cv.width = this.cache.width = this.w * this.dpr;
    this.cv.height = this.cache.height = this.hgt * this.dpr;
    const g = this.cache.getContext('2d')!;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const { A, pcm } = this.data();
    const W = this.w, WH = this.hgt - 46, dur = A.duration;
    g.clearRect(0, 0, W, this.hgt);
    // section backgrounds + labels
    g.save();
    g.beginPath(); g.roundRect(0, 0, W, WH, 10); g.clip();
    for (const s of A.sections) {
      const x0 = (s.start / dur) * W, x1 = (s.end / dur) * W;
      g.fillStyle = SEC_BG[s.type]; g.fillRect(x0, 0, x1 - x0, WH);
      if (x1 - x0 > 34) { g.fillStyle = SEC_FG[s.type]; g.font = '700 9px "Noto Sans JP", sans-serif'; g.fillText(SEC_NAME[s.type], x0 + 5, 11); }
    }
    // bar grid (every 4 bars)
    for (let b = Math.ceil(timeToBeat(A, 0) / 4); ; b++) {
      const tt = beatToTime(A, b * 4);
      if (tt >= dur) break;
      if (tt < 0 || b % 4) continue;
      g.fillStyle = b % 16 === 0 ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.05)';
      g.fillRect((tt / dur) * W, 0, 1, WH);
    }
    // waveform
    const n = pcm.L.length, spp = n / W, stride = Math.max(1, Math.floor(spp / 48));
    const mid = WH / 2 + 4;
    for (let x = 0; x < W; x++) {
      let mx = 0;
      const a = Math.floor(x * spp), b = Math.min(n, Math.floor((x + 1) * spp));
      for (let i = a; i < b; i += stride) { const v = Math.abs(pcm.L[i]) + Math.abs(pcm.R[i]); if (v > mx) mx = v; }
      const hh = Math.max(1, Math.min(1, mx * 0.5) * (WH / 2 - 6));
      const sec = A.sections.find((s) => (x / W) * dur >= s.start && (x / W) * dur < s.end);
      g.fillStyle = sec ? SEC_FG[sec.type] : '#6f87a8';
      g.globalAlpha = 0.75;
      g.fillRect(x, mid - hh, 1, hh * 2);
    }
    g.globalAlpha = 1;
    g.restore();
    // telop lane background
    g.fillStyle = '#161a23';
    g.beginPath(); g.roundRect(0, this.hgt - 20, W, 18, 9); g.fill();
    g.fillStyle = '#5c6478'; g.font = '700 9px "Noto Sans JP", sans-serif';
    g.fillText('TELOP', 6, this.hgt - 8);
    this.valid = true;
  }

  draw(t: number) {
    const r = this.cv.getBoundingClientRect();
    if (!this.valid || Math.round(r.width) !== this.w || Math.round(r.height) !== this.hgt) this.build();
    const g = this.cv.getContext('2d')!;
    const { A, texts } = this.data();
    const W = this.w, dur = A.duration;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    g.drawImage(this.cache, 0, 0);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // telop spans
    for (const it of texts) {
      const x0 = (it.start / dur) * W;
      const x1 = ((it.end > it.start ? it.end : dur) / dur) * W;
      g.fillStyle = 'rgba(255,204,77,.8)';
      g.beginPath(); g.roundRect(x0, this.hgt - 17, Math.max(6, x1 - x0), 12, 6); g.fill();
      if (x1 - x0 > 30) {
        g.save(); g.beginPath(); g.rect(x0, this.hgt - 20, x1 - x0 - 4, 18); g.clip();
        g.fillStyle = '#1b1606'; g.font = '700 9px "Noto Sans JP", sans-serif'; g.fillText(it.text.split('\n')[0], x0 + 6, this.hgt - 8);
        g.restore();
      }
    }
    // scene lane
    const D = this.data();
    if (D.scenes?.length) {
      const y0 = this.hgt - 43;
      for (const sc of D.scenes) {
        const x0 = (sc.start / dur) * W, x1 = (sc.end / dur) * W;
        g.fillStyle = themeColor(sc.tpl);
        g.globalAlpha = D.selScene === sc.id ? 1 : 0.8;
        g.beginPath(); g.roundRect(x0 + 1, y0, Math.max(2, x1 - x0 - 2), 17, 6); g.fill();
        g.globalAlpha = 1;
        if (D.selScene === sc.id) { g.strokeStyle = '#3ee6c4'; g.lineWidth = 1.5; g.stroke(); }
        if (x1 - x0 > 26) {
          g.save(); g.beginPath(); g.rect(x0 + 2, y0, x1 - x0 - 6, 17); g.clip();
          g.fillStyle = '#e7eaf0'; g.font = '600 9px "Noto Sans JP", sans-serif';
          g.fillText((sc.lock ? '🔒' : '') + (D.themeName?.(sc.tpl) ?? sc.tpl), x0 + 6, y0 + 12);
          g.restore();
        }
      }
    }
    // export range (shown while the export tab is open)
    const rg = this.data().range;
    if (rg) {
      const a = (rg[0] / dur) * W, b = (rg[1] / dur) * W;
      g.fillStyle = 'rgba(0,0,0,.55)';
      const WH = this.hgt - 46;
      g.fillRect(0, 0, a, WH); g.fillRect(b, 0, W - b, WH);
      g.strokeStyle = '#ff5c93'; g.lineWidth = 1.5;
      g.beginPath(); g.roundRect(a, 1, Math.max(2, b - a), WH - 2, 6); g.stroke();
    }
    // chaos re-roll taps
    const mk = this.data().marks;
    if (mk?.length) {
      const WH = this.hgt - 46;
      g.fillStyle = '#9b8cff';
      for (const m of mk) { const mx = (m / dur) * W; g.fillRect(mx - 0.75, 0, 1.5, WH); g.beginPath(); g.moveTo(mx - 4, 0); g.lineTo(mx + 4, 0); g.lineTo(mx, 6); g.fill(); }
    }
    // played region + playhead
    const x = (Math.max(0, t) / dur) * W;
    g.fillStyle = 'rgba(11,13,18,.35)';
    g.fillRect(x, 0, W - x, this.hgt - 46);
    g.fillStyle = '#ff5c93';
    g.fillRect(x - 1, 0, 2, this.hgt);
    g.beginPath(); g.arc(x, 4, 5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#0b0d12'; g.lineWidth = 2; g.stroke();
  }
}
